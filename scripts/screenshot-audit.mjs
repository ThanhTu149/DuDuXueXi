/**
 * Visual audit harness: serves the production build and captures every screen
 * at desktop / mobile / dark-mode viewports, reporting console errors,
 * horizontal overflow and missing main content along the way.
 *
 * Usage:
 *   npm run build && node scripts/screenshot-audit.mjs
 *   node scripts/screenshot-audit.mjs --dist   (skip build, expects dist/)
 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.cwd(), 'dist');
const OUT = resolve(process.cwd(), 'test-artifacts', 'audit');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const safe = resolve(root, `.${url}`);
      if (!safe.startsWith(root + sep) && safe !== root) {
        res.writeHead(403).end('forbidden');
        return;
      }
      let filePath = safe;
      const info = await stat(filePath).catch(() => null);
      if (!info || info.isDirectory()) filePath = join(root, 'index.html');
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const nav = async (page, label) => {
  await page.evaluate((text) => {
    const target = [...document.querySelectorAll('nav button, aside button')].find((node) => node.textContent.trim() === text);
    target?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 420));
};

const tab = async (page, label) => {
  await page.evaluate((text) => {
    const target = [...document.querySelectorAll('[role="tab"], .tab, .filter-btn')].find((node) => node.textContent.trim().startsWith(text));
    target?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 350));
};

const shots = [
  { name: '01-home', setup: async () => {} },
  { name: '02-learn-words', setup: async (page) => nav(page, 'Học') },
  { name: '03-learn-grammar', setup: async (page) => { await nav(page, 'Học'); await tab(page, 'Ngữ pháp'); } },
  { name: '04-learn-reading', setup: async (page) => { await nav(page, 'Học'); await tab(page, 'Bài khóa'); } },
  { name: '05-learn-flashcards', setup: async (page) => { await nav(page, 'Học'); await tab(page, 'Flashcards'); } },
  { name: '06-quiz', setup: async (page) => nav(page, 'Quiz') },
  { name: '07-quiz-answer', setup: async (page) => {
    await nav(page, 'Quiz');
    await page.evaluate(() => {
      const option = [...document.querySelectorAll('main section button')].find((button) => /^[ABCD]/.test(button.textContent.trim()));
      option?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
  } },
  { name: '08-review', setup: async (page) => nav(page, 'Ôn tập') },
  { name: '09-dashboard', setup: async (page) => nav(page, 'Hồ sơ') },
  { name: '10-library', setup: async (page) => nav(page, 'Thư viện') },
  { name: '11-exam', setup: async (page) => nav(page, 'Thi thử') },
  { name: '12-boss', setup: async (page) => nav(page, 'Boss Battle') },
  { name: '13-minigame', setup: async (page) => nav(page, 'Ghép từ') },
  { name: '14-dictation', setup: async (page) => nav(page, 'Chính tả') },
  { name: '15-pronunciation', setup: async (page) => nav(page, 'Phát âm') },
  { name: '16-sentences', setup: async (page) => nav(page, 'Câu ví dụ') },
  { name: '17-search', setup: async (page) => { await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control'); await new Promise((r) => setTimeout(r, 400)); } },
];

const viewports = [
  { tag: 'desktop', width: 1440, height: 900, dark: false },
  { tag: 'desktop-dark', width: 1440, height: 900, dark: true },
  { tag: 'mobile', width: 390, height: 844, dark: false },
];

const server = await startServer(ROOT);
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
const report = [];
const problems = [];
try {
  await mkdir(OUT, { recursive: true });
  browser = await puppeteer.launch({ headless: true, args: ['--font-render-hinting=none'] });
  for (const vp of viewports) {
    if (vp.tag === 'desktop-dark') {
      // dark mode via keyboard shortcut to keep stored state clean
    }
    for (const shot of shots) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.goto(`${base}#audit`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('main')?.textContent?.length > 20, { timeout: 15000 }).catch(() => {});
      if (vp.dark) {
        await page.evaluate(() => {
          document.documentElement.classList.add('dark');
        });
        await new Promise((r) => setTimeout(r, 200));
      }
      if (vp.width < 1024 && !['17-search'].includes(shot.name)) {
        // mobile: open the drawer to reach extra nav entries
        await page.evaluate(() => document.querySelector('button[aria-label="Mở menu"]')?.click());
        await new Promise((r) => setTimeout(r, 250));
      }
      await shot.setup(page);
      // close the mobile drawer before capture when it is still open
      if (vp.width < 1024) {
        await page.evaluate(() => document.querySelector('button[aria-label="Đóng menu"]')?.click());
        await new Promise((r) => setTimeout(r, 250));
      }
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        mainText: (document.querySelector('main')?.textContent || '').trim().slice(0, 80),
        mainHeight: document.querySelector('main')?.getBoundingClientRect().height || 0,
      }));
      const file = join(OUT, `${vp.tag}-${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      await page.close();
      if (metrics.scrollWidth > metrics.innerWidth + 1) problems.push(`${vp.tag}/${shot.name}: horizontal overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);
      if (!metrics.mainText) problems.push(`${vp.tag}/${shot.name}: empty main`);
      if (errors.length) problems.push(`${vp.tag}/${shot.name}: ${errors.join(' | ')}`);
      report.push({ viewport: vp.tag, shot: shot.name, ...metrics });
    }
  }
  // Colour-theme matrix: every palette (pastel/rose/ocean) must keep dark
  // surfaces dark in dark mode — the bug that used to turn cards white.
  const themeShots = [
    { name: 'home', setup: async () => {} },
    { name: 'learn', setup: async (page) => nav(page, 'Học') },
    { name: 'review', setup: async (page) => nav(page, 'Ôn tập') },
  ];
  for (const theme of ['rose', 'ocean']) {
    for (const dark of [false, true]) {
      for (const shot of themeShots) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.goto(`${base}#audit-theme`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.querySelector('main')?.textContent?.length > 20, { timeout: 15000 }).catch(() => {});
        await page.evaluate(({ theme, dark }) => {
          const root = document.documentElement;
          root.dataset.colorTheme = theme;
          root.classList.toggle('dark', dark);
        }, { theme, dark });
        await new Promise((r) => setTimeout(r, 200));
        await shot.setup(page);
        const tokens = await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          const hex = (name) => style.getPropertyValue(name).trim();
          const lum = (value) => {
            const parts = value.replace('#', '').match(/[a-f\d]{2}/gi) || [];
            const channels = parts.map((part) => Number.parseInt(part, 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return 0.2126 * (channels[0] || 0) + 0.7152 * (channels[1] || 0) + 0.0722 * (channels[2] || 0);
          };
          return { accentSubtle: hex('--accent-subtle'), bgPrimary: hex('--bg-primary'), accent: hex('--accent'), lumSubtle: lum(hex('--accent-subtle')), lumBg: lum(hex('--bg-primary')) };
        });
        await page.screenshot({ path: join(OUT, `theme-${theme}${dark ? '-dark' : ''}-${shot.name}.png`), fullPage: false });
        await page.close();
        if (dark && (tokens.lumSubtle > 0.2 || tokens.lumBg > 0.2)) {
          problems.push(`theme ${theme}/dark/${shot.name}: token sáng trong dark mode (accent-subtle=${tokens.accentSubtle}, bg=${tokens.bgPrimary})`);
        }
        if (!dark && tokens.lumSubtle > 0.95) {
          problems.push(`theme ${theme}/light/${shot.name}: accent-subtle gần như trắng (${tokens.accentSubtle})`);
        }
        report.push({ viewport: `theme-${theme}${dark ? '-dark' : ''}`, shot: shot.name, mainText: 'ok' });
        if (errors.length) problems.push(`theme ${theme}/${dark ? 'dark' : 'light'}/${shot.name}: ${errors.join(' | ')}`);
      }
    }
  }
  console.log(`Captured ${report.length} screenshots into ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.log(` - ${problem}`);
  } else {
    console.log('No console errors, overflow or empty screens detected.');
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
