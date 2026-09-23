import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  await mkdir('test-artifacts', { recursive: true });
  for (const width of [1440, 375]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width, height: width === 375 ? 812 : 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Tiếp tục học'));
    if (width < 1024) await page.click('button[aria-label="Mở menu"]');
    await page.evaluate(() => [...document.querySelectorAll('nav button')].find((button) => button.textContent.trim() === 'Thư viện')?.click());
    await page.waitForSelector('input[aria-label="Tên khóa học"]');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(overflow.scroll <= overflow.width + 1, `Tràn ngang ở ${width}px: ${JSON.stringify(overflow)}`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `test-artifacts/library-${width}.png` });
    await page.close();
  }
  console.log('Layout OK: Library 1440px và 375px không tràn ngang, không lỗi JS.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
