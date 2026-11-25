/**
 * Kiểm thử End-to-End Full-Stack thật (Production dist/ + Node SQLite Server + 2 thiết bị Puppeteer):
 *   npm run build && node scripts/test-fullstack-e2e.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../server/app.js';

const tempDir = await mkdtemp(path.join(tmpdir(), 'dudu-fullstack-e2e-'));
const dbPath = path.join(tempDir, 'test.sqlite');

const app = createApp({
  configOverrides: {
    DUDU_DB_PATH: dbPath,
    ENCRYPTION_KEY: 'fullstack-e2e-secret-key-at-least-32-chars!!',
    DUDU_DISABLE_RATE_LIMIT: 'true',
  },
  serveStatic: true,
  seed: true,
});

const addr = await app.listen(0, '127.0.0.1');
const baseUrl = `http://127.0.0.1:${addr.port}`;
let browser;

const clickButton = async (page, text) => {
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    if (!btn) throw new Error(`Không tìm thấy nút "${label}"`);
    btn.click();
  }, text);
};

try {
  browser = await puppeteer.launch({ headless: true });

  // =========================================================================
  // Thiết bị 1: Đăng ký tài khoản, làm quiz, tải khóa cộng đồng, xem xếp hạng
  // =========================================================================
  const ctx1 = await browser.createBrowserContext();
  const page1 = await ctx1.newPage();
  const errors1 = [];
  page1.on('pageerror', (e) => errors1.push(`pageerror: ${e.message}`));
  page1.on('console', (m) => { if (m.type() === 'error') errors1.push(`console: ${m.text()}`); });

  await page1.setViewport({ width: 1440, height: 900 });
  await page1.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('Tiếp tục học'));

  // Mở modal đăng nhập/đăng ký từ Header
  await page1.waitForFunction(() => [...document.querySelectorAll('header button')].some((b) => b.textContent.includes('Đăng nhập')));
  await page1.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Đăng nhập'))?.click());
  await page1.waitForSelector('[role="dialog"][aria-labelledby="auth-modal-title"]');

  // Chuyển sang tab Tạo tài khoản
  await clickButton(page1, 'Tạo tài khoản');
  await page1.type('input[name="username"]', 'minhthu99');
  await page1.type('input[name="displayName"]', 'Minh Thư');
  await page1.type('input[name="email"]', 'minhthu@dudu.vn');
  await page1.type('input[name="password"]', 'secret123');
  await page1.type('input[name="confirmPassword"]', 'secret123');
  await clickButton(page1, 'Tạo tài khoản và đồng bộ');

  // Đợi đóng modal và header hiện tên người dùng
  await page1.waitForFunction(() => !document.querySelector('[role="dialog"][aria-labelledby="auth-modal-title"]'));
  await page1.waitForFunction(() => document.querySelector('header')?.textContent.includes('Minh Thư'));

  // Làm 1 câu quiz để kiếm XP (và kích hoạt đồng bộ tiến độ lên SQLite)
  await clickButton(page1, 'Quiz');
  await page1.waitForFunction(() => [...document.querySelectorAll('main section button')].some((b) => /^[ABCD]/.test(b.textContent.trim())));
  await page1.evaluate(() => {
    // Chọn đáp án A của câu 1 (变化 = thay đổi; sự thay đổi -> đúng +10 XP!)
    const opt = [...document.querySelectorAll('main section button')].find((b) => b.textContent.trim().startsWith('A'));
    opt?.click();
  });
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('Chính xác!') || document.querySelector('main')?.textContent.includes('Chưa đúng'));
  await page1.click('button[aria-label="Thoát quiz"]');

  // Chờ đồng bộ debounced (1.2s) ghi vào SQLite thật trên server
  await new Promise((r) => setTimeout(r, 2000));
  const dbProg = app.db.prepare("SELECT xp FROM user_progress WHERE course_id = 'hanngu-tap2'").get();
  assert.ok(dbProg && dbProg.xp >= 10, `Tiến độ XP phải được đồng bộ lên SQLite, nhận: ${JSON.stringify(dbProg)}`);

  // Mở màn Cộng đồng -> kiểm tra khóa học mẫu -> nhân bản vào thư viện
  await clickButton(page1, 'Cộng đồng');
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('HSK 1 — Giao tiếp hằng ngày'));
  await page1.evaluate(() => {
    const btn = [...document.querySelectorAll('main article button')].find((b) => b.textContent.trim() === 'Thêm vào thư viện');
    if (!btn) throw new Error('Không thấy nút Thêm vào thư viện');
    btn.click();
  });
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('Đã thêm'));

  // Xem tab Bảng xếp hạng
  await clickButton(page1, 'Bảng xếp hạng');
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('Minh Thư'));
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('#1'));

  // Mở màn Gia sư AI -> kiểm tra giao diện sạch không lỗi
  await clickButton(page1, 'Gia sư AI');
  await page1.waitForFunction(() => document.querySelector('main')?.textContent.includes('Trò chuyện cùng Trúc'));

  assert.deepEqual(errors1, [], `Thiết bị 1 có lỗi console/pageerror: ${errors1.join(' | ')}`);
  await ctx1.close();

  // =========================================================================
  // Thiết bị 2 (trình duyệt mới tinh): Đăng nhập & kiểm tra đồng bộ 2 chiều!
  // =========================================================================
  const ctx2 = await browser.createBrowserContext();
  const page2 = await ctx2.newPage();
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(`pageerror: ${e.message}`));
  page2.on('console', (m) => { if (m.type() === 'error') errors2.push(`console: ${m.text()}`); });

  await page2.setViewport({ width: 1440, height: 900 });
  await page2.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page2.waitForFunction(() => [...document.querySelectorAll('header button')].some((b) => b.textContent.includes('Đăng nhập')));
  await page2.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Đăng nhập'))?.click());
  await page2.waitForSelector('input[name="identifier"]');
  await page2.type('input[name="identifier"]', 'minhthu99');
  await page2.type('input[name="password"]', 'secret123');
  await page2.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="auth-modal-title"]');
    dialog.querySelector('button[type="submit"]').click();
  });

  // Kiểm tra tên + XP từ Thiết bị 1 tự động khôi phục trên Thiết bị 2
  await page2.waitForFunction(() => document.querySelector('header')?.textContent.includes('Minh Thư'));
  await page2.waitForFunction(
    (expectedXp) => document.querySelector('header')?.textContent.includes(`${expectedXp} XP`),
    { timeout: 10000 },
    dbProg.xp,
  );

  // Kiểm tra khóa học cộng đồng đã tải ở Thiết bị 1 tự động xuất hiện trong Thư viện Thiết bị 2!
  await clickButton(page2, 'Thư viện');
  await page2.waitForFunction(() => document.querySelector('main')?.textContent.includes('HSK 1 — Giao tiếp hằng ngày'), { timeout: 10000 });

  assert.deepEqual(errors2, [], `Thiết bị 2 có lỗi console/pageerror: ${errors2.join(' | ')}`);
  await ctx2.close();

  console.log(`Full-Stack E2E OK: đăng ký, đồng bộ ${dbProg.xp} XP sang SQLite, clone khóa cộng đồng, bảng xếp hạng #1, Gia sư AI, khôi phục trọn vẹn trên Thiết bị 2 (0 lỗi console).`);
} finally {
  if (browser) await browser.close();
  await app.close();
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
