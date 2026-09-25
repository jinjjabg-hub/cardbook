// ===== AutoCard 공통 설정 =====
// 카드북과 같은 Firebase 프로젝트(mandu-e7c3c)를 쓴다 → 같은 로그인, 같은 DB.
// 이 키는 공개용(웹 API 키)이라 브라우저에 있어도 된다. AI 키는 Worker Secret에만 있다.
const AC_FIREBASE = {
  apiKey: "AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0",
  authDomain: "mandu-e7c3c.firebaseapp.com",
  projectId: "mandu-e7c3c",
  storageBucket: "mandu-e7c3c.firebasestorage.app",
  messagingSenderId: "196338490174",
  appId: "1:196338490174:web:78dc77e684945aca362a6f"
};
const AC_WORKER = 'https://cardbook-ai.jinjjabg.workers.dev';
const AC_CARDBOOK = 'https://jinjjabg-hub.github.io/cardbook/';
const AC_ADMIN_EMAILS = ['jinjjabg@gmail.com'];   // firestore.rules의 관리자 이메일과 같아야 함

// 가격: 기본 1개 언어 5,900원 + 추가 언어당 5,000원, 최대 4개 언어
const AC_BASE_PRICE = 5900, AC_EXTRA_LANG_PRICE = 5000, AC_MAX_LANGS = 4, AC_MAX_LINKS = 3;
function acPrice(langs) { return AC_BASE_PRICE + Math.max(0, (langs || []).length - 1) * AC_EXTRA_LANG_PRICE; }
function acWon(n) { return n.toLocaleString('ko-KR') + '원'; }

function acInitFirebase() {
  if (!firebase.apps.length) firebase.initializeApp(AC_FIREBASE);
  return { auth: firebase.auth(), db: firebase.firestore() };
}

// 공개 명함 주소 — 카드북 저장·QR·공유에 모두 이 주소를 쓴다
function acCardUrl(id) {
  const base = location.origin + location.pathname.replace(/\/(c\/)?(index\.html|admin\.html)?$/, '/');
  return base + 'c/?id=' + encodeURIComponent(id);
}
