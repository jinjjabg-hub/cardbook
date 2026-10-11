// ===== 카드북 저장 공통 스크립트 =====

// 카카오톡 안드로이드 → 크롬으로 즉시 이동
if(/KAKAOTALK/i.test(navigator.userAgent) && /Android/i.test(navigator.userAgent)) {
  location.href = 'intent://' + location.href.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
}

const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
// 모바일 브라우저는 팝업 로그인이 불안정해서(COOP/타이밍 이슈) redirect를 기본값으로 씀
const _cbIsMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ===== 저장 대기 데이터 보관 =====
// redirect 로그인은 구글 도메인을 왕복하므로 sessionStorage가 유실될 수 있음.
// localStorage를 우선 사용하고, 차단된 환경(사파리 프라이빗 등)에서는 sessionStorage로 폴백.
function _cbStoreSet(k, v){
  try { localStorage.setItem(k, v); } catch(e) {}
  try { sessionStorage.setItem(k, v); } catch(e) {}
}
function _cbStoreGet(k){
  try { const v = localStorage.getItem(k); if(v) return v; } catch(e) {}
  try { return sessionStorage.getItem(k); } catch(e) {}
  return null;
}
function _cbStoreDel(k){
  try { localStorage.removeItem(k); } catch(e) {}
  try { sessionStorage.removeItem(k); } catch(e) {}
}

// ===== 화면 안내 문구 =====
// 카톡·네이버 같은 앱 안 브라우저는 alert()을 막는 경우가 있어서, 결과는 항상 화면 위 문구로 보여준다.
// ms를 0으로 주면 누를 때까지 남아 있다(오류 안내용).
function _cbToast(msg, kind, ms) {
  const old = document.getElementById('_cb_toast');
  if(old) old.remove();
  if(!msg) return;
  const bg = kind === 'error' ? '#5a1f1a' : kind === 'ok' ? '#1a3a2a' : '#2a2416';
  const t = document.createElement('div');
  t.id = '_cb_toast';
  t.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:100000;width:calc(100% - 32px);max-width:400px;background:" + bg + ";color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,0.4);font-size:13px;line-height:1.6;font-family:'Noto Sans KR',sans-serif;white-space:pre-line;cursor:pointer;";
  t.textContent = msg;
  t.onclick = () => t.remove();
  document.body.appendChild(t);
  if(ms !== 0) setTimeout(() => { if(t.parentNode) t.remove(); }, ms || 4000);
}

// 응답이 없으면 기다리지 않고 실패로 처리 (Firestore는 연결이 끊기면 저장 약속이 끝나지 않을 수 있음)
function _cbTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'cb/timeout' }), ms))]);
}

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
    s.onerror = () => { _cbSdkFailed = true; };
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
var _cbSdkFailed = false; // 구글 도구(Firebase) 파일을 못 받아온 경우
let _cbBusy = false;      // 저장 중 중복 누름 방지

function initFirebase(tries) {
  tries = tries || 0;
  // SDK 3종(app/auth/firestore)이 모두 준비될 때까지 재시도
  const ready = typeof firebase !== 'undefined'
    && typeof firebase.initializeApp === 'function'
    && typeof firebase.auth === 'function'
    && typeof firebase.firestore === 'function';
  if(!ready) {
    if(tries < 50) setTimeout(() => initFirebase(tries + 1), 100);
    else console.error('Firebase SDK 로드 실패');
    return;
  }
  if(_cbAuth && _cbDb) return; // 이미 초기화됨
  try {
    const config = {
      apiKey: "AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0",
      authDomain: "mandu-e7c3c.firebaseapp.com",
      projectId: "mandu-e7c3c",
      storageBucket: "mandu-e7c3c.firebasestorage.app",
      messagingSenderId: "196338490174",
      appId: "1:196338490174:web:78dc77e684945aca362a6f"
    };
    if(!firebase.apps || !firebase.apps.length) firebase.initializeApp(config);
    _cbAuth = firebase.auth();
    _cbDb = firebase.firestore();
    // redirect 로그인으로 돌아온 경우 처리
    _cbAuth.getRedirectResult().then(async res => {
      if(res && res.user) {
        const pending = _cbStoreGet('_cbPendingCard');
        if(pending) {
          _cbStoreDel('_cbPendingCard');
          await _saveConsent(res.user.uid);
          await _saveCard(res.user.uid, JSON.parse(pending));
        }
        return;
      }
      // getRedirectResult가 비어 있어도(이미 로그인된 상태로 복귀 등)
      // 대기 중인 명함이 있으면 인증 상태를 기다렸다가 저장한다.
      const pending = _cbStoreGet('_cbPendingCard');
      if(!pending) return;
      const unsub = _cbAuth.onAuthStateChanged(async u => {
        unsub();
        if(!u) {
          // 로그인하러 갔다 왔는데 로그인 정보가 안 넘어온 경우(아이폰 사파리·최신 크롬의 저장소 분리)
          // 예전에는 여기서 아무 표시 없이 끝나서 "눌러도 반응 없음"처럼 보였다.
          _cbStoreDel('_cbPendingCard');
          _cbToast('❌ 로그인 정보를 받지 못했어요.\n카드북에 저장을 한 번 더 눌러주세요.\n(계속 안 되면 이메일 로그인을 써주세요)', 'error', 0);
          return;
        }
        const still = _cbStoreGet('_cbPendingCard');
        if(!still) return;
        _cbStoreDel('_cbPendingCard');
        await _saveConsent(u.uid);
        await _saveCard(u.uid, JSON.parse(still));
      });
    }).catch(err => {
      // ===== 수정: 에러를 침묵시키지 않고 노출 =====
      console.error('리다이렉트 로그인 처리 실패:', err);
      const pending = _cbStoreGet('_cbPendingCard');
      if(pending) {
        _cbStoreDel('_cbPendingCard');
        const msgs = {
          'auth/unauthorized-domain': '이 사이트 도메인이 Firebase에 등록되지 않았습니다. 관리자에게 문의해주세요.',
          'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
          'auth/redirect-cancelled-by-user': '로그인이 취소되었습니다.',
          'auth/web-storage-unsupported': '브라우저의 쿠키/저장소 설정을 확인해주세요. (시크릿 모드는 지원되지 않을 수 있어요)'
        };
        const friendly = msgs[err.code] || ('로그인 처리 중 오류가 발생했습니다: ' + (err.message || err.code || '알 수 없는 오류'));
        _cbToast('❌ ' + friendly + '\n다시 시도해주세요.', 'error', 0);
      }
    });
  } catch(e) {
    console.error('Firebase 초기화 실패', e);
    if(tries < 50) setTimeout(() => initFirebase(tries + 1), 100);
  }
}

const CARDBOOK_BASE = 'https://cardbook.bizmy.net/';

async function saveToCardbook(cardData) {
  if(!cardData) cardData = collectCardData();

  // 1. 카카오톡 브라우저 처리
  if(isKakaoTalk) {
    if(isAndroid) {
      // 안드로이드: 딥링크로 크롬 자동 실행
      const intentUrl = 'intent://' + window.location.href.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
      window.location.href = intentUrl;
      // 딥링크 실패 대비 1.5초 후 안내 팝업
      setTimeout(() => {
        if(document.hasFocus()) _showKakaoGuide();
      }, 1500);
    } else {
      // iOS: 안내 팝업 (iOS는 딥링크 막혀있음)
      _showKakaoGuide();
    }
    return;
  }

  if(_cbBusy) { _cbToast('저장하는 중이에요. 잠시만 기다려주세요…'); return false; }
  _cbBusy = true;
  // 누르자마자 반응을 보여준다 (예전엔 최대 9초 동안 아무 표시가 없었음)
  _cbToast('카드북에 저장하는 중…', 'info', 0);
  try {
    // 2. Firebase 준비 확인 (아직이면 즉시 초기화 시도)
    if(!_cbAuth) initFirebase();

    // 3. 로그인 상태 확인 → 이미 로그인이면 원터치 즉시 저장
    const user = await _cbWaitAuth();
    if(user === 'nosdk') {
      _cbToast('❌ 카드북 연결 도구를 불러오지 못했어요.\n인터넷 연결을 확인하고 다시 눌러주세요.\n(광고 차단 앱이 있으면 잠시 꺼주세요)', 'error', 0);
      return false;
    }
    if(user) return await _saveCard(user.uid, cardData);
    // 첫 사용자만 로그인 (한 번만)
    _cbToast('');
    showLoginModal(cardData);
    return false;
  } finally {
    _cbBusy = false;
  }
}

// ===== Firebase Auth 준비 대기 =====
// 결과: 로그인한 사용자 / null(로그인 안 됨) / 'nosdk'(구글 도구를 못 불러옴)
function _cbWaitAuth() {
  return new Promise(resolve => {
    let done = false;
    const finish = u => { if(!done) { done = true; resolve(u); } };
    const check = () => {
      if(done) return;
      if(_cbAuth) {
        const unsub = _cbAuth.onAuthStateChanged(u => { unsub(); finish(u); });
      } else if(_cbSdkFailed) {
        finish('nosdk');
      } else {
        initFirebase();
        setTimeout(check, 150);
      }
    };
    check();
    // 도구가 6초 안에 준비 안 되면 기다리지 않고 원인을 알려준다
    setTimeout(() => finish(_cbAuth ? _cbAuth.currentUser : 'nosdk'), 6000);
  });
}

// ===== 카카오톡 안내 팝업 =====
function _showKakaoGuide() {
  const url = window.location.href;
  const overlay = document.createElement('div');
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;font-family:'Noto Sans KR',sans-serif;";
  overlay.innerHTML = `
    <div style="background:#141209;border-radius:24px 24px 0 0;padding:28px 24px 44px;width:100%;max-width:430px;border-top:1px solid rgba(254,229,0,0.3);">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:32px;margin-bottom:8px;">⚠️</div>
        <div style="font-size:16px;font-weight:800;color:#FEE500;margin-bottom:6px;">카카오톡에서는 저장이 안돼요</div>
        <div style="font-size:13px;color:rgba(240,232,216,0.6);line-height:1.7;">크롬에서 열어야 명함을 저장할 수 있어요</div>
      </div>
      <div style="background:rgba(254,229,0,0.08);border:1px solid rgba(254,229,0,0.2);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#FEE500;margin-bottom:10px;">📌 방법</div>
        <div style="font-size:13px;color:rgba(240,232,216,0.85);line-height:2.1;">
          1️⃣ 화면 우측 하단 <b style="color:#fff">···</b> 탭<br>
          2️⃣ <b style="color:#fff">다른 브라우저로 열기</b> 선택<br>
          3️⃣ <b style="color:#fff">Chrome</b> 선택 → 명함 저장
        </div>
      </div>
      <button id="_cb_kk_copy" style="width:100%;padding:14px;border-radius:12px;border:none;background:#FEE500;color:#3c1e1e;font-weight:700;font-size:14px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;margin-bottom:10px;">📋 이 페이지 주소 복사하기</button>
      <button onclick="this.closest('[style]').remove()" style="width:100%;padding:12px;border-radius:12px;border:none;background:transparent;color:rgba(240,232,216,0.3);font-size:13px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('_cb_kk_copy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch(e) {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    const btn = document.getElementById('_cb_kk_copy');
    if(btn) { btn.textContent = '✅ 복사됐어요! 크롬에 붙여넣기 하세요'; btn.style.background = '#a0c878'; }
  };
}

// ===== 로그인 모달 (앱 없이 바로 저장) =====
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

  const googleBtn = isKakaoTalk ? `
    <div style="background:rgba(254,229,0,0.1);border:1px solid rgba(254,229,0,0.3);border-radius:12px;padding:14px;margin-bottom:16px;text-align:center;">
      <div style="font-size:13px;font-weight:700;color:#FEE500;margin-bottom:6px;">📌 카카오톡 브라우저 안내</div>
      <div style="font-size:12px;color:rgba(240,232,216,0.7);line-height:1.7;margin-bottom:12px;">Google 로그인은 크롬에서만 가능해요.<br>아래 버튼으로 주소를 복사한 뒤<br>크롬에서 열어주세요.</div>
      <button id="_cb_copy_url" style="width:100%;padding:11px;border-radius:10px;border:none;background:#FEE500;color:#3c1e1e;font-weight:700;font-size:13px;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">📋 주소 복사하기</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 14px;color:rgba(240,232,216,0.3);font-size:11px;">
      <div style="flex:1;height:1px;background:rgba(201,168,76,0.15)"></div>또는 이메일로 로그인<div style="flex:1;height:1px;background:rgba(201,168,76,0.15)"></div>
    </div>` : `
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
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:28px;margin-bottom:8px;">🗂️</div>
        <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px;">명함 저장하기</div>
        <div style="font-size:11px;color:rgba(240,232,216,0.45);">처음 한 번만 로그인하면 다음부터는 원터치로 저장돼요</div>
      </div>

      <label id="_cb_consent_label" style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:10px 12px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;margin-bottom:6px;transition:all 0.2s;">
        <input type="checkbox" id="_cb_consent" style="margin-top:2px;width:15px;height:15px;flex-shrink:0;accent-color:#c9a84c;cursor:pointer;">
        <span style="font-size:11px;color:rgba(240,232,216,0.75);line-height:1.6;">
          <b style="color:#c9a84c;">[필수]</b> 개인정보 수집·이용에 동의합니다.
          <a href="https://cardbook.bizmy.net/privacy.html" target="_blank" style="color:#c9a84c;text-decoration:underline;">방침 보기</a>
        </span>
      </label>
      <div id="_cb_consent_err" style="font-size:11px;color:#ff9e8f;min-height:14px;margin-bottom:6px;padding-left:4px;"></div>

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

  // 체크하는 순간 바로 경고 해제
  document.getElementById('_cb_consent')?.addEventListener('change', function() {
    if(this.checked) {
      const err = document.getElementById('_cb_consent_err');
      const label = document.getElementById('_cb_consent_label');
      if(err) err.textContent = '';
      if(label) { label.style.border = '1px solid rgba(201,168,76,0.25)'; label.style.background = 'rgba(201,168,76,0.08)'; }
    }
  });

  const _consentOk = () => {
    const cb = document.getElementById('_cb_consent');
    const err = document.getElementById('_cb_consent_err');
    const label = document.getElementById('_cb_consent_label');
    if(cb && !cb.checked) {
      if(err) err.textContent = '⚠️ 개인정보 동의에 체크해주세요.';
      if(label) {
        label.style.border = '1.5px solid #ff9e8f';
        label.style.background = 'rgba(255,158,143,0.12)';
        label.scrollIntoView({ behavior: 'smooth', block: 'center' });
        label.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
           { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 300 }
        );
      }
      return false;
    }
    if(err) err.textContent = '';
    if(label) { label.style.border = '1px solid rgba(201,168,76,0.25)'; label.style.background = 'rgba(201,168,76,0.08)'; }
    return true;
  };

  // 카카오톡 — 주소 복사 버튼
  if(isKakaoTalk) {
    document.getElementById('_cb_copy_url').onclick = async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
      } catch(e) {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      document.getElementById('_cb_copy_url').textContent = '✅ 복사됐어요! 크롬에 붙여넣기 하세요';
      document.getElementById('_cb_copy_url').style.background = '#a0c878';
    };
  }

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
      if(!_consentOk()) return;
      if(!_cbAuth) { initFirebase(); await new Promise(r => setTimeout(r, 800)); }
      if(!_cbAuth) { _cbToast('로그인 준비 중입니다. 잠시 후 다시 눌러주세요.', 'error'); return; }
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        // setPersistence를 먼저 기다리면 아이폰 사파리가 "사용자가 누른 동작"으로 보지 않아 팝업을 막는다.
        // 웹에서는 LOCAL이 기본값이라 따로 지정하지 않고 바로 팝업을 연다.
        const standalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
        // 모바일 브라우저는 팝업이 COOP/타이밍 문제로 종종 실패하므로 redirect를 기본값으로 사용
        if(standalone) {
          _cbStoreSet('_cbPendingCard', JSON.stringify(cardData));
          // ===== 수정: 리다이렉트 시작 자체가 실패하는 경우 대비 =====
          try {
            await _cbAuth.signInWithRedirect(provider);
          } catch(redirectErr) {
            _cbStoreDel('_cbPendingCard');
            console.error('signInWithRedirect 시작 실패:', redirectErr);
            _cbToast('❌ 로그인 시작에 실패했습니다: ' + (redirectErr.message || redirectErr.code) + '\n다시 시도해주세요.', 'error', 0);
          }
          return;
        }
        await _cbAuth.signInWithPopup(provider);
        modal.remove();
        await _saveConsent(_cbAuth.currentUser.uid);
        await _saveCard(_cbAuth.currentUser.uid, cardData);
      } catch(e) {
        if(e.code === 'auth/popup-closed-by-user') return;
        // 팝업이 막히면 마지막 수단으로 redirect 재시도
        if(e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request') {
          try {
            _cbStoreSet('_cbPendingCard', JSON.stringify(cardData));
            await _cbAuth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
            return;
          } catch(e2) { _cbToast('❌ Google 로그인 실패: ' + e2.message, 'error', 0); return; }
        }
        _cbToast('❌ Google 로그인 실패: ' + e.message, 'error', 0);
      }
    };
  }

  // 로그인
  document.getElementById('_cb_li_btn').onclick = async () => {
    const email = document.getElementById('_cb_li_email').value.trim();
    const pw = document.getElementById('_cb_li_pw').value.trim();
    const err = document.getElementById('_cb_li_err');
    if(!_consentOk()) return;
    if(!email || !pw) { err.textContent = '이메일과 비밀번호를 입력해주세요.'; return; }
    if(!_cbAuth) { initFirebase(); await new Promise(r => setTimeout(r, 800)); }
    if(!_cbAuth) { err.textContent = '로그인 준비 중입니다. 잠시 후 다시 시도해주세요.'; return; }
    try {
      await _cbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await _cbAuth.signInWithEmailAndPassword(email, pw);
      modal.remove();
      await _saveConsent(_cbAuth.currentUser.uid);
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
    if(!_consentOk()) return;
    if(!email || !pw || !pw2) { err.textContent = '모든 항목을 입력해주세요.'; return; }
    if(!_cbAuth) { initFirebase(); await new Promise(r => setTimeout(r, 800)); }
    if(!_cbAuth) { err.textContent = '로그인 준비 중입니다. 잠시 후 다시 시도해주세요.'; return; }
    if(pw !== pw2) { err.textContent = '비밀번호가 일치하지 않습니다.'; return; }
    if(pw.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
    try {
      await _cbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await _cbAuth.createUserWithEmailAndPassword(email, pw);
      modal.remove();
      await _saveConsent(_cbAuth.currentUser.uid);
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

// ===== 동의 기록 저장 =====
async function _saveConsent(uid) {
  try {
    await _cbDb.collection('consents').doc(uid).set({
      uid,
      agreedAt: firebase.firestore.FieldValue.serverTimestamp(),
      agreedAtISO: new Date().toISOString(),
      version: '2026-06-04',
      method: 'dica-save-modal'
    }, { merge: true });
  } catch(e) { console.error('동의 기록 실패', e); }
}

// URL 정규화: 프로토콜·쿼리·해시·index.html·끝 슬래시 제거 + 퍼센트 인코딩 통일
function _cbNormUrl(url) {
  if(!url) return '';
  let u = String(url).trim();
  try { u = decodeURIComponent(u); } catch(e) {}
  u = u.toLowerCase();
  u = u.replace(/^https?:\/\//, '').replace(/#.*$/, '').replace(/\?.*$/, '');
  u = u.replace(/index\.html$/, '').replace(/\/+$/, '');
  return u;
}

async function _saveCard(uid, cardData) {
  try {
    const data = {
      ...cardData,
      fullText: document.body.innerText,
      url: cardData.url || window.location.href,
      savedAt: new Date().toISOString()
    };
    let docId = cardData.id || cardData.name.replace(/\s/g, '_');
    // 중복 방지: 같은 이름의 기존 카드 중 URL이 같은(또는 URL 없는) 카드가 있으면 그 문서에 덮어쓰기
    try {
      const snap = await _cbTimeout(_cbDb.collection('users').doc(uid).collection('cards')
        .where('name', '==', data.name).get(), 6000);
      const nu = _cbNormUrl(data.url);
      snap.docs.forEach(d => {
        const ex = d.data();
        if(!ex.url || _cbNormUrl(ex.url) === nu) docId = d.id;
      });
    } catch(e) {}
    await _cbTimeout(_cbDb.collection('users').doc(uid).collection('cards').doc(docId).set(data, { merge: true }), 15000);
    _cbToast('');
    _showSaveSuccess(cardData);
    // 명함 페이지가 "저장 성공"만 셀 수 있도록 알린다 (누른 횟수가 아니라 실제 저장 수)
    try { window.dispatchEvent(new CustomEvent('cardbook:saved', { detail: { name: data.name, url: data.url } })); } catch(e) {}
    return true;
  } catch(err) {
    console.error('_saveCard 실패:', err);
    const msg = err.code === 'cb/timeout'
      ? '카드북 서버 응답이 없어요. 인터넷 연결을 확인하고 다시 눌러주세요.'
      : err.code === 'permission-denied'
        ? '저장 권한이 없어요. 로그아웃 후 다시 로그인해주세요.'
        : (err.message || err.code || '알 수 없는 오류');
    _cbToast('❌ 저장 실패: ' + msg, 'error', 0);
    return false;
  }
}

// ===== 저장 성공 바텀시트 =====
function _showSaveSuccess(cardData) {
  const old = document.getElementById('_cb_success');
  if(old) old.remove();
  const sheet = document.createElement('div');
  sheet.id = '_cb_success';
  sheet.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;width:calc(100% - 32px);max-width:400px;background:#1a3a2a;border-radius:16px;padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,0.4);display:flex;align-items:center;gap:12px;font-family:'Noto Sans KR',sans-serif;animation:_cbSlideUp 0.3s ease;";
  sheet.innerHTML = `
    <style>@keyframes _cbSlideUp{from{transform:translate(-50%,20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}</style>
    <div style="font-size:24px;">✅</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:700;color:#fff;">${cardData.name || ''}님 명함이 저장됐어요</div>
      <div style="font-size:11px;color:rgba(240,250,244,0.55);margin-top:2px;">내 카드북에서 언제든 확인할 수 있어요</div>
    </div>
    <button onclick="window.location.href='https://cardbook.bizmy.net/?install=1'" style="flex-shrink:0;padding:9px 14px;border-radius:10px;border:none;background:#a07820;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">명함첩 보기</button>
  `;
  document.body.appendChild(sheet);
  setTimeout(() => { if(sheet.parentNode) sheet.remove(); }, 6000);
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

// ===== 연락처 저장 (모든 명함 공통) =====
// 웹페이지는 폰 연락처에 직접 쓸 수 없다(아이폰·안드로이드 보안 정책). 그래서
//  - 안드로이드: 연락처 파일(이름.vcf)을 받고 → 그 파일을 눌러 → 연락처 앱에서 [저장]  (단계 안내를 띄움)
//  - 아이폰: 연락처 카드를 바로 열어 → [새로운 연락처 생성]
//  - PC: 파일 내려받기
// 명함 페이지는 연락처 내용(vCard 글자)만 넘기면 된다. opts.iosUrl: 아이폰용으로 올려둔 .vcf 주소(있으면 우선 사용)
function cbSaveContact(vcf, opts) {
  opts = opts || {};
  vcf = String(vcf || '').replace(/\r?\n/g, '\r\n').replace(/(\r\n)*$/, '\r\n');
  const fnLine = vcf.match(/^FN[^:\r\n]*:(.*)$/m);
  const name = ((fnLine && fnLine[1]) || '연락처').trim();
  const fileName = name.replace(/[\\/:*?"<>|]/g, '') + '.vcf';
  const url = URL.createObjectURL(new Blob([vcf], { type: 'text/x-vcard;charset=utf-8' }));
  const ua = navigator.userAgent;
  if(/iPhone|iPad|iPod/i.test(ua)) {
    _cbToast('📞 연락처 카드가 열리면\n[새로운 연락처 생성]을 눌러주세요', 'ok', 8000);
    setTimeout(() => { location.href = opts.iosUrl || url; }, 300);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  if(/Android/i.test(ua)) _cbContactSteps(fileName);
  else _cbToast('📞 내려받은 ' + fileName + ' 파일을 열어 연락처에 추가해주세요', 'ok', 8000);
}

// 안드로이드용: 누를 때까지 남아 있는 단계 안내
function _cbContactSteps(fileName) {
  const old = document.getElementById('_cb_contact_steps');
  if(old) old.remove();
  const f = fileName.replace(/[<>&"]/g, '');
  const m = document.createElement('div');
  m.id = '_cb_contact_steps';
  m.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;font-family:'Noto Sans KR',sans-serif;";
  m.innerHTML = '<div style="background:#fff;color:#222;width:100%;max-width:430px;border-radius:20px 20px 0 0;padding:24px 22px 32px;text-align:left;">'
    + '<div style="font-size:17px;font-weight:800;margin-bottom:14px;">📞 연락처 저장 2단계</div>'
    + '<div style="font-size:15px;line-height:1.9;">'
    + '<b>①</b> <b style="color:#b8540c;">' + f + '</b> 를 누르세요<br>'
    + '<span style="font-size:13px;color:#777;line-height:1.7;display:block;margin:2px 0 6px 22px;">"파일을 다시 다운로드?" 창이 뜨면 → 창 안의 파란 글씨 <b>' + f + '</b><br>창이 안 뜨면 → 화면 아래·위 알림의 <b>' + f + '</b></span>'
    + '<b>②</b> 연락처 앱이 열리면 <b style="color:#b8540c;">[저장]</b></div>'
    + '<button style="margin-top:18px;width:100%;padding:13px;border:none;border-radius:12px;background:#b8540c;color:#fff;font-size:15px;font-weight:700;">확인</button></div>';
  m.onclick = e => { if(e.target === m || e.target.tagName === 'BUTTON') m.remove(); };
  document.body.appendChild(m);
}

function savePhone(cardData) {
  const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${cardData.name||''}\nORG:${cardData.company||''}\nTITLE:${cardData.title||''}\nTEL;TYPE=CELL:${cardData.phone||''}\nEMAIL:${cardData.email||''}\nURL:${cardData.url||window.location.href}\nNOTE:${cardData.bni||''}\nEND:VCARD`;
  cbSaveContact(vcf);
}
