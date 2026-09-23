import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import {
  callGemini,
  DEFAULT_GEMINI_MODEL,
  fetchAvailableModels,
  ParseError,
  RateLimitError,
  ServerError,
  testApiKey,
  TimeoutError,
} from '../src/lib/geminiClient.js';

const originalFetch = globalThis.fetch;
try {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });
  };
  assert.deepEqual(await callGemini({
    apiKey: 'secret-test-key',
    prompt: 'Test',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  }), { ok: true });
  assert.match(request.url, /gemini-flash-latest:generateContent$/);
  assert.equal(request.url.includes('secret-test-key'), false);
  assert.equal(request.options.headers['x-goog-api-key'], 'secret-test-key');
  assert.equal(JSON.parse(request.options.body).generationConfig.responseSchema.properties.ok.type, 'BOOLEAN');
  assert.deepEqual(await testApiKey('secret-test-key'), { ok: true });

  let listCalls = 0;
  globalThis.fetch = async (url, options) => {
    listCalls += 1;
    assert.equal(options.headers['x-goog-api-key'], 'catalog-key');
    assert.equal(String(url).includes('catalog-key'), false);
    assert.equal(new URL(url).searchParams.get('pageSize'), '1000');
    const pageToken = new URL(url).searchParams.get('pageToken');
    return new Response(JSON.stringify(pageToken ? {
      models: [
        { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
      ],
    } : {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3.5-flash-tts', supportedGenerationMethods: ['generateContent'] },
      ], nextPageToken: 'page-two',
    }), { status: 200 });
  };
  const models = await fetchAvailableModels('catalog-key');
  assert.deepEqual(models.map((model) => model.id), ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.5-flash']);
  assert.equal(models[1].inputTokenLimit, 1048576);
  assert.equal(listCalls, 2);
  await fetchAvailableModels('catalog-key');
  assert.equal(listCalls, 2);
  await fetchAvailableModels('catalog-key', { force: true });
  assert.equal(listCalls, 4);
  await assert.rejects(fetchAvailableModels(''), /API key/);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
    status: 429, headers: { 'Retry-After': '7' },
  });
  await assert.rejects(callGemini({ apiKey: 'x', prompt: 'x' }), (error) => error instanceof RateLimitError && error.retryAfter === 7000);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 });
  assert.match((await testApiKey('bad')).error, /không hợp lệ/);
  await assert.rejects(fetchAvailableModels('bad'), /không hợp lệ/);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'denied' } }), { status: 403 });
  await assert.rejects(callGemini({ apiKey: 'x', prompt: 'x' }), /không có quyền/);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 503 });
  await assert.rejects(callGemini({ apiKey: 'x', prompt: 'x' }), ServerError);
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }), { status: 200 });
  await assert.rejects(callGemini({ apiKey: 'x', prompt: 'x' }), ParseError);
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(callGemini({ apiKey: 'x', prompt: 'x', timeoutMs: 10 }), TimeoutError);
} finally {
  globalThis.fetch = originalFetch;
}

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
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
      if (!String(url).includes(':generateContent')) {
        window.__geminiModelCalls = (window.__geminiModelCalls || 0) + 1;
        if (window.__modelListFails) return Promise.reject(new TypeError('Network unavailable'));
        return Promise.resolve(new Response(JSON.stringify({ models: [
          { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        ] }), { status: 200 }));
      }
      window.__geminiTestCalls = (window.__geminiTestCalls || 0) + 1;
      const status = options.headers['x-goog-api-key'] === 'invalid' ? 400 : 200;
      const body = status === 200
        ? { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }
        : { error: { message: 'API key not valid' } };
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    };
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  async function openSettings() {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Hồ sơ')?.click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Cài đặt'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cài đặt')?.click());
    await page.waitForSelector('#gemini-api-key');
  }
  await openSettings();
  assert.equal(await page.$eval('#gemini-api-key', (input) => input.closest('section').textContent.includes('Đang dùng danh sách mặc định')), true);
  assert.equal(await page.$eval('input[name="gemini-model"]:checked', (input) => input.value), DEFAULT_GEMINI_MODEL);
  await page.type('#gemini-api-key', 'fake-test-key');
  await page.evaluate(() => [...document.querySelector('#gemini-api-key').closest('section').querySelectorAll('button')].find((button) => button.textContent.trim() === 'Kiểm tra').click());
  await page.waitForFunction(() => document.querySelector('#gemini-api-key').closest('section').querySelector('[role="status"]')?.textContent.includes('hoạt động'));
  await page.evaluate(() => [...document.querySelector('#gemini-api-key').closest('section').querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu').click());
  await page.waitForFunction(() => document.querySelector('#gemini-api-key').closest('section').textContent.includes('Đã lưu API key'));
  await page.waitForFunction(() => [...document.querySelectorAll('input[name="gemini-model"]')].some((input) => input.value === 'gemini-3.8-flash'));
  await page.evaluate(() => document.querySelector('input[name="gemini-model"][value="gemini-3.8-flash"]').click());
  await page.waitForFunction(async () => (await (await import('/src/lib/db.js')).getSettings()).geminiModel === 'gemini-3.8-flash');
  const stored = await page.evaluate(async () => {
    const { getSettings } = await import('/src/lib/db.js');
    return {
      key: (await getSettings()).geminiApiKey,
      input: document.querySelector('#gemini-api-key').value,
      calls: window.__geminiTestCalls,
      modelCalls: window.__geminiModelCalls,
      model: (await getSettings()).geminiModel,
      local: localStorage.getItem('geminiApiKey'),
    };
  });
  assert.equal(stored.key, 'fake-test-key');
  assert.equal(stored.input, '');
  assert.equal(stored.calls, 1);
  assert.ok(stored.modelCalls >= 1);
  assert.equal(stored.model, 'gemini-3.8-flash');
  assert.equal(stored.local, null);
  await page.evaluate(() => { window.__modelListFails = true; [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Làm mới danh sách model')?.click(); });
  await page.waitForFunction(() => document.querySelector('#gemini-api-key').closest('section').textContent.includes('Network unavailable'));
  assert.equal(await page.$eval('input[name="gemini-model"]:checked', (input) => input.value), 'gemini-3.8-flash');
  await page.evaluate(() => { window.__modelListFails = false; [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Thử lại')?.click(); });
  await page.waitForFunction(() => document.querySelector('#gemini-api-key').closest('section').textContent.includes('Danh sách lấy trực tiếp từ Google Gemini API.'));
  await page.reload({ waitUntil: 'networkidle0' });
  await openSettings();
  await page.waitForFunction(() => document.querySelector('input[name="gemini-model"]:checked')?.value === 'gemini-3.8-flash');
  assert.equal(await page.$eval('#gemini-api-key', (input) => input.value), '');
  assert.equal(await page.$eval('#gemini-api-key', (input) => input.closest('section').textContent.includes('Đã cấu hình')), true);
  assert.deepEqual(errors, []);
  console.log('Gemini client + ModelSelector OK: danh sách động, phân trang, lọc, cache, fallback, lưu model và F5.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
