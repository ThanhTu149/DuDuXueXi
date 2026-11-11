/**
 * Test PWA (manifest + service worker) chạy thuần node, không mạng, không browser:
 *   node scripts/test-pwa.mjs
 *
 * Kiểm tra: manifest hợp lệ + icon đúng kích thước PNG, sw.js chạy được,
 * precache khi install, xoá cache cũ khi activate, network-first cho navigation
 * có offline fallback, cache-first cho asset có hash, và KHÔNG can thiệp
 * POST / request khác origin / request dev của Vite.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public', 'manifest.webmanifest');
const swPath = path.join(root, 'public', 'sw.js');
const ORIGIN = 'https://dudu.example';

function pngSize(filePath) {
  const buffer = readFileSync(filePath);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} không phải PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/* ------------------------------------------------------------------ */
/* 1. Manifest + icon                                                 */
/* ------------------------------------------------------------------ */

assert.ok(existsSync(manifestPath), 'thiếu public/manifest.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(typeof manifest.name, 'string');
assert.ok(manifest.name.length > 3);
assert.match(manifest.short_name, /DuDu/);
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
assert.equal(manifest.lang, 'vi');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);

const iconsBySize = new Map();
for (const icon of manifest.icons) {
  assert.equal(icon.type, 'image/png', `icon ${icon.src} phải là PNG`);
  assert.match(icon.sizes, /^\d+x\d+$/);
  assert.ok(['any', 'maskable', 'any maskable'].includes(icon.purpose), `icon ${icon.src} thiếu purpose hợp lệ`);
  const filePath = path.join(root, 'public', icon.src.replace(/^\//, ''));
  assert.ok(existsSync(filePath), `thiếu file icon ${icon.src}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  const actual = pngSize(filePath);
  assert.equal(actual.width, width, `${icon.src} rộng ${actual.width}, manifest khai ${width}`);
  assert.equal(actual.height, height, `${icon.src} cao ${actual.height}, manifest khai ${height}`);
  iconsBySize.set(`${width}-${icon.purpose}`, true);
}
assert.ok(iconsBySize.has('192-any'), 'thiếu icon 192 purpose any');
assert.ok(iconsBySize.has('512-any'), 'thiếu icon 512 purpose any');
assert.ok(iconsBySize.has('192-maskable'), 'thiếu icon 192 maskable');
assert.ok(iconsBySize.has('512-maskable'), 'thiếu icon 512 maskable');

/* ------------------------------------------------------------------ */
/* 2. Chạy service worker trong sandbox giả lập                       */
/* ------------------------------------------------------------------ */

class CacheStub {
  constructor() { this.entries = new Map(); }
  static keyOf(request) { return typeof request === 'string' ? request : request.url; }
  async put(request, response) { this.entries.set(CacheStub.keyOf(request), response.clone()); }
  async match(request) {
    const found = this.entries.get(CacheStub.keyOf(request));
    return found ? found.clone() : undefined;
  }
  async keys() { return [...this.entries.keys()]; }
}

class CacheStorageStub {
  constructor() { this.stores = new Map(); }
  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new CacheStub());
    return this.stores.get(name);
  }
  async keys() { return [...this.stores.keys()]; }
  async delete(name) { return this.stores.delete(name); }
}

const handlers = Object.create(null);
const state = { skipped: false, claimed: false, fetched: [], fetchImpl: null };
const cachesStub = new CacheStorageStub();

function basicResponse(body, init = {}) {
  const response = new Response(body, { status: 200, ...init });
  // Response tự tạo có type 'default'; response từ mạng thật có type 'basic'.
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

const self = {
  location: { origin: ORIGIN },
  addEventListener(type, handler) { (handlers[type] ||= []).push(handler); },
  skipWaiting() { state.skipped = true; },
  clients: { claim: async () => { state.claimed = true; } },
};

state.fetchImpl = async (request) => {
  const url = new URL(typeof request === 'string' ? request : request.url);
  state.fetched.push(`${request.method || 'GET'} ${url.pathname}`);
  if (url.pathname === '/manifest.webmanifest') return basicResponse('{"name":"DuDu"}', { headers: { 'Content-Type': 'application/manifest+json' } });
  if (url.pathname.endsWith('.png')) return basicResponse('png', { headers: { 'Content-Type': 'image/png' } });
  return basicResponse('<html><body>app-shell</body></html>', { headers: { 'Content-Type': 'text/html' } });
};

const sandbox = {
  self,
  caches: cachesStub,
  fetch: (input, init) => state.fetchImpl(input instanceof Request ? input : new Request(input, init)),
  Response,
  Request,
  Headers,
  URL,
  AbortController,
  DOMException,
  setTimeout,
  clearTimeout,
  console,
  JSON,
  Promise,
  Object,
  Array,
  Math,
  Date,
  String,
  Number,
  Error,
  TypeError,
};
vm.createContext(sandbox);
const swSource = readFileSync(swPath, 'utf8');
assert.match(swSource, /const CACHE_VERSION = '[^']+'/, 'sw.js phải có cache version để bump');
new vm.Script(swSource, { filename: 'sw.js' }).runInContext(sandbox);
assert.ok(handlers.install?.length, 'sw.js thiếu handler install');
assert.ok(handlers.activate?.length, 'sw.js thiếu handler activate');
assert.ok(handlers.fetch?.length, 'sw.js thiếu handler fetch');

async function dispatchLifecycle(type) {
  const waits = [];
  const event = { waitUntil: (promise) => waits.push(promise) };
  for (const handler of handlers[type] || []) handler(event);
  await Promise.all(waits);
}

/** Gọi handler fetch; trả về event đã có `response` nếu SW can thiệp. */
function dispatchFetch(request) {
  const event = { request, respondWith(promise) { event.response = promise; } };
  for (const handler of handlers.fetch || []) handler(event);
  return event;
}

// 2a. Install: precache app shell + skipWaiting.
await dispatchLifecycle('install');
assert.equal(state.skipped, true, 'install phải gọi skipWaiting');
const shellNames = await cachesStub.keys();
assert.ok(shellNames.some((name) => name.startsWith('dudu-shell-')), 'install phải tạo cache shell');
const shellCache = await cachesStub.open(shellNames.find((name) => name.startsWith('dudu-shell-')));
const shellKeys = await shellCache.keys();
assert.ok(shellKeys.includes('/index.html'), 'precache phải có /index.html');
assert.ok(shellKeys.includes('/manifest.webmanifest'), 'precache phải có manifest');
assert.ok(shellKeys.some((key) => key.includes('icon-192.png')), 'precache phải có icon 192');

// 2b. Activate: xoá cache phiên bản cũ, giữ cache app khác, clients.claim.
cachesStub.stores.set('dudu-runtime-v0', new CacheStub());
cachesStub.stores.set('dudu-shell-v0', new CacheStub());
cachesStub.stores.set('other-app-cache', new CacheStub());
await dispatchLifecycle('activate');
const afterActivate = await cachesStub.keys();
assert.equal(afterActivate.includes('dudu-runtime-v0'), false, 'activate phải xoá cache runtime cũ');
assert.equal(afterActivate.includes('dudu-shell-v0'), false, 'activate phải xoá cache shell cũ');
assert.equal(afterActivate.includes('other-app-cache'), true, 'activate không được xoá cache của app khác');
assert.equal(state.claimed, true, 'activate phải gọi clients.claim');

// 2c. Không can thiệp POST.
const postEvent = dispatchFetch(new Request(`${ORIGIN}/api/lessons`, { method: 'POST', body: 'x' }));
assert.equal(postEvent.response, undefined, 'SW không được can thiệp POST');

// 2d. Không can thiệp cross-origin (Gemini API, extension...).
const crossOrigin = dispatchFetch(new Request('https://generativelanguage.googleapis.com/v1beta/models'));
assert.equal(crossOrigin.response, undefined, 'SW không được can thiệp request khác origin');

// 2e. Không can thiệp request dev của Vite/HMR và API cùng origin.
assert.equal(dispatchFetch(new Request(`${ORIGIN}/@vite/client`)).response, undefined, 'SW phải bỏ qua @vite');
assert.equal(dispatchFetch(new Request(`${ORIGIN}/src/main.jsx`)).response, undefined, 'SW phải bỏ qua /src của dev server');
assert.equal(dispatchFetch(new Request(`${ORIGIN}/api/courses`)).response, undefined, 'SW phải bỏ qua /api');

// 2f. Navigation online: trả response mạng, không lỗi.
const onlineNav = dispatchFetch(new Request(`${ORIGIN}/`, { headers: { accept: 'text/html' } }));
assert.ok(onlineNav.response, 'navigation phải được SW xử lý');
const onlineResponse = await onlineNav.response;
assert.match(await onlineResponse.text(), /app-shell/);

// 2g. Navigation offline: fallback cache shell.
state.fetchImpl = async (request) => {
  state.fetched.push(`OFFLINE ${request.method || 'GET'}`);
  throw new TypeError('Failed to fetch');
};
const offlineNav = dispatchFetch(new Request(`${ORIGIN}/library`, { headers: { accept: 'text/html' } }));
const offlineResponse = await offlineNav.response;
assert.equal(offlineResponse.status, 200);
assert.match(await offlineResponse.text(), /app-shell/);

// 2h. Asset có hash: cache-first (lần 2 không gọi mạng).
let assetFetches = 0;
state.fetchImpl = async () => {
  assetFetches += 1;
  return basicResponse('console.log("chunk")', { headers: { 'Content-Type': 'text/javascript' } });
};
const assetRequest = () => new Request(`${ORIGIN}/assets/index-abc123.js`);
const firstAsset = await dispatchFetch(assetRequest()).response;
assert.match(await firstAsset.text(), /chunk/);
const secondAsset = await dispatchFetch(assetRequest()).response;
assert.match(await secondAsset.text(), /chunk/);
assert.equal(assetFetches, 1, 'asset có hash phải được phục vụ từ cache ở lần hai');

// 2i. Request khác cùng origin: network-first, offline thì dùng cache.
let jsonFetches = 0;
state.fetchImpl = async () => {
  jsonFetches += 1;
  return basicResponse('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
};
const jsonRequest = () => new Request(`${ORIGIN}/data/lessons.json`);
assert.match(await (await dispatchFetch(jsonRequest()).response).text(), /ok/);
state.fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
assert.match(await (await dispatchFetch(jsonRequest()).response).text(), /ok/);
assert.equal(jsonFetches, 1, 'network-first phải dùng cache khi mất mạng');

// 2j. Offline fallback HTML khi chưa có cache shell.
for (const name of await cachesStub.keys()) await cachesStub.delete(name);
const noCacheNav = dispatchFetch(new Request(`${ORIGIN}/`, { headers: { accept: 'text/html' } }));
const fallbackResponse = await noCacheNav.response;
assert.equal(fallbackResponse.status, 200);
const fallbackHtml = await fallbackResponse.text();
assert.match(fallbackHtml, /ngoại tuyến/i);
assert.match(fallbackHtml, /Thử lại/);

// 2k. Message CLEAR_CACHES dọn sạch cache của app.
await cachesStub.open('dudu-shell-v1');
await cachesStub.open('dudu-runtime-v1');
await cachesStub.open('other-app-cache');
const messageWaits = [];
for (const handler of handlers.message || []) handler({ data: { type: 'CLEAR_CACHES' }, waitUntil: (promise) => messageWaits.push(promise) });
await Promise.all(messageWaits);
const afterClear = await cachesStub.keys();
assert.equal(afterClear.some((name) => name.startsWith('dudu-')), false, 'CLEAR_CACHES phải xoá cache dudu-*');
assert.equal(afterClear.includes('other-app-cache'), true, 'CLEAR_CACHES không được xoá cache app khác');

console.log('OK PWA: manifest/icons hợp lệ, SW precache, offline fallback, cache-first asset, không chạm POST/dev/API.');
