import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES, ALL_QUESTIONS, GLOSSARY, LESSON_TEXTS, QUIZZES, activateCourseData, applyBuiltInEdits } from './data-loader.js';
import { BUILT_IN_COURSE_ID, getCourse, getProgress, getSettings, migrateBuiltInCourse, saveProgress, saveSettings } from './lib/db.js';
import { DEFAULT_GEMINI_MODEL, testApiKey } from './lib/geminiClient.js';
import { updateWordInCourse, updateGrammarInCourse, updateQuestionInCourse } from './lib/courseContent.js';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import WordEditorModal from './components/editors/WordEditorModal.jsx';
const LibraryScreen = lazy(() => import('./screens/LibraryScreen.jsx'));
const ImportScreen = lazy(() => import('./screens/ImportScreen.jsx'));
const ProcessingScreen = lazy(() => import('./screens/ProcessingScreen.jsx'));
const ReviewGeneratedScreen = lazy(() => import('./screens/ReviewGeneratedScreen.jsx'));
import GlobalCourseSearch from './components/GlobalCourseSearch.jsx';
import ContentEditorModal from './components/editors/ContentEditorModal.jsx';
import TypingEditorModal from './components/editors/TypingEditorModal.jsx';
import ModelSelector from './components/ModelSelector.jsx';
import { getActiveProcessingJobs, resumeInterruptedJobs, subscribeProcessingJobs } from './lib/processingJobs.js';
import useDialogA11y from './lib/useDialogA11y.js';

const LESSONS = Array.from({ length: 10 }, (_, index) => index + 1);
const TYPING_TYPES = new Set([
 'translation_vi_to_zh',
 'translation_zh_to_vi',
 'typing_zh_from_pinyin',
 'sentence_reorder',
]);

const XP_REWARDS = {
 mcq: 10,
 typingHigh: 15,
 typingMid: 8,
 correction: 5,
 lesson: 50,
 boss: 100,
 dailyGoal: 25,
};

const SRS_INTERVALS = [0, 1, 3, 7, 14, 30];
const SRS_RATINGS = [
 { id: 'forgot', shortcut: '1', label: 'Quên', tone: 'bg-error-subtle text-error dark:bg-error-subtle dark:text-error' },
 { id: 'hard', shortcut: '2', label: 'Khó', tone: 'bg-warning-subtle text-warning' },
 { id: 'good', shortcut: '3', label: 'Được', tone: 'bg-success-subtle text-success dark:bg-success-subtle dark:text-success' },
 { id: 'easy', shortcut: '4', label: 'Dễ', tone: 'bg-accent-2-subtle text-accent-2 dark:bg-accent-2-subtle dark:text-accent-2' },
];

const ACHIEVEMENTS = [
 { id: 'first_lesson', title: 'Bước đầu vững chắc', description: 'Hoàn thành bài đầu tiên' },
 { id: 'streak_3', title: 'Nhịp học 3 ngày', description: 'Duy trì streak 3 ngày' },
 { id: 'streak_7', title: 'Bền bỉ một tuần', description: 'Duy trì streak 7 ngày' },
 { id: 'combo_10', title: 'Chuỗi 10 câu', description: 'Trả lời đúng 10 câu liên tiếp' },
 { id: 'clean_book', title: 'Sổ tay sạch', description: 'Không còn câu sai cần ôn' },
 { id: 'all_lessons', title: 'Thông thạo khóa học', description: 'Hoàn thành toàn bộ bài học' },
 { id: 'accuracy_90', title: 'Chính xác xuất sắc', description: 'Đạt 90% sau ít nhất 50 câu' },
 { id: 'boss_first', title: 'Hạ Boss đầu tiên', description: 'Thắng một trận Boss Battle' },
];

const CHARACTER_INFO = {
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

const RADICALS = {
 氵: 'thủy (nước)', 亻: 'nhân (người)', 讠: 'ngôn (lời nói)', 忄: 'tâm (cảm xúc)', 扌: 'thủ (tay)',
 口: 'khẩu (miệng)', 女: 'nữ', 木: 'mộc (gỗ)', 火: 'hỏa (lửa)', 土: 'thổ (đất)', 金: 'kim',
 日: 'nhật (mặt trời)', 月: 'nguyệt (mặt trăng)', 心: 'tâm', 目: 'mục (mắt)', 耳: 'nhĩ (tai)',
 足: 'túc (chân)', 车: 'xa (xe)', 马: 'mã (ngựa)', 鱼: 'ngư (cá)', 鸟: 'điểu (chim)',
};

const TYPE_LABELS = {
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

const THEMES = {
 pastel: { name: 'Học thuật', vars: { '--accent': '#3F6B43', '--accent-hover': '#315837', '--accent-subtle': '#EEF4EC', '--accent-2': '#3A6B8C', '--accent-2-subtle': '#ECF1F5' } },
 rose: { name: 'Hoa đào', vars: { '--accent': '#A04561', '--accent-hover': '#873750', '--accent-subtle': '#F9EDF1', '--accent-2': '#426C7A', '--accent-2-subtle': '#EDF3F5' } },
 ocean: { name: 'Biển xanh', vars: { '--accent': '#286776', '--accent-hover': '#205463', '--accent-subtle': '#EAF3F5', '--accent-2': '#775A37', '--accent-2-subtle': '#F5F0EA' } },
};

function normalizeText(value = '') {
 return String(value).trim().toLowerCase().replace(/[，。？！、；：“”‘’（）《》〈〉]/g, '').replace(/[.,?!;:"'()\[\]{}]/g, '').replace(/\s+/g, '');
}

function normalizePinyin(value = '') {
 return String(value).toLowerCase().replace(/u:/g, 'ü').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ü/g, 'v').replace(/[^a-zv]/g, '');
}

function levenshtein(a, b) {
 const matrix = Array.from({ length: b.length + 1 }, (_, row) => Array.from({ length: a.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
 for (let row = 1; row <= b.length; row += 1) for (let column = 1; column <= a.length; column += 1) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (b[row - 1] === a[column - 1] ? 0 : 1));
 return matrix[b.length][a.length];
}

function calculateSimilarity(a, b) {
 const left = normalizeText(a); const right = normalizeText(b); const longest = Math.max(left.length, right.length, 1);
 return Math.max(0, Math.round((1 - levenshtein(left, right) / longest) * 100));
}

function gradeTyping(userAnswer, question) {
 const user = normalizeText(userAnswer); const sample = normalizeText(question.sample_answer); const required = question.keywords_required || [];
 const found = required.filter((keyword) => user.includes(normalizeText(keyword.zh || keyword.vi || '')));
 if (!user) return { score: 0, level: 'wrong', found };
 if (user === sample || (question.alternative_answers || []).some((answer) => user === normalizeText(answer))) return { score: 100, level: 'perfect', found };
 const similarity = calculateSimilarity(user, sample);
 if (similarity >= 85) return { score: similarity, level: 'close', found };
 const ratio = required.length ? found.length / required.length : 0;
 if (ratio === 1) return { score: 75, level: 'kw_full', found };
 if (ratio >= 0.5) return { score: Math.round(ratio * 60), level: 'kw_partial', found };
 return { score: 0, level: 'wrong', found };
}

function shuffleArray(items) {
 const copy = [...items];
 for (let index = copy.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [copy[index], copy[target]] = [copy[target], copy[index]]; }
 return copy;
}

function localDate(date = new Date()) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function addDays(dateString, days) { const date = new Date(`${dateString}T12:00:00`); date.setDate(date.getDate() + days); return localDate(date); }
function previousDate(dateString) { return addDays(dateString, -1); }
function getWeekKey(value = new Date()) { const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7)); const year = date.getFullYear(); const weekOne = new Date(year, 0, 4); const week = 1 + Math.round(((date - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7); return `${year}-W${String(week).padStart(2, '0')}`; }
function readStorage(key, fallback) { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be blocked. */ } }
function readRawStorage(key, fallback = null) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function getAutoTheme() { const hour = new Date().getHours(); return hour >= 6 && hour < 18 ? 'light' : 'dark'; }

function buildWeeklyXp(studyDays = {}) { return Object.entries(studyDays).reduce((totals, [date, data]) => { const key = getWeekKey(date); totals[key] = (totals[key] || 0) + (Number(data?.xp) || 0); return totals; }, {}); }
function createSrsEntry() { return { level: 0, nextReview: localDate(), lastReview: null, ease: 2.5, interval: 0 }; }
function calculateNextReview(srs = {}, rating) { let level = Number(srs.level) || 0; let ease = Number(srs.ease) || 2.5; if (rating === 'forgot') { level = 0; ease = Math.max(1.3, ease - 0.2); } else if (rating === 'hard') { level = Math.max(0, level - 1); ease = Math.max(1.3, ease - 0.15); } else if (rating === 'good') level = Math.min(5, level + 1); else if (rating === 'easy') { level = Math.min(5, level + 2); ease += 0.15; } const interval = SRS_INTERVALS[level]; return { level, ease: Number(ease.toFixed(2)), interval, lastReview: localDate(), nextReview: addDays(localDate(), interval) }; }
function getDueEntries(srs = {}) { return Object.entries(srs).filter(([, data]) => data?.nextReview <= localDate()).map(([id, data]) => { const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); return entry ? { ...entry, srs: data } : null; }).filter(Boolean); }
function entryTitle(entry = {}) { return entry.word_zh || entry.grammar_title_zh || entry.phrase_zh || entry.id || ''; }
function entryMeaning(entry = {}) { return entry.meaning_vi || entry.grammar_title_vi || entry.explanation_vi || entry.usage_note || ''; }

function createInitialProgress() {
 return {
  baiProgress: Object.fromEntries(LESSONS.map((bai) => [bai, { completed: false, quizDone: 0, quizCorrect: 0, attemptedIds: [], correctIds: [] }])),
  xp: 0, streak: 0, lastStudyDate: null, accuracy: { correct: 0, total: 0 }, wrongAnswers: [], wrongCounts: {}, unlockedBai: [1], achievements: [], correctStreak: 0, dailyXp: {}, studyDates: [], bossWins: 0,
  studyDays: {}, dailyGoal: 20, todayCount: 0, todayDate: localDate(), bookmarks: [], themeMode: 'auto', colorTheme: 'pastel', pomodoroSessions: 0, pomodoroDate: localDate(), goalRewardDates: [], srs: {}, notes: {}, weeklyXP: {}, wrongAnswersDetailed: [],
  profile: { name: 'Nguyễn Văn A', headline: 'Học viên Hán ngữ cấp 3', bio: 'Mỗi ngày tiến thêm một chút trên hành trình chinh phục tiếng Trung.', joinedAt: addDays(localDate(), -30) },
  settings: { enableBackground: false, background: 'none', overlayOpacity: 88, backgroundBlur: 2 },
  advancedStats: { dictationSessions: 0, dictationAverage: 0, pronunciationAttempts: 0, pronunciationBest: 0 },
 };
}

function mergeProgress(saved) {
 const initial = createInitialProgress(); if (!saved || typeof saved !== 'object') return initial;
 const studyDays = saved.studyDays || Object.fromEntries([...(saved.studyDates || []), ...Object.keys(saved.dailyXp || {})].map((date) => [date, { xp: saved.dailyXp?.[date] || 0, questions: 0 }]));
 return { ...initial, ...saved, studyDays, profile: { ...initial.profile, ...(saved.profile || {}) }, settings: { ...initial.settings, ...(saved.settings || {}), overlayOpacity: Math.min(96, Math.max(88, Number(saved.settings?.overlayOpacity) || 88)) }, advancedStats: { ...initial.advancedStats, ...(saved.advancedStats || {}) }, bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks : [], achievements: Array.isArray(saved.achievements) ? saved.achievements : [], goalRewardDates: Array.isArray(saved.goalRewardDates) ? saved.goalRewardDates : [], wrongAnswers: Array.isArray(saved.wrongAnswers) ? saved.wrongAnswers : [], wrongAnswersDetailed: Array.isArray(saved.wrongAnswersDetailed) ? saved.wrongAnswersDetailed : [], srs: saved.srs || {}, notes: saved.notes || {}, weeklyXP: Object.keys(saved.weeklyXP || {}).length ? saved.weeklyXP : buildWeeklyXp(studyDays), accuracy: { ...initial.accuracy, ...(saved.accuracy || {}) }, baiProgress: Object.fromEntries(LESSONS.map((bai) => [bai, { ...initial.baiProgress[bai], ...(saved.baiProgress?.[bai] || {}) }])) };
}

function rolloverDailyProgress(progress) { const next = progress; const today = localDate(); if (next.todayDate !== today) { next.todayDate = today; next.todayCount = 0; } if (next.pomodoroDate !== today) { next.pomodoroDate = today; next.pomodoroSessions = 0; } return next; }

function progressForCourse(saved, course) {
 const merged = rolloverDailyProgress(mergeProgress(saved));
 if (course?.type !== 'built-in') merged.unlockedBai = [...LESSONS];
 return merged;
}

function speak(text, lang = 'zh-CN', rate = 0.85, onEnd) { if (!text || !('speechSynthesis' in window)) return false; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = lang; utterance.rate = rate; utterance.onend = () => onEnd?.(); utterance.onerror = () => onEnd?.(); window.speechSynthesis.speak(utterance); return true; }

function buildPinyinIndex() { const index = {}; const add = (pinyin, zh, vi = '') => { const key = normalizePinyin(pinyin); if (!key || !zh || !/[\u3400-\u9fff]/.test(zh)) return; index[key] ||= []; if (!index[key].some((item) => item.zh === zh)) index[key].push({ zh, vi, pinyin }); }; ALL_GLOSSARY_ENTRIES.forEach((entry) => add(entry.pinyin, entry.word_zh || entry.phrase_zh, entry.meaning_vi)); ALL_QUESTIONS.forEach((question) => add(question.sample_answer_pinyin, question.sample_answer, question.source_sentence_vi)); return index; }
let PINYIN_INDEX = buildPinyinIndex();
function searchPinyin(query) { const normalized = normalizePinyin(query); if (!normalized) return []; return Object.entries(PINYIN_INDEX).filter(([key]) => key.startsWith(normalized)).flatMap(([key, items]) => items.map((item) => ({ ...item, key }))).slice(0, 20); }
function getDictationSentences(bai) { const seen = new Set(); return GLOSSARY[bai].entries.map((entry) => ({ zh: entry.example_zh, pinyin: entry.example_pinyin, vi: entry.example_vi, source: entry.id })).filter((sentence) => sentence.zh && sentence.zh.length >= 4 && sentence.zh.length <= 30 && !seen.has(sentence.zh) && seen.add(sentence.zh)); }
function getSentencesByBai(bai) { const seen = new Set(); return GLOSSARY[bai].entries.flatMap((entry) => [entry.example_zh ? { zh: entry.example_zh, pinyin: entry.example_pinyin, vi: entry.example_vi, source: entry.id, entry } : null, ...(entry.examples || []).map((example) => ({ ...example, source: entry.id, entry }))]).filter((sentence) => sentence?.zh && !seen.has(sentence.zh) && seen.add(sentence.zh)); }
function getCharacterInfo(char) { return CHARACTER_INFO[char] || { radical: null, strokes: null }; }

const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;

function playTone(frequency, duration, type = 'sine') {
 if (!audioCtx) return;
 const isSoundEnabled = localStorage.getItem('dudu-sound-enabled') !== 'false';
 if (!isSoundEnabled) return;
 
 if (audioCtx.state === 'suspended') audioCtx.resume();
 const osc = audioCtx.createOscillator();
 const gain = audioCtx.createGain();
 osc.type = type;
 osc.frequency.value = frequency;
 osc.connect(gain);
 gain.connect(audioCtx.destination);
 gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
 gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
 osc.start(audioCtx.currentTime);
 osc.stop(audioCtx.currentTime + duration);
}

const sounds = {
 correct: () => {
 playTone(523, 0.1);
 setTimeout(() => playTone(659, 0.1), 100);
 setTimeout(() => playTone(784, 0.15), 200);
 },
 wrong: () => playTone(200, 0.3, 'sawtooth'),
 levelUp: () => {
 playTone(523, 0.1);
 setTimeout(() => playTone(659, 0.1), 100);
 setTimeout(() => playTone(784, 0.1), 200);
 setTimeout(() => playTone(1046, 0.3), 300);
 },
 achievement: () => {
 playTone(659, 0.15);
 setTimeout(() => playTone(784, 0.15), 150);
 setTimeout(() => playTone(1046, 0.3), 300);
 },
 click: () => playTone(800, 0.05),
};

function applyTheme(themeKey, isDark = false) {
 const theme = THEMES[themeKey];
 if (!theme) return;
 const root = document.documentElement;
 const darkVars = {
  pastel: { '--accent': '#7BA87D', '--accent-hover': '#8FBB91', '--accent-subtle': '#1F2A20', '--accent-2': '#5A8FB0', '--accent-2-subtle': '#1A242C' },
  rose: { '--accent': '#E08CA5', '--accent-hover': '#EDA5B8', '--accent-subtle': '#32232B', '--accent-2': '#83B4BE', '--accent-2-subtle': '#1D2D32' },
  ocean: { '--accent': '#75B7C4', '--accent-hover': '#8BC8D2', '--accent-subtle': '#1C2B30', '--accent-2': '#C8AA7C', '--accent-2-subtle': '#30271D' },
 };
 for (const [key, value] of Object.entries(isDark ? darkVars[themeKey] : theme.vars)) root.style.setProperty(key, value);
}

const Icon = {
  Home: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Book: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  Check: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12"/></svg>,
  Refresh: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  Chart: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Search: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Pen: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  Trophy: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,
  Sun: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  Settings: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Play: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Pause: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  Volume: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mic: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>,
  Star: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Bookmark: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  ChevronRight: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="9 18 15 12 9 6"/></svg>,
  ChevronLeft: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="15 18 9 12 15 6"/></svg>,
  X: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Plus: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Minus: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Flame: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>,
  Target: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Zap: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Gamepad: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>,
  Headphones: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>,
  Type: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  Clock: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  Calendar: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>,
  Download: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>,
  Upload: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 16V4M7 9l5-5 5 5M4 21h16"/></svg>,
  Bell: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  User: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 21a8 8 0 00-16 0"/><circle cx="12" cy="7" r="4"/></svg>
};

const MASCOTS = {
  panda: { emoji: '🐼', name: 'Trúc', role: 'senpai' },
  penguin: { emoji: '🐧', name: 'Băng', role: 'kohai' },
};

function Mascot({ type = 'panda', size = 'md', className = '' }) {
  const sizes = {
    sm: 'text-3xl',
    md: 'text-5xl',
    lg: 'text-7xl',
    xl: 'text-8xl',
  };
  const mascot = MASCOTS[type];
  return (
    <div className={`${sizes[size]} ${className} select-none`} aria-label={`Linh vật ${mascot.name}`} role="img">
      {mascot.emoji}
    </div>
  );
}

function ProgressBar({ value, className = '', label = 'Tiến độ' }) { const safe = Math.min(100, Math.max(0, Number(value) || 0)); return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe} className={`h-2 overflow-hidden rounded-full bg-bg-tertiary ${className}`}><div className="h-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${safe / 100})` }} /></div>; }

function SpeakButton({ text, lang = 'zh-CN', className = '' }) {
 const [speaking, setSpeaking] = useState(false);
 return <button type="button" onClick={(event) => { event.stopPropagation(); setSpeaking(true); if (!speak(text, lang, 0.85, () => setSpeaking(false))) setSpeaking(false); }} disabled={!text || !('speechSynthesis' in window)} className={`icon-action grid h-8 w-8 shrink-0 place-items-center rounded-md bg-bg-tertiary text-text-secondary transition hover:text-accent disabled:opacity-40 ${className}`} aria-label={`Đọc to ${text || ''}`} data-tooltip="Phát âm">{speaking ? '•••' : <Icon.Volume className="h-4 w-4" />}</button>;
}

function SectionHeading({ eyebrow, title, action }) { return <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-widest text-accent">{eyebrow}</p><h1 className="mt-1 text-3xl font-bold text-text-primary">{title}</h1></div>{action}</div>; }

function BottomNav({ screen, onNavigate }) { return <nav aria-label="Điều hướng nhanh" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg-secondary p-2 lg:hidden">{NAV_ITEMS.filter((item) => item.id !== 'library').map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-semibold ${screen === item.id ? 'bg-accent-subtle text-accent' : 'text-text-muted'}`}>{item.icon}<span className="truncate">{item.label}</span></button>)}</nav>; }

function StreakCalendar({ studyDays = {}, streak = 0 }) { const days = Array.from({ length: 28 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (27 - index)); const key = localDate(date); return { key, active: Boolean(studyDays[key]?.questions || studyDays[key]?.xp) }; }); return <div><h2 className="text-lg font-bold">Lịch học</h2><div className="mt-5 grid grid-cols-7 gap-2">{days.map((day) => <span key={day.key} title={day.key} className={`aspect-square rounded ${day.active ? 'bg-accent' : 'bg-bg-tertiary'}`} />)}</div><p className="mt-3 text-sm font-bold text-text-muted">Chuỗi hiện tại: {streak} ngày</p></div>; }

function SearchModal({ isOpen, onClose, onSelect }) {
 const [query, setQuery] = useState('');
 useEffect(() => { if (isOpen) setQuery(''); }, [isOpen]);
 useEffect(() => {
   if (!isOpen) return undefined;
   const onKey = (e) => { if (e.key === 'Escape') onClose(); };
   window.addEventListener('keydown', onKey);
   return () => window.removeEventListener('keydown', onKey);
 }, [isOpen, onClose]);
 const trapRef = useDialogA11y(isOpen, onClose);
 if (!isOpen) return null;
 const normalized = query.toLowerCase().trim();
 const pinyinQuery = normalizePinyin(query);
 const results = normalized ? ALL_GLOSSARY_ENTRIES.filter((entry) => [entryTitle(entry), entryMeaning(entry), entry.meaning_en].some((value) => String(value || '').toLowerCase().includes(normalized)) || (pinyinQuery && normalizePinyin(entry.pinyin).includes(pinyinQuery))).slice(0, 30) : [];
 return <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-6 pt-[10vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={trapRef} role="dialog" aria-modal="true" aria-label="Tìm kiếm" className="animate-modal-in w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-lg"><div className="flex items-center gap-3 border-b border-border p-4"><Icon.Search className="h-5 w-5 text-text-muted" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm chữ Hán, pinyin hoặc nghĩa..." className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Ô tìm kiếm" /><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded bg-bg-tertiary" aria-label="Đóng tìm kiếm"><Icon.X /></button></div><div className="max-h-[60vh] overflow-y-auto p-2">{!query && <p className="p-5 text-center text-sm text-text-muted">Nhập từ khóa để tìm trong 10 bài.</p>}{query && !results.length && <p className="p-5 text-center text-sm text-text-muted">Không tìm thấy kết quả.</p>}{results.map((entry) => <button key={entry.id} onClick={() => onSelect({ bai: entry.bai, entry })} className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-bg-tertiary"><span><span className="block text-lg font-bold">{entryTitle(entry)}</span><span className="block text-sm text-text-muted">{entry.pinyin || entryMeaning(entry)}</span></span><span className="text-xs font-bold text-accent">Bài {entry.bai}</span></button>)}</div></section></div>;
}

function KeyboardShortcutsModal({ isOpen, onClose }) {
  const trapRef = useDialogA11y(isOpen, onClose);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const shortcuts = [['Ctrl K', 'Tìm kiếm'], ['G L', 'Thư viện'], ['G H', 'Lộ trình'], ['G Q', 'Quiz'], ['G R', 'Ôn tập'], ['1–4', 'Chọn đáp án Quiz'], ['Enter', 'Câu tiếp theo'], ['Ctrl E', 'Sửa mục đang mở'], ['Ctrl B', 'Đánh dấu mục đang mở'], ['Ctrl Shift D', 'Sáng / tối'], ['Esc', 'Đóng cửa sổ']];
  return <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={trapRef} role="dialog" aria-modal="true" aria-label="Phím tắt bàn phím" className="animate-modal-in max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-bg-secondary p-6 shadow-lg"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Phím tắt</h2><button onClick={onClose} aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded bg-bg-tertiary"><Icon.X /></button></div><div className="mt-5 space-y-2">{shortcuts.map(([key, label]) => <div key={key} className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2"><span>{label}</span><kbd className="rounded border border-border bg-bg-secondary px-2 py-1 text-xs font-bold">{key}</kbd></div>)}</div></section></div>;
}

function BookmarkButton({ entryId, bookmarks = [], onToggle }) { const active = bookmarks.includes(entryId); return <button type="button" onClick={(event) => { event.stopPropagation(); onToggle?.(entryId); }} className={`icon-action grid h-8 w-8 place-items-center rounded-md ${active ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`} aria-label={active ? 'Bỏ đánh dấu' : 'Đánh dấu'} data-tooltip={active ? 'Bỏ đánh dấu' : 'Đánh dấu'}><Icon.Bookmark className="h-4 w-4" /></button>; }

function NoteEditor({ entryId, note = '', onSave }) { const [open, setOpen] = useState(false); const [draft, setDraft] = useState(note); const close = useCallback(() => setOpen(false), []); const trapRef = useDialogA11y(open, close); useEffect(() => { if (open) setDraft(note); }, [open, note]); return <><button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} className={`icon-action grid h-8 w-8 place-items-center rounded-md ${note ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`} aria-label="Ghi chú" data-tooltip="Ghi chú"><Icon.Pen className="h-4 w-4" /></button>{open && <div className="modal-backdrop fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Ghi chú cá nhân" className="animate-modal-in w-full max-w-lg rounded-xl bg-bg-secondary p-5 shadow-lg"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Ghi chú cá nhân</h2><button onClick={close} aria-label="Đóng ghi chú" className="icon-action grid h-10 w-10 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:bg-border" data-tooltip="Đóng"><Icon.X /></button></div><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} className="input mt-4 w-full" placeholder="Viết cách nhớ hoặc lưu ý riêng..." /><div className="mt-4 flex gap-2"><button onClick={() => { onSave?.(entryId, ''); close(); }} className="btn-secondary">Xóa</button><button onClick={() => { onSave?.(entryId, draft.trim()); close(); }} className="btn-primary ml-auto">Lưu</button></div></section></div>}</>; }

function ClickableHanzi({ text = '', entry, onCharacter }) { return <>{[...text].map((char, index) => /[\u3400-\u9fff]/.test(char) ? <button key={`${char}-${index}`} onClick={(event) => { event.stopPropagation(); onCharacter?.(char, entry); }} className="rounded px-0.5 hover:bg-warning-subtle hover:text-warning" title={`Xem chữ ${char}`}>{char}</button> : <span key={`${char}-${index}`}>{char}</span>)}</>; }

function EntryActions({ entry, bookmarks, onToggleBookmark, notes, onSaveNote, onEdit }) { return <div className="flex items-center gap-2"><SpeakButton text={entryTitle(entry)} /><NoteEditor entryId={entry.id} note={notes[entry.id]} onSave={onSaveNote} /><BookmarkButton entryId={entry.id} bookmarks={bookmarks} onToggle={onToggleBookmark} />{onEdit && <button type="button" onClick={() => onEdit(entry)} className="grid h-8 w-8 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:text-accent" title="Sửa từ vựng" aria-label={`Sửa từ vựng ${entry.word_zh}`}><Icon.Pen className="h-4 w-4" /></button>}</div>; }
function RelatedLinks({ entry, onRelated }) { return entry.related_words?.length ? <div className="mt-4 flex flex-wrap gap-2">{entry.related_words.map((id) => { const related = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); return <button key={id} onClick={() => onRelated?.(id)} className="rounded-md bg-bg-tertiary px-2 py-1 text-xs font-bold">{related ? entryTitle(related) : id}</button>; })}</div> : null; }

const WordCard = memo(function WordCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter, onEdit, virtual = false }) { return <article className={`card ${virtual ? 'virtual-list-item' : ''}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-hanzi text-3xl font-bold"><ClickableHanzi text={entry.word_zh} entry={entry} onCharacter={onCharacter} /></h3><p className="pinyin-text mt-1 text-accent">{entry.pinyin}</p></div><EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onEdit={onEdit} /></div><p className="mt-4 font-bold">{entry.meaning_vi}</p>{entry.meaning_en && <p className="text-sm text-text-muted">{entry.meaning_en}</p>}{entry.example_zh && <div className="mt-4 rounded-lg bg-bg-tertiary p-3"><p className="font-hanzi font-bold">{entry.example_zh}</p><p className="pinyin-text text-sm text-success">{entry.example_pinyin}</p><p className="text-sm text-text-muted">{entry.example_vi}</p></div>}<RelatedLinks entry={entry} onRelated={onRelated} />{notes[entry.id] && <div className="mt-4 flex gap-2 rounded-lg bg-warning-subtle p-3 text-sm"><Icon.Pen className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><p>{notes[entry.id]}</p></div>}</article>; });
function GrammarCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter }) { return <article className="card"><div className="flex items-start justify-between gap-3"><div><h3 className="font-hanzi text-xl font-bold"><ClickableHanzi text={entry.grammar_title_zh} entry={entry} onCharacter={onCharacter} /></h3><p className="text-accent">{entry.grammar_title_vi}</p></div><EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} /></div>{entry.structure && <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm text-emerald-300">{entry.structure}</pre>}<p className="mt-4 text-text-secondary">{entry.explanation_vi}</p>{(entry.examples || []).map((example, index) => <div key={index} className="mt-3 border-l-2 border-warning pl-3"><p className="font-hanzi font-bold">{example.zh}</p><p className="pinyin-text text-sm text-success">{example.pinyin}</p><p className="text-sm text-text-muted">{example.vi}</p></div>)}<RelatedLinks entry={entry} onRelated={onRelated} /></article>; }
function PhraseCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter }) { return <article className="card"><div className="flex items-start justify-between gap-3"><div><h3 className="font-hanzi text-2xl font-bold"><ClickableHanzi text={entry.phrase_zh} entry={entry} onCharacter={onCharacter} /></h3><p className="pinyin-text text-accent">{entry.pinyin}</p></div><EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} /></div><p className="mt-4 font-bold">{entry.meaning_vi}</p><p className="mt-2 text-sm text-text-muted">{entry.usage_note}</p><RelatedLinks entry={entry} onRelated={onRelated} /></article>; }

function VirtualKeyboard({ textareaRef, value, onChange }) { const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const results = useMemo(() => searchPinyin(query), [query]); const insert = (text) => { const target = textareaRef.current; const start = target?.selectionStart ?? value.length; const end = target?.selectionEnd ?? value.length; onChange(`${value.slice(0, start)}${text}${value.slice(end)}`); requestAnimationFrame(() => { target?.focus(); target?.setSelectionRange(start + text.length, start + text.length); }); }; return <div className="mt-2"><button type="button" onClick={() => setOpen((value) => !value)} className="btn-secondary inline-flex items-center gap-2"><Icon.Type className="h-4 w-4"/>Bàn phím tiếng Trung</button>{open && <div className="mt-2 rounded-lg border border-border bg-bg-tertiary p-3"><input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full" placeholder="Gõ pinyin không dấu, ví dụ: bianhua" aria-label="Tìm chữ Hán theo pinyin" /><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{results.map((item, index) => <button key={`${item.key}-${item.zh}-${index}`} onClick={() => insert(item.zh)} className="rounded-lg bg-bg-secondary p-2 text-left hover:ring-1 hover:ring-accent"><span className="block text-lg font-bold">{item.zh}</span><span className="block truncate text-xs text-text-muted">{item.pinyin} · {item.vi}</span></button>)}</div></div>}</div>; }

const BACKGROUNDS = [
 { id: 'none', name: 'Mặc định' },
 { id: 'sakura', name: 'Hoa anh đào' },
 { id: 'ocean', name: 'Biển' },
 { id: 'mountain', name: 'Núi' },
 { id: 'forest', name: 'Rừng' },
];

const NAV_ITEMS = [
  { id: 'home', icon: <Icon.Home />, label: 'Lộ trình' },
  { id: 'library', icon: <Icon.Book />, label: 'Thư viện' },
  { id: 'learn', icon: <Icon.Book />, label: 'Học' },
  { id: 'quiz', icon: <Icon.Check />, label: 'Quiz' },
  { id: 'review', icon: <Icon.Refresh />, label: 'Ôn tập' },
  { id: 'dashboard', icon: <Icon.Chart />, label: 'Hồ sơ' },
];

const EXTRA_NAV = [
  { id: 'exam', icon: <Icon.Pen />, label: 'Thi thử' },
  { id: 'boss', icon: <Icon.Trophy />, label: 'Boss Battle' },
  { id: 'minigame', icon: <Icon.Gamepad />, label: 'Ghép từ' },
  { id: 'dictation', icon: <Icon.Headphones />, label: 'Chính tả' },
  { id: 'pronunciation', icon: <Icon.Mic />, label: 'Phát âm' },
  { id: 'sentences', icon: <Icon.Type />, label: 'Câu ví dụ' },
];
// --- REDESIGN: APP SHELL ---
function Header({ progress, onSearch, onNavigate, themeMode, onThemeChange, onMenu, hidden = false, focused = false }) {
  const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;
  const nextTheme = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
  return (
    <header className={`app-header transition-transform duration-200 ${focused ? '' : 'lg:ml-[240px] 2xl:mr-[320px]'} ${hidden ? '-translate-y-full' : ''}`}>
      <div className="mx-auto flex h-16 max-w-[864px] items-center gap-3 px-4 lg:px-8">
      {!focused && <button onClick={onMenu} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-bg-secondary text-text-secondary lg:hidden" aria-label="Mở menu">
        <span className="space-y-1"><span className="block h-px w-4 bg-current"/><span className="block h-px w-4 bg-current"/><span className="block h-px w-4 bg-current"/></span>
      </button>}
      <button onClick={onSearch} aria-label="Tìm kiếm hoặc mở lệnh" className="flex h-10 min-w-0 flex-1 items-center justify-between rounded-lg border border-border bg-bg-secondary px-3 text-text-muted shadow-xs transition duration-150 hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent-subtle">
        <div className="flex items-center gap-2 text-sm">
          <Icon.Search className="h-4 w-4" />
          <span className="truncate">Tìm từ vựng, ngữ pháp, câu hỏi...</span>
        </div>
        <kbd className="hidden rounded border border-border bg-bg-tertiary px-1.5 py-0.5 text-[11px] font-medium sm:block">Ctrl K</kbd>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => onNavigate('dashboard')} className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-[13px] font-semibold text-text-secondary transition hover:bg-bg-tertiary sm:flex" title="Xem streak"><Icon.Flame className="h-4 w-4 text-error" />{progress.streak}</button>
        <button onClick={() => onNavigate('dashboard')} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-[13px] font-semibold text-text-secondary transition hover:bg-bg-tertiary" title="Xem XP"><Icon.Zap className="h-4 w-4 text-warning" /><span className="hidden sm:inline">{progress.xp} XP</span><span className="sm:hidden">{progress.xp}</span></button>
        <button onClick={() => onNavigate('dashboard')} className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-[13px] font-semibold text-text-secondary transition hover:bg-bg-tertiary md:flex" title="Xem độ chính xác"><Icon.Target className="h-4 w-4 text-success" />{accuracy}%</button>
        <button onClick={() => onThemeChange(nextTheme)} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-bg-secondary text-text-secondary transition hover:bg-bg-tertiary" title={`Giao diện: ${themeMode}`} aria-label="Đổi chế độ sáng tối">{themeMode === 'dark' ? <Icon.Moon className="h-[18px] w-[18px]" /> : <Icon.Sun className="h-[18px] w-[18px]" />}</button>
      </div>
      </div>
    </header>
  );
}

function Sidebar({ screen, progress, onNavigate, mobileOpen, onClose }) {
  return (
    <>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={onClose} aria-label="Đóng menu" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-border bg-bg-secondary px-4 py-5 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu chính">
      <div className="flex h-12 items-center justify-between px-2">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-3 text-left" aria-label="Về trang chủ">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent-subtle to-accent-2-subtle text-xl" role="img" aria-label="Trúc">🐼</span>
          <span><span className="block font-serif text-[18px] font-bold leading-tight">DuDu Hán Ngữ</span><span className="block text-[11px] text-text-muted">Học mỗi ngày</span></span>
        </button>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-bg-tertiary lg:hidden" aria-label="Đóng menu"><Icon.X /></button>
      </div>
      <nav aria-label="Menu chính" className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Chính</div>
        <div className="space-y-1">{NAV_ITEMS.map((item) => (
          <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`nav-item ${screen === item.id ? 'active' : ''}`}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}</div>
        <div className="mb-2 mt-5 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Luyện tập</div>
        <div className="space-y-1">{EXTRA_NAV.map((item) => (
          <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`nav-item ${screen === item.id ? 'active' : ''}`}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}</div>
        <section className="mt-6 rounded-xl border border-accent/20 bg-gradient-to-br from-accent-subtle to-accent-2-subtle p-4">
          <div className="flex items-center gap-2 text-accent"><span className="grid h-8 w-8 place-items-center rounded-lg bg-bg-secondary"><Icon.Star className="h-4 w-4" /></span><h2 className="font-serif text-[15px] font-semibold">DuDu Plus</h2></div>
          <p className="mt-3 text-sm leading-5 text-text-secondary">Mở khóa 50+ bài học và luyện thi chuyên sâu.</p>
          <button onClick={() => onNavigate('learn')} className="btn-primary mt-4 w-full">Nâng cấp ngay</button>
        </section>
      </nav>
      <div className="mt-4 border-t border-border pt-4">
        <button onClick={() => onNavigate('dashboard')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-bg-tertiary">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-2-subtle text-2xl" role="img" aria-label="Băng">🐧</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{progress.profile?.name || 'Nguyễn Văn A'}</span><span className="block text-[11px] text-text-muted">Level {Math.max(1, progress.unlockedBai.length)}</span></span>
          <Icon.Settings className="h-[18px] w-[18px] text-text-muted" />
        </button>
      </div>
    </aside>
    </>
  );
}

function RightPanel({ progress, onNavigate }) {
  const goal = Math.max(1, Number(progress.dailyGoal) || 20);
  const done = Math.max(0, Number(progress.todayCount) || 0);
  const goalPercent = Math.min(100, Math.round((done / goal) * 100));
  const circumference = 2 * Math.PI * 48;
  const lastSeven = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDate(date);
    return { key, label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date).replace('Th ', 'T'), active: Boolean(progress.studyDays?.[key]?.questions || progress.studyDays?.[key]?.xp), today: index === 6 };
  });
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() - index * 7);
    const key = getWeekKey(date);
    return { key, label: index === 0 ? 'Tuần này' : index === 1 ? 'Tuần trước' : '2 tuần trước', xp: Number(progress.weeklyXP?.[key]) || 0 };
  });
  const streakTarget = progress.streak < 3 ? 3 : progress.streak < 7 ? 7 : 10;
  const streakPercent = Math.min(100, Math.round((progress.streak / streakTarget) * 100));
  return (
    <aside className="fixed inset-y-0 right-0 z-10 hidden w-[320px] overflow-y-auto border-l border-border bg-bg-secondary p-5 2xl:block scrollbar-thin">
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-bg-primary p-5">
          <div className="flex items-center gap-2"><Icon.Target className="h-[18px] w-[18px] text-accent"/><h2 className="font-serif text-[17px] font-semibold">Mục tiêu hôm nay</h2></div>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative h-[120px] w-[120px] shrink-0"><svg className="h-full w-full -rotate-90" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8"/><circle cx="60" cy="60" r="48" fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - goalPercent / 100)} style={{ '--ring-length': circumference }} className="animate-ring-progress"/></svg><span className="absolute inset-0 grid place-items-center font-serif text-2xl font-semibold">{goalPercent}%</span></div>
            <div><p className="font-serif text-2xl font-semibold">{done} / {goal}</p><p className="mt-1 text-sm text-text-muted">câu hôm nay</p><p className="mt-3 text-sm font-medium text-accent">{goalPercent >= 100 ? 'Đã hoàn thành!' : 'Cố lên, sắp xong rồi!'}</p></div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-bg-primary p-5">
          <div className="flex items-center gap-2"><Icon.Flame className="h-[18px] w-[18px] text-error"/><h2 className="font-serif text-[17px] font-semibold">Chuỗi {progress.streak} ngày</h2></div>
          <div className="mt-5 grid grid-cols-7 gap-2">{lastSeven.map((day) => <div key={day.key} className="text-center"><span className="block text-[10px] font-medium uppercase text-text-muted">{day.label}</span><span title={day.key} className={`mx-auto mt-2 grid h-7 w-7 place-items-center rounded-full border ${day.active ? 'border-accent bg-accent text-white' : day.today ? 'streak-today border-accent text-accent' : 'border-border text-text-muted'}`}>{day.active && <Icon.Check className="h-3.5 w-3.5"/>}</span></div>)}</div>
        </section>
        <section className="rounded-xl border border-border bg-bg-primary p-5">
          <div className="flex items-center gap-2"><Icon.Trophy className="h-[18px] w-[18px] text-warning"/><h2 className="font-serif text-[17px] font-semibold">Bảng xếp hạng</h2></div>
          <div className="mt-4 space-y-2">{weeks.map((week, index) => <div key={week.key} className={`grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-lg px-2 py-2 ${index === 0 ? 'bg-accent-subtle' : ''}`}><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${index === 0 ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted'}`}>{index + 1}</span><span className="text-sm font-medium">{week.label}</span><span className="text-sm font-semibold">{week.xp} XP</span></div>)}</div>
        </section>
        <section className="rounded-xl border border-border bg-gradient-to-br from-warm-subtle to-accent-subtle p-5">
          <div className="flex items-center gap-2"><Icon.Star className="h-[18px] w-[18px] text-warning"/><h2 className="font-serif text-[17px] font-semibold">Thành tựu sắp tới</h2></div>
          <p className="mt-4 text-sm leading-6 text-text-secondary">Còn <strong>{Math.max(0, streakTarget - progress.streak)} ngày</strong> để đạt chuỗi {streakTarget} ngày liên tiếp.</p>
          <ProgressBar value={streakPercent} className="mt-4"/><div className="mt-2 flex justify-between text-xs font-medium text-text-muted"><span>{progress.streak}/{streakTarget} ngày</span><span>{progress.achievements.length} huy hiệu</span></div>
          <button onClick={() => onNavigate('dashboard')} className="btn-secondary mt-4 w-full">Xem tất cả</button>
        </section>
      </div>
    </aside>
  );
}

function PandaHeroMascot() {
  return (
    <svg viewBox="0 0 210 190" className="h-[178px] w-[196px] drop-shadow-lg" role="img" aria-label="Trúc đang chào">
      <ellipse cx="107" cy="174" rx="68" ry="10" fill="var(--accent-2)" opacity=".14" />
      <circle cx="69" cy="50" r="25" fill="#252932" />
      <circle cx="143" cy="48" r="25" fill="#252932" />
      <path d="M57 102c0-41 20-68 52-68s53 27 53 68c0 35-21 59-53 59-31 0-52-24-52-59Z" fill="#FFFDF7" stroke="#252932" strokeWidth="4" />
      <ellipse cx="82" cy="84" rx="17" ry="23" fill="#252932" transform="rotate(24 82 84)" />
      <ellipse cx="136" cy="84" rx="17" ry="23" fill="#252932" transform="rotate(-24 136 84)" />
      <circle cx="84" cy="82" r="5.5" fill="#FFFDF7" /><circle cx="134" cy="82" r="5.5" fill="#FFFDF7" />
      <circle cx="85" cy="83" r="2.5" fill="var(--accent-2)" /><circle cx="133" cy="83" r="2.5" fill="var(--accent-2)" />
      <path d="M101 99c0-6 16-6 16 0 0 5-4 8-8 8s-8-3-8-8Z" fill="#252932" />
      <path d="M96 113c8 8 18 8 26 0" fill="none" stroke="#252932" strokeWidth="3" strokeLinecap="round" />
      <path d="M77 133c12-9 51-9 64 0l-6 37H83l-6-37Z" fill="var(--accent)" />
      <path d="M68 143c-18-7-29-23-26-38 2-9 13-13 20-7 6 5 5 13 7 20 2 6 7 10 13 13l-14 12Z" fill="#252932" />
      <path d="M143 137c10-10 13-24 11-39-1-8 1-15 8-23 6-7 16-8 21-2 5 5 3 13-2 18-5 6-6 13-5 20 2 17-5 32-20 42l-13-16Z" fill="#252932" />
      <path d="M166 73l8-12M174 80l14-4M161 66l1-15" stroke="var(--warm)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="90" cy="169" rx="20" ry="11" fill="#252932" /><ellipse cx="130" cy="169" rx="20" ry="11" fill="#252932" />
      <path d="M82 135c14 8 41 8 55 0" fill="none" stroke="#FFFDF7" strokeWidth="5" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

function HomeSectionHeader({ title, onAction }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-[18px] font-semibold">{title}</h2><button onClick={onAction} className="flex items-center gap-1 text-sm font-semibold text-accent transition hover:text-accent-hover">Xem tất cả<Icon.ChevronRight className="h-4 w-4" /></button></div>;
}

function HomeScreen({ progress, onOpenLesson, onNavigate }) {
  const unlocked = progress.unlockedBai?.length ? progress.unlockedBai : [1];
  const currentBai = unlocked.find((bai) => !progress.baiProgress?.[bai]?.completed) || Math.max(...unlocked);
  const currentGlossary = GLOSSARY[currentBai];
  const currentQuiz = QUIZZES[currentBai];
  const currentProgress = progress.baiProgress?.[currentBai] || {};
  const totalQuestions = currentQuiz?.questions?.length || 30;
  const completedQuestions = Math.min(totalQuestions, currentProgress.quizDone || 0);
  const completion = currentProgress.completed ? 100 : Math.round((completedQuestions / totalQuestions) * 100);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const totalWords = Object.values(GLOSSARY).reduce((sum, lesson) => sum + lesson.entries.filter((entry) => entry.type === 'word').length, 0);
  const totalGrammar = Object.values(GLOSSARY).reduce((sum, lesson) => sum + lesson.entries.filter((entry) => entry.type === 'grammar').length, 0);
  const skillCards = [
    { id: 'dictation', title: 'Chính tả', caption: `${progress.advancedStats?.dictationSessions || 0} phiên`, icon: <Icon.Headphones />, tone: 'bg-accent-2-subtle text-accent-2' },
    { id: 'pronunciation', title: 'Phát âm', caption: `${progress.advancedStats?.pronunciationAttempts || 0} lượt`, icon: <Icon.Mic />, tone: 'bg-warm-subtle text-warm' },
    { id: 'learn', title: 'Từ vựng', caption: `${totalWords} từ`, icon: <Icon.Book />, tone: 'bg-accent-subtle text-accent' },
    { id: 'learn', title: 'Ngữ pháp', caption: `${totalGrammar} điểm`, icon: <Icon.Pen />, tone: 'bg-[var(--accent-purple-subtle)] text-[var(--accent-purple)]' },
  ];
  const recentLessons = [...new Set([...unlocked.slice().reverse(), ...LESSONS])].slice(0, 5);
  return (
    <div className="space-y-7">
      <section className="relative min-h-[240px] overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-subtle via-bg-secondary to-accent-2-subtle p-6 sm:p-8">
        <svg aria-hidden="true" viewBox="0 0 800 210" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] w-full opacity-60"><path d="M0 176 112 94l78 58 111-108 98 106 78-63 121 82 89-76 113 83v34H0Z" fill="var(--accent-2-subtle)"/><path d="M0 191 135 128l93 57 108-83 113 80 105-65 106 64 67-34 73 40v23H0Z" fill="var(--accent-subtle)"/><path d="M0 199c130-24 250-13 369-2 148 14 277-16 431-3v16H0Z" fill="var(--bg-secondary)"/></svg>
        <div className="relative z-10 max-w-[520px]">
          <p className="text-sm font-semibold text-accent">{greeting},</p>
          <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight text-text-primary">{progress.profile?.name || 'Nguyễn Văn A'}</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-6 text-text-secondary">Một bài học nữa để tiến gần hơn tới mục tiêu Hán ngữ của bạn.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={() => onOpenLesson(currentBai)} className="btn-primary flex items-center gap-2 px-5 py-2.5">Tiếp tục học<Icon.ChevronRight /></button>
            <button onClick={() => onNavigate('exam')} className="btn-secondary flex items-center gap-2 bg-bg-secondary"><Icon.Pen />Thi thử</button>
            <button onClick={() => onNavigate('boss')} className="btn-secondary flex items-center gap-2 bg-bg-secondary"><Icon.Trophy />Boss</button>
          </div>
        </div>
        <div className="absolute bottom-1 right-5 z-10 hidden md:block"><PandaHeroMascot /></div>
      </section>

      <section>
        <HomeSectionHeader title="Tiếp tục học" onAction={() => onNavigate('learn')} />
        <article className="grid items-center gap-4 rounded-xl border border-border bg-bg-secondary p-5 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:shadow-sm sm:grid-cols-[60px_1fr_auto]">
          <div className="grid h-[60px] w-[60px] place-items-center rounded-lg bg-accent-subtle font-serif text-2xl font-semibold text-accent">{String(currentBai).padStart(2, '0')}</div>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Bài {currentBai} · {completedQuestions}/{totalQuestions} câu</p><h3 className="mt-1 truncate font-hanzi text-[20px] font-semibold">{currentGlossary?.metadata?.title_zh || `Bài ${currentBai}`}</h3><p className="truncate text-sm text-text-muted">{currentGlossary?.metadata?.title_vi || 'Tiếp tục hành trình học tập'}</p><div className="mt-3 flex items-center gap-3"><ProgressBar value={completion} className="flex-1"/><span className="text-xs font-semibold text-text-secondary">{completion}%</span></div></div>
          <button onClick={() => onOpenLesson(currentBai)} className="btn-primary flex items-center justify-center gap-2 px-5"><Icon.Play className="h-4 w-4"/>Bắt đầu</button>
        </article>
      </section>

      <section>
        <HomeSectionHeader title="Kỹ năng" onAction={() => onNavigate('review')} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{skillCards.map((skill, index) => <button key={`${skill.id}-${index}`} onClick={() => onNavigate(skill.id)} className="group rounded-xl border border-border bg-bg-secondary p-4 text-left shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-full ${skill.tone}`}>{skill.icon}</span><span className="mt-3 block text-[15px] font-semibold">{skill.title}</span><span className="mt-0.5 flex items-center justify-between text-xs text-text-muted">{skill.caption}<Icon.ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5"/></span></button>)}</div>
      </section>

      <section>
        <HomeSectionHeader title="Bài học gần đây" onAction={() => onNavigate('learn')} />
        <div className="space-y-2">{recentLessons.map((bai) => {
          const isUnlocked = unlocked.includes(bai);
          const item = progress.baiProgress?.[bai] || {};
          const quizTotal = QUIZZES[bai]?.questions?.length || 30;
          const percent = item.completed ? 100 : Math.round(((item.quizDone || 0) / quizTotal) * 100);
          const accuracy = item.quizDone ? Math.round(((item.quizCorrect || 0) / item.quizDone) * 100) : 0;
          const metadata = GLOSSARY[bai]?.metadata || {};
          return <button key={bai} disabled={!isUnlocked} onClick={() => isUnlocked && onOpenLesson(bai)} className={`grid w-full grid-cols-[48px_minmax(0,1fr)] items-center gap-3 rounded-xl border p-4 text-left transition duration-200 sm:grid-cols-[48px_minmax(0,1fr)_96px] sm:gap-4 ${isUnlocked ? 'border-border bg-bg-secondary hover:-translate-y-0.5 hover:border-accent hover:shadow-sm' : 'cursor-not-allowed border-border bg-bg-tertiary opacity-55'}`}><span className={`grid h-12 w-12 place-items-center rounded-lg font-serif text-lg font-semibold ${isUnlocked ? 'bg-accent-subtle text-accent' : 'bg-bg-secondary text-text-muted'}`}>{String(bai).padStart(2, '0')}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Bài {bai}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${item.completed ? 'bg-success-subtle text-success' : isUnlocked ? 'bg-warning-subtle text-warning' : 'bg-bg-secondary text-text-muted'}`}>{item.completed ? 'Đã xong' : isUnlocked ? 'Đang học' : 'Đã khóa'}</span></span><span className="mt-0.5 block truncate font-hanzi text-[16px] font-medium">{metadata.title_zh || `Bài ${bai}`}</span><span className="block truncate text-xs text-text-muted">{metadata.title_vi || `${quizTotal} câu hỏi`}</span></span><span className="col-span-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-right sm:col-span-1 sm:block sm:w-24"><span className="text-xs font-semibold text-text-secondary">{isUnlocked ? `${percent}%` : '—'}</span><ProgressBar value={percent} label={`Tiến độ bài ${bai}`} className="sm:mt-2"/>{isUnlocked && <span className="text-[10px] text-text-muted sm:mt-1 sm:block">{accuracy}% chính xác</span>}</span></button>;
        })}</div>
      </section>
    </div>
  );
}



function extractReadingLines(raw = '') { const lines = raw.replace(/\r/g, '').split('\n'); const start = Math.max(0, lines.findIndex((line) => line.includes('课文')) + 1); const end = lines.findIndex((line, index) => index > start && line.includes('生词')); return lines.slice(start, end > start ? end : lines.length).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line && /[\u3400-\u9fff]/.test(line) && !/^(=====|TRANG|[~+\-=]+)$/.test(line)); }

function ReadingModeTab({ bai, onOpenEntry }) {
 const [showPinyin, setShowPinyin] = useState(true); const [showVi, setShowVi] = useState(true); const entries = GLOSSARY[bai].entries;
 const examples = useMemo(() => getSentencesByBai(bai), [bai]);
 const lines = useMemo(() => extractReadingLines(LESSON_TEXTS[bai]).map((text, index) => { const match = examples.find((item) => normalizeText(text).includes(normalizeText(item.zh))); const words = entries.filter((entry) => entry.word_zh && text.includes(entry.word_zh)); return { id: `${bai}-${index}`, text, pinyin: match?.pinyin || words.map((entry) => `${entry.word_zh} ${entry.pinyin}`).join(' · '), vi: match?.vi || words.map((entry) => `${entry.word_zh}: ${entry.meaning_vi}`).join(' · ') }; }), [bai, entries, examples]);
 return <div><div className="mb-4 flex gap-2 border-b border-border bg-bg-primary py-3"><span className="filter-btn active">Hán</span><button onClick={() => setShowPinyin((value) => !value)} className={`filter-btn ${showPinyin ? 'active' : ''}`}>Pinyin</button><button onClick={() => setShowVi((value) => !value)} className={`filter-btn ${showVi ? 'active' : ''}`}>Tiếng Việt</button></div><div className="space-y-3">{lines.map((line) => <article key={line.id} className="card"><div className="flex items-start gap-3"><p className="font-hanzi flex-1 text-xl font-medium leading-9">{line.text}</p><SpeakButton text={line.text} /></div>{showPinyin && line.pinyin && <p className="pinyin-text mt-2 text-sm text-success">{line.pinyin}</p>}{showVi && line.vi && <p className="mt-1 text-sm text-accent-2">{line.vi}</p>}</article>)}</div>{!lines.length && <EmptyState icon="文" title="Chưa nhận diện được bài khóa" text="Nội dung OCR chưa có phần 课文 rõ ràng." />}</div>;
}

function LearnScreen({ bai, unlockedBai, bookmarks, notes, onToggleBookmark, onSaveNote, onLessonRead, onStartQuiz, onOpenEntry, onCharacter, onStartPlaylist, onChangeBai, wordOverrides, onEditWord, onEditGrammar, editorError }) {
  const [activeTab, setActiveTab] = useState('words');
  const readSentinelRef = useRef(null);
  const lessonData = GLOSSARY[bai];
  if (!lessonData) return null;

  const words = lessonData.entries.filter((e) => e.type === 'word').map((entry) => wordOverrides[entry.id] || entry);
  const grammar = lessonData.entries.filter((e) => e.type === 'grammar');
  const phrases = lessonData.entries.filter((e) => e.type === 'phrase');

  const tabs = [
    { id: 'words', label: 'Từ vựng', count: words.length },
    { id: 'grammar', label: 'Ngữ pháp', count: grammar.length },
    { id: 'phrases', label: 'Mẫu câu', count: phrases.length },
    { id: 'flashcards', label: 'Flashcard', count: words.length + grammar.length + phrases.length },
    { id: 'reading', label: 'Bài khóa' }
  ];

  const lessonTabs = (
    <div className="tabs-container scrollbar-thin" role="tablist" aria-label="Nội dung bài học">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = tabs.findIndex((item) => item.id === tab.id); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; setActiveTab(tabs[next].id); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus(); }} className={`tab ${activeTab === tab.id ? 'active' : ''}`}>
          {tab.label}{Number.isFinite(tab.count) && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );

  useEffect(() => { if (activeTab !== 'words' || !readSentinelRef.current) return undefined; const observer = new IntersectionObserver(([item]) => { if (item.isIntersecting) onLessonRead?.(bai); }, { threshold: 0.8 }); observer.observe(readSentinelRef.current); return () => observer.disconnect(); }, [activeTab, bai, onLessonRead]);

  let currentEntries = words;
  if (activeTab === 'grammar') currentEntries = grammar;
  if (activeTab === 'phrases') currentEntries = phrases;

  if (activeTab === 'reading') return <div className="mx-auto max-w-3xl pb-24"><div className="learn-toolbar sticky top-16 z-30 bg-bg-primary pt-4"><div className="mb-3 flex items-center justify-between"><h2 className="h2-text">Bài khóa · Bài {bai}</h2><button onClick={() => onStartQuiz(bai)} className="btn-primary">Bắt đầu Quiz</button></div>{lessonTabs}</div><div className="mt-5"><ReadingModeTab bai={bai} onOpenEntry={onOpenEntry} /></div></div>;

  if (activeTab === 'flashcards') {
    return (
      <div className="mx-auto max-w-3xl pb-24">
        <div className="learn-toolbar sticky top-16 z-30 bg-bg-primary pt-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2-text">Bài {bai}</h2>
            <button onClick={() => onStartQuiz(bai)} className="btn-primary px-6">Bắt đầu Quiz</button>
          </div>
          {lessonTabs}
        </div>
        <div className="mt-6">
          <FlashcardMode entries={[...words, ...grammar, ...phrases]} title={`Bài ${bai}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="learn-toolbar sticky top-16 z-30 bg-bg-primary pt-4">
        <div className="mb-4 flex items-center justify-between">
          <div><select value={bai} onChange={(event) => onChangeBai(Number(event.target.value))} className="input py-1.5 text-sm">{LESSONS.map((lesson) => <option key={lesson} value={lesson} disabled={!unlockedBai.includes(lesson)}>Bài {lesson}{unlockedBai.includes(lesson) ? '' : ' · khóa'}</option>)}</select><h2 className="mt-2 h2-text">{lessonData.metadata.title_zh}</h2><p className="text-sm text-text-muted">{lessonData.metadata.title_vi}</p></div>
          <div className="flex gap-2"><button onClick={() => onStartPlaylist(words.map((entry) => ({ text: entry.word_zh, label: entry.word_zh, sublabel: entry.meaning_vi })))} className="btn-secondary flex items-center gap-2"><Icon.Volume className="h-4 w-4"/>Playlist</button><button onClick={() => onStartQuiz(bai)} className="btn-primary px-6">Bắt đầu Quiz</button></div>
        </div>
        {lessonTabs}
      </div>

      {editorError && <p role="alert" className="mt-4 rounded-lg bg-error-subtle p-3 text-sm text-error">{editorError}</p>}
      <div className="mt-6 space-y-4">{currentEntries.map((entry) => entry.type === 'word' ? <WordCard key={entry.id} entry={entry} virtual={currentEntries.length > 100} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} onEdit={onEditWord} /> : entry.type === 'grammar' ? <div key={entry.id}><GrammarCard entry={entry} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />{onEditGrammar && <button onClick={() => onEditGrammar(entry)} className="mt-1 text-xs text-accent">Sửa ngữ pháp</button>}</div> : <PhraseCard key={entry.id} entry={entry} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />)}</div>
      {activeTab === 'words' && <div ref={readSentinelRef} className="h-1" aria-hidden="true" />}
    </div>
  );
}




function FlashcardMode({ entries, title }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!entries.length) return <EmptyState mascot="panda" title="Trống" text="Không có từ nào để luyện." />;
  const entry = entries[index];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % entries.length);
  };
  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + entries.length) % entries.length);
  };

  return (
    <div className="mx-auto max-w-md text-center pb-10">
      <h3 className="mb-4 font-bold text-text-muted uppercase tracking-widest">{title} - {index + 1}/{entries.length}</h3>
      <button type="button" onClick={() => setFlipped(!flipped)} className={`flip-card group ${flipped ? 'flipped' : ''}`} aria-label={flipped ? 'Xem mặt chữ Hán' : 'Xem nghĩa của thẻ'}>
        <span className="flip-card-inner">
          {/* Front */}
          <span className="flip-card-face flip-card-front">
            <span className="font-hanzi text-5xl font-bold text-text-primary">{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh}</span>
            {entry.pinyin && <span className="pinyin-text mt-4 text-xl text-text-muted">{entry.pinyin}</span>}
            <span className="mt-4 text-sm text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">Chạm để lật</span>
          </span>
          {/* Back */}
          <span className="flip-card-face flip-card-back">
            <span className="text-2xl font-bold">{entry.meaning_vi || entry.grammar_title_vi || entry.usage_note}</span>
            {entry.meaning_en && <span className="mt-2 text-sm italic text-text-muted">{entry.meaning_en}</span>}
            {entry.example_zh && (
              <span className="mt-6 block border-t border-border pt-4 text-left">
                <span className="font-hanzi block text-lg font-medium">{entry.example_zh}</span>
                <span className="pinyin-text block text-sm text-success">{entry.example_pinyin}</span>
                <span className="mt-2 block text-sm text-text-secondary">{entry.example_vi}</span>
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="mt-8 flex justify-center gap-4">
        <button onClick={prev} className="grid h-12 w-12 place-items-center rounded-full bg-bg-secondary border border-border hover:bg-bg-tertiary transition">
          <Icon.ChevronLeft className="h-6 w-6" />
        </button>
        <button onClick={next} className="grid h-12 w-12 place-items-center rounded-full bg-bg-secondary border border-border hover:bg-bg-tertiary transition">
          <Icon.ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

const questionIsMcq = (q) => !TYPING_TYPES.has(q.type);

function QuestionPrompt({ question }) {
  if (!question) return null;
  const sourceVi = question.source_sentence_vi || question.sentence_vi || question.prompt_sentence_vi;
  const sourceZh = question.source_sentence_zh || question.sentence_zh || question.prompt_sentence_zh;
  const promptError = question.type === 'translation_vi_to_zh' && !sourceVi ? 'Câu hỏi này đang thiếu câu nguồn tiếng Việt.'
    : question.type === 'translation_zh_to_vi' && !sourceZh ? 'Câu hỏi này đang thiếu câu nguồn tiếng Trung.'
      : question.type === 'typing_zh_from_pinyin' && (!question.pinyin || !question.meaning_vi) ? 'Câu hỏi này đang thiếu pinyin hoặc nghĩa tiếng Việt.'
        : question.type === 'sentence_reorder' && !question.shuffled_parts?.length ? 'Câu hỏi này đang thiếu các phần câu cần sắp xếp.' : '';
  return (
    <div className="mb-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">{TYPE_LABELS[question.type] || question.type}</p>
      <p className="text-2xl font-bold text-text-primary">{question.question_vi || question.question_zh}</p>
      {sourceVi && (
        <div className="mx-auto mt-5 max-w-2xl rounded-lg border border-accent/30 bg-accent-subtle px-5 py-4" aria-label="Câu tiếng Việt cần dịch">
          <p className="text-lg font-semibold leading-8 text-text-primary">{sourceVi}</p>
        </div>
      )}
      {sourceZh && (
        <div className="mx-auto mt-5 max-w-2xl rounded-lg border border-accent-2/30 bg-accent-2-subtle px-5 py-4" aria-label="Câu tiếng Trung cần dịch">
          <p className="font-hanzi text-xl font-semibold leading-8 text-text-primary">{sourceZh}</p>
          {question.source_sentence_pinyin && <p className="pinyin-text mt-2 text-sm text-text-muted">{question.source_sentence_pinyin}</p>}
        </div>
      )}
      {question.type === 'typing_zh_from_pinyin' && (
        <div className="mx-auto mt-5 grid max-w-xl gap-3 rounded-lg border border-border bg-bg-tertiary p-4 text-left sm:grid-cols-2">
          <p><span className="block text-xs font-bold uppercase tracking-wider text-text-muted">Pinyin</span><span className="pinyin-text mt-1 block text-lg font-semibold text-accent">{question.pinyin || 'Chưa có dữ liệu'}</span></p>
          <p><span className="block text-xs font-bold uppercase tracking-wider text-text-muted">Nghĩa tiếng Việt</span><span className="mt-1 block font-semibold">{question.meaning_vi || 'Chưa có dữ liệu'}</span></p>
        </div>
      )}
      {question.type === 'sentence_reorder' && (
        <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Các phần câu cần sắp xếp">
          {(question.shuffled_parts || []).map((part, index) => <span key={`${part}-${index}`} className="rounded-md border border-border-strong bg-bg-secondary px-3 py-2 font-hanzi text-lg font-semibold shadow-xs">{part}</span>)}
        </div>
      )}
      {promptError && <p role="alert" className="mx-auto mt-5 max-w-2xl rounded-lg border border-error bg-error-subtle p-4 text-sm font-semibold text-error">{promptError} Hãy sửa câu hỏi trước khi tiếp tục.</p>}
    </div>
  );
}

function McqOptions({ question, selected, result, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {question.options?.map(opt => {
        const isSelected = selected === opt.id;
        const isCorrectOption = opt.id === question.correct_option;
        
        let stateClass = "border-border bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary";
        let animClass = "";
        if (result) {
          if (isCorrectOption) { stateClass = "border-success bg-success-subtle text-success dark:bg-success-subtle dark:text-success"; animClass = "animate-correct-pulse"; }
          else if (isSelected) { stateClass = "border-error bg-error-subtle text-error dark:bg-error-subtle dark:text-error"; animClass = "animate-shake"; }
          else stateClass = "border-border bg-bg-secondary opacity-50";
        } else if (isSelected) {
          stateClass = "border-accent bg-accent-subtle text-accent dark:bg-accent dark:border-accent dark:text-white";
        }

        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            disabled={!!result}
            className={`flex items-center gap-3 rounded-xl border p-4 text-left font-bold transition ${stateClass} ${animClass}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border font-bold ${result ? (isCorrectOption ? 'border-success bg-success text-white' : isSelected ? 'border-error bg-error text-white' : 'border-border bg-bg-tertiary') : (isSelected ? 'border-accent bg-accent text-white dark:border-white' : 'border-border bg-bg-tertiary')}`}>
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypingInput({ question, value, onChange, onCheck, result }) {
  const textareaRef = useRef(null);
  const useKeyboard = ['translation_vi_to_zh', 'typing_zh_from_pinyin'].includes(question.type);
  const placeholder = question.type === 'translation_zh_to_vi' ? 'Gõ câu tiếng Việt...' : question.type === 'sentence_reorder' ? 'Gõ câu theo đúng thứ tự...' : 'Gõ chữ Hán...';
  const promptMissing = question.type === 'translation_vi_to_zh' ? !(question.source_sentence_vi || question.sentence_vi || question.prompt_sentence_vi)
    : question.type === 'translation_zh_to_vi' ? !(question.source_sentence_zh || question.sentence_zh || question.prompt_sentence_zh)
      : question.type === 'typing_zh_from_pinyin' ? !question.pinyin || !question.meaning_vi
        : question.type === 'sentence_reorder' ? !question.shuffled_parts?.length : false;
  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!!result}
        placeholder={placeholder}
        className={`w-full min-h-[120px] resize-none rounded-xl border p-4 font-bold outline-none transition ${result ? (result.isCorrect ? 'border-success bg-success-subtle text-success' : 'border-error bg-error-subtle text-error') : 'border-border bg-bg-secondary focus:border-accent focus:ring-2 focus:ring-accent-subtle'}`}
      />
      {!result && useKeyboard && <VirtualKeyboard textareaRef={textareaRef} value={value} onChange={onChange} />}
      {!result && (
        <button onClick={onCheck} disabled={!value.trim() || promptMissing} className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40">Kiểm tra</button>
      )}
    </div>
  );
}

function FeedbackPanel({ question, result, userAnswer, onNext, onOpenEntry, onEditQuestion, nextLabel, xpGained }) {
  const isCorrect = result.isCorrect;
  const explanation = typeof question.explanation === 'string' ? question.explanation : question.explanation?.why_correct;
  const [showXp, setShowXp] = useState(false);
  useEffect(() => {
    if (xpGained && isCorrect) { setShowXp(true); const t = setTimeout(() => setShowXp(false), 1000); return () => clearTimeout(t); }
  }, [xpGained, isCorrect]);
  return (
    <div className={`animate-fade-slide mt-6 rounded-xl border p-5 ${isCorrect ? 'border-success bg-success-subtle' : 'border-error bg-error-subtle'}`}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">{isCorrect ? '🐼' : '🐧'}</span>
            <h3 role="status" aria-live="assertive" className={`text-xl font-bold ${isCorrect ? 'text-success' : 'text-error'}`}>
              {isCorrect ? 'Chính xác!' : 'Chưa chính xác'}
              {!questionIsMcq(question) && <span className="ml-2 text-base">· {result.score}/100</span>}
            </h3>
            {showXp && xpGained && (
              <span className="relative inline-block" aria-hidden="true">
                <span className="animate-xp-float absolute -top-1 left-0 text-sm font-bold text-warning">+{xpGained} XP</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {isCorrect ? 'Trúc: Làm tốt lắm, giữ nhịp này nhé!' : 'Băng: Không sao, xem lại một chút rồi mình làm tiếp.'}
          </p>

          {!isCorrect && (
            <div className="mt-3">
              <p className="text-sm font-bold text-text-muted">Đáp án đúng:</p>
              <p className="text-lg font-bold text-text-primary mt-1">
                {question.options?.find(o => o.id === question.correct_option)?.text || question.sample_answer}
              </p>
            </div>
          )}

          {explanation && (
            <p className="mt-3 text-sm font-medium text-text-primary">{explanation}</p>
          )}
          {(question.explanation?.keyword_tip || question.explanation?.common_mistakes?.length || question.explanation?.why_others_wrong || question.related_glossary?.length) && <details className="mt-3 text-sm text-text-secondary"><summary className="cursor-pointer font-semibold text-accent">Xem giải thích chi tiết</summary>{question.explanation?.keyword_tip && <p className="mt-2"><strong>Ghi nhớ:</strong> {question.explanation.keyword_tip}</p>}{question.explanation?.common_mistakes?.map((mistake, index) => <p key={index} className="mt-1">{mistake}</p>)}{Object.entries(question.explanation?.why_others_wrong || {}).map(([option, reason]) => <p key={option} className="mt-1">{option}: {reason}</p>)}{question.related_glossary?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{question.related_glossary.map((id) => { const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); return entry ? <button key={id} onClick={() => onOpenEntry?.(entry)} className="rounded-md bg-bg-secondary px-2 py-1 text-xs font-bold text-accent">{entryTitle(entry)}</button> : null; })}</div>}</details>}
        </div>

        <div className="flex shrink-0 gap-2">
          {onEditQuestion && <button onClick={() => onEditQuestion(question)} className="btn-secondary">Sửa câu hỏi</button>}
          <button onClick={onNext} className={`rounded-xl px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 active:translate-y-0 ${isCorrect ? 'bg-success hover:bg-success/90' : 'bg-error hover:bg-error/90'}`}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizScreen({ session, progress, onAnswer, onFinish, onExit, onOpenEntry, onEditQuestion }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState([]);

  const questions = session.questions;
  const question = questions[index];
  const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;

  const submit = (answer, grading) => {
    const isCorrect = questionIsMcq(question) ? grading.score === 100 : grading.score >= 70;
    const finalResult = { ...grading, isCorrect };
    if (isCorrect) sounds.correct();
    else sounds.wrong();
    setResult(finalResult);
    setSummary((prev) => [...prev, finalResult]);
    onAnswer(question, answer, finalResult, session.kind);
  };

  const selectMcq = (optionId) => {
    if (result) return;
    setSelected(optionId);
    submit(optionId, { score: optionId === question.correct_option ? 100 : 0, level: optionId === question.correct_option ? 'perfect' : 'wrong' });
  };

  const checkTyping = () => submit(userInput, gradeTyping(userInput, question));
  const next = () => {
    if (index === questions.length - 1) {
      onFinish(summary, session);
      setIndex(questions.length);
      return;
    }
    setIndex((value) => value + 1);
    setSelected('');
    setUserInput('');
    setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (result) next();
          else if (userInput.trim()) checkTyping();
        }
        return;
      }
      if (['1', '2', '3', '4'].includes(e.key) && !result && questionIsMcq(question)) {
        e.preventDefault();
        const optId = ['A', 'B', 'C', 'D'][+e.key - 1];
        if (question.options?.find(o => o.id === optId)) selectMcq(optId);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (result) next();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, result, userInput, question]);

  if (index >= questions.length) {
    const correct = summary.filter((item) => item.isCorrect).length;
    const average = summary.length ? Math.round(summary.reduce((sum, item) => sum + item.score, 0) / summary.length) : 0;
    const isPerfect = correct === questions.length;
    const isGood = correct / questions.length >= 0.7;
    return (
      <div className="mx-auto max-w-xl text-center">
        {(isPerfect || isGood) && <Confetti />}
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-xl text-5xl ${isPerfect ? 'bg-warning-subtle' : isGood ? 'bg-success-subtle' : 'bg-error-subtle'}`}>
          {isPerfect ? <Icon.Trophy className="h-9 w-9 text-warning"/> : isGood ? <Icon.Check className="h-9 w-9 text-success"/> : <Icon.Book className="h-9 w-9 text-error"/>}
        </div>
        <h1 className="mt-5 h1-text font-bold">{isPerfect ? 'Hoàn hảo!' : isGood ? 'Làm tốt lắm!' : 'Tiếp tục cố lên!'}</h1>
        <p className="mt-2 text-text-muted">{correct}/{questions.length} câu đạt · điểm trung bình {average}</p>
        <p className="mt-1 text-sm text-text-secondary">
          {isPerfect ? 'Trúc tự hào về bạn lắm!' : isGood ? 'Trúc: Giỏi, giữ đà này nhé!' : 'Băng: Không sao, ôn lại rồi thử lần nữa nhé!'}
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          <StatBox label="Đạt" value={correct} tone="mint" />
          <StatBox label="Cần ôn" value={questions.length - correct} tone="rose" />
          <StatBox label="TB điểm" value={average} tone="amber" />
        </div>
        <button onClick={onExit} className="btn-primary mt-6 w-full">Về lộ trình</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onExit} className="icon-action grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border-strong bg-bg-secondary text-text-muted" aria-label="Thoát quiz" data-tooltip="Thoát quiz"><Icon.X /></button>
        <div className="flex-1">
          <div className="mb-2 flex justify-between text-xs font-bold text-text-muted"><span>Câu {index + 1}/{questions.length}</span><span>{accuracy}% chính xác</span></div>
          <ProgressBar value={((index + 1) / questions.length) * 100} />
        </div>
      </div>
      <section className="card">
        <QuestionPrompt question={question} />
        {questionIsMcq(question) ? (
          <McqOptions question={question} selected={selected} result={result} onSelect={selectMcq} />
        ) : (
          <TypingInput question={question} value={userInput} onChange={setUserInput} onCheck={checkTyping} result={result} />
        )}
        {result && <FeedbackPanel question={question} result={result} userAnswer={questionIsMcq(question) ? selected : userInput} onNext={next} onOpenEntry={onOpenEntry} onEditQuestion={onEditQuestion} nextLabel={index === questions.length - 1 ? 'Xem kết quả' : 'Tiếp'} />}
      </section>
    </div>
  );
}
function WrongAnswerBook({ progress, onPractice, onOpenEntry }) {
 const wrong = progress.wrongAnswers;
 if (!wrong.length) return <EmptyState icon="✓" title="Sổ tay đang sạch" text="Các câu chưa đạt sẽ tự xuất hiện tại đây." />;
 return (
 <div>
 <div className="mb-4 flex items-center justify-between gap-3">
 <p className="text-sm font-bold text-text-muted">{wrong.length} câu cần ôn lại</p>
 <button onClick={() => onPractice(wrong.map((item) => item.questionId))} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white dark:bg-error-subtle dark:text-text-primary">Luyện lại câu sai</button>
 </div>
 <div className="space-y-3">
 {wrong.map((item) => {
 const question = ALL_QUESTIONS.find((candidate) => candidate.id === item.questionId);
 if (!question) return null;
 const correct = questionIsMcq(question)
 ? `${question.correct_option}. ${question.options.find((option) => option.id === question.correct_option)?.text}`
 : question.sample_answer;
 return (
 <article key={item.questionId} className="rounded-lg border border-error bg-bg-secondary p-4 shadow-sm dark:border-errorbg-bg-secondary">
 <div className="flex items-start justify-between gap-3">
 <div><span className="text-xs font-bold uppercase tracking-wider text-error">Bài {question.bai}</span><h3 className="mt-1 font-bold">{question.question_vi}</h3></div>
 <span className="rounded-md bg-error-subtle px-2 py-1 text-xs font-bold text-error dark:bg-error-subtle dark:text-error">{item.score}/100</span>
 </div>
 <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
 <p className="rounded-lg bg-error-subtle p-3 dark:"><strong>Bạn trả lời:</strong><br />{item.userAnswer || 'Bỏ trống'}</p>
 <p className="rounded-lg bg-success-subtle p-3 dark:bg-success-subtle/30"><strong>Đáp án:</strong><br />{correct}</p>
 </div>
 <p className="mt-3 text-sm text-text-secondary">{question.explanation?.why_correct}</p>
 <div className="mt-3 flex flex-wrap gap-2">{question.related_glossary?.map((id) => { const entry = ALL_GLOSSARY_ENTRIES.find((candidate) => candidate.id === id); return entry ? <button key={id} onClick={() => onOpenEntry(entry)} className="rounded-md bg-bg-tertiary px-2 py-1 text-xs font-bold ">{entryTitle(entry)}</button> : null; })}</div>
 </article>
 );
 })}
 </div>
 </div>
 );
}

function BookmarksPanel({ progress, onToggleBookmark, onOpenEntry, onSaveNote }) {
 const [baiFilter, setBaiFilter] = useState('all');
 const entries = progress.bookmarks
 .map((id) => ALL_GLOSSARY_ENTRIES.find((entry) => entry.id === id))
 .filter((entry) => entry && (baiFilter === 'all' || entry.bai === Number(baiFilter)));
 const openRelated = (id) => { const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (entry) onOpenEntry(entry); };
 return (
 <div>
 <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-bold text-text-muted">{entries.length} mục đã đánh dấu</p><select value={baiFilter} onChange={(event) => setBaiFilter(event.target.value)} className="rounded-lg border border-border-strong bg-bg-secondary px-3 py-2 text-sm dark:border-border-strong dark:bg-bg-secondary"><option value="all">Tất cả bài</option>{LESSONS.map((bai) => <option key={bai} value={bai}>Bài {bai}</option>)}</select></div>
 {!entries.length && <EmptyState icon="☆" title="Chưa có mục yêu thích" text="Bấm dấu sao trên từ vựng, ngữ pháp hoặc mẫu câu để lưu." />}
 <div className="space-y-3">
 {entries.map((entry) => {
 if (entry.type === 'word') return <WordCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
 if (entry.type === 'grammar') return <GrammarCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
 return <PhraseCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
 })}
 </div>
 </div>
 );
}

function SRSReviewScreen({ progress, onRate }) {
 const dueEntries = useMemo(() => getDueEntries(progress.srs), [progress.srs]);
 const [phase, setPhase] = useState('intro');
 const [deck, setDeck] = useState([]);
 const [index, setIndex] = useState(0);
 const [flipped, setFlipped] = useState(false);
 const [ratings, setRatings] = useState([]);
 const start = () => { setDeck(shuffleArray(dueEntries)); setIndex(0); setFlipped(false); setRatings([]); setPhase('review'); };
 const rate = (rating) => {
 const entry = deck[index];
 onRate(entry.id, rating);
 const nextRatings = [...ratings, rating];
 setRatings(nextRatings);
 if (index >= deck.length - 1) setPhase('summary');
 else { setIndex((value) => value + 1); setFlipped(false); }
 };
 useEffect(() => {
  if (phase !== 'review' || !flipped) return undefined;
  const onKeyDown = (event) => {
   const rating = SRS_RATINGS[Number(event.key) - 1];
   if (!rating) return;
   event.preventDefault();
   rate(rating.id);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
 }, [phase, flipped, index]);
 if (phase === 'intro') {
 return (
 <div className="rounded-lg border border-violet-200 bg-bg-secondary p-6 text-center shadow-sm dark:border-violet-900 dark:bg-bg-secondary">
 <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-accent-subtle text-accent"><Icon.Refresh className="h-7 w-7" /></div>
 <h2 className="mt-4 h2-text font-bold">Cần ôn hôm nay: {dueEntries.length} từ</h2>
 <p className="mt-2 text-sm text-text-muted">{Object.keys(progress.srs).length} mục đang được theo dõi theo lịch nhớ.</p>
 <button onClick={start} disabled={!dueEntries.length} className="btn-primary mt-6 w-full">Bắt đầu ôn</button>
 </div>
 );
 }
 if (phase === 'summary') {
 const remembered = ratings.filter((rating) => ['good', 'easy'].includes(rating)).length;
 const retry = ratings.length - remembered;
 return (
 <div className="rounded-lg border border-success bg-bg-secondary p-6 text-center shadow-sm dark:border-success dark:bg-bg-secondary">
 <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-success-subtle h1-text">✓</div>
 <h2 className="mt-4 h2-text font-bold">Hoàn thành lượt ôn</h2>
 <p className="mt-2 text-text-muted">Đã ôn {ratings.length} từ, {remembered} từ nhớ tốt, {retry} từ cần ôn lại.</p>
 <button onClick={() => setPhase('intro')} className="btn-primary mt-6 w-full">Xem lịch ôn</button>
 </div>
 );
 }
 const entry = deck[index];
 const isWord = entry.type === 'word';
 return (
 <div>
 <div className="mb-3 flex items-center justify-between text-sm font-bold text-text-muted"><span>Thẻ {index + 1}/{deck.length}</span><span>Mức {entry.srs.level}/5 · {entry.srs.interval} ngày</span></div>
 <ProgressBar value={((index + 1) / deck.length) * 100} />
 <div role="button" tabIndex={0} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setFlipped((value) => !value); }} className="relative mt-4 flex min-h-80 flex-col items-center justify-center rounded-lg border border-border bg-bg-secondary p-7 text-center shadow-lg dark:border-border-strong dark:bg-bg-secondary">
 <span className="absolute left-4 top-4 text-xs font-bold uppercase tracking-wider text-text-muted">{flipped ? 'Mặt nghĩa' : 'Mặt chữ'}</span>
 <SpeakButton text={isWord ? entry.word_zh : entry.examples?.[0]?.zh || entry.grammar_title_zh} className="absolute right-4 top-4" />
 {!flipped ? <><span className="display-text font-bold">{entryTitle(entry)}</span>{entry.pinyin && <span className="mt-4 text-xl font-bold text-error">{entry.pinyin}</span>}<span className="mt-6 text-sm font-bold text-text-muted">Chạm để xem nghĩa</span></> : <><span className="h2-text font-bold">{entryMeaning(entry)}</span>{isWord && <><span className="mt-2 text-text-muted">{entry.meaning_en}</span><span className="mt-6 font-bold">{entry.example_zh}</span><span className="mt-1 text-sm text-success">{entry.example_pinyin}</span><span className="mt-1 text-sm text-text-muted">{entry.example_vi}</span></>}{!isWord && entry.structure && <span className="mt-5 rounded-lg bg-slate-950 px-4 py-3 font-mono text-sm font-bold text-success">{entry.structure}</span>}</>}
 </div>
 {flipped && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{SRS_RATINGS.map((rating) => <button key={rating.id} onClick={() => rate(rating.id)} className={`rounded-lg px-3 py-3 font-bold transition hover:-translate-y-0.5 ${rating.tone}`}><kbd className="mr-2 rounded border border-current/30 px-1.5 py-0.5 text-[10px] opacity-70">{rating.shortcut}</kbd>{rating.label}</button>)}</div>}
 </div>
 );
}

function NotesPanel({ progress, onSaveNote, onOpenEntry }) {
 const items = Object.entries(progress.notes || {})
 .map(([id, note]) => ({ entry: ALL_GLOSSARY_ENTRIES.find((candidate) => candidate.id === id), note }))
 .filter((item) => item.entry && item.note);
 if (!items.length) return <EmptyState icon="记" title="Chưa có ghi chú" text="Thêm ghi chú từ thẻ từ vựng, ngữ pháp hoặc mẫu câu." />;
 return (
 <div className="space-y-3">
 {items.map(({ entry, note }) => <article key={entry.id} className="rounded-lg border border-warning bg-bg-secondary p-4 shadow-sm dark:border-warning dark:bg-bg-secondary"><div className="flex items-start justify-between gap-3"><button onClick={() => onOpenEntry(entry)} className="min-w-0 flex-1 text-left"><p className="text-xs font-bold uppercase tracking-wider text-error">Bài {entry.bai} · {entry.type}</p><h3 className="mt-1 text-xl font-bold">{entryTitle(entry)}</h3><p className="mt-1 text-sm text-text-muted">{entryMeaning(entry)}</p></button><NoteEditor entryId={entry.id} note={note} onSave={onSaveNote} /></div><p className="mt-4 rounded-lg bg-warning-subtle p-3 text-sm leading-relaxed dark:bg-warning-subtle/30">{note}</p></article>)}
 </div>
 );
}

function analyzeWeakTopics(progress) {
 const history = progress.wrongAnswersDetailed || [];
 const detailed = history.length
 ? history
 : progress.wrongAnswers.map((wrong) => {
 const question = ALL_QUESTIONS.find((item) => item.id === wrong.questionId);
 return question ? { questionId: question.id, bai: question.bai, type: question.type, related_glossary: question.related_glossary || [] } : null;
 }).filter(Boolean);
 const stats = { byBai: {}, byEntry: {}, byType: {}, byTag: {}, byQuestion: {} };
 for (const wrong of detailed) {
 const question = ALL_QUESTIONS.find((item) => item.id === wrong.questionId);
 const bai = wrong.bai || question?.bai;
 const type = wrong.type || question?.type;
 const related = wrong.related_glossary || question?.related_glossary || [];
 if (bai) stats.byBai[bai] = (stats.byBai[bai] || 0) + 1;
 if (type) stats.byType[type] = (stats.byType[type] || 0) + 1;
 if (wrong.questionId) stats.byQuestion[wrong.questionId] = (stats.byQuestion[wrong.questionId] || 0) + 1;
 for (const entryId of related) {
 stats.byEntry[entryId] = (stats.byEntry[entryId] || 0) + 1;
 const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === entryId);
 for (const tag of entry?.tags || []) stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
 }
 }
 return stats;
}

function WeakTopicsScreen({ progress, onPractice, onOpenEntry }) {
 const stats = useMemo(() => analyzeWeakTopics(progress), [progress]);
 const lessons = Object.entries(stats.byBai).sort((a, b) => b[1] - a[1]).slice(0, 5);
 const entries = Object.entries(stats.byEntry).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ entry: ALL_GLOSSARY_ENTRIES.find((item) => item.id === id), count })).filter((item) => item.entry);
 const types = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
 const tags = Object.entries(stats.byTag).sort((a, b) => b[1] - a[1]).slice(0, 5);
 const questionIds = Object.entries(stats.byQuestion).sort((a, b) => b[1] - a[1]).map(([id]) => id);
 if (!lessons.length) return <EmptyState icon="析" title="Chưa có chủ đề yếu" text="Kết quả sẽ xuất hiện sau khi bạn luyện quiz." />;
 return (
 <div className="space-y-6">
 <div className="flex flex-col gap-3 rounded-lg border border-error bg-error-subtle p-4 sm:flex-row sm:items-center sm:justify-between dark:border-error"><div><p className="font-bold">Lượt luyện theo điểm yếu</p><p className="mt-1 text-sm text-text-secondary">Tạo từ {questionIds.length} câu từng trả lời chưa đúng.</p></div><button onClick={() => onPractice(questionIds.slice(0, 20))} disabled={!questionIds.length} className="btn-primary inline-flex items-center justify-center gap-2"><Icon.Target className="h-4 w-4"/>Ôn chủ đề yếu</button></div>
 <section><h2 className="text-lg font-bold">Bài cần ôn lại</h2><div className="mt-3 space-y-2">{lessons.map(([bai, count]) => { const attempts = Math.max(progress.baiProgress[bai]?.quizDone || 0, count); const percent = Math.min(100, Math.round((count / attempts) * 100)); return <div key={bai} className="grid grid-cols-[60px_1fr_54px] items-center gap-3 rounded-lg bg-bg-secondary p-3 dark:bg-bg-secondary"><span className="font-bold">Bài {bai}</span><ProgressBar value={percent} /><span className="text-right text-sm font-bold text-error">{percent}%</span></div>; })}</div></section>
 <section><h2 className="text-lg font-bold">Từ vựng và ngữ pháp hay sai</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{entries.map(({ entry, count }) => <button key={entry.id} onClick={() => onOpenEntry(entry)} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-secondary p-3 text-left dark:border-border-strong dark:bg-bg-secondary"><span><span className="block font-bold">{entryTitle(entry)}</span><span className="mt-1 block text-xs text-text-muted">Bài {entry.bai} · {entryMeaning(entry)}</span></span><span className="rounded-md bg-error-subtle px-2 py-1 text-xs font-bold text-error dark:bg-error-subtle dark:text-error">{count}×</span></button>)}</div></section>
 <section className="grid gap-5 sm:grid-cols-2"><div><h2 className="text-lg font-bold">Dạng câu hay sai</h2><div className="mt-3 space-y-2">{types.map(([type, count]) => <div key={type} className="flex items-center justify-between rounded-lg bg-bg-secondary p-3 text-sm dark:bg-bg-secondary"><span className="font-bold">{TYPE_LABELS[type] || type}</span><span className="font-bold text-error">{count} lần</span></div>)}</div></div><div><h2 className="text-lg font-bold">Tag cần củng cố</h2><div className="mt-3 flex flex-wrap gap-2">{tags.map(([tag, count]) => <span key={tag} className="rounded-lg bg-warning-subtle px-3 py-2 text-sm font-bold text-warning dark:bg-warning-subtle dark:text-warning">{tag.replaceAll('_', ' ')} · {count}</span>)}</div></div></section>
 </div>
 );
}

function ReviewScreen({ progress, onPracticeWrong, onOpenEntry, onToggleBookmark, onSaveNote, onRateSrs }) {
 const [tab, setTab] = useState('wrong');
 const learnedBais = progress.unlockedBai;
 const learnedEntries = learnedBais.flatMap((bai) => GLOSSARY[bai].entries);
 const grammar = learnedEntries.filter((entry) => entry.type === 'grammar');
 const tabs = [
 { id: 'wrong', label: `Câu sai ${progress.wrongAnswers.length}` },
 { id: 'flashcards', label: 'Từ vựng' },
 { id: 'grammar', label: 'Ngữ pháp' },
 { id: 'bookmarks', label: `Đánh dấu ${progress.bookmarks.length}` },
 { id: 'srs', label: `SRS ${getDueEntries(progress.srs).length}` },
 { id: 'notes', label: `Ghi chú ${Object.keys(progress.notes || {}).length}` },
 { id: 'weak', label: 'Điểm yếu' },
 ];
 return (
 <div>
 <SectionHeading eyebrow="Ôn tập thông minh" title="Nội dung cần củng cố" />
 <div className="flex items-center gap-3 "><Mascot type="penguin" size="md" /><p className="text-sm font-bold text-text-primary"></p></div>
 <div className="scrollbar-thin mb-6 flex gap-2 overflow-x-auto border-b border-border pb-3 dark:border-border-strong">
 {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`filter-btn whitespace-nowrap ${tab === item.id ? 'active' : ''}`}>{item.label}</button>)}
 </div>
 {tab === 'wrong' && <WrongAnswerBook progress={progress} onPractice={onPracticeWrong} onOpenEntry={onOpenEntry} />}
 {tab === 'flashcards' && <FlashcardMode entries={learnedEntries} title="Từ vựng đã mở khóa" />}
 {tab === 'grammar' && <div className="space-y-3">{grammar.map((entry) => <GrammarCard key={entry.id} entry={entry} onRelated={(id) => { const related = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (related) onOpenEntry(related); }} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />)}</div>}
 {tab === 'bookmarks' && <BookmarksPanel progress={progress} onToggleBookmark={onToggleBookmark} onOpenEntry={onOpenEntry} onSaveNote={onSaveNote} />}
 {tab === 'srs' && <SRSReviewScreen progress={progress} onRate={onRateSrs} />}
 {tab === 'notes' && <NotesPanel progress={progress} onSaveNote={onSaveNote} onOpenEntry={onOpenEntry} />}
 {tab === 'weak' && <WeakTopicsScreen progress={progress} onPractice={onPracticeWrong} onOpenEntry={onOpenEntry} />}
 </div>
 );
}

function ExamScreen({ onRecord, onOpenEntry }) {
 const [selectedBais, setSelectedBais] = useState([1]);
 const [count, setCount] = useState(20);
 const [phase, setPhase] = useState('setup');
 const [questions, setQuestions] = useState([]);
 const [answers, setAnswers] = useState({});
 const [index, setIndex] = useState(0);
 const [draft, setDraft] = useState('');
 const [startedAt, setStartedAt] = useState(null);
 const [result, setResult] = useState(null);

 const toggleBai = (bai) => setSelectedBais((items) => items.includes(bai) ? items.filter((item) => item !== bai) : [...items, bai]);
 const start = () => {
 const pool = selectedBais.flatMap((bai) => QUIZZES[bai].questions);
 const selected = shuffleArray(pool).slice(0, Math.min(count, pool.length));
 if (!selected.length) return;
 setQuestions(selected);
 setAnswers({});
 setIndex(0);
 setDraft('');
 setStartedAt(Date.now());
 setResult(null);
 setPhase('active');
 };

 const saveAndMove = () => {
 const question = questions[index];
 if (!draft.trim()) return;
 const nextAnswers = { ...answers, [question.id]: draft };
 setAnswers(nextAnswers);
 if (index < questions.length - 1) {
 setIndex((value) => value + 1);
 setDraft(nextAnswers[questions[index + 1].id] || '');
 } else {
 const details = questions.map((item) => {
 const answer = nextAnswers[item.id] || '';
 const grade = questionIsMcq(item)
 ? { score: answer === item.correct_option ? 100 : 0, level: answer === item.correct_option ? 'perfect' : 'wrong' }
 : gradeTyping(answer, item);
 const isCorrect = questionIsMcq(item) ? grade.score === 100 : grade.score >= 70;
 onRecord(item, answer, { ...grade, isCorrect }, 'exam');
 return { question: item, answer, score: grade.score, isCorrect };
 });
 setResult({ details, seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) });
 setPhase('result');
 }
 };

 if (phase === 'setup') {
 return (
 <div>
 <SectionHeading eyebrow="Thi thử" title="Tạo đề theo mục tiêu" />
 <div className="rounded-lg border border-border bg-bg-secondary p-5 shadow-sm dark:border-border-strong dark:bg-bg-secondary">
 <p className="font-bold">Chọn bài</p>
 <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
 {LESSONS.map((bai) => <button key={bai} onClick={() => toggleBai(bai)} className={`rounded-lg py-2 font-bold ${selectedBais.includes(bai) ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted'}`}>{bai}</button>)}
 </div>
 <div className="mt-5">
 <p className="font-bold">Số câu</p>
 <div className="mt-3 flex gap-2">{[20, 30, 50].map((value) => <button key={value} onClick={() => setCount(value)} className={`rounded-lg px-5 py-2 font-bold ${count === value ? 'bg-success text-white' : 'bg-bg-tertiary'}`}>{value}</button>)}</div>
 </div>
 <button onClick={start} disabled={!selectedBais.length} className="btn-primary mt-7 w-full">Bắt đầu thi</button>
 </div>
 </div>
 );
 }

 if (phase === 'result') {
 const correct = result.details.filter((item) => item.isCorrect).length;
 return (
 <div>
 <SectionHeading eyebrow="Kết quả" title={`${correct}/${result.details.length} câu đạt`} action={<span className="rounded-lg bg-warning-subtle px-3 py-2 text-sm font-bold text-warning dark:bg-warning-subtle dark:text-warning">{Math.floor(result.seconds / 60)}m {result.seconds % 60}s</span>} />
 <div className="mb-5 grid grid-cols-3 gap-2"><StatBox label="Điểm" value={`${Math.round((correct / result.details.length) * 100)}%`} tone="mint" /><StatBox label="Đúng" value={correct} tone="amber" /><StatBox label="Sai" value={result.details.length - correct} tone="rose" /></div>
 <div className="space-y-3">{result.details.map((item, itemIndex) => <article key={item.question.id} className={`rounded-lg border bg-bg-secondary p-4 dark:bg-bg-secondary ${item.isCorrect ? 'border-success dark:border-success' : 'border-error'}`}><p className="text-xs font-bold text-text-muted">Câu {itemIndex + 1} · Bài {item.question.bai}</p><p className="mt-1 font-bold">{item.question.question_vi}</p><p className="mt-2 text-sm"><strong>Trả lời:</strong> {item.answer}</p><p className="mt-1 text-sm"><strong>Đáp án:</strong> {questionIsMcq(item.question) ? item.question.correct_option : item.question.sample_answer}</p><p className="mt-2 text-sm text-text-muted">{item.question.explanation?.why_correct}</p></article>)}</div>
 <button onClick={() => setPhase('setup')} className="btn-primary mt-5 w-full">Tạo đề mới</button>
 </div>
 );
 }

 const question = questions[index];
 const isMcq = questionIsMcq(question);
 return (
 <div className="mx-auto max-w-2xl">
 <div className="mb-4"><div className="mb-2 flex justify-between text-sm font-bold"><span>Đề thi</span><span>{index + 1}/{questions.length}</span></div><ProgressBar value={((index + 1) / questions.length) * 100} /></div>
 <section className="rounded-lg border border-border bg-bg-secondary p-5 shadow-lg sm:p-7 dark:border-border-strong dark:bg-bg-secondary">
 <QuestionPrompt question={question} />
 {isMcq ? (
 <McqOptions question={question} selected={draft} result={null} onSelect={setDraft} />
 ) : (
 <div className="mt-6">
 {question.hints?.length > 0 && (
 <details className="mb-3 rounded-lg border border-warning bg-warning-subtle p-3 text-sm dark:border-warning dark:bg-warning-subtle/30">
 <summary className="cursor-pointer font-bold text-warning dark:text-warning">Gợi ý</summary>
 <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">{question.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
 </details>
 )}
 <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="w-full rounded-lg border border-border-strong bg-bg-secondary px-4 py-3 dark:border-border-strong" placeholder={question.type === 'translation_zh_to_vi' ? 'Gõ câu tiếng Việt...' : 'Gõ chữ Hán...'} />
 </div>
 )}
 <div className="mt-5 flex gap-2">
 <button onClick={() => { if (index > 0) { const previous = index - 1; setAnswers((items) => ({ ...items, [question.id]: draft })); setIndex(previous); setDraft(answers[questions[previous].id] || ''); } }} disabled={index === 0} className="rounded-lg border border-border-strong bg-bg-secondary px-4 py-3 font-bold disabled:opacity-40 dark:border-border-strong dark:bg-bg-secondary">← Trước</button>
 <button onClick={saveAndMove} disabled={!draft.trim()} className="flex-1 rounded-lg bg-accent px-4 py-3 font-bold text-white disabled:opacity-40">{index === questions.length - 1 ? 'Nộp bài' : 'Câu tiếp →'}</button>
 </div>
 </section>
 </div>
 );
}

function BossBattleScreen({ progress, onRecord, onWin }) {
 const eligibleBais = LESSONS.filter((bai) => progress.baiProgress[bai].completed);
 const poolBais = eligibleBais.length ? eligibleBais : [1];
 const [questions, setQuestions] = useState(() => shuffleArray(poolBais.flatMap((bai) => QUIZZES[bai].questions).filter((question) => ['apply', 'synthesize'].includes(question.level))).slice(0, 10));
 const [index, setIndex] = useState(0);
 const [bossHp, setBossHp] = useState(100);
 const [playerHp, setPlayerHp] = useState(100);
 const [selected, setSelected] = useState('');
 const [input, setInput] = useState('');
 const [result, setResult] = useState(null);
 const [status, setStatus] = useState('active');
 const question = questions[index % Math.max(questions.length, 1)];

 const submit = (answer, grade) => {
 const isCorrect = questionIsMcq(question) ? grade.score === 100 : grade.score >= 70;
 setResult({ ...grade, isCorrect });
 if (isCorrect) setBossHp((hp) => Math.max(0, hp - 10));
 else setPlayerHp((hp) => Math.max(0, hp - 15));
 onRecord(question, answer, { ...grade, isCorrect }, 'boss');
 };
 const next = () => {
 if (bossHp <= 0) { setStatus('won'); onWin(); return; }
 if (playerHp <= 0) { setStatus('lost'); return; }
 if (index === questions.length - 1) setQuestions((items) => shuffleArray(items));
 setIndex((value) => (value + 1) % questions.length);
 setSelected(''); setInput(''); setResult(null);
 };
 const reset = () => { setQuestions(shuffleArray(poolBais.flatMap((bai) => QUIZZES[bai].questions).filter((item) => ['apply', 'synthesize'].includes(item.level))).slice(0, 10)); setIndex(0); setBossHp(100); setPlayerHp(100); setSelected(''); setInput(''); setResult(null); setStatus('active'); };

 if (status !== 'active') return <div className="mx-auto max-w-lg text-center"><div className={`mx-auto grid h-24 w-24 place-items-center rounded-lg ${status === 'won' ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`}>{status === 'won' ? <Icon.Trophy className="h-10 w-10"/> : <Icon.Refresh className="h-10 w-10"/>}</div><h1 className="mt-5 h1-text font-bold">{status === 'won' ? 'Chiến thắng!' : 'Thử lại nhé'}</h1><p className="mt-2 text-text-muted">{status === 'won' ? `Bạn nhận ${XP_REWARDS.boss} XP và một huy hiệu mới.` : 'Ôn lại câu sai rồi quay lại sẽ hiệu quả hơn.'}</p><button onClick={reset} className="btn-primary mt-6 w-full">Đấu lại</button></div>;
 if (!question) return <EmptyState icon="♛" title="Chưa có câu Boss" text="Hoàn thành thêm bài để mở câu hỏi tổng hợp." />;
 return (
 <div className="mx-auto max-w-2xl">
 <SectionHeading eyebrow="Boss Battle" title="Thử thách tổng hợp" />
 <div className="mb-4 grid grid-cols-2 gap-3">
 <div><div className="mb-1 flex justify-between text-xs font-bold"><span>Người học</span><span>{playerHp} HP</span></div><div role="progressbar" aria-label="Sinh lực người học" aria-valuemin={0} aria-valuemax={100} aria-valuenow={playerHp} className="h-3 overflow-hidden rounded-full bg-border"><div className="h-full origin-left bg-success transition-transform duration-300" style={{ transform: `scaleX(${playerHp / 100})` }} /></div></div>
 <div><div className="mb-1 flex justify-between text-xs font-bold"><span>Boss</span><span>{bossHp} HP</span></div><div role="progressbar" aria-label="Sinh lực Boss" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bossHp} className="h-3 overflow-hidden rounded-full bg-border"><div className="h-full origin-left bg-error transition-transform duration-300" style={{ transform: `scaleX(${bossHp / 100})` }} /></div></div>
 </div>
 <section className="rounded-lg border border-border bg-bg-secondary p-5 shadow-lg sm:p-7">
 <QuestionPrompt question={question} />
 {questionIsMcq(question) ? <McqOptions question={question} selected={selected} result={result} onSelect={(option) => { setSelected(option); submit(option, { score: option === question.correct_option ? 100 : 0, level: option === question.correct_option ? 'perfect' : 'wrong' }); }} /> : <TypingInput question={question} value={input} onChange={setInput} onCheck={() => submit(input, gradeTyping(input, question))} result={result} />}
 {result && <div className={`mt-5 rounded-lg p-4 ${result.isCorrect ? 'bg-success-subtle' : 'bg-error-subtle'}`}><p className="font-bold">{result.isCorrect ? 'Đòn đánh chính xác: Boss -10 HP' : 'Boss phản công: bạn -15 HP'}</p><p className="mt-2 text-sm">{question.explanation?.why_correct}</p><button onClick={next} className="btn-primary mt-4 w-full">Tiếp tục</button></div>}
 </section>
 </div>
 );
}

function ImportExportPanel({ progress, onImport }) {
 const inputRef = useRef(null);
 const [status, setStatus] = useState('');
 const [pendingImport, setPendingImport] = useState(null);
 const exportProgress = () => {
 const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const anchor = document.createElement('a');
 anchor.href = url;
 anchor.download = `dudu-progress-${localDate()}.json`;
 anchor.click();
 URL.revokeObjectURL(url);
 setStatus('Đã xuất tiến độ thành công.');
 };
 const importProgress = async (event) => {
 const file = event.target.files?.[0];
 event.target.value = '';
 if (!file) return;
 try {
 const parsed = JSON.parse(await file.text());
 if (!parsed || typeof parsed !== 'object' || !parsed.baiProgress || !parsed.accuracy) throw new Error('invalid');
 setPendingImport(parsed);
 } catch {
 setStatus('File không hợp lệ hoặc bị lỗi JSON.');
 }
 };
 return (
 <section className="rounded-lg border border-border bg-bg-secondary p-4 dark:border-border-strong">
 <h3 className="font-bold">Sao lưu tiến độ</h3>
 <p className="mt-1 text-sm text-text-muted">Xuất file JSON để chuyển thiết bị hoặc khôi phục sau này.</p>
 <div className="mt-4 grid gap-2 sm:grid-cols-2">
 <button onClick={exportProgress} className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-bold text-white"><Icon.Download/>Xuất tiến độ</button>
 <button onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg-primary px-4 py-3 font-bold"><Icon.Upload/>Nhập tiến độ</button>
 </div>
 <input ref={inputRef} type="file" accept="application/json,.json" onChange={importProgress} className="hidden" />
 {status && <p className="mt-3 text-sm font-bold text-success">{status}</p>}
 {pendingImport && <ConfirmDialog title="Ghi đè tiến độ?" message="Tệp này sẽ thay thế toàn bộ tiến độ hiện tại trên thiết bị. Bạn có chắc muốn tiếp tục?" confirmLabel="Nhập tiến độ" danger onCancel={() => setPendingImport(null)} onConfirm={() => { onImport(pendingImport); setPendingImport(null); setStatus('Đã khôi phục tiến độ.'); }} />}
 </section>
 );
}

function PomodoroTimer({ sessionsToday, onSessionComplete }) {
 const callbackRef = useRef(onSessionComplete);
 callbackRef.current = onSessionComplete;
 const [open, setOpen] = useState(false);
 const [timer, setTimer] = useState(() => {
 const saved = readStorage('dudu-pomodoro-v1', null);
 return saved && ['work', 'break'].includes(saved.mode)
 ? { isRunning: false, mode: saved.mode, timeLeft: Number(saved.timeLeft) || 25 * 60 }
 : { isRunning: false, mode: 'work', timeLeft: 25 * 60 };
 });

 useEffect(() => writeStorage('dudu-pomodoro-v1', timer), [timer]);
 useEffect(() => {
 if (!timer.isRunning) return undefined;
 const interval = setInterval(() => {
 setTimer((previous) => {
 if (previous.timeLeft > 1) return { ...previous, timeLeft: previous.timeLeft - 1 };
 const completedWork = previous.mode === 'work';
 const nextMode = completedWork ? 'break' : 'work';
 if (completedWork) callbackRef.current?.();
 if ('Notification' in window && Notification.permission === 'granted') {
 new Notification(completedWork ? 'Đến giờ nghỉ 5 phút' : 'Sẵn sàng học tiếp');
 }
 return { isRunning: completedWork, mode: nextMode, timeLeft: nextMode === 'work' ? 25 * 60 : 5 * 60 };
 });
 }, 1000);
 return () => clearInterval(interval);
 }, [timer.isRunning]);

 const duration = timer.mode === 'work' ? 25 * 60 : 5 * 60;
 const percent = ((duration - timer.timeLeft) / duration) * 100;
 const minutes = String(Math.floor(timer.timeLeft / 60)).padStart(2, '0');
 const seconds = String(timer.timeLeft % 60).padStart(2, '0');
 const reset = () => setTimer({ isRunning: false, mode: timer.mode, timeLeft: duration });
 return (
 <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end lg:bottom-5 xl:right-[336px]">
 {open && (
 <div className="mb-3 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg-secondary p-4 shadow-lg">
 <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-error">{timer.mode === 'work' ? 'Phiên tập trung' : 'Giờ nghỉ'}</p><p className="mt-1 display-text font-bold tabular-nums">{minutes}:{seconds}</p></div><button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-bg-tertiary font-bold ">×</button></div>
 <ProgressBar value={percent} className="mt-4" />
 <p className="mt-3 flex items-center gap-2 text-sm font-bold text-text-muted"><Icon.Clock className="h-4 w-4"/>{sessionsToday} phiên hôm nay</p>
 <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setTimer((previous) => ({ ...previous, isRunning: !previous.isRunning }))} className="rounded-lg bg-accent px-4 py-2.5 font-bold text-white dark:bg-error-subtle dark:text-text-primary">{timer.isRunning ? 'Tạm dừng' : 'Bắt đầu'}</button><button onClick={reset} className="rounded-lg border border-border-strong px-4 py-2.5 font-bold dark:border-border-strong">Đặt lại</button></div>
 </div>
 )}
 <button onClick={() => setOpen((value) => !value)} className="grid h-12 w-12 place-items-center rounded-xl bg-error text-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-md" aria-label="Mở bộ hẹn giờ Pomodoro" title="Pomodoro"><Icon.Clock className="h-5 w-5"/></button>
 </div>
 );
}

function WeeklyLeaderboard({ weeklyXP = {} }) {
 const weeks = useMemo(() => {
 const monday = new Date();
 monday.setHours(12, 0, 0, 0);
 monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
 return Array.from({ length: 4 }, (_, index) => {
 const date = new Date(monday);
 date.setDate(date.getDate() - (3 - index) * 7);
 const key = getWeekKey(date);
 return { key, label: `W${key.split('W')[1]}`, xp: Number(weeklyXP[key]) || 0 };
 });
 }, [weeklyXP]);
 const current = weeks[weeks.length - 1];
 const previous = weeks[weeks.length - 2];
 const change = previous.xp ? Math.round(((current.xp - previous.xp) / previous.xp) * 100) : current.xp ? 100 : 0;
 const max = Math.max(...weeks.map((week) => week.xp), 10);
 return (
 <section className="mt-6 border-t border-border pt-6 dark:border-border-strong">
 <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-warning"><Icon.Trophy className="h-4 w-4"/>Thành tích tuần</p><h2 className="mt-1 text-xl font-bold">Tuần này: {current.xp} XP</h2><p className="mt-1 text-sm text-text-muted">Tuần trước: {previous.xp} XP</p></div><span className={`self-start rounded-lg px-3 py-2 text-sm font-bold ${change >= 0 ? 'bg-success-subtle text-success' : 'bg-error-subtle text-error'}`}>{change >= 0 ? '+' : ''}{change}%{current.xp > previous.xp && <span> · Top tuần</span>}</span></div>
 <div className="mt-5 flex h-40 items-end gap-3 rounded-lg bg-bg-secondary p-4 dark:bg-bg-secondary">{weeks.map((week, index) => { const ratio = Math.max(0.04, week.xp / max); return <div key={week.key} className="flex h-full flex-1 flex-col text-center"><span className="mb-1 text-xs font-bold text-text-muted">{week.xp}</span><div className="flex min-h-1 flex-1 items-end overflow-hidden rounded-t-md"><div className={`h-full w-full origin-bottom transition-transform duration-300 ${index === weeks.length - 1 ? 'bg-warning-subtle' : 'bg-success-subtle dark:bg-success-subtle'}`} style={{ transform: `scaleY(${ratio})` }} /></div><span className="mt-2 text-xs font-bold text-text-muted">{week.label}</span></div>; })}</div>
 </section>
 );
}

function SoundToggle() {
 const [enabled, setEnabled] = useState(() => localStorage.getItem('dudu-sound-enabled') !== 'false');
 const toggle = () => {
 const next = !enabled;
 setEnabled(next);
 localStorage.setItem('dudu-sound-enabled', String(next));
 if (next) sounds.correct();
 };
 return (
 <section className="rounded-lg border border-border bg-bg-secondary p-4 dark:border-border-strong">
 <h3 className="font-bold">Hiệu ứng âm thanh</h3>
 <p className="mb-4 mt-1 text-sm text-text-muted">Âm thanh khi trả lời đúng/sai hoặc hoàn thành.</p>
 <button onClick={toggle} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold ${enabled ? 'bg-success text-white' : 'bg-bg-tertiary text-text-muted'}`}>
 <Icon.Volume className="h-4 w-4"/>{enabled ? 'Đang bật' : 'Đã tắt'}
 </button>
 </section>
 );
}

function BackgroundSettings({ settings, updateSettings, customBackground, onCustomBackgroundChange, effectiveTheme }) {
 const [error, setError] = useState('');
 const fileInputRef = useRef(null);
 if (!settings) return null;
 const selectedImage = settings.background === 'custom'
  ? customBackground
  : settings.background !== 'none' ? `/backgrounds/${settings.background}.jpg` : null;
 const backgroundEnabled = settings.enableBackground && settings.background !== 'none' && (settings.background !== 'custom' || Boolean(customBackground));
 const previewOverlay = Math.min(0.96, (Math.max(88, Number(settings.overlayOpacity) || 88) + (effectiveTheme === 'dark' ? 4 : 0)) / 100);

 const handleUpload = (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('File phải là ảnh JPG, PNG hoặc WebP.'); return; }
  if (file.size > 3 * 1024 * 1024) { setError('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 3 MB.'); return; }
  const reader = new FileReader();
  reader.onerror = () => setError('Không thể đọc ảnh này. Vui lòng thử file khác.');
  reader.onload = () => {
   const base64 = String(reader.result || '');
   if (base64.length > 4 * 1024 * 1024) { setError('Ảnh sau khi xử lý quá lớn để lưu trong trình duyệt.'); return; }
   const result = onCustomBackgroundChange(base64);
   if (!result.ok) { setError(result.message); return; }
   setError('');
   updateSettings({ enableBackground: true, background: 'custom' });
  };
  reader.readAsDataURL(file);
 };

 const removeCustom = () => {
  onCustomBackgroundChange(null);
  setError('');
  updateSettings({ enableBackground: false, background: 'none' });
 };
 const resetBackground = () => {
  onCustomBackgroundChange(null);
  setError('');
  updateSettings({ enableBackground: false, background: 'none', overlayOpacity: 88, backgroundBlur: 2 });
 };

 return (
 <section className="rounded-lg border border-border bg-bg-secondary p-4">
 <div className="flex items-center justify-between gap-4"><div><h3 className="font-bold">Ảnh nền</h3><p className="mt-1 text-sm text-text-muted">Dùng ảnh có độ tương phản thấp để nội dung luôn dễ đọc.</p></div><label className="relative inline-flex cursor-pointer items-center"><input type="checkbox" className="peer sr-only" checked={backgroundEnabled} onChange={(event) => updateSettings({ enableBackground: event.target.checked, background: event.target.checked && (settings.background === 'none' || (settings.background === 'custom' && !customBackground)) ? (customBackground ? 'custom' : 'sakura') : settings.background })} /><span className="relative h-6 w-11 rounded-full bg-border transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-bg-secondary after:transition-transform after:content-[''] peer-checked:bg-success peer-checked:after:translate-x-full" /></label></div>
 <div className="mt-5 space-y-5">
  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleUpload} className="sr-only" />
  {customBackground ? <div className="grid grid-cols-[128px_1fr] gap-4 rounded-lg border border-border bg-bg-tertiary p-3"><img src={customBackground} alt="Ảnh nền tùy chỉnh" className="h-20 w-32 rounded-md object-cover"/><div className="flex flex-col justify-center"><p className="text-sm font-semibold">Ảnh nền tùy chỉnh</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">Đổi ảnh</button><button type="button" onClick={removeCustom} className="btn-ghost text-error">Xóa</button></div></div></div> : <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary flex w-full items-center justify-center gap-2"><Icon.Upload className="h-4 w-4"/>Tải ảnh lên</button>}
  {error && <p role="alert" className="rounded-md bg-error-subtle px-3 py-2 text-sm font-semibold text-error">{error}</p>}
  {backgroundEnabled && <>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{BACKGROUNDS.map((bg) => <button key={bg.id} type="button" onClick={() => updateSettings({ background: bg.id, enableBackground: bg.id !== 'none' })} className={`relative aspect-video overflow-hidden rounded-lg border-2 transition ${settings.background === bg.id ? 'border-accent ring-2 ring-accent-subtle' : 'border-border hover:border-border-strong'}`}>{bg.id !== 'none' ? <img src={`/backgrounds/${bg.id}.jpg`} className="h-full w-full object-cover" alt={bg.name}/> : <span className="block h-full w-full bg-bg-primary"/>}<span className="absolute inset-x-0 bottom-0 bg-black/65 p-1 text-xs text-white">{bg.name}</span></button>)}{customBackground && <button type="button" onClick={() => updateSettings({ background: 'custom' })} className={`relative aspect-video overflow-hidden rounded-lg border-2 transition ${settings.background === 'custom' ? 'border-accent ring-2 ring-accent-subtle' : 'border-border hover:border-border-strong'}`}><img src={customBackground} className="h-full w-full object-cover" alt="Tùy chỉnh"/><span className="absolute inset-x-0 bottom-0 bg-black/65 p-1 text-xs text-white">Tùy chỉnh</span></button>}</div>
   <div><label className="flex justify-between text-sm"><span className="font-bold">Độ đậm lớp phủ</span><span>{settings.overlayOpacity}%</span></label><input type="range" min="88" max="96" value={settings.overlayOpacity} onChange={(event) => updateSettings({ overlayOpacity: Number(event.target.value) })} className="mt-2 w-full accent-[var(--accent)]"/><p className="mt-1 text-xs text-text-muted">Tối thiểu 88% để chữ luôn rõ trên ảnh.</p></div>
   <div><label className="flex justify-between text-sm"><span className="font-bold">Độ nhòe ảnh</span><span>{settings.backgroundBlur}px</span></label><input type="range" min="0" max="10" value={settings.backgroundBlur} onChange={(event) => updateSettings({ backgroundBlur: Number(event.target.value) })} className="mt-2 w-full accent-[var(--accent)]"/></div>
   <div className="rounded-lg border border-border bg-bg-tertiary p-4"><p className="mb-2 text-sm font-bold">Xem trước</p><div className="relative h-24 overflow-hidden rounded-lg border border-border-strong">{selectedImage && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${selectedImage})`, filter: `blur(${settings.backgroundBlur}px)`, transform: settings.backgroundBlur > 0 ? 'scale(1.05)' : 'scale(1)' }}/>}<div className="absolute inset-0 bg-bg-primary transition-opacity" style={{ opacity: previewOverlay }}/><div className="relative flex h-full items-center justify-center"><span className="font-hanzi text-lg font-bold text-text-primary">你好 · Xin chào</span></div></div></div>
  </>}
  <button type="button" onClick={resetBackground} className="btn-ghost text-text-muted">Reset về mặc định</button>
 </div>
 </section>
 );
}

function PenguinProfileAvatar({ className = '' }) {
 return <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Băng"><circle cx="60" cy="60" r="57" fill="var(--accent-2-subtle)"/><ellipse cx="60" cy="66" rx="36" ry="43" fill="#222832"/><ellipse cx="60" cy="72" rx="26" ry="33" fill="#FFFDF7"/><circle cx="47" cy="51" r="4" fill="#FFFDF7"/><circle cx="73" cy="51" r="4" fill="#FFFDF7"/><circle cx="47" cy="51" r="1.8" fill="#222832"/><circle cx="73" cy="51" r="1.8" fill="#222832"/><path d="M53 59h14l-7 8-7-8Z" fill="var(--warm)"/><path d="M28 65c-10 7-12 18-8 26 9-2 15-8 18-17l-10-9ZM92 65c10 7 12 18 8 26-9-2-15-8-18-17l10-9Z" fill="#222832"/><path d="M41 103c4-7 11-9 18-4-4 7-11 9-18 4ZM79 103c-4-7-11-9-18-4 4 7 11 9 18 4Z" fill="var(--warm)"/><path d="M37 31c12-15 34-20 50-4" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"/></svg>;
}

function ProfileCoverArt() {
 return <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true"><defs><linearGradient id="profileCover" x1="0" x2="1"><stop stopColor="var(--accent)"/><stop offset="1" stopColor="var(--accent-2)"/></linearGradient></defs><rect width="800" height="200" fill="url(#profileCover)"/><circle cx="650" cy="45" r="24" fill="#FFFDF7" opacity=".75"/><path d="M0 165 115 79l88 67 112-111 107 111 87-75 118 89 73-61 100 66v35H0Z" fill="#FFFDF7" opacity=".2"/><path d="M0 180c135-35 254-14 381 0 149 17 278-21 419-5v25H0Z" fill="#FFFDF7" opacity=".28"/><path d="M86 38v129M62 73c25 2 43-13 54-37M65 100c22 0 39 11 52 28" stroke="#FFFDF7" strokeWidth="4" strokeLinecap="round" opacity=".5"/><g fill="#FFFDF7" opacity=".72"><circle cx="58" cy="68" r="6"/><circle cx="77" cy="55" r="7"/><circle cx="101" cy="41" r="6"/><circle cx="67" cy="102" r="6"/><circle cx="113" cy="128" r="7"/></g></svg>;
}

const PROFILE_BADGE_ICONS = { first_lesson: Icon.Check, streak_3: Icon.Flame, streak_7: Icon.Flame, combo_10: Icon.Target, clean_book: Icon.Book, all_lessons: Icon.Trophy, accuracy_90: Icon.Star, boss_first: Icon.Gamepad };

function ApiKeySection() {
 const [draft, setDraft] = useState('');
 const [configured, setConfigured] = useState(false);
 const [visible, setVisible] = useState(false);
 const [busy, setBusy] = useState(null);
 const [status, setStatus] = useState(null);
 const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
 const [modelKey, setModelKey] = useState('');
 const [modelRefresh, setModelRefresh] = useState(0);

 useEffect(() => {
  let active = true;
  getSettings().then((settings) => {
   if (active) { setConfigured(Boolean(settings.geminiApiKey)); setModel(settings.geminiModel || DEFAULT_GEMINI_MODEL); setModelKey(settings.geminiApiKey || ''); }
  }).catch(() => {
   if (active) setStatus({ ok: false, message: 'Không đọc được cài đặt từ IndexedDB.' });
  });
  return () => { active = false; };
 }, []);

 const saveKey = async () => {
  const key = draft.trim();
  if (!key) return;
  setBusy('saving');
  setStatus(null);
  try {
   await saveSettings({ geminiApiKey: key, geminiModel: model });
   setConfigured(true);
   setModelKey(key);
   setModelRefresh((count) => count + 1);
   setDraft('');
   setVisible(false);
   setStatus({ ok: true, message: 'Đã lưu API key trên trình duyệt này.' });
  } catch {
   setStatus({ ok: false, message: 'Không lưu được API key vào IndexedDB.' });
  } finally {
   setBusy(null);
  }
 };

 const checkKey = async () => {
  setBusy('checking');
  setStatus(null);
  try {
   const key = draft.trim() || (await getSettings()).geminiApiKey;
   const result = await testApiKey(key, model);
   setModelKey(key || '');
   setModelRefresh((count) => count + 1);
   setStatus(result.ok
    ? { ok: true, message: draft.trim() ? 'API key hoạt động. Nhấn Lưu để dùng sau.' : 'API key hoạt động.' }
    : { ok: false, message: result.error });
  } catch {
   setStatus({ ok: false, message: 'Không đọc được API key đã lưu.' });
  } finally {
   setBusy(null);
  }
 };

 return <section className="rounded-xl border border-border bg-bg-secondary p-5">
  <h2 className="font-serif text-lg font-semibold">Gemini API Key</h2>
 <p className="mt-1 text-sm text-text-muted">{configured ? 'Đã cấu hình. Key đã lưu không được hiển thị lại.' : 'Chưa cấu hình.'} Lấy key tại Google AI Studio.</p>
  <ModelSelector apiKey={modelKey} value={model} refreshToken={modelRefresh} onChange={async (value) => { setModel(value); try { await saveSettings({ geminiModel: value }); } catch { setStatus({ ok: false, message: 'Không lưu được model.' }); } }} />
  {model.includes('pro') && <p className="mt-2 text-sm text-warning">Model Pro có thể phát sinh chi phí. Hãy kiểm tra quota và giá trong Google AI Studio trước khi xử lý tài liệu dài.</p>}
  <div className="mt-4 flex flex-wrap gap-2">
   <label className="min-w-[220px] flex-1" htmlFor="gemini-api-key"><span className="sr-only">Gemini API key</span><input id="gemini-api-key" className="input w-full" type={visible ? 'text' : 'password'} autoComplete="new-password" value={draft} onChange={(event) => { setDraft(event.target.value); setStatus(null); }} placeholder={configured ? 'Nhập key mới để thay thế' : 'Dán API key của bạn'} /></label>
   <button type="button" className="btn-secondary" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ẩn API key đang nhập' : 'Hiện API key đang nhập'}>{visible ? 'Ẩn' : 'Hiện'}</button>
   <button type="button" className="btn-primary" onClick={saveKey} disabled={!draft.trim() || Boolean(busy)}>Lưu</button>
   <button type="button" className="btn-secondary" onClick={checkKey} disabled={(!draft.trim() && !configured) || Boolean(busy)}>{busy === 'checking' ? 'Đang kiểm tra...' : 'Kiểm tra'}</button>
  </div>
  {status && <p role="status" className={`mt-3 text-sm ${status.ok ? 'text-success' : 'text-error'}`}>{status.message}</p>}
  <p className="mt-3 text-xs text-text-muted">Key chỉ lưu trong IndexedDB trên thiết bị này. Không dùng key nhạy cảm trên máy công cộng.</p>
 </section>;
}

function Dashboard({ progress, onImport, onThemeChange, onColorThemeChange, onChangeGoal, onUpdateProfile, updateSettings, customBackground, onCustomBackgroundChange, effectiveTheme, initialTab = 'overview' }) {
 const [tab, setTab] = useState(initialTab);
 const [editing, setEditing] = useState(false);
 const [draft, setDraft] = useState(progress.profile);
 useEffect(() => setDraft(progress.profile), [progress.profile]);
 const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;
 const completedCount = LESSONS.filter((bai) => progress.baiProgress[bai]?.completed).length;
 const joinedDays = Math.max(1, Math.round((new Date(`${localDate()}T12:00:00`) - new Date(`${progress.profile.joinedAt}T12:00:00`)) / 86400000));
 const lastSeven = Array.from({ length: 7 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() - (6 - offset)); const key = localDate(date); return { key, label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date), value: progress.studyDays[key]?.xp ?? progress.dailyXp[key] ?? 0 }; });
 const maxXp = Math.max(...lastSeven.map((item) => item.value), 10);
 const recentStudy = Object.entries(progress.studyDays || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 5);
 const dueSrs = getDueEntries(progress.srs).length;
 const skills = [
  { label: 'Từ vựng', value: Math.min(100, Math.round((Object.keys(progress.srs || {}).length / Math.max(1, ALL_GLOSSARY_ENTRIES.filter((entry) => entry.type === 'word').length)) * 100)), tone: 'bg-accent' },
  { label: 'Ngữ pháp', value: accuracy, tone: 'bg-[var(--accent-purple)]' },
  { label: 'Chính tả', value: progress.advancedStats?.dictationAverage || 0, tone: 'bg-accent-2' },
  { label: 'Phát âm', value: progress.advancedStats?.pronunciationBest || 0, tone: 'bg-warm' },
 ];
 const achievementProgress = (id) => ({ first_lesson: completedCount ? 100 : 0, streak_3: Math.min(100, progress.streak / 3 * 100), streak_7: Math.min(100, progress.streak / 7 * 100), combo_10: Math.min(100, progress.correctStreak / 10 * 100), clean_book: progress.accuracy.total && !progress.wrongAnswers.length ? 100 : 0, all_lessons: LESSONS.length ? completedCount / LESSONS.length * 100 : 0, accuracy_90: progress.accuracy.total >= 50 ? Math.min(100, accuracy / 90 * 100) : Math.min(99, progress.accuracy.total * 2), boss_first: progress.bossWins ? 100 : 0 }[id] || 0);
 const saveProfile = () => { onUpdateProfile({ name: draft.name.trim() || 'Nguyễn Văn A', headline: draft.headline.trim() || 'Học viên Hán ngữ', bio: draft.bio.trim() }); setEditing(false); };
 const tabs = [['overview', 'Tổng quan'], ['achievements', 'Thành tích'], ['activity', 'Hoạt động'], ['settings', 'Cài đặt']];
 return <div className="space-y-5">
  <section className="overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xs">
   <div className="relative h-[200px] overflow-hidden"><ProfileCoverArt/></div>
   <div className="relative px-6 pb-6">
    <div className="-mt-[60px] flex items-end justify-between gap-4"><div className="h-[120px] w-[120px] overflow-hidden rounded-full border-4 border-bg-secondary bg-bg-secondary shadow-md transition duration-200 hover:rotate-[3deg]"><PenguinProfileAvatar className="h-full w-full"/></div><button onClick={() => { setTab('overview'); setEditing(true); }} className="btn-secondary mb-2 flex items-center gap-2"><Icon.Pen/>Chỉnh sửa</button></div>
    <h1 className="mt-3 font-serif text-[28px] font-bold">{progress.profile.name}</h1><p className="text-[15px] text-text-secondary">{progress.profile.headline}</p><p className="mt-1 text-sm text-text-muted">Đang học {progress.unlockedBai.length}/{LESSONS.length} bài · Tham gia {joinedDays} ngày trước</p>
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-text-secondary">{[[`${progress.xp} XP`, 'XP'], [`${progress.streak} ngày`, 'streak'], [`${accuracy}%`, 'accuracy'], [`${progress.accuracy.total} câu`, 'questions']].map(([value, key], index) => <span key={key} className="flex items-center gap-3">{index > 0 && <span className="text-border-strong">·</span>}{value}</span>)}</div>
   </div>
  </section>

  <nav className="flex overflow-x-auto border-b border-border" aria-label="Các phần hồ sơ">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${tab === id ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}>{label}{tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent"/>}</button>)}</nav>
  {tab === 'settings' && <ApiKeySection />}

  {tab === 'overview' && <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
   <div className="space-y-4">
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><div className="flex items-center justify-between"><h2 className="font-serif text-lg font-semibold">Giới thiệu</h2>{!editing && <button onClick={() => setEditing(true)} className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-bg-tertiary" aria-label="Sửa giới thiệu"><Icon.Pen/></button>}</div>{editing ? <div className="mt-4 space-y-3"><input className="input w-full" value={draft.name} onChange={(event) => setDraft((item) => ({ ...item, name: event.target.value }))} aria-label="Tên hiển thị"/><input className="input w-full" value={draft.headline} onChange={(event) => setDraft((item) => ({ ...item, headline: event.target.value }))} aria-label="Mô tả hồ sơ"/><textarea className="input w-full" rows={4} value={draft.bio} onChange={(event) => setDraft((item) => ({ ...item, bio: event.target.value }))} aria-label="Giới thiệu bản thân"/><div className="flex justify-end gap-2"><button onClick={() => { setDraft(progress.profile); setEditing(false); }} className="btn-secondary">Hủy</button><button onClick={saveProfile} className="btn-primary">Lưu hồ sơ</button></div></div> : <p className="mt-3 text-sm leading-6 text-text-secondary">{progress.profile.bio}</p>}</section>
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Kỹ năng</h2><div className="mt-5 space-y-4">{skills.map((skill) => <div key={skill.label}><div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{skill.label}</span><span className="text-text-muted">{Math.round(skill.value)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-bg-tertiary"><div className={`h-full origin-left rounded-full transition-transform duration-300 ${skill.tone}`} style={{ transform: `scaleX(${Math.min(100, Math.max(0, skill.value)) / 100})` }}/></div></div>)}</div></section>
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Bài học gần đây</h2><div className="mt-3 divide-y divide-border">{progress.unlockedBai.slice().reverse().slice(0, 5).map((bai) => { const lesson=progress.baiProgress[bai]; const meta=GLOSSARY[bai]?.metadata; return <div key={bai} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-subtle font-serif font-semibold text-accent">{String(bai).padStart(2,'0')}</span><span className="min-w-0"><span className="block truncate font-hanzi font-medium">{meta?.title_zh || `Bài ${bai}`}</span><span className="block text-xs text-text-muted">{lesson.quizDone}/{QUIZZES[bai]?.questions.length || 30} câu</span></span><span className="text-xs font-semibold text-text-muted">{lesson.completed ? 'Đã xong' : 'Đang học'}</span></div>; })}</div></section>
   </div>
   <div className="space-y-4">
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Bạn đã xem</h2><div className="mt-4 space-y-3">{[[Icon.Bookmark, 'Từ đã lưu', progress.bookmarks.length], [Icon.Pen, 'Ghi chú', Object.keys(progress.notes || {}).length], [Icon.Refresh, 'SRS đến hạn', dueSrs]].map(([ItemIcon,label,value]) => <div key={label} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-bg-tertiary text-accent"><ItemIcon/></span><span className="flex-1 text-sm text-text-secondary">{label}</span><strong className="font-serif text-lg">{value}</strong></div>)}</div></section>
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Badges</h2><div className="mt-4 grid grid-cols-4 gap-2">{ACHIEVEMENTS.slice(0,4).map((badge) => { const BadgeIcon=PROFILE_BADGE_ICONS[badge.id] || Icon.Star; const unlocked=progress.achievements.includes(badge.id); return <span key={badge.id} title={badge.title} className={`grid aspect-square place-items-center rounded-lg border ${unlocked ? 'border-warning bg-warning-subtle text-warning' : 'border-border bg-bg-tertiary text-text-muted opacity-45'}`}><BadgeIcon/></span>; })}</div><button onClick={() => setTab('achievements')} className="btn-ghost mt-3 w-full text-accent">Xem thành tích</button></section>
    <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Lịch sử học</h2><div className="mt-3 space-y-3">{recentStudy.length ? recentStudy.map(([date,data]) => <div key={date} className="flex items-center gap-3 text-sm"><span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-subtle text-accent"><Icon.Calendar/></span><span className="flex-1 text-text-secondary">{new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(new Date(`${date}T12:00:00`))}</span><strong>{data.questions || 0} câu</strong></div>) : <p className="text-sm text-text-muted">Chưa có phiên học được ghi nhận.</p>}</div></section>
   </div>
  </div>}

  {tab === 'achievements' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ACHIEVEMENTS.map((badge) => { const unlocked=progress.achievements.includes(badge.id); const percent=Math.round(achievementProgress(badge.id)); const BadgeIcon=PROFILE_BADGE_ICONS[badge.id] || Icon.Star; return <article key={badge.id} className={`rounded-xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${unlocked ? 'border-warning bg-warning-subtle' : 'border-border bg-bg-secondary'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${unlocked ? 'bg-warning text-white' : 'bg-bg-tertiary text-text-muted'}`}><BadgeIcon/></span><h2 className="mt-4 text-[15px] font-semibold">{badge.title}</h2><p className="mt-1 min-h-10 text-sm text-text-muted">{badge.description}</p><ProgressBar value={percent} className="mt-4"/><div className="mt-2 flex justify-between text-xs font-semibold"><span className={unlocked ? 'text-success' : 'text-text-muted'}>{unlocked ? 'Đã đạt' : 'Chưa đạt'}</span><span className="text-text-muted">{percent}%</span></div></article>; })}</div>}

  {tab === 'activity' && <div className="space-y-4"><section className="rounded-xl border border-border bg-bg-secondary p-5"><div className="flex items-center gap-2"><Icon.Chart className="text-accent"/><h2 className="font-serif text-lg font-semibold">XP trong 7 ngày</h2></div><div className="mt-5 flex h-44 items-end gap-3">{lastSeven.map((item) => { const ratio = Math.max(0.04, item.value / maxXp); return <div key={item.key} className="flex h-full flex-1 flex-col text-center"><span className="mb-2 text-xs font-semibold text-text-muted">{item.value}</span><div className="flex min-h-1 flex-1 items-end overflow-hidden rounded-t-lg"><div className="h-full w-full origin-bottom bg-accent transition-transform duration-300" style={{ transform: `scaleY(${ratio})` }}/></div><span className="mt-2 text-[11px] font-medium text-text-muted">{item.label}</span></div>; })}</div></section><div className="grid gap-4 md:grid-cols-2"><section className="rounded-xl border border-border bg-bg-secondary p-5"><StreakCalendar studyDays={progress.studyDays} streak={progress.streak}/></section><section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Tiến độ theo bài</h2><div className="mt-4 space-y-3">{LESSONS.slice(0,5).map((bai)=>{const data=progress.baiProgress[bai]; const value=data.quizDone?data.quizCorrect/data.quizDone*100:0; return <div key={bai} className="grid grid-cols-[42px_1fr_48px] items-center gap-2 text-xs"><strong>Bài {bai}</strong><ProgressBar value={value}/><span className="text-right text-text-muted">{data.quizCorrect}/{data.quizDone}</span></div>;})}</div></section></div></div>}

  {tab === 'settings' && <div className="space-y-4"><section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Mục tiêu mỗi ngày</h2><p className="mt-1 text-sm text-text-muted">Điều chỉnh số câu muốn hoàn thành trong ngày.</p><div className="mt-4 grid grid-cols-4 gap-2">{[10,20,30,50].map((goal)=><button key={goal} onClick={()=>onChangeGoal(goal)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${progress.dailyGoal===goal?'border-accent bg-accent-subtle text-accent':'border-border hover:bg-bg-tertiary'}`}>{goal}</button>)}</div></section><section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Giao diện sáng / tối</h2><p className="mb-4 mt-1 text-sm text-text-muted">Chế độ tự động dùng giao diện sáng từ 06:00 đến 18:00.</p><div className="grid grid-cols-3 gap-2">{[['light','Sáng'],['dark','Tối'],['auto','Tự động']].map(([id,label])=><button key={id} onClick={()=>onThemeChange(id)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${progress.themeMode===id?'border-accent bg-accent-subtle text-accent':'border-border'}`}>{label}</button>)}</div></section><section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Theme màu sắc</h2><div className="mt-4 grid grid-cols-3 gap-2">{Object.entries(THEMES).map(([id,theme])=><button key={id} onClick={()=>onColorThemeChange(id)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${progress.colorTheme===id?'border-accent bg-accent-subtle text-accent':'border-border'}`}>{theme.name}</button>)}</div></section><BackgroundSettings settings={progress.settings} updateSettings={updateSettings} customBackground={customBackground} onCustomBackgroundChange={onCustomBackgroundChange} effectiveTheme={effectiveTheme}/><SoundToggle/><section className="rounded-xl border border-border bg-bg-secondary p-5"><div className="flex items-center gap-2"><Icon.Clock className="text-accent"/><h2 className="font-serif text-lg font-semibold">Pomodoro hôm nay</h2></div><p className="mt-3 font-serif text-2xl font-semibold text-error">{progress.pomodoroSessions} phiên</p><p className="mt-1 text-sm text-text-muted">Mỗi phiên tập trung kéo dài 25 phút.</p></section><ImportExportPanel progress={progress} onImport={onImport}/></div>}
 </div>;
}

function MatchingGame({ onComplete }) {
 const [bai, setBai] = useState(1);
 const [pairs, setPairs] = useState([]);
 const [selectedZh, setSelectedZh] = useState(null);
 const [selectedVi, setSelectedVi] = useState(null);
 const [matched, setMatched] = useState([]);
 const [misses, setMisses] = useState(0);
 const [startTime, setStartTime] = useState(0);
 const [time, setTime] = useState(0);
 const [isPlaying, setIsPlaying] = useState(false);
 const [zhCards, setZhCards] = useState([]);
 const [viCards, setViCards] = useState([]);

 useEffect(() => {
 if (isPlaying && matched.length < pairs.length) {
 const interval = setInterval(() => setTime(Date.now() - startTime), 100);
 return () => clearInterval(interval);
 }
 }, [isPlaying, matched.length, pairs.length, startTime]);

 const start = () => {
 const entries = GLOSSARY[bai].entries.filter(e => e.type === 'word' || e.type === 'phrase');
 const selectedPairs = shuffleArray(entries).slice(0, 8).map(e => ({
 id: e.id,
 zh: e.word_zh || e.phrase_zh,
 vi: e.meaning_vi,
 }));
 setPairs(selectedPairs);
 setZhCards(shuffleArray([...selectedPairs]));
 setViCards(shuffleArray([...selectedPairs]));
 setMatched([]);
 setMisses(0);
 setSelectedZh(null);
 setSelectedVi(null);
 setStartTime(Date.now());
 setTime(0);
 setIsPlaying(true);
 };

 useEffect(() => {
 if (selectedZh && selectedVi) {
 if (selectedZh.id === selectedVi.id) {
 sounds.correct();
 setMatched(prev => [...prev, selectedZh.id]);
 setSelectedZh(null);
 setSelectedVi(null);
 } else {
 sounds.wrong();
 setMisses(prev => prev + 1);
 setTimeout(() => {
 setSelectedZh(null);
 setSelectedVi(null);
 }, 500);
 }
 }
 }, [selectedZh, selectedVi]);

 if (!isPlaying) {
 return (
 <div className="mx-auto max-w-2xl text-center">
 <div className="flex items-center justify-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-subtle text-accent"><Icon.Gamepad className="h-5 w-5"/></span><h1 className="h1-text font-bold">Ghép từ</h1></div>
 <p className="mt-2 text-text-muted">Nối chữ Hán và nghĩa tiếng Việt tương ứng.</p>
 <section className="mt-6 rounded-lg border border-border bg-bg-secondary p-6 shadow-sm dark:border-border-strong dark:bg-bg-secondary">
 <label className="text-sm font-bold">Chọn bài để chơi
 <select value={bai} onChange={(e) => setBai(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-border-strong bg-bg-secondary px-3 py-3 dark:border-border-strong">
 {LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}
 </select>
 </label>
 <button onClick={start} className="mt-5 w-full rounded-lg bg-success px-5 py-3 font-bold text-white hover:bg-success-subtle">Bắt đầu chơi</button>
 </section>
 </div>
 );
 }

 if (matched.length === pairs.length && pairs.length > 0) {
 const seconds = (time / 1000).toFixed(1);
 const score = Math.max(0, 1000 - (seconds * 10) - (misses * 50));
 return (
 <div className="mx-auto max-w-xl text-center animate-fade-slide">
 <Confetti />
 <div className="mx-auto grid h-20 w-20 place-items-center rounded-lg bg-success-subtle text-success dark:bg-success-subtle"><Icon.Trophy className="h-9 w-9"/></div>
 <h1 className="mt-5 h1-text font-bold">Hoàn thành xuất sắc!</h1>
 <div className="mt-6 grid grid-cols-3 gap-2">
 <StatBox label="Thời gian" value={`${seconds}s`} tone="sky" />
 <StatBox label="Lỗi sai" value={misses} tone="rose" />
 <StatBox label="Điểm" value={Math.round(score)} tone="amber" />
 </div>
 <button onClick={() => setIsPlaying(false)} className="btn-primary mt-6 w-full">Chơi lại</button>
 </div>
 );
 }

 return (
 <div className="mx-auto max-w-4xl animate-fade-slide">
 <div className="mb-6 flex items-center justify-between">
 <h2 className="h2-text font-bold">Bài {bai}</h2>
 <div className="flex gap-4">
 <span className="inline-flex items-center gap-2 font-mono text-xl font-bold"><Icon.Clock className="h-5 w-5"/>{(time / 1000).toFixed(1)}s</span>
 <span className="inline-flex items-center gap-2 text-xl font-bold text-error"><Icon.X className="h-5 w-5"/>{misses}</span>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3 sm:gap-8">
 <div className="grid gap-3">
 {zhCards.map((card) => {
 const isMatched = matched.includes(card.id);
 const isSelected = selectedZh?.id === card.id;
 const isWrong = isSelected && selectedVi && selectedZh.id !== selectedVi.id;
 if (isMatched) return <div key={card.id} className="h-16 opacity-0" />;
 return (
 <button
 key={card.id}
 onClick={() => setSelectedZh(card)}
 className={`h-16 rounded-lg border-2 text-xl font-bold transition ${isSelected ? (isWrong ? 'border-error bg-error-subtle animate-shake text-error' : 'border-accent-2 bg-accent-2-subtle text-accent-2') : 'border-border bg-bg-secondary hover:border-border-strong '}`}
 >{card.zh}</button>
 );
 })}
 </div>
 <div className="grid gap-3">
 {viCards.map((card) => {
 const isMatched = matched.includes(card.id);
 const isSelected = selectedVi?.id === card.id;
 const isWrong = isSelected && selectedZh && selectedZh.id !== selectedVi.id;
 if (isMatched) return <div key={card.id} className="h-16 opacity-0" />;
 return (
 <button
 key={card.id}
 onClick={() => setSelectedVi(card)}
 className={`h-16 rounded-lg border-2 text-sm font-bold transition ${isSelected ? (isWrong ? 'border-error bg-error-subtle animate-shake text-error' : 'border-success bg-success-subtle text-success') : 'border-border bg-bg-secondary hover:border-border-strong '}`}
 >{card.vi}</button>
 );
 })}
 </div>
 </div>
 </div>
 );
}

function DictationScreen({ onComplete }) {
 const [bai, setBai] = useState(1);
 const [count, setCount] = useState(10);
 const [deck, setDeck] = useState([]);
 const [index, setIndex] = useState(0);
 const [answer, setAnswer] = useState('');
 const [result, setResult] = useState(null);
 const [replays, setReplays] = useState(0);
 const [scores, setScores] = useState([]);
 const textareaRef = useRef(null);
 const start = () => { setDeck(shuffleArray(getDictationSentences(bai)).slice(0, count)); setIndex(0); setAnswer(''); setResult(null); setReplays(0); setScores([]); };
 const current = deck[index];
 const play = () => { if (current && replays < 3) { speak(current.zh); setReplays((value) => value + 1); } };
 const check = () => { const score = calculateSimilarity(answer, current.zh); setResult({ score, isCorrect: score >= 80 }); setScores((items) => [...items, score]); };
 const next = () => {
 if (index >= deck.length - 1) { onComplete?.(scores); setIndex(deck.length); return; }
 setIndex((value) => value + 1); setAnswer(''); setResult(null); setReplays(0);
 };
 if (!deck.length) return (
 <div className="mx-auto max-w-2xl"><p className="text-xs font-bold uppercase tracking-widest text-error">Advanced Learning</p><div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-error-subtle text-error"><Icon.Headphones className="h-5 w-5"/></span><h1 className="h1-text font-bold">Luyện chính tả</h1></div><p className="mt-2 text-text-muted">Nghe câu tiếng Trung rồi gõ lại chính xác.</p><section className="mt-6 rounded-lg border border-border bg-bg-secondary p-5 shadow-sm sm:p-6 dark:border-border-strong dark:bg-bg-secondary"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Bài<select value={bai} onChange={(event) => setBai(Number(event.target.value))} className="input mt-2 w-full">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select></label><label className="text-sm font-bold">Số câu<select value={count} onChange={(event) => setCount(Number(event.target.value))} className="input mt-2 w-full">{[5, 10, 20].map((number) => <option key={number} value={number}>{number} câu</option>)}</select></label></div><p className="mt-4 text-sm text-text-muted">Bài {bai} có {getDictationSentences(bai).length} câu phù hợp.</p><button onClick={start} className="btn-primary mt-5 w-full">Bắt đầu nghe</button></section></div>
 );
 if (index >= deck.length) {
 const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
 return <div className="mx-auto max-w-xl rounded-xl border border-success bg-bg-secondary p-8 text-center shadow-sm"><div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-success-subtle text-success"><Icon.Headphones className="h-7 w-7"/></div><h1 className="mt-4 h1-text font-bold">Hoàn thành chính tả</h1><p className="mt-2 text-text-muted">Điểm trung bình {average}/100 · {scores.filter((score) => score >= 80).length}/{scores.length} câu đạt</p><button onClick={() => setDeck([])} className="btn-primary mt-6 w-full">Luyện lượt mới</button></div>;
 }
 return (
 <div className="mx-auto max-w-2xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-error">Chính tả · Bài {bai}</p><h1 className="mt-1 h2-text font-bold">Câu {index + 1}/{deck.length}</h1></div><span className="rounded-lg bg-warning-subtle px-3 py-2 text-sm font-bold text-warning dark:bg-warning-subtle dark:text-warning">Lượt nghe {replays}/3</span></div><ProgressBar value={((index + 1) / deck.length) * 100} label="Tiến độ luyện chính tả"/><section className="mt-5 rounded-lg border border-border bg-bg-secondary p-5 shadow-lg sm:p-7 dark:border-border-strong dark:bg-bg-secondary"><div className="text-center"><button onClick={play} disabled={replays >= 3} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-error text-white shadow-lg transition hover:scale-105 disabled:opacity-40" aria-label="Phát câu chính tả"><Icon.Volume className="h-8 w-8"/></button><p className="mt-3 text-sm text-text-muted">Có thể nghe tối đa 3 lần</p></div><textarea ref={textareaRef} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={Boolean(result)} rows={3} placeholder="Gõ câu chữ Hán bạn nghe được..." className="input mt-6 w-full text-lg" />{!result && <VirtualKeyboard textareaRef={textareaRef} value={answer} onChange={setAnswer} />}{!result ? <button onClick={check} disabled={!answer.trim()} className="btn-primary mt-4 w-full disabled:opacity-40">Kiểm tra</button> : <div className={`mt-5 rounded-lg border p-4 ${result.isCorrect ? 'border-success bg-success-subtle dark:border-success dark:bg-success-subtle/30' : 'border-error bg-error-subtle dark:border-error'}`}><p className="text-xl font-bold">{result.isCorrect ? '✓ Nghe tốt' : 'Cần nghe lại'} · {result.score}/100</p><p className="mt-3 text-lg font-bold">{current.zh}</p><p className="mt-1 text-sm text-success">{current.pinyin}</p><p className="mt-1 text-sm text-text-muted">{current.vi}</p><button onClick={next} className="btn-primary mt-4 w-full">{index === deck.length - 1 ? 'Xem kết quả' : 'Câu tiếp →'}</button></div>}</section></div>
 );
}

function PronunciationScreen({ onAttempt }) {
 const [bai, setBai] = useState(1);
 const [index, setIndex] = useState(0);
 const [listening, setListening] = useState(false);
 const [feedback, setFeedback] = useState(null);
 const recognitionRef = useRef(null);
 const entries = GLOSSARY[bai].entries.filter((entry) => entry.type === 'word' && entry.word_zh);
 const entry = entries[index % entries.length];
 const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
 useEffect(() => () => recognitionRef.current?.abort(), []);
 const record = () => {
 if (!supported || listening) return;
 const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 const recognition = new Recognition();
 recognition.lang = 'zh-CN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
 recognition.onstart = () => { setListening(true); setFeedback(null); };
 recognition.onresult = (event) => { const transcript = event.results[0][0].transcript; const score = calculateSimilarity(entry.word_zh, transcript); setFeedback({ transcript, score }); onAttempt?.(score); };
 recognition.onerror = (event) => setFeedback({ transcript: '', score: 0, error: event.error === 'not-allowed' ? 'Micro đang bị chặn. Hãy cấp quyền rồi thử lại.' : 'Không nhận được giọng nói. Hãy thử lại ở nơi yên tĩnh.' });
 recognition.onend = () => setListening(false);
 recognitionRef.current = recognition; recognition.start();
 };
 const next = () => { setIndex((value) => (value + 1) % entries.length); setFeedback(null); };
 return (
 <div className="mx-auto max-w-2xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-error">Advanced Learning</p><div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-error-subtle text-error"><Icon.Mic className="h-5 w-5"/></span><h1 className="h1-text font-bold">Luyện phát âm</h1></div></div><select value={bai} onChange={(event) => { setBai(Number(event.target.value)); setIndex(0); setFeedback(null); }} className="input">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select></div>{!supported && <div role="alert" className="mt-5 rounded-lg border border-warning bg-warning-subtle p-4 font-semibold text-warning dark:border-warning dark:bg-warning-subtle/30 dark:text-warning">Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy mở app bằng Chrome hoặc Edge.</div>}<section className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 text-center shadow-lg sm:p-8"><p className="font-hanzi text-6xl font-bold">{entry.word_zh}</p><p className="mt-3 text-xl font-bold text-error">{entry.pinyin}</p><p className="mt-2 text-text-muted">{entry.meaning_vi}</p><div className="mt-7 flex items-center justify-center gap-3"><SpeakButton text={entry.word_zh} className="h-12 w-12 text-xl" /><button onClick={record} disabled={!supported || listening} className={`grid h-20 w-20 place-items-center rounded-full text-white shadow-lg transition ${listening ? 'animate-pulse bg-error ring-8 ring-error-subtle' : 'bg-error hover:scale-105'} disabled:opacity-40`} aria-label="Bắt đầu ghi âm"><Icon.Mic className="h-8 w-8"/></button></div><p className="mt-3 text-sm font-bold text-text-muted">{listening ? 'Đang nghe... hãy nói rõ từ trên' : 'Bấm micro rồi đọc từ trên'}</p>{feedback && <div className={`mt-6 rounded-lg p-4 text-left ${feedback.score >= 80 ? 'bg-success-subtle' : feedback.score >= 50 ? 'bg-warning-subtle' : 'bg-error-subtle'}`}><div className="flex items-center justify-between gap-3"><p className="min-w-0 font-bold">Bạn nói: {feedback.transcript || 'Không nhận diện được'}</p><span className="shrink-0 text-xl font-bold">{feedback.score}/100</span></div>{feedback.error && <p className="mt-2 text-sm text-error dark:text-error">{feedback.error}</p>}<div className="mt-4 flex gap-2"><button onClick={record} className="btn-secondary flex-1">Thử lại</button><button onClick={next} className="btn-primary flex-1">Tiếp →</button></div></div>}</section></div>
 );
}

function SentenceChineseLine({ sentence, entries, onCharacter }) {
 const terms = entries.filter((entry) => entry.type === 'word' && entry.word_zh && sentence.includes(entry.word_zh)).sort((a, b) => b.word_zh.length - a.word_zh.length);
 const nodes = [];
 let cursor = 0;
 while (cursor < sentence.length) {
 const match = terms.find((entry) => sentence.startsWith(entry.word_zh, cursor));
 if (match) {
 nodes.push(
 <span key={`${cursor}-${match.id}`} className="rounded bg-error-subtle px-0.5 font-bold text-error underline decoration-rose-200 decoration-2 underline-offset-4">
 <ClickableHanzi text={match.word_zh} entry={match} onCharacter={onCharacter} />
 </span>
 );
 cursor += match.word_zh.length;
 } else {
 nodes.push(<span key={cursor}>{sentence[cursor]}</span>);
 cursor += 1;
 }
 }
 return nodes;
}

function SentenceMiningScreen({ bookmarks, notes, onCharacter, onStartPlaylist }) {
 const [bai, setBai] = useState(1);
 const [showPinyin, setShowPinyin] = useState(true);
 const [showVi, setShowVi] = useState(true);
 const [filter, setFilter] = useState('all');
 const entries = GLOSSARY[bai].entries;
 const sentences = getSentencesByBai(bai).filter((sentence) => filter === 'all' || (filter === 'bookmarks' ? bookmarks.includes(sentence.source) : Boolean(notes[sentence.source])));
 const playlist = sentences.map((sentence) => ({ text: sentence.zh, label: sentence.zh, sublabel: sentence.vi }));
 return (
 <div><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-error">Advanced Learning</p><div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-error-subtle text-error"><Icon.Type className="h-5 w-5"/></span><h1 className="h1-text font-bold">Câu ví dụ</h1></div><p className="mt-2 text-text-muted">Đọc theo ngữ cảnh và nghe liên tục theo bài.</p></div><button onClick={() => onStartPlaylist(playlist)} disabled={!playlist.length} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Icon.Volume className="h-4 w-4"/>Đọc toàn bộ</button></div><div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-4"><select value={bai} onChange={(event) => setBai(Number(event.target.value))} className="input py-2 font-bold">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select><button onClick={() => setShowPinyin((value) => !value)} className={`filter-btn ${showPinyin ? 'active' : ''}`}>Pinyin</button><button onClick={() => setShowVi((value) => !value)} className={`filter-btn ${showVi ? 'active' : ''}`}>Tiếng Việt</button>{[['all', 'Tất cả'], ['bookmarks', 'Đã đánh dấu'], ['notes', 'Có ghi chú']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`filter-btn ${filter === id ? 'active' : ''}`}>{label}</button>)}</div><div className="mt-5 space-y-3">{sentences.map((sentence, index) => <article key={`${sentence.source}-${index}`} className="rounded-lg border border-border bg-bg-secondary p-5 shadow-sm"><div className="flex items-start gap-3"><p className="font-hanzi flex-1 text-xl font-semibold leading-9"><SentenceChineseLine sentence={sentence.zh} entries={entries} onCharacter={onCharacter} /></p><SpeakButton text={sentence.zh} /></div>{showPinyin && sentence.pinyin && <p className="pinyin-text mt-2 text-sm text-success">{sentence.pinyin}</p>}{showVi && sentence.vi && <p className="mt-1 text-sm text-accent-2">{sentence.vi}</p>}</article>)}</div>{!sentences.length && <EmptyState icon="文" title="Không có câu phù hợp" text="Đổi bộ lọc hoặc chọn bài khác để tiếp tục." />}</div>
 );
}

function CharacterDetailModal({ detail, onClose }) {
 const trapRef = useDialogA11y(Boolean(detail), onClose);
 if (!detail) return null;
 const { char, entry } = detail;
 const info = getCharacterInfo(char);
 const compounds = ALL_GLOSSARY_ENTRIES.filter((item) => item.type === 'word' && item.word_zh?.includes(char)).slice(0, 12);
 const exact = entry || compounds[0];
 const examples = [...new Set(compounds.map((item) => item.example_zh).filter(Boolean))].slice(0, 4);
 return (
 <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
 <section ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="character-detail-title" className="animate-modal-in max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-bg-secondary p-4 shadow-xl sm:p-6">
 <header className="flex items-start justify-between gap-4 border-b border-border pb-5">
 <div className="flex min-w-0 items-center gap-3 sm:gap-5"><span id="character-detail-title" className="font-hanzi text-6xl font-bold leading-none sm:text-7xl">{char}</span><div className="min-w-0"><p className="text-xl font-bold text-error">{exact?.pinyin || 'Chưa có pinyin riêng'}</p><p className="mt-2 font-bold">{entryMeaning(exact || {}) || 'Xem các từ ghép bên dưới'}</p></div><SpeakButton text={char} className="h-10 w-10" /></div>
 <button onClick={onClose} className="icon-action grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng chi tiết chữ Hán" data-tooltip="Đóng"><Icon.X /></button>
 </header>
 <div className="mt-5 grid gap-4 lg:grid-cols-2">
 <div className="rounded-lg bg-warning-subtle p-4 dark:bg-warning-subtle/30"><p className="text-xs font-bold uppercase tracking-wider text-warning dark:text-warning">Bộ thủ và số nét</p><p className="mt-2 text-lg font-bold">{info.radical ? `${info.radical} · ${RADICALS[info.radical] || 'bộ thủ'}` : 'Chưa có trong bảng bộ thủ'}</p><p className="mt-1 text-sm text-text-muted">{info.strokes ? `${info.strokes} nét` : 'Số nét chưa được ghi nhận'}</p></div>
 <div className="rounded-lg bg-accent-2-subtle p-4 dark:bg-accent-2-subtle/30"><p className="text-xs font-bold uppercase tracking-wider text-accent-2 dark:text-accent-2">Nghĩa trong bài</p><p className="mt-2 font-bold">{exact?.meaning_vi || exact?.grammar_title_vi || 'Chưa có nghĩa riêng cho một chữ'}</p>{exact?.meaning_en && <p className="mt-1 text-sm text-text-muted">{exact.meaning_en}</p>}</div>
 </div>
 <div className="mt-5"><h3 className="font-bold">Từ ghép chứa “{char}”</h3>{compounds.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{compounds.map((item) => <div key={item.id} className="rounded-lg border border-border p-3 dark:border-border-strong"><div className="flex items-center justify-between"><span className="text-xl font-bold">{item.word_zh}</span><SpeakButton text={item.word_zh} /></div><p className="text-xs font-bold text-error">{item.pinyin}</p><p className="mt-1 text-xs text-text-muted">{item.meaning_vi}</p></div>)}</div> : <p className="mt-2 text-sm text-text-muted">Chưa có từ ghép khác trong 10 bài.</p>}</div>
 {examples.length > 0 && <div className="mt-5"><h3 className="font-bold">Câu ví dụ</h3><div className="mt-3 space-y-2">{examples.map((example) => <div key={example} className="flex items-center gap-3 rounded-lg bg-bg-tertiary p-3 bg-bg-primary"><p className="flex-1 font-semibold">{example}</p><SpeakButton text={example} /></div>)}</div></div>}
 </section>
 </div>
 );
}

function PlaylistFloatingPlayer({ playlist, onClose }) {
 const [index, setIndex] = useState(0);
 const [playing, setPlaying] = useState(true);
 const [rate, setRate] = useState(0.85);
 const [loop, setLoop] = useState(false);
 const [minimized, setMinimized] = useState(false);
 const timerRef = useRef(null);
 const entries = playlist?.entries || [];
 useEffect(() => { setIndex(0); setPlaying(Boolean(entries.length)); }, [playlist?.id]);
 useEffect(() => {
 if (!playing || !entries.length) return undefined;
 let cancelled = false;
 const current = entries[index];
 const advance = () => {
 if (cancelled) return;
 timerRef.current = setTimeout(() => {
 if (index < entries.length - 1) setIndex((value) => value + 1);
 else if (loop) setIndex(0);
 else setPlaying(false);
 }, 1600);
 };
 speak(current.text, 'zh-CN', rate, () => {
 if (cancelled) return;
 timerRef.current = setTimeout(() => speak(current.text, 'zh-CN', rate, advance), 800);
 });
 return () => { cancelled = true; clearTimeout(timerRef.current); window.speechSynthesis?.cancel(); };
 }, [entries, index, loop, playing, rate]);
 if (!entries.length) return null;
 const move = (direction) => { setIndex((value) => Math.min(entries.length - 1, Math.max(0, value + direction))); setPlaying(true); };
 return (
 <aside aria-label="Trình phát playlist" className={`animate-toast-in fixed bottom-20 left-3 right-3 z-[65] rounded-xl border border-border bg-bg-secondary shadow-lg sm:bottom-5 sm:left-auto sm:right-5 ${minimized ? 'sm:w-56' : 'sm:w-80'}`}>
 <div className="flex items-center gap-2 border-b border-border p-3"><Icon.Volume className="h-4 w-4 shrink-0 text-accent" aria-hidden="true"/><p className="min-w-0 flex-1 truncate text-sm font-bold">Playlist · {index + 1}/{entries.length}</p><button onClick={() => setMinimized((value) => !value)} className="icon-action grid h-9 w-9 place-items-center rounded-lg bg-bg-tertiary text-xs hover:bg-border" data-tooltip={minimized ? 'Mở rộng' : 'Thu nhỏ'} aria-label={minimized ? 'Mở rộng playlist' : 'Thu nhỏ playlist'}>{minimized ? <Icon.Plus /> : <Icon.Minus />}</button><button onClick={onClose} className="icon-action grid h-9 w-9 place-items-center rounded-lg bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng playlist" data-tooltip="Đóng"><Icon.X /></button></div>
 {!minimized && <div className="p-4"><p className="truncate h2-text font-bold">{entries[index]?.label || entries[index]?.text}</p><p className="mt-1 truncate text-sm text-text-muted">{entries[index]?.sublabel}</p><ProgressBar value={((index + 1) / entries.length) * 100} className="mt-4" /><div className="mt-4 flex items-center justify-center gap-2"><button onClick={() => move(-1)} disabled={index === 0} className="grid h-9 w-9 place-items-center rounded-lg bg-bg-tertiary font-bold disabled:opacity-30 hover:bg-border" title="Trước" aria-label="Bài trước">‹</button><button onClick={() => setPlaying((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-white hover:bg-accent/90" aria-label={playing ? 'Tạm dừng' : 'Tiếp tục phát'}>{playing ? 'Ⅱ' : '▶'}</button><button onClick={() => move(1)} disabled={index === entries.length - 1 && !loop} className="grid h-9 w-9 place-items-center rounded-lg bg-bg-tertiary font-bold disabled:opacity-30 hover:bg-border" title="Tiếp" aria-label="Bài tiếp theo">›</button></div><div className="mt-4 flex items-center justify-between gap-2"><select value={rate} onChange={(event) => setRate(Number(event.target.value))} className="rounded-lg border border-border bg-bg-tertiary px-2 py-1.5 text-xs font-bold" aria-label="Tốc độ phát"><option value="0.7">0.7x</option><option value="0.85">0.85x</option><option value="1">1.0x</option></select><label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Lặp</label></div></div>}
 </aside>
 );
}

function StatBox({ label, value, tone }) {
 const tones = { mint: 'bg-success-subtle text-success', rose: 'bg-error-subtle text-error', amber: 'bg-warning-subtle text-warning', sky: 'bg-accent-2-subtle text-accent-2' };
 return <div className={`rounded-lg p-4 text-center ${tones[tone]}`}><p className="h2-text font-bold">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider opacity-70">{label}</p></div>;
}

function EmptyState({ title, text, mascot = 'panda', icon, action, secondaryAction }) {
 return <div className="animate-fade-slide px-4 py-16 text-center">
   <div className="mx-auto grid h-20 w-20 place-items-center rounded-xl bg-accent-subtle text-4xl">
     {icon ? <span aria-hidden="true">{icon}</span> : <Mascot type={mascot} size="md" />}
   </div>
   <h2 className="mt-5 font-serif text-xl font-semibold text-text-primary">{title}</h2>
   <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary leading-relaxed">{text}</p>
   {(action || secondaryAction) && <div className="mt-6 flex justify-center gap-3">{action}{secondaryAction}</div>}
 </div>;
}

function GlossaryModal({ entry, onClose, onOpenEntry, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter, onEditWord }) {
 const trapRef = useDialogA11y(Boolean(entry), onClose);
 if (!entry) return null;
 const openRelated = (id) => { const target = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (target) onOpenEntry(target); };
 return (
 <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
 <div className="animate-modal-in max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-xl bg-bg-primary p-4 shadow-lg sm:rounded-xl sm:p-6" ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Chi tiết mục từ">
 <div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-text-muted">Bài {entry.bai} · {entry.type}</p><button onClick={onClose} className="icon-action grid h-10 w-10 place-items-center rounded-lg bg-bg-secondary text-text-muted shadow-sm" aria-label="Đóng" data-tooltip="Đóng"><Icon.X /></button></div>
 {entry.type === 'word' && <WordCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} onEdit={onEditWord} />}
 {entry.type === 'grammar' && <GrammarCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />}
 {entry.type === 'phrase' && <PhraseCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />}
 </div>
 </div>
 );
}

function AchievementToast({ badge, onClose }) {
 const isAchievement = !!(badge?.id && PROFILE_BADGE_ICONS[badge.id]);
 useEffect(() => {
  if (!badge) return undefined;
  if (isAchievement) sounds.achievement();
  const timer = setTimeout(onClose, isAchievement ? 5000 : 3500);
  return () => clearTimeout(timer);
 }, [badge, onClose, isAchievement]);
 if (!badge) return null;
 const BadgeIcon = isAchievement ? (PROFILE_BADGE_ICONS[badge.id] || Icon.Star) : null;
 const iconStr = String(badge.icon || '');
 const isError = iconStr === '!';
 const StatusIcon = iconStr === 'srs' ? Icon.Refresh : iconStr === 'goal' ? Icon.Target : iconStr === '✓' ? Icon.Check : null;
 const iconBg = isAchievement ? 'bg-warning-subtle text-warning' : isError ? 'bg-error-subtle text-error' : 'bg-accent-subtle text-accent';
 return (
  <div className="pointer-events-none fixed right-4 top-20 z-[110] sm:right-6" role="status" aria-live="polite">
  <div className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-bg-secondary p-4 shadow-md">
  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg ${iconBg}`} aria-hidden="true">
   {isAchievement ? <BadgeIcon className="h-5 w-5" /> : StatusIcon ? <StatusIcon className="h-5 w-5"/> : iconStr}
  </span>
  <div className="min-w-0 flex-1">
   {isAchievement && <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Thành tựu mới</p>}
   <p className={`font-bold leading-snug ${isAchievement ? 'text-accent' : 'text-text-primary'}`}>{badge.title}</p>
   {badge.description && <p className="mt-0.5 text-sm text-text-secondary">{badge.description}</p>}
  </div>
  <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng thông báo"><Icon.X className="h-3.5 w-3.5" /></button>
  </div>
  </div>
 );
}

function Confetti() {
 const particles = Array.from({ length: 80 }, (_, i) => ({
 id: i,
 left: Math.random() * 100,
 delay: Math.random() * 0.5,
 duration: 2 + Math.random() * 2,
 color: ['#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'][i % 5],
 }));
 return (
 <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
 <style>{`
 @keyframes confetti-fall {
 to { transform: translateY(100vh) rotate(720deg); }
 }
 .confetti-particle {
 position: absolute; top: -20px; width: 10px; height: 10px;
 animation: confetti-fall linear infinite;
 }
 `}</style>
 {particles.map(p => (
 <div key={p.id} className="confetti-particle" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, backgroundColor: p.color }} />
 ))}
 </div>
 );
}

function BackgroundLayer({ settings, customBackground, effectiveTheme }) {
 if (!settings || !settings.enableBackground || settings.background === 'none') return null;
 const image = settings.background === 'custom' ? customBackground : `/backgrounds/${settings.background}.jpg`;
 if (!image) return null;
 const overlay = Math.min(0.96, (Math.max(88, Number(settings.overlayOpacity) || 88) + (effectiveTheme === 'dark' ? 4 : 0)) / 100);
 
 return (
 <>
 <div 
 className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
 style={{ 
 backgroundImage: `url(${image})`,
 filter: `blur(${settings.backgroundBlur}px)`,
 transform: settings.backgroundBlur > 0 ? 'scale(1.05)' : 'scale(1)',
 }}
 />
 <div 
 className="pointer-events-none fixed inset-0 z-[1] bg-bg-primary transition-opacity duration-300"
 style={{ opacity: overlay }}
 />
 </>
 );
}

function evaluateAchievements(progress) {
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

export default function App() {
 const [screen, setScreen] = useState('home');
 const [currentBai, setCurrentBai] = useState(1);
 const [progress, setProgress] = useState(() => {
 const saved = readStorage('dudu-progress-v1', null);
 const merged = mergeProgress(saved);
 if (!saved?.themeMode) merged.themeMode = readStorage('dudu-theme-mode', readStorage('dudu-dark', false) ? 'dark' : 'auto');
 return rolloverDailyProgress(merged);
 });
 const [effectiveTheme, setEffectiveTheme] = useState(() => progress.themeMode === 'auto' ? getAutoTheme() : progress.themeMode);
 const [glossaryEntry, setGlossaryEntry] = useState(null);
 const [toast, setToast] = useState(null);
 const [quizSession, setQuizSession] = useState(null);
 const [searchOpen, setSearchOpen] = useState(false);
 const [characterDetail, setCharacterDetail] = useState(null);
 const [playlist, setPlaylist] = useState(null);
 const [shortcutsOpen, setShortcutsOpen] = useState(false);
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const [customBackground, setCustomBackground] = useState(() => readRawStorage('customBg', null));
 const [wordOverrides, setWordOverrides] = useState({});
 const [wordEditorReady, setWordEditorReady] = useState(false);
 const [wordEditorError, setWordEditorError] = useState('');
 const [editingWord, setEditingWord] = useState(null);
 const [editingContent, setEditingContent] = useState(null);
 const [dashboardTab, setDashboardTab] = useState('overview');
 const [activeCourseId, setActiveCourseId] = useState(BUILT_IN_COURSE_ID);
 const [activeCourse, setActiveCourse] = useState(null);
 const [courseReady, setCourseReady] = useState(false);
 const [targetCourseId, setTargetCourseId] = useState(null);
 const [libraryRefresh, setLibraryRefresh] = useState(0);
 const [processingJobs, setProcessingJobs] = useState(() => getActiveProcessingJobs());
 const [headerHidden, setHeaderHidden] = useState(false);
 const progressRef = useRef(progress);
 const goKeyRef = useRef(0);
 progressRef.current = progress;

 useEffect(() => {
  let active = true;
  (async () => {
    await migrateBuiltInCourse();
    resumeInterruptedJobs().catch(() => {});
    const settings = await getSettings();
    const course = await getCourse(settings.activeCourseId) || await getCourse(BUILT_IN_COURSE_ID);
    if (!active || !course) return;
    const count = activateCourseData(course);
    applyBuiltInEdits(course);
    LESSONS.splice(0, LESSONS.length, ...Array.from({ length: count }, (_, index) => index + 1));
    PINYIN_INDEX = buildPinyinIndex();
    const saved = course.id === BUILT_IN_COURSE_ID ? readStorage('dudu-progress-v1', null) : await getProgress(course.id);
    if (!active) return;
    setProgress(progressForCourse(saved, course));
    setActiveCourseId(course.id);
    setActiveCourse(course);
    setWordOverrides(Object.fromEntries(course.chapters.flatMap((chapter) => chapter.glossary?.entries || []).filter((entry) => entry.type === 'word').map((entry) => [entry.id, entry])));
    setWordEditorReady(true);
    setCourseReady(true);
  })().catch((error) => { if (active) { setWordEditorError(`Không thể mở dữ liệu: ${error.message}`); setCourseReady(true); } });
  return () => { active = false; };
 }, []);

 useEffect(() => subscribeProcessingJobs((id, snapshot) => {
   setProcessingJobs(getActiveProcessingJobs());
   if (['completed', 'error', 'cancelled'].includes(snapshot.state)) setLibraryRefresh((value) => value + 1);
 }), []);

 useEffect(() => {
   let previous = window.scrollY;
   const onScroll = () => {
     const current = window.scrollY;
     if (Math.abs(current - previous) >= 8) setHeaderHidden(current > 120 && current > previous);
     previous = current;
   };
   window.addEventListener('scroll', onScroll, { passive: true });
   return () => window.removeEventListener('scroll', onScroll);
 }, []);

 useEffect(() => {
 const applyTheme = () => {
 const nextTheme = progress.themeMode === 'auto' ? getAutoTheme() : progress.themeMode;
 setEffectiveTheme(nextTheme);
 document.documentElement.classList.toggle('dark', nextTheme === 'dark');
 };
 applyTheme();
 writeStorage('dudu-theme-mode', progress.themeMode);
 if (progress.themeMode !== 'auto') return undefined;
 const interval = setInterval(applyTheme, 30 * 60 * 1000);
 return () => clearInterval(interval);
 }, [progress.themeMode]);

 useEffect(() => {
 applyTheme(progress.colorTheme || 'pastel', effectiveTheme === 'dark');
 }, [progress.colorTheme, effectiveTheme]);

 useEffect(() => {
   if (!courseReady) return undefined;
   if (activeCourseId === BUILT_IN_COURSE_ID) writeStorage('dudu-progress-v1', progress);
   const timer = setTimeout(() => saveProgress(activeCourseId, progress).catch((error) => setWordEditorError(`Không lưu được tiến độ: ${error.message}`)), 400);
   return () => clearTimeout(timer);
 }, [progress, activeCourseId, courseReady]);

 const selectCourse = async (courseId) => {
   try {
     if (courseReady && await getCourse(activeCourseId)) await saveProgress(activeCourseId, progressRef.current);
     const course = await getCourse(courseId);
     if (!course) throw new Error('Không tìm thấy khóa học.');
     const saved = course.id === BUILT_IN_COURSE_ID ? readStorage('dudu-progress-v1', null) : await getProgress(course.id);
     const count = activateCourseData(course);
     applyBuiltInEdits(course);
     LESSONS.splice(0, LESSONS.length, ...Array.from({ length: count }, (_, index) => index + 1));
     PINYIN_INDEX = buildPinyinIndex();
     setProgress(progressForCourse(saved, course));
     setActiveCourseId(course.id); setActiveCourse(course);
     setCurrentBai(1); setQuizSession(null); setGlossaryEntry(null); setEditingWord(null);
     setWordOverrides(Object.fromEntries(course.chapters.flatMap((chapter) => chapter.glossary?.entries || []).filter((entry) => entry.type === 'word').map((entry) => [entry.id, entry])));
     setScreen(course.chapters.length ? 'home' : 'library');
     setLibraryRefresh((value) => value + 1);
     const settings = await getSettings();
     await saveSettings({ activeCourseId: course.id, recentCourseIds: [course.id, ...(settings.recentCourseIds || []).filter((id) => id !== course.id)].slice(0, 5) });
     return course;
   } catch (error) { setToast({ icon: '!', title: 'Không mở được khóa học', description: error.message }); }
 };

 useEffect(() => {
 const handleKeyDown = (e) => {
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); return; }
 const tag = e.target.tagName;
 if (tag === 'INPUT' || tag === 'TEXTAREA') {
 if (e.key === 'Escape') {
 e.target.blur();
 setSearchOpen(false);
 }
 return;
 }
 
 if (shortcutsOpen) {
 if (e.key === 'Escape') setShortcutsOpen(false);
 return;
 }

 if (e.ctrlKey || e.metaKey) {
 switch (e.key.toLowerCase()) {
 case 'h': e.preventDefault(); navigate('home'); break;
 case 'l': e.preventDefault(); setScreen('learn'); break;
 case 'q': e.preventDefault(); startLessonQuiz(currentBai); break;
 case 'r': e.preventDefault(); setScreen('review'); break;
 case 'b': if (glossaryEntry) { e.preventDefault(); toggleBookmark(glossaryEntry.id); } break;
 case 'e': if (glossaryEntry?.type === 'word') { e.preventDefault(); setEditingWord(glossaryEntry); } else if (glossaryEntry?.type === 'grammar') { e.preventDefault(); setEditingContent(glossaryEntry); } break;
 case '/': e.preventDefault(); setShortcutsOpen(true); break;
 }
 if (e.shiftKey && e.key.toLowerCase() === 'd') {
 e.preventDefault();
 setProgress((prev) => ({ ...prev, themeMode: prev.themeMode === 'dark' ? 'light' : 'dark' }));
 }
 if (e.shiftKey && e.key.toLowerCase() === 't') {
 e.preventDefault();
 const themeKeys = Object.keys(THEMES);
 const current = progress.colorTheme || 'pastel';
 const next = themeKeys[(themeKeys.indexOf(current) + 1) % themeKeys.length];
 setProgress((prev) => ({ ...prev, colorTheme: next }));
 }
 } else {
 if (e.key.toLowerCase() === 'g') { goKeyRef.current = Date.now(); return; }
 if (Date.now() - goKeyRef.current < 1000) {
   const target = { h: 'home', l: 'library', q: 'quiz', r: 'review' }[e.key.toLowerCase()];
   if (target) { e.preventDefault(); goKeyRef.current = 0; navigate(target); return; }
 }
 if (e.key === '?') {
 e.preventDefault();
 setShortcutsOpen(true);
 }
 if (e.key === 'Escape') {
 setSearchOpen(false);
 setCharacterDetail(null);
 setGlossaryEntry(null);
 setPlaylist(null);
 }
 if (e.key === ' ' && playlist) {
 e.preventDefault();
 // We can't easily toggle play/pause from here without ref, but we will leave it as per hint or implement it later.
 }
 }
 };
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [screen, shortcutsOpen, currentBai, playlist, glossaryEntry]);

 const navigate = (target) => {
 setSidebarOpen(false);
 setHeaderHidden(false);
 if (target === 'quiz') {
 startLessonQuiz(currentBai);
 return;
 }
 if (target === 'dashboard') setDashboardTab('overview');
 setScreen(target);
 window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 const openCharacter = (char, entry) => setCharacterDetail({ char, entry });
 const startPlaylist = (entries) => {
 if (!entries?.length) return;
 setPlaylist({ id: Date.now(), entries });
 };

 const startLessonQuiz = (bai) => {
 if (!QUIZZES[bai]?.questions?.length) { setToast({ icon: '!', title: 'Bài này chưa có quiz', description: 'Hãy duyệt lại nội dung khóa học.' }); return; }
 setCurrentBai(bai);
 setQuizSession({ id: `lesson-${bai}-${Date.now()}`, kind: 'lesson', bai, questions: QUIZZES[bai].questions });
 setScreen('quiz');
 window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 const startWrongReview = (ids) => {
 const questions = ids.map((id) => ALL_QUESTIONS.find((item) => item.id === id)).filter(Boolean);
 if (!questions.length) return;
 setQuizSession({ id: `wrong-${Date.now()}`, kind: 'wrong', bai: null, questions: shuffleArray(questions) });
 setScreen('quiz');
 };

 const updateStudyDate = (next) => {
 const today = localDate();
 if (next.todayDate !== today) {
 next.todayDate = today;
 next.todayCount = 0;
 }
 if (next.pomodoroDate !== today) {
 next.pomodoroDate = today;
 next.pomodoroSessions = 0;
 }
 if (next.lastStudyDate !== today) {
 next.streak = next.lastStudyDate === previousDate(today) ? next.streak + 1 : 1;
 next.lastStudyDate = today;
 next.studyDates = [...new Set([...next.studyDates, today])];
 }
 return today;
 };

 const recordAnswer = (question, userAnswer, result, mode) => {
 setProgress((previous) => {
 const next = mergeProgress(JSON.parse(JSON.stringify(previous)));
 const today = updateStudyDate(next);
 const wasWrong = next.wrongAnswers.some((item) => item.questionId === question.id);
 const isTyping = TYPING_TYPES.has(question.type);
 let earned = 0;
 if (isTyping) earned = result.score >= 80 ? XP_REWARDS.typingHigh : result.score >= 60 ? XP_REWARDS.typingMid : 0;
 else if (result.isCorrect) earned = XP_REWARDS.mcq;
 if (wasWrong && result.isCorrect) earned += XP_REWARDS.correction;
 next.accuracy.total += 1;
 if (result.isCorrect) next.accuracy.correct += 1;
 next.correctStreak = result.isCorrect ? next.correctStreak + 1 : 0;

 if (result.isCorrect) {
 next.wrongAnswers = next.wrongAnswers.filter((item) => item.questionId !== question.id);
 } else {
 next.wrongCounts[question.id] = (next.wrongCounts[question.id] || 0) + 1;
 const record = { questionId: question.id, userAnswer, score: result.score, updatedAt: new Date().toISOString() };
 next.wrongAnswers = [...next.wrongAnswers.filter((item) => item.questionId !== question.id), record];
 next.wrongAnswersDetailed = [...next.wrongAnswersDetailed, {
 questionId: question.id,
 bai: question.bai,
 type: question.type,
 related_glossary: question.related_glossary || [],
 score: result.score,
 createdAt: new Date().toISOString(),
 }].slice(-1000);
 for (const entryId of question.related_glossary || []) {
 const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === entryId);
 if (entry?.type === 'word') next.srs[entryId] = createSrsEntry();
 }
 }

 if (mode === 'lesson') {
 const lesson = next.baiProgress[question.bai];
 lesson.attemptedIds = [...new Set([...lesson.attemptedIds, question.id])];
 lesson.correctIds = result.isCorrect
 ? [...new Set([...lesson.correctIds, question.id])]
 : lesson.correctIds.filter((id) => id !== question.id);
 lesson.quizDone = lesson.attemptedIds.length;
 lesson.quizCorrect = lesson.correctIds.length;
 if (!lesson.completed && lesson.quizDone >= QUIZZES[question.bai].questions.length) {
 lesson.completed = true;
 earned += XP_REWARDS.lesson;
 if (question.bai < LESSONS.length) next.unlockedBai = [...new Set([...next.unlockedBai, question.bai + 1])].sort((a, b) => a - b);
 }
 }

 next.todayCount += 1;
 next.xp += earned;
 next.dailyXp[today] = (next.dailyXp[today] || 0) + earned;
 const weekKey = getWeekKey(today);
 next.weeklyXP[weekKey] = (next.weeklyXP[weekKey] || 0) + earned;
 const day = next.studyDays[today] || { xp: 0, questions: 0 };
 next.studyDays[today] = { xp: day.xp + earned, questions: day.questions + 1 };
 if (next.todayCount >= next.dailyGoal && !next.goalRewardDates.includes(today)) {
 next.goalRewardDates = [...next.goalRewardDates, today];
 next.xp += XP_REWARDS.dailyGoal;
 next.dailyXp[today] += XP_REWARDS.dailyGoal;
 next.weeklyXP[weekKey] += XP_REWARDS.dailyGoal;
 next.studyDays[today].xp += XP_REWARDS.dailyGoal;
 setToast({ icon: 'goal', title: 'Đã đạt mục tiêu hôm nay', description: `Thưởng ${XP_REWARDS.dailyGoal} XP` });
 }

 const newBadges = evaluateAchievements(next);
 if (newBadges.length) {
 next.achievements = [...next.achievements, ...newBadges.map((badge) => badge.id)];
 setToast(newBadges[0]);
 }
 return next;
 });
 };

 const recordBossWin = () => {
 setProgress((previous) => {
 const next = mergeProgress(JSON.parse(JSON.stringify(previous)));
 const today = updateStudyDate(next);
 next.bossWins += 1;
 next.xp += XP_REWARDS.boss;
 next.dailyXp[today] = (next.dailyXp[today] || 0) + XP_REWARDS.boss;
 const weekKey = getWeekKey(today);
 next.weeklyXP[weekKey] = (next.weeklyXP[weekKey] || 0) + XP_REWARDS.boss;
 const day = next.studyDays[today] || { xp: 0, questions: 0 };
 next.studyDays[today] = { ...day, xp: day.xp + XP_REWARDS.boss };
 const badges = evaluateAchievements(next);
 if (badges.length) { next.achievements = [...next.achievements, ...badges.map((badge) => badge.id)]; setToast(badges[0]); }
 return next;
 });
 };

 const changeDailyGoal = (goal) => setProgress((previous) => ({ ...previous, dailyGoal: goal }));
 const changeTheme = (themeMode) => setProgress((previous) => ({ ...previous, themeMode }));
 const changeColorTheme = (colorTheme) => setProgress((previous) => ({ ...previous, colorTheme }));
 const toggleBookmark = (entryId) => setProgress((previous) => ({
 ...previous,
 bookmarks: previous.bookmarks.includes(entryId)
 ? previous.bookmarks.filter((id) => id !== entryId)
 : [...previous.bookmarks, entryId],
 }));
 const saveNote = (entryId, note) => setProgress((previous) => {
 const notes = { ...(previous.notes || {}) };
 if (note) notes[entryId] = note;
 else delete notes[entryId];
 return { ...previous, notes };
 });
 const saveEditedWord = async (values) => {
  if (!editingWord) return;
  const { note, ...changes } = values;
  const updated = await updateWordInCourse(activeCourseId, editingWord.id, changes);
  const source = GLOSSARY[updated.bai]?.entries;
  if (source) { const index = source.findIndex((entry) => entry.id === updated.id); if (index >= 0) source[index] = updated; }
  const allIndex = ALL_GLOSSARY_ENTRIES.findIndex((entry) => entry.id === updated.id);
  if (allIndex >= 0) ALL_GLOSSARY_ENTRIES[allIndex] = updated;
  setWordOverrides((previous) => ({ ...previous, [updated.id]: updated }));
  setGlossaryEntry((previous) => previous?.id === updated.id ? updated : previous);
  saveNote(updated.id, note.trim());
 };

 const runPaletteCommand = (id) => {
   if (id === 'theme') { changeTheme(progress.themeMode === 'dark' ? 'light' : 'dark'); return; }
   if (id === 'settings') { setDashboardTab('settings'); setScreen('dashboard'); return; }
   if (id === 'new-course') {
     navigate('library');
     window.setTimeout(() => document.querySelector('input[aria-label="Tên khóa học"]')?.focus(), 250);
     return;
   }
   navigate(id);
 };
 const saveEditedContent = async (values) => {
   if (!editingContent) return;
   if (editingContent.type === 'grammar') {
     const updated = await updateGrammarInCourse(activeCourseId, editingContent.id, values);
     const entries = GLOSSARY[updated.bai]?.entries;
     const index = entries?.findIndex((entry) => entry.id === updated.id) ?? -1;
     if (index >= 0) entries[index] = updated;
     const allIndex = ALL_GLOSSARY_ENTRIES.findIndex((entry) => entry.id === updated.id);
     if (allIndex >= 0) ALL_GLOSSARY_ENTRIES[allIndex] = updated;
     setGlossaryEntry((previous) => previous?.id === updated.id ? updated : previous);
   } else {
     const updated = await updateQuestionInCourse(activeCourseId, editingContent.id, values);
     const questions = QUIZZES[updated.bai]?.questions;
     const index = questions?.findIndex((question) => question.id === updated.id) ?? -1;
     if (index >= 0) questions[index] = updated;
     const allIndex = ALL_QUESTIONS.findIndex((question) => question.id === updated.id);
     if (allIndex >= 0) ALL_QUESTIONS[allIndex] = updated;
     setQuizSession((previous) => previous ? { ...previous, questions: previous.questions.map((question) => question.id === updated.id ? updated : question) } : previous);
   }
   setToast({ icon: '✓', title: 'Đã lưu nội dung', description: 'Thay đổi đã lưu vào khóa học.' });
 };
 const updateProfile = (updates) => setProgress((previous) => ({ ...previous, profile: { ...previous.profile, ...updates } }));
 const addLessonToSrs = (bai) => {
 setProgress((previous) => {
 const words = GLOSSARY[bai].entries.filter((entry) => entry.type === 'word');
 const currentSrs = previous.srs || {};
 const missing = words.filter((entry) => !currentSrs[entry.id]);
 if (!missing.length) return previous;
 const srs = { ...currentSrs };
 for (const entry of missing) srs[entry.id] = createSrsEntry();
 setToast({ icon: 'srs', title: `Đã thêm ${missing.length} từ vào SRS`, description: `Bài ${bai} đã sẵn sàng để ôn theo lịch.` });
 return { ...previous, srs };
 });
 };
 const rateSrs = (entryId, rating) => setProgress((previous) => ({
 ...previous,
 srs: { ...(previous.srs || {}), [entryId]: calculateNextReview(previous.srs?.[entryId], rating) },
 }));
 const importProgress = (imported) => {
 setProgress(rolloverDailyProgress(mergeProgress(imported)));
 setToast({ icon: '✓', title: 'Đã nhập tiến độ', description: 'Dữ liệu học tập đã được khôi phục.' });
 };
 const completePomodoro = () => {
 setProgress((previous) => {
 const next = rolloverDailyProgress(mergeProgress(JSON.parse(JSON.stringify(previous))));
 const today = updateStudyDate(next);
 next.pomodoroSessions += 1;
 next.studyDays[today] = next.studyDays[today] || { xp: 0, questions: 0 };
 return next;
 });
 };
 const updateSettings = (updates) => setProgress((previous) => ({ ...previous, settings: { ...previous.settings, ...updates } }));
 const updateCustomBackground = (value) => {
  try {
   if (value) localStorage.setItem('customBg', value);
   else localStorage.removeItem('customBg');
   setCustomBackground(value || null);
   return { ok: true };
  } catch (error) {
   const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
   return { ok: false, message: quota ? 'Bộ nhớ trình duyệt đã đầy. Hãy dùng ảnh nhỏ hơn hoặc xóa ảnh cũ.' : 'Không thể lưu ảnh trong trình duyệt này.' };
  }
 };
 
 const completeDictation = (scores) => setProgress((previous) => {
 const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
 const sessions = previous.advancedStats.dictationSessions + 1;
 const lifetimeAverage = Math.round(((previous.advancedStats.dictationAverage * (sessions - 1)) + average) / sessions);
 return { ...previous, advancedStats: { ...previous.advancedStats, dictationSessions: sessions, dictationAverage: lifetimeAverage } };
 });
 const recordPronunciation = (score) => setProgress((previous) => ({
 ...previous,
 advancedStats: {
 ...previous.advancedStats,
 pronunciationAttempts: previous.advancedStats.pronunciationAttempts + 1,
 pronunciationBest: Math.max(previous.advancedStats.pronunciationBest, score),
 },
 }));
 const selectSearchResult = async (result) => {
 if (result.courseId && result.courseId !== activeCourseId) {
   const selected = await selectCourse(result.courseId);
   if (!selected) return;
 }
 setCurrentBai(result.bai);
 setScreen('learn');
 setSearchOpen(false);
 if (result.entry) setGlossaryEntry(result.entry);
 window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 let content;
 if (!courseReady) content = <div className="space-y-4 py-5" aria-label="Đang tải khóa học"><div className="h-40 animate-pulse rounded-md bg-bg-tertiary" /><div className="h-20 animate-pulse rounded-md bg-bg-tertiary" /><div className="h-20 animate-pulse rounded-md bg-bg-tertiary" /></div>;
 else if (screen === 'library') content = <LibraryScreen activeCourseId={activeCourseId} refreshKey={libraryRefresh} onSelect={selectCourse} onImport={(id) => { setTargetCourseId(id); setScreen('import-document'); }} onProcess={(id) => { setTargetCourseId(id); setScreen('process-document'); }} onReview={(id) => { setTargetCourseId(id); setScreen('review-generated'); }} />;
 else if (screen === 'import-document') content = <ImportScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onSaved={(id) => { setTargetCourseId(id); setLibraryRefresh((value) => value + 1); setScreen('process-document'); }} />;
 else if (screen === 'process-document') content = <ProcessingScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onDone={(id) => { setTargetCourseId(id); setLibraryRefresh((value) => value + 1); setScreen('review-generated'); }} onSettings={() => { setDashboardTab('settings'); setScreen('dashboard'); }} />;
 else if (screen === 'review-generated') content = <ReviewGeneratedScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onRetry={() => setScreen('process-document')} onCommitted={(id) => { setLibraryRefresh((value) => value + 1); selectCourse(id); }} />;
 else if (!LESSONS.length && screen !== 'dashboard') content = <div className="rounded-md border border-border bg-bg-secondary p-8 text-center"><h1 className="font-serif text-xl font-semibold">{activeCourse?.name || 'Khóa học'} chưa có bài học</h1><p className="mt-2 text-sm text-text-secondary">Nhập tài liệu để bắt đầu tạo nội dung.</p><button onClick={() => { setTargetCourseId(activeCourseId); setScreen('import-document'); }} className="btn-primary mt-5">Nhập tài liệu</button></div>;
 else if (screen === 'home') content = <HomeScreen progress={progress} onOpenLesson={(bai) => { setCurrentBai(bai); setScreen('learn'); }} onNavigate={navigate} onChangeGoal={changeDailyGoal} />;
 else if (screen === 'learn') content = <LearnScreen bai={currentBai} unlockedBai={progress.unlockedBai} bookmarks={progress.bookmarks} notes={progress.notes} onToggleBookmark={toggleBookmark} onSaveNote={saveNote} onLessonRead={addLessonToSrs} onStartQuiz={startLessonQuiz} onOpenEntry={setGlossaryEntry} onCharacter={openCharacter} onStartPlaylist={startPlaylist} onChangeBai={setCurrentBai} wordOverrides={wordOverrides} onEditWord={wordEditorReady ? setEditingWord : null} onEditGrammar={wordEditorReady ? setEditingContent : null} editorError={wordEditorError} />;
 else if (screen === 'quiz') content = quizSession ? <QuizScreen key={quizSession.id} session={quizSession} progress={progress} onAnswer={recordAnswer} onFinish={() => {}} onExit={() => setScreen('home')} onOpenEntry={setGlossaryEntry} onEditQuestion={wordEditorReady ? setEditingContent : null} /> : <EmptyState icon="✓" title="Chọn một bài để luyện" text="Chọn bài học trong Lộ trình để bắt đầu." />;
 else if (screen === 'review') content = <ReviewScreen progress={progress} onPracticeWrong={startWrongReview} onOpenEntry={setGlossaryEntry} onToggleBookmark={toggleBookmark} onSaveNote={saveNote} onRateSrs={rateSrs} />;
 else if (screen === 'exam') content = <ExamScreen onRecord={recordAnswer} onOpenEntry={setGlossaryEntry} />;
 else if (screen === 'boss') content = <BossBattleScreen progress={progress} onRecord={recordAnswer} onWin={recordBossWin} />;
 else if (screen === 'minigame') content = <MatchingGame onComplete={() => {}} />;
 else if (screen === 'dictation') content = <DictationScreen onComplete={completeDictation} />;
 else if (screen === 'pronunciation') content = <PronunciationScreen onAttempt={recordPronunciation} />;
 else if (screen === 'sentences') content = <SentenceMiningScreen bookmarks={progress.bookmarks} notes={progress.notes} onCharacter={openCharacter} onStartPlaylist={startPlaylist} />;
 else content = <Dashboard progress={progress} onImport={importProgress} onThemeChange={changeTheme} onColorThemeChange={changeColorTheme} onChangeGoal={changeDailyGoal} onUpdateProfile={updateProfile} updateSettings={updateSettings} customBackground={customBackground} onCustomBackgroundChange={updateCustomBackground} effectiveTheme={effectiveTheme} initialTab={dashboardTab} />;

 const hasBackground = progress.settings?.enableBackground && progress.settings?.background !== 'none' && (progress.settings.background !== 'custom' || Boolean(customBackground));
 const rootBgClass = hasBackground ? 'bg-transparent text-text-primary' : 'bg-bg-primary text-text-primary';
 const shownGlossaryEntry = glossaryEntry ? wordOverrides[glossaryEntry.id] || glossaryEntry : null;

 return (
 <div className={`relative isolate min-h-screen transition-colors duration-300 ${rootBgClass}`} onPointerDownCapture={(event) => { const button = event.target.closest?.('.btn-primary'); if (!button) return; const box = button.getBoundingClientRect(); button.style.setProperty('--press-x', `${event.clientX - box.left}px`); button.style.setProperty('--press-y', `${event.clientY - box.top}px`); }}>
 <a href="#main-content" className="skip-link">Bỏ qua menu, đến nội dung chính</a>
 <BackgroundLayer settings={progress.settings} customBackground={customBackground} effectiveTheme={effectiveTheme} />
 {screen !== 'quiz' && <Sidebar screen={screen} progress={progress} onNavigate={navigate} mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
 <Header progress={progress} themeMode={progress.themeMode} onThemeChange={changeTheme} onSearch={() => setSearchOpen(true)} onNavigate={navigate} onMenu={() => setSidebarOpen(true)} hidden={headerHidden} focused={screen === 'quiz'} />
 {screen !== 'quiz' && <RightPanel progress={progress} onNavigate={navigate} />}
 <div className={`relative z-10 ${screen === 'quiz' ? '' : 'lg:pl-[240px] 2xl:pr-[320px]'}`}>
 {processingJobs.length > 0 && <div className="mx-auto max-w-[864px] px-4 pt-3 lg:px-8"><div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/30 bg-accent-subtle px-3 py-2 text-sm"><span className="font-semibold">{processingJobs.map((job) => `${job.courseName}: ${job.state === 'paused' ? 'tạm dừng' : 'đang xử lý'} ${job.current}/${job.total}`).join(' · ')}</span><button className="font-semibold text-accent" onClick={() => { setTargetCourseId(processingJobs[0].courseId); setScreen('process-document'); }}>Xem tiến độ</button></div></div>}
 <main id="main-content" tabIndex={-1} key={screen} className={`mx-auto min-w-0 animate-fade-slide px-4 pb-24 pt-6 lg:px-8 lg:pb-10 ${screen === 'quiz' ? 'max-w-[720px]' : 'max-w-[864px]'}`}><Suspense fallback={<div aria-label="Đang tải màn hình" className="space-y-3"><div className="h-24 animate-pulse rounded-md bg-bg-tertiary" /><div className="h-48 animate-pulse rounded-md bg-bg-tertiary" /></div>}>{content}</Suspense></main>
 </div>
 {screen !== 'quiz' && <BottomNav screen={screen} onNavigate={navigate} />}
 <GlossaryModal entry={shownGlossaryEntry} onClose={() => setGlossaryEntry(null)} onOpenEntry={setGlossaryEntry} bookmarks={progress.bookmarks} onToggleBookmark={toggleBookmark} notes={progress.notes} onSaveNote={saveNote} onCharacter={openCharacter} onEditWord={wordEditorReady ? setEditingWord : null} />
 {editingWord && <WordEditorModal entry={wordOverrides[editingWord.id] || editingWord} note={progress.notes[editingWord.id] || ''} onSave={saveEditedWord} onClose={() => setEditingWord(null)} />}
 {editingContent && (editingContent.type !== 'grammar' && !Array.isArray(editingContent.options) ? <TypingEditorModal item={editingContent} onSave={saveEditedContent} onClose={() => setEditingContent(null)} /> : <ContentEditorModal item={editingContent} onSave={saveEditedContent} onClose={() => setEditingContent(null)} />)}
 <CharacterDetailModal detail={characterDetail} onClose={() => setCharacterDetail(null)} />
 <PlaylistFloatingPlayer playlist={playlist} onClose={() => setPlaylist(null)} />
 <AchievementToast badge={toast} onClose={() => setToast(null)} />
 <GlobalCourseSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} onSelect={selectSearchResult} onCommand={runPaletteCommand} activeCourseId={activeCourseId} />
 <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
 <div className="fixed bottom-4 right-4 z-50 hidden lg:block opacity-50 hover:opacity-100 transition">
 <kbd className="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white dark:bg-border dark:text-text-primary shadow">?</kbd>
 </div>
 <PomodoroTimer sessionsToday={progress.pomodoroSessions} onSessionComplete={completePomodoro} />
 </div>
 );
}
