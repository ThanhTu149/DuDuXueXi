import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DAILY_NEW_CARDS,
  LEECH_THRESHOLD,
  calculateNextReview,
  createSrsEntry,
  evaluateLessonMastery,
  getDueEntries,
  gradeDictation,
  gradeTyping,
  unsuspendSrsEntry,
} from '../src/lib/pedagogy.js';

const bai01Quiz = JSON.parse(readFileSync(new URL('../data/quiz_bai01.json', import.meta.url), 'utf8'));
const findQ = (id) => bai01Quiz.questions.find((q) => q.id === id);

test('gradeTyping: translation_zh_to_vi accepts valid paraphrases and rejects wrong/Chinese answers', () => {
  const q = findQ('quiz_bai01_026');
  assert.ok(q);

  assert.equal(gradeTyping(q.sample_answer, q).score, 100);

  const p1 = gradeTyping('Mùa hè năm nay tôi vẫn chơi ở đó hơn một tháng', q);
  assert.ok(p1.score >= 70, `Expected paraphrase 1 >= 70, got ${p1.score}`);

  const p2 = gradeTyping('Hè năm nay tôi còn ở đấy chơi hơn một tháng', q);
  assert.ok(p2.score >= 70, `Expected paraphrase 2 >= 70, got ${p2.score}`);

  const wrongVi = gradeTyping('Hôm nay trời mưa to lắm', q);
  assert.ok(wrongVi.score < 40, `Expected unrelated VI < 40, got ${wrongVi.score}`);

  const zhCopy = gradeTyping('今年暑假我还在那儿玩了一个多月呢。', q);
  assert.equal(zhCopy.score, 0);
});

test('gradeTyping: translation_vi_to_zh catches word-order violations and accepts minor omissions', () => {
  const q = findQ('quiz_bai01_022');
  assert.ok(q);

  assert.equal(gradeTyping(q.sample_answer, q).score, 100);

  const badOrder = gradeTyping('上海变得比过去漂亮。', q);
  assert.ok(badOrder.score < 70, `Expected bad order < 70, got ${badOrder.score}`);
  assert.equal(badOrder.orderIssue, true);

  const minorOmit = gradeTyping('上海比过去变得漂亮了。', q);
  assert.ok(minorOmit.score >= 70, `Expected valid minor omission >= 70, got ${minorOmit.score}`);
});

test('gradeTyping: sentence_reorder enforces sequential chunk ordering', () => {
  const q = findQ('quiz_bai01_030');
  assert.ok(q);

  assert.equal(gradeTyping(q.sample_answer, q).score, 100);

  const shuffled = gradeTyping('吗比北京上海冬天暖和一点儿', q);
  assert.ok(shuffled.score < 50, `Expected shuffled < 50, got ${shuffled.score}`);
  assert.equal(shuffled.orderIssue, true);
});

test('gradeTyping: typing_zh_from_pinyin requires exact match for short targets', () => {
  const q = findQ('quiz_bai01_028');
  assert.ok(q);

  assert.equal(gradeTyping('暖和', q).score, 100);
  const halfWrong = gradeTyping('暖天', q);
  assert.ok(halfWrong.score < 50, `Expected half-wrong < 50, got ${halfWrong.score}`);
});

test('SM-2 calculateNextReview scales intervals by ease factor and suspends leeches', () => {
  const today = '2026-11-25';
  let card = createSrsEntry(today);

  card = calculateNextReview(card, 'good', { today });
  assert.equal(card.interval, 1);
  card = calculateNextReview(card, 'good', { today });
  assert.equal(card.interval, 6);
  card = calculateNextReview(card, 'good', { today });
  assert.equal(card.interval, 15);
  card = calculateNextReview(card, 'good', { today });
  assert.equal(card.interval, 38);

  // Higher EF yields longer interval than lower EF at repetition 3
  let easyCard = createSrsEntry(today);
  easyCard = calculateNextReview(easyCard, 'easy', { today });
  easyCard = calculateNextReview(easyCard, 'easy', { today });
  easyCard = calculateNextReview(easyCard, 'easy', { today });

  let hardCard = createSrsEntry(today);
  hardCard = calculateNextReview(hardCard, 'good', { today });
  hardCard = calculateNextReview(hardCard, 'hard', { today });
  hardCard = calculateNextReview(hardCard, 'good', { today });
  assert.ok(easyCard.interval > hardCard.interval);

  // Leech suspension after 8 lapses + unsuspend restore
  let leech = createSrsEntry(today);
  for (let i = 0; i < LEECH_THRESHOLD - 1; i += 1) {
    leech = calculateNextReview(leech, 'forgot', { today });
    assert.equal(leech.suspended, false);
  }
  leech = calculateNextReview(leech, 'forgot', { today });
  assert.equal(leech.lapses, LEECH_THRESHOLD);
  assert.equal(leech.suspended, true);

  const restored = unsuspendSrsEntry(leech, today);
  assert.equal(restored.suspended, false);
  assert.equal(restored.lapses, 0);
  assert.equal(restored.nextReview, today);
});

test('getDueEntries enforces daily new-card cap and excludes suspended leeches', () => {
  const today = '2026-11-25';
  const entries = [];
  const srs = {};

  for (let i = 1; i <= 25; i += 1) {
    const id = `new_${i}`;
    entries.push({ id, type: 'word', word_zh: `词${i}` });
    srs[id] = createSrsEntry(today);
  }
  // 2 due review cards + 1 suspended leech
  entries.push({ id: 'rev_1', type: 'grammar', grammar_title_zh: '比' });
  srs.rev_1 = { ...createSrsEntry('2026-11-20'), lastReview: '2026-11-20', firstReviewDate: '2026-11-20', nextReview: today };

  entries.push({ id: 'leech_1', type: 'phrase', phrase_zh: '一点儿' });
  srs.leech_1 = { ...createSrsEntry('2026-11-20'), lapses: LEECH_THRESHOLD, suspended: true, nextReview: today };

  const due = getDueEntries(srs, entries, { today, newCardLimit: DEFAULT_DAILY_NEW_CARDS });
  assert.equal(due.some((d) => d.id === 'leech_1'), false);
  assert.equal(due.some((d) => d.id === 'rev_1'), true);
  assert.equal(due.filter((d) => d.id.startsWith('new_')).length, DEFAULT_DAILY_NEW_CARDS);
});

test('evaluateLessonMastery requires >= 80% accuracy after attempting all questions', () => {
  assert.equal(evaluateLessonMastery({ attemptedIds: Array.from({ length: 30 }, (_, i) => i), correctIds: [] }, 30).passed, false);
  assert.equal(evaluateLessonMastery({ attemptedIds: Array.from({ length: 30 }, (_, i) => i), correctIds: Array.from({ length: 23 }, (_, i) => i) }, 30).passed, false);
  assert.equal(evaluateLessonMastery({ attemptedIds: Array.from({ length: 24 }, (_, i) => i), correctIds: Array.from({ length: 24 }, (_, i) => i) }, 30).passed, false);
  assert.equal(evaluateLessonMastery({ attemptedIds: Array.from({ length: 30 }, (_, i) => i), correctIds: Array.from({ length: 24 }, (_, i) => i) }, 30).passed, true);
});

test('gradeDictation rejects single-char error on <= 10-char sentences and returns char diff', () => {
  const wrong = gradeDictation('我的护照你找到了设有', '我的护照你找到了没有');
  assert.equal(wrong.isCorrect, false);
  const flagged = wrong.diff.find((d) => d.status === 'wrong');
  assert.ok(flagged);
  assert.equal(flagged.char, '设');
  assert.equal(flagged.expected, '没');

  const exact = gradeDictation('我的护照你找到了没有？', '我的护照你找到了没有');
  assert.equal(exact.isCorrect, true);
  assert.equal(exact.score, 100);
});
