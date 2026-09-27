import assert from 'assert';
const kv = new Map(); let calls = 0, prompts = [];
const env = { ANTHROPIC_API_KEY: 'k', OCR_CACHE: { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, v); } } };
globalThis.fetch = async (url, opt) => {
  calls++; const txt = JSON.parse(opt.body).messages[0].content[0].text; prompts.push(txt);
  const src = JSON.parse(txt.slice(txt.indexOf('Strings: ') + 9));
  const out = {}; for (const [k, v] of Object.entries(src)) out[k] = k === 'broken' ? 'Halo tanpa placeholder' : 'ID:' + v;
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }] }));
};
const worker = (await import('./worker.mjs')).default;
const call = async (path, body, ip = '1.1.1.1') => { const r = await worker.fetch(new Request('https://w' + path, { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env); return [r.status, await r.json()]; };
const src = { next: 'Next', start_p: 'From {price}.', consent: '<b>[Required]</b> I agree', broken: 'Hi {n}', 'card.call': 'Call' };
for (let i = 0; i < 130; i++) src['k' + i] = 'String ' + i;
// 1) 없는 언어 코드는 거부
let [st, r] = await call('/autocard/ui', { lang: 'xx', src }); assert.equal(st, 400);
[st, r] = await call('/autocard/ui', { lang: 'EN-us', src }); assert.equal(st, 400);
// 2) 인도네시아어: 번역 + 60개씩 나눠 호출
[st, r] = await call('/autocard/ui', { lang: 'id', src });
assert.equal(st, 200); assert.equal(r.strings.next, 'ID:Next'); assert.equal(r.strings.start_p, 'ID:From {price}.'); assert.equal(r.strings.consent, 'ID:<b>[Required]</b> I agree');
assert.equal(r.strings.broken, 'Hi {n}', '자리표시자 깨진 번역은 원문');
assert.equal(calls, 3); assert.ok(prompts[0].includes('Indonesian'));
// 3) 두 번째 사람: 캐시, AI 호출 없음
[st, r] = await call('/autocard/ui', { lang: 'id', src }, '2.2.2.2'); assert.equal(r.cached, true); assert.equal(calls, 3);
// 4) 같은 IP에서 새 언어 8개 넘으면 제한(캐시된 건 안 셈)
const langs = ['de', 'pt', 'it', 'ru', 'tr', 'nl', 'pl']; for (const l of langs) { [st] = await call('/autocard/ui', { lang: l, src }); assert.equal(st, 200, l); }
[st, r] = await call('/autocard/ui', { lang: 'uk', src }); assert.equal(st, 429); assert.equal(r.limited, true);
[st, r] = await call('/autocard/ui', { lang: 'id', src }); assert.equal(st, 200);
// 5) 명함 번역도 목록 밖 언어 허용
calls = 0; globalThis.fetch = async (url, opt) => { prompts.push(JSON.parse(opt.body).messages[0].content[0].text); return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ id: { name: 'Seunghoon Song', title: 'Direktur' } }) }] })); };
[st, r] = await call('/autocard/translate', { from: 'ko', to: ['id', 'zz'], texts: { title: '대표' } });
assert.equal(r.id.title, 'Direktur'); assert.ok(!r.zz); assert.ok(prompts.at(-1).includes('Indonesian(id)'));
console.log('UI TRANSLATE TESTS PASSED');
