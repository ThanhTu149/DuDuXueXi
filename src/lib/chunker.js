export function estimateTokens(text = '') {
  const sample = text.slice(0, 10000);
  const nonLatin = (sample.match(/[\u3400-\u9fff\u00C0-\u1EF9]/g) || []).length;
  return Math.ceil(text.length / (nonLatin / Math.max(sample.length, 1) > 0.1 ? 1.5 : 4));
}

function findBreak(text, start, limit) {
  if (limit >= text.length) return text.length;
  const floor = start + Math.floor((limit - start) * 0.6);
  const slice = text.slice(floor, limit);
  const boundaries = [...slice.matchAll(/[。！？.!?](?:\s|$)|\n\s*\n|\n/g)];
  const last = boundaries.at(-1);
  return last ? floor + last.index + last[0].length : limit;
}

export function chunkText(text, { maxTokens = 2500, overlapRatio = 0.1 } = {}) {
  if (!text?.trim()) return [];
  if (!Number.isFinite(maxTokens) || maxTokens < 50) throw new Error('maxTokens phải từ 50 trở lên.');
  if (overlapRatio < 0 || overlapRatio >= 0.5) throw new Error('overlapRatio phải từ 0 đến dưới 0.5.');
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    while (start < text.length && /\s/.test(text[start])) start += 1;
    if (start >= text.length) break;
    let low = start + 1;
    let high = Math.min(text.length, start + maxTokens * 4);
    let limit = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (estimateTokens(text.slice(start, middle)) <= maxTokens) {
        limit = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    const end = findBreak(text, start, limit);
    const chunk = text.slice(start, end);
    chunks.push({
      id: `chunk_${String(chunks.length + 1).padStart(3, '0')}`,
      index: chunks.length,
      text: chunk,
      charStart: start,
      charEnd: end,
      estimatedTokens: estimateTokens(chunk),
    });
    if (end >= text.length) break;
    const overlap = overlapRatio ? Math.max(1, Math.floor((end - start) * overlapRatio)) : 0;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
