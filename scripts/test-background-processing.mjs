import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    const original = window.fetch.bind(window);
    window.fetch = (url, options) => {
      if (!String(url).includes('generativelanguage.googleapis.com')) return original(url, options);
      sessionStorage.setItem('mockGeminiCalls', String(Number(sessionStorage.getItem('mockGeminiCalls') || 0) + 1));
      const output = { chapter_title_zh: '你好', chapter_title_vi: 'Chào hỏi', summary_vi: 'Bài học thử.', vocabulary: [{ word_zh: '你好', pinyin: 'nǐ hǎo', meaning_vi: 'xin chào' }], grammar: [], quiz: [] };
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 }));
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => [...document.querySelectorAll('nav button')].some((button) => button.textContent.trim() === 'Thư viện'));
  await page.evaluate(async () => {
    const db = await import('/src/lib/db.js');
    const courseId = 'background-test';
    const documentId = 'background-document';
    const chunks = [0, 1, 2].map((index) => ({ id: `chunk_${index}`, index, text: `第${index + 1}课 你好。我们学习中文。`, estimatedTokens: 20 }));
    await db.saveSettings({ geminiApiKey: 'mock-key', geminiModel: 'gemini-flash-latest' });
    await db.saveCourse({ id: courseId, name: 'Kiểm thử chạy nền', type: 'imported', status: 'has-raw', rawDocumentId: documentId, chapters: [], metadata: {} });
    await db.saveRawDocument({ id: documentId, courseId, fileName: 'test.txt', chunkCount: chunks.length, chunks, generated: {}, status: 'chunked' });
  });
  await page.evaluate(() => [...document.querySelectorAll('nav button')].find((button) => button.textContent.trim() === 'Thư viện')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('main article h2')].some((heading) => heading.textContent === 'Kiểm thử chạy nền'));
  await page.evaluate(() => [...document.querySelectorAll('main article')].find((article) => article.querySelector('h2')?.textContent === 'Kiểm thử chạy nền')?.querySelector('button.btn-primary')?.click());
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Sinh bài học từ tài liệu'));
  // The screen shows a loading skeleton until the stored document is read; wait
  // for the real start button so the click cannot land on a not-yet-ready UI.
  await page.waitForFunction(() => [...document.querySelectorAll('main button')].some((button) => button.textContent.trim() === 'Bắt đầu xử lý'));
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((button) => button.textContent.trim() === 'Bắt đầu xử lý')?.click());
  await page.waitForFunction(async () => Boolean((await (await import('/src/lib/db.js')).getRawDocument('background-document'))?.generated?.[0]?.output));
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((button) => button.textContent.trim() === '← Thư viện')?.click());
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Đang sinh bài học'));
  await page.waitForFunction(async () => Boolean((await (await import('/src/lib/db.js')).getRawDocument('background-document'))?.generated?.[1]?.output), { timeout: 15000 });
  assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('mockGeminiCalls'))), 2);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(async () => (await (await import('/src/lib/db.js')).getRawDocument('background-document'))?.status === 'processed', { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const db = await import('/src/lib/db.js');
    const raw = await db.getRawDocument('background-document');
    const course = await db.getCourse('background-test');
    return { completed: Object.values(raw.generated).filter((item) => item.output).length, status: course.status, calls: Number(sessionStorage.getItem('mockGeminiCalls')) };
  });
  assert.deepEqual(result, { completed: 3, status: 'review', calls: 3 });
  assert.deepEqual(errors, []);
  console.log('Background processing OK: rời màn hình vẫn chạy, F5 tự tiếp tục từ checkpoint, không sinh lại đoạn đã xong.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
