function clean(value) { return String(value || '').trim(); }

export function mergeChunkOutputs(results, chunks = []) {
  const chapters = results.filter((item) => item?.output).sort((a, b) => a.chunkIndex - b.chunkIndex).map(({ chunkIndex, output }, position) => {
    const bai = position + 1;
    const prefix = `bai${String(bai).padStart(2, '0')}`;
    const uniqueWords = [...new Map((Array.isArray(output.vocabulary) ? output.vocabulary : []).filter((word) => clean(word.word_zh) && clean(word.pinyin) && clean(word.meaning_vi)).map((word) => [clean(word.word_zh), word])).values()];
    const words = uniqueWords.map((word, index) => ({ id: `${prefix}_w${String(index + 1).padStart(3, '0')}`, bai, type: 'word', word_zh: clean(word.word_zh), pinyin: clean(word.pinyin), word_type: clean(word.word_type), meaning_vi: clean(word.meaning_vi), meaning_en: clean(word.meaning_en), example_zh: clean(word.example_zh), example_pinyin: null, example_vi: clean(word.example_vi), example_source: 'ai_inferred', related_words: [], tags: ['tu_vung'], source_line: null, confidence: 'medium', note: 'Nội dung do AI tổng hợp từ tài liệu; cần kiểm tra.' }));
    const grammar = (Array.isArray(output.grammar) ? output.grammar : []).filter((item) => clean(item.title_zh || item.title_vi)).map((item, index) => ({ id: `${prefix}_g${String(index + 1).padStart(3, '0')}`, bai, type: 'grammar', grammar_title_zh: clean(item.title_zh), grammar_title_vi: clean(item.title_vi), structure: clean(item.structure), explanation_vi: clean(item.explanation_vi), explanation_zh: '', examples: Array.isArray(item.examples) ? item.examples : [], related_words: [], tags: ['ngu_phap'], source_line: null, confidence: 'medium', note: null }));
    const questions = (Array.isArray(output.quiz) ? output.quiz : []).filter((item) => clean(item.question_vi) && Array.isArray(item.options) && item.options.length >= 2 && item.options.some((option) => option.id === item.correct_option)).map((item, index) => ({ id: `quiz_${prefix}_${String(index + 1).padStart(3, '0')}`, bai, level: ['recall', 'understand', 'apply', 'synthesize'].includes(item.level) ? item.level : 'understand', type: ['mcq_meaning_zh_to_vi', 'mcq_fill_blank', 'reading_comprehension'].includes(item.type) ? item.type : 'mcq_meaning_zh_to_vi', question_vi: clean(item.question_vi), options: item.options.map((option) => ({ id: clean(option.id), text: clean(option.text) })), correct_option: item.correct_option, explanation: { why_correct: clean(item.explanation_vi), why_others_wrong: {}, keyword_tip: '', concept: '' }, related_glossary: [], source: { bai, chunkIndex }, difficulty_score: 2, confidence: 'medium', note: null }));
    const titleZh = clean(output.chapter_title_zh) || `Bài ${bai}`;
    const titleVi = clean(output.chapter_title_vi) || `Bài ${bai}`;
    return { id: prefix, index: bai, title_zh: titleZh, title_vi: titleVi, summary_vi: clean(output.summary_vi), key_points: Array.isArray(output.key_points) ? output.key_points : [], sourceChunkIndex: chunkIndex, readingText: chunks[chunkIndex]?.text || '', glossary: { metadata: { bai, title_zh: titleZh, title_vi: titleVi, total_entries: words.length + grammar.length, word_count: words.length, grammar_count: grammar.length, phrase_count: 0, version: 'ai-1.0' }, entries: [...words, ...grammar] }, quiz: { metadata: { bai, title_zh: titleZh, total_questions: questions.length }, questions } };
  });
  const seen = new Set();
  const uniqueChapters = chapters.map((chapter) => {
    const entries = chapter.glossary.entries.filter((entry) => {
      if (entry.type !== 'word') return true;
      if (seen.has(entry.word_zh)) return false;
      seen.add(entry.word_zh);
      return true;
    });
    const questions = chapter.quiz.questions.map((question) => ({
      ...question,
      related_glossary: entries.filter((entry) => entry.word_zh && [question.question_vi, ...question.options.map((option) => option.text)].some((text) => text.includes(entry.word_zh))).map((entry) => entry.id).slice(0, 4),
    }));
    return { ...chapter, glossary: { ...chapter.glossary, entries, metadata: { ...chapter.glossary.metadata, total_entries: entries.length, word_count: entries.filter((entry) => entry.type === 'word').length } }, quiz: { ...chapter.quiz, questions } };
  });
  return { chapters: uniqueChapters, failedChunks: results.filter((item) => item?.error).map((item) => item.chunkIndex) };
}
