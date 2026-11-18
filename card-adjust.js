// 촬영 직후 '명함 영역 맞추기' 화면: 사진 위에 명함 박스를 띄우고, 네 모서리를 끌어 명함에 맞춘 뒤 그 부분만 저장
// 왜: 폰 기본 카메라는 화질이 좋지만 앱이 카메라 화면 위에 테두리를 그릴 수 없음 → 찍은 뒤에 박스를 보여 준다
//     자동 찾기가 실패하면 사진 전체(책상·배경 포함)가 저장되던 문제 → 자동으로 찾은 영역을 보여 주고, 틀리면 사람이 바로잡는다
// 사용: const r = await CardAdjust.open(file);
//       r = { quad: [왼위, 오위, 오아래, 왼아래](원본 좌표) } | { retake: true } | null(취소)
(function (root) {
  const RATIO = 1.75;   // 기본 박스 가로:세로(명함 90×50mm에 가깝게)
  const HANDLE = 14, HIT = 44;   // 모서리 점 반지름 / 손가락으로 잡히는 범위(px)

  // 이미지 안 가운데에 명함 비율 박스(가로형 / 세로형)
  function defaultQuad(W, H, vertical) {
    const r = vertical ? 1 / RATIO : RATIO;
    let w = W * 0.84, h = w / r;
    if (h > H * 0.84) { h = H * 0.84; w = h * r; }
    const x = (W - w) / 2, y = (H - h) / 2;
    return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }
  const sideLen = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isVertical = q => (sideLen(q[0], q[3]) + sideLen(q[1], q[2])) > (sideLen(q[0], q[1]) + sideLen(q[3], q[2]));
  // 점이 사각형 안에 있는지(볼록 사각형 가정 — 오목해도 대략 맞음)
  function inside(q, p) {
    let s = 0;
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } }
    return true;
  }

  function loadImage(file) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), i = new Image();
      i.onload = () => ok(i); i.onerror = () => { URL.revokeObjectURL(url); no(new Error('사진을 열지 못했어요')); };
      i.src = url;
    });
  }

  async function open(file) {
    const img = await loadImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    let auto = null; try { auto = root.CardCrop && CardCrop.findQuad ? CardCrop.findQuad(img) : null; } catch (e) {}
    let quad = auto || defaultQuad(W, H, false);

    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1220;display:flex;flex-direction:column;font-family:"Noto Sans KR",sans-serif;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none';
      wrap.innerHTML = `
        <div style="padding:14px 16px 8px;text-align:center">
          <div style="font-size:16px;font-weight:800">명함 부분만 박스에 맞춰 주세요</div>
          <div class="ca-sub" style="font-size:12px;color:#94a3b8;margin-top:4px"></div>
          <div style="display:inline-flex;margin-top:10px;border:1px solid rgba(255,255,255,.35);border-radius:999px;overflow:hidden">
            <button data-v="0" class="ca-mode" style="border:0;padding:7px 16px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer">▭ 가로 명함</button>
            <button data-v="1" class="ca-mode" style="border:0;padding:7px 16px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer">▯ 세로 명함</button>
          </div>
        </div>
        <div class="ca-stage" style="flex:1;position:relative;min-height:0"><canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>
        <div style="display:flex;gap:10px;padding:12px 16px calc(14px + env(safe-area-inset-bottom))">
          <button class="ca-retake" style="flex:1;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:15px;font-weight:700;font-family:inherit">다시 찍기</button>
          <button class="ca-ok" style="flex:2;padding:14px;border-radius:12px;border:0;background:#2563eb;color:#fff;font-size:15px;font-weight:800;font-family:inherit">✓ 이 부분 저장</button>
        </div>
        <button class="ca-close" aria-label="닫기" style="position:absolute;top:10px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:18px">✕</button>`;
      document.body.appendChild(wrap);
      const $ = s => wrap.querySelector(s);
      const stage = $('.ca-stage'), cv = $('canvas'), ctx = cv.getContext('2d');
      const modeBtns = [...wrap.querySelectorAll('.ca-mode')];
      $('.ca-sub').textContent = auto ? '명함을 자동으로 찾았어요 · 어긋나면 모서리(●)를 끌어 맞춰 주세요' : '모서리(●)를 끌어 명함 네 귀퉁이에 맞춰 주세요';

      // 화면 좌표 ↔ 원본 좌표
      let k = 1, ox = 0, oy = 0, dpr = 1, cw = 0, ch = 0;
      const toScr = p => ({ x: ox + p.x * k, y: oy + p.y * k });
      const toImg = (sx, sy) => ({ x: Math.min(W, Math.max(0, (sx - ox) / k)), y: Math.min(H, Math.max(0, (sy - oy) / k)) });
      const layout = () => {
        const r = stage.getBoundingClientRect(); cw = r.width; ch = r.height; dpr = Math.min(3, root.devicePixelRatio || 1);
        cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
        const pad = 22; k = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H); ox = (cw - W * k) / 2; oy = (ch - H * k) / 2;
        draw();
      };
      let drag = null;   // { i: 모서리 번호 | -1(박스 전체), start, orig }
      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, ox, oy, W * k, H * k);
        const s = quad.map(toScr);
        // 박스 바깥 어둡게
        ctx.beginPath(); ctx.rect(ox, oy, W * k, H * k);
        ctx.moveTo(s[0].x, s[0].y); for (let i = 3; i >= 0; i--) ctx.lineTo(s[i].x, s[i].y); ctx.closePath();
        ctx.fillStyle = 'rgba(2,6,23,.62)'; ctx.fill('evenodd');
        // 테두리 + 모서리
        ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#7dd3fc'; ctx.stroke();
        s.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, drag && drag.i === i ? HANDLE + 4 : HANDLE, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(37,99,235,.9)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        });
        // 모서리를 끄는 중엔 손가락에 가려지지 않게 위쪽에 확대경(2.5배)
        if (drag && drag.i >= 0) {
          const p = s[drag.i], R = 56, Z = 2.5, lx = Math.min(cw - R - 8, Math.max(R + 8, p.x)), ly = p.y - 110 < R + 8 ? p.y + 110 : p.y - 110;
          ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = '#000'; ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
          ctx.translate(lx - p.x * Z, ly - p.y * Z); ctx.scale(Z, Z);
          ctx.drawImage(img, ox, oy, W * k, H * k);
          ctx.beginPath(); s.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
          ctx.lineWidth = 1.2; ctx.strokeStyle = '#7dd3fc'; ctx.stroke();   // 확대경 안에도 박스 선(귀퉁이 맞추기 쉽게)
          ctx.restore();
          ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx + 10, ly); ctx.moveTo(lx, ly - 10); ctx.lineTo(lx, ly + 10); ctx.lineWidth = 2; ctx.strokeStyle = '#7dd3fc'; ctx.stroke();
        }
      }
      const setMode = v => modeBtns.forEach(b => { const on = (b.dataset.v === '1') === v; b.style.background = on ? '#fff' : 'transparent'; b.style.color = on ? '#16305e' : '#fff'; });
      setMode(isVertical(quad));
      modeBtns.forEach(b => b.onclick = () => { const v = b.dataset.v === '1'; quad = defaultQuad(W, H, v); setMode(v); $('.ca-sub').textContent = '명함을 박스 안에 맞추고, 모서리(●)를 끌어 귀퉁이에 맞춰 주세요'; draw(); });

      const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      cv.addEventListener('pointerdown', e => {
        const p = pos(e), s = quad.map(toScr);
        let best = -1, bd = HIT;
        s.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } });
        if (best < 0 && !inside(s, p)) return;
        drag = { i: best, start: p, orig: quad.map(q => ({ ...q })) };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); draw();
      });
      cv.addEventListener('pointermove', e => {
        if (!drag) return;
        const p = pos(e);
        if (drag.i >= 0) quad[drag.i] = toImg(p.x, p.y);
        else {   // 박스 전체 옮기기(사진 밖으로 나가지 않게)
          let dx = (p.x - drag.start.x) / k, dy = (p.y - drag.start.y) / k;
          const xs = drag.orig.map(q => q.x), ys = drag.orig.map(q => q.y);
          dx = Math.min(W - Math.max(...xs), Math.max(-Math.min(...xs), dx)); dy = Math.min(H - Math.max(...ys), Math.max(-Math.min(...ys), dy));
          quad = drag.orig.map(q => ({ x: q.x + dx, y: q.y + dy }));
        }
        e.preventDefault(); draw();
      });
      const end = () => { if (drag) { drag = null; draw(); } };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

      const done = r => { root.removeEventListener('resize', layout); URL.revokeObjectURL(img.src); wrap.remove(); resolve(r); };
      $('.ca-close').onclick = () => done(null);
      $('.ca-retake').onclick = () => done({ retake: true });
      $('.ca-ok').onclick = () => {
        // 모서리를 엇갈리게 끌었을 수 있어 가운데 기준 각도로 다시 정렬 → [왼위, 오위, 오아래, 왼아래]
        const cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
        const q = quad.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));   // -π(왼쪽)부터 시계 방향: 왼위·오위·오아래·왼아래 순으로 시작점 맞춤
        let i0 = 0; q.forEach((p, i) => { if (p.x + p.y < q[i0].x + q[i0].y) i0 = i; });
        done({ quad: [0, 1, 2, 3].map(j => q[(i0 + j) % 4]) });
      };
      root.addEventListener('resize', layout);
      requestAnimationFrame(layout);
    });
  }

  root.CardAdjust = { open, _defaultQuad: defaultQuad };
})(window);
