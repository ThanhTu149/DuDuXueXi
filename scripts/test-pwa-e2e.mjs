/**
 * End-to-end PWA check: serves the production build, lets the service worker
 * install/activate, then reloads while offline. The app must still render from
 * cache (app shell + hashed lesson chunks are pre-cached at runtime).
 *
 * Usage: npm run build && node scripts/test-pwa-e2e.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.cwd(), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const safe = resolve(ROOT, `.${url}`);
  if (!safe.startsWith(ROOT + sep) && safe !== ROOT) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let filePath = safe;
  const info = await stat(filePath).catch(() => null);
  if (!info || info.isDirectory()) filePath = join(ROOT, 'index.html');
  const body = await readFile(filePath).catch(() => null);
  if (!body) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
try {
  await page.goto(`${base}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('main')?.textContent?.length > 20, { timeout: 15000 });

  // Manifest + icons must be reachable and parseable.
  const manifestStatus = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    const manifest = await response.json();
    return { status: response.status, icons: manifest.icons?.length || 0 };
  });
  assert.equal(manifestStatus.status, 200, 'manifest phải trả về 200');
  assert.ok(manifestStatus.icons >= 2, 'manifest phải khai báo icon');

  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await navigator.serviceWorker.ready;
    return { supported: true, activated: Boolean(registration.active), scope: registration.scope };
  });
  assert.ok(swReady.supported, 'trình duyệt phải hỗ trợ service worker');
  assert.ok(swReady.activated, 'service worker phải activate');

  // Reload so the active SW controls this client, then go offline.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('main')?.textContent?.length > 20, { timeout: 15000 });
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  assert.ok(controlled, 'trang phải do service worker kiểm soát sau khi reload');

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main')?.textContent?.length > 20, { timeout: 15000 });
  const offlineText = await page.evaluate(() => document.body.textContent.replace(/\s+/g, ' ').slice(0, 120));
  assert.ok(offlineText.length > 20, 'trang phải render được khi offline');
  assert.deepEqual(failures, [], `lỗi console khi offline: ${failures.join(' | ')}`);
  console.log(`PWA e2e OK: manifest ${manifestStatus.icons} icon, SW active, học được khi offline ("${offlineText.slice(0, 60)}...").`);
} finally {
  await browser.close();
  server.close();
}
