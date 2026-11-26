import { GLOSSARY, LESSON_TEXTS, QUIZZES, ensureAllBuiltInLessons } from '../data-loader.js';
import {
  BUILT_IN_COURSE_ID,
  getCourse,
  getProgress,
  getSettings,
  initDB,
  isMigrationDone,
  saveCourse,
  saveProgress,
  saveSettings,
} from './db.js';
import { readLocalJson } from './storage.js';

const LESSONS = Array.from({ length: 10 }, (_, index) => index + 1);

function migrateBaiProgress(previous = {}) {
  return Object.fromEntries(LESSONS.map((bai) => {
    const chapterId = `bai${String(bai).padStart(2, '0')}`;
    const saved = previous[chapterId] || previous[bai] || {};
    return [chapterId, {
      completed: false,
      quizDone: 0,
      quizCorrect: 0,
      attemptedIds: [],
      correctIds: [],
      ...saved,
    }];
  }));
}

function builtInChapters() {
  return LESSONS.map((bai) => {
    const id = `bai${String(bai).padStart(2, '0')}`;
    const glossary = GLOSSARY[bai];
    const quiz = QUIZZES[bai];
    if (!glossary || !quiz) throw new Error(`Thieu du lieu goc cho ${id}.`);
    return {
      id,
      index: bai,
      title_zh: glossary.metadata.title_zh || quiz.metadata.title_zh || '',
      title_vi: glossary.metadata.title_vi || '',
      glossary,
      quiz,
      readingText: LESSON_TEXTS[bai] || '',
    };
  });
}

function builtInCourse(chapters) {
  const now = new Date().toISOString();
  return {
    id: BUILT_IN_COURSE_ID,
    name: 'Hán Ngữ Tập 2',
    description: 'Giáo trình Hán ngữ tập 2 - 10 bài',
    type: 'built-in',
    sourceFile: null,
    createdAt: now,
    updatedAt: now,
    metadata: {
      totalBai: chapters.length,
      totalEntries: chapters.reduce((sum, chapter) => sum + chapter.glossary.entries.length, 0),
      totalQuestions: chapters.reduce((sum, chapter) => sum + chapter.quiz.questions.length, 0),
      language: 'zh-VI',
    },
    chapters,
  };
}

function initialProgress() {
  const legacy = readLocalJson('dudu-progress-v1', null);
  const progress = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};
  return {
    ...progress,
    xp: progress.xp || 0,
    streak: progress.streak || 0,
    lastStudyDate: progress.lastStudyDate || null,
    accuracy: progress.accuracy || { correct: 0, total: 0 },
    baiProgress: migrateBaiProgress(progress.baiProgress),
    wrongAnswers: progress.wrongAnswers || [],
    bookmarks: progress.bookmarks || [],
    notes: progress.notes || {},
    srs: progress.srs || {},
    studyDays: progress.studyDays || {},
    dailyGoal: progress.dailyGoal || 20,
    settings: {
      ...(progress.settings || {}),
      background: progress.settings?.background || 'none',
      overlayOpacity: progress.settings?.overlayOpacity ?? 90,
      theme: progress.themeMode || readLocalJson('dudu-theme-mode', 'auto'),
    },
  };
}

export async function migrateLegacyData() {
  await initDB();
  if (await isMigrationDone()) return { migrated: false, courseId: BUILT_IN_COURSE_ID };

  let course = await getCourse(BUILT_IN_COURSE_ID);
  if (!course) {
    await ensureAllBuiltInLessons();
    course = await saveCourse(builtInCourse(builtInChapters()));
  }
  if (!await getProgress(BUILT_IN_COURSE_ID)) {
    await saveProgress(BUILT_IN_COURSE_ID, initialProgress());
  }

  const settings = await getSettings();
  await saveSettings({
    activeCourseId: settings.activeCourseId || BUILT_IN_COURSE_ID,
    theme: settings.theme === 'auto'
      ? (readLocalJson('dudu-progress-v1', null)?.themeMode || readLocalJson('dudu-theme-mode', 'auto'))
      : settings.theme,
    migrationDone: true,
  });
  return { migrated: true, courseId: course.id, chapters: course.chapters.length };
}
