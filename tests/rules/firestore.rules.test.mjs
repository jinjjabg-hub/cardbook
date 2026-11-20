// Firestore 규칙 테스트(선택) — 에뮬레이터가 필요해 tests/run.sh에는 넣지 않았다. 규칙을 고친 뒤 main에 병합하기 전에 돌려 본다.
// 준비(한 번): 빈 폴더에서 npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10 (Java 필요)
// 실행: 그 폴더에 firestore.rules를 복사하고 firebase.json = {"emulators":{"firestore":{"port":8089}}}
//       npx firebase emulators:exec --only firestore --project demo-cb "node <이 파일 경로>"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-cb', firestore: { rules: readFileSync(process.env.RULES || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
// index.html과 같은 cbUrlKey
const CB_AC_KEY_RE = /^https?:\/\/jinjjabg-hub\.github\.io\/(?:cardbook\/)?autocard\/c\/?(?:index\.html)?\?(?:[^#]*&)?id=([A-Za-z0-9_-]{6,40})(?:[&#]|$)/i;
function cbUrlKey(url){ const ac = CB_AC_KEY_RE.exec(String(url).trim()); if(ac) return encodeURIComponent('jinjjabg-hub.github.io/autocard/c?id=' + ac[1].toLowerCase());
  let u = String(url).trim().toLowerCase(); u = u.replace(/^https?:\/\//,'').replace(/#.*$/,'').replace(/\?.*$/,''); u = u.replace(/index\.html$/,'').replace(/\/+$/,''); return encodeURIComponent(u); }
const claimId = url => { const u = new URL(url); return encodeURIComponent((u.hostname + u.pathname).toLowerCase().replace(/\/$/, '')); };
const AC1 = 'https://jinjjabg-hub.github.io/autocard/c/?id=AbCdEf1234';
const BH_KO = 'https://jinjjabg-hub.github.io/NAMECARD/이서원/';
const BH = 'https://bizhome.bizmy.net/Abc/index.html';
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'users/u1'), { autocardUrl: AC1 });
  await setDoc(doc(db, 'users/u2'), { autocardUrl: AC1, bizhomeUrl: BH_KO });   // 남의 링크를 자기 것으로 등록한 사용자
  await setDoc(doc(db, 'users/u3'), { bizhomeUrl: BH_KO });
  await setDoc(doc(db, 'users/u4'), { dicaUrl: BH });
  await setDoc(doc(db, 'autocards/AbCdEf1234'), { ownerUid: 'u1', status: 'published' });
  await setDoc(doc(db, 'dicaClaims/' + claimId(BH_KO)), { uid: 'u3', url: BH_KO });
  await setDoc(doc(db, 'dicaClaims/' + claimId(BH)), { uid: 'u4', url: BH });
  await setDoc(doc(db, 'autocards/free1'), { ownerUid: 'u1', ownerEmail: 'a@b', status: 'published', plan: 'free', price: 0, langs: ['ko'], images: { profile: '', second: '' }, slogan: 'x' });
  await setDoc(doc(db, 'autocards/paid1'), { ownerUid: 'u1', ownerEmail: 'a@b', status: 'published', plan: 'basic', price: 5900, langs: ['ko'], images: { profile: '', second: '' }, slogan: 'x' });
});
const as = uid => env.authenticatedContext(uid).firestore();
const upd = (uid, url, extra = {}) => ({ url, notice: '새 소식', updatedAt: new Date().toISOString(), ownerUid: uid, ownerName: 'n', ...extra });
let n = 0; const ok = async (p, m) => { await assertSucceeds(p); n++; console.log('✓ 허용', m); };
const no = async (p, m) => { await assertFails(p); n++; console.log("✓ 거부", m); };

// card_updates — 오토명함
await no(setDoc(doc(as('u2'), 'card_updates', cbUrlKey(AC1)), upd('u2', AC1)), '남의 오토명함 링크를 등록한 u2가 알림 생성');
await no(setDoc(doc(as('u1'), 'card_updates', 'wrongkey'), upd('u1', AC1)), '키가 주소와 다름');
await no(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u2', AC1)), 'ownerUid가 남');
await no(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u1', AC1, { notice: 'x'.repeat(81) })), '문구 81자');
await no(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u1', AC1, { evil: 1 })), '허용 안 된 필드');
await no(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u1', AC1, { notice: '' })), '빈 문구');
await ok(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u1', AC1, { notice: 'x'.repeat(80) })), '주인 u1 생성(80자)');
await no(setDoc(doc(as('u2'), 'card_updates', cbUrlKey(AC1)), upd('u2', AC1)), '남이 만든 문서를 내 ownerUid로 덮어쓰기(원래 취약점)');
await ok(setDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1)), upd('u1', AC1, { notice: '수정' })), '주인 수정');
await no(deleteDoc(doc(as('u2'), 'card_updates', cbUrlKey(AC1))), '남이 삭제');
await ok(getDoc(doc(as('u2'), 'card_updates', cbUrlKey(AC1))), '로그인 사용자 읽기');
await no(getDoc(doc(env.unauthenticatedContext().firestore(), 'card_updates', cbUrlKey(AC1))), '비로그인 읽기');
await ok(deleteDoc(doc(as('u1'), 'card_updates', cbUrlKey(AC1))), '주인 삭제');
// card_updates — 비즈홈(한글 주소, 선점 기록)
await ok(setDoc(doc(as('u3'), 'card_updates', cbUrlKey(BH_KO)), upd('u3', BH_KO, { claimId: claimId(BH_KO) })), '한글 비즈홈 주인 u3(선점 기록 있음)');
await no(setDoc(doc(as('u2'), 'card_updates', 'k-u2'), upd('u2', BH_KO, { claimId: claimId(BH_KO) })), '같은 비즈홈을 등록만 한 u2');
await no(setDoc(doc(as('u2'), 'card_updates', 'k-u2b'), upd('u2', BH_KO)), 'claimId 없음');
// card_updates — ASCII 비즈홈(예전 dicaUrl 필드), 키를 규칙에서 다시 계산
await no(setDoc(doc(as('u4'), 'card_updates', 'bizhome.bizmy.net%2Fother'), upd('u4', BH, { claimId: claimId(BH) })), 'ASCII 주소인데 키가 다름');
await ok(setDoc(doc(as('u4'), 'card_updates', cbUrlKey(BH)), upd('u4', BH, { claimId: claimId(BH) })), 'ASCII 비즈홈 주인 u4(dicaUrl)');

// autocards 발행 후 잠금
await no(updateDoc(doc(as('u1'), 'autocards/free1'), { 'images.profile': 'https://x/p.jpg' }), '무료판 발행 후 사진 추가');
await no(updateDoc(doc(as('u1'), 'autocards/free1'), { plan: 'basic' }), '무료판 plan 변경');
await ok(updateDoc(doc(as('u1'), 'autocards/free1'), { slogan: 'y' }), '무료판 문구 수정');
await ok(updateDoc(doc(as('u1'), 'autocards/paid1'), { 'images.profile': 'https://x/p.jpg' }), '유료판 사진 변경');
await no(updateDoc(doc(as('u1'), 'autocards/paid1'), { plan: 'free' }), '유료판 plan 변경');
console.log(`ALL ${n} RULE CASES PASSED`);
await env.cleanup();
