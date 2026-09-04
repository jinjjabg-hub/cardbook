// CardBook AI Worker — cardbook-ai.jinjjabg.workers.dev
// 환경변수(Secret): ANTHROPIC_API_KEY
// 라우트: /ocr-image (신규, 이미지→구조화+전문)  /ocr-parse (기존)  /ai-search (기존)

const MODEL = 'claude-sonnet-4-6';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function callClaude(env, content, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Claude API error');
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
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
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const url = new URL(request.url);

    try {
      // ── 신규: 이미지 한 장으로 OCR + 구조화 ──
      if (url.pathname === '/ocr-image') {
        const { image, mediaType } = await request.json();
        if (!image) return json({ error: 'image required' }, 400);
        const result = await callClaude(env, [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
          { type: 'text', text: `이 명함(또는 명함 전단) 이미지를 읽고 아래 JSON 스키마로만 답해. 마크다운 없이 JSON만. 없는 항목은 빈 문자열.\n${OCR_SCHEMA}` },
        ], 2000);
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
