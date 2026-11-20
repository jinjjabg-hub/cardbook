// 비용 남용 경로: 이미지 프록시는 카드북 저장소만, 자동 명함 AI는 IP·기기 하루 한도, 인증 없던 /ocr-parse 삭제, 500 응답은 일반 문구
import assert from 'assert';
const kv = new Map(), fetched = []; let claude = 0;
const env = { ANTHROPIC_API_KEY: 'k', OCR_CACHE: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) } };
globalThis.fetch = async (url, opt = {}) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('api.anthropic.com')) { claude++; return J({ content: [{ type: 'text', text: '{"slogan":"s","work":"w","help":"h","referral":"r","en":{"title":"T"}}' }] }); }
  if (url.startsWith('https://firebasestorage.googleapis.com/')) { fetched.push(url); return new Response('img', { headers: { 'Content-Type': 'image/png' } }); }
  throw new Error('unexpected ' + url);
};
const worker = (await import('./worker.mjs')).default;
const req = (path, body, ip = '1.1.1.1') => worker.fetch(new Request('https://w' + path, body === undefined ? {} : { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env);

// 1) /img: 카드북(mandu-e7c3c) 버킷만
const OK = 'https://firebasestorage.googleapis.com/v0/b/mandu-e7c3c.firebasestorage.app/o/cards%2Fa.jpg?alt=media';
let r = await req('/img?u=' + encodeURIComponent(OK)); assert.equal(r.status, 200); assert.equal(await r.text(), 'img');
for (const bad of [
  'https://firebasestorage.googleapis.com/v0/b/other-project.appspot.com/o/x?alt=media',
  'https://firebasestorage.googleapis.com/v0/b/mandu-e7c3c.firebasestorage.app/../../b/other/o/x',
  'https://firebasestorage.googleapis.com/v0/b/mandu-e7c3c.firebasestorage.app/%2e%2e/%2e%2e/b/other/o/x',
  'https://firebasestorage.googleapis.com.evil.com/v0/b/mandu-e7c3c.firebasestorage.app/o/x',
  'not a url',
]) { r = await req('/img?u=' + encodeURIComponent(bad)); assert.equal(r.status, 403, bad); }
assert.equal(fetched.length, 1, '허용된 주소만 실제로 가져옴');

// 2) /autocard/draft: 기기 하루 20번, 기기 ID 없으면 IP 한도(100)만
const draft = { lang: 'ko', answers: { work: '중개' } };
for (let i = 0; i < 20; i++) assert.equal((await req('/autocard/draft', { ...draft, deviceId: 'device-aaaa-1' })).status, 200);
r = await req('/autocard/draft', { ...draft, deviceId: 'device-aaaa-1' }); assert.equal(r.status, 429); assert.equal((await r.json()).limited, true);
assert.equal(claude, 20, '한도 넘으면 AI 호출 없음');
assert.equal((await req('/autocard/draft', { ...draft, deviceId: 'device-bbbb-2' })).status, 200, '다른 기기는 계속');
for (let i = 0; i < 79; i++) await req('/autocard/draft', draft);   // 같은 IP 누적 100
assert.equal((await req('/autocard/draft', draft)).status, 429, 'IP 한도');
assert.equal((await req('/autocard/draft', draft, '2.2.2.2')).status, 200, '다른 IP는 계속');
// translate는 따로 셈(기기 30)
const tr = { from: 'ko', to: ['en'], texts: { title: '대표' }, deviceId: 'device-cccc-3' };
for (let i = 0; i < 30; i++) assert.equal((await req('/autocard/translate', tr, '3.3.3.3')).status, 200);
assert.equal((await req('/autocard/translate', tr, '3.3.3.3')).status, 429);

// 3) /ocr-parse 삭제(인증·제한 없이 AI를 부르던 경로)
const before = claude;
r = await req('/ocr-parse', { rawText: '홍길동 010-1234-5678' }); assert.equal(r.status, 404); assert.equal(claude, before);

// 4) 내부 오류는 일반 문구로(상세는 console.error)
const origErr = console.error; let logged = ''; console.error = (...a) => { logged += a.join(' '); };
globalThis.fetch = async () => new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'secret internal detail' } }), { status: 400 });
r = await req('/autocard/draft', draft, '4.4.4.4'); console.error = origErr;
assert.equal(r.status, 500); const b = await r.json();
assert.ok(!b.error.includes('secret internal detail'), '응답에 내부 오류 노출 없음'); assert.ok(logged.includes('secret internal detail'), '로그에는 남김');
console.log('ABUSE LIMIT TESTS PASSED');
