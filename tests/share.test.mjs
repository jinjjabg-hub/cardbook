import assert from 'assert';
// 공유 주소(/c/{id})와 연락처 남기기(/autocard/lead) — Firestore·토큰은 가짜
const S = v => ({ stringValue: v });
const docs = {
  pubcard01: { status: S('published'), langs: { arrayValue: { values: [S('ko'), S('en')] } },
    name: { mapValue: { fields: { ko: S('홍<길>동'), en: S('Hong') } } }, title: { mapValue: { fields: { ko: S('대표') } } }, company: { mapValue: { fields: { ko: S('길동상사') } } },
    copy: { mapValue: { fields: { ko: { mapValue: { fields: { slogan: S('믿고 맡기는 "인테리어"') } } } } } },
    og: S('https://firebasestorage.googleapis.com/v0/b/x/o/og.jpg?alt=media'), images: { mapValue: { fields: { profile: S('https://firebasestorage.googleapis.com/p.jpg') } } } },
  draftcard1: { status: S('draft'), langs: { arrayValue: { values: [S('ko')] } }, name: { mapValue: { fields: { ko: S('비공개') } } } },
  nophoto001: { status: S('published'), langs: { arrayValue: { values: [S('ko')] } }, name: { mapValue: { fields: { ko: S('김무료') } } }, og: S('https://evil.example/x.jpg') },
  closed0001: { status: S('published'), langs: { arrayValue: { values: [S('ko')] } }, leadsOff: { booleanValue: true } },
};
const writes = [];
globalThis.fetch = async (url, opt) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
  if (url.endsWith(':commit')) { writes.push(JSON.parse(opt.body).writes[0]); return new Response('{}'); }
  const id = url.split('/autocards/')[1];
  return docs[id] ? new Response(JSON.stringify({ fields: docs[id] })) : new Response('{}', { status: 404 });
};
const { generateKeyPairSync } = await import('crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const kv = new Map();
const env = { FIREBASE_SA: JSON.stringify({ client_email: 'a@b', private_key: privateKey }), OCR_CACHE: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
const worker = (await import('./worker.mjs')).default;
const get = path => worker.fetch(new Request('https://w' + path), env);

// 1) 공개 명함: 이름·직함·한 줄 소개·OG 이미지가 들어가고, 특수문자는 안전하게 바뀜
let r = await get('/c/pubcard01'); let h = await r.text();
assert.equal(r.status, 200);
assert.ok(h.includes('og:title" content="홍&lt;길&gt;동 | 대표 · 길동상사"'), h);
assert.ok(h.includes('og:description" content="믿고 맡기는 &quot;인테리어&quot;"'));
assert.ok(h.includes('og:image" content="https://firebasestorage.googleapis.com/v0/b/x/o/og.jpg?alt=media"'));
assert.ok(h.includes('location.replace("https://jinjjabg-hub.github.io/autocard/c/?id=pubcard01")'));
// 2) 언어 지정
h = await (await get('/c/pubcard01?lang=en')).text(); assert.ok(h.includes('og:title" content="Hong'), h); assert.ok(h.includes('id=pubcard01&amp;lang=en'));
// 3) 비공개·없는 명함·이상한 주소: 정보 없이 이동만
r = await get('/c/draftcard1'); assert.equal(r.status, 302); assert.ok(r.headers.get('Location').endsWith('?id=draftcard1'));
r = await get('/c/nothere001'); assert.equal(r.status, 302);
r = await get('/c/a<b'); assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), 'https://jinjjabg-hub.github.io/autocard/');
// 4) 우리 저장소가 아닌 이미지 주소는 쓰지 않고 기본 이미지
h = await (await get('/c/nophoto001')).text(); assert.ok(h.includes('assets/og-card.jpg')); assert.ok(!h.includes('evil.example'));

const post = async (body, ip = '1.1.1.1') => { const x = await worker.fetch(new Request('https://w/autocard/lead', { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env); return [x.status, await x.json()]; };
// 5) 연락처 남기기: 저장됨
let [st, j] = await post({ cardId: 'pubcard01', name: ' 이<b>순신 ', phone: '010-1234-5678', company: '거북선', agree: true, lang: 'ko' });
assert.equal(st, 200); assert.equal(writes.length, 1);
const w = writes[0]; assert.ok(/\/autocards\/pubcard01\/leads\/[a-z0-9]{20}$/.test(w.update.name), w.update.name);
assert.equal(w.update.fields.name.stringValue, '이 b 순신'); assert.equal(w.update.fields.phone.stringValue, '010-1234-5678'); assert.equal(w.currentDocument.exists, false);
// 6) 거부: 동의 없음·전화 이상·비공개 명함·받지 않는 명함
[st] = await post({ cardId: 'pubcard01', name: '가', phone: '010-1234-5678' }); assert.equal(st, 400);
[st] = await post({ cardId: 'pubcard01', name: '가', phone: '123', agree: true }); assert.equal(st, 400);
[st] = await post({ cardId: 'draftcard1', name: '가', phone: '010-1234-5678', agree: true }, '3.3.3.3'); assert.equal(st, 404);
[st] = await post({ cardId: 'closed0001', name: '가', phone: '010-1234-5678', agree: true }, '3.3.3.3'); assert.equal(st, 403);
assert.equal(writes.length, 1);
// 7) 도배 방지: 같은 명함에 같은 IP는 하루 3건
for (let i = 0; i < 2; i++) { [st] = await post({ cardId: 'pubcard01', name: '나', phone: '010-1234-5678', agree: true }, '9.9.9.9'); assert.equal(st, 200); }
[st] = await post({ cardId: 'pubcard01', name: '나', phone: '010-1234-5678', agree: true }, '9.9.9.9'); assert.equal(st, 200);
[st, j] = await post({ cardId: 'pubcard01', name: '나', phone: '010-1234-5678', agree: true }, '9.9.9.9'); assert.equal(st, 429); assert.equal(j.limited, true);
console.log('SHARE + LEAD TESTS PASSED');
