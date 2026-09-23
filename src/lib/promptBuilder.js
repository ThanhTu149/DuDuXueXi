export const CHAPTER_SCHEMA = {
  type: 'object',
  properties: {
    chapter_title_zh: { type: 'string' }, chapter_title_vi: { type: 'string' }, summary_vi: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    vocabulary: { type: 'array', items: { type: 'object', properties: {
      word_zh: { type: 'string' }, pinyin: { type: 'string' }, meaning_vi: { type: 'string' }, meaning_en: { type: 'string' }, word_type: { type: 'string' }, example_zh: { type: 'string' }, example_vi: { type: 'string' },
    }, required: ['word_zh', 'pinyin', 'meaning_vi'] } },
    grammar: { type: 'array', items: { type: 'object', properties: {
      title_zh: { type: 'string' }, title_vi: { type: 'string' }, structure: { type: 'string' }, explanation_vi: { type: 'string' },
      examples: { type: 'array', items: { type: 'object', properties: { zh: { type: 'string' }, pinyin: { type: 'string' }, vi: { type: 'string' } } } },
    } } },
    quiz: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string' }, level: { type: 'string' }, question_vi: { type: 'string' },
      options: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } } } },
      correct_option: { type: 'string' }, explanation_vi: { type: 'string' },
    } } },
  },
  required: ['chapter_title_vi', 'summary_vi', 'vocabulary', 'quiz'],
};

export function buildChapterPrompt(chunk, { subject = 'tiếng Trung', level = 'sơ trung cấp', targetAudience = 'sinh viên Việt Nam', customInstruction = '' } = {}) {
  return `Bạn là người thiết kế bài học ${subject} cho ${targetAudience}, trình độ ${level}.
Hãy đọc đoạn văn và trả về JSON đúng schema. Tạo tiêu đề, tóm tắt ngắn, 3-5 ý chính, từ vựng quan trọng với pinyin có dấu và nghĩa Việt/Anh, ngữ pháp có ví dụ, và câu hỏi trắc nghiệm có 4 đáp án cùng giải thích.
Chỉ trích từ và kiến thức được chứng thực trong đoạn văn. Nếu thiếu dữ liệu, trả về mảng ngắn hoặc rỗng; không tự bịa đủ số lượng. Không lấy header/footer hay bài tập. Không dùng tiếng Hàn.
${customInstruction.trim() ? `HƯỚNG DẪN BỔ SUNG (không được trái với quy tắc chỉ dùng tài liệu): ${customInstruction.trim().slice(0, 1000)}\n` : ''}
ĐOẠN VĂN:
---
${chunk.text}
---`;
}
