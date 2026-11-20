// BNI 명부 "+ 담기" /bni/member — 로그인 필요, 한 명씩, 하루 한도(같은 멤버 다시 담기는 안 셈) (fetch·KV 모의)
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kv = new Map();
const env = { FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, v); } } };
const S = v => ({ stringValue: v });
globalThis.fetch = async (url, opt = {}) => {
  const body = opt.body && opt.body.startsWith?.('{') ? JSON.parse(opt.body) : null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('identitytoolkit')) return J(body.idToken ? { users: [{ localId: body.idToken }] } : {});
  if (url.includes('oauth2.googleapis.com')) return J({ access_token: 't', expires_in: 3600 });
  const m = url.match(/documents\/bni_members\/([^/?]+)$/);
  if (m) return /^m\d+$/.test(m[1]) ? J({ fields: { name: S('홍길동' + m[1]), phone: S('010-1234-5678'), email: S('a@b.c'), chapter: S('파이오니어'), secret: S('x') } }) : J({}, 404);
  throw new Error('unexpected fetch ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async body => { const r = await worker.fetch(new Request('https://w/bni/member', { method: 'POST', body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };

let [st, r] = await call({ id: 'm1' }); assert.equal(st, 500, '로그인 없이는 거부');
[st, r] = await call({ idToken: 'u1', id: '../users/u2' }); assert.equal(st, 400, '경로 조작 거부');
[st, r] = await call({ idToken: 'u1', id: 'nope' }); assert.equal(st, 404);
[st, r] = await call({ idToken: 'u1', id: 'm1' });
assert.equal(st, 200); assert.equal(r.phone, '010-1234-5678'); assert.equal(r.email, 'a@b.c'); assert.equal(r.secret, undefined, '정해진 필드만');
for (let i = 2; i <= 50; i++) { [st] = await call({ idToken: 'u1', id: 'm' + i }); assert.equal(st, 200); }
[st, r] = await call({ idToken: 'u1', id: 'm51' }); assert.equal(st, 429, '하루 50명 한도'); assert.ok(r.limited);
[st] = await call({ idToken: 'u1', id: 'm7' }); assert.equal(st, 200, '이미 담은 멤버는 한도와 상관없이');
[st] = await call({ idToken: 'u2', id: 'm51' }); assert.equal(st, 200, '다른 사람은 따로 셈');
console.log('ALL BNI MEMBER TESTS PASSED');
