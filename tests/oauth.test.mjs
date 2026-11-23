// 카카오·네이버 로그인: 키 있는 회사만 노출 · 돌아올 주소 허용 목록 · 인가 코드 확인 후 Firebase 커스텀 토큰 발급
import { generateKeyPairSync, createVerify } from 'crypto';
import assert from 'assert';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'sa@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const full = { FIREBASE_SA: JSON.stringify(SA), KAKAO_REST_API_KEY: 'kakao_rest', KAKAO_CLIENT_SECRET: 'kakao_sec', NAVER_CLIENT_ID: 'naver_id', NAVER_CLIENT_SECRET: 'naver_sec' };
const RU = 'https://cardbook.bizmy.net/', ST = 'abcdefghijklmnop1234';
const seen = [];
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  seen.push({ url, opt });
  if (url === 'https://kauth.kakao.com/oauth/token') {
    const f = new URLSearchParams(opt.body);
    assert.equal(f.get('client_id'), 'kakao_rest'); assert.equal(f.get('client_secret'), 'kakao_sec'); assert.equal(f.get('redirect_uri'), RU);
    return f.get('code') === 'good' ? J({ access_token: 'KAT' }) : J({ error: 'invalid_grant', error_description: 'authorization code not found' }, 400);
  }
  if (url === 'https://kapi.kakao.com/v2/user/me') { assert.equal(opt.headers.Authorization, 'Bearer KAT'); return J({ id: 123456789, kakao_account: { profile: { nickname: '김카카오' } } }); }
  if (url.startsWith('https://nid.naver.com/oauth2.0/token?')) {
    const f = new URL(url).searchParams;
    assert.equal(f.get('client_secret'), 'naver_sec'); assert.equal(f.get('state'), ST);
    return f.get('code') === 'good' ? J({ access_token: 'NAT' }) : J({ error: 'invalid_request', error_description: 'no valid data in session' });
  }
  if (url === 'https://openapi.naver.com/v1/nid/me') { assert.equal(opt.headers.Authorization, 'Bearer NAT'); return J({ resultcode: '00', response: { id: 'nAbC_9', name: '이네이버' } }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const req = async (path, body, env = full) => {
  const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', body: JSON.stringify(body || {}) }), env);
  return [r.status, await r.json()];
};
const decode = tok => {
  const [h, b, sig] = tok.split('.');
  const v = createVerify('RSA-SHA256'); v.update(h + '.' + b);
  assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')), '서비스 계정 키로 서명돼야 함');
  return [JSON.parse(Buffer.from(h, 'base64url')), JSON.parse(Buffer.from(b, 'base64url'))];
};

// 1) 키가 있는 회사만 목록에 — 키를 넣기 전엔 버튼이 안 보임
let [st, r] = await req('/auth/providers'); assert.deepEqual(r.providers, ['kakao', 'naver']);
[st, r] = await req('/auth/providers', null, { FIREBASE_SA: full.FIREBASE_SA }); assert.deepEqual(r.providers, []);
[st, r] = await req('/auth/providers', null, { ...full, NAVER_CLIENT_SECRET: '' }); assert.deepEqual(r.providers, ['kakao']);
// 키가 없는 회사는 시작도 거부
[st, r] = await req('/auth/start', { provider: 'naver', redirectUri: RU, state: ST }, { FIREBASE_SA: full.FIREBASE_SA, KAKAO_REST_API_KEY: 'k' }); assert.equal(st, 400);

// 2) 인가 주소: 허용된 돌아올 주소·state만
[st, r] = await req('/auth/start', { provider: 'kakao', redirectUri: RU, state: ST });
const ku = new URL(r.url); assert.equal(ku.origin + ku.pathname, 'https://kauth.kakao.com/oauth/authorize');
assert.equal(ku.searchParams.get('client_id'), 'kakao_rest'); assert.equal(ku.searchParams.get('redirect_uri'), RU); assert.equal(ku.searchParams.get('state'), ST);
assert.ok(!r.url.includes('kakao_sec'), '비밀키가 주소에 나가면 안 됨');
[st, r] = await req('/auth/start', { provider: 'naver', redirectUri: RU, state: ST });
const nu = new URL(r.url); assert.equal(nu.host, 'nid.naver.com'); assert.equal(nu.searchParams.get('client_id'), 'naver_id'); assert.ok(!r.url.includes('naver_sec'));
[st, r] = await req('/auth/start', { provider: 'kakao', redirectUri: 'https://evil.com/', state: ST }); assert.equal(st, 400); assert.equal(r.error, '허용되지 않은 주소예요');
[st, r] = await req('/auth/start', { provider: 'kakao', redirectUri: RU, state: 'short' }); assert.equal(st, 400);
[st, r] = await req('/auth/start', { provider: 'facebook', redirectUri: RU, state: ST }); assert.equal(st, 400);

// 3) 카카오 코드 → 커스텀 토큰 (uid=kakao_{회원번호}, 서비스 계정 서명, 1시간)
[st, r] = await req('/auth/oauth', { provider: 'kakao', code: 'good', redirectUri: RU, state: ST });
assert.equal(st, 200); assert.equal(r.name, '김카카오');
let [h, c] = decode(r.token);
assert.equal(h.alg, 'RS256'); assert.equal(c.uid, 'kakao_123456789'); assert.equal(c.iss, SA.client_email); assert.equal(c.sub, SA.client_email);
assert.equal(c.aud, 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit');
assert.equal(c.exp - c.iat, 3600); assert.deepEqual(c.claims, { provider: 'kakao' });
// 4) 네이버
[st, r] = await req('/auth/oauth', { provider: 'naver', code: 'good', redirectUri: RU, state: ST });
assert.equal(st, 200); assert.equal(r.name, '이네이버'); [, c] = decode(r.token); assert.equal(c.uid, 'naver_nAbC_9'); assert.deepEqual(c.claims, { provider: 'naver' });

// 5) 잘못된 코드·빈 코드·허용 안 된 주소는 토큰 없음
for (const p of ['kakao', 'naver']) {
  [st, r] = await req('/auth/oauth', { provider: p, code: 'forged', redirectUri: RU, state: ST }); assert.equal(st, 401); assert.ok(!r.token);
}
const n = seen.length;
[st, r] = await req('/auth/oauth', { provider: 'kakao', code: '', redirectUri: RU, state: ST }); assert.equal(st, 400);
[st, r] = await req('/auth/oauth', { provider: 'kakao', code: 'good', redirectUri: 'https://evil.com/', state: ST }); assert.equal(st, 400); assert.ok(!r.token);
assert.equal(seen.length, n, '거부된 요청은 카카오·네이버를 부르지 않음');
console.log('OAUTH TESTS PASSED');
