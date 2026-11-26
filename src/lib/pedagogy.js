/**
 * Pure pedagogical core for DuDu Hán Ngữ:
 *  - Type-specific typing autograder (ZH->VI, VI->ZH, Pinyin->ZH, sentence_reorder)
 *  - Real SM-2 spaced repetition with leech detection and daily new-card cap
 *  - Lesson mastery gate (>= 80% accuracy required to pass/unlock next lesson)
 *  - Strict character-diff dictation grader
 *
 * Zero DOM/browser dependencies so it runs identically in Vite and `node:test`.
 */

export const MASTERY_THRESHOLD = 0.8;
export const LEECH_THRESHOLD = 8;
export const DEFAULT_DAILY_NEW_CARDS = 15;
export const SRS_ELIGIBLE_TYPES = new Set(['word', 'grammar', 'phrase']);

const CJK_RE = /[\u3400-\u9fff]/;
const CJK_GLOBAL_RE = /[\u3400-\u9fff]/g;
const LATIN_GLOBAL_RE = /[a-zA-ZÀ-ỹ]/g;

const VI_SYNONYM_GROUPS = [
  ['kỳ nghỉ hè', 'nghỉ hè', 'mùa hè', 'hè'],
  ['ở đó', 'ở đấy', 'ở chỗ đó', 'chỗ đó', 'tại đó', 'đó', 'đấy'],
  ['vẫn', 'còn'],
  ['nhưng', 'nhưng mà', 'tuy nhiên', 'nhưng lại'],
  ['rất', 'lắm', 'khá', 'vô cùng', 'cực kỳ'],
  ['không có', 'chẳng có'],
  ['nhà hàng', 'quán ăn', 'tiệm ăn'],
  ['khách sạn', 'nhà nghỉ'],
  ['thông thường', 'bình thường'],
  ['trở nên', 'biến thành', 'thay đổi'],
  ['hơn nữa', 'còn nữa', 'vả lại'],
  ['bởi vì', 'vì', 'do'],
  ['cho nên', 'nên', 'vì vậy'],
];

const CANON_ENTRIES = (() => {
  const list = [];
  VI_SYNONYM_GROUPS.forEach((group, groupIndex) => {
    const token = `__syn_${groupIndex}__`;
    for (const phrase of group) {
      list.push({ phrase: phrase.toLowerCase(), token });
    }
  });
  return list.sort((a, b) => b.phrase.length - a.phrase.length);
})();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function normalizeText(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[，。？！、；：“”‘’（）《》〈〉—–\-]/g, '')
    .replace(/[.,?!;:"'()\[\]{}]/g, '')
    .replace(/\s+/g, '');
}

export function normalizeZh(value = '') {
  return String(value)
    .trim()
    .replace(/[，。？！、；：“”‘’（）《》〈〉—–\-.,?!;:"'()\[\]{}\s]+/g, '');
}

export function normalizeViWords(value = '') {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[.,?!;:"'()\[\]{}，。？！、；：“”‘’（）《》〈〉—–\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ').filter(Boolean) : [];
}

function canonicalizeViPhraseString(value = '') {
  let text = normalizeViWords(value).join(' ');
  if (!text) return '';
  for (const { phrase, token } of CANON_ENTRIES) {
    const re = new RegExp(`(^|\\s)${escapeRegex(phrase)}(?=\\s|$)`, 'g');
    text = text.replace(re, `$1${token}`);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function canonicalizeViTokens(value = '') {
  const canon = canonicalizeViPhraseString(value);
  return canon ? canon.split(' ').filter(Boolean) : [];
}

export function levenshtein(a = '', b = '') {
  const left = String(a);
  const right = String(b);
  const matrix = Array.from({ length: right.length + 1 }, (_, row) =>
    Array.from({ length: left.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );
  for (let row = 1; row <= right.length; row += 1) {
    for (let col = 1; col <= left.length; col += 1) {
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + (right[row - 1] === left[col - 1] ? 0 : 1),
      );
    }
  }
  return matrix[right.length][left.length];
}

export function calculateSimilarity(a = '', b = '') {
  const left = normalizeText(a);
  const right = normalizeText(b);
  const longest = Math.max(left.length, right.length, 1);
  return Math.max(0, Math.round((1 - levenshtein(left, right) / longest) * 100));
}

export function lcsLength(a = '', b = '') {
  const left = [...String(a)];
  const right = [...String(b)];
  if (!left.length || !right.length) return 0;
  let prev = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    const curr = new Array(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) {
      curr[j] = left[i - 1] === right[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[right.length];
}

function lisLength(numbers = []) {
  const tails = [];
  for (const num of numbers) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < num) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = num;
  }
  return tails.length;
}

function buildMissingLabel(keyword) {
  return keyword?.zh || keyword?.vi || keyword?.meaning || '';
}

function gradeTypingZhFromPinyin(userAnswer, question, refs) {
  const userNorm = normalizeZh(userAnswer);
  const required = (question.keywords_required || []).filter((k) => k?.zh);
  const found = required.filter((k) => userNorm.includes(normalizeZh(k.zh)));
  const missingKeywords = required.filter((k) => !userNorm.includes(normalizeZh(k.zh))).map(buildMissingLabel);

  if (refs.some((ref) => userNorm === normalizeZh(ref))) {
    return { score: 100, level: 'perfect', found, missingKeywords: [], orderIssue: false };
  }

  let bestSim = 0;
  let minRefLen = Infinity;
  for (const ref of refs) {
    const refNorm = normalizeZh(ref);
    if (!refNorm) continue;
    minRefLen = Math.min(minRefLen, refNorm.length);
    const longest = Math.max(userNorm.length, refNorm.length, 1);
    const sim = Math.max(0, Math.round((1 - levenshtein(userNorm, refNorm) / longest) * 100));
    if (sim > bestSim) bestSim = sim;
  }

  if (minRefLen <= 4) {
    return {
      score: Math.min(45, Math.round(bestSim * 0.45)),
      level: 'wrong',
      found,
      missingKeywords,
      orderIssue: false,
    };
  }
  if (bestSim >= 90) {
    return { score: bestSim, level: 'close', found, missingKeywords, orderIssue: false };
  }
  return {
    score: Math.min(64, Math.round(bestSim * 0.7)),
    level: 'wrong',
    found,
    missingKeywords,
    orderIssue: false,
  };
}

function gradeSentenceReorder(userAnswer, question, refs) {
  const userNorm = normalizeZh(userAnswer);
  const required = (question.keywords_required || []).filter((k) => k?.zh);
  const found = required.filter((k) => userNorm.includes(normalizeZh(k.zh)));
  const missingKeywords = required.filter((k) => !userNorm.includes(normalizeZh(k.zh))).map(buildMissingLabel);

  if (refs.some((ref) => userNorm === normalizeZh(ref))) {
    return { score: 100, level: 'perfect', found, missingKeywords: [], orderIssue: false };
  }

  if (!CJK_RE.test(userNorm)) {
    return { score: 0, level: 'wrong', found: [], missingKeywords: required.map(buildMissingLabel), orderIssue: false };
  }

  const requiredChunks = required.map((k) => normalizeZh(k.zh)).filter(Boolean);
  let anyOrderPreserved = false;
  let bestCharSim = 0;
  let bestLcsRatio = 0;

  for (const ref of refs) {
    const refNorm = normalizeZh(ref);
    if (!refNorm) continue;
    const longest = Math.max(userNorm.length, refNorm.length, 1);
    const charSim = Math.max(0, Math.round((1 - levenshtein(userNorm, refNorm) / longest) * 100));
    const lcsRatio = lcsLength(userNorm, refNorm) / longest;
    if (charSim > bestCharSim) bestCharSim = charSim;
    if (lcsRatio > bestLcsRatio) bestLcsRatio = lcsRatio;

    if (requiredChunks.length) {
      const refOrdered = requiredChunks
        .map((chunk) => ({ chunk, pos: refNorm.indexOf(chunk) }))
        .filter((item) => item.pos >= 0)
        .sort((a, b) => a.pos - b.pos);

      let searchFrom = 0;
      let preserved = refOrdered.length > 0;
      for (const item of refOrdered) {
        const idx = userNorm.indexOf(item.chunk, searchFrom);
        if (idx < 0) {
          preserved = false;
          break;
        }
        searchFrom = idx + item.chunk.length;
      }
      if (preserved && found.length === requiredChunks.length) {
        anyOrderPreserved = true;
      }
    } else if (lcsRatio >= 0.9 && charSim >= 90) {
      anyOrderPreserved = true;
    }
  }

  if (!anyOrderPreserved) {
    return {
      score: Math.min(45, Math.round(bestLcsRatio * 45)),
      level: 'wrong',
      found,
      missingKeywords,
      orderIssue: true,
    };
  }

  if (bestCharSim >= 90) {
    return { score: bestCharSim, level: 'close', found, missingKeywords, orderIssue: false };
  }
  return { score: Math.min(65, bestCharSim), level: 'wrong', found, missingKeywords, orderIssue: false };
}

function gradeTranslationViToZh(userAnswer, question, refs) {
  const required = (question.keywords_required || []).filter((k) => k?.zh);
  if (!CJK_RE.test(userAnswer)) {
    return { score: 0, level: 'wrong', found: [], missingKeywords: required.map(buildMissingLabel), orderIssue: false };
  }

  const userNorm = normalizeZh(userAnswer);
  const found = required.filter((k) => userNorm.includes(normalizeZh(k.zh)));
  const missingKeywords = required.filter((k) => !userNorm.includes(normalizeZh(k.zh))).map(buildMissingLabel);
  const kwRatio = required.length ? found.length / required.length : 1;

  if (refs.some((ref) => userNorm === normalizeZh(ref))) {
    return { score: 100, level: 'perfect', found, missingKeywords: [], orderIssue: false };
  }

  let best = { score: 0, orderIssue: false };
  for (const ref of refs) {
    const refNorm = normalizeZh(ref);
    if (!refNorm) continue;
    const longest = Math.max(userNorm.length, refNorm.length, 1);
    const charSim = Math.max(0, Math.round((1 - levenshtein(userNorm, refNorm) / longest) * 100));
    const lcsSim = Math.round((lcsLength(userNorm, refNorm) / longest) * 100);

    const matchedInRef = required
      .map((k) => {
        const zh = normalizeZh(k.zh);
        return {
          refPos: refNorm.indexOf(zh),
          userPos: userNorm.indexOf(zh),
        };
      })
      .filter((item) => item.refPos >= 0 && item.userPos >= 0)
      .sort((a, b) => a.refPos - b.refPos);

    const lisLen = lisLength(matchedInRef.map((item) => item.userPos));
    const orderViolation = matchedInRef.length >= 2 && lisLen < matchedInRef.length;

    let score;
    if (orderViolation) {
      score = Math.min(55, Math.round(0.5 * charSim + 0.5 * lcsSim));
    } else {
      score = Math.round(0.45 * charSim + 0.30 * lcsSim + 0.25 * kwRatio * 100);
      if (required.length > 0 && kwRatio < 0.5) score = Math.min(score, 55);
      if (charSim < 60 && lcsSim < 70) score = Math.min(score, 60);
    }

    if (score > best.score || (score === best.score && best.orderIssue && !orderViolation)) {
      best = { score, orderIssue: orderViolation };
    }
  }

  const level = best.score >= 85 ? 'close' : best.score >= 70 ? 'kw_full' : 'wrong';
  return {
    score: best.score,
    level,
    found,
    missingKeywords,
    orderIssue: best.orderIssue,
  };
}

function matchViKeyword(keywordVi, userSpaced, userCanonSpaced, userCanonSet) {
  const variants = String(keywordVi || '')
    .split(/[;,/]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const variant of variants) {
    const normVar = normalizeViWords(variant).join(' ');
    if (normVar && userSpaced.includes(normVar)) return true;
    const canonVar = canonicalizeViPhraseString(variant);
    if (canonVar && userCanonSpaced.includes(canonVar)) return true;
    const varTokens = canonVar ? canonVar.split(' ').filter(Boolean) : [];
    if (varTokens.length && varTokens.every((tok) => userCanonSet.has(tok))) return true;
  }
  return false;
}

function tokenSetF1(userTokens, refTokens) {
  if (!userTokens.length || !refTokens.length) return 0;
  const userSet = new Set(userTokens);
  const refSet = new Set(refTokens);
  let overlap = 0;
  for (const tok of userSet) {
    if (refSet.has(tok)) overlap += 1;
  }
  if (!overlap) return 0;
  const precision = overlap / userSet.size;
  const recall = overlap / refSet.size;
  return (2 * precision * recall) / (precision + recall);
}

function gradeTranslationZhToVi(userAnswer, question, refs) {
  const required = (question.keywords_required || []).filter((k) => k?.vi);
  const hanziCount = (String(userAnswer).match(CJK_GLOBAL_RE) || []).length;
  const latinCount = (String(userAnswer).match(LATIN_GLOBAL_RE) || []).length;
  if (hanziCount > 0 && latinCount < hanziCount) {
    return { score: 0, level: 'wrong', found: [], missingKeywords: required.map(buildMissingLabel), orderIssue: false };
  }

  const userNorm = normalizeText(userAnswer);
  if (refs.some((ref) => userNorm === normalizeText(ref))) {
    return { score: 100, level: 'perfect', found: required, missingKeywords: [], orderIssue: false };
  }

  const userSpaced = normalizeViWords(userAnswer).join(' ');
  const userCanonTokens = canonicalizeViTokens(userAnswer);
  const userCanonSpaced = userCanonTokens.join(' ');
  const userCanonSet = new Set(userCanonTokens);

  const found = required.filter((k) => matchViKeyword(k.vi, userSpaced, userCanonSpaced, userCanonSet));
  const missingKeywords = required
    .filter((k) => !matchViKeyword(k.vi, userSpaced, userCanonSpaced, userCanonSet))
    .map(buildMissingLabel);
  const kwRatio = required.length ? found.length / required.length : 1;

  let bestTokenF1 = 0;
  let bestCharSim = 0;
  for (const ref of refs) {
    const f1 = tokenSetF1(userCanonTokens, canonicalizeViTokens(ref));
    const sim = calculateSimilarity(userAnswer, ref);
    if (f1 > bestTokenF1) bestTokenF1 = f1;
    if (sim > bestCharSim) bestCharSim = sim;
  }

  let score;
  if (required.length > 0) {
    score = Math.round(0.55 * kwRatio * 100 + 0.35 * bestTokenF1 * 100 + 0.10 * bestCharSim);
    if (kwRatio < 0.5 && bestTokenF1 < 0.6) score = Math.min(score, 55);
  } else {
    score = Math.round(0.65 * bestTokenF1 * 100 + 0.35 * bestCharSim);
  }
  score = Math.min(100, Math.max(0, score));

  const level = score >= 85 ? 'close' : score >= 70 ? 'kw_full' : 'wrong';
  return { score, level, found, missingKeywords, orderIssue: false };
}

export function gradeTyping(userAnswer, question = {}) {
  const trimmed = String(userAnswer || '').trim();
  if (!trimmed) {
    return { score: 0, level: 'wrong', found: [], missingKeywords: [], orderIssue: false };
  }
  const refs = [question.sample_answer, ...(question.alternative_answers || [])].filter(Boolean);
  switch (question.type) {
    case 'typing_zh_from_pinyin':
      return gradeTypingZhFromPinyin(trimmed, question, refs);
    case 'sentence_reorder':
      return gradeSentenceReorder(trimmed, question, refs);
    case 'translation_vi_to_zh':
      return gradeTranslationViToZh(trimmed, question, refs);
    case 'translation_zh_to_vi':
      return gradeTranslationZhToVi(trimmed, question, refs);
    default: {
      const userNorm = normalizeText(trimmed);
      if (refs.some((ref) => userNorm === normalizeText(ref))) {
        return { score: 100, level: 'perfect', found: [], missingKeywords: [], orderIssue: false };
      }
      const bestSim = refs.length ? Math.max(...refs.map((ref) => calculateSimilarity(trimmed, ref))) : 0;
      return {
        score: bestSim,
        level: bestSim >= 85 ? 'close' : 'wrong',
        found: [],
        missingKeywords: [],
        orderIssue: false,
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Real SM-2 Spaced Repetition                                                */
/* -------------------------------------------------------------------------- */

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSrsEntry(today = localDate()) {
  return {
    repetitions: 0,
    level: 0,
    interval: 0,
    ease: 2.5,
    lapses: 0,
    suspended: false,
    lastReview: null,
    firstReviewDate: null,
    nextReview: today,
    createdAt: today,
  };
}

export function calculateNextReview(srs = {}, rating = 'good', { today = localDate(), fuzzSeed = null } = {}) {
  let repetitions = Number(srs?.repetitions ?? srs?.level) || 0;
  const prevInterval = Number(srs?.interval) || 0;
  let ease = Math.max(1.3, Number(srs?.ease) || 2.5);
  let lapses = Number(srs?.lapses) || 0;
  let interval = 0;
  let suspended = false;

  if (rating === 'forgot') {
    repetitions = 0;
    lapses += 1;
    ease = Math.max(1.3, Number((ease - 0.2).toFixed(2)));
    interval = 0;
    suspended = lapses >= LEECH_THRESHOLD;
  } else if (rating === 'hard') {
    ease = Math.max(1.3, Number((ease - 0.14).toFixed(2)));
    interval = repetitions === 0 ? 1 : Math.max(1, Math.round(prevInterval * 1.2));
    repetitions = Math.max(1, repetitions);
  } else if (rating === 'good') {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(prevInterval + 1, Math.round(prevInterval * ease));
  } else if (rating === 'easy') {
    ease = Number((ease + 0.15).toFixed(2));
    repetitions += 1;
    if (repetitions === 1) interval = 4;
    else if (repetitions === 2) interval = 10;
    else interval = Math.max(prevInterval + 2, Math.round(prevInterval * ease * 1.3));
  }

  if (fuzzSeed !== null && interval >= 4) {
    const spread = Math.max(1, Math.round(interval * 0.05));
    const offset = ((hashSeed(`${fuzzSeed}:${repetitions}`) % 3) - 1) * spread;
    interval = Math.max(1, interval + offset);
  }

  return {
    repetitions,
    level: Math.min(5, repetitions),
    ease,
    interval,
    lapses,
    suspended,
    lastReview: today,
    firstReviewDate: srs?.firstReviewDate || today,
    nextReview: addDays(today, interval),
    createdAt: srs?.createdAt || today,
  };
}

export function unsuspendSrsEntry(srs = {}, today = localDate()) {
  return {
    ...createSrsEntry(today),
    ...srs,
    lapses: 0,
    suspended: false,
    repetitions: 0,
    level: 0,
    interval: 0,
    ease: Math.max(1.3, Number(srs?.ease) || 2.5),
    nextReview: today,
  };
}

export function getDueEntries(srs = {}, allEntries = [], { today = localDate(), newCardLimit = DEFAULT_DAILY_NEW_CARDS } = {}) {
  const entryMap = new Map();
  for (const entry of allEntries) {
    if (entry?.id) entryMap.set(entry.id, entry);
  }

  let newReviewedToday = 0;
  const reviews = [];
  const newCards = [];

  for (const [id, data] of Object.entries(srs || {})) {
    if (!data) continue;
    if (data.firstReviewDate === today) newReviewedToday += 1;
    if (data.suspended === true) continue;
    if (!data.nextReview || data.nextReview > today) continue;
    const entry = entryMap.get(id);
    if (!entry) continue;
    if (data.lastReview) reviews.push({ ...entry, srs: data });
    else newCards.push({ ...entry, srs: data });
  }

  reviews.sort((a, b) => String(a.srs.nextReview).localeCompare(String(b.srs.nextReview)));
  const remainingNewQuota = Math.max(0, newCardLimit - newReviewedToday);
  return [...reviews, ...newCards.slice(0, remainingNewQuota)];
}

export function getSuspendedEntries(srs = {}, allEntries = []) {
  const entryMap = new Map();
  for (const entry of allEntries) {
    if (entry?.id) entryMap.set(entry.id, entry);
  }
  return Object.entries(srs || {})
    .filter(([, data]) => data?.suspended === true)
    .map(([id, data]) => {
      const entry = entryMap.get(id);
      return entry ? { ...entry, srs: data } : null;
    })
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Mastery Gate                                                               */
/* -------------------------------------------------------------------------- */

export function evaluateLessonMastery(lessonProgress = {}, totalQuestions = 0) {
  const attempted = Array.isArray(lessonProgress?.attemptedIds)
    ? lessonProgress.attemptedIds.length
    : (Number(lessonProgress?.quizDone) || 0);
  const correct = Array.isArray(lessonProgress?.correctIds)
    ? lessonProgress.correctIds.length
    : (Number(lessonProgress?.quizCorrect) || 0);
  const accuracy = totalQuestions > 0 ? correct / totalQuestions : 0;
  const passed = totalQuestions > 0 && attempted >= totalQuestions && accuracy >= MASTERY_THRESHOLD;
  return {
    passed,
    attempted,
    correct,
    totalQuestions,
    accuracy,
    accuracyPercent: Math.round(accuracy * 100),
    requiredPercent: Math.round(MASTERY_THRESHOLD * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Strict Dictation Grading + Character Diff                                  */
/* -------------------------------------------------------------------------- */

function buildCharDiff(userNorm, targetNorm) {
  const u = [...userNorm];
  const t = [...targetNorm];
  const dp = Array.from({ length: u.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= u.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= u.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      if (u[i - 1] === t[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
      }
    }
  }

  const diff = [];
  let i = u.length;
  let j = t.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && u[i - 1] === t[j - 1]) {
      diff.push({ char: u[i - 1], expected: t[j - 1], status: 'match' });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      diff.push({ char: u[i - 1], expected: t[j - 1], status: 'wrong' });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j] === dp[i][j - 1] + 1)) {
      diff.push({ char: '', expected: t[j - 1], status: 'missing' });
      j -= 1;
    } else {
      diff.push({ char: u[i - 1], expected: '', status: 'extra' });
      i -= 1;
    }
  }
  return diff.reverse();
}

export function gradeDictation(userAnswer, targetZh) {
  const userNorm = normalizeZh(userAnswer);
  const targetNorm = normalizeZh(targetZh);
  if (!userNorm || !targetNorm) {
    return {
      score: 0,
      isCorrect: false,
      diff: [...targetNorm].map((ch) => ({ char: '', expected: ch, status: 'missing' })),
    };
  }
  const longest = Math.max(userNorm.length, targetNorm.length, 1);
  const score = Math.max(0, Math.round((1 - levenshtein(userNorm, targetNorm) / longest) * 100));
  const exactOrNear = targetNorm.length <= 10 ? userNorm === targetNorm : score >= 95;
  return {
    score,
    isCorrect: Boolean(targetNorm) && exactOrNear,
    diff: buildCharDiff(userNorm, targetNorm),
  };
}

/**
 * Sinh bộ câu hỏi luyện tập trực tiếp từ từ vựng, ngữ pháp và mẫu câu của bài học
 * (bù đắp phần từ/ngữ pháp chưa xuất hiện trong bộ quiz tĩnh và tạo bài tập viết câu ngữ pháp).
 */
export function buildEntryPracticeQuestions(entries = [], { bai = null, limit = 15, types = ['word', 'grammar', 'phrase'] } = {}) {
  const allowed = new Set(types);
  const wordPool = entries.filter((e) => e?.type === 'word' && e.meaning_vi);
  const questions = [];

  for (const entry of entries) {
    if (!entry || !allowed.has(entry.type)) continue;
    if (entry.type === 'word' && entry.word_zh && entry.meaning_vi) {
      const distractors = wordPool
        .filter((other) => other.id !== entry.id && other.meaning_vi !== entry.meaning_vi)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 3)
        .map((d) => d.meaning_vi);

      if (distractors.length >= 3) {
        const seed = [...entry.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const rawTexts = [entry.meaning_vi, ...distractors];
        const correctIdx = seed % 4;
        const arranged = [...rawTexts];
        [arranged[0], arranged[correctIdx]] = [arranged[correctIdx], arranged[0]];
        const optionIds = ['A', 'B', 'C', 'D'];
        questions.push({
          id: `gen-word-mcq-${entry.id}`,
          bai: entry.bai ?? bai ?? 1,
          type: 'mcq_meaning_zh_to_vi',
          level: 'recall',
          question_vi: `Từ "${entry.word_zh}" (${entry.pinyin || ''}) có nghĩa là gì?`,
          options: arranged.map((text, idx) => ({ id: optionIds[idx], text })),
          correct_option: optionIds[correctIdx],
          related_glossary: [entry.id],
          explanation: {
            why_correct: `${entry.word_zh} (${entry.pinyin || ''}) nghĩa là "${entry.meaning_vi}".`,
          },
        });
      } else if (entry.pinyin) {
        questions.push({
          id: `gen-word-type-${entry.id}`,
          bai: entry.bai ?? bai ?? 1,
          type: 'typing_zh_from_pinyin',
          level: 'apply',
          question_vi: 'Gõ chữ Hán tương ứng với pinyin và nghĩa sau:',
          pinyin: entry.pinyin,
          meaning_vi: entry.meaning_vi,
          sample_answer: entry.word_zh,
          related_glossary: [entry.id],
          explanation: { why_correct: `${entry.pinyin} viết là "${entry.word_zh}" (${entry.meaning_vi}).` },
        });
      }
    } else if (entry.type === 'grammar') {
      const example = (entry.examples || []).find((ex) => ex?.zh && ex?.vi);
      if (example) {
        questions.push({
          id: `gen-grammar-prod-${entry.id}`,
          bai: entry.bai ?? bai ?? 1,
          type: 'translation_vi_to_zh',
          level: 'synthesize',
          question_vi: `Đặt/dịch câu áp dụng mẫu ngữ pháp "${entry.grammar_title_zh || entry.grammar_title_vi}"`,
          source_sentence_vi: example.vi,
          sample_answer: example.zh,
          sample_answer_pinyin: example.pinyin || '',
          related_glossary: [entry.id],
          explanation: {
            why_correct: entry.explanation_vi || example.zh,
            keyword_tip: entry.structure || '',
          },
        });
      }
    } else if (entry.type === 'phrase' && entry.phrase_zh && entry.meaning_vi) {
      questions.push({
        id: `gen-phrase-type-${entry.id}`,
        bai: entry.bai ?? bai ?? 1,
        type: 'translation_vi_to_zh',
        level: 'apply',
        question_vi: 'Viết câu/mẫu câu tiếng Trung có nghĩa:',
        source_sentence_vi: entry.meaning_vi,
        sample_answer: entry.phrase_zh,
        sample_answer_pinyin: entry.pinyin || '',
        related_glossary: [entry.id],
        explanation: { why_correct: `${entry.phrase_zh} (${entry.pinyin || ''}) — ${entry.usage_note || entry.meaning_vi}` },
      });
    }
    if (questions.length >= limit) break;
  }

  return questions;
}
