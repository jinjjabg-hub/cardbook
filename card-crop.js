// 종이 명함 사진 → 명함만 찾아 잘라내고 반듯하게 펴기 (외부 라이브러리·서버 없이 폰에서 처리, 비용 0원)
// 왜: 사진에 책상·손 같은 배경이 섞이면 명함이 실제로 차지하는 픽셀이 절반 이하로 줄어 작은 글씨(전화·이메일)가 뭉개짐
//     → 명함만 잘라 Claude가 읽는 최대 크기(긴 쪽 1568px)를 전부 명함 글자에 쓰게 한다.
// 안전장치: 명함 모양(사각형·명함 비율·배경은 단순)이 확실할 때만 자르고, 아니면 원본 전체를 그대로 보낸다.
(function (root) {
  const MAX_SIDE = 1568;      // Claude 비전이 축소 없이 읽는 최대 긴 변
  const QUALITY = 0.9;        // JPEG 화질 — 0.8이면 작은 글씨 가장자리가 뭉개짐
  const DETECT_SIDE = 360;    // 명함 찾기용 축소 크기(빠르게)
  const SRC_SIDE = 3200;      // 펴기에 쓸 원본 최대 크기(폰 메모리 보호)

  // ── 회색조 변환 ──
  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  // ── 오츠(Otsu) 임계값: 밝은 쪽/어두운 쪽을 가장 잘 나누는 값 ──
  function otsu(g) {
    const hist = new Float64Array(256);
    for (let i = 0; i < g.length; i++) hist[g[i]]++;
    const n = g.length; let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = t; }
    }
    return th;
  }

  // ── 팽창/침식(정사각형 r) — 글자 구멍을 메워 명함을 한 덩어리로 ──
  function morph(m, w, h, r, dilate) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) { const p = m[y * w + k]; if (dilate ? p : !p) { v = dilate ? 1 : 0; break; } }
      tmp[y * w + x] = v;
    }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      let v = dilate ? 0 : 1;
      for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) { const p = tmp[k * w + x]; if (dilate ? p : !p) { v = dilate ? 1 : 0; break; } }
      out[y * w + x] = v;
    }
    return out;
  }

  function quadArea(q) {
    let a = 0;
    for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
    return Math.abs(a) / 2;
  }
  function inQuad(q, x, y) {   // 볼록 사각형 안인지(시계·반시계 모두)
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const p = q[i], n = q[(i + 1) % 4], c = (n.x - p.x) * (y - p.y) - (n.y - p.y) * (x - p.x);
      if (c !== 0) { const s = c > 0 ? 1 : -1; if (sign && s !== sign) return false; sign = s; }
    }
    return true;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ── 뚜렷한 경계(글자 획처럼 밝기가 확 바뀌는 곳) 비율: 사각형 안 vs 밖 ──
  // 밖에도 뚜렷한 경계가 많으면 '명함 이미지 속 상자'일 수 있어 자르지 않음. 나뭇결·천 무늬처럼 부드러운 무늬는 세지 않음
  function detailInOut(g, w, h, q) {
    let si = 0, ni = 0, so = 0, no = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, d = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]), strong = d > 90 ? 1 : 0;
      if (inQuad(q, x, y)) { si += strong; ni++; } else { so += strong; no++; }
    }
    return { inside: ni ? si / ni : 0, outside: no ? so / no : 0 };
  }

  // ── 명함 네 모서리 찾기 (축소 이미지 좌표). 확실하지 않으면 null ──
  function detectQuad(rgba, w, h, why) {   // why: (선택) 거절 이유를 모으는 배열 — 조정할 때 확인용
    const g = toGray(rgba, w, h), th = otsu(g), n = w * h;
    const r = Math.max(2, Math.round(Math.max(w, h) * 0.015));
    // 후보 덩어리 만드는 방법 3가지: 밝은 쪽 / 어두운 쪽 / 배경색과 다른 쪽
    // '배경색과 다른 쪽': 사진 테두리 색(=책상·천)을 배경으로 보고 그와 다른 곳 → 반반 색 명함·어두운 명함도 한 덩어리로 잡힘
    // 배경과의 색 차이 지도 + 기준값 후보 여러 개(배경 흔들림 기준·오츠·고정값) → 각각 시도하고 모양 검사를 통과한 것 중 가장 큰 것
    const bgDist = (() => {
      const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03)), rs = [], gs = [], bs = [], idx = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x >= ring && y >= ring && x < w - ring && y < h - ring) continue;
        const j = (y * w + x) * 4; rs.push(rgba[j]); gs.push(rgba[j + 1]); bs.push(rgba[j + 2]); idx.push(y * w + x);
      }
      const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1], br = med(rs), bg = med(gs), bb = med(bs);
      const d = new Uint8Array(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) d[i] = Math.min(255, Math.abs(rgba[j] - br) + Math.abs(rgba[j + 1] - bg) + Math.abs(rgba[j + 2] - bb));
      const ringD = idx.map(i => d[i]).sort((p, q) => p - q);
      const ts = [...new Set([Math.round(ringD[Math.floor(ringD.length * 0.95)] * 1.5), otsu(d), 40, 60, 90].map(t => Math.max(30, t)))];
      return { d, ts };
    })();
    const ro = Math.max(1, Math.round(r * 0.8));
    const bgMask = t => {
      const m = new Uint8Array(n);
      for (let i = 0; i < n; i++) m[i] = bgDist.d[i] > t ? 1 : 0;
      // 열기(open): 천의 반짝이는 잡티·반사광이 명함과 사진 가장자리를 잇는 가는 다리를 끊음 (명함은 커서 살아남음)
      return morph(morph(m, w, h, ro, false), w, h, ro, true);
    };
    let best = null;
    for (const kind of ['bright', 'dark', ...bgDist.ts.map(t => 'bg' + t)]) {
      const bright = kind;
      let m = new Uint8Array(n);
      if (kind.startsWith('bg')) m = bgMask(+kind.slice(2));
      else for (let i = 0; i < n; i++) m[i] = kind === 'bright' ? (g[i] > th ? 1 : 0) : (g[i] <= th ? 1 : 0);
      m = morph(morph(m, w, h, r, true), w, h, r, false);   // 닫기(close): 글자 구멍 메우기
      const lab = new Int32Array(n), stack = new Int32Array(n);
      let id = 0;
      for (let s = 0; s < n; s++) {
        if (!m[s] || lab[s]) continue;
        id++; let sp = 0, area = 0, touches = false;
        let tl = null, br = null, tr = null, bl = null, tlv = Infinity, brv = -Infinity, trv = -Infinity, blv = Infinity;
        stack[sp++] = s; lab[s] = id;
        while (sp) {
          const p = stack[--sp], x = p % w, y = (p - x) / w; area++;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
          const a = x + y, b = x - y;
          if (a < tlv) { tlv = a; tl = { x, y }; } if (a > brv) { brv = a; br = { x, y }; }
          if (b > trv) { trv = b; tr = { x, y }; } if (b < blv) { blv = b; bl = { x, y }; }
          if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
          if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
          if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; }
          if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; }
        }
        if (touches || area < n * 0.12 || area > n * 0.92) { if (why && area > n * 0.05) why.push({ bright, area: +(area / n).toFixed(2), touches }); continue; }   // 화면 가장자리에 닿거나 너무 작거나 큼
        const q = [tl, tr, br, bl], qa = quadArea(q);
        if (qa < n * 0.12) continue;
        // 사각형 모양인지: 사각형 안을 덩어리가 대부분 채우고, 밖으로 거의 안 삐져나와야 함
        let inside = 0;
        const x0 = Math.max(0, Math.min(tl.x, bl.x) - 1), x1 = Math.min(w - 1, Math.max(tr.x, br.x) + 1);
        const y0 = Math.max(0, Math.min(tl.y, tr.y) - 1), y1 = Math.min(h - 1, Math.max(bl.y, br.y) + 1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (lab[y * w + x] === id && inQuad(q, x, y)) inside++;
        if (inside / qa < 0.85 || (area - inside) / area > 0.08) { if (why) why.push({ bright, fill: +(inside / qa).toFixed(2), out: +((area - inside) / area).toFixed(2) }); continue; }
        // 명함 비율인지(가로 90×세로 50mm ≈ 1.8, 세로형 포함) — 기울어진 사진 여유를 둠
        const wd = (dist(tl, tr) + dist(bl, br)) / 2, ht = (dist(tl, bl) + dist(tr, br)) / 2;
        if (wd < 8 || ht < 8) continue;
        const ratio = Math.max(wd, ht) / Math.min(wd, ht);
        if (ratio < 1.2 || ratio > 2.4) { if (why) why.push({ bright, ratio: +ratio.toFixed(2) }); continue; }
        if (!best || qa > best.area) best = { quad: q, area: qa };
      }
    }
    if (!best) return null;
    const d = detailInOut(g, w, h, best.quad);
    if (d.outside > d.inside) { if (why) why.push({ detail: d }); return null; }   // 바깥이 안보다 복잡함 → 배경이 아님(천 무늬·반사는 통과하도록 느슨하게, 주된 안전장치는 prepare의 '카메라 사진만')
    return best.quad;
  }

  // ── 사각형 바깥으로 살짝 넓히기(가장자리 글자 잘림 방지) ──
  function expandQuad(q, f, w, h) {
    const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
    return q.map(p => ({ x: Math.min(w - 1, Math.max(0, cx + (p.x - cx) * (1 + f))), y: Math.min(h - 1, Math.max(0, cy + (p.y - cy) * (1 + f))) }));
  }

  // ── 원근 변환: 결과 직사각형(0..ow, 0..oh) 좌표 → 원본 사각형 좌표 ──
  function homography(from, to) {   // from/to: 4점. from 평면 → to 평면
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], u = to[i].x, v = to[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    for (let c = 0; c < 8; c++) {   // 가우스 소거
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        B[r] -= f * B[c];
      }
    }
    const h = B.map((b, i) => b / A[i][i]);
    return [...h, 1];
  }

  function warp(src, sw, sh, quad, ow, oh) {
    const H = homography([{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: 0, y: oh }], quad);
    const out = new Uint8ClampedArray(ow * oh * 4);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const X = x + 0.5, Y = y + 0.5, z = H[6] * X + H[7] * Y + H[8];
      let u = (H[0] * X + H[1] * Y + H[2]) / z - 0.5, v = (H[3] * X + H[4] * Y + H[5]) / z - 0.5;
      u = Math.min(sw - 1.001, Math.max(0, u)); v = Math.min(sh - 1.001, Math.max(0, v));
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, o = (y * ow + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      out[o + 3] = 255;
    }
    return out;
  }

  // 결과 크기: 명함 비율 유지, 긴 변 최대 1568, 원본보다 키우지 않음
  function outSize(quad) {
    const wd = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2, ht = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
    const s = Math.min(1, MAX_SIDE / Math.max(wd, ht));
    return { ow: Math.max(1, Math.round(wd * s)), oh: Math.max(1, Math.round(ht * s)) };
  }

  // ── 글자 줄 방향: 'h'(가로 줄) / 'v'(세로 줄) / null(모르겠음) ──
  // 왜: 폰을 어떻게 들었는지·브라우저가 사진 방향 정보를 어떻게 처리하는지에 따라 명함이 옆으로 누운 채 갈 수 있음
  //     → 글자 줄 사이 빈 줄(가로로 텅 빈 행)이 많으면 가로 줄, 빈 열이 많으면 세로 줄. 세로형 명함도 글자 기준이라 안전
  function textAxis(rgba, w, h) {
    const g = toGray(rgba, w, h), th = otsu(g);
    let dark = 0; for (let i = 0; i < g.length; i++) if (g[i] <= th) dark++;
    const inkDark = dark < g.length / 2;   // 적은 쪽이 글자(흰 바탕 검은 글자 / 어두운 바탕 밝은 글자 모두)
    const mx = Math.round(w * 0.06), my = Math.round(h * 0.06), W = w - 2 * mx, H = h - 2 * my;
    if (W < 20 || H < 20) return null;
    const rows = new Int32Array(H), cols = new Int32Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g[(y + my) * w + x + mx];
      if (inkDark ? v <= th : v > th) { rows[y]++; cols[x]++; }
    }
    const emptyFrac = (a, len) => {   // 글자가 있는 범위 안에서 '거의 빈' 줄의 비율
      const lim = Math.max(1, len * 0.01);
      let a0 = 0, a1 = a.length - 1;
      while (a0 < a1 && a[a0] <= lim) a0++;
      while (a1 > a0 && a[a1] <= lim) a1--;
      if (a1 - a0 < 10) return 0;
      let e = 0; for (let i = a0; i <= a1; i++) if (a[i] <= lim) e++;
      return e / (a1 - a0 + 1);
    };
    const er = emptyFrac(rows, W), ec = emptyFrac(cols, H);
    if (er > ec + 0.08) return 'h';
    if (ec > er + 0.08) return 'v';
    return null;
  }

  // 캔버스 회전(90 = 시계 방향, -90 = 반시계, 180)
  function rotateCanvas(src, deg) {
    const c = document.createElement('canvas'), q = Math.abs(deg) === 90;
    c.width = q ? src.height : src.width; c.height = q ? src.width : src.height;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }
  // base64 JPEG → 회전한 base64 JPEG (위아래 뒤집기 확인 후 180° 돌릴 때)
  async function rotateJpeg(b64, deg) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/jpeg;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
    return rotateCanvas(c, deg).toDataURL('image/jpeg', QUALITY).split(',')[1];
  }
  // 위아래 확인용 작은 미리보기(긴 변 512px)
  async function thumbJpeg(b64, side = 512) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/jpeg;base64,' + b64; });
    const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  // ── 브라우저용: 파일 → { jpeg(base64), cropped } ──
  // opts.force: 크기 조건 무시(시험용)
  async function prepare(file, opts = {}) {
    const url = URL.createObjectURL(file);
    let img;
    try { img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }); }
    finally { URL.revokeObjectURL(url); }
    const W = img.naturalWidth || img.width, Hh = img.naturalHeight || img.height;
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    let cropped = false, rotated = false, out;
    // 카메라로 찍은 사진만 자르기 시도: PNG·GIF·WEBP(스크린샷·이미지 명함)와 작은 이미지(카톡으로 받은 명함 이미지 등)는 그대로
    // 폰 카메라 원본은 긴 변 3000px 이상이라 1600px 기준이면 넉넉함
    const isPhoto = !/png|gif|webp/i.test(file.type || '') && Math.max(W, Hh) >= 1600;
    if (isPhoto || opts.force) {
      try {
        const ds = Math.min(1, DETECT_SIDE / Math.max(W, Hh)), dw = Math.max(1, Math.round(W * ds)), dh = Math.max(1, Math.round(Hh * ds));
        const dc = canvas(dw, dh), dx = dc.getContext('2d', { willReadFrequently: true });
        dx.drawImage(img, 0, 0, dw, dh);
        const q = detectQuad(dx.getImageData(0, 0, dw, dh).data, dw, dh);
        if (q) {
          const ss = Math.min(1, SRC_SIDE / Math.max(W, Hh)), sw = Math.round(W * ss), sh = Math.round(Hh * ss);
          const sc = canvas(sw, sh), sx = sc.getContext('2d', { willReadFrequently: true });
          sx.drawImage(img, 0, 0, sw, sh);
          const k = sw / dw, quad = expandQuad(q.map(p => ({ x: (p.x + 0.5) * k, y: (p.y + 0.5) * k })), 0.03, sw, sh);
          const { ow, oh } = outSize(quad);
          const oc = canvas(ow, oh), ox = oc.getContext('2d');
          const id = ox.createImageData(ow, oh);
          id.data.set(warp(sx.getImageData(0, 0, sw, sh).data, sw, sh, quad, ow, oh));
          ox.putImageData(id, 0, 0);
          out = oc; cropped = true;
          // 글자 줄이 세로면 90° 돌려 가로로 — 방향(왼쪽/오른쪽)은 확실하지 않아 반시계로 돌리고, 위아래는 호출한 쪽에서 확인(rotated: true)
          const ts = Math.min(1, 400 / Math.max(ow, oh)), tw = Math.round(ow * ts), th2 = Math.round(oh * ts);
          const tc = canvas(tw, th2), tx = tc.getContext('2d', { willReadFrequently: true });
          tx.drawImage(oc, 0, 0, tw, th2);
          if (textAxis(tx.getImageData(0, 0, tw, th2).data, tw, th2) === 'v') { out = rotateCanvas(oc, -90); rotated = true; }
        }
      } catch (e) { console.warn('명함 자르기 건너뜀', e); }
    }
    if (!out) {   // 못 찾으면 원본 전체(긴 변 1568)
      const s = Math.min(1, MAX_SIDE / Math.max(W, Hh));
      out = canvas(Math.round(W * s), Math.round(Hh * s));
      out.getContext('2d').drawImage(img, 0, 0, out.width, out.height);
    }
    return { jpeg: out.toDataURL('image/jpeg', QUALITY).split(',')[1], cropped, rotated, width: out.width, height: out.height };
  }

  const api = { prepare, textAxis, rotateJpeg, thumbJpeg, detectQuad, warp, homography, expandQuad, outSize, MAX_SIDE, QUALITY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardCrop = api;
})(typeof window !== 'undefined' ? window : globalThis);
