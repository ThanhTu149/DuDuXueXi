import assert from 'node:assert/strict';
import { chunkText } from '../src/lib/chunker.js';
import { detectChapters } from '../src/lib/chapterDetector.js';
import { buildChapterPrompt } from '../src/lib/promptBuilder.js';
import { ApiQueue } from '../src/lib/queue.js';
import { ParseError } from '../src/lib/geminiClient.js';
import { mergeChunkOutputs } from '../src/lib/contentMerger.js';

const text = `第一课 你好\n${'你好。我们学习中文。'.repeat(1400)}\n第二课 再见\n${'再见。我们明天见。'.repeat(1200)}`;
const chunks = chunkText(text);
assert.ok(chunks.length >= 3);
assert.ok(chunks.every((chunk) => chunk.estimatedTokens <= 2500));
assert.equal(chunks[0].charStart, 0);
assert.ok(chunks[1].charStart < chunks[0].charEnd);
assert.equal(detectChapters(text).length, 2);
assert.ok(buildChapterPrompt(chunks[0], { customInstruction: 'Ưu tiên hội thoại.' }).includes('Ưu tiên hội thoại.'));

const output = { chapter_title_zh: '你好', chapter_title_vi: 'Chào hỏi', summary_vi: 'Luyện chào hỏi.', vocabulary: [{ word_zh: '你好', pinyin: 'nǐ hǎo', meaning_vi: 'xin chào' }], grammar: [], quiz: [{ type: 'mcq_meaning_zh_to_vi', question_vi: '你好 là gì?', options: [{ id: 'A', text: 'Xin chào' }, { id: 'B', text: 'Tạm biệt' }], correct_option: 'A', explanation_vi: 'Lời chào.' }] };
const merged = mergeChunkOutputs([{ chunkIndex: 0, output }, { chunkIndex: 1, output }, { chunkIndex: 2, error: 'thất bại' }], chunks);
assert.equal(merged.chapters.length, 2);
assert.equal(merged.chapters[0].glossary.entries.length, 1);
assert.equal(merged.chapters[1].glossary.entries.length, 0);
assert.deepEqual(merged.failedChunks, [2]);
assert.deepEqual(merged.chapters[0].quiz.questions[0].related_glossary, [merged.chapters[0].glossary.entries[0].id]);

const queue = new ApiQueue({ maxPerMinute: 14, minInterval: 20 });
const times = [];
await Promise.all([0, 1, 2].map((index) => queue.add(async () => { times.push(Date.now()); return index; })));
assert.ok(times[1] - times[0] >= 15);
assert.ok(times[2] - times[1] >= 15);
queue.pause();
setTimeout(() => queue.resume(), 30);
assert.equal(await queue.add(async () => 'resumed'), 'resumed');
assert.equal(queue.getStatus().completed, 4);
const retryQueue = new ApiQueue({ maxPerMinute: 14, minInterval: 0 });
let attempts = 0;
let retryNotice = null;
const retryResult = await retryQueue.add(async () => {
  attempts += 1;
  if (attempts === 1) throw new ParseError('not json');
  return 'recovered';
}, { onRetry: (notice) => { retryNotice = notice; } });
assert.equal(retryResult, 'recovered');
assert.equal(retryNotice.attempt, 2);
assert.equal(retryNotice.delay, 500);
console.log('Processing OK: chunking, merge, pacing, pause và thông báo retry.');
