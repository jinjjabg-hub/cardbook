// 위아래 확인(/orient): Haiku 5.5 먼저(effort low), 로그인 필요, 장수 차감 없음, 같은 사진은 캐시
import assert from 'assert';
const kv = new Map();
const env = { ANTHROPIC_API_KEY: 'k', OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => kv.set(k, v) } };
const calls = []; let answer = '{"upsideDown": true}';
globalThis.fetch = async (url, opt) => {
  if (url.includes('identitytoolkit')) { const t = JSON.parse(opt.body).idToken; return new Response(JSON.stringify(t === 'ok' ? { users: [{ localId: 'u1' }] } : { error: {} })); }
  if (url.includes('anthropic.com')) { calls.push(JSON.parse(opt.body)); return new Response(JSON.stringify({ content: [{ type: 'text', text: answer }] })); }
  if (url.includes('firestore') || url.includes('oauth2')) throw new Error('장수 차감·기록을 하면 안 됨: ' + url);
  return new Response('{}');
};
const w = (await import('./worker.mjs')).default;
const post = body => w.fetch(new Request('https://w/orient', { method: 'POST', body: JSON.stringify(body) }), env);
const h = 'a'.repeat(64);
let r = await post({ image: 'x', hash: h, idToken: 'ok' });
assert.equal(r.status, 200); assert.deepEqual(await r.json(), { upsideDown: true });
assert.equal(calls[0].model, 'claude-haiku-5-5', 'Haiku 5.5 먼저'); assert.equal(calls[0].output_config.effort, 'low');
answer = '{"upsideDown": false}';
r = await post({ image: 'x', hash: h, idToken: 'ok' }); assert.equal((await r.json()).upsideDown, true, '같은 사진은 캐시'); assert.equal(calls.length, 1);
r = await post({ image: 'y', hash: 'b'.repeat(64), idToken: 'ok' }); assert.equal((await r.json()).upsideDown, false);
answer = 'no json here'; r = await post({ image: 'z', idToken: 'ok' }); assert.equal(r.status, 500, 'JSON 아니면 에러(앱은 그대로 진행)');
r = await post({ image: 'x', idToken: 'bad' }); assert.equal(r.status, 500, '로그인 필요');
r = await post({ image: 'x'.repeat(400_001), idToken: 'ok' }); assert.equal(r.status, 400, '큰 사진 거절');
console.log('ORIENT TESTS PASSED');
