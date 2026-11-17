// ===== 카드북 추가 기능 (index.html 본문 스크립트보다 먼저 불러온다 — 함수는 화면을 그릴 때 불린다) =====
// 1) 소개하기  2) 다시 연락 알림  3) 태그  4) 모임 공유 명함첩  5) 문장 검색  6) 행사 모드  7) 내 명함 통계
// 왜 한 파일로 뺐나: index.html이 4천 줄이라, 새 기능은 여기 모아 두고 index.html에는 "부르는 자리"만 둔다.
// index.html의 전역(allCards, currentUser, db, cbProfile, myDicaUrl, showToast, applyFilter …)을 그대로 쓴다.

(function cbxStyle() {
  const st = document.createElement('style');
  st.textContent = `
.cbx-back{position:fixed;inset:0;background:rgba(10,20,40,.55);z-index:650;display:flex;align-items:flex-end;justify-content:center;font-family:'Noto Sans KR',sans-serif;}
.cbx-sheet{background:#f6f8fc;border-radius:22px 22px 0 0;width:100%;max-width:430px;max-height:90vh;overflow-y:auto;padding:22px 20px 28px;box-sizing:border-box;color:#16305e;}
.cbx-full{position:fixed;inset:0;background:#f6f8fc;z-index:640;display:flex;flex-direction:column;font-family:'Noto Sans KR',sans-serif;color:#16305e;}
.cbx-full-head{padding:16px 18px 12px;border-bottom:1px solid rgba(37,99,235,.12);display:flex;align-items:center;gap:10px;}
.cbx-full-head button.back{border:none;background:none;font-size:22px;cursor:pointer;color:#16305e;padding:0 4px;}
.cbx-full-body{flex:1;overflow-y:auto;padding:14px 16px 28px;}
.cbx-h{font-size:16px;font-weight:800;margin-bottom:4px;}
.cbx-sub{font-size:12px;color:#64748b;line-height:1.6;margin-bottom:14px;}
.cbx-lab{font-size:11.5px;font-weight:700;color:#5b7bb0;margin:12px 0 5px;}
.cbx-in{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:11px;border:1.5px solid rgba(37,99,235,.2);font-size:14px;outline:none;font-family:inherit;background:#fff;color:#16305e;}
textarea.cbx-in{line-height:1.6;resize:vertical;}
.cbx-btn{width:100%;padding:13px;border-radius:12px;border:none;background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:10px;}
.cbx-btn.ghost{background:#fff;color:#16305e;border:1.5px solid rgba(37,99,235,.2);}
.cbx-btn.plain{background:transparent;color:#94a3b8;font-weight:500;font-size:13px;}
.cbx-btn.danger{background:rgba(200,16,46,.08);color:#c8102e;}
.cbx-row{display:flex;align-items:center;gap:10px;padding:11px 4px;border-bottom:1px solid rgba(37,99,235,.08);}
.cbx-row-body{flex:1;min-width:0;}
.cbx-row-name{font-size:14px;font-weight:700;color:#16305e;}
.cbx-row-sub{font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;}
.cbx-mini{flex-shrink:0;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:700;padding:8px 12px;border-radius:9px;cursor:pointer;font-family:inherit;text-decoration:none;}
.cbx-mini.ghost{background:rgba(37,99,235,.09);color:#2563eb;}
.cbx-mini:disabled{background:rgba(37,99,235,.1);color:#64748b;cursor:default;}
.cbx-quick{display:flex;flex-wrap:wrap;gap:8px;}
.cbx-quick button{flex:1 1 28%;padding:11px 4px;border-radius:11px;border:1.5px solid rgba(37,99,235,.2);background:#fff;color:#16305e;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}
.cbx-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
.cbx-tag{font-size:10.5px;font-weight:700;color:#1d4ed8;background:rgba(37,99,235,.1);border-radius:999px;padding:2px 8px;cursor:pointer;}
.cbx-follow{font-size:10.5px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:999px;padding:2px 8px;cursor:pointer;}
.cbx-follow.due{color:#fff;background:#dc2626;}
.cbx-intro-log{font-size:11.5px;color:#475569;line-height:1.7;background:rgba(37,99,235,.05);border-radius:10px;padding:8px 10px;margin-top:8px;}
.cbx-intro-log b{color:#16305e;}
.cbx-intro-log small{color:#94a3b8;}
.act-intro{background:#2563eb;border:1px solid #2563eb;color:#fff;}
.act-follow{background:#fffbeb;border:1px solid #fde68a;color:#92400e;}
#tagBar{padding:8px 16px 0;}
.cbx-tagrow{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;}
.cbx-tagchip{flex-shrink:0;border:1px solid rgba(37,99,235,.2);background:#fff;color:#16305e;font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;cursor:pointer;font-family:inherit;white-space:nowrap;}
.cbx-tagchip.on{background:#16305e;color:#fff;border-color:#16305e;}
.cbx-tagchip.add{border-style:dashed;color:#2563eb;}
.cbx-tagacts{display:flex;gap:8px;margin-top:6px;}
.cbx-tagacts button{flex:1;border:1px solid rgba(37,99,235,.2);background:rgba(255,255,255,.8);color:#16305e;font-size:12px;font-weight:700;padding:8px 6px;border-radius:10px;cursor:pointer;font-family:inherit;}
.cbx-ai-btn{display:block;width:calc(100% - 32px);margin:10px 16px 0;padding:11px 12px;border-radius:12px;border:1.5px dashed rgba(37,99,235,.4);background:rgba(255,255,255,.75);color:#1d4ed8;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;text-align:left;}
.cbx-ai-btn small{display:block;font-weight:500;color:#64748b;font-size:11px;margin-top:2px;}
.cbx-ai-res{margin:10px 16px 0;padding:11px 12px;border-radius:12px;background:#eef4ff;color:#16305e;font-size:12.5px;line-height:1.6;font-family:'Noto Sans KR',sans-serif;}
.cbx-due-item{display:flex;align-items:center;gap:6px;padding:9px 0;border-top:1px solid rgba(37,99,235,.08);}
.cbx-due-item:first-of-type{border-top:none;}
.cbx-event{margin-top:16px;padding-top:14px;border-top:1px dashed rgba(37,99,235,.25);text-align:left;}
.cbx-check{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#475569;margin-top:12px;}
.cbx-check input{width:17px;height:17px;}
`;
  document.head.appendChild(st);
})();

// ---------- 공통 도우미 ----------
// 날짜는 사용자의 현지 날짜(YYYY-MM-DD)로 다룬다 — toISOString은 UTC라 한국 오전 9시 전에는 하루가 밀린다.
function cbxDay(off) {
  const d = new Date(); d.setDate(d.getDate() + (off || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function cbxShortDay(iso) { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : ''; }
function cbxDaysFrom(day) { return Math.round((new Date(cbxDay(0)) - new Date(day)) / 86400000); }
function cbxCard(id) { return allCards.find(c => c.docId === id); }
function cbxRef(id) { return db.collection('users').doc(currentUser.uid).collection('cards').doc(id); }
function cbxMe() { return (typeof cbProfile !== 'undefined' && cbProfile.name) || currentUser.displayName || ''; }
function cbxClose(id) { const el = document.getElementById(id); if(el) el.remove(); }
function cbxSheet(id, inner) {
  cbxClose(id);
  const back = document.createElement('div');
  back.id = id; back.className = 'cbx-back';
  back.innerHTML = '<div class="cbx-sheet">' + inner + '</div>';
  back.addEventListener('click', e => { if(e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}
function cbxFull(id, title, sub, body) {
  cbxClose(id);
  const m = document.createElement('div');
  m.id = id; m.className = 'cbx-full';
  m.innerHTML = `<div class="cbx-full-head"><button class="back" onclick="cbxClose('${id}')" aria-label="뒤로">←</button>
    <div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800" id="${id}Title">${title}</div><div style="font-size:11px;color:#64748b;margin-top:2px" id="${id}Sub">${sub || ''}</div></div></div>
    <div class="cbx-full-body" id="${id}Body">${body || ''}</div>`;
  document.body.appendChild(m);
  return m;
}
// 검색 중이면 검색 결과를, 아니면 전체 목록을 다시 그린다(스크롤 위치 유지)
function cbxRefresh() {
  const y = window.scrollY;
  const inp = document.getElementById('searchInput');
  if(inp && inp.value.trim() && (window._searchTerms || []).length) onSearch(inp.value); else applyFilter();
  window.scrollTo(0, y);
}
// 문구 보내기: 공유창(카톡·문자 고르기) → 없으면 복사. 보냈으면 true
async function cbxSend(text) {
  if(navigator.share) {
    try { await navigator.share({ text }); return true; }
    catch(e) { if(e.name === 'AbortError') return false; }
  }
  try { await navigator.clipboard.writeText(text); showToast('📋 문구를 복사했어요. 카톡·문자에 붙여넣으세요', 3500); return true; }
  catch(e) { showToast('❌ 복사하지 못했어요. 문구를 길게 눌러 직접 복사해 주세요'); return false; }
}

// =====================================================================
// 1) 소개하기
// 왜: 명함첩을 여는 가장 값진 순간은 "누구 좀 소개해 줘"라는 말을 들었을 때다.
//     받는 분을 고르면 소개 문구를 만들어 주고, 누가 누구에게 소개됐는지 두 명함에 남긴다.
// 저장: 소개한 사람(A) 명함의 intros 배열 [{toId, toName, why, at}] — 받는 분(B) 쪽 이력은 여기서 거꾸로 찾는다.
// =====================================================================
let cbxIntro = null;
let _cbxIntroIdx = null, _cbxIntroIdxFor = null;
function cbxIntroIndex() {   // 받는 분 docId → [{from, at, why}] (목록을 그릴 때마다 전체를 훑지 않게 한 번만 만든다)
  if(_cbxIntroIdx && _cbxIntroIdxFor === allCards) return _cbxIntroIdx;
  const idx = {};
  allCards.forEach(c => (c.intros || []).forEach(i => { if(i.toId) (idx[i.toId] = idx[i.toId] || []).push({ from: c.name || '', at: i.at, why: i.why }); }));
  _cbxIntroIdx = idx; _cbxIntroIdxFor = allCards;
  return idx;
}
function cbxIntroCount() { return allCards.reduce((n, c) => n + (c.intros || []).length, 0); }
function cbxIntroHtml(card) {
  const rows = (card.intros || []).map(i => ({ at: i.at, txt: '→ ' + cbEsc(i.toName) + '님에게 소개함', why: i.why }))
    .concat((cbxIntroIndex()[card.docId] || []).map(i => ({ at: i.at, txt: '← ' + cbEsc(i.from) + '님을 소개해 드림', why: i.why })));
  if(!rows.length) return '';
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `<div class="cbx-intro-log"><b>🤝 소개 이력 ${rows.length}건</b>` + rows.slice(0, 3).map(r =>
    `<div><small>${cbxShortDay(r.at)}</small> ${r.txt}${r.why ? ' <small>· ' + cbEsc(r.why) + '</small>' : ''}</div>`).join('')
    + (rows.length > 3 ? `<div><small>외 ${rows.length - 3}건</small></div>` : '') + '</div>';
}
window.openIntro = function(docId) {
  const a = cbxCard(docId); if(!a) return;
  cbxIntro = { a, b: null, edited: false, saved: false };
  cbxSheet('introSheet', `
    <div class="cbx-h">🤝 ${cbEsc(a.name)}님 소개하기</div>
    <div class="cbx-sub">받는 분을 고르면 소개 문구를 만들어 드려요. 보낸 기록은 두 분 명함에 남아요.</div>
    <div id="introPick">
      <input class="cbx-in" id="introQ" placeholder="받는 분 이름·회사·업종 검색" oninput="cbxIntroSearch(this.value)" autocomplete="off">
      <div id="introList"></div>
    </div>
    <div id="introForm" style="display:none"></div>
    <button class="cbx-btn plain" onclick="cbxClose('introSheet')">닫기</button>`);
  cbxIntroSearch('');
};
window.cbxIntroSearch = function(q) {
  const box = document.getElementById('introList'); if(!box || !cbxIntro) return;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = allCards.filter(c => c.docId !== cbxIntro.a.docId);
  if(terms.length) list = list.filter(c => { const t = _searchText(c); return terms.every(w => t.includes(w)); });
  else list = list.filter(c => c.favorite).concat(list.filter(c => !c.favorite).sort((x, y) => cbSavedTime(y) - cbSavedTime(x)));
  const rows = list.slice(0, 8).map(c => `
    <div class="cbx-row" onclick="cbxIntroPick('${c.docId}')" style="cursor:pointer">
      <div class="cbx-row-body"><div class="cbx-row-name">${cbEsc(c.name) || '이름 없음'} <span style="font-size:11px;color:#64748b;font-weight:500">${cbEsc(c.title)}</span></div>
      <div class="cbx-row-sub">${cbEsc([c.company, c.industry].filter(Boolean).join(' · '))}</div></div>
      <span style="color:#94a3b8;font-size:18px">›</span>
    </div>`).join('');
  const free = q.trim() ? `<div class="cbx-row" onclick="cbxIntroPick('', this.dataset.n)" data-n="${cbEsc(q.trim())}" style="cursor:pointer">
      <div class="cbx-row-body"><div class="cbx-row-name">“${cbEsc(q.trim())}”님에게 보내기</div><div class="cbx-row-sub">명함첩에 없는 분</div></div><span style="color:#94a3b8;font-size:18px">›</span></div>` : '';
  box.innerHTML = rows + free || '<div style="font-size:12px;color:#94a3b8;padding:14px 4px">받는 분 이름을 적어 주세요.</div>';
};
window.cbxIntroPick = function(docId, freeName) {
  if(!cbxIntro) return;
  const c = docId ? cbxCard(docId) : null;
  cbxIntro.b = c ? { docId: c.docId, name: c.name || '', company: c.company || '', title: c.title || '', phone: c.phone || '' }
                 : { docId: '', name: (freeName || '').slice(0, 40), company: '', title: '', phone: '' };
  cbxIntro.edited = false;
  const { a, b } = cbxIntro;
  document.getElementById('introPick').style.display = 'none';
  const f = document.getElementById('introForm');
  f.style.display = 'block';
  f.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:12px;padding:11px 13px;font-size:13.5px;font-weight:700">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cbEsc(a.name)} → ${cbEsc(b.name)}</span>
      <button class="cbx-mini ghost" onclick="cbxIntroBack()">바꾸기</button>
    </div>
    <div class="cbx-lab">소개하는 이유 (선택)</div>
    <input class="cbx-in" id="introWhy" maxlength="80" placeholder="예: 사무실 인테리어를 찾고 계셔서" oninput="cbxIntroDraft()">
    <div class="cbx-lab">${cbEsc(b.name)}님에게 보낼 문구 (고쳐도 돼요)</div>
    <textarea class="cbx-in" id="introMsg" rows="9" oninput="cbxIntro.edited=true"></textarea>
    <label class="cbx-check"><input type="checkbox" id="introFollow" checked> 1주 뒤 “소개 결과 확인” 알림 받기</label>
    <button class="cbx-btn" onclick="cbxIntroSend('b')">① ${cbEsc(b.name)}님에게 보내기</button>
    <button class="cbx-btn ghost" onclick="cbxIntroSend('a')">② ${cbEsc(a.name)}님에게도 알리기</button>`;
  cbxIntroDraft();
};
window.cbxIntroBack = function() {
  document.getElementById('introForm').style.display = 'none';
  document.getElementById('introPick').style.display = 'block';
};
function cbxWho(p) { return [p.company, (p.name || '') + (p.title ? ' ' + p.title : '') + '님'].filter(Boolean).join(' '); }
function cbxIntroText(to) {
  const { a, b } = cbxIntro, me = cbxMe();
  const why = (document.getElementById('introWhy')?.value || '').trim();
  if(to === 'a') return [
    `${a.name}${a.title ? ' ' + a.title : ''}님, 안녕하세요.${me ? ' ' + me + '입니다.' : ''}`,
    `${cbxWho(b)}께 ${a.name}님을 소개해 드렸습니다.`,
    why ? '소개 이유: ' + why : '',
    '곧 연락이 갈 수 있어요.',
    b.phone ? '· 전화: ' + b.phone : '',
  ].filter(Boolean).join('\n');
  return [
    `${b.name}${b.title ? ' ' + b.title : ''}님, 안녕하세요.${me ? ' ' + me + '입니다.' : ''}`,
    why,
    `${cbxWho(a)}을 소개해 드립니다.`,
    a.industry ? '· 하시는 일: ' + a.industry : '',
    a.phone ? '· 전화: ' + a.phone : '',
    a.email ? '· 이메일: ' + a.email : '',
    a.url ? '· 명함: ' + a.url : '',
    '편하실 때 연락 나눠 보세요.',
  ].filter(Boolean).join('\n');
}
window.cbxIntroDraft = function() {
  if(!cbxIntro || cbxIntro.edited) return;   // 사용자가 문구를 직접 고친 뒤에는 덮어쓰지 않는다
  const el = document.getElementById('introMsg'); if(el) el.value = cbxIntroText('b');
};
window.cbxIntroSend = async function(to) {
  if(!cbxIntro || !cbxIntro.b) return;
  const { a, b } = cbxIntro;
  const text = to === 'b' ? document.getElementById('introMsg').value.trim() : cbxIntroText('a');
  if(!text) return;
  const sent = await cbxSend(text);
  if(!sent || cbxIntro.saved) return;
  // 처음 보낸 순간에 한 번만 이력을 남긴다
  cbxIntro.saved = true;
  try {
    const why = (document.getElementById('introWhy')?.value || '').trim().slice(0, 80);
    const rec = { toId: b.docId, toName: b.name, why, at: new Date().toISOString() };
    const patch = { intros: firebase.firestore.FieldValue.arrayUnion(rec) };
    const follow = document.getElementById('introFollow')?.checked;
    if(follow) { patch.followUp = cbxDay(7); patch.followNote = (b.name + '님 소개 결과 확인').slice(0, 60); }
    await cbxRef(a.docId).update(patch);
    a.intros = (a.intros || []).concat(rec);
    if(follow) { a.followUp = patch.followUp; a.followNote = patch.followNote; }
    _cbxIntroIdx = null;
    cbTouch(a.docId);
    cbxRefresh();
    showToast('✅ 소개 이력을 남겼어요' + (follow ? ' · 1주 뒤 알려 드릴게요' : ''), 3000);
  } catch(e) { cbxIntro.saved = false; showToast('❌ 이력을 남기지 못했어요: ' + e.message); }
};

// =====================================================================
// 2) 다시 연락 알림
// 왜: 명함은 받은 날에만 열어 보고 잊는다. "언제 다시 연락할지"를 날짜로 남기면 그날 홈 맨 위에 뜬다.
// 저장: 명함의 followUp('YYYY-MM-DD'), followNote(할 일 한 줄). 웹앱이라 폰 알림(푸시)은 아니고, 앱을 열면 홈에 보인다.
// =====================================================================
window.openFollow = function(docId) {
  const c = cbxCard(docId); if(!c) return;
  const opts = [[1, '내일'], [3, '3일 뒤'], [7, '1주 뒤'], [14, '2주 뒤'], [30, '1달 뒤'], [90, '3달 뒤']];
  cbxSheet('followSheet', `
    <div class="cbx-h">⏰ ${cbEsc(c.name)}님께 다시 연락</div>
    <div class="cbx-sub">${c.followUp ? '지금 알림: <b>' + c.followUp + '</b>' + (c.followNote ? ' · ' + cbEsc(c.followNote) : '') : '날짜를 고르면 그날 홈 화면 맨 위에 알려 드려요.'}</div>
    <div class="cbx-lab">할 일 한 줄 (선택)</div>
    <input class="cbx-in" id="followNote" maxlength="60" value="${cbEsc(c.followNote)}" placeholder="예: 견적서 보내기, 식사 약속 잡기">
    <div class="cbx-lab">언제</div>
    <div class="cbx-quick">${opts.map(([n, l]) => `<button onclick="cbxFollowSave('${docId}', cbxDay(${n}))">${l}</button>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input class="cbx-in" type="date" id="followDate" min="${cbxDay(0)}" value="${c.followUp || ''}" style="flex:1">
      <button class="cbx-mini" onclick="cbxFollowSave('${docId}', document.getElementById('followDate').value)">이 날짜로</button>
    </div>
    ${c.followUp ? `<button class="cbx-btn danger" onclick="cbxFollowSave('${docId}', '')">알림 지우기</button>` : ''}
    <button class="cbx-btn plain" onclick="cbxClose('followSheet')">닫기</button>`);
};
window.cbxFollowSave = async function(docId, day) {
  const c = cbxCard(docId); if(!c) return;
  if(day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) { showToast('❌ 날짜를 골라 주세요'); return; }
  const note = (document.getElementById('followNote')?.value || '').trim().slice(0, 60);
  const del = firebase.firestore.FieldValue.delete();
  try {
    await cbxRef(docId).update(day ? { followUp: day, followNote: note } : { followUp: del, followNote: del });
    if(day) { c.followUp = day; c.followNote = note; } else { delete c.followUp; delete c.followNote; }
    cbxClose('followSheet');
    showToast(day ? '⏰ ' + cbxShortDay(day) + '에 알려 드릴게요' : '알림을 지웠어요');
    cbxRefresh();
  } catch(e) { showToast('❌ ' + e.message); }
};
// 홈에서: 연락했으면 완료(알림 지움 + 마지막 연락일 기록), 아니면 1주 미루기
window.cbxFollowDone = async function(docId) {
  const c = cbxCard(docId); if(!c) return;
  const del = firebase.firestore.FieldValue.delete(), now = new Date().toISOString();
  try {
    await cbxRef(docId).update({ followUp: del, followNote: del, lastContact: now });
    delete c.followUp; delete c.followNote; c.lastContact = now;
    showToast('✅ 완료했어요'); cbxRefresh();
  } catch(e) { showToast('❌ ' + e.message); }
};
window.cbxFollowLater = async function(docId) {
  const c = cbxCard(docId); if(!c) return;
  try { await cbxRef(docId).update({ followUp: cbxDay(7) }); c.followUp = cbxDay(7); showToast('⏰ 1주 뒤로 미뤘어요'); cbxRefresh(); }
  catch(e) { showToast('❌ ' + e.message); }
};
// 홈 맨 위 "오늘 챙길 사람" — 날짜가 된 알림이 있을 때만 보인다(없으면 홈이 조용하도록 아무것도 안 그림)
function cbxHomeFollow() {
  const today = cbxDay(0), week = cbxDay(7);
  const due = allCards.filter(c => c.followUp && c.followUp <= today).sort((a, b) => a.followUp.localeCompare(b.followUp));
  const soon = allCards.filter(c => c.followUp && c.followUp > today && c.followUp <= week).length;
  if(!due.length && !soon) return '';
  const rows = due.slice(0, 8).map(c => {
    const late = cbxDaysFrom(c.followUp);
    return `<div class="cbx-due-item">
      <div class="home-item-body" onclick="openCardFromHome('${c.docId}')" style="cursor:pointer">
        <div class="home-item-name">${cbEsc(c.name) || '이름 없음'} <span style="font-size:10.5px;font-weight:700;color:${late ? '#dc2626' : '#2563eb'}">${late ? late + '일 지남' : '오늘'}</span></div>
        <div class="home-item-sub">${cbEsc(c.followNote || [c.company, c.title].filter(Boolean).join(' · '))}</div>
      </div>
      ${c.phone ? `<a class="cbx-mini" href="tel:${cbEsc(c.phone)}" onclick="cbTouch('${c.docId}')">📞</a>` : ''}
      <button class="cbx-mini ghost" onclick="cbxFollowDone('${c.docId}')">완료</button>
      <button class="cbx-mini ghost" onclick="cbxFollowLater('${c.docId}')">+1주</button>
    </div>`;
  }).join('');
  return `<div class="home-section">
    <div class="home-sec-title">⏰ 오늘 챙길 사람 ${due.length ? due.length + '명' : ''}</div>
    ${rows || '<div class="home-empty">오늘 챙길 사람은 없어요.</div>'}
    ${due.length > 8 ? `<div class="home-empty">외 ${due.length - 8}명</div>` : ''}
    ${soon ? `<div class="home-empty">이번 주 안에 ${soon}명 더 예정돼 있어요.</div>` : ''}
  </div>`;
}

// =====================================================================
// 3) 태그(그룹)
// 왜: 명함이 수백 장이 되면 검색만으로는 "거래처 전부", "동문회 전부"를 한 번에 볼 수 없다.
// 저장: 명함의 tags 배열(최대 10개, 30자). 목록 위 칩으로 걸러 보고, 그 묶음만 내보낼 수 있다.
// =====================================================================
let cbxTagFilter = null;
function cbxParseTags(str) {
  return [...new Set(String(str || '').split(/[,#\n]+/).map(t => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 10);
}
function cbxAllTags() {
  const m = new Map();
  allCards.forEach(c => (c.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function cbxTagMatch(c) { return !cbxTagFilter || (c.tags || []).includes(cbxTagFilter); }
// 명함 이름 아래: 태그 칩 + 다시 연락 칩
function cbxCardChips(card) {
  const tags = (card.tags || []).map(t => `<span class="cbx-tag" data-t="${cbEsc(t)}" onclick="cbxSetTag(this.dataset.t)">#${cbEsc(t)}</span>`).join('');
  const due = card.followUp && card.followUp <= cbxDay(0);
  const fol = card.followUp ? `<span class="cbx-follow${due ? ' due' : ''}" onclick="openFollow('${card.docId}')">⏰ ${cbxShortDay(card.followUp)}${card.followNote ? ' ' + cbEsc(card.followNote) : ''}</span>` : '';
  return tags || fol ? `<div class="cbx-chips">${fol}${tags}</div>` : '';
}
function cbxRenderTagBar() {
  const bar = document.getElementById('tagBar'); if(!bar) return;
  const tags = cbxAllTags();
  if(cbxTagFilter && !tags.some(([t]) => t === cbxTagFilter)) cbxTagFilter = null;
  if(!allCards.length) { bar.innerHTML = ''; return; }
  const chips = tags.map(([t, n]) => `<button class="cbx-tagchip${t === cbxTagFilter ? ' on' : ''}" data-t="${cbEsc(t)}" onclick="cbxSetTag(this.dataset.t)">#${cbEsc(t)} ${n}</button>`).join('');
  const acts = cbxTagFilter ? `<div class="cbx-tagacts">
      <button onclick="cbxTagExport()">📤 이 묶음 엑셀로</button>
      <button onclick="cbxTagToPhone()">📇 이 묶음 폰 연락처로</button>
    </div>` : '';
  bar.innerHTML = `<div class="cbx-tagrow">${tags.length ? `<button class="cbx-tagchip${cbxTagFilter ? '' : ' on'}" onclick="cbxSetTag(null)">전체</button>` : ''}${chips}<button class="cbx-tagchip add" onclick="cbxOpenBulkTag()">🔖 태그 붙이기</button></div>${acts}`;
}
window.cbxSetTag = function(t) {
  cbxTagFilter = (!t || cbxTagFilter === t) ? null : t;
  const inp = document.getElementById('searchInput');
  if(inp && inp.value) { inp.value = ''; window._searchTerms = []; const rc = document.getElementById('refineChips'); if(rc) rc.innerHTML = ''; cbxAiHint('', 0); }
  const cv = document.getElementById('cardsView');
  if(cv && cv.style.display === 'none') showView('cards');
  applyFilter();
  window.scrollTo(0, 0);
};
function cbxTagCards() { return allCards.filter(cbxTagMatch); }
window.cbxTagExport = function() { exportCardsCsv(cbxTagCards(), cbxTagFilter); };
window.cbxTagToPhone = function() {
  const list = cbxTagCards().filter(c => c.phone);
  if(!list.length) { showToast('전화번호가 있는 명함이 없어요'); return; }
  if(confirm('#' + cbxTagFilter + ' ' + list.length + '명을 폰 연락처로 보낼까요?')) _sendVcfToPhone(list);
};
// 여러 장에 한 번에 태그 붙이기
let cbxBulk = null;
window.cbxOpenBulkTag = function() {
  const inp = document.getElementById('searchInput');
  cbxBulk = { sel: new Set(), q: (inp && inp.value.trim()) || '' };
  cbxFull('bulkTag', '🔖 태그 붙이기', '명함을 고르고 태그 이름을 적으면 한 번에 묶여요', `
    <input class="cbx-in" id="bulkTagName" list="bulkTagList" maxlength="30" placeholder="태그 이름 (예: 거래처, 동문회)" value="${cbEsc(cbxTagFilter || '')}">
    <datalist id="bulkTagList">${cbxAllTags().map(([t]) => `<option value="${cbEsc(t)}">`).join('')}</datalist>
    <input class="cbx-in" id="bulkTagQ" placeholder="명함 검색으로 줄이기 (이름·회사·업종·만난 곳)" value="${cbEsc(cbxBulk.q)}" oninput="cbxBulk.q=this.value;cbxBulkRender()" style="margin-top:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 2px 2px;font-size:12px;color:#64748b">
      <span id="bulkTagCount"></span><button class="cbx-mini ghost" onclick="cbxBulkAll()">보이는 명함 전체 선택</button>
    </div>
    <div id="bulkTagRows"></div>
    <button class="cbx-btn" id="bulkTagGo" onclick="cbxBulkApply()" style="position:sticky;bottom:0">태그 붙이기</button>`);
  cbxBulkRender();
};
function cbxBulkList() {
  const terms = cbxBulk.q.toLowerCase().split(/\s+/).filter(Boolean);
  return allCards.filter(c => { const t = _searchText(c); return terms.every(w => t.includes(w)); }).sort(cbNameCompare);
}
window.cbxBulkRender = function() {
  const box = document.getElementById('bulkTagRows'); if(!box) return;
  const list = cbxBulkList();
  box.innerHTML = list.slice(0, 300).map(c => `
    <label class="cbx-row" style="cursor:pointer">
      <input type="checkbox" ${cbxBulk.sel.has(c.docId) ? 'checked' : ''} onchange="cbxBulkToggle('${c.docId}', this.checked)" style="width:18px;height:18px;flex-shrink:0">
      <div class="cbx-row-body"><div class="cbx-row-name">${cbEsc(c.name) || '이름 없음'}</div>
      <div class="cbx-row-sub">${cbEsc([c.company, c.metPlace, (c.tags || []).map(t => '#' + t).join(' ')].filter(Boolean).join(' · '))}</div></div>
    </label>`).join('') + (list.length > 300 ? `<div style="font-size:12px;color:#94a3b8;padding:12px 4px">외 ${list.length - 300}장 — 검색으로 줄여 주세요</div>` : '');
  cbxBulkCount();
};
function cbxBulkCount() {
  const el = document.getElementById('bulkTagCount'); if(el) el.textContent = cbxBulk.sel.size + '장 선택';
  const go = document.getElementById('bulkTagGo'); if(go) go.textContent = cbxBulk.sel.size ? cbxBulk.sel.size + '장에 태그 붙이기' : '태그 붙이기';
}
window.cbxBulkToggle = function(id, on) { if(on) cbxBulk.sel.add(id); else cbxBulk.sel.delete(id); cbxBulkCount(); };
window.cbxBulkAll = function() {
  const list = cbxBulkList(), all = list.every(c => cbxBulk.sel.has(c.docId));
  list.forEach(c => all ? cbxBulk.sel.delete(c.docId) : cbxBulk.sel.add(c.docId));
  cbxBulkRender();
};
window.cbxBulkApply = async function() {
  const tag = cbxParseTags(document.getElementById('bulkTagName').value)[0];
  if(!tag) { showToast('❌ 태그 이름을 적어 주세요'); return; }
  const ids = [...cbxBulk.sel];
  if(!ids.length) { showToast('❌ 명함을 골라 주세요'); return; }
  try {
    for(let i = 0; i < ids.length; i += 400) {   // 한 번에 쓸 수 있는 문서 수 한도(500) 아래로 나눔
      const batch = db.batch();
      ids.slice(i, i + 400).forEach(id => batch.update(cbxRef(id), { tags: firebase.firestore.FieldValue.arrayUnion(tag) }));
      await batch.commit();
    }
    ids.forEach(id => { const c = cbxCard(id); if(c) c.tags = [...new Set((c.tags || []).concat(tag))]; });
    cbxClose('bulkTag');
    cbxTagFilter = tag;
    showToast('🔖 ' + ids.length + '장에 #' + tag + ' 태그를 붙였어요', 3000);
    cbxSetTag(null); cbxSetTag(tag);
  } catch(e) { showToast('❌ ' + e.message); }
};

// =====================================================================
// 4) 모임 공유 명함첩
// 왜: 명함첩은 주변 사람이 같이 써야 값어치가 생긴다. 모임장이 방을 만들고 초대 링크를 돌리면
//     멤버가 "본인 명함"을 직접 올리고, 다른 멤버 명함을 한 번에 담는다. 나가면 명부에서 빠진다.
// 저장: groups/{gid}{name, ownerUid, ownerName} · groups/{gid}/members/{uid}{본인 명함} · users/{uid}.groupIds
// =====================================================================
window.cbxGroupIds = window.cbxGroupIds || [];
let cbxGroup = null;   // 지금 열어 본 모임 {id, name, ownerUid, members:[…]}
const CBX_GID_RE = /^[A-Za-z0-9]{10,40}$/;
// 초대 링크(?join=…)로 들어오면 로그인 왕복 중에도 잃지 않게 보관해 둔다
// (이 파일은 본문 스크립트보다 먼저 실행되므로 본문의 저장 도우미 대신 저장소를 직접 쓴다)
try {
  const _j = new URLSearchParams(location.search).get('join');
  if(_j && CBX_GID_RE.test(_j)) {
    try { localStorage.setItem('cbJoin', _j); } catch(e) {}
    try { sessionStorage.setItem('cbJoin', _j); } catch(e) {}
    const u = new URL(location.href); u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + u.search);
  }
} catch(e) {}
function cbxTakeJoin() {
  let v = null;
  try { v = localStorage.getItem('cbJoin'); localStorage.removeItem('cbJoin'); } catch(e) {}
  try { v = v || sessionStorage.getItem('cbJoin'); sessionStorage.removeItem('cbJoin'); } catch(e) {}
  return v;
}
function cbxMyMember() {
  const p = (typeof cbProfile !== 'undefined' && cbProfile) || {};
  return { name: p.name || currentUser.displayName || '', company: p.company || '', title: p.title || '', phone: p.phone || '',
    email: currentUser.email || '', industry: '', url: myDicaUrl || '' };
}
function cbxMemberForm(m) {
  const f = (id, lab, v, ph, max, type) => `<div class="cbx-lab">${lab}</div><input class="cbx-in" id="${id}" value="${cbEsc(v)}" placeholder="${ph}" maxlength="${max}" ${type ? 'type="' + type + '"' : ''}>`;
  return f('gmName', '이름 *', m.name, '이름', 40) + f('gmCompany', '회사', m.company, '회사·상호', 60) + f('gmTitle', '직함', m.title, '직함', 60)
    + f('gmIndustry', '하는 일', m.industry, '예: 세무·회계, 인테리어', 60) + f('gmPhone', '전화', m.phone, '010-0000-0000', 30, 'tel')
    + f('gmEmail', '이메일', m.email, 'email@example.com', 100, 'email') + f('gmUrl', '디지털 명함·홈페이지 주소', m.url, 'https://', 300, 'url');
}
function cbxReadMemberForm() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const m = { uid: currentUser.uid, name: v('gmName'), company: v('gmCompany'), title: v('gmTitle'), industry: v('gmIndustry'), phone: v('gmPhone'), email: v('gmEmail'), url: v('gmUrl') };
  if(!m.name) { showToast('❌ 이름을 적어 주세요'); return null; }
  if(m.url && !/^https?:\/\//i.test(m.url)) m.url = 'https://' + m.url;
  return m;
}
const cbxGroupsCol = () => db.collection('groups');
const cbxUserDoc = () => db.collection('users').doc(currentUser.uid);
async function cbxLoadGroups() {
  const snap = await cbxUserDoc().get();
  const ids = ((snap.data() || {}).groupIds || []).filter(id => CBX_GID_RE.test(id));
  const out = [], dead = [];
  await Promise.all(ids.map(async id => {
    try { const g = await cbxGroupsCol().doc(id).get(); if(g.exists) out.push({ id, ...g.data() }); else dead.push(id); } catch(e) {}
  }));
  if(dead.length) cbxUserDoc().update({ groupIds: firebase.firestore.FieldValue.arrayRemove(...dead) }).catch(() => {});   // 없어진 모임은 내 목록에서 정리
  window.cbxGroupIds = out.map(g => g.id);
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
window.openGroups = async function() {
  cbxFull('groupsModal', '👥 모임 명함첩', '모임 사람들이 각자 올린 명함을 한 번에 담아요', '<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">불러오는 중...</div>');
  let groups = [];
  try { groups = await cbxLoadGroups(); }
  catch(e) { document.getElementById('groupsModalBody').innerHTML = '<div style="text-align:center;padding:40px 0;color:#c8102e;font-size:13px">모임을 불러오지 못했어요<br><span style="font-size:11px;color:#64748b">' + cbEsc(e.message) + '</span></div>'; return; }
  const body = document.getElementById('groupsModalBody'); if(!body) return;
  const rows = groups.map(g => `
    <div class="cbx-row" onclick="openGroup('${g.id}')" style="cursor:pointer">
      <div class="cbx-row-body"><div class="cbx-row-name">${cbEsc(g.name)}</div>
      <div class="cbx-row-sub">${g.ownerUid === currentUser.uid ? '내가 만든 모임' : '모임장 ' + cbEsc(g.ownerName || '')}</div></div>
      <span style="color:#94a3b8;font-size:18px">›</span>
    </div>`).join('');
  body.innerHTML = (rows || `<div style="background:#fff;border-radius:14px;padding:16px;font-size:13px;line-height:1.8;color:#475569">
      아직 참여한 모임이 없어요.<br><b style="color:#16305e">① 모임을 만들고 → ② 초대 링크를 단톡방에 올리면 → ③ 멤버가 각자 명함을 올려요.</b><br>
      새 멤버는 들어온 날 바로 모든 멤버 명함을 받을 수 있어요.</div>`)
    + `<button class="cbx-btn" onclick="cbxCreateGroup()">＋ 새 모임 만들기</button>`
    + (isAdmin() ? `<button class="cbx-btn ghost" onclick="cbxClose('groupsModal');openMembersModal()">🤝 BNI 멤버 명부 (관리자)</button>` : '');
  renderHome();
};
window.cbxCreateGroup = function() {
  cbxSheet('groupNew', `
    <div class="cbx-h">＋ 새 모임 만들기</div>
    <div class="cbx-sub">모임 이름을 정하고, 내 명함을 첫 번째로 올려요. 올린 정보는 이 모임 멤버에게만 보여요.</div>
    <div class="cbx-lab">모임 이름 *</div>
    <input class="cbx-in" id="gName" maxlength="40" placeholder="예: ○○ 동문회, △△ 챕터, □□ 상인회">
    ${cbxMemberForm(cbxMyMember())}
    <button class="cbx-btn" onclick="cbxCreateGroupGo()">모임 만들기</button>
    <button class="cbx-btn plain" onclick="cbxClose('groupNew')">취소</button>`);
};
window.cbxCreateGroupGo = async function() {
  const name = (document.getElementById('gName').value || '').trim();
  if(!name) { showToast('❌ 모임 이름을 적어 주세요'); return; }
  const m = cbxReadMemberForm(); if(!m) return;
  try {
    const ref = cbxGroupsCol().doc();
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    await ref.set({ name, ownerUid: currentUser.uid, ownerName: m.name, createdAt: ts });   // 모임이 먼저 있어야 멤버 등록 규칙을 통과한다
    await ref.collection('members').doc(currentUser.uid).set({ ...m, joinedAt: ts });
    await cbxUserDoc().set({ groupIds: firebase.firestore.FieldValue.arrayUnion(ref.id) }, { merge: true });
    cbxClose('groupNew'); cbxClose('groupsModal');
    showToast('✅ 모임을 만들었어요. 초대 링크를 보내 보세요', 3500);
    await openGroup(ref.id);
  } catch(e) { showToast('❌ 만들지 못했어요: ' + e.message, 4000); }
};
window.openGroup = async function(gid) {
  cbxFull('groupModal', '모임', '', '<div style="text-align:center;padding:40px 0;color:#64748b;font-size:13px">불러오는 중...</div>');
  try {
    const g = await cbxGroupsCol().doc(gid).get();
    if(!g.exists) throw new Error('없어진 모임이에요');
    const ms = await cbxGroupsCol().doc(gid).collection('members').get();
    cbxGroup = { id: gid, ...g.data(), members: ms.docs.map(d => d.data()).sort((a, b) => (a.name || '').localeCompare(b.name || '')) };
    cbxRenderGroup();
  } catch(e) {
    const body = document.getElementById('groupModalBody');
    if(body) body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#c8102e;font-size:13px">모임을 열지 못했어요<br><span style="font-size:11px;color:#64748b">' + cbEsc(e.message) + '</span></div>';
  }
};
function cbxGroupSaved(m) { return !!_findSamePerson(m); }
function cbxRenderGroup() {
  const g = cbxGroup, body = document.getElementById('groupModalBody'); if(!g || !body) return;
  const mine = g.ownerUid === currentUser.uid;
  document.getElementById('groupModalTitle').textContent = '👥 ' + g.name;
  document.getElementById('groupModalSub').textContent = '멤버 ' + g.members.length + '명' + (mine ? ' · 내가 만든 모임' : '');
  const others = g.members.filter(m => m.uid !== currentUser.uid);
  const todo = others.filter(m => !cbxGroupSaved(m)).length;
  const rows = g.members.map(m => {
    const me = m.uid === currentUser.uid, saved = !me && cbxGroupSaved(m);
    return `<div class="cbx-row">
      <div class="cbx-row-body"><div class="cbx-row-name">${cbEsc(m.name)} <span style="font-size:11px;color:#64748b;font-weight:500">${cbEsc(m.title)}</span>${me ? ' <span style="font-size:10.5px;color:#2563eb">나</span>' : ''}</div>
      <div class="cbx-row-sub">${cbEsc([m.company, m.industry].filter(Boolean).join(' · '))}</div></div>
      ${me ? `<button class="cbx-mini ghost" onclick="cbxEditMyMember()">고치기</button>`
           : `<button class="cbx-mini" ${saved ? 'disabled' : ''} onclick="cbxGroupSave('${m.uid}')">${saved ? '✓ 저장됨' : '+ 담기'}</button>`}
      ${mine && !me ? `<button class="cbx-mini ghost" onclick="cbxKick('${m.uid}')" aria-label="내보내기">✕</button>` : ''}
    </div>`;
  }).join('');
  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <button class="cbx-btn" style="margin-top:0;flex:1" onclick="cbxInvite()">🔗 초대 링크 보내기</button>
      <button class="cbx-btn ghost" style="margin-top:0;flex:1" ${todo ? '' : 'disabled'} onclick="cbxGroupSaveAll()">${todo ? '📥 ' + todo + '명 모두 담기' : '✓ 모두 담았어요'}</button>
    </div>
    ${rows}
    <button class="cbx-btn danger" onclick="${mine ? 'cbxDeleteGroup()' : 'cbxLeaveGroup()'}">${mine ? '모임 삭제' : '이 모임에서 나가기'}</button>`;
}
function cbxMemberCard(m) {
  return { name: m.name || '', title: m.title || '', company: m.company || '', phone: m.phone || '', email: m.email || '',
    industry: m.industry || '', url: m.url || '', chapter: cbxGroup.name, referrer: '모임 명함첩' };
}
window.cbxGroupSave = async function(uid) {
  const m = cbxGroup && cbxGroup.members.find(x => x.uid === uid); if(!m) return;
  try { const r = await upsertCard(cbxMemberCard(m), 'grp'); _saveToast(r, m.name, '명함을 담았어요'); await loadCards(); cbxRenderGroup(); }
  catch(e) { showToast('❌ ' + e.message); }
};
window.cbxGroupSaveAll = async function() {
  const list = cbxGroup.members.filter(m => m.uid !== currentUser.uid && !cbxGroupSaved(m));
  if(!list.length) return;
  showToast('⏳ ' + list.length + '명 담는 중…', 8000);
  try {
    const ids = [];
    for(const m of list) { const r = await upsertCard(cbxMemberCard(m), 'grp'); if(!r.merged) ids.push(r.docId); }
    await loadCards(); cbxRenderGroup();
    showToast('✅ ' + list.length + '명의 명함을 담았어요', 3000);
    askPhoneSave(ids);
  } catch(e) { showToast('❌ ' + e.message); }
};
window.cbxInvite = async function() {
  const url = location.origin + location.pathname + '?join=' + cbxGroup.id;
  await cbxSend(`[${cbxGroup.name}] 모임 명함첩에 초대합니다.\n아래 링크에서 내 명함을 올리면 멤버 명함을 한 번에 받을 수 있어요.\n${url}`);
};
window.cbxEditMyMember = function() {
  const m = cbxGroup.members.find(x => x.uid === currentUser.uid) || cbxMyMember();
  cbxSheet('groupMe', `<div class="cbx-h">✏️ 이 모임에 올린 내 명함</div><div class="cbx-sub">고치면 멤버들이 보는 명부에 바로 반영돼요.</div>
    ${cbxMemberForm(m)}<button class="cbx-btn" onclick="cbxJoinGo('${cbxGroup.id}', true)">저장</button><button class="cbx-btn plain" onclick="cbxClose('groupMe')">취소</button>`);
};
// 참여(또는 내 명함 고치기): 내 명함을 모임에 올린다
window.cbxJoinGo = async function(gid, edit) {
  const m = cbxReadMemberForm(); if(!m) return;
  try {
    const ref = cbxGroupsCol().doc(gid).collection('members').doc(currentUser.uid);
    const old = edit ? cbxGroup.members.find(x => x.uid === currentUser.uid) : null;
    await ref.set({ ...m, joinedAt: (old && old.joinedAt) || firebase.firestore.FieldValue.serverTimestamp() });
    await cbxUserDoc().set({ groupIds: firebase.firestore.FieldValue.arrayUnion(gid) }, { merge: true });
    if(!window.cbxGroupIds.includes(gid)) window.cbxGroupIds.push(gid);
    cbxClose('groupMe'); cbxClose('groupJoin');
    showToast(edit ? '✅ 고쳤어요' : '✅ 모임에 참여했어요');
    await openGroup(gid);
    renderHome();
  } catch(e) { showToast('❌ ' + (e.code === 'permission-denied' ? '참여하지 못했어요. 초대 링크가 맞는지 확인해 주세요' : e.message), 4000); }
};
window.cbxLeaveGroup = async function() {
  const g = cbxGroup; if(!g || !confirm('"' + g.name + '" 모임에서 나갈까요?\n내 명함이 이 모임 명부에서 빠져요. (이미 담아 둔 명함은 그대로 남아요)')) return;
  try {
    await cbxGroupsCol().doc(g.id).collection('members').doc(currentUser.uid).delete();
    await cbxUserDoc().update({ groupIds: firebase.firestore.FieldValue.arrayRemove(g.id) });
    cbxClose('groupModal'); showToast('모임에서 나왔어요'); openGroups();
  } catch(e) { showToast('❌ ' + e.message); }
};
async function cbxWipeGroup(gid) {
  const ms = await cbxGroupsCol().doc(gid).collection('members').get();
  for(let i = 0; i < ms.docs.length; i += 400) { const b = db.batch(); ms.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
  await cbxGroupsCol().doc(gid).delete();
}
window.cbxDeleteGroup = async function() {
  const g = cbxGroup; if(!g || !confirm('"' + g.name + '" 모임을 삭제할까요?\n멤버 ' + g.members.length + '명의 명부가 모두 사라져요. (각자 담아 둔 명함은 남아요)')) return;
  try {
    await cbxWipeGroup(g.id);
    await cbxUserDoc().update({ groupIds: firebase.firestore.FieldValue.arrayRemove(g.id) });
    cbxClose('groupModal'); showToast('모임을 삭제했어요'); openGroups();
  } catch(e) { showToast('❌ ' + e.message); }
};
window.cbxKick = async function(uid) {
  const m = cbxGroup.members.find(x => x.uid === uid); if(!m || !confirm(m.name + '님을 이 모임에서 내보낼까요?')) return;
  try {
    await cbxGroupsCol().doc(cbxGroup.id).collection('members').doc(uid).delete();
    cbxGroup.members = cbxGroup.members.filter(x => x.uid !== uid);
    cbxRenderGroup(); showToast('내보냈어요');
  } catch(e) { showToast('❌ ' + e.message); }
};
// 초대 링크로 들어온 사람: 모임 이름을 보여 주고 내 명함을 올리게 한다
async function cbxShowJoin(gid) {
  try {
    const g = await cbxGroupsCol().doc(gid).get();
    if(!g.exists) { showToast('❌ 없어졌거나 잘못된 초대 링크예요', 4000); return; }
    const ids = ((await cbxUserDoc().get()).data() || {}).groupIds || [];
    if(ids.includes(gid)) { openGroup(gid); return; }
    cbxSheet('groupJoin', `
      <div class="cbx-h">👥 ${cbEsc(g.data().name)}</div>
      <div class="cbx-sub">모임장 ${cbEsc(g.data().ownerName || '')}님이 초대했어요.<br>내 명함을 올리면 이 모임 멤버들의 명함을 한 번에 받을 수 있어요. 올린 정보는 <b>이 모임 멤버에게만</b> 보여요.</div>
      ${cbxMemberForm(cbxMyMember())}
      <button class="cbx-btn" onclick="cbxJoinGo('${gid}')">내 명함 올리고 참여하기</button>
      <button class="cbx-btn plain" onclick="cbxClose('groupJoin')">다음에</button>`);
  } catch(e) { showToast('❌ 모임을 열지 못했어요: ' + e.message, 4000); }
}
// 계정 삭제 때: 내가 만든 모임은 지우고, 참여한 모임에서는 내 명함을 뺀다
async function cbxLeaveAllGroups() {
  const ids = ((await cbxUserDoc().get()).data() || {}).groupIds || [];
  for(const gid of ids) {
    try {
      const g = await cbxGroupsCol().doc(gid).get();
      if(g.exists && g.data().ownerUid === currentUser.uid) await cbxWipeGroup(gid);
      else await cbxGroupsCol().doc(gid).collection('members').doc(currentUser.uid).delete();
    } catch(e) {}
  }
}
function cbxHomeGroups() {
  const n = (window.cbxGroupIds || []).length;
  return `<div class="home-section" onclick="openGroups()" style="cursor:pointer;display:flex;align-items:center;gap:8px">
    <div style="flex:1"><div class="home-sec-title" style="margin-bottom:2px">👥 모임 명함첩${n ? ' ' + n + '곳' : ''}</div>
    <div class="home-item-sub">${n ? '멤버 명함을 한 번에 담고, 초대 링크를 보내요' : '모임을 만들고 초대 링크를 돌리면 멤버가 각자 명함을 올려요'}</div></div>
    <span class="home-item-go">›</span></div>`;
}

// =====================================================================
// 5) 문장 검색
// 왜: 이름도 회사도 기억나지 않고 "지난달 부산 행사에서 만난 세무사"처럼 상황만 떠오를 때가 있다.
//     단어 검색으로 못 찾을 때만 누르는 보조 버튼이다(하루 30번, 서버가 센다).
// =====================================================================
function cbxAiHint(q, found) {
  const el = document.getElementById('aiResult'); if(!el) return;
  const words = q.trim().split(/\s+/).filter(Boolean).length;
  el.innerHTML = q.trim() && (found === 0 || words >= 2)
    ? `<button class="cbx-ai-btn" onclick="cbxAiSearch()">🤖 문장으로 찾기<small>예: 지난달 부산 행사에서 만난 세무사 · 명함 내용과 메모를 읽고 찾아요</small></button>` : '';
}
window.cbxAiSearch = async function() {
  const inp = document.getElementById('searchInput'), el = document.getElementById('aiResult');
  const q = (inp && inp.value.trim()) || ''; if(!q || !el) return;
  if(!allCards.length) { showToast('명함이 아직 없어요'); return; }
  const cut = (v, n) => String(v || '').replace(/[|\n\r]+/g, ' ').slice(0, n);
  // 최근에 저장한 명함부터 500장까지, 한 사람을 한 줄로 줄여 보낸다
  const pool = allCards.slice().sort((a, b) => cbSavedTime(b) - cbSavedTime(a)).slice(0, 500);
  const lines = pool.map((c, i) => {
    const t = cbSavedTime(c), d = t ? new Date(t) : null;
    return [i, cut(c.name, 20), cut(c.company, 30), cut(c.title, 20), cut(c.industry, 30), cut(c.chapter, 20), cut(c.metPlace, 40),
      cut((c.tags || []).join(' '), 40), cut(c.memo, 60), cut(c.services, 60), d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : ''].join('|');
  }).join('\n');
  el.innerHTML = '<div class="cbx-ai-res">🤖 명함첩을 읽는 중…</div>';
  try {
    const res = await fetch(CB_WORKER_URL + '/ai-search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: await _idToken(), query: q, summaries: lines, today: cbxDay(0) }) });
    const r = await res.json();
    if(!res.ok || r.error) throw new Error(r.error || ('오류 ' + res.status));
    const cards = (r.matched || []).map(i => pool[i]).filter(Boolean);
    const rc = document.getElementById('refineChips'); if(rc) rc.innerHTML = '';
    window._searchTerms = window._searchTerms && window._searchTerms.length ? window._searchTerms : [q.toLowerCase()];   // 검색 결과 화면 유지(즐겨찾기 묶음 없이 순서 그대로)
    renderCards(cards);
    el.innerHTML = `<div class="cbx-ai-res">🤖 <b>${cards.length}명</b>을 찾았어요${r.summary ? ' · ' + cbEsc(r.summary) : ''}${cards.length ? '' : '<br>다른 말로 다시 적어 보세요.'}</div>`;
  } catch(e) { el.innerHTML = '<div class="cbx-ai-res">❌ ' + cbEsc(e.message) + '</div>'; }
};

// =====================================================================
// 6) 행사 모드
// 왜: 명함을 여러 장 받는 날은 대부분 행사·모임 날이다. 행사 이름을 한 번 적어 두면
//     그날 넣는 명함마다 "만난 곳"과 태그로 자동 기록되고, 연속으로 찍어 한꺼번에 인식한다.
// 이 기기에만 기억하고 날짜가 바뀌면 자동으로 꺼진다.
// =====================================================================
function cbxEvent() {
  try { const e = JSON.parse(localStorage.getItem('cbEvent') || 'null'); if(e && e.day === cbxDay(0) && e.name) return e.name; } catch(e) {}
  return '';
}
window.cbxSetEvent = function(v) {
  try { localStorage.setItem('cbEvent', JSON.stringify({ name: String(v || '').trim().slice(0, 30), day: cbxDay(0) })); } catch(e) {}
};
function cbxEventPatch(card) {
  const ev = cbxEvent(); if(!ev) return card;
  if(!card.metPlace) card.metPlace = ev;
  card.tags = [...new Set((card.tags || []).concat(ev))];
  return card;
}
function cbxEventInit() { const el = document.getElementById('eventName'); if(el) el.value = cbxEvent(); }
window.cbxBurst = async function() {
  if(!(window.CardCamera && CardCamera.supported())) { showToast('이 폰은 연속 촬영이 안 돼요. 갤러리에서 여러 장을 골라 주세요', 3500); triggerGallery(); return; }
  const files = [];
  try {
    for(;;) {
      const f = await CardCamera.open({ diag: isAdmin() });
      if(!f) break;   // 촬영 화면을 닫으면 끝
      files.push(f);
      showToast('📸 ' + files.length + '장 찍었어요 · 다 찍었으면 촬영 화면을 닫으세요', 2500);
    }
  } catch(e) { if(!files.length) { showToast('카메라를 열지 못했어요. 갤러리에서 골라 주세요'); triggerGallery(); return; } }
  if(!files.length) return;
  if(files.length === 1) handleOcrFile({ target: { files, value: '' } }); else handleOcrBatch(files);
};

// =====================================================================
// 7) 내 명함 통계
// 왜: 내 디지털 명함이 실제로 몇 번 열리고 몇 명이 저장했는지 보여야 명함을 돌린 보람이 숫자로 남는다.
// 숫자는 서버가 cardStats/{내 uid}에 쌓는다(명함 페이지가 열릴 때·저장될 때). 집계를 시작한 뒤부터 센다.
// =====================================================================
let cbxStats = null;
async function cbxLoadStats() {
  if(!myDicaUrl) return;
  try { const d = await db.collection('cardStats').doc(currentUser.uid).get(); cbxStats = d.exists ? d.data() : {}; renderHome(); } catch(e) {}
}
function cbxHomeStats() {
  let html = '';
  const intro = cbxIntroCount();
  if(intro) html += `<div class="home-stat"><div class="home-stat-num">${intro}</div><div class="home-stat-label">소개</div></div>`;
  if(myDicaUrl && cbxStats) {
    const d = new Date(), m = d.getUTCFullYear() + '_' + String(d.getUTCMonth() + 1).padStart(2, '0');   // 서버와 같은 달 기준(UTC)
    const tile = (k, lab) => `<div class="home-stat"><div class="home-stat-num">${cbxStats[k] || 0}</div><div class="home-stat-label">${lab}${cbxStats[k + '_' + m] ? ' · 이달 ' + cbxStats[k + '_' + m] : ''}</div></div>`;
    html += tile('views', '내 명함 열람') + tile('saves', '저장한 사람');
  }
  return html;
}

// 로그인하고 명함을 다 불러온 뒤 한 번 부른다(index.html)
async function cbxAfterLogin() {
  cbxLoadStats();
  try {
    const gid = cbxTakeJoin();
    if(gid && CBX_GID_RE.test(gid)) await cbxShowJoin(gid);
  } catch(e) {}
}
