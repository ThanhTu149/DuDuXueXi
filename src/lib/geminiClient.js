const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

let cachedModelKey = null;
let cachedModels = null;

function modelVersion(id) {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

export async function fetchAvailableModels(apiKey, { force = false, signal } = {}) {
  const key = apiKey?.trim();
  if (!key) throw new Error('Chưa có Gemini API key. Vui lòng nhập key trong Cài đặt.');
  if (!force && cachedModelKey === key && cachedModels) return cachedModels;

  const models = [];
  let pageToken = '';
  do {
    const url = new URL(API_BASE);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { 'x-goog-api-key': key }, signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response, data);
    if (!Array.isArray(data.models)) throw new Error('Gemini không trả về danh sách model hợp lệ.');
    models.push(...data.models);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

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
  if (!unique.length) throw new Error('Không tìm thấy model sinh văn bản phù hợp với API key này.');
  cachedModelKey = key;
  cachedModels = unique;
  return unique;
}

export class RateLimitError extends Error {
  constructor(retryAfter = null) {
    super('Gemini đang giới hạn lượt gọi. Vui lòng thử lại sau.');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends Error {
  constructor(status) {
    super(`Máy chủ Gemini tạm thời không khả dụng (${status}). Vui lòng thử lại.`);
    this.name = 'ServerError';
    this.status = status;
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Gemini không phản hồi trong 30 giây. Vui lòng thử lại.');
    this.name = 'TimeoutError';
  }
}

export class ParseError extends Error {
  constructor(rawResponse) {
    super('Gemini trả về dữ liệu không phải JSON hợp lệ.');
    this.name = 'ParseError';
    this.rawResponse = rawResponse;
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

function retryDelay(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function apiError(response, body) {
  const status = response.status;
  const detail = body?.error?.message || response.statusText || `HTTP ${status}`;
  if (status === 429) return new RateLimitError(retryDelay(response.headers.get('Retry-After')));
  if (status >= 500 && status <= 503) return new ServerError(status);
  if (status === 401 || (status === 400 && /api.?key|key.*invalid/i.test(detail))) {
    return new Error('API key không hợp lệ. Vui lòng kiểm tra lại trong Cài đặt.');
  }
  if (status === 403) return new Error('API key không có quyền truy cập Gemini.');
  if (status === 404) return new Error('Model Gemini không tồn tại hoặc đã ngừng hoạt động.');
  if (status === 400) return new Error(`Yêu cầu Gemini không hợp lệ: ${detail}`);
  return new Error(`Gemini trả về lỗi ${status}: ${detail}`);
}

export async function callGemini({
  apiKey,
  prompt,
  schema,
  maxTokens = 8192,
  model = DEFAULT_GEMINI_MODEL,
  signal,
  timeoutMs = 30000,
}) {
  const key = apiKey?.trim();
  if (!key) throw new Error('Chưa có Gemini API key. Vui lòng nhập key trong Cài đặt.');
  if (!prompt?.trim()) throw new Error('Nội dung gửi Gemini không được để trống.');
  if (!/^[a-z0-9.-]+$/i.test(model)) throw new Error('Tên model Gemini không hợp lệ.');

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();

  try {
    const response = await fetch(`${API_BASE}/${model}:generateContent`, {
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
      signal: controller.signal,
    });
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
      throw new Error(`Gemini không trả về nội dung (${data.candidates?.[0]?.finishReason || 'không rõ lý do'}).`);
    }
    try {
      return JSON.parse(answer);
    } catch {
      throw new ParseError(answer);
    }
  } catch (error) {
    if (timedOut) throw new TimeoutError();
    if (signal?.aborted) throw new DOMException('Đã hủy yêu cầu Gemini.', 'AbortError');
    if (error instanceof TypeError) throw new Error('Không kết nối được Gemini. Kiểm tra mạng rồi thử lại.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
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
    return { ok: false, error: error.message };
  }
}
