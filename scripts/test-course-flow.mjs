import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => [...document.querySelectorAll('nav button')].some((button) => button.textContent.trim() === 'Thư viện'));
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Tiếp tục học'));

  const click = async (label) => {
    await page.evaluate((text) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
      if (!button) throw new Error(`Không tìm thấy nút ${text}`);
      button.click();
    }, label);
  };
  await click('Thư viện');
  await page.waitForSelector('input[aria-label="Tên khóa học"]');
  await page.type('input[aria-label="Tên khóa học"]', 'Khóa thử');
  await click('Thêm khóa học');
  await page.waitForSelector('input[type="file"][accept=".pdf,.docx,.txt"]');
  await click('← Thư viện');
  await page.waitForSelector('input[aria-label="Tên khóa học"]');
  await page.waitForFunction(() => [...document.querySelectorAll('main article')].some((card) => card.querySelector('h2')?.textContent.trim() === 'Khóa thử'));
  await page.evaluate(() => [...document.querySelectorAll('main article')].find((card) => card.querySelector('h2')?.textContent.trim() === 'Khóa thử')?.querySelector('button')?.click());
  await page.waitForFunction(async () => (await (await import('/src/lib/db.js')).getSettings()).activeCourseId !== 'hanngu-tap2');
  await click('Hồ sơ');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Cài đặt'));
  await click('Cài đặt');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Gemini API Key'));
  await click('Thư viện');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Khóa thử'));
  await page.evaluate(() => [...document.querySelectorAll('main article')].find((card) => card.querySelector('h2')?.textContent.trim() === 'Khóa thử')?.querySelectorAll('button')[1]?.click());
  await page.waitForSelector('input[type="file"][accept=".pdf,.docx,.txt"]');
  await page.evaluate(() => {
    const file = new File(['第一课 你好\n你好。我是学生。\n第二课 学校\n我们在学校学习中文。'], 'small.txt', { type: 'text/plain' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('input[type="file"][accept=".pdf,.docx,.txt"]');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Trích xuất văn bản');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Văn bản trích xuất'));
  await click('Lưu tài liệu và tiếp tục');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Sinh bài học từ tài liệu'));
  await page.evaluate(async () => {
    const { saveSettings } = await import('/src/lib/db.js');
    await saveSettings({ geminiApiKey: 'test-key', geminiModel: 'gemini-2.5-pro' });
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('generativelanguage.googleapis.com')) {
        window.__usedGeminiModel = String(input);
        const output = { chapter_title_zh: '你好', chapter_title_vi: 'Chào hỏi', summary_vi: 'Bài học về chào hỏi.', key_points: ['Chào hỏi'], vocabulary: [{ word_zh: '你好', pinyin: 'nǐ hǎo', meaning_vi: 'xin chào', meaning_en: 'hello', word_type: '叹', example_zh: '你好。', example_vi: 'Xin chào.' }], grammar: [], quiz: [{ type: 'mcq_meaning_zh_to_vi', level: 'recall', question_vi: '你好 nghĩa là gì?', options: [{ id: 'A', text: 'Xin chào' }, { id: 'B', text: 'Tạm biệt' }, { id: 'C', text: 'Cảm ơn' }, { id: 'D', text: 'Xin lỗi' }], correct_option: 'A', explanation_vi: '你好 dùng để chào hỏi.' }] };
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return original(input, init);
    };
  });
  await click('Bắt đầu xử lý');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Duyệt nội dung'), { timeout: 15000 });
  assert.match(await page.evaluate(() => window.__usedGeminiModel), /gemini-2\.5-pro:generateContent$/);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu vào khóa học')?.disabled);
  await click('Lưu vào khóa học');
  await page.waitForFunction(async () => {
    const db = await import('/src/lib/db.js');
    const course = (await db.getAllCourses()).find((item) => item.name === 'Khóa thử');
    return course?.status === 'ready';
  }, { timeout: 15000 });
  const result = await page.evaluate(async () => {
    const db = await import('/src/lib/db.js');
    const courses = await db.getAllCourses();
    const course = await db.getCourse(courses.find((item) => item.name === 'Khóa thử').id);
    return { status: course.status, chapters: course.chapters.length, words: course.chapters[0].glossary.entries.length, questions: course.chapters[0].quiz.questions.length };
  });
  assert.deepEqual(result, { status: 'ready', chapters: 1, words: 1, questions: 1 });
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Chào hỏi'));
  await click('Quiz');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('你好 nghĩa là gì?'));
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((button) => button.textContent.includes('Xin chào'))?.click());
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Chính xác!'));
  await page.click('button[aria-label="Thoát quiz"]');
  await page.waitForFunction(() => [...document.querySelectorAll('nav button')].some((button) => button.textContent.trim() === 'Thư viện'));
  await click('Thư viện');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Hán Ngữ Tập 2'));
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('article')].find((item) => item.textContent.includes('Hán Ngữ Tập 2'));
    [...card.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Mở').click();
  });
  await page.waitForFunction(async () => (await (await import('/src/lib/db.js')).getSettings()).activeCourseId === 'hanngu-tap2');
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('427') || document.querySelector('main')?.textContent.includes('Bài học gần đây'));
  const switched = await page.evaluate(async () => ({ settings: await (await import('/src/lib/db.js')).getSettings(), lessons: Object.keys((await import('/src/data-loader.js')).GLOSSARY).length }));
  assert.equal(switched.settings.activeCourseId, 'hanngu-tap2');
  assert.equal(switched.lessons, 10);
  const backup = await page.evaluate(async () => {
    const { checksum, importCourse } = await import('/src/lib/courseBackup.js');
    const { getCourse, getAllCourses } = await import('/src/lib/db.js');
    const course = await getCourse((await getAllCourses()).find((item) => item.name === 'Khóa thử').id);
    const payload = { format: 'dudu-course', version: '1.0', course, checksum: await checksum(course) };
    const imported = await importCourse(new File([JSON.stringify(payload)], 'backup.dudu'));
    return { name: imported.name, chapters: imported.chapters.length };
  });
  assert.deepEqual(backup, { name: 'Khóa thử (nhập)', chapters: 1 });
  const merged = await page.evaluate(async () => {
    const { mergeCourses } = await import('/src/lib/courseBackup.js');
    const { getAllCourses, getCourse } = await import('/src/lib/db.js');
    const courses = await getAllCourses();
    const source = courses.find((item) => item.name === 'Khóa thử');
    const target = courses.find((item) => item.name === 'Khóa thử (nhập)');
    const result = await mergeCourses(source.id, target.id);
    return { chapters: result.chapters.length, ids: result.chapters.map((chapter) => chapter.id), sourceChapters: (await getCourse(source.id)).chapters.length, targetChapters: (await getCourse(target.id)).chapters.length };
  });
  assert.deepEqual(merged, { chapters: 2, ids: ['bai01', 'bai02'], sourceChapters: 1, targetChapters: 1 });
  const tamperRejected = await page.evaluate(async () => {
    const { importCourse } = await import('/src/lib/courseBackup.js');
    try { await importCourse(new File([JSON.stringify({ format: 'dudu-course', version: '1.0', course: { name: 'Sai', chapters: [] }, checksum: 'bad' })], 'bad.dudu')); return false; }
    catch (error) { return error.message.includes('Checksum'); }
  });
  assert.equal(tamperRejected, true);
  await page.evaluate(() => [...document.querySelectorAll('header button')].find((button) => button.textContent.includes('Tìm từ vựng'))?.click());
  await page.waitForSelector('[role="dialog"][aria-label="Tìm kiếm và lệnh"]');
  await page.select('[role="dialog"][aria-label="Tìm kiếm và lệnh"] select', 'all');
  await page.type('[role="dialog"][aria-label="Tìm kiếm và lệnh"] input', '你好');
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent.includes('Khóa thử')));
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes('Khóa thử') && !button.textContent.includes('(nhập)'))?.click());
  await page.waitForFunction(async () => (await (await import('/src/lib/db.js')).getSettings()).activeCourseId !== 'hanngu-tap2');
  assert.deepEqual(errors, []);
  console.log('Course flow OK: tạo khóa, nhập TXT, chunk, Gemini giả lập, duyệt, commit, mở bài.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
