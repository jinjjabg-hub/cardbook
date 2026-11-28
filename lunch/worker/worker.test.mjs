// 점심 Worker 테스트 — 외부 호출(Firebase·Claude·카카오)은 전부 가짜라 키·네트워크 없이 돈다
// 사용: node lunch/worker/worker.test.mjs
import assert from 'assert';

const kvStore = new Map();
const KV = {
  async get(k, t) { const v = kvStore.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); },
  async put(k, v) { kvStore.set(k, v); },
};
const env = { ANTHROPIC_API_KEY: 'k', KAKAO_REST_KEY: 'kk', LUNCH_CACHE: KV };

let claudeReplies = [], claudeBodies = [], kakaoCalls = [];
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (url.includes('identitytoolkit')) return body.idToken === 'bad' ? J({}) : J({ users: [{ localId: body.idToken }] });
  if (url.includes('api.anthropic.com')) {
    claudeBodies.push(body);
    const t = claudeReplies.shift();
    return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
  }
  if (url.includes('dapi.kakao.com')) {
    assert.equal(opt.headers.Authorization, 'KakaoAK kk');
    kakaoCalls.push(url);
    if (url.includes('coord2regioncode')) return J({ documents: [{ region_type: 'B', region_2depth_name: '사상구', region_3depth_name: '괘법동' }] });
    const q = new URL(url).searchParams;
    if (!q.get('category_group_code')) return J({ documents: [{ place_name: '냉정역 2호선', x: '128.98345', y: '35.15122' }] });
    return J({ documents: [{ id: '1', place_name: '부산대구탕', road_address_name: '부산 사상구 가야대로 1', phone: '051-111-2222', distance: '120', place_url: 'http://place.map.kakao.com/1', x: '128.98', y: '35.15', category_name: '음식점 > 한식 > 해물,생선' }] });
  }
  throw new Error('unexpected fetch ' + url);
};

const worker = (await import('./worker.js')).default;
const call = async (path, b) => {
  const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', body: JSON.stringify(b) }), env);
  return { status: r.status, ...(await r.json()) };
};
const menusJson = names => JSON.stringify({ menus: names.map(n => ({ name: n, reason: '추운 날 칼칼한 국물', keywords: [n, '생선'] })) });

// 1) 로그인 없으면 거절
assert.equal((await call('/lunch/recommend', { chips: [] })).status, 401);
assert.equal((await call('/lunch/recommend', { idToken: 'bad' })).status, 401);

// 2) 추천: 빼기 칩·최근 메뉴·월이 프롬프트에 들어가고, Haiku 5.5 + JSON 형식 강제
claudeReplies = [menusJson(['대구탕', '제육볶음', '메밀소바'])];
let r = await call('/lunch/recommend', { idToken: 'u1', chips: ['칼칼', '매운 거 ✕'], text: '', month: 11, recentMenus: ['김치찌개'] });
assert.equal(r.status, 200); assert.equal(r.menus.length, 3);
assert.deepEqual(r.menus[0], { name: '대구탕', reason: '추운 날 칼칼한 국물', keywords: ['대구탕', '생선'] });
let b = claudeBodies.at(-1);
assert.equal(b.model, 'claude-haiku-5-5'); assert.equal(b.output_config.effort, 'low'); assert.equal(b.output_config.format.type, 'json_schema');
const p = b.messages[0].content;
assert.ok(p.includes('11월')); assert.ok(p.includes('반드시 빼야 하는 것(어기면 안 됨): 매운 거')); assert.ok(p.includes('다시 고르지 마): 김치찌개'));
assert.ok(!p.includes('원하는 것: 칼칼, 매운')); // 빼기 칩은 '원하는 것'에 섞이지 않음

// 3) 최근 3일 메뉴는 AI가 실수로 내도 서버에서 걸러냄
claudeReplies = [menusJson(['김치 찌개', '대구탕', '돈까스'])];
r = await call('/lunch/recommend', { idToken: 'u1', chips: [], month: 11, recentMenus: ['김치찌개'] });
assert.deepEqual(r.menus.map(m => m.name), ['대구탕', '돈까스']);

// 4) JSON이 깨지면 한 번만 다시 요청 → 성공
claudeBodies = [];
claudeReplies = ['죄송해요 메뉴는...', menusJson(['국밥'])];
r = await call('/lunch/recommend', { idToken: 'u1', chips: [], month: 1 });
assert.equal(r.status, 200); assert.equal(r.menus[0].name, '국밥'); assert.equal(claudeBodies.length, 2);
// 두 번 다 깨지면 "잠시 후 다시" (세 번째 요청은 안 함)
claudeBodies = [];
claudeReplies = ['x', 'y'];
r = await call('/lunch/recommend', { idToken: 'u1', chips: [], month: 1 });
assert.equal(r.status, 502); assert.equal(r.error, '잠시 후 다시 해주세요'); assert.equal(claudeBodies.length, 2);

// 5) 식당 검색: 파라미터 확인 + 같은 위치·메뉴는 KV 캐시(카카오 다시 안 부름)
kakaoCalls = [];
r = await call('/lunch/places', { idToken: 'u1', x: 128.98345, y: 35.15122, keyword: '대구탕' });
assert.equal(r.cached, false); assert.equal(r.places[0].name, '부산대구탕'); assert.equal(r.places[0].phone, '051-111-2222');
assert.equal(r.places[0].distance, 120); assert.equal(r.places[0].url, 'http://place.map.kakao.com/1');
const q = new URL(kakaoCalls[0]).searchParams;
assert.equal(q.get('category_group_code'), 'FD6'); assert.equal(q.get('radius'), '1000'); assert.equal(q.get('sort'), 'distance'); assert.equal(q.get('size'), '15');
assert.equal(q.get('x'), '128.983'); assert.equal(q.get('y'), '35.151');
assert.ok(kvStore.has('pl:128.983,35.151:대구탕'));
r = await call('/lunch/places', { idToken: 'u1', x: 128.98349, y: 35.15104, keyword: '대구탕' });   // 소수점 3자리가 같음
assert.equal(r.cached, true); assert.equal(kakaoCalls.length, 1);
// 잘못된 좌표는 거절
assert.equal((await call('/lunch/places', { idToken: 'u1', x: 0, y: 0, keyword: '국밥' })).status, 400);

// 6) 위치: 지역 입력 → 첫 결과 좌표 + 구 이름 / GPS 좌표 → 구 이름
r = await call('/lunch/locate', { idToken: 'u1', query: '사상구 냉정역' });
assert.deepEqual([r.x, r.y, r.label, r.gu], ['128.983', '35.151', '냉정역 2호선', '사상구']);
r = await call('/lunch/locate', { idToken: 'u1', x: 128.99, y: 35.16 });
assert.equal(r.gu, '사상구'); assert.equal(r.label, '사상구 괘법동');

// 7) 구 이름 고르기
const { _test } = await import('./worker.js');
assert.equal(_test.pickGu('창원시 의창구'), '의창구'); assert.equal(_test.pickGu('김해시'), '김해시');

// 8) 하루 한도
for (let i = 0; i < 60; i++) await KV.put('rl:locate:u2:' + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), '60');
assert.equal((await call('/lunch/locate', { idToken: 'u2', x: 128.99, y: 35.16 })).status, 429);

console.log('lunch worker tests OK');
