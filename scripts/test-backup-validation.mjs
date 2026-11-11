/**
 * Test sao lưu/nhập khóa học .dudu:
 *   node scripts/test-backup-validation.mjs
 *
 * Kiểm tra validate schema, checksum, lỗi tiếng Việt rõ ràng và chống
 * prototype pollution khi nhập JSON từ bên ngoài. Không cần trình duyệt:
 * crypto.subtle có sẵn trong node >= 19.
 */

import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  checksum,
  previewCourseBackup,
  validateCourseBackup,
} from '../src/lib/courseBackup.js';
import { sanitizeDeep } from '../src/lib/storage.js';

function makeChapter(id = 'bai01', title = 'Bài 1') {
  return {
    id,
    index: 1,
    title_zh: '你好',
    title_vi: title,
    glossary: { metadata: { bai: 1 }, entries: [{ id: `${id}_w001`, word_zh: '你好', pinyin: 'nǐ hǎo', meaning_vi: 'xin chào' }] },
    quiz: { metadata: { bai: 1 }, questions: [{ id: `${id}_q001`, question_vi: '你好 là gì?', options: [{ id: 'A', text: 'Xin chào' }], correct_option: 'A' }] },
  };
}

function makeCourse(name = 'Khóa thử') {
  return {
    id: 'course-1',
    name,
    description: 'Mô tả',
    type: 'imported',
    chapters: [makeChapter()],
  };
}

async function makeFile(course, { overrides = {}, checksumValue = undefined, rawText = null, name = 'khoa-hoc.dudu', size = undefined } = {}) {
  const clean = sanitizeDeep(course);
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2024-01-01T00:00:00.000Z',
    course: clean,
    checksum: checksumValue ?? await checksum(clean),
    ...overrides,
  };
  const text = rawText ?? JSON.stringify(backup, null, 2);
  return { name, size: size ?? text.length, text: async () => text, backup, textValue: text };
}

// 1. Tệp hợp lệ: đọc được, chapters được chuẩn hoá mảng.
const validFile = await makeFile(makeCourse());
const course = await previewCourseBackup(validFile);
assert.equal(course.name, 'Khóa thử');
assert.equal(course.chapters.length, 1);
assert.equal(course.chapters[0].glossary.entries.length, 1);
assert.equal(course.chapters[0].quiz.questions.length, 1);

// 2. Từ chối sai loại tệp / quá lớn / JSON hỏng.
await assert.rejects(previewCourseBackup({ name: 'a.txt', size: 10, text: async () => '{}' }), /Chỉ nhận tệp \.dudu/);
await assert.rejects(previewCourseBackup({ name: 'a.dudu', size: MAX_BACKUP_BYTES + 1, text: async () => '{}' }), /100 MB/);
await assert.rejects(previewCourseBackup({ name: 'a.dudu', size: 10, text: async () => 'không phải json' }), /không phải JSON hợp lệ/);
await assert.rejects(previewCourseBackup({ name: 'a.dudu', size: 10, text: async () => '' }), /rỗng/);
await assert.rejects(previewCourseBackup(null), /Chỉ nhận tệp \.dudu/);

// 3. Checksum: tệp bị sửa nội dung phải bị từ chối.
const tampered = await makeFile(makeCourse());
const tamperedText = tampered.textValue.replace('Khóa thử', 'Khóa đã bị sửa');
await assert.rejects(
  previewCourseBackup({ name: 'a.dudu', size: tamperedText.length, text: async () => tamperedText }),
  /Checksum không khớp/,
);
// Checksum rác (không phải hex) cũng phải báo lỗi Checksum, không phải lỗi schema.
const badChecksumText = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, course: makeCourse(), checksum: 'bad' });
await assert.rejects(
  previewCourseBackup({ name: 'a.dudu', size: badChecksumText.length, text: async () => badChecksumText }),
  /Checksum/,
);

// 4. Format/version/schema sai → lỗi tiếng Việt rõ ràng.
await assert.rejects(previewCourseBackup(await makeFile(makeCourse(), { overrides: { format: 'other' } })), /không phải bản sao lưu khóa học/);
await assert.rejects(previewCourseBackup(await makeFile(makeCourse(), { overrides: { version: '2.0' } })), /Phiên bản sao lưu không được hỗ trợ/);
const missingChapters = await makeFile(makeCourse(), { overrides: { course: { name: 'Không chương' } } });
await assert.rejects(previewCourseBackup(missingChapters), /thiếu danh sách chapters/);
const badChapter = await makeFile(makeCourse());
badChapter.backup.course.chapters[0].glossary = null;
const badChapterText = JSON.stringify(badChapter.backup);
await assert.rejects(
  previewCourseBackup({ name: 'a.dudu', size: badChapterText.length, text: async () => badChapterText }),
  /Chương 1 thiếu glossary\.entries/,
);
const duplicate = await makeFile(makeCourse());
duplicate.backup.course.chapters.push(makeChapter('bai01', 'Bài trùng'));
const duplicateText = JSON.stringify(duplicate.backup);
await assert.rejects(
  previewCourseBackup({ name: 'a.dudu', size: duplicateText.length, text: async () => duplicateText }),
  /trùng id/,
);

// 5. Validate trực tiếp trả đủ danh sách lỗi thay vì throw.
const invalidBackup = { format: 'x', version: '9', course: { name: '', chapters: 'sai' }, checksum: 'abc' };
const validation = validateCourseBackup(invalidBackup);
assert.equal(validation.ok, false);
assert.ok(validation.errors.length >= 4);
assert.equal(validateCourseBackup({ format: BACKUP_FORMAT, version: BACKUP_VERSION, course: makeCourse(), checksum: await checksum(makeCourse()) }).ok, true);

// 6. Chống prototype pollution khi nhập tệp .dudu.
const baseCourse = makeCourse();
const pollutedCourse = JSON.parse(`{
  "id": "course-1",
  "name": "Khóa thử",
  "chapters": ${JSON.stringify(baseCourse.chapters)},
  "__proto__": { "polluted": true },
  "settings": { "constructor": { "prototype": { "pollutedNested": true } } }
}`);
// JSON.parse tạo own property "__proto__"; JSON.stringify vẫn giữ nó trong chuỗi.
const pollutedBackupText = JSON.stringify({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  course: pollutedCourse,
  checksum: await checksum(sanitizeDeep(pollutedCourse)),
});
assert.match(pollutedBackupText, /__proto__/);
const safeCourse = await previewCourseBackup({ name: 'a.dudu', size: pollutedBackupText.length, text: async () => pollutedBackupText });
assert.equal({}.polluted, undefined);
assert.equal(Object.prototype.polluted, undefined);
assert.equal({}.pollutedNested, undefined);
assert.equal(Object.prototype.pollutedNested, undefined);
assert.equal(Object.prototype.hasOwnProperty.call(safeCourse, '__proto__'), false);
assert.equal(safeCourse.name, 'Khóa thử');
assert.equal(Object.getPrototypeOf(safeCourse), Object.prototype);

// 7. checksum ổn định và phụ thuộc nội dung.
const courseA = makeCourse('Khóa A');
const courseB = makeCourse('Khóa B');
const digestA = await checksum(courseA);
assert.equal(digestA, await checksum(courseA));
assert.notEqual(digestA, await checksum(courseB));
assert.match(digestA, /^[0-9a-f]{64}$/);

console.log('OK backup validation: schema, checksum, lỗi tiếng Việt, chống prototype pollution.');
