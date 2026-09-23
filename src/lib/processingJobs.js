import { getAllCourses, getCourse, getRawDocument, getSettings, patchRawDocument, saveCourse } from './db.js';
import { processRawDocument } from './contentProcessor.js';
import { ApiQueue } from './queue.js';

const jobs = new Map();
const launches = new Map();
const listeners = new Set();

function publish(courseId, snapshot) {
  const job = jobs.get(courseId);
  if (job) job.snapshot = { ...job.snapshot, ...snapshot };
  for (const listener of listeners) listener(courseId, job?.snapshot || snapshot);
}

async function persistStatus(courseId, status, error = '') {
  const course = await getCourse(courseId);
  if (!course?.rawDocumentId) return;
  const document = await getRawDocument(course.rawDocumentId);
  if (document) await patchRawDocument(document.id, { status, processingError: error });
  await saveCourse({ ...course, status: status === 'processed' ? 'review' : ['processing', 'paused'].includes(status) ? status : 'has-raw' });
}

export function subscribeProcessingJobs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProcessingJob(courseId) {
  return jobs.get(courseId)?.snapshot || null;
}

export function getActiveProcessingJobs() {
  return [...jobs.values()].map((job) => job.snapshot).filter((snapshot) => ['processing', 'paused'].includes(snapshot.state));
}

export function startProcessingJob(courseId, options = {}) {
  const existing = jobs.get(courseId);
  if (existing && ['processing', 'paused'].includes(existing.snapshot.state)) return existing.promise;
  if (launches.has(courseId)) return launches.get(courseId);
  const launch = beginProcessingJob(courseId, options);
  launches.set(courseId, launch);
  launch.finally(() => { if (launches.get(courseId) === launch) launches.delete(courseId); }).catch(() => {});
  return launch;
}

async function beginProcessingJob(courseId, { customInstruction, queue } = {}) {
  const course = await getCourse(courseId);
  if (!course?.rawDocumentId) throw new Error('Khóa học chưa có tài liệu để xử lý.');
  const document = await getRawDocument(course.rawDocumentId);
  if (!document) throw new Error('Không tìm thấy tài liệu đã nhập.');
  const settings = await getSettings();
  if (!settings.geminiApiKey) throw new Error('Chưa có Gemini API key. Hãy thêm trong Hồ sơ > Cài đặt.');
  const instruction = customInstruction ?? document.customInstruction ?? '';
  const controller = new AbortController();
  const apiQueue = queue || new ApiQueue();
  const results = Object.values(document.generated || {});
  const completed = results.filter((item) => item.output).length;
  const failed = results.filter((item) => item.error && !item.output).length;
  const processed = completed + failed;
  const job = {
    controller,
    queue: apiQueue,
    snapshot: { courseId, courseName: course.name, state: 'processing', current: processed, completed, failed, total: document.chunks.length, message: `Đã lưu ${completed} đoạn${failed ? ` · ${failed} đoạn lỗi sẽ thử lại` : ''}`, error: '' },
    promise: null,
  };
  jobs.set(courseId, job);
  publish(courseId, {});
  job.promise = (async () => {
    try {
      const run = async () => {
        const latestCourse = await getCourse(courseId);
        await patchRawDocument(document.id, { status: 'processing', processingError: '', customInstruction: instruction });
        await saveCourse({ ...latestCourse, status: 'processing' });
        return processRawDocument({
          rawDocumentId: document.id,
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          customInstruction: instruction,
          signal: controller.signal,
          queue: apiQueue,
          onProgress: (info) => publish(courseId, { ...info, state: apiQueue.paused ? 'paused' : 'processing' }),
        });
      };
      if (navigator.locks?.request) {
        await navigator.locks.request(`dudu-process-${document.id}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            publish(courseId, { state: 'elsewhere', message: 'Tài liệu đang được xử lý ở tab khác.' });
            return;
          }
          await run();
        });
      } else await run();
      if (job.snapshot.state !== 'elsewhere') publish(courseId, { state: 'completed', current: document.chunks.length, message: 'Đã tạo xong bản nháp. Hãy duyệt nội dung.' });
    } catch (error) {
      const cancelled = controller.signal.aborted || error.name === 'AbortError';
      const message = cancelled ? 'Đã hủy; các đoạn hoàn tất vẫn được giữ.' : error.message;
      await persistStatus(courseId, cancelled ? 'cancelled' : 'failed', cancelled ? '' : message);
      publish(courseId, { state: cancelled ? 'cancelled' : 'error', error: cancelled ? '' : message, message });
    } finally {
      if (jobs.get(courseId) === job) jobs.delete(courseId);
    }
  })();
  return job.promise;
}

export async function pauseProcessingJob(courseId) {
  const job = jobs.get(courseId);
  if (!job || job.snapshot.state !== 'processing') return;
  job.queue.pause();
  publish(courseId, { state: 'paused', message: 'Đã tạm dừng sau request đang chạy.' });
  await persistStatus(courseId, 'paused');
}

export async function resumeProcessingJob(courseId) {
  const job = jobs.get(courseId);
  if (!job) return startProcessingJob(courseId);
  job.queue.resume();
  publish(courseId, { state: 'processing', message: 'Đang tiếp tục xử lý.' });
  await persistStatus(courseId, 'processing');
  return job.promise;
}

export function cancelProcessingJob(courseId) {
  const job = jobs.get(courseId);
  if (!job) return;
  job.controller.abort();
  job.queue.cancel();
  publish(courseId, { state: 'cancelled', message: 'Đang hủy request...' });
}

export async function resumeInterruptedJobs() {
  const courses = await getAllCourses();
  for (const course of courses) {
    if (!course.rawDocumentId || jobs.has(course.id)) continue;
    const document = await getRawDocument(course.rawDocumentId);
    if (document?.status === 'processing') startProcessingJob(course.id).catch(() => {});
  }
}
