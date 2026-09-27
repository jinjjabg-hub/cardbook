import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { TOSS_SECRET_KEY: 'test_sk', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const enc = v => Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : typeof v === 'number' ? { integerValue: String(v) } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } } : { stringValue: v };
let cards = {}, pays = new Set(), commits = [], toss = [];
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('tosspayments')) { const b = JSON.parse(opt.body); toss.push(b); return b.paymentKey === 'dup' ? J({ code: 'ALREADY_PROCESSED_PAYMENT', message: 'x' }, 400) : b.paymentKey === 'bad' ? J({ code: 'REJECT', message: '카드 거절' }, 400) : J({ method: '카드' }); }
  if (url.includes(':commit')) { const b = JSON.parse(opt.body); commits.push(b); const n = b.writes[0].update.name.split('/').pop(); if (pays.has(n)) return new Response('ALREADY_EXISTS', { status: 409 }); pays.add(n); return J({}); }
  let m = url.match(/autocardPayments\/(.+)$/); if (m) return pays.has(m[1]) ? J({ fields: {} }) : new Response('{}', { status: 404 });
  m = url.match(/autocards\/([^/?]+)$/); if (m) { const c = cards[m[1]]; return c ? J({ fields: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, enc(v)])) }) : new Response('{}', { status: 404 }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const pay = async b => { const r = await worker.fetch(new Request('https://w/autocard/pay/confirm', { method: 'POST', body: JSON.stringify(b) }), env); return [r.status, await r.json()]; };
cards.card0000001 = { status: 'draft', langs: ['ko', 'en'], ownerUid: 'u1' };
// 1) 금액 조작 거부(서버 계산 10,900)
let [st, r] = await pay({ paymentKey: 'k1', orderId: 'ac_card0000001_pub_1727300000000', amount: 5900 }); assert.equal(st, 400); assert.equal(r.error, '금액 불일치'); assert.equal(toss.length, 0);
// 2) 정상 결제 → 발행
[st, r] = await pay({ paymentKey: 'k1', orderId: 'ac_card0000001_pub_1727300000000', amount: 10900 });
assert.equal(st, 200); assert.equal(r.ok, true);
const w = commits.at(-1).writes; assert.deepEqual(w[0].currentDocument, { exists: false });
assert.equal(w[1].update.fields.status.stringValue, 'published'); assert.equal(w[1].update.fields.price.integerValue, '10900');
// 3) 새로고침(같은 주문) → 중복 처리, 토스 재호출 없음
const tn = toss.length; [st, r] = await pay({ paymentKey: 'k1', orderId: 'ac_card0000001_pub_1727300000000', amount: 10900 }); assert.equal(r.duplicate, true); assert.equal(toss.length, tn);
// 4) 카드 거절
cards.card0000002 = { status: 'draft', langs: ['ko'], ownerUid: 'u1' };
[st, r] = await pay({ paymentKey: 'bad', orderId: 'ac_card0000002_pub_1727300000001', amount: 5900 }); assert.equal(st, 400); assert.equal(r.error, '카드 거절');
// 5) 언어 추가: ko → ko,en,ja (+10,000)
cards.card0000003 = { status: 'published', langs: ['ko'], ownerUid: 'u1', upgrade: { langs: ['ko', 'en', 'ja'] } };
[st, r] = await pay({ paymentKey: 'k3', orderId: 'ac_card0000003_up_1727300000002', amount: 5000 }); assert.equal(r.error, '금액 불일치');
[st, r] = await pay({ paymentKey: 'k3', orderId: 'ac_card0000003_up_1727300000002', amount: 10000 }); assert.equal(r.ok, true); assert.deepEqual(r.langs, ['ko', 'en', 'ja']);
const u = commits.at(-1).writes[1]; assert.deepEqual(u.updateMask.fieldPaths, ['langs', 'price', 'upgrade']); assert.equal(u.update.fields.price.integerValue, '15900');
// 6) 기존 언어를 빼는 요청·5개 초과는 거부
cards.card0000004 = { status: 'published', langs: ['ko', 'en'], upgrade: { langs: ['ko', 'ja'] } };
[st, r] = await pay({ paymentKey: 'k4', orderId: 'ac_card0000004_up_1727300000003', amount: 0 }); assert.equal(st, 400);
// 7) 이미 발행된 명함에 발행 결제 거부, 이상한 주문번호 거부
[st, r] = await pay({ paymentKey: 'k5', orderId: 'ac_card0000003_pub_1727300000004', amount: 5900 }); assert.equal(st, 400);
[st, r] = await pay({ paymentKey: 'k5', orderId: 'cb_x_p1_1', amount: 5900 }); assert.equal(st, 400);
// 8) 토스가 "이미 처리됨"이라고 해도(결제 후 기록 전에 끊긴 경우) 기록·발행 진행
cards.card0000005 = { status: 'draft', langs: ['ko'] };
[st, r] = await pay({ paymentKey: 'dup', orderId: 'ac_card0000005_pub_1727300000005', amount: 5900 }); assert.equal(r.ok, true);
console.log('PAY TESTS PASSED');
