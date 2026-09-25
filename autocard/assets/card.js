// ===== AutoCard 명함 렌더링 (제작 앱 미리보기와 공개 명함 페이지가 같은 코드를 쓴다) =====
// 같은 데이터 → 템플릿 함수 6개 중 하나 → HTML. 그래서 미리보기에서 본 모습 그대로 발행된다.

const AC_LANGS = {
  ko: '한국어', en: 'English', ja: '日本語', zh: '中文', vi: 'Tiếng Việt', mn: 'Монгол',
};

// 명함 화면의 고정 문구(버튼 이름 등) — 사용자가 쓴 문구가 아니므로 AI 번역 없이 미리 준비
const AC_UI = {
  ko: { call: '전화', sms: '문자', email: '이메일', save: '카드북에 저장', saveSub: '받은 명함을 명함첩에 한 번에 보관해요', contact: '연락처 저장', referral: '이런 분을 소개해주세요', share: '명함 공유', qr: 'QR 코드', make: '나도 5,900원으로 명함 만들기', copied: '주소가 복사됐어요' },
  en: { call: 'Call', sms: 'Text', email: 'Email', save: 'Save to CardBook', saveSub: 'Keep every card you receive in one place', contact: 'Save contact', referral: 'Who I would love to meet', share: 'Share', qr: 'QR code', make: 'Make your own card for ₩5,900', copied: 'Link copied' },
  ja: { call: '電話', sms: 'SMS', email: 'メール', save: 'CardBookに保存', saveSub: 'もらった名刺をまとめて保管', contact: '連絡先を保存', referral: 'こんな方をご紹介ください', share: '共有', qr: 'QRコード', make: '5,900ウォンで名刺をつくる', copied: 'コピーしました' },
  zh: { call: '电话', sms: '短信', email: '邮件', save: '保存到CardBook', saveSub: '收到的名片一键保存', contact: '保存联系人', referral: '请为我介绍这样的人', share: '分享', qr: '二维码', make: '5,900韩元制作我的名片', copied: '已复制' },
  vi: { call: 'Gọi', sms: 'Nhắn tin', email: 'Email', save: 'Lưu vào CardBook', saveSub: 'Lưu mọi danh thiếp ở một nơi', contact: 'Lưu danh bạ', referral: 'Xin giới thiệu giúp tôi', share: 'Chia sẻ', qr: 'Mã QR', make: 'Tạo danh thiếp chỉ 5.900₩', copied: 'Đã sao chép' },
  mn: { call: 'Залгах', sms: 'Мессеж', email: 'И-мэйл', save: 'CardBook-д хадгалах', saveSub: 'Нэрийн хуудсаа нэг дор хадгална', contact: 'Холбоо барих хадгалах', referral: 'Ийм хүмүүсийг танилцуулна уу', share: 'Хуваалцах', qr: 'QR код', make: '5,900₩-өөр нэрийн хуудас хийх', copied: 'Хуулсан' },
};

// ===== 색상 =====
// 추천 조합 10개 [이름, main(히어로 배경), sub(바탕), point(버튼·강조)]
const AC_PRESETS = [
  ['네이비 클래식', '#1F3A5F', '#E8E1D3', '#C8963E'],
  ['포레스트', '#2F4A3A', '#EDE8DC', '#D07A3B'],
  ['버건디', '#6B2737', '#F1E6DF', '#C9A36B'],
  ['차콜 민트', '#2B2D31', '#E6EEEA', '#3FA58A'],
  ['오션 선셋', '#0F4C75', '#E3EEF4', '#F2A541'],
  ['테라코타', '#B5543A', '#F4EBE1', '#2E4057'],
  ['라벤더 골드', '#4B3F72', '#EEEAF5', '#E0A458'],
  ['모노', '#1C1C1C', '#F2F2F0', '#8A8A85'],
  ['올리브', '#5A5A2E', '#F0EEE2', '#B85C38'],
  ['스카이 코랄', '#2E6F95', '#F5F1EC', '#E76F51'],
];
// 직접 선택용 스와치 (각 8색)
const AC_SWATCH = {
  main: ['#1F3A5F', '#2F4A3A', '#6B2737', '#2B2D31', '#0F4C75', '#B5543A', '#4B3F72', '#1C1C1C'],
  sub: ['#FFFFFF', '#E8E1D3', '#EDE8DC', '#F1E6DF', '#E6EEEA', '#E3EEF4', '#EEEAF5', '#F5F1EC'],
  point: ['#C8963E', '#D07A3B', '#3FA58A', '#F2A541', '#E76F51', '#2E4057', '#E0A458', '#8A8A85'],
};

const AC_TEMPLATES = {
  minimal: '미니멀 센터형', split: '대각선 스플릿형', badge: '플로팅 배지형',
  magazine: '매거진 에디토리얼형', dark: '다크 프리미엄형', block: '컬러 블록형',
};

function acHexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
function acRgbHex(r) { return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function acLum(hex) {
  const [r, g, b] = acHexRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// WCAG 대비율 (1~21)
function acContrast(a, b) { const x = acLum(a), y = acLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const AC_WHITE = '#FFFFFF', AC_INK = '#141414';
// 글자색 자동: 흰색/검정 중 배경과 대비가 큰 쪽
function acTextOn(bg) { return acContrast(bg, AC_WHITE) >= acContrast(bg, AC_INK) ? AC_WHITE : AC_INK; }
function acMix(a, b, t) { const x = acHexRgb(a), y = acHexRgb(b); return acRgbHex(x.map((v, i) => v + (y[i] - v) * t)); }
// 강조색을 글자로 쓸 때: 배경과 대비 4.5(WCAG AA, 작은 글자 기준) 이상이면 point, 아니면 자동 글자색으로 대체
// → 어떤 조합을 골라도 글자가 흐려지는 일이 없다
function acAccentOn(point, bg) { return acContrast(point, bg) >= 4.5 ? point : acTextOn(bg); }

// 직접 선택 시 대비 경고 (시안 기준: point↔sub 2 미만, main↔sub 1.5 미만)
function acColorWarnings(d) {
  const w = [];
  if (acContrast(d.point, d.sub) < 2) w.push('강조색과 바탕색이 비슷해 버튼이 잘 안 보일 수 있어요');
  if (acContrast(d.main, d.sub) < 1.5) w.push('메인색과 바탕색이 비슷해 경계가 흐려 보여요');
  return w;
}

// 템플릿에서 쓰는 모든 색을 한 번에 계산 → CSS 변수로 주입
function acPalette(design) {
  const main = design.main, sub = design.sub, point = design.point;
  const dark = design.tpl === 'dark';
  const bg = dark ? acMix(main, '#000000', 0.78) : sub;          // 페이지 바탕
  const surface = dark ? acMix(main, '#000000', 0.62) : acMix(sub, '#FFFFFF', 0.55); // 카드 면
  return {
    main, sub, point, bg, surface,
    onMain: acTextOn(main), onBg: acTextOn(bg), onSurface: acTextOn(surface), onPoint: acTextOn(point),
    accentBg: acAccentOn(point, bg), accentMain: acAccentOn(point, main), accentSurface: acAccentOn(point, surface),
    line: acMix(bg, acTextOn(bg), 0.2),
  };
}

// ===== 데이터 읽기 =====
function acEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function acPick(field, lang, card) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field[(card.langs || [])[0]] || Object.values(field).find(Boolean) || '';
}
function acView(card, lang) {
  const copy = (card.copy && (card.copy[lang] || card.copy[card.langs[0]])) || {};
  return {
    name: acPick(card.name, lang, card), title: acPick(card.title, lang, card), company: acPick(card.company, lang, card),
    slogan: copy.slogan || '', referral: copy.referral || '',
    phone: card.phone || '', email: card.email || '', links: (card.links || []).filter(l => l && l.url),
    profile: (card.images || {}).profile || '', second: (card.images || {}).second || '',
    secondType: (card.images || {}).secondType || 'hero',
    ui: AC_UI[lang] || AC_UI.en,
  };
}
function acSafeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// ===== 공통 블록 (템플릿이 순서·배치만 바꿔서 조합) =====
const AC_ICON = {
  call: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  sms: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  email: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
};

function acAvatar(v, cls) {
  const initial = acEsc((v.name || '?').trim().charAt(0));
  return v.profile
    ? `<img class="${cls}" src="${acEsc(v.profile)}" alt="${acEsc(v.name)}">`
    : `<div class="${cls} ac-initial">${initial}</div>`;
}
function acLogo(v) { return v.second && v.secondType === 'logo' ? `<img class="ac-logo" src="${acEsc(v.second)}" alt="logo">` : ''; }
function acHeroBg(v) { return v.second && v.secondType === 'hero' ? `<div class="ac-hero-img" style="background-image:url('${acEsc(v.second)}')"></div><div class="ac-hero-veil"></div>` : ''; }
function acRole(v) { return [v.title, v.company].filter(Boolean).map(acEsc).join(' · '); }

function acActions(v) {
  const b = [];
  if (v.phone) {
    const tel = v.phone.replace(/[^0-9+]/g, '');
    b.push(`<a class="ac-act" href="tel:${tel}">${AC_ICON.call}<span>${v.ui.call}</span></a>`);
    b.push(`<a class="ac-act" href="sms:${tel}">${AC_ICON.sms}<span>${v.ui.sms}</span></a>`);
  }
  if (v.email) b.push(`<a class="ac-act" href="mailto:${acEsc(v.email)}">${AC_ICON.email}<span>${v.ui.email}</span></a>`);
  return b.length ? `<div class="ac-actions">${b.join('')}</div>` : '';
}
function acSaveBtn(v) {
  return `<button type="button" class="ac-save" data-ac="save">${AC_ICON.book}<span class="ac-save-t"><b>${v.ui.save}</b><small>${v.ui.saveSub}</small></span></button>`;
}
function acReferral(v) {
  if (!v.referral) return '';
  return `<section class="ac-ref"><h3>${v.ui.referral}</h3><p>${acEsc(v.referral)}</p></section>`;
}
function acLinks(v) {
  if (!v.links.length) return '';
  return `<div class="ac-links">${v.links.map(l => `<a href="${acEsc(acSafeUrl(l.url))}" target="_blank" rel="noopener">${AC_ICON.link}<span>${acEsc(l.label || l.url)}</span></a>`).join('')}</div>`;
}
function acTools(v) {
  return `<div class="ac-tools">
    <button type="button" data-ac="vcf">${v.ui.contact}</button>
    <button type="button" data-ac="share">${v.ui.share}</button>
    <button type="button" data-ac="qr">${v.ui.qr}</button>
  </div>`;
}
function acFooter(v) { return `<a class="ac-make" href="../?from=card" data-ac="make">${v.ui.make} →</a>`; }
function acBody(v) {
  return `${v.slogan ? `<p class="ac-slogan">${acEsc(v.slogan)}</p>` : ''}
    ${acActions(v)}${acSaveBtn(v)}${acReferral(v)}${acLinks(v)}${acTools(v)}${acFooter(v)}`;
}

// ===== 템플릿 6종 =====
const AC_TPL = {
  // 1. 미니멀 센터형 — 바탕색 위 가운데 정렬, 둥근 프로필
  minimal(v) {
    return `<header class="ac-hero">${acHeroBg(v)}${acLogo(v)}</header>
      <div class="ac-id">${acAvatar(v, 'ac-photo')}<h1>${acEsc(v.name)}</h1><div class="ac-role">${acRole(v)}</div><i class="ac-rule"></i></div>
      <main class="ac-main">${acBody(v)}</main>`;
  },
  // 2. 대각선 스플릿형 — 메인색 면과 사진이 대각선으로 나뉨
  split(v) {
    return `<header class="ac-hero">${acHeroBg(v)}
        <div class="ac-split-photo">${v.profile ? `<img src="${acEsc(v.profile)}" alt="">` : `<div class="ac-initial">${acEsc((v.name || '?').charAt(0))}</div>`}</div>
        <div class="ac-id">${acLogo(v)}<h1>${acEsc(v.name)}</h1><div class="ac-role">${acRole(v)}</div></div>
      </header>
      <main class="ac-main">${acBody(v)}</main>`;
  },
  // 3. 플로팅 배지형 — 히어로 위에 떠 있는 카드 + 원형 배지 사진
  badge(v) {
    return `<header class="ac-hero">${acHeroBg(v)}${acLogo(v)}</header>
      <div class="ac-float"><div class="ac-id">${acAvatar(v, 'ac-photo')}<h1>${acEsc(v.name)}</h1><div class="ac-role">${acRole(v)}</div></div></div>
      <main class="ac-main">${acBody(v)}</main>`;
  },
  // 4. 매거진 에디토리얼형 — 큰 세로 사진 + 세리프 이름
  magazine(v) {
    return `<header class="ac-hero">${acHeroBg(v)}
        <div class="ac-mag-top"><span>${acEsc(v.company || v.title)}</span>${acLogo(v)}</div>
        ${v.profile ? `<img class="ac-mag-photo" src="${acEsc(v.profile)}" alt="">` : ''}
      </header>
      <div class="ac-id"><div class="ac-kicker">${acEsc(v.title)}</div><h1>${acEsc(v.name)}</h1><i class="ac-rule"></i></div>
      <main class="ac-main">${acBody(v)}</main>`;
  },
  // 5. 다크 프리미엄형 — 어두운 바탕 + 강조색 테두리
  dark(v) {
    return `<header class="ac-hero">${acHeroBg(v)}${acLogo(v)}</header>
      <div class="ac-id">${acAvatar(v, 'ac-photo')}<h1>${acEsc(v.name)}</h1><div class="ac-role">${acRole(v)}</div></div>
      <main class="ac-main">${acBody(v)}</main>`;
  },
  // 6. 컬러 블록형 — 메인색 블록 / 강조색 블록 / 바탕색
  block(v) {
    return `<header class="ac-hero">${acHeroBg(v)}${acLogo(v)}
        <div class="ac-id">${acAvatar(v, 'ac-photo')}<div><h1>${acEsc(v.name)}</h1><div class="ac-role">${acRole(v)}</div></div></div>
      </header>
      ${v.slogan ? `<div class="ac-band"><p>${acEsc(v.slogan)}</p></div>` : ''}
      <main class="ac-main">${acBody({ ...v, slogan: '' })}</main>`;
  },
};

// 명함 전체 HTML — 이 문자열을 넣을 요소에 class="ac-card"와 CSS 변수가 붙는다
function acRender(el, card, lang) {
  const design = card.design || {};
  const tpl = AC_TPL[design.tpl] ? design.tpl : 'minimal';
  const p = acPalette({ ...design, tpl });
  const v = acView(card, lang);
  el.className = 'ac-card tpl-' + tpl + (v.second && v.secondType === 'hero' ? ' has-hero' : '') + (v.profile ? '' : ' no-photo');
  const vars = {
    '--main': p.main, '--sub': p.sub, '--point': p.point, '--bg': p.bg, '--surface': p.surface,
    '--on-main': p.onMain, '--on-bg': p.onBg, '--on-surface': p.onSurface, '--on-point': p.onPoint,
    '--accent-bg': p.accentBg, '--accent-main': p.accentMain, '--accent-surface': p.accentSurface, '--line': p.line,
  };
  for (const [k, val] of Object.entries(vars)) el.style.setProperty(k, val);
  el.lang = lang;
  el.innerHTML = AC_TPL[tpl](v);
}

// vCard(.vcf) — 폰 연락처에 바로 저장
function acVcf(card, lang, url) {
  const v = acView(card, lang);
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + e(v.name), 'N:' + e(v.name) + ';;;;'];
  if (v.company) lines.push('ORG:' + e(v.company));
  if (v.title) lines.push('TITLE:' + e(v.title));
  if (v.phone) lines.push('TEL;TYPE=CELL:' + v.phone);
  if (v.email) lines.push('EMAIL:' + e(v.email));
  if (url) lines.push('URL:' + url);
  v.links.forEach(l => lines.push('URL:' + acSafeUrl(l.url)));
  if (v.slogan) lines.push('NOTE:' + e(v.slogan));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
