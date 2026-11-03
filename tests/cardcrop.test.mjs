// 종이 명함 자르기: 기울어진 명함은 모서리를 찾고, 명함 이미지·구분 안 되는 사진은 자르지 않음(원본 유지)
import assert from 'assert';
import { createRequire } from 'module';
const C = createRequire(import.meta.url)('../card-crop.js');

// 가짜 사진 만들기: 배경색 + 회전된 명함(밝은색) + 명함 위 글자 줄(어두운 가로 막대)
function photo({ w = 360, h = 270, bg = [60, 50, 40], card = [235, 235, 230], cx = 180, cy = 135, cw = 200, ch = 112, deg = 12, noise = 18, textOutside = false, ink = [30, 30, 30], card2 = null }) {
  const d = new Uint8ClampedArray(w * h * 4), t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, u = dx * cs + dy * sn, v = -dx * sn + dy * cs;   // 명함 좌표
    let c = bg.map(b => b + (rnd() - 0.5) * noise);
    if (Math.abs(u) < cw / 2 && Math.abs(v) < ch / 2) {
      c = (card2 && u > 0) ? card2.slice() : card.slice();   // card2: 오른쪽 절반 다른 색(반반 명함)
      const row = Math.floor((v + ch / 2) / 12);
      if (row % 2 === 1 && Math.abs(u) < cw / 2 - 14 && (Math.floor(u / 3) % 3 !== 0)) c = ink.slice();   // 글자 줄
    } else if (textOutside && (Math.floor(y / 10) % 2 === 1) && (Math.floor(x / 3) % 3 !== 0)) c = [20, 20, 20];
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: cx + (a * cw / 2) * cs - (b * ch / 2) * sn, y: cy + (a * cw / 2) * sn + (b * ch / 2) * cs }));
  return { d, w, h, corners };
}
const near = (q, corners, tol) => q.every((p, i) => Math.hypot(p.x - corners[i].x, p.y - corners[i].y) <= tol);

// 1) 어두운 책상 위 12° 기울어진 흰 명함 → 네 모서리를 찾음
{ const p = photo({}); const q = C.detectQuad(p.d, p.w, p.h);
  assert.ok(q, '기울어진 명함을 찾아야 함'); assert.ok(near(q, p.corners, 6), '모서리 오차 6px 이내: ' + JSON.stringify(q)); }
// 2) 반대로 기울어진(-20°) 작은 명함
{ const p = photo({ deg: -20, cw: 170, ch: 95, cx: 170, cy: 140 }); const q = C.detectQuad(p.d, p.w, p.h);
  assert.ok(q && near(q, p.corners, 6), '-20° 명함'); }
// 3) 밝은 책상 위 검은 명함(흰 글자 대신 어두운 바탕) → 어두운 쪽으로 찾음
{ const p = photo({ bg: [225, 222, 215], card: [25, 30, 45], ink: [240, 240, 240], deg: 5 }); const q = C.detectQuad(p.d, p.w, p.h);
  assert.ok(q && near(q, p.corners, 6), '검은 명함'); }
// 3-1) 흰색+남색 반반 명함(검은 천 위) → 배경색과 다른 쪽으로 한 덩어리로 찾음
{ const p = photo({ bg: [35, 35, 38], card2: [40, 70, 110], ink: [20, 20, 20], deg: -7 }); const q = C.detectQuad(p.d, p.w, p.h);
  assert.ok(q && near(q, p.corners, 7), '반반 명함: ' + JSON.stringify(q)); }
// 4) 화면 전체가 명함(이미지 명함·꽉 차게 찍음) → 자르지 않음
{ const p = photo({ cw: 420, ch: 330, deg: 0 }); assert.equal(C.detectQuad(p.d, p.w, p.h), null, '꽉 찬 명함은 원본 유지'); }
// 5) 흰 책상 위 흰 명함(구분 안 됨) → 자르지 않음
{ const p = photo({ bg: [236, 236, 231], noise: 4 }); assert.equal(C.detectQuad(p.d, p.w, p.h), null, '구분 안 되면 원본 유지'); }
// 6) 바깥에도 글자가 많은 이미지(명함 이미지 속 상자) → 자르지 않음
{ const p = photo({ bg: [170, 170, 170], noise: 0, textOutside: true }); assert.equal(C.detectQuad(p.d, p.w, p.h), null, '바깥에 글자 많으면 원본 유지'); }

// 7) 펴기: 기울어진 명함을 펴면 결과 가장자리는 명함색, 원근 변환은 모서리를 정확히 옮김
{ const p = photo({ deg: 15 }); const q = C.detectQuad(p.d, p.w, p.h);
  const { ow, oh } = C.outSize(q); assert.ok(ow / oh > 1.6 && ow / oh < 2.0, '명함 비율 유지 ' + ow + 'x' + oh);
  const out = C.warp(p.d, p.w, p.h, q, ow, oh);
  const px = (x, y) => out[(y * ow + x) * 4];
  for (const [x, y] of [[4, 4], [ow - 5, 4], [4, oh - 5], [ow - 5, oh - 5]]) assert.ok(px(x, y) > 180, `펴진 모서리(${x},${y})가 명함색이어야 함: ${px(x, y)}`);
  const H = C.homography([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }], q);
  const z = H[6] * 10 + H[7] * 5 + H[8]; assert.ok(Math.abs((H[0] * 10 + H[1] * 5 + H[2]) / z - q[2].x) < 1e-6, '원근 변환 모서리 일치'); }
// 8) 결과 크기: 긴 변 1568 넘지 않음
{ const s = C.outSize([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1700 }, { x: 0, y: 1700 }]); assert.equal(Math.max(s.ow, s.oh), 1568); }
console.log('CARD CROP TESTS PASSED');
