/**
 * cloudSync.js — điều phối tài khoản và đồng bộ offline-first giữa IndexedDB/localStorage
 * của trình duyệt với máy chủ DuDu SQLite.
 *
 * Bảo đảm:
 *  - Học viên vẫn học bình thường khi offline hoặc chạy bản tĩnh.
 *  - Khi đăng nhập/đăng ký, tiến độ và khóa học cục bộ đã học trước đó được gộp an toàn
 *    với dữ liệu trên máy chủ (không bao giờ xoá mất công sức học trước khi tạo tài khoản).
 *  - Khi mất mạng tạm thời, thay đổi được ghi vào hàng đợi cục bộ và tự động đẩy lên
 *    khi có mạng trở lại.
 */

import {
  BUILT_IN_COURSE_ID,
  getAllCourses,
  getCourse,
  getProgress,
  getRawDocument,
  getSettings,
  saveCourse,
  saveProgress,
  saveSettings,
} from './db.js';
import {
  readLocalJson,
  readProgress,
  writeLocalJsonSafe,
  writeProgress,
} from './storage.js';

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Kiểm tra tiến độ cục bộ có phải trạng thái trắng mới mở trình duyệt chưa học gì không. */
export function isPristineProgress(prog) {
  if (!isPlainObject(prog)) return true;
  if ((Number(prog.xp) || 0) > 0) return false;
  if ((Number(prog.accuracy?.total) || 0) > 0) return false;
  if ((Number(prog.bossWins) || 0) > 0) return false;
  if ((Number(prog.pomodoroSessions) || 0) > 0) return false;
  if (Array.isArray(prog.studyDates) && prog.studyDates.length > 0) return false;
  if (Array.isArray(prog.bookmarks) && prog.bookmarks.length > 0) return false;
  if (Array.isArray(prog.achievements) && prog.achievements.length > 0) return false;
  if (isPlainObject(prog.notes) && Object.keys(prog.notes).length > 0) return false;
  if (isPlainObject(prog.srs) && Object.keys(prog.srs).length > 0) return false;
  if (isPlainObject(prog.baiProgress) && Object.values(prog.baiProgress).some((b) => b?.completed || (Number(b?.quizDone) || 0) > 0)) return false;
  return true;
}

/**
 * Gộp tiến độ cục bộ và đám mây theo ngữ nghĩa học tập (không bao giờ để trình duyệt
 * mới tinh 0 XP có timestamp mới hơn ghi đè dữ liệu đã học trên đám mây).
 */
export function mergeLocalAndCloudProgress(localProg, cloudProg) {
  if (!isPlainObject(cloudProg)) return localProg ? { ...localProg } : null;
  if (!isPlainObject(localProg) || isPristineProgress(localProg)) {
    return { ...cloudProg };
  }
  if (isPristineProgress(cloudProg)) {
    return { ...localProg };
  }

  const localAt = Date.parse(localProg._savedAt || localProg.updatedAt || '') || 0;
  const cloudAt = Date.parse(cloudProg._savedAt || cloudProg._serverUpdatedAt || '') || 0;
  const newer = localAt >= cloudAt ? localProg : cloudProg;
  const older = newer === localProg ? cloudProg : localProg;

  const merged = { ...older, ...newer };

  // Hợp nhất mảng tích luỹ
  for (const field of ['achievements', 'goalRewardDates', 'bookmarks', 'studyDates']) {
    merged[field] = [...new Set([
      ...(Array.isArray(older[field]) ? older[field] : []),
      ...(Array.isArray(newer[field]) ? newer[field] : []),
    ])];
  }
  if (Array.isArray(older.unlockedBai) || Array.isArray(newer.unlockedBai)) {
    merged.unlockedBai = [...new Set([
      ...(Array.isArray(older.unlockedBai) ? older.unlockedBai : []),
      ...(Array.isArray(newer.unlockedBai) ? newer.unlockedBai : []),
    ])].sort((a, b) => Number(a) - Number(b));
  }

  // Giữ chỉ số tích luỹ cao hơn
  merged.xp = Math.max(Number(older.xp) || 0, Number(newer.xp) || 0);
  merged.bossWins = Math.max(Number(older.bossWins) || 0, Number(newer.bossWins) || 0);
  merged.streak = Math.max(Number(older.streak) || 0, Number(newer.streak) || 0);

  const oAcc = older.accuracy || { correct: 0, total: 0 };
  const nAcc = newer.accuracy || { correct: 0, total: 0 };
  merged.accuracy = (Number(nAcc.total) || 0) >= (Number(oAcc.total) || 0)
    ? { correct: Number(nAcc.correct) || 0, total: Number(nAcc.total) || 0 }
    : { correct: Number(oAcc.correct) || 0, total: Number(oAcc.total) || 0 };

  // Hợp nhất studyDays / dailyXp / weeklyXP
  const days = { ...(isPlainObject(older.studyDays) ? older.studyDays : {}) };
  for (const [date, val] of Object.entries(isPlainObject(newer.studyDays) ? newer.studyDays : {})) {
    const prev = days[date] || { xp: 0, questions: 0 };
    days[date] = {
      xp: Math.max(Number(prev.xp) || 0, Number(val?.xp) || 0),
      questions: Math.max(Number(prev.questions) || 0, Number(val?.questions) || 0),
    };
  }
  merged.studyDays = days;

  const weeks = { ...(isPlainObject(older.weeklyXP) ? older.weeklyXP : {}) };
  for (const [wk, xp] of Object.entries(isPlainObject(newer.weeklyXP) ? newer.weeklyXP : {})) {
    weeks[wk] = Math.max(Number(weeks[wk]) || 0, Number(xp) || 0);
  }
  merged.weeklyXP = weeks;

  // Hợp nhất baiProgress
  const bpKeys = new Set([
    ...Object.keys(isPlainObject(older.baiProgress) ? older.baiProgress : {}),
    ...Object.keys(isPlainObject(newer.baiProgress) ? newer.baiProgress : {}),
  ]);
  const bp = {};
  for (const key of bpKeys) {
    const o = older.baiProgress?.[key] || {};
    const n = newer.baiProgress?.[key] || {};
    const attemptedIds = [...new Set([...(Array.isArray(o.attemptedIds) ? o.attemptedIds : []), ...(Array.isArray(n.attemptedIds) ? n.attemptedIds : [])])];
    const correctIds = [...new Set([...(Array.isArray(o.correctIds) ? o.correctIds : []), ...(Array.isArray(n.correctIds) ? n.correctIds : [])])];
    bp[key] = {
      ...o,
      ...n,
      completed: Boolean(o.completed || n.completed),
      attemptedIds,
      correctIds,
      quizDone: Math.max(Number(o.quizDone) || 0, Number(n.quizDone) || 0, attemptedIds.length),
      quizCorrect: Math.max(Number(o.quizCorrect) || 0, Number(n.quizCorrect) || 0, correctIds.length),
    };
  }
  merged.baiProgress = bp;

  // Hợp nhất notes & SRS
  merged.notes = {
    ...(isPlainObject(older.notes) ? older.notes : {}),
    ...(isPlainObject(newer.notes) ? newer.notes : {}),
  };
  const srs = { ...(isPlainObject(older.srs) ? older.srs : {}) };
  for (const [id, entry] of Object.entries(isPlainObject(newer.srs) ? newer.srs : {})) {
    const prev = srs[id];
    if (!prev || String(entry?.lastReview || '') >= String(prev?.lastReview || '')) srs[id] = entry;
  }
  merged.srs = srs;
  merged._savedAt = new Date(Math.max(localAt, cloudAt, Date.now())).toISOString();
  return merged;
}
import {
  deleteCloudCourse,
  fetchSyncBootstrap,
  loginAccount,
  logoutAccount,
  probeSession,
  pushCloudCourse,
  pushCloudProgress,
  pushCloudRawDocument,
  pushCloudSettings,
  pushStudyEvent,
  registerAccount,
  updateAccountProfile,
} from './apiClient.js';

const PENDING_QUEUE_KEY = 'dudu-cloud-pending-v1';

const state = {
  initialized: false,
  serverAvailable: false,
  authenticated: false,
  user: null,
  serverInfo: null,
  syncState: 'local', // 'local' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
  lastSyncedAt: null,
  lastError: '',
  pendingCount: 0,
  analytics: null,
};

const listeners = new Set();
const progressTimers = new Map();
let syncInFlight = null;

function readPendingQueue() {
  const raw = readLocalJson(PENDING_QUEUE_KEY, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { progressIds: [], courseIds: [], deletedCourseIds: [], settingsDirty: false };
  }
  return {
    progressIds: Array.isArray(raw.progressIds) ? [...new Set(raw.progressIds)] : [],
    courseIds: Array.isArray(raw.courseIds) ? [...new Set(raw.courseIds)] : [],
    deletedCourseIds: Array.isArray(raw.deletedCourseIds) ? [...new Set(raw.deletedCourseIds)] : [],
    settingsDirty: Boolean(raw.settingsDirty),
  };
}

function writePendingQueue(queue) {
  writeLocalJsonSafe(PENDING_QUEUE_KEY, queue);
  const count = queue.progressIds.length + queue.courseIds.length + queue.deletedCourseIds.length + (queue.settingsDirty ? 1 : 0);
  setState({ pendingCount: count });
}

function emit() {
  const snapshot = getCloudState();
  for (const listener of [...listeners]) {
    try {
      listener(snapshot);
    } catch { /* bỏ qua lỗi listener */ }
  }
}

function setState(patch) {
  Object.assign(state, patch);
  emit();
}

export function getCloudState() {
  return {
    ...state,
    user: state.user ? { ...state.user } : null,
    serverInfo: state.serverInfo ? { ...state.serverInfo } : null,
  };
}

export function subscribeCloudState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshServerInfo(patch) {
  setState({ serverInfo: { ...(state.serverInfo || {}), ...patch } });
}

/** Khởi tạo trạng thái kết nối backend khi mở app. */
export async function initCloudSession({ onCloudDataApplied } = {}) {
  const probe = await probeSession();
  const pending = readPendingQueue();
  const pendingCount = pending.progressIds.length + pending.courseIds.length + pending.deletedCourseIds.length + (pending.settingsDirty ? 1 : 0);

  setState({
    initialized: true,
    serverAvailable: probe.serverAvailable,
    authenticated: probe.authenticated,
    user: probe.user,
    serverInfo: probe.server,
    pendingCount,
    syncState: !probe.serverAvailable ? 'local' : probe.authenticated ? 'idle' : 'local',
    lastError: '',
  });

  if (probe.serverAvailable && probe.authenticated) {
    await syncAllWithCloud({ onCloudDataApplied });
  }
  return getCloudState();
}

/**
 * Đồng bộ 2 chiều đầy đủ (bootstrap + gộp dữ liệu cục bộ/đám mây + đẩy hàng đợi).
 */
export async function syncAllWithCloud({ onCloudDataApplied } = {}) {
  if (!state.authenticated || !state.serverAvailable) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ syncState: 'offline' });
    return null;
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    setState({ syncState: 'syncing', lastError: '' });
    try {
      // 1. Xử lý các khóa học đã xóa lúc offline trước khi kéo danh sách từ server
      const pending = readPendingQueue();
      for (const deletedId of [...pending.deletedCourseIds]) {
        try {
          await deleteCloudCourse(deletedId);
        } catch (error) {
          if (error?.status !== 404) throw error;
        }
        pending.deletedCourseIds = pending.deletedCourseIds.filter((id) => id !== deletedId);
      }

      // 2. Lấy toàn bộ dữ liệu từ server
      const boot = await fetchSyncBootstrap();
      const cloudCourseMap = new Map((boot.courses || []).map((course) => [course.id, course]));

      // 3. Kéo khóa học từ server về IndexedDB nếu mới hơn hoặc chưa có ở máy này
      const localSummaries = await getAllCourses();
      const localMap = new Map(localSummaries.map((c) => [c.id, c]));

      for (const cloudCourse of boot.courses || []) {
        const localSummary = localMap.get(cloudCourse.id);
        const cloudUpdated = Date.parse(cloudCourse.updatedAt || '') || 0;
        const localUpdated = Date.parse(localSummary?.updatedAt || '') || 0;
        if (!localSummary || cloudUpdated > localUpdated) {
          await saveCourse({
            ...cloudCourse,
            chapters: Array.isArray(cloudCourse.chapters) ? cloudCourse.chapters : [],
          });
        }
      }

      // 4. Đẩy các khóa học tự tạo cục bộ chưa có trên server (hoặc mới hơn) lên server
      for (const localSummary of localSummaries) {
        if (localSummary.id === BUILT_IN_COURSE_ID || localSummary.type === 'built-in') continue;
        const cloudCourse = cloudCourseMap.get(localSummary.id);
        const cloudUpdated = Date.parse(cloudCourse?.updatedAt || '') || 0;
        const localUpdated = Date.parse(localSummary.updatedAt || '') || 0;
        if (!cloudCourse || localUpdated > cloudUpdated || pending.courseIds.includes(localSummary.id)) {
          const fullLocal = await getCourse(localSummary.id);
          if (fullLocal) {
            await pushCloudCourse(fullLocal);
            if (fullLocal.rawDocumentId) {
              const rawDoc = await getRawDocument(fullLocal.rawDocumentId);
              if (rawDoc) await pushCloudRawDocument(fullLocal.id, rawDoc).catch(() => {});
            }
          }
        }
      }

      // 5. Gộp tiến độ học tập cho khóa mặc định và mọi khóa tùy chỉnh
      const allCoursesNow = await getAllCourses();
      const allCourseIds = new Set([
        BUILT_IN_COURSE_ID,
        ...allCoursesNow.map((c) => c.id),
        ...Object.keys(boot.progressByCourse || {}),
      ]);

      const appliedProgressMap = {};
      for (const courseId of allCourseIds) {
        const cloudProg = boot.progressByCourse?.[courseId] || null;
        const localProg = courseId === BUILT_IN_COURSE_ID
          ? (readProgress().progress || await getProgress(courseId))
          : await getProgress(courseId);

        if (!cloudProg && !localProg) continue;

        let merged = null;
        const localIsPristine = isPristineProgress(localProg);
        if (cloudProg && localProg) {
          merged = mergeLocalAndCloudProgress(localProg, cloudProg);
        } else if (cloudProg) {
          merged = { ...cloudProg };
        } else {
          merged = { ...localProg };
        }
        if (boot.user?.displayName && !merged.profile?.name) {
          merged.profile = {
            ...(merged.profile || {}),
            name: boot.user.displayName,
            headline: boot.user.headline || merged.profile?.headline,
            bio: boot.user.bio || merged.profile?.bio,
          };
        }
        if (!merged._savedAt) {
          merged._savedAt = merged._serverUpdatedAt || new Date().toISOString();
        }

        // Lưu bản đã gộp xuống thiết bị
        if (courseId === BUILT_IN_COURSE_ID) {
          writeProgress(merged, { notify: false });
        }
        await saveProgress(courseId, merged);
        appliedProgressMap[courseId] = merged;

        // Chỉ đẩy ngược lên server nếu máy này có tiến độ thật mới hơn hoặc server chưa có
        const localXp = Number(localProg?.xp) || 0;
        const cloudXp = Number(cloudProg?.xp) || 0;
        const localAt = Date.parse(localProg?._savedAt || localProg?.updatedAt || '') || 0;
        const cloudAt = Date.parse(cloudProg?._savedAt || cloudProg?._serverUpdatedAt || '') || 0;
        const shouldPush = (!cloudProg && !localIsPristine)
          || (!localIsPristine && (localXp > cloudXp || localAt > cloudAt))
          || pending.progressIds.includes(courseId);
        if (shouldPush) {
          await pushCloudProgress(courseId, merged);
        }
      }

      // 6. Đồng bộ cài đặt model/theme
      const localSettings = await getSettings();
      if (boot.settings) {
        const nextLocalSettings = {};
        if (boot.settings.geminiModel && boot.settings.geminiModel !== localSettings.geminiModel) {
          nextLocalSettings.geminiModel = boot.settings.geminiModel;
        }
        if (Object.keys(nextLocalSettings).length) {
          await saveSettings(nextLocalSettings);
        }
      }

      // Xoá hàng đợi đã hoàn tất
      writePendingQueue({ progressIds: [], courseIds: [], deletedCourseIds: [], settingsDirty: false });

      const syncedAt = new Date().toISOString();
      setState({
        user: boot.user || state.user,
        serverInfo: {
          ...(state.serverInfo || {}),
          aiProxyAvailable: Boolean(boot.settings?.serverKeyAvailable || boot.settings?.geminiKeyConfigured),
          serverKeyAvailable: Boolean(boot.settings?.serverKeyAvailable),
          userKeyConfigured: Boolean(boot.settings?.geminiKeyConfigured),
          userKeyHint: boot.settings?.geminiKeyHint || '',
        },
        analytics: boot.analytics || null,
        syncState: 'synced',
        lastSyncedAt: syncedAt,
        lastError: '',
      });

      onCloudDataApplied?.({
        user: boot.user,
        settings: boot.settings,
        progressByCourse: appliedProgressMap,
        courses: boot.courses || [],
      });

      return boot;
    } catch (error) {
      const offline = error?.code === 'network' || (typeof navigator !== 'undefined' && navigator.onLine === false);
      setState({
        syncState: offline ? 'offline' : 'error',
        lastError: error?.message || 'Chưa đồng bộ được với máy chủ.',
      });
      return null;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export async function signInWithPassword(credentials, { onCloudDataApplied } = {}) {
  const res = await loginAccount(credentials);
  setState({
    serverAvailable: true,
    authenticated: true,
    user: res.user,
    syncState: 'syncing',
    lastError: '',
  });
  await syncAllWithCloud({ onCloudDataApplied });
  return res.user;
}

export async function signUpWithPassword(payload, { onCloudDataApplied } = {}) {
  const res = await registerAccount(payload);
  setState({
    serverAvailable: true,
    authenticated: true,
    user: res.user,
    syncState: 'syncing',
    lastError: '',
  });
  await syncAllWithCloud({ onCloudDataApplied });
  return res.user;
}

export async function signOutAccount() {
  for (const timer of progressTimers.values()) clearTimeout(timer);
  progressTimers.clear();
  try {
    await logoutAccount();
  } catch { /* vẫn dọn state phía client kể cả khi rớt mạng */ }
  writePendingQueue({ progressIds: [], courseIds: [], deletedCourseIds: [], settingsDirty: false });
  setState({
    authenticated: false,
    user: null,
    analytics: null,
    syncState: 'local',
    lastSyncedAt: null,
    lastError: '',
    serverInfo: state.serverInfo
      ? { ...state.serverInfo, userKeyConfigured: false, userKeyHint: '', aiProxyAvailable: Boolean(state.serverInfo.serverKeyAvailable) }
      : null,
  });
}

export async function syncProfileUpdate(updates) {
  if (!state.authenticated || !state.serverAvailable) return null;
  const payload = {};
  if (updates.name !== undefined) payload.displayName = updates.name;
  if (updates.displayName !== undefined) payload.displayName = updates.displayName;
  if (updates.headline !== undefined) payload.headline = updates.headline;
  if (updates.bio !== undefined) payload.bio = updates.bio;
  if (updates.showOnLeaderboard !== undefined) payload.showOnLeaderboard = updates.showOnLeaderboard;
  const res = await updateAccountProfile(payload);
  if (res?.user) setState({ user: res.user });
  return res?.user || null;
}

/** Đẩy tiến độ học lên server theo cơ chế debounce + hàng đợi offline. */
export function queueProgressCloudSync(courseId, progress) {
  if (!state.authenticated || !state.serverAvailable || !courseId) return;
  if (progressTimers.has(courseId)) clearTimeout(progressTimers.get(courseId));

  const timer = setTimeout(async () => {
    progressTimers.delete(courseId);
    if (!state.authenticated) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const q = readPendingQueue();
      if (!q.progressIds.includes(courseId)) q.progressIds.push(courseId);
      writePendingQueue(q);
      setState({ syncState: 'offline' });
      return;
    }
    setState({ syncState: 'syncing', lastError: '' });
    try {
      await pushCloudProgress(courseId, progress);
      const q = readPendingQueue();
      q.progressIds = q.progressIds.filter((id) => id !== courseId);
      writePendingQueue(q);
      setState({ syncState: 'synced', lastSyncedAt: new Date().toISOString(), lastError: '' });
    } catch (error) {
      const q = readPendingQueue();
      if (!q.progressIds.includes(courseId)) q.progressIds.push(courseId);
      writePendingQueue(q);
      const offline = error?.code === 'network';
      setState({ syncState: offline ? 'offline' : 'error', lastError: error?.message || '' });
    }
  }, 1200);

  progressTimers.set(courseId, timer);
}

/** Đẩy 1 khóa học lên đám mây (non-blocking, có fallback hàng đợi). */
export async function syncCourseToCloud(course) {
  if (!state.authenticated || !state.serverAvailable || !course?.id || course.id === BUILT_IN_COURSE_ID || course.type === 'built-in') {
    return;
  }
  try {
    await pushCloudCourse(course);
    setState({ syncState: 'synced', lastSyncedAt: new Date().toISOString() });
  } catch {
    const q = readPendingQueue();
    if (!q.courseIds.includes(course.id)) q.courseIds.push(course.id);
    writePendingQueue(q);
  }
}

export async function syncCourseDeleteToCloud(courseId) {
  if (!state.authenticated || !state.serverAvailable || !courseId || courseId === BUILT_IN_COURSE_ID) return;
  try {
    await deleteCloudCourse(courseId);
    setState({ syncState: 'synced', lastSyncedAt: new Date().toISOString() });
  } catch (error) {
    if (error?.status === 404) return;
    const q = readPendingQueue();
    if (!q.deletedCourseIds.includes(courseId)) q.deletedCourseIds.push(courseId);
    writePendingQueue(q);
  }
}

export async function syncRawDocumentToCloud(courseId, document) {
  if (!state.authenticated || !state.serverAvailable || !courseId || !document) return;
  try {
    await pushCloudRawDocument(courseId, document);
  } catch {
    const q = readPendingQueue();
    if (!q.courseIds.includes(courseId)) q.courseIds.push(courseId);
    writePendingQueue(q);
  }
}

export async function syncSettingsToCloud(patch) {
  if (!state.authenticated || !state.serverAvailable) return;
  try {
    await pushCloudSettings(patch);
  } catch {
    const q = readPendingQueue();
    q.settingsDirty = true;
    writePendingQueue(q);
  }
}

/** Ghi nhận sự kiện học tập lên server để thống kê (không chặn UI nếu lỗi). */
export function trackStudyEvent(payload) {
  if (!state.authenticated || !state.serverAvailable) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  pushStudyEvent(payload).catch(() => {});
}
