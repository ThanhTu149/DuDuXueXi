/**
 * db.js — lớp IndexedDB của DuDu Hán Ngữ.
 *
 * Điểm mạnh so với bản cũ:
 *  - Schema có version (DB_VERSION) và "chặng" nâng cấp rõ ràng (runSchemaUpgrade),
 *    nên DB v1/v2 đang có trên máy người dùng vẫn mở được lên v3.
 *  - `onblocked` không reject ngay: chờ tab khác đóng rồi mới mở, chỉ báo lỗi sau
 *    một khoảng timeout (kèm thông điệp tiếng Việt dễ hiểu).
 *  - Mọi lỗi giao dịch được bọc thành `DbError` có `code` để UI xử lý (quota, not-found...).
 *  - Đồng bộ giữa các tab qua BroadcastChannel: subscribeDbChanges().
 *
 * Giữ nguyên toàn bộ export cũ để App.jsx / các screen không bị ảnh hưởng.
 */

import { createCrossTabChannel } from './storage.js';

const DB_NAME = 'dudu-hanngu-db';
export const DB_VERSION = 3;
export const BUILT_IN_COURSE_ID = 'hanngu-tap2';
export const DB_SYNC_CHANNEL = 'dudu-db-sync-v1';

/** Thời gian chờ tối đa khi DB bị tab khác giữ (ms). */
const OPEN_BLOCKED_TIMEOUT_MS = 10000;

export const DB_ERROR_CODES = Object.freeze({
  unsupported: 'unsupported',
  openFailed: 'open-failed',
  blocked: 'blocked',
  versionChange: 'version-change',
  transaction: 'transaction',
  abort: 'abort',
  quota: 'quota',
  notFound: 'not-found',
  invalid: 'invalid',
  unknown: 'unknown',
});

const DB_MESSAGES = {
  unsupported: 'Trình duyệt không hỗ trợ IndexedDB nên chưa lưu được dữ liệu. Hãy dùng Chrome/Edge/Safari/Firefox phiên bản mới.',
  'open-failed': 'Không mở được kho dữ liệu trình duyệt. Hãy tải lại trang rồi thử lại.',
  blocked: 'Dữ liệu đang được mở ở một tab/cửa sổ khác. Hãy đóng bớt tab DuDu Hán Ngữ (hoặc cửa sổ ẩn danh) rồi tải lại trang.',
  'version-change': 'Dữ liệu vừa được nâng cấp ở tab khác. Hãy tải lại trang để dùng phiên bản mới.',
  transaction: 'Không đọc/ghi được dữ liệu trình duyệt. Hãy thử lại; nếu vẫn lỗi, tải lại trang.',
  abort: 'Thao tác dữ liệu đã bị hủy.',
  quota: 'Bộ nhớ trình duyệt đã đầy nên chưa lưu được dữ liệu. Hãy xoá bớt khóa học hoặc tài liệu đã nhập rồi thử lại.',
  'not-found': 'Không tìm thấy dữ liệu cần thao tác.',
  invalid: 'Dữ liệu không hợp lệ nên chưa lưu được.',
  unknown: 'Lỗi dữ liệu không xác định. Hãy thử lại.',
};

export class DbError extends Error {
  constructor(code, message = null, { cause = null, store = null, operation = null } = {}) {
    const safeCode = code in DB_MESSAGES ? code : 'unknown';
    super(message || DB_MESSAGES[safeCode]);
    this.name = 'DbError';
    this.code = safeCode;
    this.store = store;
    this.operation = operation;
    if (cause) this.cause = cause;
  }

  /** Thông điệp tiếng Việt an toàn để hiển thị trực tiếp. */
  get userMessage() {
    return this.message || DB_MESSAGES[this.code] || DB_MESSAGES.unknown;
  }
}

export function isDbError(error, code = null) {
  return error instanceof DbError && (!code || error.code === code);
}

function wrapDbError(error, { store = null, operation = null } = {}) {
  if (error instanceof DbError) return error;
  const name = error?.name || '';
  if (name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) {
    return new DbError('quota', null, { cause: error, store, operation });
  }
  if (['AbortError', 'TransactionInactiveError'].includes(name)) {
    return new DbError('abort', null, { cause: error, store, operation });
  }
  return new DbError('transaction', null, { cause: error, store, operation });
}

const DEFAULT_SETTINGS = {
  id: 'app',
  geminiApiKey: null,
  geminiModel: 'gemini-flash-latest',
  activeCourseId: BUILT_IN_COURSE_ID,
  theme: 'auto',
  language: 'vi',
  migrationDone: false,
};

let dbPromise;
let migrationPromise;

/** Trạng thái mở DB (blocked / versionchange) để UI phản ứng. */
const dbStateListeners = new Set();
function notifyDbState(event) {
  for (const listener of [...dbStateListeners]) {
    try {
      listener(event);
    } catch { /* ignore listener errors */ }
  }
}

/** Lắng nghe sự kiện DB bị chặn / bị tab khác nâng cấp version. */
export function subscribeDbState(listener) {
  dbStateListeners.add(listener);
  return () => dbStateListeners.delete(listener);
}

/* ------------------------------------------------------------------ */
/* Schema + migration ladder                                          */
/* ------------------------------------------------------------------ */

/**
 * Chạy các "chặng" nâng cấp schema. Hàm thuần tuý (chỉ dùng API IndexedDB)
 * để có thể test bằng object giả trong node.
 *
 * Lịch sử: v1 = courses/progress/settings; v2 = raw_documents + index courseId;
 *         v3 = meta (đánh dấu schema + thời điểm nâng cấp).
 */
export function runSchemaUpgrade(db, oldVersion = 0, transaction = null) {
  const created = [];
  const hasStore = (name) => Boolean(db.objectStoreNames && db.objectStoreNames.contains(name));
  const ensureStore = (name, options) => {
    if (hasStore(name)) return null;
    const store = db.createObjectStore(name, options);
    created.push(name);
    return store;
  };

  // Chặng 1: kho dữ liệu gốc.
  if (oldVersion < 1) {
    ensureStore('courses', { keyPath: 'id' });
    ensureStore('progress', { keyPath: 'courseId' });
    ensureStore('settings', { keyPath: 'id' });
  }

  // Chặng 2: tài liệu gốc cần index courseId để xoá/đọc theo khóa học.
  if (oldVersion < 2) {
    const store = ensureStore('raw_documents', { keyPath: 'id' });
    (store || transaction?.objectStore('raw_documents'))?.createIndex?.('courseId', 'courseId');
  } else if (transaction) {
    // Tự "chữa lành" DB v2 lỡ thiếu index.
    try {
      const store = transaction.objectStore('raw_documents');
      if (store?.indexNames && !store.indexNames.contains('courseId')) store.createIndex('courseId', 'courseId');
    } catch { /* store có thể không tồn tại ở DB lạ; bỏ qua */ }
  }

  // Chặng 3: store meta nhỏ để lưu version schema đã nâng cấp.
  if (oldVersion < 3) {
    ensureStore('meta', { keyPath: 'key' });
    try {
      transaction?.objectStore('meta')?.put({ key: 'schema', version: DB_VERSION, upgradedAt: new Date().toISOString() });
    } catch { /* meta chưa sẵn sàng — không phải lỗi chặn */ }
  }

  return { from: oldVersion, version: DB_VERSION, created };
}

/* ------------------------------------------------------------------ */
/* Mở DB                                                              */
/* ------------------------------------------------------------------ */

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

function installDbEvents(db) {
  try {
    db.onversionchange = () => {
      try { db.close(); } catch { /* ignore */ }
      dbPromise = undefined;
      notifyDbState({ type: 'version-change', message: DB_MESSAGES['version-change'] });
    };
    db.onclose = () => { dbPromise = undefined; };
  } catch { /* một số trình duyệt không cho gán */ }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DbError('unsupported'));
      return;
    }
    let settled = false;
    let blockedTimer = null;
    let request;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      if (error) reject(error);
      else resolve(request.result);
    };
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new DbError('open-failed', null, { cause: error }));
      return;
    }
    request.onupgradeneeded = (event) => {
      try {
        runSchemaUpgrade(request.result, event?.oldVersion || 0, request.transaction);
      } catch (error) {
        try { request.transaction?.abort(); } catch { /* ignore */ }
        finish(new DbError('open-failed', 'Không nâng cấp được kho dữ liệu trình duyệt. Hãy tải lại trang rồi thử lại.', { cause: error }));
      }
    };
    request.onsuccess = () => {
      if (settled) {
        try { request.result.close(); } catch { /* ignore */ }
        return;
      }
      installDbEvents(request.result);
      finish();
    };
    request.onerror = () => finish(new DbError('open-failed', null, { cause: request.error }));
    request.onblocked = () => {
      // KHÔNG reject ngay: tab khác có thể đang chạy version cũ và sẽ sớm đóng DB.
      notifyDbState({ type: 'blocked', message: DB_MESSAGES.blocked });
      if (blockedTimer) return;
      blockedTimer = setTimeout(() => {
        finish(new DbError('blocked'));
      }, OPEN_BLOCKED_TIMEOUT_MS);
      if (typeof blockedTimer?.unref === 'function') blockedTimer.unref();
    };
  });
}

/** Đóng kết nối (dùng khi cần buộc mở lại DB sau versionchange). */
export function resetDbConnection() {
  const current = dbPromise;
  dbPromise = undefined;
  if (!current) return;
  current.then((db) => {
    try { db.close(); } catch { /* ignore */ }
  }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Cross-tab sync                                                     */
/* ------------------------------------------------------------------ */

let dbChannel = null;
function getDbChannel() {
  if (!dbChannel) dbChannel = createCrossTabChannel(DB_SYNC_CHANNEL);
  return dbChannel;
}

function postDbChange(message) {
  const payload = { type: message.type, courseId: message.courseId || null, store: message.store || null, operation: message.operation || 'write', at: Date.now() };
  try { getDbChannel().post(payload); } catch { /* đồng bộ tab là tuỳ chọn, lỗi không được chặn ghi dữ liệu */ }
}

/**
 * Đăng ký nhận thay đổi dữ liệu từ tab khác.
 * Callback nhận `{ type, courseId, store, operation, at }`.
 */
export function subscribeDbChanges(listener) {
  return getDbChannel().subscribe(listener);
}

/** Gửi thông báo thay đổi thủ công (hữu ích cho test và cho code ngoài db.js). */
export function broadcastDbChange(message) {
  postDbChange(message);
}

/** Ghi dữ liệu rồi mới phát thông báo cross-tab (không phát nếu ghi lỗi). */
async function writeAndNotify(message, operation) {
  const result = await operation();
  postDbChange(typeof message === 'function' ? message(result) : message);
  return result;
}

/* ------------------------------------------------------------------ */
/* Giao dịch an toàn                                                  */
/* ------------------------------------------------------------------ */

async function transact(stores, mode, enqueue, { operation = 'read', store = null } = {}) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      reject(new DbError('transaction', null, { cause: error, store, operation }));
      return;
    }
    let result;
    let settled = false;
    let abortReason = null;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    };
    const abortWith = (error) => {
      abortReason = error instanceof DbError ? error : wrapDbError(error, { store, operation });
      try { tx.abort(); } catch { settle(abortReason); }
    };
    tx.oncomplete = () => settle(null);
    tx.onerror = () => settle(abortReason || wrapDbError(tx.error, { store, operation }));
    tx.onabort = () => settle(abortReason || new DbError('abort', null, { cause: tx.error, store, operation }));
    try {
      enqueue(tx, (value) => { result = value; }, abortWith);
    } catch (error) {
      abortWith(error);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Courses                                                            */
/* ------------------------------------------------------------------ */

export function getAllCourses() {
  return transact(['courses'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('courses').getAll();
    request.onsuccess = () => setResult(request.result.map(({ chapters, ...course }) => ({
      ...course,
      chapterCount: chapters?.length || 0,
    })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
  }, { store: 'courses', operation: 'getAll' });
}

export function getCourse(id) {
  if (!id) return Promise.resolve(null);
  return transact(['courses'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('courses').get(id);
    request.onsuccess = () => setResult(request.result || null);
  }, { store: 'courses', operation: 'get' });
}

export function saveCourse(course) {
  if (!course?.id || !course?.name || !Array.isArray(course.chapters)) {
    return Promise.reject(new DbError('invalid', 'Khóa học cần id, name và chapters.'));
  }
  return writeAndNotify({ type: 'course-changed', courseId: course.id, store: 'courses' }, () => (
    transact(['courses'], 'readwrite', (tx, setResult) => {
      const store = tx.objectStore('courses');
      const request = store.get(course.id);
      request.onsuccess = () => {
        const now = new Date().toISOString();
        const record = {
          ...course,
          createdAt: course.createdAt || request.result?.createdAt || now,
          updatedAt: now,
        };
        store.put(record);
        setResult(record);
      };
    }, { store: 'courses', operation: 'put' })
  ));
}

export async function deleteCourse(id) {
  const course = await getCourse(id);
  if (!course) return false;
  if (course.type === 'built-in' || id === BUILT_IN_COURSE_ID) {
    throw new DbError('invalid', 'Không thể xoá khóa học mặc định.');
  }
  return writeAndNotify({ type: 'course-deleted', courseId: id, store: 'courses' }, () => (
    transact(['courses', 'progress', 'settings', 'raw_documents'], 'readwrite', (tx, setResult) => {
      tx.objectStore('courses').delete(id);
      tx.objectStore('progress').delete(id);
      const documents = tx.objectStore('raw_documents').index('courseId').openCursor(IDBKeyRange.only(id));
      documents.onsuccess = () => {
        const cursor = documents.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      const settingsStore = tx.objectStore('settings');
      const request = settingsStore.get('app');
      request.onsuccess = () => {
        if (request.result?.activeCourseId === id) {
          settingsStore.put({ ...request.result, activeCourseId: BUILT_IN_COURSE_ID });
        }
      };
      setResult(true);
    }, { store: 'courses', operation: 'delete' })
  ));
}

/* ------------------------------------------------------------------ */
/* Progress                                                           */
/* ------------------------------------------------------------------ */

export function getProgress(courseId) {
  if (!courseId) return Promise.resolve(null);
  return transact(['progress'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('progress').get(courseId);
    request.onsuccess = () => setResult(request.result || null);
  }, { store: 'progress', operation: 'get' });
}

export function saveProgress(courseId, progress) {
  if (!courseId || !progress || typeof progress !== 'object') {
    return Promise.reject(new DbError('invalid', 'Thiếu courseId hoặc progress.'));
  }
  const baiProgress = courseId === BUILT_IN_COURSE_ID
    ? Object.fromEntries(Object.entries(progress.baiProgress || {}).flatMap(([key, value]) => {
      const number = Number(key);
      return Number.isInteger(number) && number > 0 ? [[key, value], [`bai${String(number).padStart(2, '0')}`, value]] : [[key, value]];
    }))
    : progress.baiProgress;
  const record = { ...progress, baiProgress, courseId, updatedAt: new Date().toISOString() };
  return writeAndNotify({ type: 'progress-changed', courseId, store: 'progress' }, () => (
    transact(['progress'], 'readwrite', (tx, setResult) => {
      tx.objectStore('progress').put(record);
      setResult(record);
    }, { store: 'progress', operation: 'put' })
  ));
}

export function clearAllProgress() {
  return writeAndNotify({ type: 'progress-cleared', store: 'progress' }, () => (
    transact(['progress'], 'readwrite', (tx, setResult) => {
      tx.objectStore('progress').clear();
      setResult(true);
    }, { store: 'progress', operation: 'clear' })
  ));
}

/* ------------------------------------------------------------------ */
/* Raw documents                                                      */
/* ------------------------------------------------------------------ */

export function getRawDocument(id) {
  if (!id) return Promise.resolve(null);
  return transact(['raw_documents'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('raw_documents').get(id);
    request.onsuccess = () => setResult(request.result || null);
  }, { store: 'raw_documents', operation: 'get' });
}

export function getRawDocumentsByCourse(courseId) {
  return transact(['raw_documents'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('raw_documents').index('courseId').getAll(courseId);
    request.onsuccess = () => setResult(request.result || []);
  }, { store: 'raw_documents', operation: 'getAll' });
}

export function saveRawDocument(document) {
  if (!document?.id || !document.courseId) return Promise.reject(new DbError('invalid', 'Tài liệu cần id và courseId.'));
  return writeAndNotify({ type: 'raw-document-changed', courseId: document.courseId, store: 'raw_documents' }, () => (
    transact(['raw_documents'], 'readwrite', (tx, setResult) => {
      tx.objectStore('raw_documents').put(document);
      setResult(document);
    }, { store: 'raw_documents', operation: 'put' })
  ));
}

export function patchRawDocument(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return Promise.reject(new DbError('invalid', 'Thiếu tài liệu hoặc dữ liệu cập nhật.'));
  return writeAndNotify((updated) => ({ type: 'raw-document-changed', courseId: updated?.courseId || patch.courseId || null, store: 'raw_documents' }), () => (
    transact(['raw_documents'], 'readwrite', (tx, setResult, abortWith) => {
      const store = tx.objectStore('raw_documents');
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          abortWith(new DbError('not-found', 'Không tìm thấy tài liệu để cập nhật.'));
          return;
        }
        const updated = { ...request.result, ...patch, updatedAt: new Date().toISOString() };
        store.put(updated);
        setResult(updated);
      };
    }, { store: 'raw_documents', operation: 'patch' })
  ));
}

export function deleteRawDocument(id) {
  return writeAndNotify({ type: 'raw-document-changed', courseId: null, store: 'raw_documents' }, () => (
    transact(['raw_documents'], 'readwrite', (tx) => tx.objectStore('raw_documents').delete(id), { store: 'raw_documents', operation: 'delete' })
  ));
}

export function attachRawDocument(courseId, document) {
  if (document?.courseId !== courseId) return Promise.reject(new DbError('invalid', 'Tài liệu không thuộc khóa học này.'));
  return writeAndNotify({ type: 'course-changed', courseId, store: 'raw_documents' }, () => (
    transact(['courses', 'raw_documents'], 'readwrite', (tx, setResult, abortWith) => {
      const courses = tx.objectStore('courses');
      const request = courses.get(courseId);
      request.onsuccess = () => {
        if (!request.result) {
          abortWith(new DbError('not-found', 'Không tìm thấy khóa học để gắn tài liệu.'));
          return;
        }
        const course = {
          ...request.result,
          rawDocumentId: document.id,
          status: 'has-raw',
          metadata: {
            ...(request.result.metadata || {}),
            estimatedChapters: document.detectedStructure?.chapters?.length || null,
            rawFileName: document.fileName,
            rawTextLength: document.textLength,
            rawChunkCount: document.chunkCount,
          },
          updatedAt: new Date().toISOString(),
        };
        if (request.result.rawDocumentId && request.result.rawDocumentId !== document.id) tx.objectStore('raw_documents').delete(request.result.rawDocumentId);
        tx.objectStore('raw_documents').put(document);
        courses.put(course);
        setResult(course);
      };
    }, { store: 'courses', operation: 'attach' })
  ));
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export function getSettings() {
  return transact(['settings'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('settings').get('app');
    request.onsuccess = () => setResult({ ...DEFAULT_SETTINGS, ...(request.result || {}) });
  }, { store: 'settings', operation: 'get' });
}

export function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return Promise.reject(new DbError('invalid', 'Thiếu app settings.'));
  }
  return writeAndNotify({ type: 'settings-changed', store: 'settings' }, () => (
    transact(['settings'], 'readwrite', (tx, setResult) => {
      const store = tx.objectStore('settings');
      const request = store.get('app');
      request.onsuccess = () => {
        const record = { ...DEFAULT_SETTINGS, ...(request.result || {}), ...settings, id: 'app' };
        store.put(record);
        setResult(record);
      };
    }, { store: 'settings', operation: 'put' })
  ));
}

/* ------------------------------------------------------------------ */
/* Meta / thông tin schema                                            */
/* ------------------------------------------------------------------ */

/** Thông tin schema đã nâng cấp (null nếu DB cũ chưa có store meta). */
export function getSchemaInfo() {
  return transact(['meta'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('meta').get('schema');
    request.onsuccess = () => setResult(request.result || null);
  }, { store: 'meta', operation: 'get' }).catch(() => null);
}

/** Liệt kê store đang có trong DB (dùng cho chẩn đoán/lỗi). */
export async function getDbInfo() {
  const db = await initDB();
  return { version: db.version, expectedVersion: DB_VERSION, stores: [...db.objectStoreNames] };
}

/* ------------------------------------------------------------------ */
/* Migration dữ liệu cũ                                               */
/* ------------------------------------------------------------------ */

export async function isMigrationDone() {
  return Boolean((await getSettings()).migrationDone);
}

export async function migrateBuiltInCourse() {
  if (!migrationPromise) {
    migrationPromise = import('./migration.js').then(({ migrateLegacyData }) => migrateLegacyData());
  }
  const activeMigration = migrationPromise;
  try {
    return await activeMigration;
  } finally {
    if (migrationPromise === activeMigration) migrationPromise = undefined;
  }
}
