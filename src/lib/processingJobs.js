/**
 * processingJobs.js — quản lý job xử lý tài liệu bằng Gemini (chạy nền).
 *
 * Bổ sung so với bản cũ:
 *  - Snapshot của job được lưu vào localStorage (dudu-processing-jobs-v1) sau mỗi
 *    bước, nên khi tab bị đóng/F5 giữa chừng vẫn biết job nào bị gián đoạn.
 *  - Chống chạy trùng giữa hai tab ngay cả khi trình duyệt không có navigator.locks
 *    (dựa vào heartbeat trong localStorage).
 *  - cancelAllProcessingJobs() + getPersistedProcessingJobs() cho UI.
 *
 * Giữ nguyên export cũ: subscribeProcessingJobs, getProcessingJob,
 * getActiveProcessingJobs, startProcessingJob, pauseProcessingJob,
 * resumeProcessingJob, cancelProcessingJob, resumeInterruptedJobs.
 */

import { getAllCourses, getCourse, getRawDocument, getSettings, patchRawDocument, saveCourse } from './db.js';
import { processRawDocument } from './contentProcessor.js';
import { ApiQueue } from './queue.js';
import {
  TAB_ID,
  readLocalJson,
  removeLocalValue,
  writeLocalJsonSafe,
} from './storage.js';

export const PROCESSING_JOBS_STORAGE_KEY = 'dudu-processing-jobs-v1';
/** Job không cập nhật quá lâu thì coi như bị gián đoạn (ms). */
export const JOB_STALE_MS = 5 * 60 * 1000;
const JOB_STORE_VERSION = 1;
const TERMINAL_STATES = ['completed', 'error', 'cancelled'];

const jobs = new Map();
const launches = new Map();
const listeners = new Set();

/* ------------------------------------------------------------------ */
/* Persistence (localStorage)                                         */
/* ------------------------------------------------------------------ */

function readJobStore() {
  const raw = readLocalJson(PROCESSING_JOBS_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (raw.version !== JOB_STORE_VERSION || !raw.jobs || typeof raw.jobs !== 'object') return {};
  const clean = {};
  for (const [courseId, value] of Object.entries(raw.jobs)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    if (['__proto__', 'constructor', 'prototype'].includes(courseId)) continue;
    clean[courseId] = {
      courseId,
      courseName: typeof value.courseName === 'string' ? value.courseName : '',
      documentId: typeof value.documentId === 'string' ? value.documentId : null,
      state: typeof value.state === 'string' ? value.state : 'processing',
      current: Number(value.current) || 0,
      completed: Number(value.completed) || 0,
      failed: Number(value.failed) || 0,
      total: Number(value.total) || 0,
      message: typeof value.message === 'string' ? value.message : '',
      updatedAt: Number(value.updatedAt) || 0,
      tabId: typeof value.tabId === 'string' ? value.tabId : '',
    };
  }
  return clean;
}

function writeJobStore(records) {
  const payload = { version: JOB_STORE_VERSION, jobs: records, updatedAt: new Date().toISOString() };
  const result = writeLocalJsonSafe(PROCESSING_JOBS_STORAGE_KEY, payload);
  return result.ok;
}

/**
 * Lưu snapshot của job (gọi từ publish mỗi khi tiến độ đổi).
 * `meta.documentId` để resume biết tài liệu nào đang dở.
 * Không ghi đè record còn "tươi" của tab khác (tránh phá heartbeat của tab đang chạy).
 */
export function persistProcessingSnapshot(courseId, snapshot, meta = {}) {
  if (!courseId) return false;
  const records = readJobStore();
  const existing = records[courseId];
  if (existing && existing.tabId && existing.tabId !== TAB_ID
    && !TERMINAL_STATES.includes(existing.state)
    && Date.now() - existing.updatedAt < JOB_STALE_MS) {
    return false;
  }
  records[courseId] = {
    courseId,
    courseName: snapshot?.courseName || records[courseId]?.courseName || '',
    documentId: meta.documentId || records[courseId]?.documentId || null,
    state: snapshot?.state || 'processing',
    current: Number(snapshot?.current) || 0,
    completed: Number(snapshot?.completed) || 0,
    failed: Number(snapshot?.failed) || 0,
    total: Number(snapshot?.total) || 0,
    message: typeof snapshot?.message === 'string' ? snapshot.message : '',
    updatedAt: Date.now(),
    tabId: meta.tabId || TAB_ID,
  };
  return writeJobStore(records);
}

/** Xoá snapshot của một job (khi job kết thúc hoặc bị huỷ). */
export function clearProcessingSnapshot(courseId, { force = false } = {}) {
  const records = readJobStore();
  const record = records[courseId];
  if (!record) return true;
  // Chỉ xoá record của chính tab này, trừ khi force (dọn dữ liệu).
  if (!force && record.tabId && record.tabId !== TAB_ID) return false;
  delete records[courseId];
  return writeJobStore(records);
}

/** Xoá toàn bộ snapshot (dùng khi đặt lại dữ liệu). */
export function clearPersistedProcessingJobs() {
  return removeLocalValue(PROCESSING_JOBS_STORAGE_KEY);
}

/**
 * Đọc các job đã lưu. Job không còn cập nhật trong `staleMs` được đánh dấu
 * `interrupted` để UI biết cần chạy tiếp.
 */
export function getPersistedProcessingJobs({ now = Date.now(), staleMs = JOB_STALE_MS } = {}) {
  const records = readJobStore();
  return Object.values(records)
    .map((record) => {
      const stale = now - record.updatedAt > staleMs;
      const interrupted = !TERMINAL_STATES.includes(record.state) && stale;
      return {
        ...record,
        stale,
        interrupted,
        state: interrupted ? 'interrupted' : record.state,
        message: interrupted
          ? 'Phiên xử lý trước bị gián đoạn. Bấm tiếp tục để chạy tiếp từ đoạn đã lưu.'
          : record.message,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Job đang thực sự chạy ở một tab khác (chống 2 tab xử lý cùng tài liệu). */
function findForeignActiveJob(courseId, { now = Date.now(), staleMs = JOB_STALE_MS } = {}) {
  const record = readJobStore()[courseId];
  if (!record || record.tabId === TAB_ID) return null;
  if (TERMINAL_STATES.includes(record.state)) return null;
  if (now - record.updatedAt > staleMs) return null;
  return record;
}

/* ------------------------------------------------------------------ */
/* Publish / subscribe                                                */
/* ------------------------------------------------------------------ */

let currentDocumentId = null;

function publish(courseId, snapshot) {
  const job = jobs.get(courseId);
  if (job) job.snapshot = { ...job.snapshot, ...snapshot, updatedAt: new Date().toISOString() };
  const merged = job?.snapshot || snapshot;
  if (job && !TERMINAL_STATES.includes(merged.state)) {
    persistProcessingSnapshot(courseId, merged, { documentId: job.documentId || null });
  }
  for (const listener of listeners) {
    try {
      listener(courseId, merged);
    } catch { /* listener lỗi không được làm hỏng job */ }
  }
}

async function persistStatus(courseId, status, error = '') {
  try {
    const course = await getCourse(courseId);
    if (!course?.rawDocumentId) return;
    const document = await getRawDocument(course.rawDocumentId);
    if (document) await patchRawDocument(document.id, { status, processingError: error });
    await saveCourse({ ...course, status: status === 'processed' ? 'review' : ['processing', 'paused'].includes(status) ? status : 'has-raw' });
  } catch { /* trạng thái phụ, không được che lỗi chính của job */ }
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

/* ------------------------------------------------------------------ */
/* Điều khiển job                                                     */
/* ------------------------------------------------------------------ */

export function startProcessingJob(courseId, options = {}) {
  const existing = jobs.get(courseId);
  if (existing && ['processing', 'paused'].includes(existing.snapshot.state)) return existing.promise;
  if (launches.has(courseId)) return launches.get(courseId);
  const launch = beginProcessingJob(courseId, options);
  launches.set(courseId, launch);
  launch.finally(() => { if (launches.get(courseId) === launch) launches.delete(courseId); }).catch(() => {});
  return launch;
}

function hasWebLocks() {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
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
    documentId: document.id,
    snapshot: { courseId, courseName: course.name, state: 'processing', current: processed, completed, failed, total: document.chunks.length, message: `Đã lưu ${completed} đoạn${failed ? ` · ${failed} đoạn lỗi sẽ thử lại` : ''}`, error: '' },
    promise: null,
  };
  jobs.set(courseId, job);
  currentDocumentId = document.id;
  persistProcessingSnapshot(courseId, job.snapshot, { documentId: document.id });
  publish(courseId, {});

  job.promise = (async () => {
    try {
      // Trình duyệt không có navigator.locks: dựa vào heartbeat localStorage để
      // không hai tab cùng xử lý một tài liệu.
      if (!hasWebLocks()) {
        const foreign = findForeignActiveJob(courseId);
        if (foreign) {
          job.snapshot.state = 'elsewhere';
          publish(courseId, { state: 'elsewhere', message: 'Tài liệu đang được xử lý ở tab khác.' });
          return;
        }
      }
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
      if (hasWebLocks()) {
        await navigator.locks.request(`dudu-process-${document.id}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            job.snapshot.state = 'elsewhere';
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
      clearProcessingSnapshot(courseId);
      if (jobs.get(courseId) === job) jobs.delete(courseId);
      if (currentDocumentId === document.id) currentDocumentId = null;
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

/** Huỷ tất cả job đang chạy (dùng khi đăng xuất/đổi dữ liệu). */
export function cancelAllProcessingJobs() {
  for (const courseId of [...jobs.keys()]) cancelProcessingJob(courseId);
}

/**
 * Khôi phục các job bị gián đoạn (F5, đóng tab, trình duyệt crash).
 * Dựa vào trạng thái tài liệu trong IndexedDB + snapshot đã lưu ở localStorage.
 */
export async function resumeInterruptedJobs() {
  let courses;
  try {
    courses = await getAllCourses();
  } catch {
    return;
  }
  const knownCourseIds = new Set(courses.map((course) => course.id));
  const persisted = getPersistedProcessingJobs();
  // Dọn snapshot mồ côi (khóa học đã bị xoá).
  for (const snapshot of persisted) {
    if (!knownCourseIds.has(snapshot.courseId)) clearProcessingSnapshot(snapshot.courseId);
  }
  const interruptedIds = new Set(
    persisted
      // Chỉ nhận job đã "nguội" (tab cũ đã đóng/crash). Job còn tươi có thể đang
      // chạy ở tab khác — để navigator.locks/heartbeat xử lý, không giẫm chân.
      .filter((snapshot) => snapshot.interrupted && knownCourseIds.has(snapshot.courseId))
      .map((snapshot) => snapshot.courseId),
  );
  for (const course of courses) {
    if (!course.rawDocumentId || jobs.has(course.id) || launches.has(course.id)) continue;
    const document = await getRawDocument(course.rawDocumentId);
    if (document?.status === 'processing' || interruptedIds.has(course.id)) {
      startProcessingJob(course.id).catch(() => {});
    }
  }
}
