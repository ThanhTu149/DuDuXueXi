/**
 * Test Gemini pipeline: timeout, phân loại lỗi, backoff + jitter, Retry-After,
 * retry của queue và huỷ request đang bay.
 *   node scripts/test-gemini-retry.mjs
 *
 * Không gọi mạng thật: mọi fetch đều được stub.
 */

import assert from 'node:assert/strict';
import {
  AuthError,
  NetworkError,
  ParseError,
  RateLimitError,
  RequestError,
  ServerError,
  TimeoutError,
  callGemini,
  describeGeminiError,
  fetchAvailableModels,
} from '../src/lib/geminiClient.js';
import { ApiQueue, computeBackoff, isRetryableError } from '../src/lib/queue.js';

const originalFetch = globalThis.fetch;
const jsonResponse = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

try {
  // 1. Thành công: schema được chuẩn hoá, key nằm trong header (không nằm trong URL).
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  assert.deepEqual(await callGemini({
    apiKey: 'secret-key',
    prompt: 'Test',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  }), { ok: true });
  assert.match(request.url, /gemini-flash-latest:generateContent$/);
  assert.equal(String(request.url).includes('secret-key'), false);
  assert.equal(request.options.headers['x-goog-api-key'], 'secret-key');
  assert.equal(JSON.parse(request.options.body).generationConfig.responseSchema.properties.ok.type, 'BOOLEAN');

  // 2. Timeout: fetch treo → TimeoutError có code 'timeout', không chờ 30s thật.
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x', timeoutMs: 15 }), (error) => {
    assert.ok(error instanceof TimeoutError);
    assert.equal(error.code, 'timeout');
    assert.equal(error.retryable, true);
    return true;
  });

  // 3. Huỷ từ bên ngoài: AbortError (không phải TimeoutError).
  const external = new AbortController();
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const pending = callGemini({ apiKey: 'k', prompt: 'x', signal: external.signal, timeoutMs: 5000 });
  external.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');

  // 4. Lỗi mạng: NetworkError giữ chi tiết gốc, xếp vào code 'network'.
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), (error) => {
    assert.ok(error instanceof NetworkError);
    assert.equal(error.code, 'network');
    assert.match(error.message, /Không kết nối được Gemini/);
    assert.match(error.message, /Failed to fetch/);
    return true;
  });
  assert.equal(describeGeminiError(new TypeError('Failed to fetch')).code, 'network');

  // 5. 429 + Retry-After → RateLimitError giữ retryAfter (ms), có thể thử lại.
  globalThis.fetch = async () => jsonResponse({ error: { message: 'quota' } }, {
    status: 429, headers: { 'Retry-After': '7' },
  });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), (error) => {
    assert.ok(error instanceof RateLimitError);
    assert.equal(error.retryAfter, 7000);
    assert.equal(error.code, 'quota');
    assert.equal(isRetryableError(error), true);
    return true;
  });

  // 6. 5xx → ServerError có status; 401/403 → AuthError; 404 → RequestError.
  for (const status of [500, 503, 504]) {
    globalThis.fetch = async () => jsonResponse({ error: { message: 'down' } }, { status });
    await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), (error) => {
      assert.ok(error instanceof ServerError);
      assert.equal(error.status, status);
      return true;
    });
  }
  globalThis.fetch = async () => jsonResponse({ error: { message: 'API key not valid' } }, { status: 400 });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), (error) => {
    assert.ok(error instanceof AuthError);
    assert.match(error.message, /không hợp lệ/);
    return true;
  });
  globalThis.fetch = async () => jsonResponse({ error: { message: 'denied' } }, { status: 403 });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), /không có quyền/);
  globalThis.fetch = async () => jsonResponse({ error: { message: 'missing' } }, { status: 404 });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), RequestError);
  await assert.rejects(callGemini({ apiKey: '', prompt: 'x' }), AuthError);
  await assert.rejects(callGemini({ apiKey: 'k', prompt: '' }), RequestError);

  // 7. Response không phải JSON / thiếu nội dung.
  globalThis.fetch = async () => new Response('not-json', { status: 200 });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), ParseError);
  globalThis.fetch = async () => jsonResponse({ candidates: [] });
  await assert.rejects(callGemini({ apiKey: 'k', prompt: 'x' }), /không trả về nội dung/);

  // 8. describeGeminiError trả code + thông điệp tiếng Việt + retryAfterMs.
  const described = describeGeminiError(new RateLimitError(1234));
  assert.equal(described.code, 'quota');
  assert.equal(described.retryAfterMs, 1234);
  assert.equal(described.retryable, true);
  assert.match(described.userMessage, /hạn mức|giới hạn/i);
  assert.equal(describeGeminiError(new TimeoutError(1000)).code, 'timeout');
  assert.equal(describeGeminiError(new ParseError('x')).code, 'invalid-response');

  // 9. fetchAvailableModels: lọc model, phân trang, lỗi có phân loại, timeout.
  let listCalls = 0;
  globalThis.fetch = async (url) => {
    listCalls += 1;
    const pageToken = new URL(url).searchParams.get('pageToken');
    return jsonResponse(pageToken ? {
      models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }],
    } : {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      ],
      nextPageToken: 'page-2',
    });
  };
  const models = await fetchAvailableModels('catalog-key');
  assert.deepEqual(models.map((model) => model.id), ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.5-flash']);
  assert.equal(listCalls, 2);
  globalThis.fetch = async () => jsonResponse({ models: [] });
  await assert.rejects(fetchAvailableModels('empty-key'), /Không tìm thấy model/);
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(fetchAvailableModels('slow-key', { timeoutMs: 15 }), TimeoutError);

  // 10. computeBackoff: tôn trọng Retry-After, có jitter, có trần maxDelay.
  assert.equal(computeBackoff({ attempt: 0, baseDelay: 5000, retryAfterMs: 7000, jitterRatio: 0 }), 7000);
  assert.equal(computeBackoff({ attempt: 0, baseDelay: [5000, 15000], jitterRatio: 0 }), 5000);
  assert.equal(computeBackoff({ attempt: 1, baseDelay: [5000, 15000], jitterRatio: 0 }), 15000);
  const withJitter = computeBackoff({ attempt: 0, baseDelay: 1000, jitterRatio: 0.2, random: () => 0.999 });
  assert.ok(withJitter >= 1000 && withJitter < 1200, `jitter ngoài khoảng: ${withJitter}`);
  assert.equal(computeBackoff({ attempt: 5, baseDelay: 100000, maxDelay: 200000, jitterRatio: 0 }), 200000);

  // 11. Queue retry: 429 → chờ đúng Retry-After (jitter 0) → thành công.
  const queue = new ApiQueue({ minInterval: 0, maxPerMinute: 1000, baseDelay: 5, maxDelay: 50, jitterRatio: 0, maxAttempts: 3 });
  let attempts = 0;
  const retryDelays = [];
  const result = await queue.add(async () => {
    attempts += 1;
    if (attempts === 1) throw new RateLimitError(7); // 7ms
    return 'recovered';
  }, { onRetry: (notice) => retryDelays.push(notice.delay) });
  assert.equal(result, 'recovered');
  assert.equal(attempts, 2);
  assert.deepEqual(retryDelays, [7]);
  assert.equal(queue.getStatus().completed, 1);
  assert.equal(queue.getStatus().failed, 0);

  // 12. Queue retry ParseError dùng delay cố định 500ms (giữ hành vi cũ).
  const parseQueue = new ApiQueue({ minInterval: 0, maxPerMinute: 1000, maxAttempts: 2 });
  let parseAttempts = 0;
  const parseDelays = [];
  assert.equal(await parseQueue.add(async () => {
    parseAttempts += 1;
    if (parseAttempts === 1) throw new ParseError('bad json');
    return 'ok';
  }, { onRetry: (notice) => parseDelays.push(notice.delay) }), 'ok');
  assert.deepEqual(parseDelays, [500]);

  // 13. Queue hết lượt thử → ném lỗi gốc, tăng failed.
  const failingQueue = new ApiQueue({ minInterval: 0, maxPerMinute: 1000, baseDelay: 1, maxDelay: 2, jitterRatio: 0, maxAttempts: 2 });
  await assert.rejects(failingQueue.add(async () => { throw new ServerError(503); }), ServerError);
  assert.equal(failingQueue.getStatus().failed, 1);

  // 14. cancel(): request đang bay nhận AbortSignal và bị huỷ ngay.
  const cancelQueue = new ApiQueue({ minInterval: 0, maxPerMinute: 1000 });
  let seenAborted = false;
  const inflight = cancelQueue.add((signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      seenAborted = true;
      reject(new DOMException('aborted', 'AbortError'));
    });
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  cancelQueue.cancel();
  await assert.rejects(inflight, (error) => error.name === 'AbortError');
  assert.equal(seenAborted, true);
  assert.equal(cancelQueue.getStatus().cancelled, true);

  // 15. Huỷ khi đang chờ backoff: dừng ngay, không chờ hết delay.
  const backoffQueue = new ApiQueue({ minInterval: 0, maxPerMinute: 1000, baseDelay: 5000, maxDelay: 10000, jitterRatio: 0 });
  const backoffController = new AbortController();
  let backoffAttempts = 0;
  const startedAt = Date.now();
  const backoffRun = backoffQueue.add(async () => {
    backoffAttempts += 1;
    throw new ServerError(503);
  }, { signal: backoffController.signal, onRetry: () => setTimeout(() => backoffController.abort(), 10) });
  await assert.rejects(backoffRun, (error) => error.name === 'AbortError');
  assert.ok(Date.now() - startedAt < 4000, 'Huỷ khi backoff phải dừng ngay');
  assert.equal(backoffAttempts, 1);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OK gemini pipeline: timeout/abort, phân loại lỗi, backoff + jitter, Retry-After, retry queue, cancel.');
