// 앱 안 명함 촬영 화면: 폰을 세로로 들고, 가로 명함 모양 테두리 안에 명함을 맞춰 찍는다
// 왜: 폰 기본 카메라는 들고 찍은 방향에 따라 사진 방향이 제각각으로 와서(사진 방향 정보 처리가 폰·브라우저마다 다름) 명함이 옆으로 누워 인식률이 떨어졌음
//     앱 안 카메라는 화면에 보이는 그대로 영상을 받으므로 방향이 항상 같고, 테두리 영역만 잘라 쓸 수 있다
// 사용: const file = await CardCamera.open();  // 취소하면 null, 카메라를 못 쓰면 예외(→ 기본 카메라로 대체)
(function (root) {
  const RATIO = 1.75;        // 명함 가로:세로(90×50mm ≈ 1.8, 여유 있게)
  const GUIDE_W = 0.88;      // 화면 폭 대비 테두리 폭
  const MARGIN = 0.10;       // 잘라낼 때 테두리 바깥 여백(명함이 조금 벗어나도 안 잘리게)

  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  async function open() {
    if (!supported()) throw new Error('이 폰에서는 앱 안 카메라를 쓸 수 없어요');
    // 고해상도 요청(지원 안 하면 브라우저가 가능한 최대로 맞춤) — 테두리 영역만 잘라 쓰므로 해상도가 높을수록 글자가 선명
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.id = 'cardCamera';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;overflow:hidden;touch-action:none;font-family:"Noto Sans KR",sans-serif';
      wrap.innerHTML = `
        <video playsinline autoplay muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
        <div class="cc-guide" style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.9)"></div>
        <div class="cc-hint" style="position:absolute;left:0;right:0;text-align:center;color:#fff;font-size:15px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.6);padding:0 16px"></div>
        <div class="cc-mode" style="position:absolute;left:50%;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 90px);transform:translateX(-50%);display:flex;background:rgba(0,0,0,.5);border-radius:20px;padding:3px">
          <button data-v="0" style="border:0;border-radius:17px;padding:8px 16px;font-size:13px;font-weight:700;white-space:nowrap">가로 명함</button>
          <button data-v="1" style="border:0;border-radius:17px;padding:8px 16px;font-size:13px;font-weight:700;white-space:nowrap">세로 명함</button>
        </div>
        <div class="cc-sub" style="position:absolute;left:0;right:0;text-align:center;color:rgba(255,255,255,.75);font-size:12px;padding:0 16px">명함과 다른 색 바닥 위에 놓고, 흔들리지 않게</div>
        <button class="cc-close" aria-label="닫기" style="position:absolute;top:max(16px,env(safe-area-inset-top));left:16px;width:44px;height:44px;border-radius:22px;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:22px">✕</button>
        <button class="cc-shot" aria-label="촬영" style="position:absolute;left:50%;bottom:max(28px,env(safe-area-inset-bottom));transform:translateX(-50%);width:74px;height:74px;border-radius:37px;border:5px solid rgba(255,255,255,.85);background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.25)"></button>
        <div class="cc-rotate" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.82);color:#fff;align-items:center;justify-content:center;text-align:center;font-size:17px;font-weight:700;line-height:1.7;padding:16px"><div><div style="font-size:40px">📱</div>폰을 <span style="color:#7dd3fc">세로로</span> 들어주세요<div style="font-size:13px;font-weight:400;opacity:.8">세로로 들고 찍어야 명함 방향이 정확해요</div></div></div>`;
      document.body.appendChild(wrap);
      const video = wrap.querySelector('video'), guide = wrap.querySelector('.cc-guide'), hint = wrap.querySelector('.cc-hint'),
        sub = wrap.querySelector('.cc-sub'), shot = wrap.querySelector('.cc-shot'), rot = wrap.querySelector('.cc-rotate');
      video.srcObject = stream;
      // 가로/세로 명함 전환 — 세로 명함은 세로 테두리에 똑바로 세워 찍어야 글자가 바로 선 채로 들어감. 마지막 선택 기억
      let vertical = false; try { vertical = localStorage.getItem('cbCamVertical') === '1'; } catch (e) {}
      const modeBtns = [...wrap.querySelectorAll('.cc-mode button')];
      modeBtns.forEach(b => b.onclick = () => { vertical = b.dataset.v === '1'; try { localStorage.setItem('cbCamVertical', vertical ? '1' : '0'); } catch (e) {} layout(); });
      const layout = () => {
        const W = wrap.clientWidth, H = wrap.clientHeight, landscape = W > H;
        rot.style.display = landscape ? 'flex' : 'none';
        shot.disabled = landscape; shot.style.opacity = landscape ? '.3' : '1';
        let gw, gh;
        if (vertical) { gh = Math.round(Math.min(H * 0.6, W * GUIDE_W * RATIO)); gw = Math.round(gh / RATIO); }
        else { gw = Math.round(Math.min(W * GUIDE_W, (H * 0.6) * RATIO)); gh = Math.round(gw / RATIO); }
        hint.innerHTML = '명함을 <span style="color:#7dd3fc">' + (vertical ? '세로로 세워' : '가로로') + '</span> 테두리에 맞춰주세요';
        modeBtns.forEach(b => { const on = (b.dataset.v === '1') === vertical; b.style.background = on ? '#fff' : 'transparent'; b.style.color = on ? '#16305e' : '#fff'; });
        guide.style.width = gw + 'px'; guide.style.height = gh + 'px';
        const top = H * 0.44 - gh / 2;
        hint.style.top = Math.max(12, top - 64) + 'px'; sub.style.top = (top + gh + 16) + 'px';
      };
      layout();
      window.addEventListener('resize', layout);
      const done = file => {
        window.removeEventListener('resize', layout);
        stream.getTracks().forEach(t => t.stop());
        wrap.remove();
        resolve(file);
      };
      wrap.querySelector('.cc-close').onclick = () => done(null);
      shot.onclick = async () => {
        if (shot.disabled || !video.videoWidth) return;
        shot.disabled = true;
        // 화면의 테두리 위치 → 영상 좌표(object-fit: cover 역계산) → 여백 포함해 잘라냄
        const vw = video.videoWidth, vh = video.videoHeight, ew = video.clientWidth, eh = video.clientHeight;
        const s = Math.max(ew / vw, eh / vh), ox = (ew - vw * s) / 2, oy = (eh - vh * s) / 2;
        const g = guide.getBoundingClientRect(), e = video.getBoundingClientRect();
        let x = (g.left - e.left - ox) / s, y = (g.top - e.top - oy) / s, w = g.width / s, h = g.height / s;
        x -= w * MARGIN; y -= h * MARGIN; w *= 1 + 2 * MARGIN; h *= 1 + 2 * MARGIN;
        x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
        const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
        c.getContext('2d').drawImage(video, x, y, w, h, 0, 0, c.width, c.height);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.95));
        const file = new File([blob], 'card-camera.jpg', { type: 'image/jpeg' });
        file._guided = true;   // 테두리 안에서 찍음 → 명함 찾기를 크기와 상관없이 시도
        done(file);
      };
    });
  }

  root.CardCamera = { open, supported };
})(window);
