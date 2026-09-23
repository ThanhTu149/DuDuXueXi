const DB_NAME = 'dudu-hanngu-db';
const DB_VERSION = 2;
export const BUILT_IN_COURSE_ID = 'hanngu-tap2';

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

export function initDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Trinh duyet khong ho tro IndexedDB.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'courseId' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('raw_documents')) {
          db.createObjectStore('raw_documents', { keyPath: 'id' }).createIndex('courseId', 'courseId');
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Khong the mo IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB dang duoc mo o mot tab khac.'));
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

async function transact(stores, mode, enqueue) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Loi giao dich IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Giao dich IndexedDB da bi huy.'));
    try {
      enqueue(tx, (value) => { result = value; });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export function getAllCourses() {
  return transact(['courses'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('courses').getAll();
    request.onsuccess = () => setResult(request.result.map(({ chapters, ...course }) => ({
      ...course,
      chapterCount: chapters?.length || 0,
    })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
  });
}

export function getCourse(id) {
  if (!id) return Promise.resolve(null);
  return transact(['courses'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('courses').get(id);
    request.onsuccess = () => setResult(request.result || null);
  });
}

export function saveCourse(course) {
  if (!course?.id || !course?.name || !Array.isArray(course.chapters)) {
    return Promise.reject(new Error('Khoa hoc can id, name va chapters.'));
  }
  return transact(['courses'], 'readwrite', (tx, setResult) => {
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
  });
}

export async function deleteCourse(id) {
  const course = await getCourse(id);
  if (!course) return false;
  if (course.type === 'built-in' || id === BUILT_IN_COURSE_ID) {
    throw new Error('Khong the xoa khoa hoc mac dinh.');
  }
  return transact(['courses', 'progress', 'settings', 'raw_documents'], 'readwrite', (tx, setResult) => {
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
  });
}

export function getProgress(courseId) {
  if (!courseId) return Promise.resolve(null);
  return transact(['progress'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('progress').get(courseId);
    request.onsuccess = () => setResult(request.result || null);
  });
}

export function saveProgress(courseId, progress) {
  if (!courseId || !progress || typeof progress !== 'object') {
    return Promise.reject(new Error('Thieu courseId hoac progress.'));
  }
  const baiProgress = courseId === BUILT_IN_COURSE_ID
    ? Object.fromEntries(Object.entries(progress.baiProgress || {}).flatMap(([key, value]) => {
      const number = Number(key);
      return Number.isInteger(number) && number > 0 ? [[key, value], [`bai${String(number).padStart(2, '0')}`, value]] : [[key, value]];
    }))
    : progress.baiProgress;
  const record = { ...progress, baiProgress, courseId, updatedAt: new Date().toISOString() };
  return transact(['progress'], 'readwrite', (tx, setResult) => {
    tx.objectStore('progress').put(record);
    setResult(record);
  });
}

export function getRawDocument(id) {
  if (!id) return Promise.resolve(null);
  return transact(['raw_documents'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('raw_documents').get(id);
    request.onsuccess = () => setResult(request.result || null);
  });
}

export function getRawDocumentsByCourse(courseId) {
  return transact(['raw_documents'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('raw_documents').index('courseId').getAll(courseId);
    request.onsuccess = () => setResult(request.result || []);
  });
}

export function saveRawDocument(document) {
  if (!document?.id || !document.courseId) return Promise.reject(new Error('Tài liệu cần id và courseId.'));
  return transact(['raw_documents'], 'readwrite', (tx, setResult) => {
    tx.objectStore('raw_documents').put(document);
    setResult(document);
  });
}

export function patchRawDocument(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return Promise.reject(new Error('Thiếu tài liệu hoặc dữ liệu cập nhật.'));
  return transact(['raw_documents'], 'readwrite', (tx, setResult) => {
    const store = tx.objectStore('raw_documents');
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) { tx.abort(); return; }
      const updated = { ...request.result, ...patch, updatedAt: new Date().toISOString() };
      store.put(updated);
      setResult(updated);
    };
  });
}

export function deleteRawDocument(id) {
  return transact(['raw_documents'], 'readwrite', (tx) => tx.objectStore('raw_documents').delete(id));
}

export function attachRawDocument(courseId, document) {
  if (document?.courseId !== courseId) return Promise.reject(new Error('Tài liệu không thuộc khóa học này.'));
  return transact(['courses', 'raw_documents'], 'readwrite', (tx, setResult) => {
    const courses = tx.objectStore('courses');
    const request = courses.get(courseId);
    request.onsuccess = () => {
      if (!request.result) {
        tx.abort();
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
  });
}

export function getSettings() {
  return transact(['settings'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('settings').get('app');
    request.onsuccess = () => setResult({ ...DEFAULT_SETTINGS, ...(request.result || {}) });
  });
}

export function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return Promise.reject(new Error('Thieu app settings.'));
  }
  return transact(['settings'], 'readwrite', (tx, setResult) => {
    const store = tx.objectStore('settings');
    const request = store.get('app');
    request.onsuccess = () => {
      const record = { ...DEFAULT_SETTINGS, ...(request.result || {}), ...settings, id: 'app' };
      store.put(record);
      setResult(record);
    };
  });
}

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
