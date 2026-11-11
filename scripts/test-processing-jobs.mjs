/**
 * Test job persistence của pipeline xử lý tài liệu:
 *   node scripts/test-processing-jobs.mjs
 *
 * Kiểm tra snapshot job được lưu/khôi phục đúng, job bị gián đoạn được đánh dấu,
 * và hai tab không ghi đè snapshot của nhau (chống chạy trùng).
 */

import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

globalThis.localStorage = new FakeStorage();

const { TAB_ID, readLocalJson, writeLocalJsonSafe } = await import('../src/lib/storage.js');
const {
  JOB_STALE_MS,
  PROCESSING_JOBS_STORAGE_KEY,
  cancelAllProcessingJobs,
  clearPersistedProcessingJobs,
  clearProcessingSnapshot,
  getActiveProcessingJobs,
  getPersistedProcessingJobs,
  getProcessingJob,
  persistProcessingSnapshot,
} = await import('../src/lib/processingJobs.js');

// 1. Lưu snapshot job của tab hiện tại.
const saved = persistProcessingSnapshot('course-a', {
  courseName: 'Khóa A',
  state: 'processing',
  current: 2,
  completed: 2,
  failed: 0,
  total: 5,
  message: 'Đã lưu 2 đoạn',
}, { documentId: 'doc-a', tabId: TAB_ID });
assert.equal(saved, true);

let jobs = getPersistedProcessingJobs();
assert.equal(jobs.length, 1);
assert.equal(jobs[0].courseId, 'course-a');
assert.equal(jobs[0].state, 'processing');
assert.equal(jobs[0].documentId, 'doc-a');
assert.equal(jobs[0].interrupted, false);
assert.equal(jobs[0].tabId, TAB_ID);

// 2. Job không cập nhật quá lâu → interrupted để UI biết resume.
const now = Date.now();
writeLocalJsonSafe(PROCESSING_JOBS_STORAGE_KEY, {
  version: 1,
  jobs: {
    'course-stale': {
      courseName: 'Khóa cũ', state: 'processing', current: 3, completed: 3, failed: 0, total: 8,
      updatedAt: now - JOB_STALE_MS - 5000, tabId: 'tab-cu',
    },
  },
});
jobs = getPersistedProcessingJobs({ now });
assert.equal(jobs.length, 1);
assert.equal(jobs[0].state, 'interrupted');
assert.equal(jobs[0].interrupted, true);
assert.match(jobs[0].message, /gián đoạn/i);

// 3. Tab khác đang chạy: không được ghi đè/xoá snapshot của họ.
writeLocalJsonSafe(PROCESSING_JOBS_STORAGE_KEY, {
  version: 1,
  jobs: {
    'course-busy': {
      courseName: 'Khóa đang chạy', state: 'processing', current: 1, completed: 1, failed: 0, total: 4,
      updatedAt: Date.now(), tabId: 'tab-khac',
    },
  },
});
const overwritten = persistProcessingSnapshot('course-busy', {
  courseName: 'Khóa đang chạy', state: 'processing', current: 2, completed: 2, failed: 0, total: 4,
}, { documentId: 'doc-busy', tabId: TAB_ID });
assert.equal(overwritten, false);
const busy = readLocalJson(PROCESSING_JOBS_STORAGE_KEY, null).jobs['course-busy'];
assert.equal(busy.tabId, 'tab-khac');
assert.equal(busy.current, 1);
const removedForeign = clearProcessingSnapshot('course-busy');
assert.equal(removedForeign, false);
assert.ok(readLocalJson(PROCESSING_JOBS_STORAGE_KEY, null).jobs['course-busy']);

// 4. Snapshot của chính tab này được xoá bình thường.
assert.equal(clearProcessingSnapshot('course-a'), true);
assert.equal(readLocalJson(PROCESSING_JOBS_STORAGE_KEY, null)?.jobs?.['course-a'], undefined);
assert.equal(getProcessingJob('course-a'), null);
assert.deepEqual(getActiveProcessingJobs(), []);

// 5. clearPersistedProcessingJobs xoá toàn bộ.
clearPersistedProcessingJobs();
assert.equal(readLocalJson(PROCESSING_JOBS_STORAGE_KEY, null), null);

// 6. Huỷ tất cả job không có job nào cũng không throw.
assert.doesNotThrow(() => cancelAllProcessingJobs());

console.log('OK processing job persistence: snapshot, phát hiện gián đoạn, không ghi đè tab khác.');
