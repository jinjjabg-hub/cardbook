// ===== BNI 명함첩 저장 공통 스크립트 =====

const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);

(function loadFirebase() {
  const scripts = [
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore-compat.js'
  ];
  let loaded = 0;
  scripts.forEach(src => {
    if(document.querySelector(`script[src="${src}"]`)) { loaded++; return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loaded++; if(loaded === scripts.length) initFirebase(); };
    document.head.appendChild(s);
  });
  if(loaded === scripts.length) initFirebase();
})();

(function loadKakao() {
  if(document.querySelector('script[src*="kakao"]')) return;
  const s = document.createElement('script');
  s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
  s.onload = () => {
    if(typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
      Kakao.init('7a736ceca6b6865251e078261ed9596f');
    }
  };
  document.head.appendChild(s);
})();

let _cbAuth, _cbDb;

function initFirebase() {
  if(typeof firebase === 'undefined') return;
  try {
    const config = {
      apiKey: "AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0",
      authDomain: "mandu-e7c3c.firebaseapp.com",
      projectId: "mandu-e7c3c",
      storageBucket: "mandu-e7c3c.firebasestorage.app",
      messagingSenderId: "196338490174",
      appId: "1:196338490174:web:78dc77e684945aca362a6f"
    };
    try { firebase.initializeApp(config); } catch(e) {}
    _cbAuth = firebase.auth();
    _cbDb = firebase.firestore();
  } catch(e) { console.error('Firebase 초기화 실패', e); }
}

async function saveToCardbook(cardData) {
  if(!_cbAuth || !_cbDb) {
    setTimeout(() => saveToCardbook(cardData), 1000);
    return;
  }
  if(!cardData) cardData = collectCardData();
  const user = _cbAuth.currentUser;
  if(user) {
    await _saveCard(user.uid, cardData);
  } else {
    showLoginModal(cardData);
  }
}

function showLoginModal(cardData) {
  const existing = document.getElementById('_cb_modal');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = '_cb_modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
    display:flex;align-items:flex-end;justify-content:center;
    font-family:'Noto Sans KR',sans-serif;
  `;

  const googleBtn = isKakaoTalk ? '' : `
    <button id="_cb_google" style="
      width:100%;padding:14px;border-radius:12px;border:none;
      background:#fff;color:#1a1a1a;font-size:14px;font-weight:600;
      cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
      font-family:'Noto Sans KR',sans-serif;margin-bottom:10px;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google로 로그인
    </button>
    <div style="display:flex;align-items:center;gap:10px;margin:10px 0 14px;color:rgba(240,232,216,0.3);font-size:11px;">
      <div style="flex:1;height:1px;background:rgba(201,168,76,0.15)"></div>또는<div style="flex:1;height:1px;background:rgba(201,168,76,0.15)"></div>
    </div>`;

  modal.innerHTML = `
    <div style="background:#141209;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:430px;border-top:1px solid rgba(201,168,76,0.3);">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;margin-bottom:8px;">🗂️</div>
        <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px;">명함첩에 저장하기</div>
      </div>

      ${googleBtn}

      <!-- 탭 -->
      <div style="display:flex;border-radius:10px;background:rgba(255,255,255,0.06);padding:4px;margin-bottom:16px;">
        <button id="_cb_tab_login" onclick="_cbSwitchTab('login')" style="flex:1;padding:9px;border-radius:8px;border:none;background:#c9a84c;color:#1a1209;font-weight:700;font-size:13px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">로그인</button>
        <button id="_cb_tab_signup" onclick="_cbSwitchTab('signup')" style="flex:1;padding:9px;border-radius:8px;border:none;background:transparent;color:rgba(240,232,216,0.5);font-weight:600;font-size:13px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">회원가입</button>
      </div>

      <!-- 로그인 폼 -->
      <div id="_cb_form_login" style="display:flex;flex-direction:column;gap:8px;">
        <input id="_cb_li_email" type="email" placeholder="이메일" style="background:rgba(255,255,255,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;color:#f0e8d8;font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;width:100%;box-sizing:border-box;">
        <input id="_cb_li_pw" type="password" placeholder="비밀번호" style="background:rgba(255,255,255,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;color:#f0e8d8;font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;width:100%;box-sizing:border-box;">
        <div id="_cb_li_err" style="color:#ff9e8f;font-size:11px;min-height:14px;"></div>
        <button id="_cb_li_btn" style="width:100%;padding:13px;border-radius:10px;border:none;background:#c9a84c;color:#1a1209;font-weight:700;font-size:14px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">로그인</button>
      </div>

      <!-- 회원가입 폼 -->
      <div id="_cb_form_signup" style="display:none;flex-direction:column;gap:8px;">
        <input id="_cb_su_email" type="email" placeholder="이메일" style="background:rgba(255,255,255,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;color:#f0e8d8;font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;width:100%;box-sizing:border-box;">
        <input id="_cb_su_pw" type="password" placeholder="비밀번호 (6자 이상)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;color:#f0e8d8;font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;width:100%;box-sizing:border-box;">
        <input id="_cb_su_pw2" type="password" placeholder="비밀번호 확인" style="background:rgba(255,255,255,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:12px;color:#f0e8d8;font-size:14px;font-family:'Noto Sans KR',sans-serif;outline:none;width:100%;box-sizing:border-box;">
        <div id="_cb_su_err" style="color:#ff9e8f;font-size:11px;min-height:14px;"></div>
        <button id="_cb_su_btn" style="width:100%;padding:13px;border-radius:10px;border:none;background:#c9a84c;color:#1a1209;font-weight:700;font-size:14px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">회원가입</button>
      </div>

      <button id="_cb_close" style="width:100%;padding:12px;margin-top:10px;border-radius:12px;border:none;background:transparent;color:rgba(240,232,216,0.3);font-size:13px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">닫기</button>
    </div>
  `;

  document.body.appendChild(modal);

  window._cbSwitchTab = (tab) => {
    const isLogin = tab === 'login';
    document.getElementById('_cb_form_login').style.display = isLogin ? 'flex' : 'none';
    document.getElementById('_cb_form_signup').style.display = isLogin ? 'none' : 'flex';
    document.getElementById('_cb_tab_login').style.background = isLogin ? '#c9a84c' : 'transparent';
    document.getElementById('_cb_tab_login').style.color = isLogin ? '#1a1209' : 'rgba(240,232,216,0.5)';
    document.getElementById('_cb_tab_signup').style.background = isLogin ? 'transparent' : '#c9a84c';
    document.getElementById('_cb_tab_signup').style.color = isLogin ? 'rgba(240,232,216,0.5)' : '#1a1209';
  };

  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  document.getElementById('_cb_close').onclick = () => modal.remove();

  // Google 로그인
  if(!isKakaoTalk) {
    document.getElementById('_cb_google').onclick = async () => {
      try {
        await _cbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        modal.remove();
        await _saveCard(_cbAuth.currentUser.uid, cardData);
      } catch(e) {
        if(e.code !== 'auth/popup-closed-by-user') alert('Google 로그인 실패: ' + e.message);
      }
    };
  }

  // 로그인
  document.getElementById('_cb_li_btn').onclick = async () => {
    const email = document.getElementById('_cb_li_email').value.trim();
    const pw = document.getElementById('_cb_li_pw').value.trim();
    const err = document.getElementById('_cb_li_err');
    if(!email || !pw) { err.textContent = '이메일과 비밀번호를 입력해주세요.'; return; }
    try {
      await _cbAuth.signInWithEmailAndPassword(email, pw);
      modal.remove();
      await _saveCard(_cbAuth.currentUser.uid, cardData);
    } catch(e) {
      const msgs = {
        'auth/wrong-password':'비밀번호가 틀렸습니다.',
        'auth/user-not-found':'등록되지 않은 이메일입니다.',
        'auth/invalid-email':'이메일 형식이 올바르지 않습니다.',
        'auth/invalid-credential':'이메일 또는 비밀번호가 틀렸습니다.',
      };
      err.textContent = msgs[e.code] || e.message;
    }
  };

  // 회원가입
  document.getElementById('_cb_su_btn').onclick = async () => {
    const email = document.getElementById('_cb_su_email').value.trim();
    const pw = document.getElementById('_cb_su_pw').value.trim();
    const pw2 = document.getElementById('_cb_su_pw2').value.trim();
    const err = document.getElementById('_cb_su_err');
    if(!email || !pw || !pw2) { err.textContent = '모든 항목을 입력해주세요.'; return; }
    if(pw !== pw2) { err.textContent = '비밀번호가 일치하지 않습니다.'; return; }
    if(pw.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
    try {
      await _cbAuth.createUserWithEmailAndPassword(email, pw);
      modal.remove();
      await _saveCard(_cbAuth.currentUser.uid, cardData);
    } catch(e) {
      const msgs = {
        'auth/email-already-in-use':'이미 가입된 이메일입니다. 로그인 탭을 이용해주세요.',
        'auth/weak-password':'비밀번호는 6자 이상이어야 합니다.',
        'auth/invalid-email':'이메일 형식이 올바르지 않습니다.',
      };
      err.textContent = msgs[e.code] || e.message;
    }
  };
}

async function _saveCard(uid, cardData) {
  try {
    const docId = cardData.id || cardData.name.replace(/\s/g, '_');
    const data = {
      ...cardData,
      fullText: document.body.innerText,
      url: cardData.url || window.location.href,
      savedAt: new Date().toISOString()
    };
    await _cbDb.collection('users').doc(uid).collection('cards').doc(docId).set(data);
    const go = confirm('✅ 명함첩에 저장되었습니다!\n명함첩 바로 보기?');
    if(go) window.location.href = 'https://jinjjabg-hub.github.io/cardbook/';
  } catch(err) {
    alert('❌ 저장 실패: ' + err.message);
  }
}

function collectCardData() {
  const title = document.title || '';
  return {
    id: window.location.pathname.replace(/\//g, '_').replace(/^_|_$/g, ''),
    name: title.split('·')[0].trim(),
    url: window.location.href,
    fullText: document.body.innerText
  };
}

function savePhone(cardData) {
  const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${cardData.name||''}\nORG:${cardData.company||''}\nTITLE:${cardData.title||''}\nTEL;TYPE=CELL:${cardData.phone||''}\nEMAIL:${cardData.email||''}\nURL:${cardData.url||window.location.href}\nNOTE:${cardData.bni||''}\nEND:VCARD`;
  const blob = new Blob([vcf], {type:'text/vcard;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (cardData.name||'contact') + '.vcf';
  link.click();
  URL.revokeObjectURL(link.href);
}
