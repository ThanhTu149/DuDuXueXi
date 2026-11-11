/**
 * Test storage resilience — chạy thuần node, không cần trình duyệt:
 *   node scripts/test-storage-resilience.mjs
 *
 * Kiểm tra: ghi khi đầy bộ nhớ (quota), JSON hỏng, schema version, validate/merge,
 * chống prototype pollution và đồng bộ giữa các tab qua BroadcastChannel.
 */

import assert from 'node:assert/strict';
import {
  PROGRESS_STORAGE_KEY,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_SYNC_CHANNEL,
  StorageError,
  clearProgress,
  createCrossTabChannel,
  estimateLocalStorageBytes,
  isStorageAvailable,
  mergeProgressData,
  readLocalJson,
  readProgress,
  sanitizeDeep,
  subscribeStorageChanges,
  validateProgress,
  writeLocalJsonSafe,
  writeLocalValue,
  writeProgress,
} from '../src/lib/storage.js';

class FakeStorage {
  constructor({ quotaBytes = Infinity } = {}) {
    this.map = new Map();
    this.quotaBytes = quotaBytes;
  }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    const next = String(value);
    const previous = (this.map.get(key) || '').length;
    const total = this.bytes() - previous * 2 + next.length * 2;
    if (total > this.quotaBytes) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      error.code = 22;
      throw error;
    }
    this.map.set(key, next);
  }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  bytes() {
    let total = 0;
    for (const [key, value] of this.map) total += (key.length + value.length) * 2;
    return total;
  }
}

const storage = new FakeStorage();
globalThis.localStorage = storage;

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Ghi/đọc JSON bình thường.
const write = writeLocalJsonSafe('demo-key', { hello: 'xin chào' });
assert.equal(write.ok, true);
assert.deepEqual(readLocalJson('demo-key', null), { hello: 'xin chào' });
assert.equal(isStorageAvailable(), true);
assert.ok(estimateLocalStorageBytes() > 0);

// 2. Đầy bộ nhớ: không throw, trả lỗi 'quota' kèm thông điệp tiếng Việt.
globalThis.localStorage = new FakeStorage({ quotaBytes: 120 });
const progressTooBig = { xp: 5, notes: { big: 'x'.repeat(400) } };
const quotaWrite = writeProgress(progressTooBig);
assert.equal(quotaWrite.ok, false);
assert.ok(quotaWrite.error instanceof StorageError);
assert.equal(quotaWrite.error.code, 'quota');
assert.match(quotaWrite.error.userMessage, /đầy/i);
assert.equal(writeLocalValue('small', 'ok'), true);
assert.equal(writeLocalValue('too-big', 'y'.repeat(500)), false);

// 3. localStorage bị chặn (ẩn danh / chính sách): trả 'unavailable', không throw.
globalThis.localStorage = null;
const unavailable = writeProgress({ xp: 1 });
assert.equal(unavailable.ok, false);
assert.equal(unavailable.error.code, 'unavailable');
assert.equal(readProgress().progress, null);
assert.equal(readProgress().error.code, 'unavailable');
globalThis.localStorage = storage;

// 4. JSON hỏng: bỏ qua an toàn, báo corrupt thay vì reset âm thầm.
storage.setItem(PROGRESS_STORAGE_KEY, '{not json');
const corrupt = readProgress();
assert.equal(corrupt.corrupt, true);
assert.equal(corrupt.progress, null);
assert.equal(corrupt.error.code, 'invalid');
assert.match(corrupt.error.userMessage, /hỏng/i);

// 5. Schema version: progress cũ (v1) được nâng cấp lên v2, có _savedAt khi ghi.
storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ xp: 12, streak: 2, bookmarks: ['a'] }));
const migrated = readProgress();
assert.equal(migrated.ok, true);
assert.equal(migrated.migrated, true);
assert.equal(migrated.from, 1);
assert.equal(migrated.progress._schemaVersion, PROGRESS_SCHEMA_VERSION);
assert.equal(migrated.progress.xp, 12);
const saved = writeProgress(migrated.progress);
assert.equal(saved.ok, true);
assert.ok(Date.parse(saved.savedAt) > 0);
const reread = readProgress();
assert.equal(reread.migrated, false);
assert.equal(reread.progress._schemaVersion, PROGRESS_SCHEMA_VERSION);

// 6. Validate/sửa dữ liệu sai kiểu.
const repaired = validateProgress({ xp: 'không phải số', bookmarks: 'sai', baiProgress: null, accuracy: 5 });
assert.equal(repaired.ok, true);
assert.ok(repaired.issues.length >= 2);
assert.deepEqual(repaired.progress.bookmarks, []);
assert.deepEqual(repaired.progress.baiProgress, {});
assert.deepEqual(repaired.progress.accuracy, {});
assert.equal(validateProgress([]).ok, false);

// 7. Chống prototype pollution ở mọi tầng.
const polluted = JSON.parse('{"xp":1,"__proto__":{"polluted":true},"nested":{"constructor":{"prototype":{"pollutedToo":true}}}}');
const sanitized = sanitizeDeep(polluted);
assert.equal({}.polluted, undefined);
assert.equal({}.pollutedToo, undefined);
assert.deepEqual(Object.keys(sanitized), ['xp', 'nested']);
storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(polluted));
const safeRead = readProgress();
assert.equal({}.polluted, undefined);
assert.equal(Object.prototype.polluted, undefined);
assert.equal(safeRead.progress.xp, 1);
assert.equal(Object.prototype.hasOwnProperty.call(safeRead.progress, '__proto__'), false);

// 8. Merge khi hai tab cùng ghi: mảng tích luỹ được hợp nhất, bản mới thắng.
const older = { xp: 10, bookmarks: ['a'], achievements: ['x'], _savedAt: '2024-01-01T00:00:00.000Z' };
const newer = { xp: 20, bookmarks: ['b'], achievements: ['x', 'y'], _savedAt: '2024-01-02T00:00:00.000Z' };
const merged = mergeProgressData(older, newer);
assert.equal(merged.xp, 20);
assert.deepEqual([...merged.bookmarks].sort(), ['a', 'b']);
assert.deepEqual([...merged.achievements].sort(), ['x', 'y']);

// 9. Đồng bộ giữa tab: writeProgress phát thông báo, tab khác nhận được.
// (Mỗi tab thật có TAB_ID riêng; trong test giả lập tab khác bằng tabId khác.)
const foreign = createCrossTabChannel(PROGRESS_SYNC_CHANNEL, { tabId: 'other-tab' });
const received = [];
const unsubscribeForeign = foreign.subscribe((message) => received.push(message));
assert.equal(writeProgress({ xp: 33, _savedAt: '2024-02-02T00:00:00.000Z' }).ok, true);
await tick(100);
assert.equal(received.length, 1);
assert.equal(received[0].type, 'progress-saved');
assert.equal(received[0].key, PROGRESS_STORAGE_KEY);
unsubscribeForeign();

// 10. subscribeStorageChanges nhận thay đổi từ tab khác qua kênh.
const changes = [];
const unsubscribeChanges = subscribeStorageChanges((change) => changes.push(change));
foreign.post({ type: 'progress-saved', key: PROGRESS_STORAGE_KEY, savedAt: '2024-03-03T00:00:00.000Z' });
await tick(100);
assert.equal(changes.length, 1);
assert.equal(changes[0].source, 'channel');
unsubscribeChanges();

// 11. Xoá progress.
clearProgress();
assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null);

foreign.close();
console.log('OK storage resilience: quota, JSON hỏng, schema v1→v2, merge, chống prototype pollution, đồng bộ tab.');
