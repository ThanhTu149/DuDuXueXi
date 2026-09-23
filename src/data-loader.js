import glossaryBai01 from '../data/glossary_bai01.json';
import glossaryBai02 from '../data/glossary_bai02.json';
import glossaryBai03 from '../data/glossary_bai03.json';
import glossaryBai04 from '../data/glossary_bai04.json';
import glossaryBai05 from '../data/glossary_bai05.json';
import glossaryBai06 from '../data/glossary_bai06.json';
import glossaryBai07 from '../data/glossary_bai07.json';
import glossaryBai08 from '../data/glossary_bai08.json';
import glossaryBai09 from '../data/glossary_bai09.json';
import glossaryBai10 from '../data/glossary_bai10.json';

import quizBai01 from '../data/quiz_bai01.json';
import quizBai02 from '../data/quiz_bai02.json';
import quizBai03 from '../data/quiz_bai03.json';
import quizBai04 from '../data/quiz_bai04.json';
import quizBai05 from '../data/quiz_bai05.json';
import quizBai06 from '../data/quiz_bai06.json';
import quizBai07 from '../data/quiz_bai07.json';
import quizBai08 from '../data/quiz_bai08.json';
import quizBai09 from '../data/quiz_bai09.json';
import quizBai10 from '../data/quiz_bai10.json';

import textBai01 from '../data/_extracted/bai/bai01.txt?raw';
import textBai02 from '../data/_extracted/bai/bai02.txt?raw';
import textBai03 from '../data/_extracted/bai/bai03.txt?raw';
import textBai04 from '../data/_extracted/bai/bai04.txt?raw';
import textBai05 from '../data/_extracted/bai/bai05.txt?raw';
import textBai06 from '../data/_extracted/bai/bai06.txt?raw';
import textBai07 from '../data/_extracted/bai/bai07.txt?raw';
import textBai08 from '../data/_extracted/bai/bai08.txt?raw';
import textBai09 from '../data/_extracted/bai/bai09.txt?raw';
import textBai10 from '../data/_extracted/bai/bai10.txt?raw';

export const GLOSSARY = {
  1: glossaryBai01,
  2: glossaryBai02,
  3: glossaryBai03,
  4: glossaryBai04,
  5: glossaryBai05,
  6: glossaryBai06,
  7: glossaryBai07,
  8: glossaryBai08,
  9: glossaryBai09,
  10: glossaryBai10,
};

export const QUIZZES = {
  1: quizBai01,
  2: quizBai02,
  3: quizBai03,
  4: quizBai04,
  5: quizBai05,
  6: quizBai06,
  7: quizBai07,
  8: quizBai08,
  9: quizBai09,
  10: quizBai10,
};

export const LESSON_TEXTS = {
  1: textBai01,
  2: textBai02,
  3: textBai03,
  4: textBai04,
  5: textBai05,
  6: textBai06,
  7: textBai07,
  8: textBai08,
  9: textBai09,
  10: textBai10,
};

export const ALL_GLOSSARY_ENTRIES = Object.values(GLOSSARY).flatMap((book) => book.entries);
export const ALL_QUESTIONS = Object.values(QUIZZES).flatMap((quiz) => quiz.questions);

const builtIn = {
  glossary: { ...GLOSSARY },
  quizzes: { ...QUIZZES },
  texts: { ...LESSON_TEXTS },
};

export function activateCourseData(course) {
  const sources = course?.type === 'built-in'
    ? builtIn
    : {
        glossary: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.glossary])),
        quizzes: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.quiz])),
        texts: Object.fromEntries((course?.chapters || []).map((chapter, index) => [index + 1, chapter.readingText || ''])),
      };
  for (const [target, source] of [[GLOSSARY, sources.glossary], [QUIZZES, sources.quizzes], [LESSON_TEXTS, sources.texts]]) {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, source);
  }
  ALL_GLOSSARY_ENTRIES.splice(0, ALL_GLOSSARY_ENTRIES.length, ...Object.values(GLOSSARY).flatMap((book) => book?.entries || []));
  ALL_QUESTIONS.splice(0, ALL_QUESTIONS.length, ...Object.values(QUIZZES).flatMap((quiz) => quiz?.questions || []));
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
  ALL_GLOSSARY_ENTRIES.splice(0, ALL_GLOSSARY_ENTRIES.length, ...Object.values(GLOSSARY).flatMap((book) => book?.entries || []));
  ALL_QUESTIONS.splice(0, ALL_QUESTIONS.length, ...Object.values(QUIZZES).flatMap((quiz) => quiz?.questions || []));
}
