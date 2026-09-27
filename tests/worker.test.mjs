import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ANTHROPIC_API_KEY: 'k', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
let db = {}, writes = [], claims = new Set(), models = [];
globalThis.fetch = async (url, opt = {}) => {
  const body = opt.body && typeof opt.body === 'string' && opt.body.startsWith('{') ? JSON.parse(opt.body) : null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('identitytoolkit')) return J({ users: [{ localId: body.idToken }] });
  if (url.includes('oauth2.googleapis.com')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('api.anthropic.com')) {
    models.push(body.model);
    const txt = body.messages[0].content[0].text;
    const out = txt.includes('번역') ? { en: { title: 'Broker', company: 'Gildong', slogan: 'S', work: 'W', help: 'H', referral: 'R' }, ja: { title: 'ブローカー', company: 'ギルドン', slogan: 'S', work: 'W', help: 'H', referral: 'R' } } : { slogan: '첫 상가를 함께 찾습니다', work: '상가 매매·임대 중개', help: '처음 가게 여는 사장님', referral: '이전 고민 사장님' };
    return J({ content: [{ type: 'text', text: JSON.stringify(out) }] });
  }
  if (url.includes(':commit')) {
    for (const w of body.writes) {
      const name = w.update?.name || '';
      if (name.includes('/dicaClaims/')) { if (claims.has(name)) return new Response('ALREADY_EXISTS', { status: 409 }); claims.add(name); }
    }
    writes.push(...body.writes); return J({});
  }
  const m = url.match(/documents\/(autocards|users)\/([^/?]+)$/);
  if (m) { const d = db[m[1] + '/' + m[2]]; return d ? J({ fields: d }) : new Response('{}', { status: 404 }); }
  throw new Error('unexpected fetch ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async (path, body) => (await worker.fetch(new Request('https://w' + path, { method: 'POST', body: JSON.stringify(body) }), env)).json();

// 1) draft
let r = await call('/autocard/draft', { lang: 'ko', answers: { work: '상가 중개' } });
assert.equal(r.slogan, '첫 상가를 함께 찾습니다'); assert.equal(r.work, '상가 매매·임대 중개'); assert.equal(r.help, '처음 가게 여는 사장님'); assert.equal(models[0], 'claude-haiku-4-5-20251001');
r = await call('/autocard/draft', { lang: 'ko', answers: {} }); assert.ok(r.error);
// 2) translate: from 제외, 요청 언어만
r = await call('/autocard/translate', { from: 'ko', to: ['en', 'ja', 'ko', 'xx'], texts: { title: '중개사', slogan: 's' } });
assert.deepEqual(Object.keys(r).sort(), ['en', 'ja']); assert.equal(r.en.work, 'W'); assert.equal(r.ja.help, 'H');
// 3) 자동 명함 보너스
const AC = 'https://jinjjabg-hub.github.io/cardbook/autocard/c/?id=abcdefghij1234567890';
db['autocards/abcdefghij1234567890'] = { status: { stringValue: 'published' }, ownerUid: { stringValue: 'u1' } };
db['users/u1'] = { credits: { integerValue: '50' } };
r = await call('/credits/dica-bonus', { idToken: 'u2', url: AC }); assert.equal(r.granted, false, 'not owner'); console.log('not owner →', r.reason);
writes = [];
r = await call('/credits/dica-bonus', { idToken: 'u1', url: AC }); assert.equal(r.granted, true); assert.equal(r.bonus, 50); assert.equal(r.credits, 100);
assert.ok(writes.some(w => w.update?.fields?.autocard50Granted?.booleanValue === true));
assert.ok(!writes.some(w => w.update?.name?.includes('dicaClaims')), 'autocard must not use DiCA claims');
db['users/u1'] = { credits: { integerValue: '100' }, autocard50Granted: { booleanValue: true } };
r = await call('/credits/dica-bonus', { idToken: 'u1', url: AC }); assert.equal(r.granted, false); console.log('twice →', r.reason);
db['autocards/abcdefghij1234567890'].status.stringValue = 'pending';
db['users/u3'] = {}; db['autocards/abcdefghij1234567890'].ownerUid.stringValue = 'u3';
r = await call('/credits/dica-bonus', { idToken: 'u3', url: AC }); assert.equal(r.granted, false); console.log('pending →', r.reason);
// 4) DiCA 링크는 기존대로 500장 (자동 명함 받은 사람도 DiCA 보너스 별도 1회)
db['users/u1'] = { credits: { integerValue: '100' }, autocard50Granted: { booleanValue: true } };
r = await call('/credits/dica-bonus', { idToken: 'u1', url: 'https://jinjjabg-hub.github.io/NAMECARD/이서원/' });
assert.equal(r.granted, true); assert.equal(r.bonus, 500); assert.equal(r.credits, 600);
console.log('ALL WORKER TESTS PASSED');
