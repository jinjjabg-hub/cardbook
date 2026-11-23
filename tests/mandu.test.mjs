// 만두 연결: 동의한 만두 회원만, 카드 주인 계정 이메일 우선 → 명함 이메일 보조, 만두 ID만 돌려줌
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ANTHROPIC_API_KEY: 'k', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const cb = {   // 카드북 Firestore (users, autocards, dicaClaims)
  'users/owner1': { email: 'Kim@Example.com' },
  'users/owner2': { email: 'lee@example.com' },
  'autocards/abc123xyz': { status: 'published', ownerUid: 'owner1' },
  ['dicaClaims/' + encodeURIComponent('jinjjabg-hub.github.io/bni-giants/lee')]: { uid: 'owner2' },
};
const mandu = [   // 만두 회원 (동의한 회원만 cardbook_index 문서가 있음)
  { emailLower: 'kim@example.com', manduid: 'kimmandu', cardbookConsent: true },
  { emailLower: 'lee@example.com', manduid: 'leemandu', cardbookConsent: false },   // 동의 안 함
  { emailLower: 'park@example.com', manduid: 'parkmandu', cardbookConsent: true },
];
const enc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }]));
let manduCalls = 0;
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('accounts:signUp')) { manduCalls++; return J({ idToken: 'anon', expiresIn: '3600' }); }
  if (url.includes('accounts:lookup')) return J({ users: [{ localId: JSON.parse(opt.body).idToken }] });
  if (url.includes('projects/mandutok')) {
    // 만두 보안 규칙상 cardbook_index 문서를 이메일로 한 건씩 읽는 것만 허용된다(users 조회·목록 조회는 막힘)
    assert.ok(url.endsWith(':batchGet'), '만두는 cardbook_index batchGet만 허용: ' + url);
    const names = JSON.parse(opt.body).documents;
    assert.ok(names.length <= 100);
    return J(names.map(n => {
      assert.ok(n.startsWith('projects/mandutok/databases/(default)/documents/cardbook_index/'), '만두 users 문서를 읽으면 안 됨');
      const e = n.split('/').pop();
      const u = mandu.find(x => x.cardbookConsent === true && x.emailLower === e);   // 동의한 회원만 문서가 있음
      return u ? { found: { name: n, fields: enc({ uid: 'x', manduid: u.manduid }) } } : { missing: n };
    }));
  }
  const m = url.match(/documents\/(.+)$/);
  if (m) { const d = cb[decodeURIComponent(m[1])]; return d ? J({ fields: enc(d) }) : new Response('{}', { status: 404 }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async b => (await worker.fetch(new Request('https://w/mandu/match', { method: 'POST', body: JSON.stringify(b) }), env)).json();

const items = [
  { k: 'c1', url: 'https://jinjjabg-hub.github.io/autocard/c/?id=abc123xyz', email: '' },      // 주인 계정 이메일로 매칭
  { k: 'c2', url: 'https://jinjjabg-hub.github.io/bni-giants/lee', email: 'lee@example.com' },  // 동의 안 함 → 없음
  { k: 'c3', url: '', email: ' Park@Example.com ' },                                            // 명함 이메일로 매칭(대소문자·공백 무시)
  { k: 'c4', url: 'https://other.com/x', email: 'nobody@example.com' },                         // 회원 아님
  { k: 'c5', url: '', email: 'not-an-email' },                                                  // 이메일 형식 아님
];
let r = await call({ idToken: 'me', items });
assert.deepEqual(r.matches, { c1: 'kimmandu', c3: 'parkmandu' });
assert.ok(!JSON.stringify(r).includes('@'), '이메일이 응답에 새어 나가면 안 됨');
// 로그인 없이는 거부
const bad = await worker.fetch(new Request('https://w/mandu/match', { method: 'POST', body: JSON.stringify({ items }) }), env);
assert.notEqual(bad.status, 200);
// 익명 로그인 토큰은 재사용(1회만 발급)
await call({ idToken: 'me', items }); assert.equal(manduCalls, 1);
// 140개 이메일 → 100개씩 나눠 조회
const many = Array.from({ length: 140 }, (_, i) => ({ k: 'm' + i, url: '', email: `u${i}@example.com` }));
r = await call({ idToken: 'me', items: many }); assert.deepEqual(r.matches, {});
console.log('MANDU TESTS PASSED');
