import glossaryBai01 from '../data/glossary_bai01.json';
import quizBai01 from '../data/quiz_bai01.json';
import textBai01 from '../data/_extracted/bai/bai01.txt?raw';

const LESSON_IMPORTERS = {
  2: () => Promise.all([import('../data/glossary_bai02.json'), import('../data/quiz_bai02.json'), import('../data/_extracted/bai/bai02.txt?raw')]),
  3: () => Promise.all([import('../data/glossary_bai03.json'), import('../data/quiz_bai03.json'), import('../data/_extracted/bai/bai03.txt?raw')]),
  4: () => Promise.all([import('../data/glossary_bai04.json'), import('../data/quiz_bai04.json'), import('../data/_extracted/bai/bai04.txt?raw')]),
  5: () => Promise.all([import('../data/glossary_bai05.json'), import('../data/quiz_bai05.json'), import('../data/_extracted/bai/bai05.txt?raw')]),
  6: () => Promise.all([import('../data/glossary_bai06.json'), import('../data/quiz_bai06.json'), import('../data/_extracted/bai/bai06.txt?raw')]),
  7: () => Promise.all([import('../data/glossary_bai07.json'), import('../data/quiz_bai07.json'), import('../data/_extracted/bai/bai07.txt?raw')]),
  8: () => Promise.all([import('../data/glossary_bai08.json'), import('../data/quiz_bai08.json'), import('../data/_extracted/bai/bai08.txt?raw')]),
  9: () => Promise.all([import('../data/glossary_bai09.json'), import('../data/quiz_bai09.json'), import('../data/_extracted/bai/bai09.txt?raw')]),
  10: () => Promise.all([import('../data/glossary_bai10.json'), import('../data/quiz_bai10.json'), import('../data/_extracted/bai/bai10.txt?raw')]),
};

export const GLOSSARY = {
  1: glossaryBai01,
};

export const QUIZZES = {
  1: quizBai01,
};

export const LESSON_TEXTS = {
  1: textBai01,
};

export const ALL_GLOSSARY_ENTRIES = [...(glossaryBai01.entries || [])];
export const ALL_QUESTIONS = [...(quizBai01.questions || [])];

const builtIn = {
  glossary: { 1: glossaryBai01 },
  quizzes: { 1: quizBai01 },
  texts: { 1: textBai01 },
};

let activeBuiltInMode = true;
const lessonLoadPromises = new Map();
let allBuiltInPromise = null;

function refreshFlatCollections() {
  ALL_GLOSSARY_ENTRIES.splice(
    0,
    ALL_GLOSSARY_ENTRIES.length,
    ...Object.keys(GLOSSARY)
      .sort((a, b) => Number(a) - Number(b))
      .flatMap((key) => GLOSSARY[key]?.entries || []),
  );
  ALL_QUESTIONS.splice(
    0,
    ALL_QUESTIONS.length,
    ...Object.keys(QUIZZES)
      .sort((a, b) => Number(a) - Number(b))
      .flatMap((key) => QUIZZES[key]?.questions || []),
  );
}

/** Tải động dữ liệu Bài 2..10 theo nhu cầu để tránh ép pre-load toàn bộ corpus lúc khởi động. */
export async function loadBuiltInLesson(bai) {
  const num = Number(bai);
  if (builtIn.glossary[num] && builtIn.quizzes[num]) {
    return { glossary: builtIn.glossary[num], quiz: builtIn.quizzes[num], text: builtIn.texts[num] || '' };
  }
  const importer = LESSON_IMPORTERS[num];
  if (!importer) return null;
  if (!lessonLoadPromises.has(num)) {
    lessonLoadPromises.set(num, importer().then(([gMod, qMod, tMod]) => {
      const glossary = gMod.default ?? gMod;
      const quiz = qMod.default ?? qMod;
      const text = tMod.default ?? tMod;
      builtIn.glossary[num] = glossary;
      builtIn.quizzes[num] = quiz;
      builtIn.texts[num] = text;
      if (activeBuiltInMode) {
        GLOSSARY[num] = glossary;
        QUIZZES[num] = quiz;
        LESSON_TEXTS[num] = text;
        refreshFlatCollections();
      }
      return { glossary, quiz, text };
    }));
  }
  return lessonLoadPromises.get(num);
}

/** Tải đủ 10 bài mặc định (dùng một lần khi khởi tạo IndexedDB lần đầu). */
export function ensureAllBuiltInLessons() {
  if (!allBuiltInPromise) {
    allBuiltInPromise = Promise.all(
      Object.keys(LESSON_IMPORTERS).map((key) => loadBuiltInLesson(Number(key))),
    );
  }
  return allBuiltInPromise;
}

export function activateCourseData(course) {
  activeBuiltInMode = course?.type === 'built-in';
  const sources = activeBuiltInMode
    ? {
        glossary: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, builtIn.glossary[index + 1] || chapter.glossary])),
        quizzes: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, builtIn.quizzes[index + 1] || chapter.quiz])),
        texts: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, builtIn.texts[index + 1] ?? (chapter.readingText || '')])),
      }
    : {
        glossary: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.glossary])),
        quizzes: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.quiz])),
        texts: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.readingText || ''])),
      };
  for (const [target, source] of [[GLOSSARY, sources.glossary], [QUIZZES, sources.quizzes], [LESSON_TEXTS, sources.texts]]) {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, source);
  }
  refreshFlatCollections();
  return Object.keys(GLOSSARY).length;
}

export function applyBuiltInEdits(course) {
  if (course?.type !== 'built-in') return;
  for (const [index, chapter] of (course.chapters || []).entries()) {
    const bai = index + 1;
    const storedGrammar = new Map((chapter.glossary?.entries || []).filter((entry) => entry.type === 'grammar').map((entry) => [entry.id, entry]));
    const glossaryEntries = GLOSSARY[bai]?.entries;
    if (glossaryEntries) {
      for (let entryIndex = 0; entryIndex < glossaryEntries.length; entryIndex += 1) {
        const updated = storedGrammar.get(glossaryEntries[entryIndex].id);
        if (updated) glossaryEntries[entryIndex] = updated;
      }
    }
    const storedQuestions = new Map((chapter.quiz?.questions || []).map((question) => [question.id, question]));
    const questions = QUIZZES[bai]?.questions;
    if (questions) {
      for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
        const updated = storedQuestions.get(questions[questionIndex].id);
        if (updated) questions[questionIndex] = updated;
      }
    }
  }
  refreshFlatCollections();
}
