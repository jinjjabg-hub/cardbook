// 앱 안 명함 촬영 화면: 폰을 세로로 들고, 명함 모양 테두리 안에 명함을 맞춰 찍는다
// 왜: 폰 기본 카메라는 들고 찍은 방향에 따라 사진 방향이 제각각으로 와서(사진 방향 정보 처리가 폰·브라우저마다 다름) 명함이 옆으로 누워 인식률이 떨어졌음
//     앱 안 카메라는 화면에 보이는 그대로 영상을 받으므로 방향이 항상 같고, 테두리 영역만 잘라 쓸 수 있다
// 초점: 브라우저가 초점 고정 광각 카메라를 고르거나 자동 초점이 꺼진 채 시작하는 폰이 있음
//     → 후면 카메라 중 자동 초점 되는 것을 고르고, 연속 자동 초점을 켜고, 탭·촬영 직전에 초점을 다시 맞춘다
// 사용: const file = await CardCamera.open();  // 취소하면 null, 카메라를 못 쓰면 예외(→ 기본 카메라로 대체)
(function (root) {
  const RATIO = 1.75;        // 명함 가로:세로(90×50mm ≈ 1.8, 여유 있게)
  const GUIDE_W = 0.78;      // 화면 폭 대비 테두리 폭 — 너무 크면 명함에 바짝 붙여 최소 초점 거리 안으로 들어가 흐려짐
  const MARGIN = 0.10;       // 잘라낼 때 테두리 바깥 여백(명함이 조금 벗어나도 안 잘리게)
  const VIDEO = { width: { ideal: 3840 }, height: { ideal: 2160 } };   // 고해상도 요청(안 되면 가능한 최대)

  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const caps = track => { try { return track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { return {}; } };
  const hasAF = track => (caps(track).focusMode || []).some(m => m === 'continuous' || m === 'single-shot');
  const isBack = d => /back|rear|environment|후면/i.test(d.label || '');

  async function getStream(deviceId) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId }, ...VIDEO } : { facingMode: { ideal: 'environment' }, ...VIDEO } });
  }
  // 후면 카메라 목록(권한을 받은 뒤라야 이름이 보임)
  async function backCameras() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const back = all.filter(isBack);
      return back.length ? back : all;
    } catch (e) { return []; }
  }
  // 연속 자동 초점 켜기(지원할 때만)
  async function continuousAF(track) {
    if ((caps(track).focusMode || []).includes('continuous')) {
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    }
  }
  // ── 줌으로 촬영 거리 늘리기 ──
  // 왜: 테두리를 줌 없이 채우려면 폰을 명함 약 11~12cm 앞까지 대야 하는데(가로 시야 약 53°·명함 9cm 기준 계산),
  //     요즘 폰 메인 카메라는 그 거리에서 초점이 안 맞음(최소 초점 거리 10~25cm) → 탭을 하든 뭘 하든 계속 흐림
  //     기본 카메라 앱은 이때 접사 렌즈로 자동 전환하지만 브라우저는 못 함 → 줌을 걸어 같은 크기로 보이는 거리를 18cm 이상으로 늘린다
  const BASE_CM = 11.5;      // 줌 1배에서 테두리를 채우는 거리(추정)
  async function applyZoom(track) {
    const c = caps(track), zc = c.zoom;
    if (!zc || !(zc.max > 1)) return 1;
    const fdMin = c.focusDistance && c.focusDistance.min > 0.02 && c.focusDistance.min < 0.6 ? c.focusDistance.min : 0;   // 폰이 알려준 최소 초점 거리(m) — 값이 그럴듯할 때만 씀
    let z = Math.max(1.6, fdMin * 100 * 1.25 / BASE_CM);
    z = Math.max(zc.min || 1, Math.min(z, 2.5, zc.max));
    try { await track.applyConstraints({ advanced: [{ zoom: z }] }); } catch (e) { return 1; }
    return z;
  }
  // 한 번 초점 맞추기(가능하면 지정한 지점) → 잠시 뒤 연속 자동 초점으로 복귀
  async function focusOnce(track, x, y) {
    const c = caps(track), modes = c.focusMode || [];
    const adv = {};
    if (navigator.mediaDevices.getSupportedConstraints && navigator.mediaDevices.getSupportedConstraints().pointsOfInterest && x != null) adv.pointsOfInterest = [{ x, y }];
    if (modes.includes('single-shot')) adv.focusMode = 'single-shot';
    if (!Object.keys(adv).length) return false;
    try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { return false; }
    return true;
  }

  // ── 직접 초점 맞추기(수동 초점만 되는 폰용) ──
  // 왜: 탭 초점(single-shot·지점 지정)을 지원하지 않고 manual/continuous만 되는 폰이 있음(실제 폰 진단)
  //     → 초점 거리를 가까운 곳부터 바꿔 보며 테두리 안 선명도를 재고, 가장 선명한 거리로 고정(폰 카메라의 대비 방식 자동 초점과 같은 원리)
  const canManual = track => { const c = caps(track); return (c.focusMode || []).includes('manual') && c.focusDistance && c.focusDistance.max > c.focusDistance.min; };
  // 테두리 영역 선명도: 라플라시안(밝기 변화의 급함) 제곱 평균 — 초점이 맞을수록 글자 경계가 날카로워 값이 커짐
  function sharpness(video, rect) {
    const W = 240, H = Math.max(8, Math.round(W * rect.h / rect.w)), c = sharpness.c || (sharpness.c = document.createElement('canvas'));
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
    let sum = 0;
    for (let y = 1; y < H - 1; y++) for (let k = 1; k < W - 1; k++) { const i = y * W + k, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]; sum += l * l; }
    return sum / ((W - 2) * (H - 2));
  }
  // 렌즈를 움직인 뒤 '새 화면'이 실제로 들어올 때까지만 기다림(고정 시간 대신) — 빠르고, 덜 움직인 화면으로 재는 실수도 줄임
  function waitFrames(video, n) {
    if (!video.requestVideoFrameCallback) return sleep(110);
    return new Promise(res => {
      let left = n; const t = setTimeout(res, 300);
      const step = () => { if (--left <= 0) { clearTimeout(t); res(); } else video.requestVideoFrameCallback(step); };
      video.requestVideoFrameCallback(step);
    });
  }
  // hint: 지난번에 가장 선명했던 거리(있으면 그 근처만 살펴 빠르게)
  // 결과: { v: 고른 거리, s: 선명도, effective: 거리에 따라 선명도가 실제로 달라졌는지 }
  async function focusSweep(track, video, rect, onStep, hint) {
    const fd = caps(track).focusDistance, snap = v => { const st = fd.step || 0; const r = st ? Math.round((v - fd.min) / st) * st + fd.min : v; return Math.min(fd.max, Math.max(fd.min, r)); };
    // 후보 거리: 명함 촬영 거리(약 8~80cm, 단위 m) + 폰이 알려준 전체 범위를 고르게 6칸
    // (폰에 따라 단위가 다르게 오는 경우가 있어 둘 다 시도 — 정렬해서 가까운 것부터)
    const even = Array.from({ length: 6 }, (_, i) => fd.min + (fd.max - fd.min) * i / 5);
    const cand = [...new Set([0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.27, 0.35, 0.5, 0.8].filter(v => v >= fd.min && v <= fd.max).concat(even).map(snap))].sort((a, b) => a - b);
    const seen = new Map();
    let tries = 0;
    const tryAt = async v => {
      v = snap(v);
      if (seen.has(v)) return { v, s: seen.get(v) };
      try { await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: v }] }); } catch (e) { return { v, s: -1 }; }
      await waitFrames(video, 2);
      const s = sharpness(video, rect); seen.set(v, s); tries++;
      if (onStep) onStep(tries);
      return { v, s };
    };
    let best = { v: cand[0], s: -1 };
    const take = r => { if (r.s > best.s) best = r; };
    // 산 오르기: 가까운 쪽부터 재다가 최고점을 지나 두 번 연속 크게(25%↓) 떨어지면 멈춤
    const climb = async (from, dir) => {
      let drops = 0;
      for (let i = from; i >= 0 && i < cand.length; i += dir) {
        const r = await tryAt(cand[i]); take(r);
        if (best.s > 0 && r.s < best.s * 0.75) { if (++drops >= 2) break; } else drops = 0;
      }
    };
    if (hint != null && hint >= fd.min && hint <= fd.max) {
      // 지난번 거리 근처부터: 그 자리와 양옆 → 더 좋아지는 쪽으로 계속
      let i = 0; for (let k = 1; k < cand.length; k++) if (Math.abs(cand[k] - hint) < Math.abs(cand[i] - hint)) i = k;
      take(await tryAt(hint));
      const left = i > 0 ? await tryAt(cand[i - 1]) : { s: -1 }, right = i < cand.length - 1 ? await tryAt(cand[i + 1]) : { s: -1 };
      take(left); take(right);
      if (left.s >= best.s && i > 1) await climb(i - 2, -1);
      else if (right.s >= best.s && i < cand.length - 2) await climb(i + 2, 1);
    } else {
      await climb(0, 1);
    }
    // 최고점 양옆을 한 번 더 촘촘히
    const bi = cand.indexOf(best.v);
    if (bi >= 0) for (const v of [bi > 0 ? (cand[bi - 1] + best.v) / 2 : null, bi < cand.length - 1 ? (best.v + cand[bi + 1]) / 2 : null]) if (v != null) take(await tryAt(v));
    // 거리에 따라 선명도가 거의 안 달라졌으면 → 이 카메라는 브라우저의 초점 조절을 실제로 따르지 않음
    const vals = [...seen.values()].filter(x => x > 0), lo = Math.min(...vals);
    const effective = vals.length >= 3 && best.s > lo * 1.15;
    if (effective) { try { await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: best.v }] }); } catch (e) {} }
    return { v: best.v, s: best.s, effective, tries };
  }

  // ── 고해상도 사진 촬영(ImageCapture) → 미리보기 화면과 맞추기 ──
  // 왜: 동영상 장면은 잡음 제거·압축이 강해 글자가 뭉개짐(실측 선명도: 동영상 63 vs 사진에서 자른 명함 403~770)
  //     사진은 방향(0/90/180/270°)과 시야(사진이 보통 더 넓음)가 미리보기와 다를 수 있어, 작게 줄여 비교해 가장 잘 겹치는 쪽을 고른다
  const grayOf = (src, sx, sy, sw, sh, W, H) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
    return g;
  };
  const ncc = (a, b) => {   // 정규화 상관계수(1에 가까울수록 같은 장면)
    let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
  };
  function rotateTo(src, deg) {   // ImageBitmap/캔버스 → 돌린 캔버스
    const w = src.width, h = src.height, q = deg % 180 !== 0, c = document.createElement('canvas');
    c.width = q ? h : w; c.height = q ? w : h;
    const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(src, -w / 2, -h / 2);
    return c;
  }
  // frame: 미리보기 장면(캔버스, 동영상 해상도). photo: 사진(ImageBitmap)
  // 결과: { img: 돌린 사진, crop: 미리보기와 같은 범위(사진 좌표), score } — 미리보기 좌표 → 사진 좌표 변환에 씀
  function alignPhoto(frame, photo, zoom) {
    const W = 48, H = Math.max(8, Math.round(48 * frame.height / frame.width));
    const ref = grayOf(frame, 0, 0, frame.width, frame.height, W, H);
    let best = { score: -2 };
    for (const deg of [0, 90, 180, 270]) {
      const pw = deg % 180 ? photo.height : photo.width, ph = deg % 180 ? photo.width : photo.height;
      const fa = frame.width / frame.height;
      // 미리보기 비율로 사진 가운데를 최대한 크게 자른 범위(=object-fit: cover) + 흔들림 보정 등으로 조금 더 확대된 경우(1.1, 1.2배)
      let cw = pw, ch = pw / fa; if (ch > ph) { ch = ph; cw = ph * fa; }
      // 비율이 크게 다르면(가로 사진 vs 세로 화면) 이 방향은 건너뜀
      if ((pw > ph) !== (frame.width > frame.height) && Math.abs(pw / ph - 1) > 0.1) continue;
      const img = rotateTo(photo, deg);
      // 줌이 미리보기에만 걸리고 사진에는 안 걸리는 폰 대비: 줌 배율만큼 더 확대된 경우도 비교
      for (const z of (zoom > 1.05 ? [1, 1.1, 1.2, zoom, zoom * 1.1] : [1, 1.1, 1.2])) {
        const w = cw / z, h = ch / z, x = (pw - w) / 2, y = (ph - h) / 2;
        const sc = ncc(ref, grayOf(img, x, y, w, h, W, H));
        if (sc > best.score) best = { deg, img, crop: { x, y, w, h }, score: sc };
      }
    }
    return best;
  }

  // opts.diag: 진단 정보(해상도·초점·카메라 이름) 표시 — 관리자만
  async function open(opts = {}) {
    if (!supported()) throw new Error('이 폰에서는 앱 안 카메라를 쓸 수 없어요');
    let stream = await getStream();
    let cams = await backCameras();
    let track = stream.getVideoTracks()[0];
    // 시작 카메라 고르기: ① 전에 🔄로 골라 둔 카메라 ② 메인 카메라(번호가 가장 작은 후면 카메라, 예: "camera2 0, facing back")
    // 왜: 브라우저가 초광각 같은 보조 카메라(예: camera 2)를 고르는 폰이 있음 — 자동 초점이 있다고 응답해도 가까운 명함에 초점을 못 잡아 흐림
    let saved = ''; try { saved = localStorage.getItem('cbCamDevice') || ''; } catch (e) {}
    const camNo = d => { const m = /camera2?\s*(\d+)/i.exec(d.label || ''); return m ? +m[1] : 999; };
    const main = cams.slice().sort((a, b) => camNo(a) - camNo(b))[0];
    const want = cams.find(d => d.deviceId === saved) || (main && camNo(main) < 999 ? main : null);
    if (want && want.deviceId !== track.getSettings().deviceId) {
      try { const s2 = await getStream(want.deviceId); stream.getTracks().forEach(t => t.stop()); stream = s2; track = s2.getVideoTracks()[0]; } catch (e) {}
    }
    // 그래도 자동 초점이 없으면 다른 후면 카메라 중 자동 초점 되는 것으로
    if (!hasAF(track)) {
      for (const d of cams) {
        if (d.deviceId === track.getSettings().deviceId) continue;
        try {
          const s2 = await getStream(d.deviceId), t2 = s2.getVideoTracks()[0];
          if (hasAF(t2)) { stream.getTracks().forEach(t => t.stop()); stream = s2; track = t2; break; }
          s2.getTracks().forEach(t => t.stop());
        } catch (e) {}
      }
    }
    await continuousAF(track);
    let zoom = await applyZoom(track);

    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.id = 'cardCamera';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;overflow:hidden;touch-action:none;font-family:"Noto Sans KR",sans-serif';
      wrap.innerHTML = `
        <video playsinline autoplay muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
        <div class="cc-guide" style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.9);pointer-events:none"></div>
        <div class="cc-ring" style="display:none;position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid #fde047;border-radius:50%;pointer-events:none"></div>
        <div class="cc-hint" style="position:absolute;left:0;right:0;text-align:center;color:#fff;font-size:15px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.6);padding:0 16px;pointer-events:none"></div>
        <div class="cc-sub" style="position:absolute;left:0;right:0;text-align:center;color:rgba(255,255,255,.8);font-size:12px;line-height:1.6;padding:0 16px;pointer-events:none"></div>
        <div class="cc-mode" style="position:absolute;left:50%;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 90px);transform:translateX(-50%);display:flex;background:rgba(0,0,0,.5);border-radius:20px;padding:3px">
          <button data-v="0" style="border:0;border-radius:17px;padding:8px 16px;font-size:13px;font-weight:700;white-space:nowrap">가로 명함</button>
          <button data-v="1" style="border:0;border-radius:17px;padding:8px 16px;font-size:13px;font-weight:700;white-space:nowrap">세로 명함</button>
        </div>
        <button class="cc-close" aria-label="닫기" style="position:absolute;top:max(16px,env(safe-area-inset-top));left:16px;width:44px;height:44px;border-radius:22px;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:22px">✕</button>
        <button class="cc-switch" aria-label="카메라 전환" style="display:none;position:absolute;right:20px;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 13px);height:48px;padding:0 14px;border-radius:24px;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:13px;font-weight:700">🔄 카메라</button>
        <button class="cc-shot" aria-label="촬영" style="position:absolute;left:50%;bottom:max(28px,env(safe-area-inset-bottom));transform:translateX(-50%);width:74px;height:74px;border-radius:37px;border:5px solid rgba(255,255,255,.85);background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.25)"></button>
        <div class="cc-status" style="display:none;position:absolute;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fde047;font-size:13px;font-weight:700;padding:6px 14px;border-radius:14px;white-space:nowrap;pointer-events:none"></div>
        <div class="cc-diag" style="position:absolute;right:12px;top:max(20px,env(safe-area-inset-top));max-width:60%;text-align:right;color:rgba(255,255,255,.6);font-size:10px;line-height:1.4;pointer-events:none"></div>
        <div class="cc-rotate" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.82);color:#fff;align-items:center;justify-content:center;text-align:center;font-size:17px;font-weight:700;line-height:1.7;padding:16px"><div><div style="font-size:40px">📱</div>폰을 <span style="color:#7dd3fc">세로로</span> 들어주세요<div style="font-size:13px;font-weight:400;opacity:.8">세로로 들고 찍어야 명함 방향이 정확해요</div></div></div>`;
      document.body.appendChild(wrap);
      const $ = sel => wrap.querySelector(sel);
      const video = $('video'), guide = $('.cc-guide'), hint = $('.cc-hint'), sub = $('.cc-sub'), shot = $('.cc-shot'),
        rot = $('.cc-rotate'), ring = $('.cc-ring'), diag = $('.cc-diag'), sw = $('.cc-switch'), status = $('.cc-status');
      video.srcObject = stream;

      // 진단 정보(관리자 시험용): 실제로 받은 해상도·초점 방식·카메라 이름 — 흐릴 때 원인 파악에 씀
      const showDiag = () => {
        const s = track.getSettings ? track.getSettings() : {}, c = caps(track);
        diag.textContent = `${s.width || video.videoWidth}×${s.height || video.videoHeight} · 초점 ${(c.focusMode || ['정보없음']).join('/')}${s.focusMode ? '(' + s.focusMode + ')' : ''}${c.focusDistance ? ' · 거리 ' + c.focusDistance.min + '~' + c.focusDistance.max : ''}${s.focusDistance != null ? '(' + (+s.focusDistance).toFixed(2) + ')' : ''} · 줌 ${s.zoom != null ? (+s.zoom).toFixed(1) : '없음'}(요청 ${zoom.toFixed(1)}) · 선명도 ${Math.round(lastSharp)}/${Math.round(peak)} · ${(track.label || '').slice(0, 40)}`;
      };
      // 안내 문구: 줌이 걸리면 화면에 맞추기만 해도 거리가 확보됨. 줌이 안 되는 폰은 직접 떨어져야 함
      let lastSharp = 0, peak = 0;
      const SUB_OK = () => zoom > 1.05 ? '테두리에 맞추면 알맞은 거리(약 20cm)예요 · 흐리면 명함을 <b>탭</b>' : '너무 가까우면 초점이 안 맞아요 · <b>한 뼘 반(20cm)</b> 떨어져서 · 흐리면 명함을 <b>탭</b>';
      const setSub = blurry => { sub.innerHTML = blurry ? '<span style="color:#fde047">흐려요 — 폰을 조금 <b>멀리</b> 떼거나 명함을 <b>탭</b>하세요</span>' : SUB_OK(); guide.style.borderColor = blurry ? '#fde047' : 'rgba(255,255,255,.9)'; };
      setSub();
      if (!opts.diag) diag.style.display = 'none';
      video.addEventListener('loadedmetadata', showDiag);
      showDiag();

      // 카메라 전환(후면 카메라가 여러 개일 때): 자동으로 고른 카메라가 흐리면 직접 바꿔볼 수 있게
      if (cams.length > 1) sw.style.display = 'block';
      sw.onclick = async () => {
        const cur = track.getSettings().deviceId, i = cams.findIndex(d => d.deviceId === cur), next = cams[(i + 1) % cams.length];
        try {
          const s2 = await getStream(next.deviceId);
          stream.getTracks().forEach(t => t.stop());
          stream = s2; track = s2.getVideoTracks()[0]; video.srcObject = stream; locked = false;
          await continuousAF(track); zoom = await applyZoom(track); peak = 0; setSub(); showDiag();
          try { localStorage.setItem('cbCamDevice', next.deviceId); } catch (e) {}   // 고른 카메라 기억 — 다음부터 이 카메라로 시작
        } catch (e) { console.warn('카메라 전환 실패', e); }
      };

      // 화면의 테두리 위치 → 영상 좌표(object-fit: cover 역계산)
      const guideRect = (margin = 0) => {
        const vw = video.videoWidth, vh = video.videoHeight, ew = video.clientWidth, eh = video.clientHeight;
        const s = Math.max(ew / vw, eh / vh), ox = (ew - vw * s) / 2, oy = (eh - vh * s) / 2;
        const g = guide.getBoundingClientRect(), e = video.getBoundingClientRect();
        let x = (g.left - e.left - ox) / s, y = (g.top - e.top - oy) / s, w = g.width / s, h = g.height / s;
        x -= w * margin; y -= h * margin; w *= 1 + 2 * margin; h *= 1 + 2 * margin;
        x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
        return { x, y, w, h };
      };
      // 초점 맞추기: ① 지점 지정·한 번 맞추기를 지원하면 그것 ② 수동 초점만 되면 직접 맞추기(거리 바꿔 가며 가장 선명한 곳) ③ 둘 다 안 되면 자동 초점 다시 걸기
      let locked = false, focusing = false, shooting = false, relT = 0;
      const noManual = new Set();   // 이번 촬영 화면에서 직접 초점이 안 통한 카메라(영구 기억하지 않음 — 너무 가까워서 실패한 것일 수 있음)
      // 탭으로 고정한 초점은 5초 뒤 연속 자동 초점으로 되돌림(기본 카메라 앱과 같음)
      // 왜: 고정된 채로 폰을 움직이면 계속 흐린데 다시 맞춰지지 않아 '초점이 안 변하는' 것처럼 보였음
      const holdFocus = () => { clearTimeout(relT); relT = setTimeout(async () => { if (shooting || focusing) return; await continuousAF(track); locked = false; }, 5000); };
      // 초점이 자리 잡을 때까지 기다림: 테두리 안 선명도가 더 안 변하면(연속 2번 12% 이내) 끝. 브라우저는 '초점 맞음' 신호를 못 받으므로 화면으로 판단
      const settle = async (maxMs = 1200) => {
        const t0 = performance.now(); let prev = -1, stable = 0;
        while (performance.now() - t0 < maxMs) {
          await waitFrames(video, 3);
          const v = sharpness(video, guideRect());
          if (prev > 0 && Math.abs(v - prev) <= prev * 0.12) { if (++stable >= 2) break; } else stable = 0;
          prev = v;
        }
      };
      const setStatus = t => { status.textContent = t; status.style.display = t ? 'block' : 'none'; status.style.top = (guide.getBoundingClientRect().bottom + 40) + 'px'; };
      const doFocus = async (x, y) => {
        if (focusing || !video.videoWidth) return;
        focusing = true;
        try {
          if (await focusOnce(track, x, y)) { setStatus('초점 맞추는 중…'); await settle(1500); locked = true; }
          else if (canManual(track)) {
            // 카메라별 기억: 지난번 거리(빠르게 근처만) / 초점 조절이 안 되는 카메라(건너뜀)
            const dev = track.getSettings().deviceId || track.label || '', key = 'cbFocus2:' + dev;   // cbFocus2: 예전 기억(줌 없던 때의 거리·'안 됨' 표시)은 버림
            let mem = {}; try { mem = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
            if (noManual.has(dev)) {   // 직접 초점이 안 통하는 카메라 → 자동 초점을 다시 걸어 줌
              setStatus('초점 다시 잡는 중…');
              try { await track.applyConstraints({ advanced: [{ focusMode: 'manual' }] }); } catch (e) {}
              await sleep(150); await continuousAF(track); await settle(1500);
              setStatus(''); return;
            }
            setStatus('초점 맞추는 중…');
            const r = await focusSweep(track, video, guideRect(), () => {}, mem.v);
            if (r.effective) { try { localStorage.setItem(key, JSON.stringify({ v: r.v })); } catch (e) {} }
            else {
              // 거리를 바꿔도 선명도가 그대로 → 자동 초점으로 돌려놓고, 이번 화면에서는 직접 초점을 건너뜀
              noManual.add(dev);
              await continuousAF(track); await settle(1500);
              setStatus('초점이 안 잡혀요 · 폰을 조금 멀리 떼 보세요'); showDiag();
              setTimeout(() => setStatus(''), 2500); return;
            }
            locked = true; showDiag();
          } else {
            setStatus('초점 다시 잡는 중…');
            try { await track.applyConstraints({ advanced: [{ focusMode: 'manual' }] }); } catch (e) {}
            await sleep(150); await continuousAF(track); await settle(1500);
          }
          if (locked) holdFocus();
          setStatus('✓ 초점 맞음'); setTimeout(() => setStatus(''), 900);
        } finally { focusing = false; }
      };
      // 탭하면 초점(노란 원 표시)
      video.addEventListener('click', async ev => {
        const r = video.getBoundingClientRect();
        ring.style.left = ev.clientX + 'px'; ring.style.top = ev.clientY + 'px'; ring.style.display = 'block';
        await doFocus((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
        ring.style.display = 'none';
      });

      // 가로/세로 명함 전환 — 세로 명함은 세로 테두리에 똑바로 세워 찍어야 글자가 바로 선 채로 들어감. 마지막 선택 기억
      let vertical = false; try { vertical = localStorage.getItem('cbCamVertical') === '1'; } catch (e) {}
      const modeBtns = [...wrap.querySelectorAll('.cc-mode button')];
      modeBtns.forEach(b => b.onclick = () => { vertical = b.dataset.v === '1'; try { localStorage.setItem('cbCamVertical', vertical ? '1' : '0'); } catch (e) {} layout(); });
      const layout = () => {
        const W = wrap.clientWidth, H = wrap.clientHeight, landscape = W > H;
        rot.style.display = landscape ? 'flex' : 'none';
        shot.disabled = landscape; shot.style.opacity = landscape ? '.3' : '1';
        let gw, gh;
        if (vertical) { gh = Math.round(Math.min(H * 0.55, W * GUIDE_W * RATIO)); gw = Math.round(gh / RATIO); }
        else { gw = Math.round(Math.min(W * GUIDE_W, (H * 0.55) * RATIO)); gh = Math.round(gw / RATIO); }
        hint.innerHTML = '명함을 <span style="color:#7dd3fc">' + (vertical ? '세로로 세워' : '가로로') + '</span> 테두리에 맞춰주세요';
        modeBtns.forEach(b => { const on = (b.dataset.v === '1') === vertical; b.style.background = on ? '#fff' : 'transparent'; b.style.color = on ? '#16305e' : '#fff'; });
        guide.style.width = gw + 'px'; guide.style.height = gh + 'px';
        const top = H * 0.44 - gh / 2;
        hint.style.top = Math.max(12, top - 64) + 'px'; sub.style.top = (top + gh + 14) + 'px';
      };
      layout();
      window.addEventListener('resize', layout);
      // 실시간 선명도: 방금 전 가장 선명했던 때의 절반 아래로 떨어지면 '흐려요'(테두리 노란색) — 초점이 변하는 것이 눈에 보이게
      // 한계: 처음부터 계속 흐린 경우(너무 가까움)는 비교할 기준이 없어 못 잡음 → 그건 줌으로 거리를 벌려 해결
      const meter = setInterval(() => {
        if (focusing || shooting || !video.videoWidth) return;
        lastSharp = sharpness(video, guideRect());
        peak = Math.max(peak * 0.97, lastSharp);
        setSub(peak > 0 && lastSharp < peak * 0.5);
        if (opts.diag) showDiag();
      }, 300);
      const done = file => {
        window.removeEventListener('resize', layout);
        clearInterval(meter); clearTimeout(relT);
        stream.getTracks().forEach(t => t.stop());
        wrap.remove();
        resolve(file);
      };
      $('.cc-close').onclick = () => done(null);
      shot.onclick = async () => {
        if (shot.disabled || !video.videoWidth) return;
        shot.disabled = true; shot.style.opacity = '.5'; shooting = true;
        const usePhoto = typeof root.ImageCapture === 'function';
        if (!usePhoto && !locked) await doFocus(0.5, 0.44);
        // 초점이 움직이는 중에 찍히지 않게, 자리 잡을 때까지 잠깐 기다림(0.3~1.2초)
        // 왜: 브라우저의 사진 촬영은 기본 카메라 앱과 달리 '초점 맞춘 뒤 찍기'를 해 주지 않고 렌즈가 지금 있는 자리에서 그대로 찍음
        setStatus('초점 확인 중…'); await settle(); setStatus('');
        const g = guideRect(MARGIN), vw = video.videoWidth, vh = video.videoHeight;
        // ① 예비: 지금 미리보기 장면(동영상 해상도)
        const frame = document.createElement('canvas'); frame.width = vw; frame.height = vh;
        frame.getContext('2d').drawImage(video, 0, 0, vw, vh);
        let out = null, info = '동영상 ' + vw + '×' + vh;
        // ② 고해상도 사진 → 미리보기와 맞춰 테두리 영역만
        if (usePhoto) {
          try {
            setStatus('촬영 중…');
            const ic = new root.ImageCapture(track);
            let opt = {}; try { const pc = await ic.getPhotoCapabilities(); if (pc.imageWidth && pc.imageWidth.max) opt = { imageWidth: pc.imageWidth.max }; } catch (e) {}
            const blob = await ic.takePhoto(opt);
            const photo = await createImageBitmap(blob);
            const al = alignPhoto(frame, photo, zoom);
            if (al.score > 0.6) {   // 충분히 같은 장면일 때만(아니면 예비 장면 사용)
              const kx = al.crop.w / vw, ky = al.crop.h / vh;
              const px = al.crop.x + g.x * kx, py = al.crop.y + g.y * ky, pw = g.w * kx, ph = g.h * ky;
              out = document.createElement('canvas'); out.width = Math.round(pw); out.height = Math.round(ph);
              out.getContext('2d').drawImage(al.img, px, py, pw, ph, 0, 0, out.width, out.height);
              info = `사진 ${photo.width}×${photo.height} → 명함 ${out.width}×${out.height} · 줌 ${zoom.toFixed(1)} · 회전 ${al.deg}° · 일치 ${al.score.toFixed(2)}`;
            } else info += ` (사진 불일치 ${al.score.toFixed(2)})`;
            photo.close && photo.close();
          } catch (e) { info += ' (사진 실패: ' + (e.name || e.message) + ')'; }
        }
        if (!out) { out = document.createElement('canvas'); out.width = Math.round(g.w); out.height = Math.round(g.h); out.getContext('2d').drawImage(frame, g.x, g.y, g.w, g.h, 0, 0, out.width, out.height); }
        if (opts.diag) { setStatus(info); await sleep(1500); }   // 관리자: 어떤 방식으로 찍혔는지 확인
        const blob = await new Promise(ok => out.toBlob(ok, 'image/jpeg', 0.98));
        const file = new File([blob], 'card-camera.jpg', { type: 'image/jpeg' });
        file._guided = true;   // 테두리 안에서 찍음 → 명함 찾기를 크기와 상관없이 시도
        file._capture = info;
        done(file);
      };
    });
  }

  root.CardCamera = { open, supported, _focusSweep: focusSweep, _sharpness: sharpness, _alignPhoto: alignPhoto };   // _로 시작: 시험용
})(window);
