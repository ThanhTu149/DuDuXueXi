import { ALL_GLOSSARY_ENTRIES, ALL_QUESTIONS, GLOSSARY } from '../data-loader.js';
import { normalizeText } from './pedagogy.js';

export const CHARACTER_INFO = {
  你: { radical: '亻', strokes: 7 }, 他: { radical: '亻', strokes: 5 }, 们: { radical: '亻', strokes: 5 },
  说: { radical: '讠', strokes: 9 }, 话: { radical: '讠', strokes: 8 }, 请: { radical: '讠', strokes: 10 },
  想: { radical: '心', strokes: 13 }, 情: { radical: '忄', strokes: 11 }, 快: { radical: '忄', strokes: 7 },
  打: { radical: '扌', strokes: 5 }, 找: { radical: '扌', strokes: 7 }, 报: { radical: '扌', strokes: 7 },
  吃: { radical: '口', strokes: 6 }, 喝: { radical: '口', strokes: 12 }, 听: { radical: '口', strokes: 7 },
  好: { radical: '女', strokes: 6 }, 妈: { radical: '女', strokes: 6 }, 姐: { radical: '女', strokes: 8 },
  林: { radical: '木', strokes: 8 }, 校: { radical: '木', strokes: 10 }, 楼: { radical: '木', strokes: 13 },
  没: { radical: '氵', strokes: 7 }, 海: { radical: '氵', strokes: 10 }, 洗: { radical: '氵', strokes: 9 },
  时: { radical: '日', strokes: 7 }, 明: { radical: '日', strokes: 8 }, 晚: { radical: '日', strokes: 11 },
  车: { radical: '车', strokes: 4 }, 路: { radical: '足', strokes: 13 }, 跑: { radical: '足', strokes: 12 },
};

export const RADICALS = {
  氵: 'thủy (nước)', 亻: 'nhân (người)', 讠: 'ngôn (lời nói)', 忄: 'tâm (cảm xúc)', 扌: 'thủ (tay)',
  口: 'khẩu (miệng)', 女: 'nữ', 木: 'mộc (gỗ)', 火: 'hỏa (lửa)', 土: 'thổ (đất)', 金: 'kim',
  日: 'nhật (mặt trời)', 月: 'nguyệt (mặt trăng)', 心: 'tâm', 目: 'mục (mắt)', 耳: 'nhĩ (tai)',
  足: 'túc (chân)', 车: 'xa (xe)', 马: 'mã (ngựa)', 鱼: 'ngư (cá)', 鸟: 'điểu (chim)',
};

export const TYPE_LABELS = {
  mcq_meaning_zh_to_vi: 'Hán → Việt',
  mcq_meaning_vi_to_zh: 'Việt → Hán',
  mcq_pinyin: 'Pinyin',
  mcq_word_type: 'Từ loại',
  mcq_fill_blank: 'Điền từ',
  mcq_grammar: 'Ngữ pháp',
  mcq_error_detection: 'Tìm lỗi sai',
  reading_comprehension: 'Đọc hiểu',
  translation_vi_to_zh: 'Dịch Việt → Trung',
  translation_zh_to_vi: 'Dịch Trung → Việt',
  typing_zh_from_pinyin: 'Gõ chữ Hán',
  sentence_reorder: 'Sắp xếp câu',
};

export function normalizePinyin(value = '') {
  return String(value).toLowerCase().replace(/u:/g, 'ü').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ü/g, 'v').replace(/[^a-zv]/g, '');
}

export function entryTitle(entry = {}) {
  return entry.word_zh || entry.grammar_title_zh || entry.phrase_zh || entry.id || '';
}

export function entryMeaning(entry = {}) {
  return entry.meaning_vi || entry.grammar_title_vi || entry.explanation_vi || entry.usage_note || '';
}

export function getCharacterInfo(char) {
  return CHARACTER_INFO[char] || { radical: null, strokes: null };
}

export function speak(text, lang = 'zh-CN', rate = 0.85, onEnd) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function buildPinyinIndex() {
  const index = {};
  const add = (pinyin, zh, vi = '') => {
    const key = normalizePinyin(pinyin);
    if (!key || !zh || !/[\u3400-\u9fff]/.test(zh)) return;
    index[key] ||= [];
    if (!index[key].some((item) => item.zh === zh)) index[key].push({ zh, vi, pinyin });
  };
  ALL_GLOSSARY_ENTRIES.forEach((entry) => add(entry.pinyin, entry.word_zh || entry.phrase_zh, entry.meaning_vi));
  ALL_QUESTIONS.forEach((question) => add(question.sample_answer_pinyin, question.sample_answer, question.source_sentence_vi));
  return index;
}

let PINYIN_INDEX = buildPinyinIndex();
export function refreshPinyinIndex() {
  PINYIN_INDEX = buildPinyinIndex();
  return PINYIN_INDEX;
}

export function searchPinyin(query) {
  const normalized = normalizePinyin(query);
  if (!normalized) return [];
  return Object.entries(PINYIN_INDEX)
    .filter(([key]) => key.startsWith(normalized))
    .flatMap(([key, items]) => items.map((item) => ({ ...item, key })))
    .slice(0, 20);
}

export function getDictationSentences(bai) {
  const seen = new Set();
  return (GLOSSARY[bai]?.entries || [])
    .map((entry) => ({ zh: entry.example_zh, pinyin: entry.example_pinyin, vi: entry.example_vi, source: entry.id }))
    .filter((sentence) => sentence.zh && sentence.zh.length >= 4 && sentence.zh.length <= 30 && !seen.has(sentence.zh) && seen.add(sentence.zh));
}

export function getSentencesByBai(bai) {
  const seen = new Set();
  return (GLOSSARY[bai]?.entries || [])
    .flatMap((entry) => [
      entry.example_zh ? { zh: entry.example_zh, pinyin: entry.example_pinyin, vi: entry.example_vi, source: entry.id, entry } : null,
      ...(entry.examples || []).map((example) => ({ ...example, source: entry.id, entry })),
    ])
    .filter((sentence) => sentence?.zh && !seen.has(sentence.zh) && seen.add(sentence.zh));
}

export function extractReadingLines(raw = '') {
  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  const start = Math.max(0, lines.findIndex((line) => line.includes('课文')) + 1);
  const end = lines.findIndex((line, index) => index > start && line.includes('生词'));
  return lines
    .slice(start, end > start ? end : lines.length)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => {
      if (!line || !/[\u3400-\u9fff]/.test(line)) return false;
      if (/^(=====|TRANG|[~+\-=]+)$/.test(line)) return false;
      if (/(kewen|text\s*-\s*bai|cecece|eeee)/i.test(line)) return false;
      if (/^[A-Za-z\u3400-\u9fff]{1,4}\s*[:：]\s*$/.test(line)) return false;
      const cjkCount = (line.match(/[\u3400-\u9fff]/g) || []).length;
      const latinJunkCount = (line.match(/[A-Za-z]/g) || []).length;
      if (cjkCount <= 1 && latinJunkCount >= 3) return false;
      return true;
    });
}

export const LESSON_THUMBNAILS = {
  music: { src: '/images/lesson-music.webp', cropClass: 'object-right scale-[1.48] origin-right group-hover:scale-[1.54]' },
  food: { src: '/images/lesson-food.webp', cropClass: 'object-center scale-100 group-hover:scale-105' },
  travel: { src: '/images/lesson-travel.webp', cropClass: 'object-right scale-[1.36] origin-right group-hover:scale-[1.42]' },
  study: { src: '/images/lesson-study.webp', cropClass: 'object-right scale-[1.36] origin-right group-hover:scale-[1.42]' },
};
const LESSON_THUMBNAIL_ORDER = ['study', 'music', 'travel', 'food'];

export function getLessonThumbnail(lesson = {}) {
  const text = `${lesson.title_zh || ''} ${lesson.title_vi || ''} ${lesson.topic || ''}`.toLowerCase();
  let key;
  if (/âm nhạc|nhạc|hát|piano|hòa tấu|音乐|歌|钢琴|曲/.test(text)) key = 'music';
  else if (/ăn|trà|ẩm thực|món|cơm|uống|吃|茶|饭|菜|喝/.test(text)) key = 'food';
  else if (/du lịch|đi|bắc kinh|xe|hộ chiếu|旅游|北京|车|护照|路/.test(text)) key = 'travel';
  else if (/học|sách|văn hóa|phòng họp|viết|学|书|文化|会议|课/.test(text)) key = 'study';
  else {
    const id = Number(lesson.id ?? lesson.bai ?? 0) || 0;
    key = LESSON_THUMBNAIL_ORDER[Math.abs(id) % LESSON_THUMBNAIL_ORDER.length];
  }
  return LESSON_THUMBNAILS[key];
}

export { normalizeText };
