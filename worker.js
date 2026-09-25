// CardBook AI Worker — cardbook-ai.jinjjabg.workers.dev
// 환경변수(Secret): ANTHROPIC_API_KEY
// KV 바인딩(선택): OCR_CACHE — 같은 이미지는 한 번만 읽고 결과 재사용. 바인딩이 없으면 캐시 없이 동작
// 결제(Secret): TOSS_SECRET_KEY(토스페이먼츠 시크릿 키), FIREBASE_SA(Firebase 서비스 계정 JSON 전체)

// 충전 상품 — index.html의 PACKS와 반드시 같아야 함 (금액 검증에 사용)
const PACKS = { p100: { n: 100, price: 3000 }, p300: { n: 300, price: 7000 }, p1000: { n: 1000, price: 20000 } };
const FIREBASE_PROJECT = 'mandu-e7c3c';
const FIREBASE_WEB_API_KEY = 'AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0';
const FREE_SIGNUP = 50, FREE_MONTHLY = 5, DICA_OWNER_BONUS = 500, AUTOCARD_OWNER_BONUS = 50;
const DICA_DOMAINS = ['jinjjabg-hub.github.io'];
// 자동 명함은 DiCA와 같은 도메인이라 경로로 구분한다: 자동 명함 경로 → 50장, 그 외 DiCA 링크 → 500장
// (지금은 카드북 레포 안 /cardbook/autocard/, 나중에 autocard 레포로 옮겨도 되게 /autocard/도 인정)
const AUTOCARD_PATHS = ['/cardbook/autocard/', '/autocard/'];
// 자동 명함 AI — 문구 초안·번역은 가벼운 작업이라 Haiku 먼저(비용↓), 모델명 오류 시 기존 목록으로 폴백
const AUTOCARD_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
const AUTOCARD_LANGS = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文', vi: 'Tiếng Việt', mn: 'Монгол (кирилл)' };
function monthKey() { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0'); }
async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('로그인이 필요해요');
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const data = await res.json();
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new Error('로그인이 만료됐어요, 새로고침 후 다시 시도해주세요');
  return uid;
}
// 라우트: /ocr-image (신규, 이미지→구조화+전문)  /ocr-parse (기존)  /ai-search (기존)
//        /autocard/draft, /autocard/translate (자동 명함 문구 초안·번역), /autocard/import (이미지 명함 → 자동 입력)

// 첫 번째가 안 되면(모델명 없음 404) 다음 모델로 자동 재시도
const MODELS = ['claude-sonnet-4-6', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
// 비용 실험: OCR만 Haiku로 돌려보려면 아래를 ['claude-haiku-4-5-20251001', ...MODELS] 로 바꾸고 Deploy
const OCR_MODELS = MODELS;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function callClaude(env, content, maxTokens, models = MODELS) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Worker에 ANTHROPIC_API_KEY Secret이 없습니다');
  let lastErr = '';
  for (const model of models) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('응답에 JSON 없음: ' + text.slice(0, 80));
      return JSON.parse(m[0]);
    }
    lastErr = `[${model}] ${data.error?.type || res.status}: ${data.error?.message || ''}`;
    if (data.error?.type !== 'not_found_error') break; // 모델명 문제일 때만 다음 모델 시도
  }
  throw new Error(lastErr);
}

const OCR_SCHEMA = `{
  "name": "한글 이름",
  "nameEn": "영문 이름",
  "title": "직함",
  "company": "회사명(한글 우선)",
  "industry": "업종을 한 줄로 (예: 실내공기질관리 솔루션)",
  "phone": "휴대폰 번호 010-0000-0000 형식, 없으면 일반전화",
  "email": "이메일",
  "address": "주소",
  "website": "홈페이지/URL",
  "services": "취급 서비스·제품·대상고객을 줄바꿈으로 나열",
  "bni": "BNI 챕터명이 보이면 (예: 파이오니어), 없으면 빈 문자열",
  "fullText": "명함에 보이는 모든 글자를 빠짐없이, 읽히는 순서대로"
}`;

// ── Firebase 서비스 계정으로 Firestore 쓰기 (결제 확인 후 장수 충전은 서버만 할 수 있어야 함) ──
let _tokenCache = { token: '', exp: 0 };
function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function firebaseAccessToken(env) {
  if (_tokenCache.exp > Date.now() + 60000) return _tokenCache.token;
  const sa = JSON.parse(env.FIREBASE_SA);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const keyBuf = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBuf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + b64url(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const data = await res.json();
  if (!data.access_token) throw new Error('Firebase 토큰 발급 실패: ' + JSON.stringify(data));
  _tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}
// 결제 1건을 payments/{orderId}에 기록(중복이면 실패) + users/{uid}.credits 증가 — 하나의 트랜잭션
async function getUserDoc(token, uid) {
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}/users/${uid}`, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 404) return {};
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = v.integerValue !== undefined ? Number(v.integerValue) : (v.booleanValue ?? v.stringValue);
  return out;
}
function fsPatch(uid, fields) {
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const enc = {}; for (const [k, v] of Object.entries(fields)) enc[k] = typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  return { update: { name: `${base}/users/${uid}`, fields: enc }, updateMask: { fieldPaths: Object.keys(fields) } };
}
async function commitWrites(token, writes) {
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (!res.ok) throw new Error('Firestore 쓰기 실패: ' + (await res.text()).slice(0, 200));
}
async function ensureCredits(token, uid) {
  const u = await getUserDoc(token, uid);
  const isNew = typeof u.credits !== 'number';
  let credits = isNew ? FREE_SIGNUP : u.credits;
  const patch = {};
  if (isNew) patch.credits = credits;
  if (u.freeMonth !== monthKey()) {
    const usedFree = Math.max(0, u.freeRemain || 0);
    credits = credits - usedFree + FREE_MONTHLY;
    patch.credits = credits; patch.freeMonth = monthKey(); patch.freeRemain = FREE_MONTHLY;
  }
  if (Object.keys(patch).length) await commitWrites(token, [fsPatch(uid, patch)]);
  return credits;
}

async function creditUser(env, uid, orderId, n, meta) {
  const token = await firebaseAccessToken(env);
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const body = {
    writes: [
      { update: { name: `${base}/payments/${orderId}`, fields: { uid: { stringValue: uid }, credits: { integerValue: String(n) }, amount: { integerValue: String(meta.amount) }, paymentKey: { stringValue: meta.paymentKey }, method: { stringValue: meta.method || '' }, paidAt: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } },
      { transform: { document: `${base}/users/${uid}`, fieldTransforms: [ { fieldPath: 'credits', increment: { integerValue: String(n) } }, { fieldPath: 'paidTotal', increment: { integerValue: String(n) } } ] } },
    ],
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Firestore 기록 실패: ' + (await res.text()).slice(0, 200));
}

// ── 자동 명함 본인 등록 보너스 50장 (1회) ──
// DiCA는 "링크 선점제"지만, 자동 명함은 Firestore에 주인(ownerUid)이 기록돼 있어서 진짜 주인인지 바로 확인할 수 있다.
async function autocardBonus(env, uid, cardId) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(cardId || '')) return json({ granted: false, reason: '명함 주소가 올바르지 않아요' });
  const token = await firebaseAccessToken(env);
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}/autocards/${cardId}`, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return json({ granted: false, reason: '명함을 찾을 수 없어요' });
  const f = (await res.json()).fields || {};
  if (f.status?.stringValue !== 'published') return json({ granted: false, reason: '승인(발행)된 명함만 보너스가 지급돼요' });
  if (f.ownerUid?.stringValue !== uid) return json({ granted: false, reason: '본인이 만든 자동 명함만 보너스가 지급돼요' });
  const u = await getUserDoc(token, uid);
  if (u.autocard50Granted) return json({ granted: false, reason: '이미 지급됨' });
  const credits = (typeof u.credits === 'number' ? u.credits : FREE_SIGNUP) + AUTOCARD_OWNER_BONUS;
  await commitWrites(token, [fsPatch(uid, { credits, autocard50Granted: true })]);
  return json({ granted: true, credits, bonus: AUTOCARD_OWNER_BONUS });
}

// ── 자동 명함 AI: 질문 3개 답변 → 한 줄 소개 + 리퍼럴 문구 초안 ──
const clip = (v, n) => String(v || '').slice(0, n);
async function autocardDraft(env, body) {
  const lang = AUTOCARD_LANGS[body.lang] ? body.lang : 'ko';
  const a = body.answers || {};
  if (!a.work && !a.customer && !a.referral) return json({ error: '질문에 하나 이상 답해주세요' }, 400);
  const prompt = `너는 BNI(비즈니스 리퍼럴 모임) 멤버의 디지털 명함 문구를 쓰는 카피라이터야.
아래 답변에 있는 내용만 근거로 써. 답변에 없는 경력·연차·숫자·수상·자격·고객 수는 절대 지어내지 마.
답변이 짧으면 문구도 짧게 써(부풀리지 말 것). 과장 표현(최고, 1등, 완벽한 등)과 느낌표 금지.

이름: ${clip(body.name, 40)}
직함/회사: ${clip(body.title, 60)} ${clip(body.company, 60)}
Q1 어떤 일을 하나요? ${clip(a.work, 400)}
Q2 주로 누구를 돕나요? ${clip(a.customer, 400)}
Q3 어떤 분을 소개받고 싶나요? ${clip(a.referral, 400)}

작성 언어: ${AUTOCARD_LANGS[lang]}
- slogan: 명함 맨 위 한 줄 소개. "누구를 어떻게 돕는지"가 한눈에 보이게. 35자 이내(영어면 70자 이내).
- work: "하는 일" 섹션. Q1을 바탕으로 무슨 일을, 어떻게 하는지 2~3문장. 150자 이내.
- help: "이런 분을 돕습니다" 섹션. Q2를 바탕으로 어떤 상황의 어떤 사람에게 무엇이 도움이 되는지 2~3문장. 150자 이내.
- referral: "이런 분을 소개해주세요" 섹션. Q3를 바탕으로 받는 사람이 주변의 구체적인 한 사람을 떠올릴 수 있게 상황·조건을 짚어서 1~2문장, 90자 이내.
답변이 비어 있는 질문에 해당하는 필드는 다른 답변에서 알 수 있는 만큼만 쓰고, 알 수 없으면 빈 문자열.
JSON으로만 답해: {"slogan":"","work":"","help":"","referral":""}`;
  const r = await callClaude(env, [{ type: 'text', text: prompt }], 800, AUTOCARD_MODELS);
  return json({ slogan: clip(r.slogan, 120), work: clip(r.work, 400), help: clip(r.help, 400), referral: clip(r.referral, 300) });
}

// ── 자동 명함 AI: 확정 문구를 선택 언어로 번역 (이름은 번역하지 않음 — 본인이 직접 입력) ──
async function autocardTranslate(env, body) {
  const from = AUTOCARD_LANGS[body.from] ? body.from : 'ko';
  const to = [...new Set((body.to || []).filter(l => AUTOCARD_LANGS[l] && l !== from))].slice(0, 3);
  if (!to.length) return json({});
  const t = body.texts || {};
  const texts = { name: clip(t.name, 40), title: clip(t.title, 80), company: clip(t.company, 80), slogan: clip(t.slogan, 200), work: clip(t.work, 400), help: clip(t.help, 400), referral: clip(t.referral, 400), specialties: clip(t.specialties, 600) };
  const shape = '{' + to.map(l => `"${l}":{"name":"","title":"","company":"","slogan":"","work":"","help":"","referral":"","specialties":""}`).join(',') + '}';
  const prompt = `다음 디지털 명함 문구(${AUTOCARD_LANGS[from]})를 ${to.map(l => AUTOCARD_LANGS[l]).join(', ')}로 번역해.
- 명함에 어울리게 자연스럽고 짧게. 의미를 더하거나 빼지 마.
- name(사람 이름)은 뜻을 번역하지 말고 그 언어 사용자가 읽는 표기로: 영어·베트남어는 로마자로 이름 먼저·성 나중(예: 송승훈 → Seunghoon Song), 일본어는 가타카나(예: ソン・スンフン), 중국어는 가장 흔한 한자 표기로 추정, 몽골어는 키릴 문자. 원문 이름이 이미 그 언어 표기면 그대로.
- company(회사명)는 고유명사라 번역하지 말고 그 언어 사용자가 읽을 수 있게 표기만(이미 영문이면 그대로).
- specialties는 줄바꿈(\n)으로 구분된 전문분야 목록이야. 줄마다 번역하고 줄 수와 순서를 그대로 유지해.
- 빈 문자열은 빈 문자열로 둬.
원문: ${JSON.stringify(texts)}
JSON으로만 답해: ${shape}`;
  const r = await callClaude(env, [{ type: 'text', text: prompt }], 3000, AUTOCARD_MODELS);
  const out = {};
  for (const l of to) { const x = r[l] || {}; out[l] = { name: clip(x.name, 60), title: clip(x.title, 120), company: clip(x.company, 120), slogan: clip(x.slogan, 200), work: clip(x.work, 500), help: clip(x.help, 500), referral: clip(x.referral, 400), specialties: clip(x.specialties, 800) }; }
  return json(out);
}

// ── 자동 명함: 기존 이미지 명함(포스터형) 한 장 → 명함 칸 자동 채우기 ──
// 원본 이미지는 여기서 읽기만 하고 저장하지 않는다(캐시에는 추출 결과 JSON만 남음).
const IMPORT_DAILY_PER_DEVICE = 5;   // 기기당 하루 5회
const IMPORT_DAILY_PER_IP = 40;      // 같은 와이파이(BNI 모임 장소)에서 여러 명이 쓰는 경우를 고려해 IP는 넉넉하게
// 전화번호를 010-0000-0000 형식으로 (010.5456.8274, +82 10 …, 공백·괄호 표기 대응)
function normPhone(v) {
  let d = String(v || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('+82')) d = '0' + d.slice(3); else if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  d = d.replace(/\+/g, '');
  if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^0\d{9,10}$/.test(d)) return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^1\d{3}\d{4}$/.test(d)) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');   // 1588-0000 같은 대표번호
  return '';   // 형식을 알 수 없으면 비워서 사람이 확인하게(엉뚱한 번호를 채우지 않음)
}
// "BNI Innovation Chapter", "FOREST CHAPTER", "Pioneer_Chapter" → 챕터명만
function normChapter(v) {
  let c = String(v || '').replace(/BNI/gi, '').replace(/[_\-]?\s*(chapter|챕터)\.?/gi, '').replace(/\s+/g, ' ').trim();
  if (c && c === c.toUpperCase() && /[A-Z]/.test(c) && c.length > 5) c = c.charAt(0) + c.slice(1).toLowerCase();   // FOREST → Forest (SMART처럼 짧은 약어는 그대로)
  return c.slice(0, 40);
}
// "박 지 형"처럼 글자 간격을 띄운 한글 이름 → "박지형" (영문 이름은 그대로)
function normName(v) {
  const n = String(v || '').trim().replace(/\s+/g, ' ');
  return /^[가-힣](\s[가-힣]){1,4}$/.test(n) ? n.replace(/\s/g, '') : n;
}
// 홈페이지만 남김: 마크다운 링크 표기 풀기, 도메인 모양이 아니면(인스타 아이디 등) 버림 — 안 열리는 링크를 만들지 않기 위해
const WEB_TLD = /\.(com|net|org|kr|co\.kr|or\.kr|io|me|shop|store|biz|info|ai|app|co|site|online|page|link|xyz|us|jp|cn|vn|mn|kro\.kr|modoo\.at|tistory\.com|blog\.me)$/i;
function normWebsite(v) {
  let w = String(v || '').trim();
  const md = w.match(/\[([^\]]*)\]\(([^)]*)\)/); if (md) w = md[2] || md[1];
  w = w.replace(/\s+/g, '').replace(/[)\]]+$/, '');
  if (!w) return '';
  let host = '';
  try { host = new URL(/^https?:\/\//i.test(w) ? w : 'https://' + w).hostname; } catch (e) { return ''; }
  return WEB_TLD.test(host) ? w : '';
}
// SNS(인스타·블로그·유튜브 등) → 바로 열리는 링크. 아이디만 있으면 서비스 주소를 붙인다
const SNS_LABEL = { instagram: '인스타그램', blog: '블로그', youtube: '유튜브', facebook: '페이스북', kakao: '카카오톡 채널', tiktok: '틱톡', threads: '스레드' };
function snsLink(x) {
  const type = String((x && x.type) || '').toLowerCase().trim(), raw = String((x && x.value) || '').trim().replace(/\s+/g, '');
  if (!SNS_LABEL[type] || !raw) return null;
  const md = raw.match(/\[([^\]]*)\]\(([^)]*)\)/), v = md ? md[2] || md[1] : raw;
  // 주소로 볼지: 그 서비스 도메인이 들어 있을 때만(인스타 아이디 "royalbronze.official"은 점이 있어도 아이디)
  const own = { instagram: /instagram\.com/i, youtube: /youtube\.com|youtu\.be/i, facebook: /facebook\.com|fb\.com/i, tiktok: /tiktok\.com/i, threads: /threads\.(net|com)/i, kakao: /kakao\.com/i, blog: /blog\.|tistory\.com|brunch\.co\.kr/i }[type];
  if (own.test(v) || (type === 'blog' && normWebsite(v))) return { label: SNS_LABEL[type], url: /^https?:\/\//i.test(v) ? v : 'https://' + v };
  const id = v.replace(/^@/, '');
  if (!/^[\w.]{2,40}$/.test(id)) return null;
  const base = { instagram: 'https://www.instagram.com/', youtube: 'https://www.youtube.com/@', facebook: 'https://www.facebook.com/', tiktok: 'https://www.tiktok.com/@', threads: 'https://www.threads.net/@', blog: 'https://blog.naver.com/' }[type];
  return base ? { label: SNS_LABEL[type], url: base + id + (type === 'instagram' ? '/' : '') } : null;   // 카카오 채널은 아이디만으로는 주소를 알 수 없어 버림
}
// 포스터 분위기 → 명함 디자인(브랜드 색 3개 + 템플릿 + 글꼴). 값이 이상하면 비워서 앱의 기본값을 쓰게 함
const AC_TPLS = ['minimal', 'split', 'badge', 'magazine', 'dark', 'block'], AC_FONTS_OK = ['modern', 'classic', 'elegant', 'soft', 'bold'];
function cleanStyle(st) {
  st = st || {};
  const hex = v => /^#?[0-9a-f]{6}$/i.test(String(v || '').trim()) ? ('#' + String(v).trim().replace('#', '')).toUpperCase() : '';
  const out = { main: hex(st.main), sub: hex(st.sub), point: hex(st.point), tpl: AC_TPLS.includes(st.tpl) ? st.tpl : '', font: AC_FONTS_OK.includes(st.font) ? st.font : '' };
  if (!out.main || !out.sub || !out.point) out.main = out.sub = out.point = '';   // 색은 3개가 다 있어야 씀
  return out;
}
function cleanImport(r) {
  const str = (v, n) => clip(String(v || '').trim(), n);
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => str(x, len)).filter(Boolean).slice(0, n);
  let phone = normPhone(r.phone), phone2 = normPhone(r.phone2);
  const mobile = p => /^01[016789]-/.test(p);
  if (!mobile(phone) && mobile(phone2)) [phone, phone2] = [phone2, phone];   // 휴대폰을 대표 번호로
  if (phone2 === phone) phone2 = '';
  const email = str(r.email, 100).replace(/\s+/g, '').toLowerCase();
  const website = normWebsite(str(r.website, 300));
  const box = r.photoBox || {}, pct = v => Math.max(0, Math.min(100, Number(v) || 0));
  let photoBox = { x: pct(box.x), y: pct(box.y), w: pct(box.w), h: pct(box.h) };
  if (photoBox.w < 5 || photoBox.h < 5) photoBox = null;   // 인물 사진이 없거나 못 찾음
  else { photoBox.w = Math.min(photoBox.w, 100 - photoBox.x); photoBox.h = Math.min(photoBox.h, 100 - photoBox.y); }
  return {
    name: normName(str(r.name, 40)), title: str(r.title, 60), company: str(r.company, 80),
    phone, phone2, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '', website, address: str(r.address, 150),
    slogan: str(r.slogan, 120), specialties: list(r.specialties, 8, 60), referral: list(r.referral, 5, 120), career: list(r.career, 12, 80),
    chapter: normChapter(r.chapter), photoBox,
    sns: (Array.isArray(r.sns) ? r.sns : []).map(snsLink).filter(Boolean).slice(0, 4),
    style: cleanStyle(r.style),
  };
}
// 관리자(대표) 계정은 하루 제한 없음 — 로그인 토큰을 Google에 직접 조회해 이메일·인증 여부를 확인(클라이언트 말은 믿지 않음)
const AUTOCARD_ADMINS = ['jinjjabg@gmail.com'];   // firestore.rules의 관리자 이메일과 같게
async function isAdminToken(idToken) {
  if (!idToken) return false;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    const u = (await res.json()).users?.[0];
    return !!(u && u.emailVerified && AUTOCARD_ADMINS.includes(String(u.email || '').toLowerCase()));
  } catch (e) { return false; }   // 확인 실패 시 일반 사용자로 취급
}
async function importRateLimit(env, request, deviceId) {
  if (!env.OCR_CACHE) return null;   // KV 바인딩이 없으면 제한 없이 동작(캐시도 없음)
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  const dev = /^[A-Za-z0-9-]{8,64}$/.test(deviceId || '') ? deviceId : 'nodev-' + ip;
  const keys = [[`ac-rl:dev:${dev}:${day}`, IMPORT_DAILY_PER_DEVICE], [`ac-rl:ip:${ip}:${day}`, IMPORT_DAILY_PER_IP]];
  const counts = await Promise.all(keys.map(([k]) => env.OCR_CACHE.get(k).then(v => Number(v) || 0)));
  if (counts.some((c, i) => c >= keys[i][1])) return json({ error: '오늘 이미지로 시작하기를 모두 썼어요(하루 5번). 내일 다시 하거나 처음부터 입력해주세요.', limited: true }, 429);
  await Promise.all(keys.map(([k], i) => env.OCR_CACHE.put(k, String(counts[i] + 1), { expirationTtl: 60 * 60 * 26 })));
  return null;
}
async function autocardImport(env, request, body) {
  const { image, mediaType, hash, deviceId, idToken } = body;
  if (!image || image.length > 7_000_000) return json({ error: '이미지가 없거나 너무 커요' }, 400);
  // 캐시 키 버전: 추출 항목이 늘면 올린다(v2: sns, v3: style). 카드북 OCR 캐시와 키가 겹치지 않게 접두어
  const okHash = hash && /^[a-f0-9]{64}$/.test(hash);
  const cacheKey = okHash ? 'ac-import:v3:' + hash : '';
  let seenBefore = false;
  if (cacheKey && env.OCR_CACHE) {
    const hit = await env.OCR_CACHE.get(cacheKey, 'json');
    if (hit) return json({ ...cleanImport(hit), cached: true });   // 같은 이미지 재요청은 횟수 차감 없음(정리 규칙은 최신으로 다시 적용)
    for (const old of ['v2', 'v1']) if (!seenBefore) seenBefore = !!(await env.OCR_CACHE.get(`ac-import:${old}:` + hash));   // 예전 버전으로 이미 읽은 이미지 → 새 항목만 다시 읽음, 횟수는 안 셈
  }
  if (!seenBefore && !(await isAdminToken(idToken))) {
    const limited = await importRateLimit(env, request, deviceId);
    if (limited) return limited;
  }
  const prompt = `이 이미지는 BNI 멤버의 포스터형 명함(홍보 이미지)이야. 이미지에 실제로 적힌 글자만 옮겨 아래 JSON으로 답해.
규칙:
- 이미지에 없는 정보는 빈 문자열 "" 또는 빈 배열 []. 추측·보충·지어내기 절대 금지. 글자를 고치거나 다듬지 말고 보이는 그대로.
- name: 사람 이름만(직함 제외). 글자 사이 띄어쓰기는 빼고 붙여 써(예: "박 지 형" → "박지형"). 한글 이름이 없고 영문 이름만 있으면 영문 그대로. title: 직함(대표, 대표원장, 대표 세무사 등). company: 회사·상호명(한글 표기가 있으면 한글).
- phone: 휴대폰(010…). phone2: 사무실·대표 전화(T., Tel 등). 팩스(F., Fax)는 넣지 마.
- email, address: 보이는 그대로. website: 홈페이지 주소만 글자 그대로(마크다운 링크 표기 금지). 인스타그램·블로그 아이디(@…, 아이콘 옆 아이디)는 website에 넣지 마.
- sns: 인스타그램·블로그·유튜브·페이스북·카카오톡 채널·틱톡·스레드 주소나 아이디가 보이면 [{"type":"instagram|blog|youtube|facebook|kakao|tiktok|threads","value":"보이는 그대로"}]. 아이콘으로 종류를 판단해. 없으면 [].
- slogan: 가장 크게 강조된 소개 문구 한 줄(없으면 "").
- specialties: 전문분야·서비스·취급 품목을 짧은 항목 리스트로(원문 표현 유지, 최대 8개).
- referral: "원하는 리퍼럴", "이런 분을 소개해주세요"처럼 소개받고 싶은 대상을 명시한 항목이 있을 때만. 없으면 [].
- career: 학력·자격·경력·수상·방송 이력 항목(원문 그대로, 최대 12개).
- chapter: "BNI ○○ Chapter" 같은 챕터 표기 원문.
- style: 이 명함의 디자인 느낌을 디지털 명함으로 옮기기 위한 값.
  main = 브랜드 대표색(로고·큰 제목·색 띠에 쓰인 진한 색), sub = 바탕색(주로 밝은 색), point = 강조색(버튼·포인트 글자에 어울리는 색). 모두 #RRGGBB.
  배경 사진(건물·하늘·풍경)이나 인물 옷 색이 아니라, 로고·제목·강조 글자에 쓰인 색에서 골라. 색이 거의 없으면 로고 색을 main으로.
  tpl = 분위기에 가장 가까운 것 하나: minimal(깔끔·밝음) | split(사선·역동) | badge(친근·부드러움) | magazine(고급·편집) | dark(어두운 고급) | block(굵은 색 면·강렬).
  font = modern(깔끔한 고딕) | classic(명조) | elegant(부드러운 바탕) | soft(둥근·친근) | bold(굵고 강렬한 제목).
- photoBox: 이미지 속 인물 사진(얼굴과 상반신) 영역을 이미지 전체 대비 퍼센트로 {x,y,w,h} (왼쪽 위 기준, 0~100). 인물이 없으면 모두 0.
JSON만 답해: {"name":"","title":"","company":"","phone":"","phone2":"","email":"","website":"","address":"","slogan":"","specialties":[],"referral":[],"career":[],"chapter":"","sns":[],"style":{"main":"","sub":"","point":"","tpl":"","font":""},"photoBox":{"x":0,"y":0,"w":0,"h":0}}`;
  const raw = await callClaude(env, [
    { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
    { type: 'text', text: prompt },
  ], 2000, OCR_MODELS);
  const result = cleanImport(raw);
  if (cacheKey && env.OCR_CACHE) await env.OCR_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 30 });
  return json(result);
}

async function bniCheck(env, phone) {
  const norm = v => (v || '').replace(/[^0-9]/g, '');
  const p = norm(phone);
  if (!p) return json({ isBni: false });
  const token = await firebaseAccessToken(env);
  const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}/bni_members`, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  for (const doc of data.documents || []) {
    const f = doc.fields || {};
    if (norm(f.phone?.stringValue) === p) {
      return json({ isBni: true, name: f.name?.stringValue || '', chapter: f.chapter?.stringValue || '' });
    }
  }
  return json({ isBni: false });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    // ── 이미지 프록시: Firebase Storage 파일을 카드북 페이지가 가져갈 수 있게 (CORS 우회, 공유용) ──
    if (request.method === 'GET' && url.pathname === '/img') {
      const src = url.searchParams.get('u') || '';
      if (!src.startsWith('https://firebasestorage.googleapis.com/')) return json({ error: 'not allowed' }, 403);
      const r = await fetch(src);
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ...CORS } });
    }

    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    try {
      // ── 신규: 이미지 한 장으로 OCR + 구조화 ──
      if (url.pathname === '/ocr-image') {
        const { image, mediaType, hash, idToken } = await request.json();
        if (!image) return json({ error: 'image required' }, 400);
        const uid = await verifyIdToken(idToken);
        const fbToken = await firebaseAccessToken(env);
        if (hash && env.OCR_CACHE) {
          const hit = await env.OCR_CACHE.get(hash, 'json');
          if (hit) return json({ ...hit, cached: true });
        }
        const credits = await ensureCredits(fbToken, uid);
        if (credits <= 0) return json({ error: '스캔 장수를 다 썼어요. 충전하면 바로 이어서 스캔할 수 있어요 (DiCA·링크 저장은 무제한)', needCharge: true }, 402);
        const result = await callClaude(env, [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
          { type: 'text', text: `이 명함(또는 명함 전단) 이미지를 읽고 아래 JSON 스키마로만 답해. 마크다운 없이 JSON만. 없는 항목은 빈 문자열.\n${OCR_SCHEMA}` },
        ], 2000, OCR_MODELS);
        if (hash && env.OCR_CACHE) await env.OCR_CACHE.put(hash, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 });
        const base_ = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
        await commitWrites(fbToken, [
          fsPatch(uid, { credits: credits - 1 }),
          { transform: { document: `${base_}/users/${uid}`, fieldTransforms: [ { fieldPath: 'scanTotal', increment: { integerValue: '1' } } ] } },
        ]).catch(() => {});
        return json({ ...result, creditsLeft: credits - 1 });
      }

      // ── 로그인 시 잔여 장수 조회 (가입/월간 무료분 반영) ──
      if (url.pathname === '/credits/status') {
        const { idToken } = await request.json();
        const uid = await verifyIdToken(idToken);
        const fbToken = await firebaseAccessToken(env);
        const credits = await ensureCredits(fbToken, uid);
        return json({ credits });
      }

      // ── DiCA 본인 명함 등록 시 500장 1회 지급 (같은 링크는 최초 1명만 — 선점제) ──
      if (url.pathname === '/credits/dica-bonus') {
        const { idToken, url: dicaUrl } = await request.json();
        const uid = await verifyIdToken(idToken);
        let host = '', normUrl = ''; try { const u2 = new URL(dicaUrl); host = u2.hostname; normUrl = (u2.hostname + u2.pathname).toLowerCase().replace(/\/$/, ''); } catch (e) { return json({ granted: false }); }
        if (!DICA_DOMAINS.includes(host)) return json({ granted: false, reason: '지원하지 않는 도메인' });
        // 자동 명함 링크(…/autocard/c/?id=...)는 500장이 아니라 50장 — 경로로 구분
        if (AUTOCARD_PATHS.some(p => normUrl.startsWith(host + p))) {
          return await autocardBonus(env, uid, new URL(dicaUrl).searchParams.get('id'));
        }
        const fbToken = await firebaseAccessToken(env);
        const u = await getUserDoc(fbToken, uid);
        if (u.dica500Granted) return json({ granted: false, reason: '이미 지급됨' });
        const claimId = encodeURIComponent(normUrl);
        const base = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
        try {
          // 이 링크에 대한 선점 기록을 "존재하지 않을 때만" 생성 — 동시에 여러 명이 눌러도 최초 1명만 성공(원자적)
          const claimRes = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
            method: 'POST', headers: { Authorization: 'Bearer ' + fbToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ writes: [{ update: { name: `${base}/dicaClaims/${claimId}`, fields: { uid: { stringValue: uid }, url: { stringValue: dicaUrl }, claimedAt: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } }] }),
          });
          if (!claimRes.ok) {
            const errText = await claimRes.text();
            if (/ALREADY_EXISTS|already exists/i.test(errText)) return json({ granted: false, reason: '이미 다른 계정에서 등록된 명함이에요. 본인 명함이 맞다면 문의해주세요.' });
            throw new Error(errText.slice(0, 200));
          }
        } catch (e) { return json({ granted: false, reason: e.message }); }
        const credits = (typeof u.credits === 'number' ? u.credits : FREE_SIGNUP) + DICA_OWNER_BONUS;
        await commitWrites(fbToken, [fsPatch(uid, { credits, dica500Granted: true })]);
        return json({ granted: true, credits, bonus: DICA_OWNER_BONUS });
      }

      // ── 자동 명함 AI (로그인 없이 호출 — 입력 길이·출력 토큰을 작게 잘라 비용을 묶어둠) ──
      if (url.pathname === '/autocard/draft') return await autocardDraft(env, await request.json());
      if (url.pathname === '/autocard/translate') return await autocardTranslate(env, await request.json());
      if (url.pathname === '/autocard/import') return await autocardImport(env, request, await request.json());

      // ── 결제 확인: 토스에 승인 요청 → 성공 시 장수 충전 ──
      if (url.pathname === '/pay/confirm') {
        const { paymentKey, orderId, amount } = await request.json();
        // orderId = cb_{uid}_{packId}_{timestamp}
        const m = /^cb_([A-Za-z0-9]+)_(p\d+)_(\d+)$/.exec(orderId || '');
        if (!m) return json({ error: '주문번호 형식 오류' }, 400);
        const [, uid, packId] = m; const pack = PACKS[packId];
        if (!pack) return json({ error: '없는 상품' }, 400);
        if (Number(amount) !== pack.price) return json({ error: '금액 불일치' }, 400);
        if (!env.TOSS_SECRET_KEY || !env.FIREBASE_SA) return json({ error: '결제 설정이 아직 안 됐어요 (TOSS_SECRET_KEY / FIREBASE_SA)' }, 500);
        const tRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST',
          headers: { Authorization: 'Basic ' + btoa(env.TOSS_SECRET_KEY + ':'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
        });
        const tData = await tRes.json();
        if (!tRes.ok) return json({ error: tData.message || '결제 승인 실패', code: tData.code }, 400);
        try {
          await creditUser(env, uid, orderId, pack.n, { amount: pack.price, paymentKey, method: tData.method });
        } catch (e) {
          // 이미 처리된 주문(새로고침 등)이면 성공으로 간주
          if (/ALREADY_EXISTS|already exists/i.test(e.message)) return json({ ok: true, credits: pack.n, duplicate: true });
          throw e;
        }
        return json({ ok: true, credits: pack.n });
      }

      // ── 기존: 텍스트 파싱 ──
      if (url.pathname === '/ocr-parse') {
        const { rawText } = await request.json();
        const result = await callClaude(env, [
          { type: 'text', text: `다음 명함 텍스트에서 정보를 추출해 JSON으로만 답해. 없으면 빈 문자열.\n{"name":"","nameEn":"","title":"","company":"","phone":"","email":""}\n\n${rawText}` },
        ], 500);
        return json(result);
      }

      // ── 기존: AI 검색 ──
      if (url.pathname === '/ai-search') {
        const { query, summaries } = await request.json();
        const result = await callClaude(env, [
          { type: 'text', text: `명함 목록에서 검색어와 관련된 사람을 찾아. JSON으로만 답해: {"matched":[인덱스 숫자 배열],"summary":"한 줄 설명"}\n\n검색어: ${query}\n\n명함 목록:\n${summaries}` },
        ], 500);
        return json(result);
      }

      // ── BNI 멤버 여부 확인 (읽기 전용, 다른 프로젝트인 주주도사 Worker가 호출) ──
      // 전화번호 뒷자리까지 정확히 같은 멤버가 명부에 있으면 이름·챕터를 돌려준다. 개인정보 최소화를 위해 다른 필드는 안 줌.
      if (request.method === 'GET' && url.pathname === '/bni-check') return await bniCheck(env, url.searchParams.get('phone') || '');

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
