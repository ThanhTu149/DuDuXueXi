import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('dudu-progress-v1', JSON.stringify({
      xp: 123,
      streak: 3,
      baiProgress: { 1: { completed: true, quizDone: 30, quizCorrect: 27 } },
      settings: { enableBackground: true, background: 'sakura', backgroundBlur: 4, overlayOpacity: 92 },
      themeMode: 'dark',
    }));
  });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(async () => {
    const db = await import('/src/lib/db.js');
    return db.isMigrationDone();
  });

  const first = await page.evaluate(async () => {
    const db = await import('/src/lib/db.js');
    const course = await db.getCourse('hanngu-tap2');
    const summaries = await db.getAllCourses();
    const progress = await db.getProgress('hanngu-tap2');
    const settings = await db.getSettings();
    const second = await db.migrateBuiltInCourse();
    return {
      second,
      chapters: course.chapters.length,
      entries: course.metadata.totalEntries,
      questions: course.metadata.totalQuestions,
      readingText: Boolean(course.chapters[0].readingText),
      summariesContainChapters: Object.hasOwn(summaries[0], 'chapters'),
      chapterCount: summaries[0].chapterCount,
      progress,
      settings,
      oldBackup: Boolean(localStorage.getItem('dudu-progress-v1')),
    };
  });

  assert.equal(first.second.migrated, false);
  assert.equal(first.chapters, 10);
  assert.ok(first.entries > 0);
  assert.ok(first.questions > 0);
  assert.equal(first.readingText, true);
  assert.equal(first.summariesContainChapters, false);
  assert.equal(first.chapterCount, 10);
  assert.equal(first.progress.xp, 123);
  assert.equal(first.progress.baiProgress.bai01.completed, true);
  assert.equal(first.progress.settings.enableBackground, true);
  assert.equal(first.progress.settings.backgroundBlur, 4);
  assert.equal(first.settings.theme, 'dark');
  assert.equal(first.oldBackup, true);

  await page.reload({ waitUntil: 'networkidle0' });
  const second = await page.evaluate(async () => {
    const db = await import('/src/lib/db.js');
    const course = await db.getCourse('hanngu-tap2');
    const progress = await db.getProgress('hanngu-tap2');
    await db.saveCourse({ id: 'test-course', name: 'Khóa thử', type: 'imported', chapters: [] });
    const created = await db.getCourse('test-course');
    await db.saveCourse({ id: 'test-course', name: 'Khóa thử đã sửa', type: 'imported', chapters: [] });
    const updated = await db.getCourse('test-course');
    await db.saveProgress('test-course', { xp: 5 });
    await db.saveSettings({ activeCourseId: 'test-course' });
    const deleted = await db.deleteCourse('test-course');
    let protectedBuiltIn = false;
    try {
      await db.deleteCourse('hanngu-tap2');
    } catch {
      protectedBuiltIn = true;
    }
    return {
      chapters: course.chapters.length,
      xp: progress.xp,
      createdAt: created.createdAt,
      creationDatePreserved: created.createdAt === updated.createdAt,
      updatedName: updated.name,
      deleted,
      deletedCourse: await db.getCourse('test-course'),
      deletedProgress: await db.getProgress('test-course'),
      activeCourseId: (await db.getSettings()).activeCourseId,
      protectedBuiltIn,
    };
  });

  assert.equal(second.chapters, 10);
  assert.equal(second.xp, 123);
  assert.ok(second.createdAt);
  assert.equal(second.creationDatePreserved, true);
  assert.equal(second.updatedName, 'Khóa thử đã sửa');
  assert.equal(second.deleted, true);
  assert.equal(second.deletedCourse, null);
  assert.equal(second.deletedProgress, null);
  assert.equal(second.activeCourseId, 'hanngu-tap2');
  assert.equal(second.protectedBuiltIn, true);
  assert.deepEqual(errors, []);
  console.log(`IndexedDB OK: 10 bài, ${first.entries} entries, ${first.questions} câu hỏi; migration idempotent, progress giữ nguyên.`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
