import { randomUUID } from 'node:crypto';
import { ApiError, getClientIp, readJsonBody, safeJsonParse, sendJson } from '../lib/http.js';
import { requireAuth } from './auth.js';
import { resolveEffectiveGeminiKey } from './settings.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-flash-latest';

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

function modelVersion(id) {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
}

async function readUpstreamJson(response) {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function mapGeminiUpstreamError(response, data) {
  const status = response.status;
  const detail = data?.error?.message || response.statusText || `HTTP ${status}`;
  if (status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    return new ApiError(429, 'gemini_rate_limit', 'Gemini đang giới hạn lượt gọi. Vui lòng thử lại sau ít giây.', { detail, retryAfter });
  }
  if (status === 401 || (status === 400 && /api.?key|key.*invalid/i.test(detail))) {
    return new ApiError(400, 'gemini_auth', 'API key Gemini không hợp lệ. Vui lòng kiểm tra lại trong Cài đặt.', { detail });
  }
  if (status === 403) {
    return new ApiError(403, 'gemini_auth', 'API key không có quyền truy cập Gemini.', { detail });
  }
  if (status === 404) {
    return new ApiError(404, 'gemini_model_not_found', 'Model Gemini không tồn tại hoặc đã ngừng hoạt động.', { detail });
  }
  if (status >= 500) {
    return new ApiError(502, 'gemini_server_error', `Máy chủ Gemini tạm thời quá tải (${status}). Vui lòng thử lại.`, { detail });
  }
  return new ApiError(400, 'gemini_request_error', `Yêu cầu Gemini không hợp lệ: ${detail}`, { detail });
}

async function fetchGeminiWithTimeout(url, options, timeoutMs = 35_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(504, 'gemini_timeout', 'Gemini phản hồi quá lâu. Vui lòng thử lại.');
    }
    throw new ApiError(502, 'gemini_network', 'Máy chủ không kết nối được tới Google Gemini API.');
  } finally {
    clearTimeout(timer);
  }
}

function buildTutorSystemPrompt(lessonContext) {
  const parts = [
    'Bạn là DuDu (Trúc) — gia sư tiếng Trung thân thiện, chính xác, giải thích bằng tiếng Việt rõ ràng dành cho người học Việt Nam.',
    'Khi đưa ví dụ tiếng Trung, luôn kèm: Chữ Hán (giản thể) + Pinyin có dấu thanh + Nghĩa tiếng Việt.',
    'Nếu người học gửi câu tiếng Trung để sửa, hãy chỉ rõ lỗi ngữ pháp/từ vựng, đưa câu sửa tự nhiên và giải thích ngắn gọn lý do.',
    'Trình bày gọn gàng, dễ đọc, khuyến khích người học thực hành.',
  ];
  if (lessonContext && typeof lessonContext === 'object') {
    const title = [lessonContext.courseName, lessonContext.lessonTitleZh, lessonContext.lessonTitleVi].filter(Boolean).join(' · ');
    if (title) parts.push(`Ngữ cảnh bài học hiện tại: ${title}.`);
    if (Array.isArray(lessonContext.vocabSample) && lessonContext.vocabSample.length) {
      parts.push(`Một số từ vựng trong bài: ${lessonContext.vocabSample.slice(0, 15).join(', ')}.`);
    }
  }
  return parts.join('\n');
}

export function registerAiRoutes(router, { db, config, aiLimiter }) {
  // Kiểm tra trạng thái AI proxy
  router.get('/api/ai/status', async (req, res, ctx) => {
    const resolved = resolveEffectiveGeminiKey(db, config, ctx.auth?.user?.id || null);
    sendJson(res, 200, {
      ok: true,
      available: Boolean(resolved.key),
      source: resolved.source,
      serverKeyAvailable: Boolean(config.geminiApiKey),
    });
  });

  // Proxy danh sách model Gemini (không lộ key ra trình duyệt)
  router.get('/api/ai/models', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    aiLimiter.check(`ai-models:${user.id}`, res);
    const resolved = resolveEffectiveGeminiKey(db, config, user.id);
    if (!resolved.key) {
      throw new ApiError(400, 'gemini_key_missing', 'Chưa cấu hình Gemini API key trên tài khoản hoặc máy chủ.');
    }

    const models = [];
    let pageToken = '';
    do {
      const url = new URL(GEMINI_API_BASE);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetchGeminiWithTimeout(url, { headers: { 'x-goog-api-key': resolved.key } }, 20_000);
      const data = await readUpstreamJson(response);
      if (!response.ok) throw mapGeminiUpstreamError(response, data);
      if (Array.isArray(data.models)) models.push(...data.models);
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    const available = models
      .filter((model) => {
        const id = model.name?.replace(/^models\//, '') || '';
        return /^gemini-/i.test(id)
          && model.supportedGenerationMethods?.includes('generateContent')
          && !/(embedding|aqa|imagen|veo|image|live|audio|tts|transcribe|robotics)/i.test(id)
          && !/^gemini-(?:1(?:\.|-)|2\.0(?:\.|-))/.test(id)
          && model.deprecated !== true
          && !/deprecated|shut down/i.test(model.description || '');
      })
      .map((model) => ({
        id: model.name.replace(/^models\//, ''),
        displayName: model.displayName || model.name.replace(/^models\//, ''),
        description: model.description || '',
        inputTokenLimit: model.inputTokenLimit || null,
        outputTokenLimit: model.outputTokenLimit || null,
      }));

    const unique = [...new Map(available.map((m) => [m.id, m])).values()].sort((a, b) => {
      const aliasOrder = (id) => (id === DEFAULT_MODEL ? 2 : id.endsWith('-latest') ? 1 : 0);
      return aliasOrder(b.id) - aliasOrder(a.id) || modelVersion(b.id) - modelVersion(a.id) || a.id.localeCompare(b.id);
    });

    sendJson(res, 200, { ok: true, models: unique, keySource: resolved.source });
  });

  // Kiểm tra kết nối Gemini qua server
  router.post('/api/ai/test', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    aiLimiter.check(`ai-test:${user.id}`, res);
    const body = await readJsonBody(req);
    const model = String(body.model || DEFAULT_MODEL).trim().replace(/^models\//, '');
    const resolved = resolveEffectiveGeminiKey(db, config, user.id, body.apiKey);
    if (!resolved.key) {
      throw new ApiError(400, 'gemini_key_missing', 'Chưa có Gemini API key để kiểm tra.');
    }

    const response = await fetchGeminiWithTimeout(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': resolved.key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Return JSON {"ok": true}' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: normalizeSchema({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }),
          maxOutputTokens: 32,
          temperature: 0,
        },
      }),
    }, 20_000);
    const data = await readUpstreamJson(response);
    if (!response.ok) throw mapGeminiUpstreamError(response, data);
    sendJson(res, 200, { ok: true, keySource: resolved.source, model });
  });

  // Proxy sinh nội dung khóa học có cấu trúc JSON
  router.post('/api/ai/generate', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    aiLimiter.check(`ai-gen:${user.id}`, res);
    const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
    const prompt = String(body.prompt || '');
    if (!prompt.trim()) throw new ApiError(400, 'missing_prompt', 'Thiếu nội dung prompt gửi tới Gemini.');
    const model = String(body.model || DEFAULT_MODEL).trim().replace(/^models\//, '');
    const maxTokens = Math.min(16384, Math.max(64, Number(body.maxTokens || 8192)));

    const resolved = resolveEffectiveGeminiKey(db, config, user.id, body.apiKey);
    if (!resolved.key) {
      throw new ApiError(400, 'gemini_key_missing', 'Chưa có Gemini API key. Hãy cấu hình trong Hồ sơ > Cài đặt.');
    }

    const generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: maxTokens,
    };
    if (body.schema && typeof body.schema === 'object') {
      generationConfig.responseSchema = normalizeSchema(body.schema);
    }

    const response = await fetchGeminiWithTimeout(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': resolved.key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    }, 60_000);
    const data = await readUpstreamJson(response);
    if (!response.ok) throw mapGeminiUpstreamError(response, data);

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new ApiError(502, 'gemini_invalid_json', 'Gemini trả về dữ liệu không phải JSON hợp lệ.');
    }
    sendJson(res, 200, { ok: true, output: parsed, keySource: resolved.source, model });
  });

  // Lịch sử trò chuyện Gia sư AI DuDu (lưu bền vững trong SQLite)
  router.get('/api/ai/tutor/history', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const limit = Math.min(100, Math.max(10, Number(ctx.query.get('limit') || 50)));
    const rows = db.prepare(`
      SELECT id, course_id, role, content, meta_json, created_at
      FROM tutor_messages
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(user.id, limit).reverse();

    const resolved = resolveEffectiveGeminiKey(db, config, user.id);
    sendJson(res, 200, {
      ok: true,
      aiAvailable: Boolean(resolved.key),
      keySource: resolved.source,
      messages: rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        role: row.role,
        content: row.content,
        meta: safeJsonParse(row.meta_json, {}),
        createdAt: row.created_at,
      })),
    });
  });

  router.delete('/api/ai/tutor/history', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    db.prepare('DELETE FROM tutor_messages WHERE user_id = ?').run(user.id);
    sendJson(res, 200, { ok: true });
  });

  // Gửi câu hỏi tới Gia sư AI DuDu
  router.post('/api/ai/tutor', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    aiLimiter.check(`ai-tutor:${user.id || getClientIp(req)}`, res);
    const body = await readJsonBody(req);
    const message = String(body.message || '').trim();
    if (!message || message.length > 2000) {
      throw new ApiError(400, 'invalid_message', 'Câu hỏi cần từ 1 đến 2000 ký tự.');
    }
    const courseId = String(body.courseId || 'hanngu-tap2').slice(0, 120);
    const settingsRow = db.prepare('SELECT gemini_model FROM user_settings WHERE user_id = ?').get(user.id);
    const model = String(body.model || settingsRow?.gemini_model || DEFAULT_MODEL).trim().replace(/^models\//, '');
    const resolved = resolveEffectiveGeminiKey(db, config, user.id, body.apiKey);
    if (!resolved.key) {
      throw new ApiError(400, 'gemini_key_missing', 'Chưa có Gemini API key. Hãy vào Hồ sơ > Cài đặt để thêm API key cho Gia sư AI.');
    }

    const recent = db.prepare(`
      SELECT role, content FROM tutor_messages
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `).all(user.id).reverse();

    const contents = [
      ...recent.map((row) => ({
        role: row.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: row.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await fetchGeminiWithTimeout(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': resolved.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildTutorSystemPrompt(body.lessonContext) }] },
        contents,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 1600,
        },
      }),
    }, 45_000);
    const data = await readUpstreamJson(response);
    if (!response.ok) throw mapGeminiUpstreamError(response, data);

    const replyText = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim();
    if (!replyText) {
      throw new ApiError(502, 'gemini_empty_reply', 'Gia sư AI chưa trả về câu trả lời. Hãy thử hỏi lại nhé.');
    }

    const userMsgTime = new Date().toISOString();
    const replyTime = new Date(Date.now() + 1).toISOString();
    const userMsgId = `msg-${randomUUID()}`;
    const replyMsgId = `msg-${randomUUID()}`;

    db.prepare(`
      INSERT INTO tutor_messages (id, user_id, course_id, role, content, meta_json, created_at)
      VALUES (?, ?, ?, 'user', ?, ?, ?)
    `).run(userMsgId, user.id, courseId, message, JSON.stringify({}), userMsgTime);

    db.prepare(`
      INSERT INTO tutor_messages (id, user_id, course_id, role, content, meta_json, created_at)
      VALUES (?, ?, ?, 'assistant', ?, ?, ?)
    `).run(replyMsgId, user.id, courseId, replyText, JSON.stringify({ model, keySource: resolved.source }), replyTime);

    sendJson(res, 200, {
      ok: true,
      userMessage: { id: userMsgId, courseId, role: 'user', content: message, createdAt: userMsgTime },
      reply: { id: replyMsgId, courseId, role: 'assistant', content: replyText, meta: { model, keySource: resolved.source }, createdAt: replyTime },
    });
  });
}
