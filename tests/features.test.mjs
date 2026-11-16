// 추가 기능 서버 쪽: 내 명함 통계(/card/stat, 저장 리워드 때 기록) · 문장 검색(/ai-search: 로그인 필수, 하루 30번)
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kv = new Map();
const env = { ANTHROPIC_API_KEY: 'k', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  OCR_CACHE: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
const docs = {}; let aiCalls = 0, lastPrompt = '', lastModel = '';
const plain = v => v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.stringValue ?? v.timestampValue;
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('identitytoolkit')) { const t = JSON.parse(opt.body).idToken; return J(t ? { users: [{ localId: t }] } : {}); }
  if (url.includes('anthropic.com')) { aiCalls++; const b = JSON.parse(opt.body); lastPrompt = b.messages[0].content[0].text; lastModel = b.model; return J({ content: [{ type: 'text', text: '{"matched":[2,"x",0,1.5],"summary":"부산 세무사"}' }] }); }
  if (url.includes(':commit')) {
    const { writes } = JSON.parse(opt.body);
    for (const w of writes) { const name = w.update.name.split('/documents/')[1]; if (w.currentDocument?.exists === false && docs[name]) return new Response('ALREADY_EXISTS', { status: 409 }); }
    for (const w of writes) { const name = w.update.name.split('/documents/')[1]; const d = docs[name] || (docs[name] = { fields: {} });
      for (const [k, v] of Object.entries(w.update.fields || {})) if (!w.updateMask || w.updateMask.fieldPaths.includes(k)) d.fields[k] = plain(v);
      for (const t of w.updateTransforms || []) if (t.increment) d.fields[t.fieldPath] = (d.fields[t.fieldPath] || 0) + Number(t.increment.integerValue); }
    return J({});
  }
  if (url.includes('/documents/')) { const name = url.split('/documents/')[1]; const d = docs[decodeURIComponent(name)] || docs[name]; if (!d) return J({}, 404);
    return J({ fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }])) }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const call = async (path, body) => { const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };
const m = (() => { const d = new Date(); return d.getUTCFullYear() + '_' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();
docs['autocards/card0000001'] = { fields: { status: 'published', ownerUid: 'owner' } };
const URL1 = 'https://jinjjabg-hub.github.io/autocard/c/?id=card0000001';

// 1) 열람: 주인이 확인된 우리 명함만 센다(누적 + 이번 달)
let [st, r] = await call('/card/stat', { type: 'view', url: URL1 }); assert.equal(r.ok, true);
await call('/card/stat', { type: 'view', url: URL1 });
assert.equal(docs['cardStats/owner'].fields.views, 2); assert.equal(docs['cardStats/owner'].fields['views_' + m], 2);
[st, r] = await call('/card/stat', { type: 'view', url: 'https://evil.com/?id=card0000001' }); assert.equal(r.ok, false);
[st, r] = await call('/card/stat', { type: 'view', url: 'https://jinjjabg-hub.github.io/autocard/c/?id=nocard00000' }); assert.equal(r.ok, false);
[st] = await call('/card/stat', { type: 'hack', url: URL1 }); assert.equal(st, 400);
assert.equal(docs['cardStats/owner'].fields.views, 2);
// 2) 저장: 로그인한 사람만, 같은 사람은 1번만, 주인 본인은 제외
[st, r] = await call('/card/stat', { type: 'save', url: URL1, idToken: 'a' }); assert.equal(r.ok, true);
await call('/card/stat', { type: 'save', url: URL1, idToken: 'a' });
await call('/card/stat', { type: 'save', url: URL1, idToken: 'owner' });
await call('/card/stat', { type: 'save', url: URL1, idToken: 'b' });
assert.equal(docs['cardStats/owner'].fields.saves, 2);
[st] = await call('/card/stat', { type: 'save', url: URL1 }); assert.notEqual(st, 200, '로그인 없이 저장 통계 불가');
// 3) 카드북 안에서 저장(리워드)할 때도 같은 통계에 잡히고, 이미 센 사람은 다시 안 센다
await call('/credits/save-reward', { idToken: 'c', url: URL1 });
await call('/credits/save-reward', { idToken: 'a', url: URL1 });
assert.equal(docs['cardStats/owner'].fields.saves, 3);
// 4) 문장 검색: 로그인 필수, 가벼운 모델, 번호만 정리해서 돌려줌
[st] = await call('/ai-search', { query: '부산 세무사', summaries: '0|김세무' }); assert.notEqual(st, 200); assert.equal(aiCalls, 0);
[st, r] = await call('/ai-search', { idToken: 'a', query: '부산 세무사', summaries: '0|김세무\n1|이인테\n2|박건축', today: '2026-11-16' });
assert.equal(st, 200); assert.deepEqual(r.matched, [2, 0]); assert.equal(r.summary, '부산 세무사');
assert.ok(lastPrompt.includes('오늘은 2026-11-16') && lastPrompt.includes('2|박건축')); assert.ok(/haiku/.test(lastModel));
[st, r] = await call('/ai-search', { idToken: 'a', query: '  ', summaries: 'x' }); assert.deepEqual(r.matched, []); assert.equal(aiCalls, 1);
// 5) 하루 30번 제한(사람별)
for (let i = 0; i < 29; i++) await call('/ai-search', { idToken: 'a', query: 'q', summaries: 'x' });
[st, r] = await call('/ai-search', { idToken: 'a', query: 'q', summaries: 'x' }); assert.equal(st, 429); assert.equal(r.limited, true);
[st] = await call('/ai-search', { idToken: 'b', query: 'q', summaries: 'x' }); assert.equal(st, 200);
console.log('FEATURE TESTS PASSED');
