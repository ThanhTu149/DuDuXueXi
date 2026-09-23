const HEADING = /^(?:Chương\s+\d+|Chapter\s+\d+|Phần\s+\d+|PART\s+\d+|第[一二三四五六七八九十百\d]+[章课課])(?:\s*[:：.、-]?\s*.*)?$/gim;

export function detectChapters(text = '') {
  const matches = [...text.matchAll(HEADING)].filter((match) => match[0].trim().length <= 100);
  return matches.map((match, index) => ({
    title: match[0].trim(),
    charStart: match.index,
    charEnd: matches[index + 1]?.index ?? text.length,
  }));
}
