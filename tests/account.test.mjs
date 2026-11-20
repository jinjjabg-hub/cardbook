// 회원 탈퇴 /account/delete — 서버만 쓰는 기록을 정리하는지 (fetch 모의)
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const B = 'projects/mandu-e7c3c/databases/(default)/documents';
// 컬렉션별 문서: name → fields
let docs = {};
const put = (path, f) => { docs[`${B}/${path}`] = f; };
put('cardSaves/u1_u2', { owner: 'u1', saver: 'u2' }); put('cardSaves/u3_u1', { owner: 'u3', saver: 'u1' }); put('cardSaves/u3_u4', { owner: 'u3', saver: 'u4' });
put('rewardSaves/u1_u2', { owner: 'u1', saver: 'u2' }); put('rewardSaves/u5_u1', { owner: 'u5', saver: 'u1' });
put('dicaClaims/a.com%2Fx', { uid: 'u1', url: 'https://a.com/x' }); put('dicaClaims/b.com%2Fy', { uid: 'u9', url: 'https://b.com/y' });
put('card_updates/k1', { ownerUid: 'u1' }); put('card_updates/k2', { ownerUid: 'u9' });
for (let i = 0; i < 520; i++) put(`cardSaves/u1_s${i}`, { owner: 'u1', saver: 's' + i }); // 500개 넘는 경우(여러 번 조회)
let commits = 0;
globalThis.fetch = async (url, opt = {}) => {
  const body = opt.body && opt.body.startsWith?.('{') ? JSON.parse(opt.body) : null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('identitytoolkit')) return J(body.idToken ? { users: [{ localId: body.idToken }] } : {});
  if (url.includes('oauth2.googleapis.com')) return J({ access_token: 't', expires_in: 3600 });
  if (url.endsWith(':runQuery')) {
    const q = body.structuredQuery, col = q.from[0].collectionId, f = q.where.fieldFilter;
    const hit = Object.entries(docs).filter(([n, d]) => n.startsWith(`${B}/${col}/`) && d[f.field.fieldPath] === f.value.stringValue).slice(0, q.limit);
    return J(hit.length ? hit.map(([n]) => ({ document: { name: n } })) : [{ readTime: 'x' }]);
  }
  if (url.endsWith(':commit')) {
    commits++; assert.ok(body.writes.length <= 500, 'commit 500개 제한');
    for (const w of body.writes) {
      if (w.delete) delete docs[w.delete];
      else if (w.update) docs[w.update.name] = { ...docs[w.update.name], uid: w.update.fields.uid.stringValue };
    }
    return J({});
  }
  throw new Error('unexpected fetch ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async body => { const r = await worker.fetch(new Request('https://w/account/delete', { method: 'POST', body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };

let [st, r] = await call({});
assert.equal(st, 500); assert.ok(r.error, '로그인 없이는 거부');
[st, r] = await call({ idToken: 'u1' });
assert.equal(st, 200); assert.equal(r.ok, true);
const left = Object.keys(docs).map(n => n.slice(B.length + 1)).sort();
assert.deepEqual(left, ['cardSaves/u3_u4', 'card_updates/k2', 'dicaClaims/a.com%2Fx', 'dicaClaims/b.com%2Fy']);
assert.equal(docs[`${B}/dicaClaims/a.com%2Fx`].uid, '', '선점 기록은 남기고 uid만 비움');
assert.equal(docs[`${B}/dicaClaims/a.com%2Fx`].url, 'https://a.com/x');
assert.equal(docs[`${B}/dicaClaims/b.com%2Fy`].uid, 'u9', '남의 기록은 그대로');
// 다시 불러도 안전
[st, r] = await call({ idToken: 'u1' }); assert.equal(r.ok, true); assert.equal(r.deleted, 0);
console.log('ALL ACCOUNT TESTS PASSED');
