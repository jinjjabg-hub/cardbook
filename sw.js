const CACHE_NAME = 'cardbook-v2';
const URLS_TO_CACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'cardbook-share').map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 공유 대상: 카톡/갤러리에서 "공유 → 카드북"으로 보낸 이미지 받기
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const files = form.getAll('images');
      const cache = await caches.open('cardbook-share');
      let i = 0;
      for (const f of files) {
        if (f && f.size) await cache.put(new Request('./shared-' + Date.now() + '-' + (i++) + '-' + (f.name || 'img')), new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
      }
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }

  if (event.request.method !== 'GET') return;

  // HTML은 항상 서버에서 새로 (브라우저 HTTP 캐시 우회) → 업데이트가 바로 반영
  const isHtml = event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  event.respondWith(
    fetch(event.request, isHtml ? { cache: 'no-store' } : {})
      .then(response => {
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
