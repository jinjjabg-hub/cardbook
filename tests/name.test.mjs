import assert from 'assert';
let prompt = '';
globalThis.fetch = async (url, opt = {}) => { const b = JSON.parse(opt.body); prompt = b.messages[0].content[0].text;
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ en: { name: 'Seunghoon Song', title: 'CEO' }, ja: { name: 'ソン・スンフン', title: '代表' } }) }] })); };
const worker = (await import('./worker.mjs')).default;
const r = await (await worker.fetch(new Request('https://w/autocard/translate', { method: 'POST', body: JSON.stringify({ from: 'ko', to: ['en', 'ja'], texts: { name: '송승훈', title: '대표' } }) }), { ANTHROPIC_API_KEY: 'k' })).json();
assert.equal(r.en.name, 'Seunghoon Song'); assert.equal(r.ja.name, 'ソン・スンフン');
assert.ok(prompt.includes('"name":"송승훈"') && prompt.includes('가타카나') && prompt.includes('"name":""'));
console.log('NAME TESTS PASSED');
