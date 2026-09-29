// 크레딧 규칙: 유료분 30일 소멸(이월 불가) · 무상분 소멸 없음 · 차감 순서 · 예전 문서 변환 · 저장 리워드
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ANTHROPIC_API_KEY: 'k', TOSS_SECRET_KEY: 'test_sk', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const docs = {};   // 'users/u1' → { fields(plain), updateTime }
let tick = 0;
const plain = v => v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.stringValue ?? v.timestampValue;
const encF = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }]));
const monthKey = () => { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('identitytoolkit')) return J({ users: [{ localId: JSON.parse(opt.body).idToken }] });
  if (url.includes('tosspayments')) return J({ method: '카드' });
  if (url.includes('anthropic.com')) return J({ content: [{ type: 'text', text: '{"name":"홍길동"}' }] });
  if (url.includes(':commit')) {
    const { writes } = JSON.parse(opt.body);
    for (const w of writes) {   // 조건 먼저 전부 확인(원자성)
      const name = (w.update?.name || w.transform?.document).split('/documents/')[1];
      if (w.currentDocument?.exists === false && docs[name]) return new Response('ALREADY_EXISTS', { status: 409 });
      if (w.currentDocument?.updateTime && docs[name]?.updateTime !== w.currentDocument.updateTime) return new Response('FAILED_PRECONDITION', { status: 400 });
    }
    for (const w of writes) {
      if (w.update) { const name = w.update.name.split('/documents/')[1]; const d = docs[name] || (docs[name] = { fields: {} });
        for (const [k, v] of Object.entries(w.update.fields)) if (!w.updateMask || w.updateMask.fieldPaths.includes(k)) d.fields[k] = plain(v); d.updateTime = 't' + (++tick); }
      if (w.transform) { const name = w.transform.document.split('/documents/')[1]; const d = docs[name] || (docs[name] = { fields: {} });
        for (const t of w.transform.fieldTransforms) d.fields[t.fieldPath] = (d.fields[t.fieldPath] || 0) + Number(t.increment.integerValue); d.updateTime = 't' + (++tick); }
    }
    return J({});
  }
  const m = url.match(/documents\/(.+)$/);
  if (m) { const name = decodeURIComponent(m[1]); const d = docs[name]; return d ? J({ fields: encF(d.fields), updateTime: d.updateTime }) : new Response('{}', { status: 404 }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async (path, b) => { const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', body: JSON.stringify(b) }), env); return r.json(); };
const lots = uid => JSON.parse(docs['users/' + uid].fields.paidLots || '[]');

// 1) 새 사용자: 가입 50 + 이번 달 5 = 55
let r = await call('/credits/status', { idToken: 'u1' });
assert.equal(r.credits, 55); assert.equal(r.paid, 0); assert.equal(docs['users/u1'].fields.credits, 50);
// 2) 30장 1,000원 결제 → 유료 묶음(30일 뒤 소멸)
r = await call('/pay/confirm', { paymentKey: 'k', orderId: 'cb_u1_p30_1', amount: 1000 });
assert.equal(r.ok, true); const days = (r.expiresAt - Date.now()) / 86400000; assert.ok(days > 29.9 && days <= 30);
r = await call('/credits/status', { idToken: 'u1' }); assert.equal(r.credits, 85); assert.equal(r.paid, 30);
// 3) 1,000장 팩은 없어짐, 금액 조작 거부
r = await call('/pay/confirm', { paymentKey: 'k', orderId: 'cb_u1_p1000_2', amount: 20000 }); assert.equal(r.error, '없는 상품');
r = await call('/pay/confirm', { paymentKey: 'k', orderId: 'cb_u1_p100_3', amount: 1000 }); assert.equal(r.error, '금액 불일치');
// 4) 같은 주문 새로고침 → 중복, 묶음 늘지 않음
r = await call('/pay/confirm', { paymentKey: 'k', orderId: 'cb_u1_p30_1', amount: 1000 }); assert.equal(r.duplicate, true); assert.equal(lots('u1').length, 1);
// 5) 30일 지난 유료분은 소멸(이월 불가), 무상분은 그대로
docs['users/u1'].fields.paidLots = JSON.stringify([{ n: 30, exp: Date.now() - 1000, o: 'old' }, { n: 100, exp: Date.now() + 5 * 86400000, o: 'new' }]);
r = await call('/credits/status', { idToken: 'u1' }); assert.equal(r.paid, 100); assert.equal(r.credits, 155); assert.equal(lots('u1').length, 1);
// 6) 차감 순서(실제 스캔 경로): 이번 달 무료분 → 유료분(소멸 임박순) → 무상분
docs['users/u1'].fields.paidLots = JSON.stringify([{ n: 3, exp: Date.now() + 9 * 86400000, o: 'b' }, { n: 2, exp: Date.now() + 86400000, o: 'a' }]);
docs['users/u1'].fields.freeRemain = 1; docs['users/u1'].fields.credits = 50;
const scan = () => call('/ocr-image', { idToken: 'u1', image: 'x' });
const snap = () => { const d = docs['users/u1'].fields; return [d.freeRemain, lots('u1').map(l => l.o + l.n).join(','), d.credits]; };
await scan(); assert.deepEqual(snap(), [0, 'a2,b3', 50]);   // 월 무료 먼저
await scan(); assert.deepEqual(snap(), [0, 'a1,b3', 50]);   // 곧 소멸할 유료분 먼저
await scan(); await scan(); await scan(); await scan(); assert.deepEqual(snap(), [0, '', 50]);
r = await scan(); assert.deepEqual(snap(), [0, '', 49]); assert.equal(r.creditsLeft, 49);   // 마지막에 무상분
// 7) 예전 문서 변환: credits 에 이번 달 무료 5가 섞여 있던 문서 → 무상 60 + 월 5 로 분리(총합 유지)
docs['users/u2'] = { fields: { credits: 65, freeMonth: monthKey(), freeRemain: 5 }, updateTime: 'x' };
r = await call('/credits/status', { idToken: 'u2' }); assert.equal(r.credits, 65); assert.equal(docs['users/u2'].fields.credits, 60); assert.equal(docs['users/u2'].fields.creditsV2, true);
// 지난달 문서 → 지난달 무료분은 빠지고 이번 달 5가 새로
docs['users/u3'] = { fields: { credits: 55, freeMonth: '2000-01', freeRemain: 5 }, updateTime: 'x' };
r = await call('/credits/status', { idToken: 'u3' }); assert.equal(r.credits, 55); assert.equal(docs['users/u3'].fields.credits, 50);
// 8) 저장 리워드: 발행된 디지털 명함을 다른 사람이 저장 → 주인 +5(무상), 같은 사람 두 번은 1번만, 본인 저장은 없음
docs['autocards/card0000001'] = { fields: { status: 'published', ownerUid: 'u2' }, updateTime: 'x' };
const URL1 = 'https://jinjjabg-hub.github.io/autocard/c/?id=card0000001';
r = await call('/credits/save-reward', { idToken: 'u9', url: URL1 }); assert.equal(r.granted, true);
assert.equal(docs['users/u2'].fields.credits, 65);
r = await call('/credits/save-reward', { idToken: 'u9', url: URL1 }); assert.equal(r.granted, false);
r = await call('/credits/save-reward', { idToken: 'u2', url: URL1 }); assert.equal(r.granted, false);
// 비즈홈(본인 등록 기록) 주인에게도 지급, 다른 사이트 주소는 무시
docs['dicaClaims/' + encodeURIComponent('jinjjabg-hub.github.io/namecard/hong')] = { fields: { uid: 'u3' }, updateTime: 'x' };
r = await call('/credits/save-reward', { idToken: 'u9', url: 'https://jinjjabg-hub.github.io/NAMECARD/hong/' }); assert.equal(r.granted, true);
r = await call('/credits/save-reward', { idToken: 'u9', url: 'https://evil.com/?id=card0000001' }); assert.equal(r.granted, false);
// 한 달 최대 50장
for (let i = 0; i < 12; i++) await call('/credits/save-reward', { idToken: 's' + i, url: URL1 });
assert.equal(docs['users/u2'].fields.rewardCount, 50); assert.equal(docs['users/u2'].fields.credits, 60 + 50);
console.log('CREDIT TESTS PASSED');
