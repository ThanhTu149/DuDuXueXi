import { getCourse, saveCourse } from './db.js';
import { normalizeChapters } from './contentProcessor.js';

export async function checksum(course) {
  const bytes = new TextEncoder().encode(JSON.stringify(course));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportCourse(courseId) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học.');
  const backup = { format: 'dudu-course', version: '1.0', exportedAt: new Date().toISOString(), course, checksum: await checksum(course) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${course.id}.dudu`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup;
}

export async function previewCourseBackup(file) {
  if (!file?.name?.toLowerCase().endsWith('.dudu')) throw new Error('Chỉ nhận tệp .dudu.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Tệp sao lưu vượt 100 MB.');
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { throw new Error('Tệp sao lưu không phải JSON hợp lệ.'); }
  if (backup?.format !== 'dudu-course' || backup.version !== '1.0' || !backup.course?.name || !Array.isArray(backup.course.chapters)) throw new Error('Định dạng khóa học không hợp lệ.');
  if (await checksum(backup.course) !== backup.checksum) throw new Error('Checksum không khớp. Tệp có thể đã bị thay đổi hoặc hỏng.');
  return backup.course;
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
