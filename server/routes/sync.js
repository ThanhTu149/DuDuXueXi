import { randomUUID } from 'node:crypto';
import { getIsoWeekKey } from '../db/database.js';
import { ApiError, readJsonBody, safeJsonParse, sanitizeDeep, sendJson } from '../lib/http.js';
import { requireAuth } from './auth.js';
import { getUserSettingsSnapshot } from './settings.js';

const MAX_COURSE_ID_LEN = 120;

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Gộp thông minh tiến độ học tập giữa server và thiết bị mới đồng bộ.
 * Không làm mất thành tích, bookmark, ngày học hay bài đã mở khoá ở thiết bị kia.
 */
export function mergeServerProgress(existing, incoming) {
  if (!isPlainObject(existing)) return sanitizeDeep(incoming);
  if (!isPlainObject(incoming)) return sanitizeDeep(existing);

  const a = sanitizeDeep(existing);
  const b = sanitizeDeep(incoming);
  const aAt = Date.parse(a._savedAt || a.updatedAt || '') || 0;
  const bAt = Date.parse(b._savedAt || b.updatedAt || '') || 0;
  const newer = bAt >= aAt ? b : a;
  const older = newer === b ? a : b;

  const merged = { ...older, ...newer };

  // Hợp nhất các tập hợp tích luỹ
  for (const field of ['achievements', 'goalRewardDates', 'bookmarks', 'studyDates']) {
    const combined = [
      ...(Array.isArray(older[field]) ? older[field] : []),
      ...(Array.isArray(newer[field]) ? newer[field] : []),
    ];
    merged[field] = [...new Set(combined)];
  }

  // Hợp nhất danh sách bài đã mở khoá
  if (Array.isArray(older.unlockedBai) || Array.isArray(newer.unlockedBai)) {
    const unlocked = [...new Set([
      ...(Array.isArray(older.unlockedBai) ? older.unlockedBai : []),
      ...(Array.isArray(newer.unlockedBai) ? newer.unlockedBai : []),
    ])].sort((x, y) => Number(x) - Number(y));
    merged.unlockedBai = unlocked;
  }

  // Hợp nhất studyDays / dailyXp / weeklyXP lấy giá trị lớn hơn theo từng mốc thời gian
  if (isPlainObject(older.studyDays) || isPlainObject(newer.studyDays)) {
    const days = { ...(isPlainObject(older.studyDays) ? older.studyDays : {}) };
    for (const [date, val] of Object.entries(isPlainObject(newer.studyDays) ? newer.studyDays : {})) {
      const prev = days[date] || { xp: 0, questions: 0 };
      days[date] = {
        xp: Math.max(Number(prev.xp) || 0, Number(val?.xp) || 0),
        questions: Math.max(Number(prev.questions) || 0, Number(val?.questions) || 0),
      };
    }
    merged.studyDays = days;
  }

  if (isPlainObject(older.weeklyXP) || isPlainObject(newer.weeklyXP)) {
    const weeks = { ...(isPlainObject(older.weeklyXP) ? older.weeklyXP : {}) };
    for (const [week, xp] of Object.entries(isPlainObject(newer.weeklyXP) ? newer.weeklyXP : {})) {
      weeks[week] = Math.max(Number(weeks[week]) || 0, Number(xp) || 0);
    }
    merged.weeklyXP = weeks;
  }

  // Hợp nhất tiến độ từng bài (giữ trạng thái completed + union attemptedIds/correctIds)
  if (isPlainObject(older.baiProgress) || isPlainObject(newer.baiProgress)) {
    const allKeys = new Set([
      ...Object.keys(isPlainObject(older.baiProgress) ? older.baiProgress : {}),
      ...Object.keys(isPlainObject(newer.baiProgress) ? newer.baiProgress : {}),
    ]);
    const bp = {};
    for (const key of allKeys) {
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
  }

  // Hợp nhất SRS theo bản ghi được ôn gần nhất
  if (isPlainObject(older.srs) || isPlainObject(newer.srs)) {
    const srs = { ...(isPlainObject(older.srs) ? older.srs : {}) };
    for (const [id, entry] of Object.entries(isPlainObject(newer.srs) ? newer.srs : {})) {
      const prev = srs[id];
      if (!prev || String(entry?.lastReview || '') >= String(prev?.lastReview || '')) {
        srs[id] = entry;
      }
    }
    merged.srs = srs;
  }

  // Hợp nhất ghi chú cá nhân
  if (isPlainObject(older.notes) || isPlainObject(newer.notes)) {
    merged.notes = {
      ...(isPlainObject(older.notes) ? older.notes : {}),
      ...(isPlainObject(newer.notes) ? newer.notes : {}),
    };
  }

  // Giữ XP và chỉ số tích luỹ không bị lùi do thiết bị cũ chưa cập nhật
  merged.xp = Math.max(Number(older.xp) || 0, Number(newer.xp) || 0);
  merged.bossWins = Math.max(Number(older.bossWins) || 0, Number(newer.bossWins) || 0);
  if (isPlainObject(older.accuracy) || isPlainObject(newer.accuracy)) {
    const oAcc = older.accuracy || { correct: 0, total: 0 };
    const nAcc = newer.accuracy || { correct: 0, total: 0 };
    merged.accuracy = (Number(nAcc.total) || 0) >= (Number(oAcc.total) || 0)
      ? { correct: Number(nAcc.correct) || 0, total: Number(nAcc.total) || 0 }
      : { correct: Number(oAcc.correct) || 0, total: Number(oAcc.total) || 0 };
  }

  merged._savedAt = new Date(Math.max(aAt, bAt, Date.now())).toISOString();
  return merged;
}

export function enforcePlausibleXp(finalProgress, existingProgress = null, verifiedEventXp = 0) {
  if (!isPlainObject(finalProgress)) return finalProgress;
  const baiProgress = isPlainObject(finalProgress.baiProgress) ? finalProgress.baiProgress : {};
  let totalQuestionCredit = 0;
  let completedLessons = 0;
  let bossWinsFromLessons = 0;
  for (const entry of Object.values(baiProgress)) {
    if (!isPlainObject(entry)) continue;
    const accTotal = Math.max(0, Math.floor(Number(entry?.accuracy?.total) || 0));
    const attemptedLen = Array.isArray(entry.attemptedIds) ? entry.attemptedIds.length : 0;
    const correctLen = Array.isArray(entry.correctIds) ? entry.correctIds.length : 0;
    const firstLen = Array.isArray(entry.firstAttemptCorrectIds) ? entry.firstAttemptCorrectIds.length : 0;
    totalQuestionCredit += Math.max(accTotal, attemptedLen, correctLen, firstLen);
    if (entry.completed) completedLessons += 1;
    if (entry.bossWon) bossWinsFromLessons += 1;
  }

  const globalAccTotal = Math.max(0, Math.floor(Number(finalProgress?.accuracy?.total) || 0));
  const effectiveQuestions = Math.max(totalQuestionCredit, globalAccTotal);
  const unlockedCount = Array.isArray(finalProgress.unlockedBai) ? finalProgress.unlockedBai.length : 0;
  const studyDaysCount = Array.isArray(finalProgress.studyDays)
    ? finalProgress.studyDays.length
    : (isPlainObject(finalProgress.studyDays) ? Object.keys(finalProgress.studyDays).length : 0);
  const srsReps = isPlainObject(finalProgress.srs)
    ? Object.values(finalProgress.srs).reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item?.reps) || 0)), 0)
    : 0;
  const pomodoroCount = Math.max(
    0,
    Math.floor(Number(finalProgress.pomodoroCount ?? finalProgress.pomodoroSessions) || 0),
  );
  const bossWins = Math.max(
    bossWinsFromLessons,
    Math.max(0, Math.floor(Number(finalProgress.bossWins) || 0)),
  );
  const existingXp = Math.max(0, Math.floor(Number(existingProgress?.xp) || 0));
  const eventXp = Math.max(0, Math.floor(Number(verifiedEventXp) || 0));

  const activityCeiling = Math.min(
    500_000,
    effectiveQuestions * 25
    + completedLessons * 60
    + Math.max(unlockedCount, 1) * 30
    + Math.max(studyDaysCount, Math.floor(Number(finalProgress.streak) || 0) > 0 ? 1 : 0) * 50
    + bossWins * 50
    + srsReps * 20
    + pomodoroCount * 30
    + eventXp
    + 100,
  );
  const maxAllowedXp = Math.max(existingXp, activityCeiling);
  const rawXp = Math.max(0, Math.floor(Number(finalProgress.xp) || 0));
  finalProgress.xp = Math.min(rawXp, maxAllowedXp);

  if (isPlainObject(finalProgress.weeklyXP)) {
    const clampedWeekly = {};
    for (const [wk, val] of Object.entries(finalProgress.weeklyXP)) {
      clampedWeekly[wk] = Math.min(25_000, finalProgress.xp, Math.max(0, Math.floor(Number(val) || 0)));
    }
    finalProgress.weeklyXP = clampedWeekly;
  }
  return finalProgress;
}

export function extractProgressMetrics(progress) {
  const xp = Math.max(0, Math.floor(Number(progress?.xp) || 0));
  const streak = Math.max(0, Math.floor(Number(progress?.streak) || 0));
  const accuracyCorrect = Math.max(0, Math.floor(Number(progress?.accuracy?.correct) || 0));
  const accuracyTotal = Math.max(0, Math.floor(Number(progress?.accuracy?.total) || 0));
  const achievementsCount = Array.isArray(progress?.achievements) ? progress.achievements.length : 0;
  const weeklyXP = isPlainObject(progress?.weeklyXP) ? progress.weeklyXP : {};
  return { xp, streak, accuracyCorrect, accuracyTotal, achievementsCount, weeklyXP };
}

export function computeAnalytics(db, userId) {
  const progressRows = db.prepare(`
    SELECT course_id, xp, streak, accuracy_correct, accuracy_total, achievements_count, progress_json
    FROM user_progress WHERE user_id = ?
  `).all(userId);

  let totalXp = 0;
  let bestStreak = 0;
  let totalCorrect = 0;
  let totalQuestions = 0;
  let totalPomodoros = 0;
  const dailyMap = {};

  for (const row of progressRows) {
    totalXp += Number(row.xp) || 0;
    bestStreak = Math.max(bestStreak, Number(row.streak) || 0);
    totalCorrect += Number(row.accuracy_correct) || 0;
    totalQuestions += Number(row.accuracy_total) || 0;
    const parsed = safeJsonParse(row.progress_json, {});
    totalPomodoros += Number(parsed?.pomodoroSessions) || 0;
    if (isPlainObject(parsed?.studyDays)) {
      for (const [date, stats] of Object.entries(parsed.studyDays)) {
        const cur = dailyMap[date] || { date, xp: 0, questions: 0 };
        cur.xp += Number(stats?.xp) || 0;
        cur.questions += Number(stats?.questions) || 0;
        dailyMap[date] = cur;
      }
    }
  }

  const eventSummary = db.prepare(`
    SELECT event_type, COUNT(*) AS count, SUM(xp_earned) AS xp
    FROM study_events
    WHERE user_id = ?
    GROUP BY event_type
  `).all(userId);

  const last30Days = Object.values(dailyMap)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30)
    .reverse();

  return {
    totalXp,
    bestStreak,
    accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    totalCorrect,
    totalQuestions,
    coursesTracked: progressRows.length,
    totalPomodoros,
    last30Days,
    eventsByType: Object.fromEntries(eventSummary.map((r) => [r.event_type, { count: Number(r.count), xp: Number(r.xp || 0) }])),
  };
}

export function registerSyncRoutes(router, { db, config, onLeaderboardInvalidated = () => {} }) {
  // Tải toàn bộ trạng thái đồng bộ của người dùng trong 1 request sau khi đăng nhập
  router.get('/api/sync/bootstrap', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const settings = getUserSettingsSnapshot(db, config, user.id);

    const courseRows = db.prepare(`
      SELECT id, name, description, type, status, raw_document_id, metadata_json,
             chapters_json, is_public, share_code, tags_json, clone_count, created_at, updated_at
      FROM courses
      WHERE owner_id = ?
      ORDER BY created_at ASC
    `).all(user.id);

    const courses = courseRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      status: row.status,
      rawDocumentId: row.raw_document_id,
      metadata: safeJsonParse(row.metadata_json, {}),
      chapters: safeJsonParse(row.chapters_json, []),
      isPublic: Boolean(row.is_public),
      shareCode: row.share_code || null,
      tags: safeJsonParse(row.tags_json, []),
      cloneCount: Number(row.clone_count) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const progressRows = db.prepare(`
      SELECT course_id, progress_json, version, updated_at
      FROM user_progress
      WHERE user_id = ?
    `).all(user.id);

    const progressByCourse = {};
    for (const row of progressRows) {
      const parsed = safeJsonParse(row.progress_json, null);
      if (parsed) {
        progressByCourse[row.course_id] = {
          ...parsed,
          _serverVersion: Number(row.version) || 1,
          _serverUpdatedAt: row.updated_at,
        };
      }
    }

    sendJson(res, 200, {
      ok: true,
      user,
      settings,
      courses,
      progressByCourse,
      analytics: computeAnalytics(db, user.id),
      serverTime: new Date().toISOString(),
    });
  });

  router.get('/api/progress/:courseId', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.courseId || '').trim();
    if (!courseId || courseId.length > MAX_COURSE_ID_LEN) {
      throw new ApiError(400, 'invalid_course_id', 'Mã khóa học không hợp lệ.');
    }
    const row = db.prepare(`
      SELECT progress_json, version, updated_at
      FROM user_progress
      WHERE user_id = ? AND course_id = ?
    `).get(user.id, courseId);

    sendJson(res, 200, {
      ok: true,
      courseId,
      progress: row ? safeJsonParse(row.progress_json, null) : null,
      version: row ? Number(row.version) : 0,
      updatedAt: row?.updated_at || null,
    });
  });

  router.put('/api/progress/:courseId', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const courseId = String(ctx.params.courseId || '').trim();
    if (!courseId || courseId.length > MAX_COURSE_ID_LEN) {
      throw new ApiError(400, 'invalid_course_id', 'Mã khóa học không hợp lệ.');
    }
    const body = await readJsonBody(req, { maxBytes: 5 * 1024 * 1024 });
    const incoming = isPlainObject(body.progress) ? body.progress : body;
    const mode = body.mode === 'replace' ? 'replace' : 'merge';

    const existingRow = db.prepare(`
      SELECT progress_json, version
      FROM user_progress
      WHERE user_id = ? AND course_id = ?
    `).get(user.id, courseId);

    const existing = existingRow ? safeJsonParse(existingRow.progress_json, null) : null;
    const finalProgress = mode === 'replace'
      ? sanitizeDeep(incoming)
      : mergeServerProgress(existing, incoming);

    const verifiedRow = db.prepare(`
      SELECT COALESCE(SUM(xp_earned), 0) AS total
      FROM study_events
      WHERE user_id = ? AND course_id = ?
    `).get(user.id, courseId);
    enforcePlausibleXp(finalProgress, existing, Number(verifiedRow?.total) || 0);

    const now = new Date().toISOString();
    const metrics = extractProgressMetrics(finalProgress);
    const weekKey = getIsoWeekKey();
    const currentWeekXp = Math.min(25_000, metrics.xp, Math.max(0, Math.floor(Number(metrics.weeklyXP?.[weekKey]) || 0)));
    const nextVersion = (Number(existingRow?.version) || 0) + 1;
    const clientSavedAt = typeof finalProgress._savedAt === 'string' ? finalProgress._savedAt : now;

    db.prepare(`
      INSERT INTO user_progress (
        user_id, course_id, progress_json, xp, streak, accuracy_correct, accuracy_total,
        achievements_count, weekly_xp_json, current_week_key, current_week_xp, client_saved_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, course_id) DO UPDATE SET
        progress_json = excluded.progress_json,
        xp = excluded.xp,
        streak = excluded.streak,
        accuracy_correct = excluded.accuracy_correct,
        accuracy_total = excluded.accuracy_total,
        achievements_count = excluded.achievements_count,
        weekly_xp_json = excluded.weekly_xp_json,
        current_week_key = excluded.current_week_key,
        current_week_xp = excluded.current_week_xp,
        client_saved_at = excluded.client_saved_at,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).run(
      user.id,
      courseId,
      JSON.stringify(finalProgress),
      metrics.xp,
      metrics.streak,
      metrics.accuracyCorrect,
      metrics.accuracyTotal,
      metrics.achievementsCount,
      JSON.stringify(metrics.weeklyXP),
      weekKey,
      currentWeekXp,
      clientSavedAt,
      nextVersion,
      now,
    );

    onLeaderboardInvalidated();
    sendJson(res, 200, {
      ok: true,
      courseId,
      version: nextVersion,
      updatedAt: now,
      progress: finalProgress,
    });
  });

  router.post('/api/events', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const body = await readJsonBody(req);
    const eventType = String(body.eventType || '').trim();
    const ALLOWED = new Set([
      'quiz_answer', 'lesson_complete', 'boss_win', 'pomodoro_complete',
      'srs_review', 'dictation', 'pronunciation', 'course_clone',
    ]);
    if (!ALLOWED.has(eventType)) {
      throw new ApiError(400, 'invalid_event', 'Loại sự kiện học tập không hợp lệ.');
    }
    const courseId = String(body.courseId || 'hanngu-tap2').slice(0, MAX_COURSE_ID_LEN);
    const bai = Number.isInteger(Number(body.bai)) ? Number(body.bai) : null;
    const questionId = body.questionId ? String(body.questionId).slice(0, 120) : null;
    const isCorrect = body.isCorrect === undefined || body.isCorrect === null ? null : (body.isCorrect ? 1 : 0);
    const xpEarned = Math.max(0, Math.min(1000, Math.floor(Number(body.xpEarned) || 0)));
    const meta = isPlainObject(body.meta) ? sanitizeDeep(body.meta) : {};
    const now = new Date().toISOString();
    const id = `evt-${randomUUID()}`;

    db.prepare(`
      INSERT INTO study_events (id, user_id, course_id, event_type, bai, question_id, is_correct, xp_earned, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, courseId, eventType, bai, questionId, isCorrect, xpEarned, JSON.stringify(meta), now);

    sendJson(res, 201, { ok: true, id, createdAt: now });
  });

  router.get('/api/analytics', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    sendJson(res, 200, { ok: true, analytics: computeAnalytics(db, user.id) });
  });
}
