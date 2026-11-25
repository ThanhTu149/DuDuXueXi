/**
 * apiClient.js — tầng giao tiếp HTTP tới DuDu Full-Stack API (/api/*).
 *
 * Nguyên tắc quan trọng cho PWA offline-first:
 *  - Mọi request đi cùng cookie phiên (credentials: 'include').
 *  - Nếu trang đang chạy ở chế độ tĩnh/offline (server trả HTML index.html hoặc
 *    không kết nối được), probeSession() trả về `{ serverAvailable: false }`
 *    một cách im lặng, không phát sinh lỗi console hay chặn việc học offline.
 */

export class ApiClientError extends Error {
  constructor(status, code, message, details = null) {
    super(message || 'Không thể kết nối tới máy chủ DuDu.');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code || 'api_error';
    this.details = details;
  }
}

function isJsonResponse(response) {
  const contentType = response?.headers?.get?.('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

export async function apiRequest(path, { method = 'GET', body = undefined, signal = undefined, timeoutMs = 25_000 } = {}) {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const headers = { Accept: 'application/json', 'X-DuDu-Client': 'web' };
    const init = {
      method,
      credentials: 'include',
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(path, init);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Đã huỷ yêu cầu.', 'AbortError');
      if (error?.name === 'AbortError') {
        throw new ApiClientError(504, 'timeout', 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
      }
      throw new ApiClientError(0, 'network', 'Không kết nối được tới máy chủ DuDu.');
    }

    if (!isJsonResponse(response)) {
      throw new ApiClientError(0, 'server_unavailable', 'Ứng dụng đang chạy ở chế độ cục bộ (chưa kết nối máy chủ).');
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      throw new ApiClientError(response.status, 'invalid_response', 'Phản hồi từ máy chủ không đúng định dạng JSON.');
    }

    if (!response.ok || data?.ok === false) {
      const err = data?.error || {};
      throw new ApiClientError(
        response.status,
        err.code || `http_${response.status}`,
        err.message || `Máy chủ trả về lỗi (${response.status}).`,
        err.details || null,
      );
    }

    return data;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/** Kiểm tra máy chủ + phiên đăng nhập an toàn (không throw, không log lỗi khi offline/static). */
export async function probeSession() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { serverAvailable: false, authenticated: false, user: null, server: null };
  }
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !isJsonResponse(response)) {
      return { serverAvailable: false, authenticated: false, user: null, server: null };
    }
    const data = await response.json();
    if (!data || data.ok !== true) {
      return { serverAvailable: false, authenticated: false, user: null, server: null };
    }
    return {
      serverAvailable: true,
      authenticated: Boolean(data.authenticated),
      user: data.user || null,
      server: data.server || null,
    };
  } catch {
    return { serverAvailable: false, authenticated: false, user: null, server: null };
  }
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export const registerAccount = (payload) => apiRequest('/api/auth/register', { method: 'POST', body: payload });
export const loginAccount = (payload) => apiRequest('/api/auth/login', { method: 'POST', body: payload });
export const logoutAccount = () => apiRequest('/api/auth/logout', { method: 'POST' });
export const updateAccountProfile = (payload) => apiRequest('/api/auth/profile', { method: 'PATCH', body: payload });
export const changeAccountPassword = (payload) => apiRequest('/api/auth/password', { method: 'POST', body: payload });
export const fetchAccountSessions = () => apiRequest('/api/auth/sessions');
export const revokeAccountSession = (id) => apiRequest(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const exportAccountDataApi = () => apiRequest('/api/auth/export', { timeoutMs: 45_000 });
export const deleteAccountApi = (password) => apiRequest('/api/auth/account', { method: 'DELETE', body: { password } });

/* ------------------------------------------------------------------ */
/* Cloud Sync & Analytics                                             */
/* ------------------------------------------------------------------ */

export const fetchSyncBootstrap = () => apiRequest('/api/sync/bootstrap');
export const fetchCloudProgress = (courseId) => apiRequest(`/api/progress/${encodeURIComponent(courseId)}`);
export const pushCloudProgress = (courseId, progress, { mode = 'merge' } = {}) => (
  apiRequest(`/api/progress/${encodeURIComponent(courseId)}`, { method: 'PUT', body: { progress, mode } })
);
export const pushStudyEvent = (payload) => apiRequest('/api/events', { method: 'POST', body: payload });
export const fetchStudyAnalytics = () => apiRequest('/api/analytics');

/* ------------------------------------------------------------------ */
/* Settings & Encrypted Gemini Key                                    */
/* ------------------------------------------------------------------ */

export const fetchCloudSettings = () => apiRequest('/api/settings');
export const pushCloudSettings = (payload) => apiRequest('/api/settings', { method: 'PUT', body: payload });
export const saveCloudGeminiKey = (apiKey, geminiModel) => apiRequest('/api/settings/gemini-key', { method: 'PUT', body: { apiKey, geminiModel } });
export const deleteCloudGeminiKey = () => apiRequest('/api/settings/gemini-key', { method: 'DELETE' });

/* ------------------------------------------------------------------ */
/* Courses & Community Hub                                            */
/* ------------------------------------------------------------------ */

export const fetchCloudCourses = () => apiRequest('/api/courses');
export const fetchCloudCourse = (id) => apiRequest(`/api/courses/${encodeURIComponent(id)}`);
export const pushCloudCourse = (course) => apiRequest(`/api/courses/${encodeURIComponent(course.id)}`, { method: 'PUT', body: course, timeoutMs: 45_000 });
export const deleteCloudCourse = (id) => apiRequest(`/api/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const fetchCloudRawDocument = (courseId) => apiRequest(`/api/courses/${encodeURIComponent(courseId)}/raw-document`);
export const pushCloudRawDocument = (courseId, document) => (
  apiRequest(`/api/courses/${encodeURIComponent(courseId)}/raw-document`, { method: 'PUT', body: { document }, timeoutMs: 45_000 })
);
export const publishCourseToCommunity = (courseId, payload) => (
  apiRequest(`/api/courses/${encodeURIComponent(courseId)}/publish`, { method: 'POST', body: payload })
);

export const fetchCommunityCourses = ({ q = '', tag = '', sort = 'popular', limit = 30, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  return apiRequest(`/api/community/courses${qs ? `?${qs}` : ''}`);
};
export const fetchCommunityCourseDetail = (id) => apiRequest(`/api/community/courses/${encodeURIComponent(id)}`);
export const cloneCommunityCourseApi = (id) => apiRequest(`/api/community/courses/${encodeURIComponent(id)}/clone`, { method: 'POST' });

/* ------------------------------------------------------------------ */
/* Leaderboard                                                        */
/* ------------------------------------------------------------------ */

export const fetchLeaderboardApi = ({ period = 'week', limit = 20 } = {}) => (
  apiRequest(`/api/leaderboard?period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`)
);

/* ------------------------------------------------------------------ */
/* Server Gemini Proxy & AI Tutor                                     */
/* ------------------------------------------------------------------ */

export const fetchServerAiModels = ({ signal } = {}) => apiRequest('/api/ai/models', { signal, timeoutMs: 25_000 });
export const testServerAiKey = ({ apiKey, model } = {}) => apiRequest('/api/ai/test', { method: 'POST', body: { apiKey, model }, timeoutMs: 25_000 });
export const generateViaServerAi = ({ prompt, schema, model, maxTokens, signal } = {}) => (
  apiRequest('/api/ai/generate', {
    method: 'POST',
    body: { prompt, schema, model, maxTokens },
    signal,
    timeoutMs: 65_000,
  })
);
export const fetchTutorHistoryApi = () => apiRequest('/api/ai/tutor/history');
export const sendTutorMessageApi = (payload) => apiRequest('/api/ai/tutor', { method: 'POST', body: payload, timeoutMs: 50_000 });
export const clearTutorHistoryApi = () => apiRequest('/api/ai/tutor/history', { method: 'DELETE' });
