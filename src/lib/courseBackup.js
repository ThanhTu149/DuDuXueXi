/**
 * courseBackup.js — xuất/nhập khóa học dạng tệp .dudu.
 *
 * Bản này tăng độ tin cậy khi nhập tệp:
 *  - Validate schema đầy đủ (format/version/course/chapters/glossary/quiz), báo lỗi
 *    tiếng Việt rõ ràng thay vì để app crash vì dữ liệu hỏng.
 *  - Chống prototype pollution: mọi JSON nhập đều qua safeJsonParse + sanitizeDeep,
 *    loại bỏ __proto__/constructor/prototype ở mọi cấp.
 *  - Checksum SHA-256 vẫn được kiểm tra như cũ; checksum được tính trên dữ liệu đã
 *    sanitize nên tệp bị chỉnh sửa sẽ bị từ chối.
 *
 * Giữ nguyên export cũ: checksum, exportCourse, previewCourseBackup, importCourse, mergeCourses.
 */

import { getCourse, saveCourse } from './db.js';
import { normalizeChapters } from './contentProcessor.js';
import { safeJsonParse, sanitizeDeep } from './storage.js';

export const BACKUP_FORMAT = 'dudu-course';
export const BACKUP_VERSION = '1.0';
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Kiểm tra nhanh một chương có cấu trúc tối thiểu để app hiển thị được. */
function chapterErrors(chapter, index) {
  const prefix = `Chương ${index + 1}`;
  const errors = [];
  if (!isPlainObject(chapter)) return [`${prefix} không phải object.`];
  if (!isNonEmptyString(chapter.id)) errors.push(`${prefix} thiếu id.`);
  if (chapter.title_zh !== undefined && typeof chapter.title_zh !== 'string') errors.push(`${prefix} có title_zh không phải chuỗi.`);
  if (chapter.title_vi !== undefined && typeof chapter.title_vi !== 'string') errors.push(`${prefix} có title_vi không phải chuỗi.`);
  if (!isPlainObject(chapter.glossary) || !Array.isArray(chapter.glossary.entries)) {
    errors.push(`${prefix} thiếu glossary.entries (mảng).`);
  }
  if (!isPlainObject(chapter.quiz) || !Array.isArray(chapter.quiz.questions)) {
    errors.push(`${prefix} thiếu quiz.questions (mảng).`);
  }
  if (chapter.quiz?.questions && Array.isArray(chapter.quiz.questions)) {
    for (const [questionIndex, question] of chapter.quiz.questions.entries()) {
      if (!isPlainObject(question)) {
        errors.push(`${prefix}: câu hỏi ${questionIndex + 1} không hợp lệ.`);
        continue;
      }
      if (question.options !== undefined && !Array.isArray(question.options)) {
        errors.push(`${prefix}: câu hỏi ${questionIndex + 1} có options không phải mảng.`);
      }
    }
  }
  return errors;
}

/**
 * Validate một object backup (đã parse + sanitize).
 * Trả về `{ ok, errors }` — không throw, để UI hiển thị đủ lỗi.
 */
export function validateCourseBackup(backup) {
  const errors = [];
  if (!isPlainObject(backup)) return { ok: false, errors: ['Tệp sao lưu không phải JSON object.'] };
  if (backup.format !== BACKUP_FORMAT) errors.push('Tệp không phải bản sao lưu khóa học DuDu (.dudu).');
  if (typeof backup.version !== 'string' || !/^1(?:\.\d+)?$/.test(backup.version)) {
    errors.push(`Phiên bản sao lưu không được hỗ trợ (cần 1.x, nhận "${backup.version ?? 'không có'}").`);
  }
  const course = backup.course;
  if (!isPlainObject(course)) {
    errors.push('Tệp sao lưu thiếu dữ liệu khóa học.');
    return { ok: false, errors };
  }
  if (!isNonEmptyString(course.name)) errors.push('Khóa học thiếu tên.');
  if (!Array.isArray(course.chapters)) errors.push('Khóa học thiếu danh sách chapters.');
  if (Array.isArray(course.chapters)) {
    course.chapters.forEach((chapter, index) => errors.push(...chapterErrors(chapter, index)));
    const ids = course.chapters.map((chapter) => (isPlainObject(chapter) ? chapter.id : null)).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push('Các chương bị trùng id.');
  }
  if (typeof backup.checksum !== 'string' || !backup.checksum) {
    errors.push('Tệp sao lưu thiếu checksum.');
  }
  return { ok: errors.length === 0, errors };
}

function readBackupText(file) {
  if (!file || typeof file.text !== 'function') return Promise.reject(new Error('Không đọc được tệp sao lưu.'));
  return file.text();
}

export async function checksum(course) {
  const bytes = new TextEncoder().encode(JSON.stringify(course));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportCourse(courseId) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học.');
  const cleanCourse = sanitizeDeep(course);
  const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), course: cleanCourse, checksum: await checksum(cleanCourse) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${course.id}.dudu`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup;
}

/**
 * Đọc và kiểm tra tệp .dudu trước khi nhập.
 * Ném lỗi tiếng Việt rõ ràng; trả về course đã sanitize.
 */
export async function previewCourseBackup(file) {
  if (!file?.name?.toLowerCase().endsWith('.dudu')) throw new Error('Chỉ nhận tệp .dudu.');
  if (typeof file.size === 'number' && file.size > MAX_BACKUP_BYTES) throw new Error('Tệp sao lưu vượt 100 MB.');
  let text;
  try {
    text = await readBackupText(file);
  } catch {
    throw new Error('Không đọc được tệp sao lưu. Hãy chọn lại tệp .dudu.');
  }
  if (typeof text !== 'string' || !text.trim()) throw new Error('Tệp sao lưu rỗng.');
  // Giới hạn cả theo kích thước nội dung (một số trình duyệt không trả file.size).
  if (text.length * 2 > MAX_BACKUP_BYTES) throw new Error('Tệp sao lưu vượt 100 MB.');
  const parsed = safeJsonParse(text, null);
  if (!isPlainObject(parsed)) throw new Error('Tệp sao lưu không phải JSON hợp lệ.');
  const backup = sanitizeDeep(parsed);
  const validation = validateCourseBackup(backup);
  if (!validation.ok) throw new Error(validation.errors[0]);
  const course = backup.course;
  const actual = await checksum(course);
  if (actual !== String(backup.checksum).toLowerCase()) {
    throw new Error('Checksum không khớp. Tệp có thể đã bị thay đổi hoặc hỏng — hãy xuất lại bản sao lưu rồi thử lại.');
  }
  // Đảm bảo các mảng mà UI luôn dùng tới đều tồn tại.
  course.chapters = course.chapters.map((chapter, index) => ({
    ...chapter,
    index: Number.isFinite(chapter.index) ? chapter.index : index + 1,
    glossary: { ...(chapter.glossary || {}), entries: chapter.glossary?.entries || [] },
    quiz: { ...(chapter.quiz || {}), questions: chapter.quiz?.questions || [] },
  }));
  return course;
}

export async function importCourse(file) {
  const source = await previewCourseBackup(file);
  const course = { ...source, id: `course-${crypto.randomUUID()}`, type: 'imported', rawDocumentId: null, name: `${source.name} (nhập)` };
  return saveCourse(course);
}

export async function mergeCourses(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error('Chọn hai khóa học khác nhau.');
  const [source, target] = await Promise.all([getCourse(sourceId), getCourse(targetId)]);
  if (!source || !target) throw new Error('Không tìm thấy khóa học để ghép.');
  if (!source.chapters.length || !target.chapters.length) throw new Error('Hai khóa cần có ít nhất một bài học.');
  const chapters = normalizeChapters([...source.chapters, ...target.chapters]);
  return saveCourse({ id: `course-${crypto.randomUUID()}`, name: `${source.name} + ${target.name}`, description: 'Nội dung ghép từ hai khóa học', type: 'imported', status: 'ready', rawDocumentId: null, metadata: { totalBai: chapters.length, totalEntries: chapters.reduce((sum, chapter) => sum + chapter.glossary.entries.length, 0), totalQuestions: chapters.reduce((sum, chapter) => sum + chapter.quiz.questions.length, 0) }, chapters });
}
