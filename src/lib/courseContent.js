import { getCourse, saveCourse } from './db.js';

const WORD_FIELDS = [
  'word_zh', 'pinyin', 'word_type', 'meaning_vi', 'meaning_en',
  'example_zh', 'example_pinyin', 'example_vi',
];

export async function updateWordInCourse(courseId, entryId, values) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học trong IndexedDB.');
  const chapterIndex = course.chapters.findIndex((chapter) => chapter.glossary?.entries?.some((entry) => entry.id === entryId));
  if (chapterIndex < 0) throw new Error('Không tìm thấy từ vựng trong khóa học.');
  const chapter = course.chapters[chapterIndex];
  const original = chapter.glossary.entries.find((entry) => entry.id === entryId);
  if (original.type !== 'word') throw new Error('Entry này không phải từ vựng.');

  const changes = Object.fromEntries(WORD_FIELDS.map((field) => [field, String(values[field] ?? original[field] ?? '').trim()]));
  if (!changes.word_zh || !changes.pinyin || !changes.meaning_vi) {
    throw new Error('Cần điền chữ Hán, pinyin và nghĩa tiếng Việt.');
  }
  const updatedEntry = { ...original, ...changes };
  const chapters = [...course.chapters];
  chapters[chapterIndex] = {
    ...chapter,
    glossary: {
      ...chapter.glossary,
      entries: chapter.glossary.entries.map((entry) => entry.id === entryId ? updatedEntry : entry),
    },
  };
  await saveCourse({ ...course, chapters });
  return updatedEntry;
}

export async function updateGrammarInCourse(courseId, entryId, values) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học.');
  const chapters = structuredClone(course.chapters);
  const chapter = chapters.find((item) => item.glossary?.entries?.some((entry) => entry.id === entryId));
  if (!chapter) throw new Error('Không tìm thấy điểm ngữ pháp.');
  const index = chapter.glossary.entries.findIndex((entry) => entry.id === entryId);
  const original = chapter.glossary.entries[index];
  if (original.type !== 'grammar') throw new Error('Entry không phải ngữ pháp.');
  const updated = { ...original, ...values, id: original.id, bai: original.bai, type: 'grammar' };
  if (!updated.grammar_title_zh?.trim() || !updated.explanation_vi?.trim()) throw new Error('Cần tên và giải thích ngữ pháp.');
  chapter.glossary.entries[index] = updated;
  await saveCourse({ ...course, chapters });
  return updated;
}

export async function updateQuestionInCourse(courseId, questionId, values) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học.');
  const chapters = structuredClone(course.chapters);
  const chapter = chapters.find((item) => item.quiz?.questions?.some((question) => question.id === questionId));
  if (!chapter) throw new Error('Không tìm thấy câu hỏi.');
  const index = chapter.quiz.questions.findIndex((question) => question.id === questionId);
  const original = chapter.quiz.questions[index];
  const updated = { ...original, ...values, id: original.id, bai: original.bai };
  if (!updated.question_vi?.trim()) throw new Error('Cần câu hỏi tiếng Việt.');
  if (Array.isArray(updated.options)) {
    if (updated.options.length < 2 || updated.options.some((option) => !option.text?.trim()) || new Set(updated.options.map((option) => option.id)).size !== updated.options.length || !updated.options.some((option) => option.id === updated.correct_option)) throw new Error('Cần ít nhất hai lựa chọn khác rỗng và một đáp án đúng.');
  } else if (!updated.sample_answer?.trim()) throw new Error('Câu gõ cần đáp án mẫu.');
  chapter.quiz.questions[index] = updated;
  await saveCourse({ ...course, chapters });
  return updated;
}
