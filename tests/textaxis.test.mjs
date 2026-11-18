// 글자 줄 방향(textAxis): 조명 그림자·색 띠가 있어도 가로 명함을 세로로 착각하지 않아야 함
// 왜: 실제 폰 사진은 한쪽이 그림자로 어두운 경우가 많은데, 예전엔 그 어두운 쪽을 '글자'로 보고 세로 줄로 판단 → 가로 명함이 90° 돌아가 세로로 저장됐음
import assert from 'assert';
import { createRequire } from 'module';
const C = createRequire(import.meta.url)('../card-crop.js');

// 가로 명함(400×228): 흰 종이 + 가로 글자 줄 4개, shade: 왼→오 밝기 감소(그림자), vertical: 글자를 세로 줄로
function card({ w = 400, h = 228, shade = 0, vertical = false, band = false } = {}) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 240 - shade * (x / w);                 // 종이 + 그림자
    if (band && x < w * 0.18) v = 70 - 0 * y;       // 왼쪽 진한 색 띠(디자인)
    const u = vertical ? y : x, t = vertical ? x : y, L = vertical ? h : w, T = vertical ? w : h;
    const line = Math.floor((t - T * 0.2) / (T * 0.13));
    const inLine = t > T * 0.2 && t < T * 0.85 && line % 2 === 0 && ((t - T * 0.2) % (T * 0.13)) < T * 0.07;
    if (inLine && u > L * 0.25 && u < L * (0.55 + 0.08 * (line % 3)) && Math.floor(u / 4) % 3 !== 0) v = 30;
    const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}
assert.equal(C.textAxis(card(), 400, 228), 'h', '기본 가로 명함');
assert.equal(C.textAxis(card({ shade: 150 }), 400, 228), 'h', '그림자 진 가로 명함');
assert.equal(C.textAxis(card({ shade: 190 }), 400, 228), 'h', '그림자 아주 진한 가로 명함');
assert.equal(C.textAxis(card({ band: true }), 400, 228), 'h', '왼쪽에 진한 색 띠가 있는 가로 명함');
assert.equal(C.textAxis(card({ vertical: true }), 400, 228), 'v', '옆으로 누운 명함(글자 세로)은 여전히 찾아야 함');
assert.equal(C.textAxis(card({ vertical: true, shade: 150 }), 400, 228), 'v', '그림자 + 누운 명함');
console.log('TEXT AXIS TESTS PASSED');
