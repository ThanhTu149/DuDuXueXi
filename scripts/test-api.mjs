/**
 * Kiểm thử toàn bộ Full-Stack Backend API (SQLite :memory:, deterministic, không gọi mạng thật):
 *   node scripts/test-api.mjs
 */
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { isPristineProgress, mergeLocalAndCloudProgress } from '../src/lib/cloudSync.js';

class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  captureCookies(response) {
    const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const entry of raw) {
      const pair = entry.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (!val || /Max-Age=0/i.test(entry)) this.cookies.delete(name);
      else this.cookies.set(name, val);
    }
  }

  async req(path, { method = 'GET', body = undefined, headers = {} } = {}) {
    const reqHeaders = { Accept: 'application/json', ...headers };
    const cookie = this.cookieHeader();
    if (cookie) reqHeaders.Cookie = cookie;
    const init = { method, headers: reqHeaders };
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`${this.baseUrl}${path}`, init);
    this.captureCookies(res);
    const data = await res.json().catch(() => null);
    return { status: res.status, headers: res.headers, data };
  }
}

function getIsoWeekKey(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const year = date.getFullYear();
  const weekOne = new Date(year, 0, 4);
  const week = 1 + Math.round(((date - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const app = createApp({
  configOverrides: {
    DUDU_DB_PATH: ':memory:',
    ENCRYPTION_KEY: 'test-encryption-secret-key-at-least-32-chars!!',
    DUDU_DISABLE_RATE_LIMIT: 'true',
  },
  serveStatic: false,
  seed: true,
});

const addr = await app.listen(0, '127.0.0.1');
const baseUrl = `http://127.0.0.1:${addr.port}`;

try {
  const alice = new TestClient(baseUrl);
  const aliceDevice2 = new TestClient(baseUrl);
  const bob = new TestClient(baseUrl);

  // 1. Health + schema v2 + security headers + seeded official community courses + guest session check
  const health = await alice.req('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);
  assert.equal(health.data.schemaVersion, 2);
  assert.ok(health.data.stats.communityCourses >= 2);
  assert.match(health.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(health.headers.get('permissions-policy'));

  // Community pagination check (no chapters_json overhead)
  const pagedComm = await alice.req('/api/community/courses?limit=1&offset=0');
  assert.equal(pagedComm.status, 200);
  assert.equal(pagedComm.data.courses.length, 1);
  assert.ok(pagedComm.data.total >= 2);
  assert.equal(Object.hasOwn(pagedComm.data.courses[0], 'chapters'), false);

  const guestMe = await alice.req('/api/auth/me');
  assert.equal(guestMe.status, 200);
  assert.equal(guestMe.data.authenticated, false);
  assert.equal(guestMe.data.user, null);

  // Protected route returns 401 when unauthenticated
  assert.equal((await alice.req('/api/sync/bootstrap')).status, 401);

  // 2. Register, validation, login (username & email), sessions, password change
  assert.equal((await alice.req('/api/auth/register', { method: 'POST', body: { username: 'ab', password: '123' } })).status, 400);

  const regAlice = await alice.req('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice_cn', email: 'alice@dudu.vn', displayName: 'Alice Nguyễn', password: 'password123' },
  });
  assert.equal(regAlice.status, 201);
  assert.equal(regAlice.data.user.username, 'alice_cn');

  // Duplicate username rejected
  const dup = await bob.req('/api/auth/register', {
    method: 'POST',
    body: { username: 'ALICE_CN', password: 'password123' },
  });
  assert.equal(dup.status, 409);

  // Second device login by email
  const login2 = await aliceDevice2.req('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'alice@dudu.vn', password: 'password123' },
  });
  assert.equal(login2.status, 200);
  assert.equal(login2.data.user.username, 'alice_cn');

  // Wrong password rejected
  assert.equal((await bob.req('/api/auth/login', { method: 'POST', body: { identifier: 'alice_cn', password: 'wrong' } })).status, 401);

  // Sessions list shows 2 sessions
  const sessionsRes = await alice.req('/api/auth/sessions');
  assert.equal(sessionsRes.status, 200);
  assert.equal(sessionsRes.data.sessions.length, 2);

  // Password change revokes second device session
  const chPass = await alice.req('/api/auth/password', {
    method: 'POST',
    body: { currentPassword: 'password123', newPassword: 'newpassword456' },
  });
  assert.equal(chPass.status, 200);
  assert.equal((await aliceDevice2.req('/api/auth/me')).data.authenticated, false);
  assert.equal((await alice.req('/api/auth/me')).data.authenticated, true);

  // Register Bob
  const regBob = await bob.req('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob_han', displayName: 'Bob Trần', password: 'password123' },
  });
  assert.equal(regBob.status, 201);

  // 3. Encrypted Gemini API key storage (AES-256-GCM)
  const rawSecret = 'AIzaSyFakeSecretKey1234567890ABCD';
  const saveKeyRes = await alice.req('/api/settings/gemini-key', {
    method: 'PUT',
    body: { apiKey: rawSecret, geminiModel: 'gemini-2.5-flash' },
  });
  assert.equal(saveKeyRes.status, 200);
  assert.equal(saveKeyRes.data.configured, true);
  assert.equal(saveKeyRes.data.hint, 'AIza••••ABCD');

  // Confirm raw DB row does NOT contain plaintext key!
  const rawRow = app.db.prepare('SELECT gemini_key_enc, gemini_key_iv, gemini_key_tag FROM user_settings WHERE user_id = ?').get(regAlice.data.user.id);
  assert.ok(rawRow.gemini_key_enc && rawRow.gemini_key_iv && rawRow.gemini_key_tag);
  assert.equal(rawRow.gemini_key_enc.includes(rawSecret), false);

  // GET /api/settings never leaks raw key
  const settingsRes = await alice.req('/api/settings');
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsRes.data.settings.geminiKeyConfigured, true);
  assert.equal(settingsRes.data.settings.geminiModel, 'gemini-2.5-flash');
  assert.equal(JSON.stringify(settingsRes.data).includes(rawSecret), false);

  // 4. Progress sync & smart merge + analytics events
  const weekKey = getIsoWeekKey();
  const prog1 = await alice.req('/api/progress/hanngu-tap2', {
    method: 'PUT',
    body: {
      progress: {
        xp: 120,
        streak: 3,
        accuracy: { correct: 10, total: 12 },
        achievements: ['first_lesson'],
        bookmarks: ['bai01_w001'],
        studyDates: ['2026-11-24'],
        weeklyXP: { [weekKey]: 120 },
        baiProgress: { 1: { completed: true, quizDone: 30, quizCorrect: 28, attemptedIds: ['q1'], correctIds: ['q1'] } },
        _savedAt: '2026-11-25T01:00:00.000Z',
      },
    },
  });
  assert.equal(prog1.status, 200);
  assert.equal(prog1.data.version, 1);

  // Merge update from an older/other device with distinct bookmark/achievement
  const prog2 = await alice.req('/api/progress/hanngu-tap2', {
    method: 'PUT',
    body: {
      progress: {
        xp: 180,
        streak: 4,
        accuracy: { correct: 16, total: 18 },
        achievements: ['streak_3'],
        bookmarks: ['bai01_w002'],
        studyDates: ['2026-11-25'],
        weeklyXP: { [weekKey]: 180 },
        baiProgress: { 1: { completed: false, quizDone: 5, quizCorrect: 5, attemptedIds: ['q2'], correctIds: ['q2'] } },
        _savedAt: '2026-11-25T02:00:00.000Z',
      },
    },
  });
  assert.equal(prog2.status, 200);
  assert.equal(prog2.data.version, 2);
  assert.equal(prog2.data.progress.xp, 180);
  assert.deepEqual(prog2.data.progress.achievements.sort(), ['first_lesson', 'streak_3']);
  assert.deepEqual(prog2.data.progress.bookmarks.sort(), ['bai01_w001', 'bai01_w002']);
  assert.equal(prog2.data.progress.baiProgress['1'].completed, true);
  assert.deepEqual(prog2.data.progress.baiProgress['1'].attemptedIds.sort(), ['q1', 'q2']);

  // Bob earns higher XP
  await bob.req('/api/progress/hanngu-tap2', {
    method: 'PUT',
    body: {
      progress: {
        xp: 310,
        streak: 5,
        accuracy: { correct: 25, total: 26 },
        weeklyXP: { [weekKey]: 250 },
      },
    },
  });

  // Study event & analytics
  const evt = await alice.req('/api/events', {
    method: 'POST',
    body: { eventType: 'quiz_answer', courseId: 'hanngu-tap2', bai: 1, questionId: 'quiz_bai01_001', isCorrect: true, xpEarned: 10 },
  });
  assert.equal(evt.status, 201);
  const analytics = await alice.req('/api/analytics');
  assert.equal(analytics.status, 200);
  assert.equal(analytics.data.analytics.totalXp, 180);
  assert.equal(analytics.data.analytics.eventsByType.quiz_answer.count, 1);

  // 5. Leaderboard + privacy opt-out
  const lbWeek = await alice.req('/api/leaderboard?period=week');
  assert.equal(lbWeek.status, 200);
  assert.equal(lbWeek.data.entries.length, 2);
  assert.equal(lbWeek.data.entries[0].username, 'bob_han');
  assert.equal(lbWeek.data.entries[0].xp, 250);
  assert.equal(lbWeek.data.entries[1].username, 'alice_cn');
  assert.equal(lbWeek.data.currentUserRank.rank, 2);

  // Bob opts out of leaderboard
  await bob.req('/api/auth/profile', { method: 'PATCH', body: { showOnLeaderboard: false } });
  const lbAfter = await alice.req('/api/leaderboard?period=week');
  assert.equal(lbAfter.data.entries.length, 1);
  assert.equal(lbAfter.data.entries[0].username, 'alice_cn');
  assert.equal(lbAfter.data.currentUserRank.rank, 1);

  // 6. Courses CRUD, ownership isolation, raw document sync, community publish & clone
  const customCourse = {
    id: 'course-alice-1',
    name: 'Tiếng Trung Công Sở',
    description: 'Từ vựng email và họp hành.',
    type: 'imported',
    status: 'ready',
    chapters: [{
      id: 'bai01',
      index: 1,
      title_zh: '开会',
      title_vi: 'Họp nhóm',
      glossary: { metadata: { bai: 1 }, entries: [{ id: 'bai01_w001', bai: 1, type: 'word', word_zh: '开会', pinyin: 'kāihuì', meaning_vi: 'họp' }] },
      quiz: { metadata: { bai: 1 }, questions: [{ id: 'quiz_bai01_001', bai: 1, type: 'mcq_meaning_zh_to_vi', question_vi: '开会 là gì?', options: [{ id: 'A', text: 'họp' }, { id: 'B', text: 'nghỉ' }], correct_option: 'A' }] },
    }],
  };

  const putCourse = await alice.req('/api/courses/course-alice-1', { method: 'PUT', body: customCourse });
  assert.equal(putCourse.status, 201);
  assert.equal(putCourse.data.course.totalEntries, 1);

  // Raw doc sync
  const putRaw = await alice.req('/api/courses/course-alice-1/raw-document', {
    method: 'PUT',
    body: { document: { id: 'doc-1', fileName: 'office.txt', fileSize: 50, fileType: 'txt', status: 'processed', chunks: [] } },
  });
  assert.equal(putRaw.status, 200);
  const getRaw = await alice.req('/api/courses/course-alice-1/raw-document');
  assert.equal(getRaw.data.document.fileName, 'office.txt');

  // Bob CANNOT view, edit, or delete Alice's private course
  assert.equal((await bob.req('/api/courses/course-alice-1')).status, 403);
  assert.equal((await bob.req('/api/courses/course-alice-1', { method: 'PUT', body: { ...customCourse, name: 'Hacked' } })).status, 403);
  assert.equal((await bob.req('/api/courses/course-alice-1', { method: 'DELETE' })).status, 403);

  // Alice publishes to Community Hub
  const pub = await alice.req('/api/courses/course-alice-1/publish', {
    method: 'POST',
    body: { isPublic: true, description: 'Từ vựng văn phòng thiết yếu.', tags: ['Công sở', 'HSK 3'] },
  });
  assert.equal(pub.status, 200);
  assert.equal(pub.data.course.isPublic, true);
  assert.ok(pub.data.course.shareCode);

  // Search Community Hub by tag & shareCode
  const searchTag = await bob.req('/api/community/courses?tag=C%C3%B4ng%20s%E1%BB%9F');
  assert.equal(searchTag.status, 200);
  assert.equal(searchTag.data.courses.length, 1);
  assert.equal(searchTag.data.courses[0].id, 'course-alice-1');

  // Bob clones Alice's public course into Bob's cloud library
  const cloned = await bob.req(`/api/community/courses/${pub.data.course.shareCode}/clone`, { method: 'POST' });
  assert.equal(cloned.status, 201);
  assert.equal(cloned.data.savedToCloud, true);
  assert.equal(cloned.data.cloneCount, 1);
  assert.notEqual(cloned.data.course.id, 'course-alice-1');

  const bobCourses = await bob.req('/api/courses');
  assert.equal(bobCourses.data.courses.length, 1);
  assert.equal(bobCourses.data.courses[0].name, 'Tiếng Trung Công Sở');

  // 7. Server-side AI Proxy & persistent AI Tutor (mocked upstream Gemini)
  const realFetch = globalThis.fetch;
  let capturedGeminiKey = '';
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!u.startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, init);
    capturedGeminiKey = init?.headers?.['x-goog-api-key'] || '';
    if (!u.includes(':generateContent')) {
      return new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = JSON.parse(init.body);
    if (body.generationConfig?.responseMimeType === 'application/json') {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true,"word":"你好"}' }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Chào bạn! 你好 (nǐ hǎo) nghĩa là Xin chào.' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const modelsRes = await alice.req('/api/ai/models');
    assert.equal(modelsRes.status, 200);
    assert.equal(capturedGeminiKey, rawSecret);
    assert.equal(modelsRes.data.models.length, 2);

    const testRes = await alice.req('/api/ai/test', { method: 'POST', body: { model: 'gemini-2.5-flash' } });
    assert.equal(testRes.status, 200);
    assert.equal(testRes.data.keySource, 'user');

    const genRes = await alice.req('/api/ai/generate', { method: 'POST', body: { prompt: 'Test JSON', model: 'gemini-2.5-flash' } });
    assert.equal(genRes.status, 200);
    assert.equal(genRes.data.output.word, '你好');

    const tutorRes = await alice.req('/api/ai/tutor', {
      method: 'POST',
      body: { message: 'Giải thích từ 你好 giúp mình', courseId: 'hanngu-tap2', lessonContext: { lessonTitleZh: '你好' } },
    });
    assert.equal(tutorRes.status, 200);
    assert.match(tutorRes.data.reply.content, /nǐ hǎo/);

    const historyRes = await alice.req('/api/ai/tutor/history');
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.data.messages.length, 2);

    await alice.req('/api/ai/tutor/history', { method: 'DELETE' });
    assert.equal((await alice.req('/api/ai/tutor/history')).data.messages.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  // Delete encrypted key
  const delKey = await alice.req('/api/settings/gemini-key', { method: 'DELETE' });
  assert.equal(delKey.status, 200);
  assert.equal((await alice.req('/api/settings')).data.settings.geminiKeyConfigured, false);

  // 8. Prototype pollution guard + CSRF guard + model validation + account export/delete + Bootstrap snapshot
  const polluted = await alice.req('/api/courses/course-alice-1', {
    method: 'PUT',
    body: '{"name":"Safe Course","chapters":[],"__proto__":{"polluted":true}}',
  });
  assert.equal(polluted.status, 200);
  assert.equal(({}).polluted, undefined);

  // CSRF blocked for cross-site Origin or Sec-Fetch-Site
  const csrfOrigin = await alice.req('/api/auth/profile', {
    method: 'PATCH',
    headers: { Origin: 'https://evil-attacker.example' },
    body: { displayName: 'Hacked' },
  });
  assert.equal(csrfOrigin.status, 403);
  assert.equal(csrfOrigin.data.error.code, 'csrf_blocked');

  const csrfFetchSite = await alice.req('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    body: { displayName: 'Hacked' },
  });
  assert.equal(csrfFetchSite.status, 403);

  // Model path-traversal rejected
  const badModel = await alice.req('/api/ai/tutor', {
    method: 'POST',
    body: { message: 'xin chao', model: '../evil/path' },
  });
  assert.equal(badModel.status, 400);
  assert.equal(badModel.data.error.code, 'invalid_model');

  // Full account export (never includes password_hash or raw secrets)
  const exported = await alice.req('/api/auth/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.data.format, 'dudu-account-export');
  assert.equal(JSON.stringify(exported.data).includes('password_hash'), false);

  const boot = await alice.req('/api/sync/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.data.courses.length, 1);
  assert.equal(boot.data.progressByCourse['hanngu-tap2'].xp, 180);

  // Delete course & account deletion (wrong password rejected, right password cascades)
  assert.equal((await alice.req('/api/courses/course-alice-1', { method: 'DELETE' })).status, 200);
  assert.equal((await bob.req('/api/auth/account', { method: 'DELETE', body: { password: 'wrong' } })).status, 400);
  assert.equal((await bob.req('/api/auth/account', { method: 'DELETE', body: { password: 'password123' } })).status, 200);
  assert.equal((await bob.req('/api/auth/me')).data.authenticated, false);

  assert.equal((await alice.req('/api/auth/logout', { method: 'POST' })).status, 200);
  assert.equal((await alice.req('/api/auth/me')).data.authenticated, false);

  // 9. Rate limiting & anti-X-Forwarded-For spoofing + course quota check
  const limitedApp = createApp({
    configOverrides: { DUDU_DB_PATH: ':memory:', DUDU_DISABLE_RATE_LIMIT: 'false', TRUST_PROXY: 'false', MAX_COURSES_PER_USER: '5' },
    serveStatic: false,
    seed: false,
  });
  const lAddr = await limitedApp.listen(0, '127.0.0.1');
  try {
    const client = new TestClient(`http://127.0.0.1:${lAddr.port}`);
    let got429 = false;
    for (let i = 0; i < 35; i += 1) {
      // Cố tình giả mạo X-Forwarded-For khác nhau mỗi lần — vẫn phải bị chặn vì TRUST_PROXY=false!
      const r = await client.req('/api/auth/login', {
        method: 'POST',
        headers: { 'X-Forwarded-For': `10.0.0.${i + 1}` },
        body: { identifier: `user_${i}`, password: 'wrong' },
      });
      if (r.status === 429) {
        got429 = true;
        assert.ok(Number(r.headers.get('retry-after')) >= 1);
        break;
      }
    }
    assert.equal(got429, true, 'Rate limiter phải chặn kể cả khi giả mạo X-Forwarded-For');

    // Kiểm tra giới hạn số lượng khóa học per-user
    const quotaClient = new TestClient(`http://127.0.0.1:${lAddr.port}`);
    await quotaClient.req('/api/auth/register', { method: 'POST', body: { username: 'quota_u', password: 'password123' } });
    for (let i = 1; i <= 5; i += 1) {
      const r = await quotaClient.req(`/api/courses/c-${i}`, { method: 'PUT', body: { name: `Course ${i}`, chapters: [] } });
      assert.equal(r.status, 201);
    }
    const overQuota = await quotaClient.req('/api/courses/c-6', { method: 'PUT', body: { name: 'Course 6', chapters: [] } });
    assert.equal(overQuota.status, 400);
    assert.equal(overQuota.data.error.code, 'course_limit_reached');
  } finally {
    await limitedApp.close();
  }

  // 10. Client-side pristine-device vs cloud merge regression check
  const freshDevice = { xp: 0, streak: 0, accuracy: { correct: 0, total: 0 }, studyDates: [], bookmarks: [], achievements: [], notes: {}, srs: {}, _savedAt: '2026-11-25T10:00:00.000Z' };
  const cloudEarned = { xp: 240, streak: 4, accuracy: { correct: 20, total: 22 }, studyDates: ['2026-11-24'], bookmarks: ['bai01_w001'], achievements: ['first_lesson'], _savedAt: '2026-11-25T09:00:00.000Z' };
  assert.equal(isPristineProgress(freshDevice), true);
  assert.equal(isPristineProgress(cloudEarned), false);
  const restored = mergeLocalAndCloudProgress(freshDevice, cloudEarned);
  assert.equal(restored.xp, 240, 'Thiết bị mới tinh 0 XP không được ghi đè XP trên đám mây');
  assert.equal(restored.streak, 4);
  assert.deepEqual(restored.bookmarks, ['bai01_w001']);

  const offlineDevice = { xp: 150, streak: 2, accuracy: { correct: 12, total: 15 }, bookmarks: ['bai01_w002'], achievements: ['streak_3'], _savedAt: '2026-11-25T10:05:00.000Z' };
  const mergedBoth = mergeLocalAndCloudProgress(offlineDevice, cloudEarned);
  assert.equal(mergedBoth.xp, 240);
  assert.deepEqual(mergedBoth.bookmarks.sort(), ['bai01_w001', 'bai01_w002']);
  assert.deepEqual(mergedBoth.achievements.sort(), ['first_lesson', 'streak_3']);

  console.log('Full-Stack API OK: health, auth/scrypt/sessions, AES-256-GCM key, progress merge, analytics, leaderboard/privacy, course ownership, community publish/clone, AI proxy/tutor, rate limit.');
} finally {
  await app.close();
}
