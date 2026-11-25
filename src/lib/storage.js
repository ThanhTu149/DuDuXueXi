/**
 * storage.js — lớp lưu trữ localStorage an toàn cho DuDu Hán Ngữ.
 *
 * Nguyên tắc:
 *  - Mọi thao tác đọc/ghi đều KHÔNG bao giờ throw ra ngoài; lỗi được trả về dưới
 *    dạng `StorageError` có `code` + thông điệp tiếng Việt dễ hiểu.
 *  - Phát hiện đầy bộ nhớ (quota) và trả về gợi ý xử lý thay vì im lặng mất dữ liệu.
 *  - Dữ liệu JSON được parse qua bộ lọc chống prototype pollution.
 *  - Progress có trường schema version (`_schemaVersion`) để nâng cấp dần.
 *  - Có kênh đồng bộ giữa các tab (BroadcastChannel, fallback storage event) để
 *    tab này không ghi đè dữ liệu tab khác.
 *
 * Các export cũ (readLocalValue/readLocalJson/writeLocalValue/writeLocalJson)
 * được giữ nguyên chữ ký để không phá vỡ code đang dùng.
 */

export const STORAGE_ERROR_CODES = Object.freeze({
  unavailable: 'unavailable',
  quota: 'quota',
  blocked: 'blocked',
  serialization: 'serialization',
  invalid: 'invalid',
  unknown: 'unknown',
});

/** Thông điệp tiếng Việt cho từng loại lỗi lưu trữ. */
const STORAGE_MESSAGES = {
  unavailable:
    'Trình duyệt không cho phép lưu dữ liệu cục bộ. Hãy tắt chế độ ẩn danh hoặc bật cookie/lưu trữ cho trang này.',
  quota:
    'Bộ nhớ trình duyệt đã đầy nên chưa lưu được thay đổi. Hãy xoá bớt khóa học/tài liệu đã nhập hoặc ảnh nền tuỳ chỉnh trong Cài đặt rồi thử lại.',
  blocked:
    'Trình duyệt đang chặn lưu trữ cục bộ. Kiểm tra quyền lưu dữ liệu của trang và thử lại.',
  serialization: 'Dữ liệu không thể chuyển thành JSON nên chưa lưu được.',
  invalid: 'Dữ liệu lưu trữ không hợp lệ.',
  unknown: 'Không lưu được dữ liệu cục bộ vì lỗi không xác định.',
};

export class StorageError extends Error {
  constructor(code, message, { key = null, cause = null } = {}) {
    super(message || STORAGE_MESSAGES[code] || STORAGE_MESSAGES.unknown);
    this.name = 'StorageError';
    this.code = code in STORAGE_MESSAGES ? code : 'unknown';
    this.key = key;
    if (cause) this.cause = cause;
  }

  /** Thông điệp an toàn để hiển thị trực tiếp cho người dùng. */
  get userMessage() {
    return this.message || STORAGE_MESSAGES[this.code] || STORAGE_MESSAGES.unknown;
  }
}

/** Các khóa có thể coi là không an toàn khi merge JSON từ nguồn ngoài. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function getLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

function nextTabId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `tab-${crypto.randomUUID()}`;
  } catch { /* ignore */ }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Tab id ổn định trong phạm vi một tab (dùng để bỏ qua thông báo của chính mình). */
export const TAB_ID = nextTabId();

function detectStorageErrorCode(error) {
  const name = error?.name || '';
  const code = error?.code;
  if (['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(name) || code === 22 || code === 1014) return 'quota';
  if (['SecurityError', 'AccessDeniedError', 'InvalidAccessError', 'NotAllowedError'].includes(name)) return 'blocked';
  return 'unknown';
}

function toStorageError(error, { key = null } = {}) {
  if (error instanceof StorageError) return error;
  const code = detectStorageErrorCode(error);
  return new StorageError(code, STORAGE_MESSAGES[code], { key, cause: error });
}

/** Parse JSON an toàn: lỗi cú pháp hoặc khóa nguy hiểm không làm sập app. */
export function safeJsonParse(text, fallback = null) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
  } catch {
    return fallback;
  }
}

/**
 * Clone sâu và loại bỏ các khóa có thể gây prototype pollution.
 * Dùng cho dữ liệu JSON nhập từ bên ngoài (sao lưu .dudu, localStorage).
 */
export function sanitizeDeep(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    clean[key] = sanitizeDeep(item, seen);
  }
  return clean;
}

/* ------------------------------------------------------------------ */
/* Đọc/ghi cơ bản (giữ chữ ký cũ)                                      */
/* ------------------------------------------------------------------ */

export function readLocalValue(key, fallback = null) {
  const storage = getLocalStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export function readLocalJson(key, fallback = null) {
  const value = readLocalValue(key);
  if (value === null) return fallback;
  return safeJsonParse(value, fallback);
}

/**
 * Kết quả đọc JSON có kèm chẩn đoán: dùng khi cần báo cho người dùng biết
 * dữ liệu bị hỏng thay vì âm thầm reset về mặc định.
 */
export function readLocalJsonResult(key, fallback = null) {
  const storage = getLocalStorage();
  if (!storage) {
    return { value: fallback, ok: false, missing: true, corrupt: false, error: new StorageError('unavailable', null, { key }) };
  }
  let raw;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    return { value: fallback, ok: false, missing: false, corrupt: false, error: toStorageError(error, { key }) };
  }
  if (raw === null || raw === undefined) return { value: fallback, ok: true, missing: true, corrupt: false, error: null };
  try {
    return { value: JSON.parse(raw, (k, v) => (UNSAFE_KEYS.has(k) ? undefined : v)), ok: true, missing: false, corrupt: false, error: null, raw };
  } catch (error) {
    return { value: fallback, ok: false, missing: false, corrupt: true, error: toStorageError(error, { key }), raw };
  }
}

export function writeLocalValue(key, value) {
  return writeLocalValueSafe(key, value).ok;
}

export function writeLocalJson(key, value) {
  return writeLocalJsonSafe(key, value).ok;
}

/** Ghi chuỗi thô, trả về kết quả chi tiết thay vì chỉ boolean. */
export function writeLocalValueSafe(key, value) {
  const storage = getLocalStorage();
  if (!storage) return { ok: false, error: new StorageError('unavailable', null, { key }) };
  try {
    storage.setItem(key, String(value));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: toStorageError(error, { key }) };
  }
}

/** Ghi JSON, trả về `{ ok, error, bytes }`; không bao giờ throw. */
export function writeLocalJsonSafe(key, value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return { ok: false, bytes: 0, error: new StorageError('serialization', null, { key, cause: error }) };
  }
  const result = writeLocalValueSafe(key, serialized);
  return { ...result, bytes: serialized.length * 2 };
}

export function removeLocalValue(key) {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Kiểm tra nhanh localStorage có dùng được không (thử ghi một khóa tạm). */
export function isStorageAvailable() {
  const storage = getLocalStorage();
  if (!storage) return false;
  const probe = '__dudu_storage_probe__';
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Ước lượng dung lượng localStorage đang dùng (byte, UTF-16). */
export function estimateLocalStorageBytes() {
  const storage = getLocalStorage();
  if (!storage) return 0;
  try {
    let total = 0;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      total += (key.length + (storage.getItem(key)?.length || 0)) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Dung lượng còn lại theo StorageManager (nếu trình duyệt hỗ trợ). */
export async function getStorageEstimate() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        supported: true,
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        available: Math.max(0, (estimate.quota || 0) - (estimate.usage || 0)),
        localBytes: estimateLocalStorageBytes(),
      };
    }
  } catch { /* ignore */ }
  return { supported: false, usage: null, quota: null, available: null, localBytes: estimateLocalStorageBytes() };
}

/* ------------------------------------------------------------------ */
/* Đồng bộ giữa các tab                                                */
/* ------------------------------------------------------------------ */

/**
 * Tạo kênh thông báo giữa các tab.
 * Ưu tiên BroadcastChannel; nếu không có thì fallback sự kiện `storage`
 * (chỉ hoạt động giữa các document khác nhau, đúng nhu cầu đồng bộ tab).
 */
export function createCrossTabChannel(name = 'dudu-sync-v1', { tabId = TAB_ID } = {}) {
  const listeners = new Set();
  let channel = null;
  let closed = false;
  const eventKey = `dudu-sync-event:${name}`;
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';

  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(name);
      channel.onmessage = (event) => dispatch(event?.data);
      if (typeof channel.unref === 'function') channel.unref();
    } catch {
      channel = null;
    }
  }

  function dispatch(message) {
    if (closed || !message || message.sourceTabId === tabId) return;
    for (const listener of [...listeners]) {
      try {
        listener(message);
      } catch { /* listener lỗi không được làm hỏng kênh */ }
    }
  }

  function onStorage(event) {
    if (!event || event.key !== eventKey || !event.newValue) return;
    dispatch(safeJsonParse(event.newValue, null));
  }

  if (!channel && hasWindow) window.addEventListener('storage', onStorage);

  function post(payload) {
    if (closed) return false;
    const message = { ...payload, sourceTabId: tabId, at: Date.now() };
    if (channel) {
      try {
        channel.postMessage(message);
        return true;
      } catch { /* rơi xuống fallback */ }
    }
    const storage = getLocalStorage();
    if (storage) {
      try {
        storage.setItem(eventKey, JSON.stringify({ ...message, nonce: `${Date.now()}-${Math.random()}` }));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  return {
    name,
    tabId,
    transport: channel ? 'broadcast-channel' : hasWindow ? 'storage-event' : 'none',
    post,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
      try { channel?.close(); } catch { /* ignore */ }
      if (hasWindow) window.removeEventListener('storage', onStorage);
    },
  };
}

export const PROGRESS_SYNC_CHANNEL = 'dudu-progress-sync-v1';

let progressChannel = null;
function getProgressChannel() {
  if (!progressChannel) progressChannel = createCrossTabChannel(PROGRESS_SYNC_CHANNEL);
  return progressChannel;
}

/* ------------------------------------------------------------------ */
/* Progress: schema version + validate + merge                         */
/* ------------------------------------------------------------------ */

export const PROGRESS_STORAGE_KEY = 'dudu-progress-v1';
export const PROGRESS_SCHEMA_VERSION = 2;

/** Sentinel để phân biệt "JSON hỏng" với JSON hợp lệ có giá trị null. */
const PARSE_FAILED = Symbol('dudu-parse-failed');

/** Các trường dạng mảng trong progress — sai kiểu sẽ được sửa thành []. */
const PROGRESS_ARRAY_FIELDS = [
  'achievements',
  'goalRewardDates',
  'wrongAnswers',
  'wrongAnswersDetailed',
  'bookmarks',
  'studyDates',
  'unlockedBai',
];
/** Các trường dạng object — sai kiểu sẽ được sửa thành {}. */
const PROGRESS_OBJECT_FIELDS = ['baiProgress', 'accuracy', 'srs', 'notes', 'settings', 'profile', 'advancedStats', 'studyDays', 'wrongCounts', 'dailyXp', 'weeklyXP'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate + chuẩn hoá progress đọc từ localStorage.
 * Trả về object đã sanitize, không throw. `issues` liệt kê các trường đã sửa.
 */
export function validateProgress(value) {
  if (!isPlainObject(value)) {
    return { ok: false, progress: null, issues: ['Dữ liệu tiến độ không phải object.'] };
  }
  const issues = [];
  const progress = sanitizeDeep(value);
  for (const field of PROGRESS_ARRAY_FIELDS) {
    if (progress[field] !== undefined && !Array.isArray(progress[field])) {
      issues.push(`Trường ${field} không phải mảng.`);
      progress[field] = [];
    }
  }
  for (const field of PROGRESS_OBJECT_FIELDS) {
    if (progress[field] !== undefined && !isPlainObject(progress[field])) {
      issues.push(`Trường ${field} không phải object.`);
      progress[field] = {};
    }
  }
  for (const field of ['xp', 'streak', 'dailyGoal', 'correctStreak', 'bossWins', 'todayCount', 'pomodoroSessions']) {
    if (progress[field] !== undefined && !Number.isFinite(Number(progress[field]))) {
      issues.push(`Trường ${field} không phải số.`);
      progress[field] = 0;
    }
  }
  return { ok: true, progress, issues };
}

/** Nâng cấp schema progress cũ (chưa có version) lên version hiện tại. */
export function migrateProgressSchema(value) {
  const validated = validateProgress(value);
  if (!validated.ok) return { progress: null, migrated: false, from: null, to: PROGRESS_SCHEMA_VERSION, issues: validated.issues };
  const progress = validated.progress;
  const from = Number.isInteger(progress._schemaVersion) ? progress._schemaVersion : 1;
  if (from >= PROGRESS_SCHEMA_VERSION) {
    return { progress, migrated: false, from, to: PROGRESS_SCHEMA_VERSION, issues: validated.issues };
  }
  // v1 -> v2: thêm mốc version; App tự merge default cho các trường còn thiếu.
  progress._schemaVersion = PROGRESS_SCHEMA_VERSION;
  return { progress, migrated: true, from, to: PROGRESS_SCHEMA_VERSION, issues: validated.issues };
}

/**
 * Đọc progress từ localStorage.
 * `progress` là null khi chưa từng lưu (giống readLocalJson(key, null)).
 */
export function readProgress({ key = PROGRESS_STORAGE_KEY, storage = null } = {}) {
  const target = storage || getLocalStorage();
  if (!target) {
    return { progress: null, ok: false, missing: true, corrupt: false, migrated: false, error: new StorageError('unavailable', null, { key }) };
  }
  let raw;
  try {
    raw = target.getItem(key);
  } catch (error) {
    return { progress: null, ok: false, missing: false, corrupt: false, migrated: false, error: toStorageError(error, { key }) };
  }
  if (!raw) return { progress: null, ok: true, missing: true, corrupt: false, migrated: false, error: null };
  const parsed = safeJsonParse(raw, PARSE_FAILED);
  if (parsed === PARSE_FAILED) {
    return {
      progress: null,
      ok: false,
      missing: false,
      corrupt: true,
      migrated: false,
      error: new StorageError('invalid', 'Dữ liệu tiến độ bị hỏng nên đã bỏ qua. Tiến độ mới sẽ được lưu lại.', { key }),
    };
  }
  const migrated = migrateProgressSchema(parsed);
  if (!migrated.progress) {
    return {
      progress: null,
      ok: false,
      missing: false,
      corrupt: true,
      migrated: false,
      error: new StorageError('invalid', 'Dữ liệu tiến độ không đúng định dạng nên đã bỏ qua.', { key }),
      issues: migrated.issues,
    };
  }
  return {
    progress: migrated.progress,
    ok: true,
    missing: false,
    corrupt: false,
    migrated: migrated.migrated,
    from: migrated.from,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    issues: migrated.issues,
    error: null,
  };
}

/** Kết quả ghi progress; `ok:false` kèm `error.userMessage` để hiển thị toast. */
export function writeProgress(progress, { key = PROGRESS_STORAGE_KEY, storage = null, notify = true, tabId = TAB_ID } = {}) {
  const validated = validateProgress(progress);
  if (!validated.ok) {
    return { ok: false, error: new StorageError('invalid', 'Không lưu được tiến độ: dữ liệu không hợp lệ.', { key }), bytes: 0 };
  }
  const payload = { ...validated.progress, _schemaVersion: PROGRESS_SCHEMA_VERSION, _savedAt: new Date().toISOString() };
  const target = storage || getLocalStorage();
  if (!target) return { ok: false, error: new StorageError('unavailable', null, { key }), bytes: 0 };
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    return { ok: false, error: new StorageError('serialization', null, { key, cause: error }), bytes: 0 };
  }
  try {
    target.setItem(key, serialized);
  } catch (error) {
    return { ok: false, error: toStorageError(error, { key }), bytes: 0 };
  }
  if (notify) {
    try {
      getProgressChannel().post({ type: 'progress-saved', key, savedAt: payload._savedAt, tabId, bytes: serialized.length * 2 });
    } catch { /* thông báo tab lỗi không ảnh hưởng dữ liệu đã ghi */ }
  }
  return { ok: true, error: null, bytes: serialized.length * 2, savedAt: payload._savedAt };
}

/**
 * Gộp progress khi hai tab cùng cập nhật.
 * Top-level lấy giá trị mới hơn theo `_savedAt`; các mảng "tích luỹ" được hợp nhất
 * để không mất thành tích/bookmark của tab kia.
 */
export function mergeProgressData(base, incoming) {
  const first = isPlainObject(base) ? sanitizeDeep(base) : {};
  const second = isPlainObject(incoming) ? sanitizeDeep(incoming) : {};
  const firstAt = Date.parse(first._savedAt || '') || 0;
  const secondAt = Date.parse(second._savedAt || '') || 0;
  const newer = secondAt >= firstAt ? second : first;
  const older = newer === second ? first : second;
  const merged = { ...older, ...newer };

  for (const field of ['achievements', 'goalRewardDates', 'bookmarks', 'studyDates']) {
    const values = [
      ...(Array.isArray(older[field]) ? older[field] : []),
      ...(Array.isArray(newer[field]) ? newer[field] : []),
    ];
    merged[field] = [...new Set(values)];
  }

  if (Array.isArray(older.unlockedBai) || Array.isArray(newer.unlockedBai)) {
    merged.unlockedBai = [...new Set([
      ...(Array.isArray(older.unlockedBai) ? older.unlockedBai : []),
      ...(Array.isArray(newer.unlockedBai) ? newer.unlockedBai : []),
    ])].sort((a, b) => Number(a) - Number(b));
  }

  if (isPlainObject(older.baiProgress) || isPlainObject(newer.baiProgress)) {
    const keys = new Set([
      ...Object.keys(isPlainObject(older.baiProgress) ? older.baiProgress : {}),
      ...Object.keys(isPlainObject(newer.baiProgress) ? newer.baiProgress : {}),
    ]);
    const bp = {};
    for (const key of keys) {
      const o = older.baiProgress?.[key] || {};
      const n = newer.baiProgress?.[key] || {};
      const attemptedIds = [...new Set([...(Array.isArray(o.attemptedIds) ? o.attemptedIds : []), ...(Array.isArray(n.attemptedIds) ? n.attemptedIds : [])])];
      const correctIds = [...new Set([...(Array.isArray(o.correctIds) ? o.correctIds : []), ...(Array.isArray(n.correctIds) ? n.correctIds : [])])];
      const firstAttemptCorrectIds = [...new Set([...(Array.isArray(o.firstAttemptCorrectIds) ? o.firstAttemptCorrectIds : []), ...(Array.isArray(n.firstAttemptCorrectIds) ? n.firstAttemptCorrectIds : [])])];
      bp[key] = {
        ...o,
        ...n,
        completed: Boolean(o.completed || n.completed),
        attemptedIds,
        correctIds,
        firstAttemptCorrectIds,
        quizDone: Math.max(Number(o.quizDone) || 0, Number(n.quizDone) || 0, attemptedIds.length),
        quizCorrect: Math.max(Number(o.quizCorrect) || 0, Number(n.quizCorrect) || 0, correctIds.length),
      };
    }
    merged.baiProgress = bp;
  }

  if (isPlainObject(older.studyDays) || isPlainObject(newer.studyDays)) {
    const days = { ...(isPlainObject(older.studyDays) ? older.studyDays : {}) };
    for (const [date, val] of Object.entries(isPlainObject(newer.studyDays) ? newer.studyDays : {})) {
      const prev = days[date] || { xp: 0, questions: 0 };
      days[date] = {
        xp: Math.max(Number(prev.xp) || 0, Number(val?.xp) || 0),
        questions: Math.max(Number(prev.questions) || 0, Number(val?.questions) || 0),
      };
    }
    merged.studyDays = days;
  }

  if (isPlainObject(older.weeklyXP) || isPlainObject(newer.weeklyXP)) {
    const weeks = { ...(isPlainObject(older.weeklyXP) ? older.weeklyXP : {}) };
    for (const [week, xp] of Object.entries(isPlainObject(newer.weeklyXP) ? newer.weeklyXP : {})) {
      weeks[week] = Math.max(Number(weeks[week]) || 0, Number(xp) || 0);
    }
    merged.weeklyXP = weeks;
  }

  if (isPlainObject(older.srs) || isPlainObject(newer.srs)) {
    const srs = { ...(isPlainObject(older.srs) ? older.srs : {}) };
    for (const [id, entry] of Object.entries(isPlainObject(newer.srs) ? newer.srs : {})) {
      const prev = srs[id];
      if (!prev || String(entry?.lastReview || '') >= String(prev?.lastReview || '')) {
        srs[id] = entry;
      }
    }
    merged.srs = srs;
  }

  if (isPlainObject(older.notes) || isPlainObject(newer.notes)) {
    merged.notes = {
      ...(isPlainObject(older.notes) ? older.notes : {}),
      ...(isPlainObject(newer.notes) ? newer.notes : {}),
    };
  }

  if (older.xp !== undefined || newer.xp !== undefined) {
    merged.xp = Math.max(Number(older.xp) || 0, Number(newer.xp) || 0);
  }
  return merged;
}

/** Chọn bản progress mới hơn (dựa vào `_savedAt`). */
export function pickFresherProgress(base, incoming) {
  const firstAt = Date.parse(base?._savedAt || '') || 0;
  const secondAt = Date.parse(incoming?._savedAt || '') || 0;
  return secondAt >= firstAt ? incoming : base;
}

/**
 * Theo dõi thay đổi progress từ tab khác hoặc từ sự kiện storage.
 * Trả về hàm huỷ đăng ký.
 */
export function subscribeStorageChanges(handler, { keys = [PROGRESS_STORAGE_KEY], channel = null } = {}) {
  const unsubscribers = [];
  const useChannel = channel || getProgressChannel();
  if (useChannel) {
    unsubscribers.push(useChannel.subscribe((message) => {
      if (keys && !keys.includes(message.key)) return;
      handler({ key: message.key, source: 'channel', ...message });
    }));
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onStorage = (event) => {
      if (!event?.key) return;
      if (keys && !keys.includes(event.key)) return;
      handler({ key: event.key, source: 'storage', newValue: event.newValue });
    };
    window.addEventListener('storage', onStorage);
    unsubscribers.push(() => window.removeEventListener('storage', onStorage));
  }
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/** Xoá progress đã lưu (dùng khi người dùng chọn "đặt lại tiến độ"). */
export function clearProgress({ key = PROGRESS_STORAGE_KEY } = {}) {
  const removed = removeLocalValue(key);
  try {
    getProgressChannel().post({ type: 'progress-cleared', key });
  } catch { /* ignore */ }
  return removed;
}
