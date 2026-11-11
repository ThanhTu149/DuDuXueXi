/**
 * Test schema/migration ladder + lỗi có phân loại của IndexedDB:
 *   node scripts/test-db-schema.mjs
 *
 * Không cần trình duyệt: hàm nâng cấp schema được kiểm tra bằng object giả,
 * còn lỗi "trình duyệt không hỗ trợ IndexedDB" được kiểm tra ngay trong node
 * (node không có indexedDB).
 */

import assert from 'node:assert/strict';
import {
  DB_ERROR_CODES,
  DB_SYNC_CHANNEL,
  DB_VERSION,
  DbError,
  broadcastDbChange,
  getCourse,
  getProgress,
  getRawDocument,
  initDB,
  isDbError,
  runSchemaUpgrade,
  saveCourse,
  subscribeDbChanges,
} from '../src/lib/db.js';
import { createCrossTabChannel } from '../src/lib/storage.js';

// 1. Version schema hiện tại + mã lỗi có phân loại.
assert.equal(DB_VERSION, 3);
assert.equal(DB_ERROR_CODES.quota, 'quota');
const quotaError = new DbError('quota');
assert.ok(quotaError instanceof Error);
assert.equal(quotaError.code, 'quota');
assert.match(quotaError.userMessage, /đầy/i);
assert.equal(isDbError(quotaError, 'quota'), true);
assert.equal(isDbError(quotaError, 'blocked'), false);
assert.equal(isDbError(new Error('x')), false);
assert.match(new DbError('blocked').userMessage, /tab|cửa sổ/i);

// 2. Môi trường node không có indexedDB → DbError('unsupported'), không treo.
await assert.rejects(initDB(), (error) => isDbError(error, 'unsupported'));
// Các hàm có short-circuit không cần DB vẫn trả null.
assert.equal(await getCourse(''), null);
assert.equal(await getProgress(''), null);
assert.equal(await getRawDocument(''), null);
// Validate saveCourse chạy trước khi mở DB.
await assert.rejects(saveCourse({}), (error) => isDbError(error, 'invalid'));

/* ------------------------------------------------------------------ */
/* Fake IndexedDB để kiểm tra "thang" nâng cấp schema                 */
/* ------------------------------------------------------------------ */

function fakeStore() {
  const indexes = new Map();
  return {
    indexes,
    indexNames: { contains: (name) => indexes.has(name) },
    createIndex(name, keyPath) { indexes.set(name, keyPath); },
    put() {},
    get() {},
  };
}

function fakeDatabase(initialStores = []) {
  const stores = new Map();
  for (const name of initialStores) stores.set(name, fakeStore());
  return {
    stores,
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      const store = fakeStore();
      stores.set(name, store);
      return store;
    },
  };
}

// 3. DB mới (oldVersion 0): tạo đủ 4 store + index + meta.
const fresh = fakeDatabase();
const freshTransaction = { objectStore: (name) => fresh.stores.get(name) };
const freshResult = runSchemaUpgrade(fresh, 0, freshTransaction);
assert.deepEqual([...fresh.stores.keys()].sort(), ['courses', 'meta', 'progress', 'raw_documents', 'settings']);
assert.deepEqual(freshResult.created.sort(), ['courses', 'meta', 'progress', 'raw_documents', 'settings']);
assert.equal(freshResult.from, 0);
assert.equal(freshResult.version, 3);
assert.equal(fresh.stores.get('raw_documents').indexNames.contains('courseId'), true);

// 4. DB v2 đang có sẵn: chỉ thêm meta, không tạo lại store cũ.
const fromV2 = fakeDatabase(['courses', 'progress', 'settings', 'raw_documents']);
const v2Transaction = { objectStore: (name) => fromV2.stores.get(name) };
const v2Result = runSchemaUpgrade(fromV2, 2, v2Transaction);
assert.deepEqual(v2Result.created, ['meta']);
assert.equal(fromV2.stores.get('raw_documents').indexNames.contains('courseId'), true); // index được "chữa lành"

// 5. DB v1: thêm raw_documents + meta.
const fromV1 = fakeDatabase(['courses', 'progress', 'settings']);
const v1Transaction = { objectStore: (name) => fromV1.stores.get(name) };
const v1Result = runSchemaUpgrade(fromV1, 1, v1Transaction);
assert.deepEqual(v1Result.created.sort(), ['meta', 'raw_documents']);
assert.equal(fromV1.stores.get('raw_documents').indexNames.contains('courseId'), true);

// 6. DB đã là v3: không tạo gì thêm (idempotent).
const fromV3 = fakeDatabase(['courses', 'progress', 'settings', 'raw_documents', 'meta']);
const v3Result = runSchemaUpgrade(fromV3, 3, { objectStore: (name) => fromV3.stores.get(name) });
assert.deepEqual(v3Result.created, []);

// 7. Đồng bộ thay đổi dữ liệu giữa các tab.
const foreign = createCrossTabChannel(DB_SYNC_CHANNEL, { tabId: 'tab-khac' });
const messages = [];
const unsubscribeForeign = foreign.subscribe((message) => messages.push(message));
const unsubscribeDb = subscribeDbChanges(() => {});
broadcastDbChange({ type: 'course-changed', courseId: 'course-1', store: 'courses' });
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(messages.length, 1);
assert.equal(messages[0].type, 'course-changed');
assert.equal(messages[0].courseId, 'course-1');
assert.equal(messages[0].store, 'courses');
unsubscribeDb();
unsubscribeForeign();
foreign.close();

console.log('OK db schema: version 3, thang nâng cấp v1/v2→v3, lỗi có code, đồng bộ tab.');
