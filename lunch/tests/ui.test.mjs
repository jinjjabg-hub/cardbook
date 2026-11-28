// 점심 화면 테스트 — Firebase·Worker를 가짜로 바꿔 실제 브라우저(Playwright)에서 눌러본다
// 사용: 레포 맨 위에서  node lunch/tests/ui.test.mjs
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');   // 전역 설치된 playwright 사용
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import assert from 'assert';

const ROOT = new URL('../../', import.meta.url).pathname;
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.png': 'image/png' }[extname(p)] || 'text/plain' });
  res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

// 가짜 Firebase: 경로별 메모리 저장소. window.__db 에 쓰기 기록이 남는다
const FAKE_FIREBASE = `
window.__db = { 'users/u1/cards': [
  { id: 'c1', name: '김사장', title: '대표', company: '부산대구탕', phone: '010-1234-5678', address: '부산 사상구 가야대로 1', fullText: '부산대구탕 대구탕 전문 051-111-2222 부산 사상구' },
  { id: 'c2', name: '이변호', title: '변호사', company: '법무법인', phone: '010-9999-8888', address: '서울 강남구', fullText: '법률 상담' },
  ...[4,5,6,7].map(n => ({ id: 'c' + n, name: '지인' + n, company: '회사' + n, phone: '010-555-000' + n, address: '부산 해운대구' })),
  { id: 'c3', name: '박해장', company: '사상 해장국', phone: '010-3333-4444', address: '부산 사상구 괘법동', fullText: '해장국 대구탕 맛집' }
], 'lunch_logs/u1/picks': [ { id: 'p0', date: '__TODAY__', menu: '김치찌개', ts: 1 } ] };
const W = []; window.__writes = W;
function col(path) {
  const q = { path, _limit: 999,
    doc(id) { const dpath = path + '/' + id; return { id, collection: n => col(dpath + '/' + n),
      set(data) { W.push({ path, id, data, op: 'set' }); (window.__db[path] ||= []).push({ id, ...data }); return Promise.resolve(); } }; },
    add(data) { W.push({ path, data, op: 'add' }); (window.__db[path] ||= []).push({ id: 'a' + W.length, ...data }); return Promise.resolve({ id: 'a' + W.length }); },
    orderBy() { return q; }, limit(n) { q._limit = n; return q; },
    get() { const docs = (window.__db[path] || []).slice(0, q._limit).map(d => ({ id: d.id, data: () => d })); return Promise.resolve({ empty: !docs.length, docs }); } };
  return q;
}
const fs = () => ({ enablePersistence: () => Promise.resolve(), collection: col });
fs.FieldValue = { serverTimestamp: () => 'SERVER_TS' };
window.firebase = { initializeApp() {}, firestore: fs,
  auth: () => ({ onAuthStateChanged(cb) { setTimeout(() => cb({ uid: 'u1', getIdToken: async () => 'tok' }), 10); } }) };
`;

const apiCalls = [];
async function setup(page) {
  await page.addInitScript(() => { window.open = u => { window.__opened = u; }; });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://www.gstatic.com/**', r => r.fulfill({ contentType: 'text/javascript',
    body: r.request().url().includes('app-compat') ? FAKE_FIREBASE.replace('__TODAY__', new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) : '' }));
  await page.route('https://cardbook-lunch.jinjjabg.workers.dev/**', async r => {
    const path = new URL(r.request().url()).pathname, body = JSON.parse(r.request().postData());
    apiCalls.push({ path, body });
    assert.equal(body.idToken, 'tok');
    const J = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/lunch/locate') return J({ x: '128.983', y: '35.151', label: '냉정역 2호선', gu: '사상구' });
    if (path === '/lunch/recommend') return J({ menus: [
      { name: '대구탕', reason: '추운 날 칼칼한 국물', keywords: ['대구탕', '생선'] },
      { name: '제육볶음', reason: '든든한 밥 한 끼', keywords: ['제육볶음', '백반'] },
      { name: '메밀소바', reason: '가볍고 시원하게', keywords: ['메밀소바', '일식'] } ] });
    if (path === '/lunch/places') return J({ cached: false, places: body.keyword === '대구탕' ? [
      { id: '9', name: '사상 대구탕집', address: '부산 사상구 1', phone: '051-000-0000', distance: 80, url: 'http://place.map.kakao.com/9' },
      { id: '1', name: '부산대구탕', address: '부산 사상구 가야대로 1', phone: '051-111-2222', distance: 120, url: 'http://place.map.kakao.com/1' } ] : [] });
  });
}

const browser = await chromium.launch();
let fail = 0;
const check = (name, fn) => { try { fn(); console.log('  ✓', name); } catch (e) { fail = 1; console.log('  ✗', name, '\n   ', e.message); } };

// ── 안드로이드 ──
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await setup(page);
  // 위치는 지난번 것이 기억된 상태(두 번째 방문부터의 실제 상황)
  await page.goto(BASE + '/lunch/');
  await page.evaluate(() => localStorage.setItem('lunchLoc', JSON.stringify({ x: '128.983', y: '35.151', label: '냉정역 2호선', gu: '사상구' })));
  await page.reload();
  await page.waitForSelector('#app', { state: 'visible' });
  check('위치가 자동 선택돼 있다', async () => {});
  assert.equal(await page.textContent('#locName'), '냉정역 2호선');
  assert.equal(await page.locator('#topChips .chip').count(), 8);

  // 탭 1: 칩, 탭 2: 추천받기
  await page.click('.chip[data-c="칼칼"]');
  await page.click('#btnMore');
  await page.click('.chip[data-c="매운 거 ✕"]');
  await page.click('#btnGo');
  await page.waitForSelector('#menu0');
  const rec = apiCalls.find(c => c.path === '/lunch/recommend').body;
  check('추천 요청에 칩·월·최근 메뉴가 들어간다', () => {
    assert.deepEqual(rec.chips, ['칼칼', '매운 거 ✕']);
    assert.equal(rec.month, Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 7)));
    assert.deepEqual(rec.recentMenus, ['김치찌개']);
  });
  check('빼기 칩은 색이 다르다', () => {});
  assert.notEqual(await page.$eval('.chip[data-c="매운 거 ✕"]', e => getComputedStyle(e).backgroundColor), await page.$eval('.chip[data-c="칼칼"]', e => getComputedStyle(e).backgroundColor));
  assert.equal(await page.locator('.menu').count(), 3);

  // 메뉴 누르기 → 식당 목록, 내 명함 맨 위
  await page.click('[data-open="0"]');
  await page.waitForSelector('#list0 .place');
  const names = await page.$$eval('#list0 .place', els => els.map(e => [e.classList.contains('mine'), e.querySelector('.p-name').textContent]));
  check('명함 가게가 "내 명함" 배지로 맨 위, 전화번호 같은 가게는 하나로 합침', () => {
    assert.deepEqual(names, [[true, '내 명함부산대구탕'], [true, '내 명함사상 해장국'], [false, '사상 대구탕집']]);
  });

  // 문자로 예약 → 인원 → 문자 링크
  await page.click('#list0 .place.mine [data-act="sms"]');
  const link = await page.evaluate(() => smsLink('010-1234-5678', '사장님, 오늘 12시 2명 가능할까요? (카드북에서 보고 연락드려요)'));
  check('안드로이드 문자 링크: sms:번호?body=', () => assert.ok(link.startsWith('sms:01012345678?body=%EC%82%AC%EC%9E%A5%EB%8B%98')));
  await page.click('#list0 .place.mine [data-act="smsn"][data-n="2"]').catch(() => {});
  await page.waitForTimeout(200);

  // 지도: 처음엔 고르기 → 카카오 → place_url
  await page.click('#list0 .place:not(.mine) [data-act="map"]').catch(() => {});
  await page.click('[data-map="kakao"]');
  check('지도: 카카오맵은 place_url', async () => {});
  assert.equal(await page.evaluate(() => window.__opened), 'http://place.map.kakao.com/9');
  check('지도 선택을 기억한다', async () => {});
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lunchMap'))), 'kakao');

  // 오늘의 연결 + 안부 문자
  await page.waitForSelector('#connect', { state: 'visible' });
  const hello = await page.evaluate(() => smsLink(connectCard.phone, connectCard.name + ' ' + honorific(connectCard) + '님, 점심 맛있게 드세요! 요즘 어떻게 지내세요?'));
  check('안부 문자 문구가 채워진다', () => assert.ok(decodeURIComponent(hello).includes('님, 점심 맛있게 드세요! 요즘 어떻게 지내세요?')));
  await page.click('#btnOther'); await page.click('#btnOther'); await page.click('#btnOther');
  await page.click('#btnOther');
  check('다른 사람은 하루 3번까지', async () => {});
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lunchConnect_u1')).swaps), 3);

  // 이걸로!
  await page.click('[data-open="1"]');
  await page.click('[data-pick="1"]');
  await page.waitForTimeout(100);
  const writes = await page.evaluate(() => window.__writes);
  const types = writes.filter(w => w.path === 'lunch_events').map(w => w.data.type);
  check('이벤트가 lunch_events에 쌓인다', () => {
    for (const t of ['open', 'recommend', 'place_open', 'mycard_match', 'sms_reserve', 'connect_view', 'pick']) assert.ok(types.includes(t), t + ' 없음');
    for (const w of writes.filter(w => w.path === 'lunch_events')) { assert.equal(w.data.uid, 'u1'); assert.equal(w.data.ts, 'SERVER_TS'); assert.deepEqual(Object.keys(w.data).sort(), ['meta', 'ts', 'type', 'uid']); }
  });
  const picks = writes.filter(w => w.path === 'lunch_logs/u1/picks').map(w => w.data);
  check('고른 메뉴가 lunch_logs에 저장(문자 예약 = 자동 기록 1건 + 이걸로 1건)', () => {
    assert.deepEqual(picks.map(p => p.menu), ['대구탕', '제육볶음']);
    assert.deepEqual(Object.keys(picks[0]).sort(), ['chips', 'date', 'menu', 'region', 'ts']); assert.equal(picks[0].region, '사상구');
  });
  check('보여준 명함 기록이 connectShown에 저장', () => assert.ok(writes.some(w => w.path === 'lunch_logs/u1/connectShown')));
  check('화면 오류 없음', () => assert.deepEqual(errs, []));
  await page.screenshot({ path: process.env.SHOT || '/tmp/lunch.png', fullPage: true });
  await ctx.close();
}

// ── iOS ──
{
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto(BASE + '/lunch/');
  await page.waitForSelector('#app', { state: 'visible' });
  const link = await page.evaluate(() => smsLink('010-1234-5678', '안녕'));
  check('iOS 문자 링크: sms:번호&body=', () => assert.equal(link, 'sms:01012345678&body=%EC%95%88%EB%85%95'));
  // 첫 방문 위치: 지역 입력
  await page.click('#btnArea'); await page.fill('#areaQ', '사상구 냉정역'); await page.press('#areaQ', 'Enter');
  await page.waitForFunction(() => document.getElementById('locName').textContent === '냉정역 2호선');
  check('지역 입력 → 위치 저장', async () => {});
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lunchLoc')).gu), '사상구');
  await ctx.close();
}

await browser.close(); server.close();
console.log(fail ? 'UI tests FAILED' : 'lunch UI tests OK');
process.exit(fail);
