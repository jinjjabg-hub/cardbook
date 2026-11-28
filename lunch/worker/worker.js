// 카드북 점심 Worker — cardbook-lunch.jinjjabg.workers.dev
// 왜 따로 두나: 심사 중인 카드북 서버(cardbook-ai)를 건드리지 않고, 점심 기능이 고장 나도 카드북에 영향이 없게.
//
// 비밀값(Worker Secret): ANTHROPIC_API_KEY, KAKAO_REST_KEY  ← 코드·화면에는 절대 넣지 않는다
// KV 바인딩: LUNCH_CACHE — 식당 검색 6시간 캐시 + 하루 사용 횟수 제한. 없으면 캐시 없이 동작
//
// 라우트(전부 POST, 로그인 토큰 idToken 필요 — 남이 우리 키로 AI·카카오를 쓰지 못하게)
//   /lunch/recommend  { chips, text, month, recentMenus }  → { menus:[{name,reason,keywords}] }
//   /lunch/places     { x, y, keyword }                    → { places:[...], cached }
//   /lunch/locate     { query } 또는 { x, y }              → { x, y, label, gu }

const FIREBASE_WEB_API_KEY = 'AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0';   // 공개 웹 키(카드북 화면에도 있음), 비밀 아님
const PLACES_TTL = 60 * 60 * 6;          // 식당 검색 캐시 6시간
const REGION_TTL = 60 * 60 * 24 * 30;    // 좌표→구 이름 캐시 30일(행정구역은 거의 안 바뀜)
const DAILY_LIMIT = { recommend: 40, places: 200, locate: 60 };   // 1인 하루 한도(비용 폭주 방지)

// Haiku 5.5 먼저. 모델명 오류(404)일 때만 Haiku 4.5로 재시도
const MODELS = ['claude-haiku-5-5', 'claude-haiku-4-5-20251001'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

class UserError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function verifyIdToken(idToken) {
  if (!idToken) throw new UserError('로그인이 필요해요', 401);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const data = await res.json().catch(() => ({}));
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new UserError('로그인이 만료됐어요. 새로고침 후 다시 해주세요', 401);
  return uid;
}

// 한국 날짜(YYYY-MM-DD) — 하루 한도는 한국 자정 기준
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function checkLimit(env, uid, kind) {
  if (!env.LUNCH_CACHE) return;
  const k = `rl:${kind}:${uid}:${kstDay()}`;
  const n = Number(await env.LUNCH_CACHE.get(k)) || 0;
  if (n >= DAILY_LIMIT[kind]) throw new UserError('오늘 사용 한도를 넘었어요. 내일 다시 해주세요', 429);
  await env.LUNCH_CACHE.put(k, String(n + 1), { expirationTtl: 60 * 60 * 26 });
}

// ───────────────────────── AI 메뉴 추천 ─────────────────────────
const EXCLUDE_CHIPS = ['느끼한 거 ✕', '매운 거 ✕', '날것 ✕', '밀가루 ✕'];
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

const MENU_SCHEMA = {
  type: 'object',
  properties: {
    menus: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'reason', 'keywords'],
        additionalProperties: false,
      },
    },
  },
  required: ['menus'],
  additionalProperties: false,
};

function buildPrompt({ chips, text, month, recentMenus }) {
  const excl = chips.filter(c => EXCLUDE_CHIPS.includes(c)).map(c => c.replace(' ✕', ''));
  const want = chips.filter(c => !EXCLUDE_CHIPS.includes(c));
  return `한국 직장인(회사 대표)의 오늘 점심 메뉴 3개를 골라줘.

[조건]
- 지금은 ${month}월이야. 계절(날씨)과 제철 재료를 반영해.
- 원하는 것: ${want.length ? want.join(', ') : '특별히 없음'}
- 한 줄 요청: ${text || '없음'}
- 반드시 빼야 하는 것(어기면 안 됨): ${excl.length ? excl.join(', ') : '없음'}
  · 느끼한 거 = 튀김·크림·기름진 음식 / 매운 거 = 고추·고춧가루·매운 양념 / 날것 = 회·육회·생선초밥·생굴 / 밀가루 = 면·빵·수제비·만두·튀김옷
- 최근 3일 동안 먹은 메뉴(다시 고르지 마): ${recentMenus.length ? recentMenus.join(', ') : '없음'}

[출력 규칙]
- 세 메뉴는 서로 종류가 겹치지 않게(예: 국물·밥·면처럼 다양하게).
- name: 식당 간판에 흔히 쓰는 메뉴 이름 하나(예: 대구탕, 제육볶음, 메밀소바).
- reason: 20자 안팎 한 줄. 사용자가 고른 조건과 연결해서(예: "추운 날 칼칼하고 시원한 국물").
- keywords: 근처 식당을 검색할 단어 2~4개. 첫 단어는 메뉴 이름, 나머지는 그 메뉴를 파는 가게 종류(예: ["대구탕","생선","매운탕"]).
- 아래 JSON 형식으로만 답해. 다른 말은 쓰지 마.
{"menus":[{"name":"","reason":"","keywords":["",""]}]}`;
}

async function callClaudeOnce(env, prompt) {
  let lastErr = '';
  for (const model of MODELS) {
    const body = { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] };
    // Haiku 5.5: 생각은 적게(low) + 응답을 JSON 형식으로 강제
    if (model === 'claude-haiku-5-5') body.output_config = { effort: 'low', format: { type: 'json_schema', schema: MENU_SCHEMA } };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.stop_reason === 'refusal') throw new Error('refusal');
      return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    }
    lastErr = `[${model}] ${data.error?.type || res.status}: ${data.error?.message || ''}`;
    if (data.error?.type !== 'not_found_error') break;   // 모델명 문제일 때만 다음 모델
  }
  throw new Error(lastErr);
}

// JSON으로 읽히고 메뉴가 1개 이상이면 통과. 아니면 null
function parseMenus(text, recentMenus) {
  let obj;
  try { const m = String(text).match(/\{[\s\S]*\}/); obj = m && JSON.parse(m[0]); } catch (e) { return null; }
  if (!obj || !Array.isArray(obj.menus)) return null;
  const recent = new Set(recentMenus.map(s => s.replace(/\s/g, '')));
  const seen = new Set();
  const menus = [];
  for (const m of obj.menus) {
    const name = clean(m?.name, 20);
    if (!name) continue;
    const key = name.replace(/\s/g, '');
    if (recent.has(key) || seen.has(key)) continue;     // 최근 3일 메뉴는 서버에서 한 번 더 걸러냄
    seen.add(key);
    let kw = (Array.isArray(m.keywords) ? m.keywords : []).map(k => clean(k, 15)).filter(Boolean);
    if (!kw.includes(name)) kw.unshift(name);
    kw = [...new Set(kw)].slice(0, 4);
    menus.push({ name, reason: clean(m.reason, 40), keywords: kw });
    if (menus.length === 3) break;
  }
  return menus.length ? menus : null;
}

async function recommend(env, body) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 없음');
  const chips = (Array.isArray(body.chips) ? body.chips : []).map(c => clean(c, 20)).filter(Boolean).slice(0, 20);
  const recentMenus = (Array.isArray(body.recentMenus) ? body.recentMenus : []).map(c => clean(c, 20)).filter(Boolean).slice(0, 15);
  const month = Math.min(12, Math.max(1, Number(body.month) || (new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1)));
  const prompt = buildPrompt({ chips, text: clean(body.text, 80), month, recentMenus });
  // JSON이 아니면 한 번만 다시. 그래도 안 되면 "잠시 후 다시"
  for (let i = 0; i < 2; i++) {
    let text = '';
    try { text = await callClaudeOnce(env, prompt); } catch (e) { if (i === 1) throw e; continue; }
    const menus = parseMenus(text, recentMenus);
    if (menus) return { menus };
  }
  throw new Error('parse');
}

// ───────────────────────── 카카오 로컬 ─────────────────────────
async function kakao(env, path, params) {
  if (!env.KAKAO_REST_KEY) throw new Error('KAKAO_REST_KEY 없음');
  const res = await fetch(`https://dapi.kakao.com${path}?` + new URLSearchParams(params), {
    headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_KEY },
  });
  if (!res.ok) throw new Error('kakao ' + res.status);
  return res.json();
}

// 좌표 검증 + 소수점 3자리 반올림(약 100m). 캐시 키와 실제 검색 좌표를 같게 해서 캐시가 정확히 맞게
function roundXY(x, y) {
  x = Number(x); y = Number(y);
  if (!isFinite(x) || !isFinite(y) || x < 124 || x > 132 || y < 33 || y > 39.5) throw new UserError('위치가 올바르지 않아요');
  return [x.toFixed(3), y.toFixed(3)];
}

async function places(env, body) {
  const [x, y] = roundXY(body.x, body.y);
  const keyword = clean(body.keyword, 20);
  if (!keyword) throw new UserError('검색어가 없어요');
  const cacheKey = `pl:${x},${y}:${keyword}`;
  if (env.LUNCH_CACHE) {
    const hit = await env.LUNCH_CACHE.get(cacheKey, 'json');
    if (hit) return { places: hit, cached: true };
  }
  const d = await kakao(env, '/v2/local/search/keyword.json', {
    query: keyword, x, y, radius: '1000', sort: 'distance', size: '15', category_group_code: 'FD6',
  });
  const list = (d.documents || []).map(p => ({
    id: p.id, name: p.place_name, address: p.road_address_name || p.address_name || '',
    phone: p.phone || '', distance: Number(p.distance) || 0, url: p.place_url || '',
    x: p.x, y: p.y, category: (p.category_name || '').split('>').pop().trim(),
  }));
  if (env.LUNCH_CACHE) await env.LUNCH_CACHE.put(cacheKey, JSON.stringify(list), { expirationTtl: PLACES_TTL });
  return { places: list, cached: false };
}

// "사상구"처럼 구 이름만. 구가 없는 시·군(예: 김해시)은 그 이름
function pickGu(region2) {
  const parts = String(region2 || '').split(/\s+/).filter(Boolean);
  return parts.find(p => /구$/.test(p)) || parts[parts.length - 1] || '';
}

async function regionOf(env, x, y) {
  const k = `rg:${x},${y}`;
  if (env.LUNCH_CACHE) { const hit = await env.LUNCH_CACHE.get(k, 'json'); if (hit) return hit; }
  const d = await kakao(env, '/v2/local/geo/coord2regioncode.json', { x, y });
  const doc = (d.documents || []).find(r => r.region_type === 'B') || (d.documents || [])[0] || {};
  const out = { gu: pickGu(doc.region_2depth_name), dong: doc.region_3depth_name || '' };
  if (env.LUNCH_CACHE && out.gu) await env.LUNCH_CACHE.put(k, JSON.stringify(out), { expirationTtl: REGION_TTL });
  return out;
}

async function locate(env, body) {
  let x, y, label = '';
  if (body.query) {
    const query = clean(body.query, 40);
    const d = await kakao(env, '/v2/local/search/keyword.json', { query, size: '1' });
    const p = (d.documents || [])[0];
    if (!p) throw new UserError('그 장소를 찾지 못했어요. 다른 이름으로 해주세요');
    [x, y] = roundXY(p.x, p.y);
    label = p.place_name || query;
  } else {
    [x, y] = roundXY(body.x, body.y);
  }
  const r = await regionOf(env, x, y);
  if (!label) label = [r.gu, r.dong].filter(Boolean).join(' ') || '현재 위치';
  return { x, y, label, gu: r.gu };
}

// ───────────────────────── 진입점 ─────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const path = new URL(request.url).pathname;
    const kind = { '/lunch/recommend': 'recommend', '/lunch/places': 'places', '/lunch/locate': 'locate' }[path];
    if (!kind) return json({ error: 'not found' }, 404);
    try {
      const body = await request.json().catch(() => ({}));
      const uid = await verifyIdToken(body.idToken);
      await checkLimit(env, uid, kind);
      if (kind === 'recommend') return json(await recommend(env, body));
      if (kind === 'places') return json(await places(env, body));
      return json(await locate(env, body));
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, e.status);
      console.log('lunch error', kind, e.message);
      return json({ error: '잠시 후 다시 해주세요' }, 502);
    }
  },
};

export const _test = { parseMenus, buildPrompt, pickGu, roundXY };
