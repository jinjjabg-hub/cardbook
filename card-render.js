// 전달용 명함 이미지: 저장된 정보(이름·회사·전화…)로 깨끗한 명함을 새로 그린다
// 왜: 폰 브라우저로 찍은 사진은 접사 렌즈 전환·여러 장 합성이 안 돼 화질에 한계가 있음 → 흐린 사진을 그대로 전달하게 됨
//     전달의 목적은 '상대가 연락처를 정확히 받는 것' → 화질과 상관없이 항상 선명한 이미지를 보내고, 원본 사진은 확인용으로 함께 붙인다
// 사용: const blob = await CardRender.toBlob(card);   // card: { name, nameEn, title, company, industry, phone, email, address }
(function (root) {
  const W = 1800, H = 1000;          // 명함 비율(90×50mm), 카톡에서 확대해도 선명한 크기
  const NAVY = '#16305e', INK = '#0f172a', SUB = '#475569', MUTED = '#94a3b8', LINE = '#e2e8f0';
  const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const font = (w, px) => `${w} ${px}px ${FONT}`;
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  // 글자가 칸보다 길면 글자 크기를 줄임(최소 min)
  function fit(ctx, text, weight, px, maxW, min) {
    let s = px;
    for (; s > min; s -= 2) { ctx.font = font(weight, s); if (ctx.measureText(text).width <= maxW) break; }
    ctx.font = font(weight, s);
    return s;
  }
  // 긴 글(주소)을 maxW 안에서 줄바꿈 — 최대 lines줄, 넘치면 말줄임
  function wrap(ctx, text, maxW, lines) {
    const out = []; let cur = '';
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch.trimStart(); if (out.length === lines) break; }
      else cur += ch;
    }
    if (out.length < lines && cur) out.push(cur);
    if (out.length === lines && out.join('').length < text.length) {
      let last = out[lines - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      out[lines - 1] = last + '…';
    }
    return out;
  }

  async function draw(card, canvas) {
    const c = {
      name: clean(card.name), nameEn: clean(card.nameEn), title: clean(card.title), company: clean(card.company),
      industry: clean(card.industry), phone: clean(card.phone), email: clean(card.email), address: clean(card.address)
    };
    // 웹 글꼴을 다 받은 뒤 그려야 기본 글꼴로 찍히지 않음(최대 1.5초만 기다림)
    try {
      if (root.document && document.fonts && document.fonts.load) {
        await Promise.race([Promise.all([document.fonts.load(font(700, 40), '가A'), document.fonts.load(font(400, 40), '가A')]), new Promise(r => setTimeout(r, 1500))]);
      }
    } catch (e) {}
    canvas.width = W; canvas.height = H;
    const x = canvas.getContext('2d');
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = NAVY; x.fillRect(0, 0, 28, H);               // 왼쪽 띠
    const L = 130, R = W - 130, maxW = R - L;

    // 위: 회사 + 업종
    let y = 170;
    if (c.company) { fit(x, c.company, 700, 56, maxW, 34); x.fillStyle = NAVY; x.fillText(c.company, L, y); y += 62; }
    if (c.industry) { fit(x, c.industry, 400, 34, maxW, 24); x.fillStyle = SUB; x.fillText(c.industry, L, y); }

    // 가운데: 이름 + 직함(이름 옆), 영문 이름은 아래
    y = 470;
    const nameSize = fit(x, c.name || '이름 없음', 700, 120, maxW * 0.7, 64);
    x.fillStyle = INK; x.fillText(c.name || '이름 없음', L, y);
    const nameW = x.measureText(c.name || '이름 없음').width;
    if (c.title) {
      fit(x, c.title, 400, 46, Math.max(160, maxW - nameW - 40), 26);
      x.fillStyle = SUB; x.fillText(c.title, L + nameW + 36, y);
    }
    if (c.nameEn) { fit(x, c.nameEn, 400, 38, maxW, 24); x.fillStyle = MUTED; x.fillText(c.nameEn, L, y + Math.round(nameSize * 0.55)); }

    // 구분선
    x.fillStyle = LINE; x.fillRect(L, 610, maxW, 3);

    // 아래: 연락처(라벨 + 값)
    const rows = [['T', c.phone, 700, 50], ['E', c.email, 400, 44], ['A', c.address, 400, 36]].filter(r => r[1]);
    y = 700;
    const LABEL_W = 70;
    for (const [lab, val, w, px] of rows) {
      x.font = font(700, 34); x.fillStyle = NAVY; x.fillText(lab, L, y);
      if (lab === 'A') {
        x.font = font(w, px);
        const lines = wrap(x, val, maxW - LABEL_W, 2);
        x.fillStyle = SUB; lines.forEach((ln, i) => x.fillText(ln, L + LABEL_W, y + i * (px + 12)));
        y += lines.length * (px + 12) + 30;
      } else {
        fit(x, val, w, px, maxW - LABEL_W, 26);
        x.fillStyle = INK; x.fillText(val, L + LABEL_W, y);
        y += px + 36;
      }
    }

    // 오른쪽 아래: 출처 표시 — 사진에서 옮겨 적은 명함이면 그렇다고 알림(원본 사진을 함께 보냄)
    x.font = font(400, 24); x.fillStyle = MUTED; x.textAlign = 'right';
    x.fillText(card.image ? '카드북 · 명함 사진에서 옮겨 적은 정보예요' : '카드북에서 보낸 명함', R, H - 50);
    x.textAlign = 'left';
    return canvas;
  }

  async function toBlob(card) {
    const cv = await draw(card, document.createElement('canvas'));
    return new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('명함 이미지 만들기 실패')), 'image/png'));
  }

  const api = { draw, toBlob, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
