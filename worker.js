// CardBook AI Worker — cardbook-ai.jinjjabg.workers.dev
// 환경변수(Secret): ANTHROPIC_API_KEY
// KV 바인딩(선택): OCR_CACHE — 같은 이미지는 한 번만 읽고 결과 재사용. 바인딩이 없으면 캐시 없이 동작
// 결제(Secret): TOSS_SECRET_KEY(토스페이먼츠 시크릿 키), FIREBASE_SA(Firebase 서비스 계정 JSON 전체)

// 충전 상품 — index.html의 PACKS와 반드시 같아야 함 (금액 검증에 사용)
const PACKS = { p100: { n: 100, price: 3000 }, p300: { n: 300, price: 7000 }, p1000: { n: 1000, price: 20000 } };
const FIREBASE_PROJECT = 'mandu-e7c3c';
const FIREBASE_WEB_API_KEY = 'AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0';
const FREE_SIGNUP = 50, FREE_MONTHLY = 5, DICA_OWNER_BONUS = 500;
const DICA_DOMAINS = ['jinjjabg-hub.github.io'];
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
        return json({ granted: true, credits });
      }

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
