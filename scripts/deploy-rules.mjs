// Firebase 보안 규칙(Firestore·Storage) 게시 — Firebase Rules API를 직접 호출한다.
// 서비스 계정에는 "Firebase Rules Admin" 역할만 있으면 된다(데이터 읽기·쓰기 권한 없음).
// 사용: FIREBASE_RULES_SA='<서비스 계정 JSON>' node scripts/deploy-rules.mjs
import { readFileSync } from 'fs';
import { createSign } from 'crypto';
const PROJECT = 'mandu-e7c3c', BUCKET = 'mandu-e7c3c.firebasestorage.app';
const API = 'https://firebaserules.googleapis.com/v1';
// 서비스 계정 키로 직접 접근 토큰 발급(Worker의 firebaseAccessToken과 같은 방식) — 다른 역할이 필요 없다
async function accessToken() {
  const sa = JSON.parse(process.env.FIREBASE_RULES_SA || '{}');
  if (!sa.private_key) throw new Error('FIREBASE_RULES_SA(서비스 계정 JSON)가 없어요');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const jwt = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const d = await res.json();
  if (!d.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(d));
  return d.access_token;
}
const token = await accessToken();
const call = async (method, path, body) => {
  const res = await fetch(`${API}/${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};
async function publish(file, releaseName) {
  // 1) 규칙 묶음 만들기 — 이 단계에서 문법 오류가 있으면 실패하고 게시되지 않는다
  const rs = await call('POST', `projects/${PROJECT}/rulesets`, { source: { files: [{ name: file, content: readFileSync(file, 'utf8') }] } });
  if (!rs.ok) throw new Error(`${file} 규칙 오류: ${JSON.stringify(rs.data.error || rs.data)}`);
  // 2) 게시(릴리스 교체, 없으면 새로 만듦)
  const name = `projects/${PROJECT}/releases/${releaseName}`;
  let rel = await call('PATCH', name, { release: { name, rulesetName: rs.data.name } });
  if (rel.status === 404) rel = await call('POST', `projects/${PROJECT}/releases`, { name, rulesetName: rs.data.name });
  if (!rel.ok) throw new Error(`${file} 게시 실패: ${JSON.stringify(rel.data.error || rel.data)}`);
  console.log(`✅ ${file} 게시 완료 → ${rs.data.name}`);
}
await publish('firestore.rules', 'cloud.firestore');
await publish('storage.rules', `firebase.storage/${BUCKET}`);
