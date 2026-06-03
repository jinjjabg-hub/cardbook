// ===== BNI 명함첩 저장 공통 스크립트 =====
// cardbook 저장소에 올려두고 각 명함에서 연결해서 사용

// Firebase SDK 동적 로드
(function loadFirebase() {
  const scripts = [
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore-compat.js'
  ];
  let loaded = 0;
  scripts.forEach(src => {
    // 이미 로드된 경우 스킵
    if(document.querySelector(`script[src="${src}"]`)) { loaded++; return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loaded++; if(loaded === scripts.length) initFirebase(); };
    document.head.appendChild(s);
  });
  // 이미 다 로드된 경우
  if(loaded === scripts.length) initFirebase();
})();

let _cbAuth, _cbDb;

function initFirebase() {
  if(typeof firebase === 'undefined') return;
  // 이미 초기화된 경우 기존 앱 사용
  try {
    const config = {
      apiKey: "AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0",
      authDomain: "mandu-e7c3c.firebaseapp.com",
      projectId: "mandu-e7c3c",
      storageBucket: "mandu-e7c3c.firebasestorage.app",
      messagingSenderId: "196338490174",
      appId: "1:196338490174:web:78dc77e684945aca362a6f"
    };
    try { firebase.initializeApp(config); }
    catch(e) { /* 이미 초기화됨 */ }
    _cbAuth = firebase.auth();
    _cbDb = firebase.firestore();
  } catch(e) { console.error('Firebase 초기화 실패', e); }
}

// ===== 명함첩에 저장 =====
async function saveToCardbook(cardData) {
  if(!_cbAuth || !_cbDb) {
    alert('잠시 후 다시 시도해주세요.');
    return;
  }

  // cardData가 없으면 페이지에서 자동 수집
  if(!cardData) {
    cardData = collectCardData();
  }

  const user = _cbAuth.currentUser;
  if(user) {
    await _saveCard(user.uid, cardData);
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const result = await _cbAuth.signInWithPopup(provider);
      await _saveCard(result.user.uid, cardData);
    } catch(err) {
      if(err.code !== 'auth/popup-closed-by-user') {
        alert('로그인 오류: ' + err.message);
      }
    }
  }
}

async function _saveCard(uid, cardData) {
  try {
    const docId = cardData.id || cardData.name.replace(/\s/g, '_');
    const data = {
      ...cardData,
      fullText: document.body.innerText, // AI 검색용 전체 텍스트
      url: cardData.url || window.location.href,
      savedAt: new Date().toISOString()
    };
    await _cbDb.collection('users').doc(uid).collection('cards').doc(docId).set(data);
    const go = confirm('✅ 명함첩에 저장되었습니다!\n명함첩 바로 보기?');
    if(go) window.location.href = 'https://jinjjabg-hub.github.io/cardbook';
  } catch(err) {
    alert('❌ 저장 실패: ' + err.message);
  }
}

// ===== 페이지에서 자동으로 명함 데이터 수집 =====
// 각 명함에서 cardData를 직접 넘기는 게 정확하지만
// 없을 경우 메타태그에서 자동 수집
function collectCardData() {
  const title = document.title || '';
  const desc = document.querySelector('meta[name="description"]')?.content || '';
  return {
    id: window.location.pathname.replace(/\//g, '_').replace(/^_|_$/g, ''),
    name: title.split('·')[0].trim(),
    url: window.location.href,
    fullText: document.body.innerText
  };
}

// ===== 전화번호 저장하기 (주소록에 저장) =====
function savePhone(cardData) {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${cardData.name || ''}
ORG:${cardData.company || ''}
TITLE:${cardData.title || ''}
TEL;TYPE=CELL:${cardData.phone || ''}
EMAIL:${cardData.email || ''}
URL:${cardData.url || window.location.href}
NOTE:${cardData.bni || ''}
END:VCARD`;
  const blob = new Blob([vcf], {type: 'text/vcard;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (cardData.name || 'contact') + '.vcf';
  link.click();
  URL.revokeObjectURL(link.href);
}
