// 명함 스캔(/ocr-image): Sonnet 5.5 먼저(effort low), 혼합 텍스트 규칙, 자신 없는 칸 정리, 새 캐시 이름(예전 모델 결과와 분리)
import { generateKeyPairSync } from 'crypto';
import assert from 'assert';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kv = new Map(), claude = []; let answer = '{"name":"Kim 철수","company":"T.M Link","uncertain":["email","company","email","없는칸"]}';
const env = { OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => kv.set(k, v) }, ANTHROPIC_API_KEY: 'k', TOSS_SECRET_KEY: 'test_sk', FIREBASE_SA: JSON.stringify({ client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
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
  if (url.includes('anthropic.com')) { claude.push(JSON.parse(opt.body)); return J({ content: [{ type: 'text', text: answer }] }); }
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
const h = 'f'.repeat(64);
let r = await call('/ocr-image', { idToken: 'u1', image: 'x', hash: h });
assert.equal(claude[0].model, 'claude-sonnet-5-5', 'Sonnet 5.5 먼저');
assert.equal(claude[0].output_config.effort, 'low');
const prompt = claude[0].messages[0].content[1].text;
assert.ok(prompt.includes('번역하지 말고') && prompt.includes('uncertain'), '혼합 텍스트 규칙·자신 없는 칸 요청이 들어감');
assert.equal(r.name, 'Kim 철수'); assert.deepEqual(r.uncertain, ['email', 'company'], '알려진 칸 이름만 남고 중복 제거');
assert.equal(docs['users/u1'].fields.credits + docs['users/u1'].fields.freeRemain, 54, '1장 차감');
// 같은 사진 → 새 캐시에서, 차감 없음, AI 호출 없음
r = await call('/ocr-image', { idToken: 'u1', image: 'x', hash: h });
assert.equal(r.cached, true); assert.equal(claude.length, 1); assert.deepEqual(r.uncertain, ['email', 'company']);
// 예전 모델 캐시(해시만 키)는 쓰지 않음
kv.set('e'.repeat(64), JSON.stringify({ name: '예전결과' }));
r = await call('/ocr-image', { idToken: 'u1', image: 'x', hash: 'e'.repeat(64) });
assert.notEqual(r.name, '예전결과'); assert.equal(claude.length, 2);
// uncertain이 없거나 이상하면 빈 배열
answer = '{"name":"홍길동","uncertain":"email"}';
r = await call('/ocr-image', { idToken: 'u1', image: 'y' }); assert.deepEqual(r.uncertain, []);
console.log('SCAN MODEL TESTS PASSED');
