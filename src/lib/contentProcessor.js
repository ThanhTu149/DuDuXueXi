import { getRawDocument, patchRawDocument, getCourse, saveCourse } from './db.js';
import { buildChapterPrompt, CHAPTER_SCHEMA } from './promptBuilder.js';
import { callGemini, DEFAULT_GEMINI_MODEL, GeminiError } from './geminiClient.js';
import { ApiQueue } from './queue.js';
import { mergeChunkOutputs } from './contentMerger.js';

export async function processRawDocument({ rawDocumentId, apiKey, model = DEFAULT_GEMINI_MODEL, customInstruction = '', onProgress = () => {}, signal, queue = new ApiQueue() }) {
  const document = await getRawDocument(rawDocumentId);
  if (!document) throw new Error('Không tìm thấy tài liệu đã nhập.');
  const generated = { ...(document.generated || {}) };
  const total = document.chunks.length;
  const stats = () => {
    const results = Object.values(generated);
    const completed = results.filter((item) => item.output).length;
    const failed = results.filter((item) => item.error && !item.output).length;
    return { completed, failed, processed: completed + failed };
  };
  const report = (phase, current, message) => {
    const currentStats = stats();
    onProgress({ phase, current, completed: currentStats.completed, failed: currentStats.failed, total, percent: total ? Math.round(current / total * 100) : 100, message });
  };
  report('preparing', stats().processed, 'Đang đọc checkpoint đã lưu');
  for (const chunk of document.chunks) {
    if (signal?.aborted) throw new DOMException('Đã hủy.', 'AbortError');
    if (generated[chunk.index]?.output) continue;
    report('calling-ai', stats().processed, `Gemini đang xử lý đoạn ${chunk.index + 1}/${total}`);
    try {
      let attempt = 0;
      // Queue truyền AbortSignal của request hiện tại để cancel() dừng được fetch
      // đang bay (kể cả khi tiến trình bị huỷ từ UI).
      const output = await queue.add((attemptSignal) => {
        attempt += 1;
        const prompt = buildChapterPrompt(chunk, { customInstruction }) + (attempt > 1 ? '\nCHỈ TRẢ VỀ JSON HỢP LỆ, không thêm markdown hoặc lời giải thích ngoài JSON.' : '');
        return callGemini({ apiKey, model, prompt, schema: CHAPTER_SCHEMA, signal: attemptSignal || signal, timeoutMs: 30000 });
      }, {
        signal,
        onWait: (delay) => report('waiting', stats().processed, `Chờ ${Math.ceil(delay / 1000)} giây để tránh giới hạn Gemini`),
        onRetry: ({ attempt, delay, error }) => report('retrying', stats().processed, `Đoạn ${chunk.index + 1} lỗi: ${error.message} · thử lại lần ${attempt} sau ${Math.ceil(delay / 1000)} giây`),
      });
      generated[chunk.index] = { chunkIndex: chunk.index, output };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error instanceof GeminiError && ['auth', 'invalid-request'].includes(error.code)) throw error;
      if (/API key|không có quyền|Model Gemini|Không kết nối/i.test(error.message)) throw error;
      generated[chunk.index] = { chunkIndex: chunk.index, error: error.message };
    }
    const checkpoint = stats();
    await patchRawDocument(document.id, { generated, status: queue.paused ? 'paused' : 'processing', processingCheckpoint: { ...checkpoint, lastChunkIndex: chunk.index, savedAt: new Date().toISOString() } });
    report('calling-ai', checkpoint.processed, `Đã lưu ${checkpoint.completed} đoạn${checkpoint.failed ? ` · ${checkpoint.failed} lỗi` : ''}`);
  }
  report('merging', total, 'Đang ghép các chương');
  const merged = mergeChunkOutputs(Object.values(generated), document.chunks);
  if (!merged.chapters.length) {
    await patchRawDocument(document.id, { generated, status: 'failed' });
    throw new Error('Không có đoạn nào được Gemini xử lý thành công. Kiểm tra API key, model và lỗi mạng rồi thử lại.');
  }
  await patchRawDocument(document.id, { generated, status: 'processed', draftChapters: merged.chapters, processingCheckpoint: { ...stats(), lastChunkIndex: total - 1, savedAt: new Date().toISOString() } });
  const course = await getCourse(document.courseId);
  await saveCourse({ ...course, status: 'review' });
  report('saving', total, 'Đã lưu bản nháp để duyệt');
  return merged;
}

export function normalizeChapters(chapters) {
  return chapters.map((chapter, index) => {
    const bai = index + 1;
    const prefix = `bai${String(bai).padStart(2, '0')}`;
    const ids = new Map();
    const entries = chapter.glossary.entries.map((entry) => {
      const id = `${prefix}_${entry.type === 'grammar' ? 'g' : entry.type === 'phrase' ? 'p' : 'w'}${String((chapter.glossary.entries.filter((item) => item.type === entry.type).findIndex((item) => item.id === entry.id)) + 1).padStart(3, '0')}`;
      ids.set(entry.id, id);
      return { ...entry, id, bai };
    });
    const linkedEntries = entries.map((entry) => ({ ...entry, related_words: (entry.related_words || []).map((id) => ids.get(id)).filter(Boolean) }));
    const questions = chapter.quiz.questions.map((question, questionIndex) => ({ ...question, id: `quiz_${prefix}_${String(questionIndex + 1).padStart(3, '0')}`, bai, related_glossary: (question.related_glossary || []).map((id) => ids.get(id)).filter(Boolean), source: { ...(question.source || {}), bai } }));
    return { ...chapter, id: prefix, index: bai, glossary: { ...chapter.glossary, metadata: { ...chapter.glossary.metadata, bai, title_zh: chapter.title_zh, title_vi: chapter.title_vi, total_entries: linkedEntries.length }, entries: linkedEntries }, quiz: { ...chapter.quiz, metadata: { ...chapter.quiz.metadata, bai, title_zh: chapter.title_zh, total_questions: questions.length }, questions } };
  });
}

export async function commitChapters(courseId, chapters) {
  if (!chapters.length) throw new Error('Chưa có chương hợp lệ để lưu.');
  const course = await getCourse(courseId);
  if (!course) throw new Error('Không tìm thấy khóa học.');
  const normalized = normalizeChapters(chapters);
  return saveCourse({ ...course, chapters: normalized, status: 'ready', metadata: { ...(course.metadata || {}), totalBai: normalized.length, totalEntries: normalized.reduce((sum, chapter) => sum + chapter.glossary.entries.length, 0), totalQuestions: normalized.reduce((sum, chapter) => sum + chapter.quiz.questions.length, 0) } });
}
