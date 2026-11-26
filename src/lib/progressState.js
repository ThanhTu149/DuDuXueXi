export const LESSONS = Array.from({ length: 10 }, (_, index) => index + 1);

export const TYPING_TYPES = new Set([
  'translation_vi_to_zh',
  'translation_zh_to_vi',
  'typing_zh_from_pinyin',
  'sentence_reorder',
]);

export const questionIsMcq = (q) => Boolean(q) && !TYPING_TYPES.has(q.type);

export const XP_REWARDS = {
  mcq: 10,
  typingHigh: 15,
  typingMid: 8,
  correction: 5,
  lesson: 50,
  boss: 100,
  dailyGoal: 25,
};

export const SRS_RATINGS = [
  { id: 'forgot', shortcut: '1', label: 'Quên', tone: 'bg-error-subtle text-error' },
  { id: 'hard', shortcut: '2', label: 'Khó', tone: 'bg-warning-subtle text-warning' },
  { id: 'good', shortcut: '3', label: 'Được', tone: 'bg-success-subtle text-success' },
  { id: 'easy', shortcut: '4', label: 'Dễ', tone: 'bg-accent-2-subtle text-accent-2' },
];

export const ACHIEVEMENTS = [
  { id: 'first_lesson', title: 'Bước đầu vững chắc', description: 'Hoàn thành bài đầu tiên' },
  { id: 'streak_3', title: 'Nhịp học 3 ngày', description: 'Duy trì streak 3 ngày' },
  { id: 'streak_7', title: 'Bền bỉ một tuần', description: 'Duy trì streak 7 ngày' },
  { id: 'combo_10', title: 'Chuỗi 10 câu', description: 'Trả lời đúng 10 câu liên tiếp' },
  { id: 'clean_book', title: 'Sổ tay sạch', description: 'Không còn câu sai cần ôn' },
  { id: 'all_lessons', title: 'Thông thạo khóa học', description: 'Hoàn thành toàn bộ bài học' },
  { id: 'accuracy_90', title: 'Chính xác xuất sắc', description: 'Đạt 90% sau ít nhất 50 câu' },
  { id: 'boss_first', title: 'Hạ Boss đầu tiên', description: 'Thắng một trận Boss Battle' },
];

export const STUDY_TIPS = [
  'Đọc thành tiếng mỗi từ mới 3 lần — tai và miệng nhớ nhanh hơn mắt.',
  'Học 20 phút rồi nghỉ 5 phút hiệu quả hơn học liền một tiếng.',
  'Ôn từ đến hạn trước khi học bài mới: trí nhớ cần được nhắc đúng lúc.',
  'Viết một câu tiếng Trung bằng từ vừa học để nhớ lâu hơn.',
  'Sai một câu là thêm một từ vào sổ ôn — đừng bỏ qua nhé.',
  'Nghe pinyin trước, nhìn chữ Hán sau, rồi tự gõ lại từ đó.',
  'Mỗi ngày một chút vẫn hơn một tuần rồi học bù cả buổi.',
];

export function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function previousDate(dateString) {
  return addDays(dateString, -1);
}

export function getWeekKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const year = date.getFullYear();
  const weekOne = new Date(year, 0, 4);
  const week = 1 + Math.round(((date - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Storage can be blocked. */ }
}

export function readRawStorage(key, fallback = null) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function studyTipOfTheDay() {
  const dayIndex = Math.floor(Date.now() / 86400000) % STUDY_TIPS.length;
  return STUDY_TIPS[dayIndex];
}

export function buildWeeklyXp(studyDays = {}) {
  return Object.entries(studyDays).reduce((totals, [date, data]) => {
    const key = getWeekKey(date);
    totals[key] = (totals[key] || 0) + (Number(data?.xp) || 0);
    return totals;
  }, {});
}

export function createInitialProgress() {
  return {
    baiProgress: Object.fromEntries(
      LESSONS.map((bai) => [bai, { completed: false, quizDone: 0, quizCorrect: 0, attemptedIds: [], correctIds: [], firstAttemptCorrectIds: [] }]),
    ),
    xp: 0,
    streak: 0,
    streakFreezes: 1,
    lastFrozenDate: null,
    lastStudyDate: null,
    accuracy: { correct: 0, total: 0 },
    wrongAnswers: [],
    wrongCounts: {},
    unlockedBai: [1],
    achievements: [],
    correctStreak: 0,
    dailyXp: {},
    studyDates: [],
    bossWins: 0,
    studyDays: {},
    dailyGoal: 20,
    todayCount: 0,
    todayDate: localDate(),
    bookmarks: [],
    themeMode: 'auto',
    colorTheme: 'pastel',
    pomodoroSessions: 0,
    pomodoroDate: localDate(),
    goalRewardDates: [],
    srs: {},
    notes: {},
    weeklyXP: {},
    wrongAnswersDetailed: [],
    profile: { name: '', headline: 'Học viên Hán ngữ cấp 3', bio: 'Mỗi ngày tiến thêm một chút trên hành trình chinh phục tiếng Trung.', joinedAt: localDate() },
    settings: { enableBackground: false, background: 'none', overlayOpacity: 88, backgroundBlur: 2 },
    advancedStats: { dictationSessions: 0, dictationAverage: 0, pronunciationAttempts: 0, pronunciationBest: 0 },
  };
}

export function mergeProgress(saved) {
  const initial = createInitialProgress();
  if (!saved || typeof saved !== 'object') return initial;
  const studyDays = saved.studyDays || Object.fromEntries(
    [...(saved.studyDates || []), ...Object.keys(saved.dailyXp || {})].map((date) => [date, { xp: saved.dailyXp?.[date] || 0, questions: 0 }]),
  );
  return {
    ...initial,
    ...saved,
    studyDays,
    profile: { ...initial.profile, ...(saved.profile || {}) },
    settings: {
      ...initial.settings,
      ...(saved.settings || {}),
      overlayOpacity: Math.min(96, Math.max(88, Number(saved.settings?.overlayOpacity) || 88)),
    },
    advancedStats: { ...initial.advancedStats, ...(saved.advancedStats || {}) },
    bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks : [],
    achievements: Array.isArray(saved.achievements) ? saved.achievements : [],
    goalRewardDates: Array.isArray(saved.goalRewardDates) ? saved.goalRewardDates : [],
    wrongAnswers: Array.isArray(saved.wrongAnswers) ? saved.wrongAnswers : [],
    wrongAnswersDetailed: Array.isArray(saved.wrongAnswersDetailed) ? saved.wrongAnswersDetailed : [],
    srs: saved.srs || {},
    notes: saved.notes || {},
    weeklyXP: Object.keys(saved.weeklyXP || {}).length ? saved.weeklyXP : buildWeeklyXp(studyDays),
    accuracy: { ...initial.accuracy, ...(saved.accuracy || {}) },
    baiProgress: Object.fromEntries(
      LESSONS.map((bai) => [bai, { ...initial.baiProgress[bai], ...(saved.baiProgress?.[bai] || {}) }]),
    ),
  };
}

export function cloneProgressForUpdate(previous, baiKey = null) {
  const base = mergeProgress(previous);
  const next = {
    ...base,
    accuracy: { ...base.accuracy },
    wrongCounts: { ...base.wrongCounts },
    dailyXp: { ...base.dailyXp },
    weeklyXP: { ...base.weeklyXP },
    studyDays: { ...base.studyDays },
    srs: { ...base.srs },
    baiProgress: { ...base.baiProgress },
  };
  if (baiKey !== null && baiKey !== undefined) {
    const lesson = next.baiProgress[baiKey] || {
      completed: false, quizDone: 0, quizCorrect: 0, attemptedIds: [], correctIds: [], firstAttemptCorrectIds: [],
    };
    next.baiProgress[baiKey] = {
      ...lesson,
      attemptedIds: [...(lesson.attemptedIds || [])],
      correctIds: [...(lesson.correctIds || [])],
      firstAttemptCorrectIds: [...(lesson.firstAttemptCorrectIds || [])],
    };
  }
  return next;
}

export function rolloverDailyProgress(progress) {
  const next = progress;
  const today = localDate();
  if (next.todayDate !== today) {
    next.todayDate = today;
    next.todayCount = 0;
  }
  if (next.pomodoroDate !== today) {
    next.pomodoroDate = today;
    next.pomodoroSessions = 0;
  }
  return next;
}

export function progressForCourse(saved, course) {
  const merged = rolloverDailyProgress(mergeProgress(saved));
  if (course?.type !== 'built-in') merged.unlockedBai = [...LESSONS];
  return merged;
}

export function evaluateAchievements(progress) {
  const accuracy = progress.accuracy.total ? progress.accuracy.correct / progress.accuracy.total : 0;
  const completedCount = LESSONS.filter((bai) => progress.baiProgress[bai]?.completed).length;
  const conditions = {
    first_lesson: completedCount >= 1,
    streak_3: progress.streak >= 3,
    streak_7: progress.streak >= 7,
    combo_10: progress.correctStreak >= 10,
    clean_book: progress.accuracy.total > 0 && progress.wrongAnswers.length === 0,
    all_lessons: LESSONS.length > 0 && completedCount === LESSONS.length,
    accuracy_90: progress.accuracy.total >= 50 && accuracy >= 0.9,
    boss_first: progress.bossWins >= 1,
  };
  return ACHIEVEMENTS.filter((badge) => conditions[badge.id] && !progress.achievements.includes(badge.id));
}

export const ROUTABLE_SCREENS = new Set([
  'home',
  'library',
  'learn',
  'review',
  'dashboard',
  'community',
  'tutor',
  'exam',
  'boss',
  'minigame',
  'dictation',
  'pronunciation',
  'sentences',
]);

export const DASHBOARD_TABS = new Set(['overview', 'analytics', 'badges', 'profile', 'settings']);

export function parseHashRoute(rawHash = '') {
  const hash = String(rawHash || '');
  if (!hash.startsWith('#/')) return null;
  const parts = hash.slice(2).split('/').filter(Boolean);
  const head = parts[0] || 'home';
  if (!ROUTABLE_SCREENS.has(head)) return null;
  if (head === 'learn') {
    const parsedBai = Number.parseInt(parts[1] || '', 10);
    const bai = Number.isInteger(parsedBai) && parsedBai > 0 ? parsedBai : null;
    return { screen: head, bai };
  }
  if (head === 'dashboard') {
    return { screen: 'dashboard', dashboardTab: DASHBOARD_TABS.has(parts[1]) ? parts[1] : 'overview' };
  }
  return { screen: head };
}

export function buildHashRoute(screen, currentBai, dashboardTab = 'overview') {
  if (!ROUTABLE_SCREENS.has(screen)) return null;
  if (screen === 'home') return '#/';
  if (screen === 'learn') return `#/learn/${currentBai || 1}`;
  if (screen === 'dashboard' && dashboardTab && dashboardTab !== 'overview') return `#/dashboard/${dashboardTab}`;
  return `#/${screen}`;
}
