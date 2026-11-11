/* eslint-disable no-restricted-globals */
/**
 * DuDu Hán Ngữ — service worker.
 *
 * CHỈ đăng ký ở bản production (xem src/main.jsx). Ở chế độ dev, server Vite
 * phục vụ module chưa build nên SW không được chạm vào request.
 *
 * Chiến lược:
 *  - install: precache app shell (/, /index.html, manifest, icon) — không hardcode
 *    tên asset có hash; asset build được cache dần ở runtime.
 *  - navigation: network-first, timeout ngắn, fallback cache shell → trang offline.
 *  - asset tĩnh cùng origin (JS/CSS/ảnh/font): cache-first (asset Vite có hash nên
 *    nội dung bất biến), tải xong lưu vào runtime cache.
 *  - request khác cùng origin: network-first, lỗi mạng thì dùng cache.
 *  - Bỏ qua: POST/non-GET, khác origin (API Gemini, extension), request dev của Vite.
 *  - activate: xoá cache phiên bản cũ + clients.claim().
 */

'use strict';

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'dudu-';
const SHELL_CACHE = `dudu-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dudu-runtime-${CACHE_VERSION}`;
const NAV_TIMEOUT_MS = 4000;

/** App shell cần có để mở app offline. Không liệt kê asset có hash. */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

const STATIC_EXTENSIONS = /\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp3|wav|json|webmanifest)$/i;

const OFFLINE_HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DuDu Hán Ngữ — Ngoại tuyến</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: 'Inter', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #FAF9F5; color: #1C1F26; }
  main { max-width: 420px; text-align: center; }
  .badge { width: 84px; height: 84px; margin: 0 auto 20px; border-radius: 24px;
    background: linear-gradient(180deg, #3F6B43, #6E9B6F); display: grid; place-items: center; }
  .badge span { width: 40px; height: 32px; border-radius: 6px; background: #FFFFFF; display: block; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #4A4F57; line-height: 1.55; }
  button { border: 0; border-radius: 12px; padding: 12px 22px; font-size: 15px; font-weight: 600;
    color: #FFFFFF; background: #3F6B43; cursor: pointer; }
  small { display: block; margin-top: 18px; color: #646A73; }
  @media (prefers-color-scheme: dark) {
    body { background: #12160F; color: #F2EFE8; }
    p, small { color: #C9C5BA; }
    .badge { background: linear-gradient(180deg, #6E9B6F, #3F6B43); }
  }
</style>
</head>
<body>
<main>
  <div class="badge"><span></span></div>
  <h1>Bạn đang ngoại tuyến</h1>
  <p>DuDu Hán Ngữ cần mạng cho lần mở đầu tiên. Tiến độ học của bạn vẫn được lưu trên máy — hãy kết nối mạng rồi thử lại.</p>
  <button onclick="location.reload()">Thử lại</button>
  <small>Trang đã lưu sẽ tự mở lại khi có mạng.</small>
</main>
</body>
</html>`;

function offlineFallback() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function networkErrorResponse() {
  return new Response(JSON.stringify({ error: 'offline', message: 'Không có kết nối mạng.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function isSameOriginHttp(url) {
  return url.origin === self.location.origin && (url.protocol === 'http:' || url.protocol === 'https:');
}

/** Request của Vite dev/HMR — tuyệt đối không cache, không chặn. */
function isDevRequest(url) {
  return url.pathname.startsWith('/@')
    || url.pathname.startsWith('/src/')
    || url.pathname.startsWith('/node_modules/')
    || url.pathname.includes('/@vite/')
    || url.pathname.includes('/__vite');
}

/** API cùng origin (nếu sau này có) — luôn đi mạng, không cache. */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/backgrounds/')
    || url.pathname.startsWith('/background/')
    || STATIC_EXTENSIONS.test(url.pathname);
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  if (request.method !== 'GET') return false;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

async function fetchWithTimeout(request, timeoutMs) {
  if (!timeoutMs) return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try { controller.abort(); } catch { /* ignore */ }
  }, timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(SHELL_URLS.map(async (url) => {
    try {
      const response = await fetch(new Request(new URL(url, self.location.origin), { cache: 'reload' }));
      if (response && response.ok) await cache.put(url, response.clone());
    } catch { /* một URL lỗi không được chặn install */ }
  }));
  await self.skipWaiting();
}

async function activateWorker() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
    .map((name) => caches.delete(name)));
  await self.clients.claim();
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (response && response.ok && response.type === 'basic') {
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match('/index.html') || await cache.match('/');
    return cached || offlineFallback();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return networkErrorResponse();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || networkErrorResponse();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activateWorker());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Không cache/không can thiệp POST, PUT, DELETE...
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Bỏ qua cross-origin (Gemini API, fonts, chrome-extension://...).
  if (!isSameOriginHttp(url)) return;
  if (isDevRequest(url) || isApiRequest(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'PING') {
    try { event.source?.postMessage({ type: 'PONG', version: CACHE_VERSION }); } catch { /* ignore */ }
  } else if (data.type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
    })());
  }
});
