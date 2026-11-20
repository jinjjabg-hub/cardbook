// 크레딧 규칙: 유료분 30일 소멸(이월 불가) · 무상분 소멸 없음 · 차감 순서 · 예전 문서 변환 · 저장 리워드 · 동시 요청(스캔 중 결제)
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ANTHROPIC_API_KEY: 'k', PORTONE_API_SECRET: 'ps', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const docs = {};   // 'users/u1' → { fields(plain), updateTime }
let tick = 0;
// 포트원 V2 결제 건(모의): paymentId → { total, uid, packId, status, channel }
const portone = {};
const paid = (paymentId, uid, packId, total, extra = {}) => { portone[paymentId] = { status: 'PAID', total, uid, packId, ...extra }; return paymentId; };
// 동시성 시험용 훅: Claude 응답 직전(onClaude)·커밋 직전(onCommit)에 다른 요청을 끼워 넣는다
let onClaude = null, onCommit = null, claudeFail = false, claudeCalls = 0;
const plain = v => v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.stringValue ?? v.timestampValue;
const encF = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }]));
const monthKey = () => { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('identitytoolkit')) return J({ users: [{ localId: JSON.parse(opt.body).idToken }] });
  if (url.startsWith('https://api.portone.io/payments/')) {
    assert.equal(opt.headers.Authorization, 'PortOne ps');
    const id = decodeURIComponent(url.split('/payments/')[1].split('?')[0]), p = portone[id];
    if (!p) return J({ type: 'PAYMENT_NOT_FOUND', message: 'not found' }, 404);
    return J({ id, status: p.status, storeId: 'store-81501bc3-d46a-4bbf-8c19-c1d2265dfa2e', amount: { total: p.total }, currency: 'KRW', customData: JSON.stringify({ uid: p.uid, packId: p.packId }), channel: p.channel || { type: 'LIVE' }, method: { type: 'CARD' }, pgTxId: 'tx_' + id });
  }
  if (url.includes('anthropic.com')) {
    claudeCalls++;
    if (onClaude) { const h = onClaude; onClaude = null; await h(); }
    if (claudeFail) return J({ error: { type: 'overloaded_error', message: 'busy' } }, 529);
    return J({ content: [{ type: 'text', text: '{"name":"홍길동"}' }] });
  }
  if (url.includes(':commit')) {
    if (onCommit) { const h = onCommit; onCommit = null; await h(); }
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
const pay = (idToken, paymentId) => call('/pay/confirm', { idToken, paymentId });

// 1) 새 사용자: 가입 50 + 이번 달 5 = 55
let r = await call('/credits/status', { idToken: 'u1' });
assert.equal(r.credits, 55); assert.equal(r.paid, 0); assert.equal(docs['users/u1'].fields.credits, 50);
// 2) 30장 1,000원 결제(포트원 V2: paymentId = cb_{pack}_{랜덤}) → 유료 묶음(30일 뒤 소멸)
const P1 = paid('cb_p30_aaaaaaaaaaaa1', 'u1', 'p30', 1000);
r = await pay('u1', P1);
assert.equal(r.ok, true); const days = (r.expiresAt - Date.now()) / 86400000; assert.ok(days > 29.9 && days <= 30);
assert.equal(docs['payments/' + P1].fields.uid, 'u1'); assert.equal(docs['users/u1'].fields.paidTotal, 30);
r = await call('/credits/status', { idToken: 'u1' }); assert.equal(r.credits, 85); assert.equal(r.paid, 30);
// 3) 1,000장 팩은 없어짐, 금액 조작·형식 오류·남의 결제·미완료·테스트 결제 거부
r = await pay('u1', paid('cb_p1000_aaaaaaaaaaaa2', 'u1', 'p1000', 20000)); assert.equal(r.error, '없는 상품');
r = await pay('u1', paid('cb_p100_aaaaaaaaaaaa3', 'u1', 'p100', 1000)); assert.equal(r.error, '금액 불일치');
r = await pay('u1', 'cb_u1_p30_1'); assert.equal(r.error, '주문번호 형식 오류');   // 옛 토스 주문번호 형식
r = await pay('u1', paid('cb_p30_aaaaaaaaaaaa4', 'u2', 'p30', 1000)); assert.equal(r.error, '다른 계정의 결제예요');
r = await pay('u1', paid('cb_p30_aaaaaaaaaaaa5', 'u1', 'p30', 1000, { status: 'READY' })); assert.equal(r.code, 'NOT_PAID');
r = await pay('u1', paid('cb_p30_aaaaaaaaaaaa6', 'u1', 'p30', 1000, { channel: { type: 'TEST' } })); assert.equal(r.code, 'TEST_PAYMENT');
r = await pay('u1', 'cb_p30_aaaaaaaaaaaa7'); assert.equal(r.error, '결제 내역을 찾을 수 없어요');
assert.equal(lots('u1').length, 1, '거부된 결제는 충전 없음');
// 4) 같은 결제 새로고침 → 중복, 묶음 늘지 않음
r = await pay('u1', P1); assert.equal(r.duplicate, true); assert.equal(lots('u1').length, 1); assert.equal(docs['users/u1'].fields.paidTotal, 30);
// 5) 30일 지난 유료분은 소멸(이월 불가), 무상분은 그대로
docs['users/u1'].fields.paidLots = JSON.stringify([{ n: 30, exp: Date.now() - 1000, o: 'old' }, { n: 100, exp: Date.now() + 5 * 86400000, o: 'new' }]);
r = await call('/credits/status', { idToken: 'u1' }); assert.equal(r.paid, 100); assert.equal(r.credits, 155); assert.equal(lots('u1').length, 1);
// 6) 차감 순서(실제 스캔 경로): 이번 달 무료분 → 유료분(소멸 임박순) → 무상분
docs['users/u1'].fields.paidLots = JSON.stringify([{ n: 3, exp: Date.now() + 9 * 86400000, o: 'b' }, { n: 2, exp: Date.now() + 86400000, o: 'a' }]);
docs['users/u1'].fields.freeRemain = 1; docs['users/u1'].fields.credits = 50;
const scan = () => call('/ocr-image', { idToken: 'u1', image: 'eA==' });
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

// 9) 동시성: 스캔(AI 호출 중)에 결제가 끼어들어도 유료 묶음이 남는다 (예전엔 스캔이 읽어 둔 상태로 덮어써 묶음이 사라졌음)
docs['users/c1'] = { fields: { credits: 50, creditsV2: true, freeMonth: monthKey(), freeRemain: 0, paidLots: '[]' }, updateTime: 'c0' };
const PC = paid('cb_p100_cccccccccccc1', 'c1', 'p100', 3000);
onClaude = async () => { const p = await pay('c1', PC); assert.equal(p.ok, true); };
r = await call('/ocr-image', { idToken: 'c1', image: 'eQ==' });
assert.equal(r.name, '홍길동'); assert.equal(onClaude, null, '결제가 실제로 스캔 도중에 끼어듦');
assert.deepEqual(lots('c1').map(l => l.o + ':' + l.n), [PC + ':100'], '결제 묶음이 그대로 남음');
assert.equal(docs['users/c1'].fields.credits, 49, '스캔 1장은 무상분에서 차감');
assert.equal(docs['users/c1'].fields.scanTotal, 1);
// 10) 동시성: 차감을 읽은 직후·쓰기 직전에 결제가 커밋되면 → 조건부 쓰기 실패 → 다시 읽어 차감(둘 다 반영)
const PC2 = paid('cb_p30_cccccccccccc2', 'c1', 'p30', 1000);
onCommit = async () => { const p = await pay('c1', PC2); assert.equal(p.ok, true); };
r = await call('/ocr-image', { idToken: 'c1', image: 'eg==' });
assert.equal(onCommit, null);
assert.deepEqual(lots('c1').map(l => l.o + ':' + l.n).sort(), [PC + ':99', PC2 + ':30'].sort(), '두 번째 결제도 남고, 1장은 정확히 한 번만 차감(유료분 소멸 임박순)');
assert.equal(docs['users/c1'].fields.credits, 49); assert.equal(r.creditsLeft, 49 + 99 + 30);
// 11) AI 호출이 실패하면 먼저 뺀 1장을 같은 묶음에 돌려준다(그사이 결제가 와도)
const before = JSON.stringify(lots('c1').map(l => l.o + ':' + l.n).sort());
const PC3 = paid('cb_p30_cccccccccccc3', 'c1', 'p30', 1000);
claudeFail = true; onClaude = async () => { await pay('c1', PC3); };
let res = await worker.fetch(new Request('https://w/ocr-image', { method: 'POST', body: JSON.stringify({ idToken: 'c1', image: 'ew==' }) }), env);
claudeFail = false;
assert.equal(res.status, 500); const body = await res.json();
assert.ok(!/overloaded|busy|claude/i.test(body.error), '내부 오류 내용은 응답에 노출하지 않음');
assert.deepEqual(lots('c1').map(l => l.o + ':' + l.n).sort(), [...JSON.parse(before), PC3 + ':30'].sort(), '환불 + 그사이 결제 모두 반영');
assert.equal(docs['users/c1'].fields.credits, 49); assert.equal(docs['users/c1'].fields.scanTotal, 2);
// 12) 차감 기록이 실패하면 AI를 부르지 않는다(무료 스캔 없음)
const calls = claudeCalls;
onCommit = async () => { throw new Error('firestore down'); };
res = await worker.fetch(new Request('https://w/ocr-image', { method: 'POST', body: JSON.stringify({ idToken: 'c1', image: 'fA==' }) }), env);
assert.equal(res.status, 500); assert.equal(claudeCalls, calls, 'AI 호출 없음');
// 13) 장수가 0이면 402, AI 호출 없음
docs['users/z1'] = { fields: { credits: 0, creditsV2: true, freeMonth: monthKey(), freeRemain: 0, paidLots: '[]' }, updateTime: 'z0' };
res = await worker.fetch(new Request('https://w/ocr-image', { method: 'POST', body: JSON.stringify({ idToken: 'z1', image: 'fQ==' }) }), env);
assert.equal(res.status, 402); assert.equal(claudeCalls, calls);
// 14) 이미지 검사: 너무 큼·base64 아님 → 400
res = await worker.fetch(new Request('https://w/ocr-image', { method: 'POST', body: JSON.stringify({ idToken: 'c1', image: 'A'.repeat(7_000_004) }) }), env); assert.equal(res.status, 400);
res = await worker.fetch(new Request('https://w/ocr-image', { method: 'POST', body: JSON.stringify({ idToken: 'c1', image: '!!!' }) }), env); assert.equal(res.status, 400);
// 15) 보너스는 동시에 두 번 눌러도 한 번만(플래그 확인이 조건부 쓰기 안에 있음)
docs['autocards/card0000009'] = { fields: { status: 'published', ownerUid: 'b1' }, updateTime: 'x' };
docs['users/b1'] = { fields: { credits: 50, creditsV2: true, freeMonth: monthKey(), freeRemain: 5, paidLots: '[]' }, updateTime: 'b0' };
const AC9 = 'https://jinjjabg-hub.github.io/autocard/c/?id=card0000009';
let second;
onCommit = async () => { second = await call('/credits/dica-bonus', { idToken: 'b1', url: AC9 }); };
const first = await call('/credits/dica-bonus', { idToken: 'b1', url: AC9 });
assert.deepEqual([first.granted, second.granted].sort(), [false, true]); assert.equal(docs['users/b1'].fields.credits, 100);
// 비즈홈 500장도 동시에 두 번 → 한 번만
const DICA = 'https://jinjjabg-hub.github.io/NAMECARD/kim/';
onCommit = async () => { second = await call('/credits/dica-bonus', { idToken: 'b1', url: DICA }); };
const f2 = await call('/credits/dica-bonus', { idToken: 'b1', url: DICA });
assert.deepEqual([f2.granted, second.granted].sort(), [false, true]); assert.equal(docs['users/b1'].fields.credits, 600);
// 다른 계정이 같은 링크 → 선점돼 있어 거부
r = await call('/credits/dica-bonus', { idToken: 'b2', url: DICA }); assert.equal(r.granted, false); assert.ok(/이미 다른 계정/.test(r.reason));
assert.equal(docs['users/b2'].fields.dica500Granted, undefined);
// 16) 결제도 동시에 두 개 → 두 묶음 다 남음
docs['users/d1'] = { fields: { credits: 50, creditsV2: true, freeMonth: monthKey(), freeRemain: 5, paidLots: '[]' }, updateTime: 'd0' };
const D1 = paid('cb_p30_dddddddddddd1', 'd1', 'p30', 1000), D2 = paid('cb_p100_dddddddddddd2', 'd1', 'p100', 3000);
onCommit = async () => { await pay('d1', D2); };
r = await pay('d1', D1); assert.equal(r.ok, true);
assert.deepEqual(lots('d1').map(l => l.o).sort(), [D1, D2].sort()); assert.equal(docs['users/d1'].fields.paidTotal, 130);
console.log('CREDIT TESTS PASSED');
