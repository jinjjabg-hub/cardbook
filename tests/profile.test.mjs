// 카드북 본인 등록 명함 사진 읽기(/profile/scan): Sonnet 5.5 + effort low, 로그인 필수, 하루 3번, 같은 사진 캐시
import assert from 'assert';
const kv = new Map(); const sent = [];
const env = { ANTHROPIC_API_KEY: 'k', OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, v); } } };
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('identitytoolkit')) { const t = JSON.parse(opt.body).idToken; return J(t === 'bad' ? {} : { users: [{ localId: t }] }); }
  if (url.includes('anthropic.com')) {
    sent.push({ headers: opt.headers, body: JSON.parse(opt.body) });
    return J({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"name":"송 승 훈","company":"티엠링크","title":"대표","phone":"010.5334.2544","email":"a@b.com","x":"y"}' }] });
  }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async body => { const r = await worker.fetch(new Request('https://w/profile/scan', { method: 'POST', body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };
const H = h => h.repeat(64).slice(0, 64);
// 1) 로그인 없으면 거절, AI 호출 없음
let [st, r] = await call({ image: 'AAA', hash: H('a') }); assert.notEqual(st, 200); assert.equal(sent.length, 0);
[st, r] = await call({ idToken: 'bad', image: 'AAA', hash: H('a') }); assert.notEqual(st, 200); assert.equal(sent.length, 0);
// 2) 정상: Sonnet 5.5 + effort low + fallbacks, 결과 정리(이름 붙여쓰기·전화 형식·모르는 칸 제거)
[st, r] = await call({ idToken: 'u1', image: 'AAA', hash: H('a') });
assert.equal(st, 200);
assert.deepEqual(r, { name: '송승훈', company: '티엠링크', title: '대표', phone: '010-5334-2544', email: 'a@b.com' });
assert.equal(sent[0].body.model, 'claude-sonnet-5-5');
assert.deepEqual(sent[0].body.output_config, { effort: 'low' });
assert.equal(sent[0].body.fallbacks, 'default');
assert.equal(sent[0].headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
// 3) 같은 사진은 캐시 — AI 호출·횟수 없음
[st, r] = await call({ idToken: 'u1', image: 'AAA', hash: H('a') }); assert.equal(r.cached, true); assert.equal(sent.length, 1);
// 4) 한 사람 하루 3번까지
[st] = await call({ idToken: 'u1', image: 'AAA', hash: H('b') }); assert.equal(st, 200);
[st] = await call({ idToken: 'u1', image: 'AAA', hash: H('c') }); assert.equal(st, 200);
[st, r] = await call({ idToken: 'u1', image: 'AAA', hash: H('d') }); assert.equal(st, 429); assert.equal(r.limited, true);
[st] = await call({ idToken: 'u2', image: 'AAA', hash: H('d') }); assert.equal(st, 200, '다른 사람은 따로 셈');
console.log('PROFILE SCAN TESTS PASSED');
