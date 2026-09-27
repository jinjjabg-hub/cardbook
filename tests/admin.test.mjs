import assert from 'assert';
const kv = new Map();
const env = { ANTHROPIC_API_KEY: 'k', OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => kv.set(k, v) } };
// 가짜 Google 조회: 토큰별로 어떤 계정인지
const ACCOUNTS = { 'tok-admin': { email: 'jinjjabg@gmail.com', emailVerified: true }, 'tok-ADMIN-case': { email: 'Jinjjabg@Gmail.com', emailVerified: true },
  'tok-other': { email: 'someone@gmail.com', emailVerified: true }, 'tok-unverified': { email: 'jinjjabg@gmail.com', emailVerified: false } };
globalThis.fetch = async (url, opt) => {
  if (url.includes('identitytoolkit')) { const t = JSON.parse(opt.body).idToken; return new Response(JSON.stringify(ACCOUNTS[t] ? { users: [ACCOUNTS[t]] } : { error: { message: 'INVALID_ID_TOKEN' } })); }
  return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"name":"x"}' }] }));
};
const w = (await import('./worker.mjs')).default; let h = 0;
const run = async (idToken, dev, times) => { const codes = []; for (let i = 0; i < times; i++) { const r = await w.fetch(new Request('https://w/autocard/import', { method: 'POST', headers: { 'CF-Connecting-IP': 'ip-' + dev }, body: JSON.stringify({ image: 'x', hash: String(h++).padStart(64, 'c'), deviceId: dev, idToken }) }), env); codes.push(r.status); } return codes; };
const count = a => a.filter(c => c === 200).length;
assert.equal(count(await run('tok-admin', 'dev-admin-1', 12)), 12, '관리자 12번 모두 통과');
assert.equal(count(await run('tok-ADMIN-case', 'dev-admin-2', 8)), 8, '대소문자 달라도 관리자');
assert.equal(count(await run('tok-other', 'dev-other', 8)), 5, '다른 계정은 5번');
assert.equal(count(await run('tok-unverified', 'dev-unv', 8)), 5, '인증 안 된 이메일은 관리자 아님');
assert.equal(count(await run('forged-token', 'dev-forged', 8)), 5, '가짜 토큰은 관리자 아님');
assert.equal(count(await run(undefined, 'dev-anon', 8)), 5, '로그인 안 하면 5번');
console.log('ADMIN LIMIT TESTS PASSED');
