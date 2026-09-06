// CardBook AI Worker — cardbook-ai.jinjjabg.workers.dev
// 환경변수(Secret): ANTHROPIC_API_KEY
// KV 바인딩(선택): OCR_CACHE — 같은 이미지는 한 번만 읽고 결과 재사용. 바인딩이 없으면 캐시 없이 동작
// 라우트: /ocr-image (신규, 이미지→구조화+전문)  /ocr-parse (기존)  /ai-search (기존)

// 첫 번째가 안 되면(모델명 없음 404) 다음 모델로 자동 재시도
const MODELS = ['claude-sonnet-4-6', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
// 비용 실험: OCR만 Haiku로 돌려보려면 아래를 ['claude-haiku-4-5-20251001', ...MODELS] 로 바꾸고 Deploy
const OCR_MODELS = MODELS;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function callClaude(env, content, maxTokens, models = MODELS) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Worker에 ANTHROPIC_API_KEY Secret이 없습니다');
  let lastErr = '';
  for (const model of models) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('응답에 JSON 없음: ' + text.slice(0, 80));
      return JSON.parse(m[0]);
    }
    lastErr = `[${model}] ${data.error?.type || res.status}: ${data.error?.message || ''}`;
    if (data.error?.type !== 'not_found_error') break; // 모델명 문제일 때만 다음 모델 시도
  }
  throw new Error(lastErr);
}

const OCR_SCHEMA = `{
  "name": "한글 이름",
  "nameEn": "영문 이름",
  "title": "직함",
  "company": "회사명(한글 우선)",
  "industry": "업종을 한 줄로 (예: 실내공기질관리 솔루션)",
  "phone": "휴대폰 번호 010-0000-0000 형식, 없으면 일반전화",
  "email": "이메일",
  "address": "주소",
  "website": "홈페이지/URL",
  "services": "취급 서비스·제품·대상고객을 줄바꿈으로 나열",
  "bni": "BNI 챕터명이 보이면 (예: 파이오니어), 없으면 빈 문자열",
  "fullText": "명함에 보이는 모든 글자를 빠짐없이, 읽히는 순서대로"
}`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    // ── 이미지 프록시: Firebase Storage 파일을 카드북 페이지가 가져갈 수 있게 (CORS 우회, 공유용) ──
    if (request.method === 'GET' && url.pathname === '/img') {
      const src = url.searchParams.get('u') || '';
      if (!src.startsWith('https://firebasestorage.googleapis.com/')) return json({ error: 'not allowed' }, 403);
      const r = await fetch(src);
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ...CORS } });
    }

    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    try {
      // ── 신규: 이미지 한 장으로 OCR + 구조화 ──
      if (url.pathname === '/ocr-image') {
        const { image, mediaType, hash } = await request.json();
        if (!image) return json({ error: 'image required' }, 400);
        // 공유 캐시: 같은 이미지 파일(해시 동일)은 Claude를 부르지 않고 저장된 결과 반환
        if (hash && env.OCR_CACHE) {
          const hit = await env.OCR_CACHE.get(hash, 'json');
          if (hit) return json({ ...hit, cached: true });
        }
        const result = await callClaude(env, [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
          { type: 'text', text: `이 명함(또는 명함 전단) 이미지를 읽고 아래 JSON 스키마로만 답해. 마크다운 없이 JSON만. 없는 항목은 빈 문자열.\n${OCR_SCHEMA}` },
        ], 2000, OCR_MODELS);
        if (hash && env.OCR_CACHE) await env.OCR_CACHE.put(hash, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 365 });
        return json(result);
      }

      // ── 기존: 텍스트 파싱 ──
      if (url.pathname === '/ocr-parse') {
        const { rawText } = await request.json();
        const result = await callClaude(env, [
          { type: 'text', text: `다음 명함 텍스트에서 정보를 추출해 JSON으로만 답해. 없으면 빈 문자열.\n{"name":"","nameEn":"","title":"","company":"","phone":"","email":""}\n\n${rawText}` },
        ], 500);
        return json(result);
      }

      // ── 기존: AI 검색 ──
      if (url.pathname === '/ai-search') {
        const { query, summaries } = await request.json();
        const result = await callClaude(env, [
          { type: 'text', text: `명함 목록에서 검색어와 관련된 사람을 찾아. JSON으로만 답해: {"matched":[인덱스 숫자 배열],"summary":"한 줄 설명"}\n\n검색어: ${query}\n\n명함 목록:\n${summaries}` },
        ], 500);
        return json(result);
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
