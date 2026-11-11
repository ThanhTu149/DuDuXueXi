/**
 * geminiClient.js — gọi Google Gemini API.
 *
 * Bản này bổ sung so với trước:
 *  - Phân loại lỗi rõ ràng (`code`: network/auth/quota/timeout/invalid-response/server/...)
 *    và `describeGeminiError()` trả về thông điệp tiếng Việt + có nên thử lại không.
 *  - Mọi request đều có timeout + AbortSignal (kể cả fetchAvailableModels).
 *  - Lỗi mạng được gói thành NetworkError nhưng vẫn giữ nguyên chi tiết gốc.
 *  - RateLimitError mang `retryAfter` (ms) để queue biết chờ bao lâu.
 *
 * Giữ nguyên chữ ký cũ: callGemini, fetchAvailableModels, testApiKey và các lớp
 * RateLimitError / ServerError / TimeoutError / ParseError.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
export const DEFAULT_TIMEOUT_MS = 30000;

export const GEMINI_ERROR_CODES = Object.freeze({
  network: 'network',
  auth: 'auth',
  quota: 'quota',
  timeout: 'timeout',
  invalidResponse: 'invalid-response',
  server: 'server',
  invalidRequest: 'invalid-request',
  cancelled: 'cancelled',
  unknown: 'unknown',
});

/** Thông điệp thân thiện cho người dùng theo từng nhóm lỗi. */
const ERROR_MESSAGES = {
  network: 'Mất kết nối tới Gemini. Kiểm tra mạng rồi thử lại.',
  auth: 'API key Gemini không hợp lệ hoặc không có quyền. Kiểm tra lại trong Cài đặt.',
  quota: 'Gemini đã hết hạn mức hoặc đang giới hạn lượt gọi. Vui lòng chờ một lát rồi thử lại.',
  timeout: 'Gemini phản hồi quá lâu nên yêu cầu đã dừng. Vui lòng thử lại.',
  'invalid-response': 'Gemini trả về dữ liệu không hợp lệ. Vui lòng thử lại; nếu lặp lại hãy đổi model.',
  server: 'Máy chủ Gemini tạm thời quá tải. Vui lòng thử lại sau ít phút.',
  'invalid-request': 'Yêu cầu gửi Gemini không hợp lệ. Hãy kiểm tra model và nội dung tài liệu.',
  cancelled: 'Yêu cầu Gemini đã bị huỷ.',
  unknown: 'Không hoàn tất được yêu cầu Gemini. Vui lòng thử lại.',
};

let cachedModelKey = null;
let cachedModels = null;

export class GeminiError extends Error {
  constructor(message, { code = 'unknown', status = null, retryAfter = null, retryable = false, cause = null, detail = null } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.code = code in ERROR_MESSAGES ? code : 'unknown';
    this.status = status;
    this.retryAfter = retryAfter;
    this.retryable = retryable;
    this.detail = detail;
    if (cause) this.cause = cause;
  }

  /** Thông điệp tiếng Việt an toàn cho UI. */
  get userMessage() {
    return ERROR_MESSAGES[this.code] || this.message;
  }
}

export class RateLimitError extends GeminiError {
  constructor(retryAfter = null) {
    super('Gemini đang giới hạn lượt gọi. Vui lòng thử lại sau.', {
      code: 'quota', status: 429, retryAfter, retryable: true, detail: 'rate-limit',
    });
    this.name = 'RateLimitError';
  }
}

export class ServerError extends GeminiError {
  constructor(status, message = null) {
    super(message || `Máy chủ Gemini tạm thời không khả dụng (${status}). Vui lòng thử lại.`, {
      code: 'server', status, retryable: true,
    });
    this.name = 'ServerError';
  }
}

export class TimeoutError extends GeminiError {
  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    super(`Gemini không phản hồi trong ${Math.round(timeoutMs / 1000)} giây. Vui lòng thử lại.`, {
      code: 'timeout', retryable: true,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ParseError extends GeminiError {
  constructor(rawResponse) {
    super('Gemini trả về dữ liệu không phải JSON hợp lệ.', { code: 'invalid-response', retryable: true });
    this.name = 'ParseError';
    this.rawResponse = rawResponse;
  }
}

export class NetworkError extends GeminiError {
  constructor(cause = null) {
    const detail = cause?.message ? ` (${cause.message})` : '';
    super(`Không kết nối được Gemini. Kiểm tra mạng rồi thử lại.${detail}`, {
      code: 'network', retryable: true, cause, detail: cause?.message || null,
    });
    this.name = 'NetworkError';
  }
}

export class AuthError extends GeminiError {
  constructor(message, { status = null } = {}) {
    super(message, { code: 'auth', status, retryable: false });
    this.name = 'AuthError';
  }
}

export class RequestError extends GeminiError {
  constructor(message, { status = null, detail = null } = {}) {
    super(message, { code: 'invalid-request', status, retryable: false, detail });
    this.name = 'RequestError';
  }
}

export class InvalidResponseError extends GeminiError {
  constructor(message, { detail = null } = {}) {
    super(message, { code: 'invalid-response', retryable: true, detail });
    this.name = 'InvalidResponseError';
  }
}

/** True nếu lỗi là do người dùng/hệ thống huỷ request. */
export function isAbortError(error) {
  return Boolean(error) && (error.name === 'AbortError' || error.code === 'cancelled' || error.code === 20);
}

/** Chuyển lỗi bất kỳ thành mô tả thống nhất cho UI. */
export function describeGeminiError(error) {
  let code = 'unknown';
  if (error instanceof GeminiError) code = error.code;
  else if (isAbortError(error)) code = 'cancelled';
  else if (error instanceof TypeError) code = 'network';
  return {
    code,
    name: error?.name || 'Error',
    userMessage: ERROR_MESSAGES[code] || ERROR_MESSAGES.unknown,
    detail: error?.message || '',
    retryable: Boolean(error?.retryable),
    retryAfterMs: Number.isFinite(error?.retryAfter) ? error.retryAfter : null,
    status: error?.status ?? null,
  };
}

function modelVersion(id) {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

function retryDelay(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * Liên kết nhiều signal + timeout thành một signal duy nhất, có hàm dispose()
 * để gỡ listener (tránh rò rỉ bộ nhớ khi job chạy nhiều request).
 */
function createLinkedAbort(signal = null, timeoutMs = 0) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      try { controller.abort(); } catch { /* ignore */ }
    }, timeoutMs)
    : null;
  const onAbort = () => { try { controller.abort(); } catch { /* ignore */ } };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    dispose() {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    },
  };
}

/** Dựng lỗi có phân loại từ response HTTP không OK. */
export function apiError(response, body = null) {
  const status = response?.status ?? 0;
  const headers = response?.headers;
  const detail = body?.error?.message || response?.statusText || `HTTP ${status}`;
  if (status === 429) return new RateLimitError(retryDelay(headers?.get?.('Retry-After')));
  if (status >= 500 && status < 600) return new ServerError(status);
  if (status === 401 || (status === 400 && /api.?key|key.*invalid/i.test(detail))) {
    return new AuthError('API key không hợp lệ. Vui lòng kiểm tra lại trong Cài đặt.', { status });
  }
  if (status === 403) return new AuthError('API key không có quyền truy cập Gemini.', { status });
  if (status === 404) return new RequestError('Model Gemini không tồn tại hoặc đã ngừng hoạt động.', { status, detail });
  if (status === 400) return new RequestError(`Yêu cầu Gemini không hợp lệ: ${detail}`, { status, detail });
  return new GeminiError(`Gemini trả về lỗi ${status}: ${detail}`, { code: 'unknown', status, retryable: status >= 500, detail });
}

/** Đọc JSON body, chịu được body rỗng/hỏng (trả {} thay vì throw). */
async function readJsonBody(response) {
  try {
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalizeSchema(value) {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'type' && typeof item === 'string' ? item.toUpperCase() : normalizeSchema(item),
    ]));
  }
  return value;
}

export async function fetchAvailableModels(apiKey, { force = false, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const key = apiKey?.trim();
  if (!key) throw new AuthError('Chưa có Gemini API key. Vui lòng nhập key trong Cài đặt.');
  if (!force && cachedModelKey === key && cachedModels) return cachedModels;

  const abortLink = createLinkedAbort(signal, timeoutMs);
  const models = [];
  let pageToken = '';
  try {
    do {
      const url = new URL(API_BASE);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      let response;
      try {
        response = await fetch(url, { headers: { 'x-goog-api-key': key }, signal: abortLink.signal });
      } catch (error) {
        if (abortLink.timedOut) throw new TimeoutError(timeoutMs);
        if (signal?.aborted) throw new DOMException('Đã huỷ yêu cầu Gemini.', 'AbortError');
        if (error instanceof TypeError || error?.name === 'TypeError') throw new NetworkError(error);
        throw error;
      }
      const data = await readJsonBody(response);
      if (!response.ok) throw apiError(response, data);
      if (!Array.isArray(data.models)) throw new InvalidResponseError('Gemini không trả về danh sách model hợp lệ.');
      models.push(...data.models);
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  } finally {
    abortLink.dispose();
  }

  const available = models.filter((model) => {
    const id = model.name?.replace(/^models\//, '') || '';
    return /^gemini-/i.test(id)
      && model.supportedGenerationMethods?.includes('generateContent')
      && !/(embedding|aqa|imagen|veo|image|live|audio|tts|transcribe|robotics)/i.test(id)
      && !/^gemini-(?:1(?:\.|-)|2\.0(?:\.|-))/.test(id)
      && model.deprecated !== true
      && !/deprecated|shut down/i.test(model.description || '');
  }).map((model) => ({
    id: model.name.replace(/^models\//, ''),
    displayName: model.displayName || model.name.replace(/^models\//, ''),
    description: model.description || '',
    inputTokenLimit: model.inputTokenLimit || null,
    outputTokenLimit: model.outputTokenLimit || null,
  }));
  const unique = [...new Map(available.map((model) => [model.id, model])).values()];
  unique.sort((a, b) => {
    const aliasOrder = (id) => id === DEFAULT_GEMINI_MODEL ? 2 : id.endsWith('-latest') ? 1 : 0;
    return aliasOrder(b.id) - aliasOrder(a.id)
      || modelVersion(b.id) - modelVersion(a.id)
      || a.id.localeCompare(b.id);
  });
  if (!unique.length) throw new InvalidResponseError('Không tìm thấy model sinh văn bản phù hợp với API key này.');
  cachedModelKey = key;
  cachedModels = unique;
  return unique;
}

export async function callGemini({
  apiKey,
  prompt,
  schema,
  maxTokens = 8192,
  model = DEFAULT_GEMINI_MODEL,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const key = apiKey?.trim();
  if (!key) throw new AuthError('Chưa có Gemini API key. Vui lòng nhập key trong Cài đặt.');
  if (!prompt?.trim()) throw new RequestError('Nội dung gửi Gemini không được để trống.');
  if (!/^[a-z0-9.-]+$/i.test(model)) throw new RequestError('Tên model Gemini không hợp lệ.');

  const abortLink = createLinkedAbort(signal, timeoutMs);
  try {
    let response;
    try {
      response = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            ...(schema ? { responseSchema: normalizeSchema(schema) } : {}),
          },
        }),
        signal: abortLink.signal,
      });
    } catch (error) {
      if (abortLink.timedOut) throw new TimeoutError(timeoutMs);
      if (signal?.aborted) throw new DOMException('Đã huỷ yêu cầu Gemini.', 'AbortError');
      if (error instanceof TypeError || error?.name === 'TypeError') throw new NetworkError(error);
      throw error;
    }
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ParseError(raw);
    }
    if (!response.ok) throw apiError(response, data);
    const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
    if (!answer) {
      throw new InvalidResponseError(
        `Gemini không trả về nội dung (${data.candidates?.[0]?.finishReason || 'không rõ lý do'}).`,
        { detail: data.candidates?.[0]?.finishReason || null },
      );
    }
    try {
      return JSON.parse(answer);
    } catch {
      throw new ParseError(answer);
    }
  } finally {
    abortLink.dispose();
  }
}

export async function testApiKey(apiKey, model = DEFAULT_GEMINI_MODEL) {
  try {
    const answer = await callGemini({
      apiKey,
      model,
      prompt: 'Trả về JSON có trường ok bằng true. Không thêm nội dung khác.',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      maxTokens: 256,
    });
    return answer?.ok === true
      ? { ok: true }
      : { ok: false, error: 'Gemini phản hồi nhưng không xác nhận được API key.' };
  } catch (error) {
    return { ok: false, error: error.message, code: error?.code || 'unknown' };
  }
}
