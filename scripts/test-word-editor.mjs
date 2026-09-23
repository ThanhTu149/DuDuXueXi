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

  async function openLearn() {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Học')?.click());
    await page.waitForSelector('button[aria-label^="Sửa từ vựng"]');
  }

  await openLearn();
  const original = await page.evaluate(async () => {
    const { getCourse } = await import('/src/lib/db.js');
    const { GLOSSARY } = await import('/src/data-loader.js');
    const course = await getCourse('hanngu-tap2');
    return {
      stored: course.chapters[0].glossary.entries.find((entry) => entry.type === 'word'),
      backup: GLOSSARY[1].entries.find((entry) => entry.type === 'word'),
    };
  });
  assert.equal(original.stored.meaning_vi, original.backup.meaning_vi);

  await page.click('button[aria-label^="Sửa từ vựng"]');
  await page.waitForSelector('[role="dialog"]');
  const changedMeaning = `${original.stored.meaning_vi} (đã sửa)`;
  const meaningInput = await page.$('[role="dialog"] label:nth-child(4) input');
  await meaningInput.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await meaningInput.type(changedMeaning);
  const noteInput = await page.$('[role="dialog"] textarea');
  await noteInput.type('Ghi chú kiểm thử');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Lưu thay đổi').click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  const afterSave = await page.evaluate(async (id) => {
    const { getCourse } = await import('/src/lib/db.js');
    const course = await getCourse('hanngu-tap2');
    return {
      entry: course.chapters[0].glossary.entries.find((entry) => entry.id === id),
      note: JSON.parse(localStorage.getItem('dudu-progress-v1')).notes[id],
    };
  }, original.stored.id);
  assert.equal(afterSave.entry.meaning_vi, changedMeaning);
  assert.equal(afterSave.entry.id, original.stored.id);
  assert.deepEqual(afterSave.entry.related_words, original.stored.related_words);
  assert.equal(afterSave.note, 'Ghi chú kiểm thử');

  await page.reload({ waitUntil: 'networkidle0' });
  await openLearn();
  await page.waitForFunction((meaning) => document.querySelector('main')?.textContent.includes(meaning), {}, changedMeaning);
  const afterReload = await page.evaluate(async () => {
    const { GLOSSARY } = await import('/src/data-loader.js');
    return GLOSSARY[1].entries.find((entry) => entry.type === 'word').meaning_vi;
  });
  assert.equal(afterReload, original.backup.meaning_vi);

  await page.click('button[aria-label^="Sửa từ vựng"]');
  await page.waitForSelector('[role="dialog"]');
  const pinyinInput = await page.$('[role="dialog"] label:nth-child(2) input');
  await pinyinInput.type('x');
  await page.click('[role="dialog"] button[aria-label="Đóng"]');
  await page.waitForSelector('[role="alertdialog"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find((button) => button.textContent.trim() === 'Hủy').click());
  assert.ok(await page.$('[role="dialog"]'));
  await page.click('[role="dialog"] button[aria-label="Đóng"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find((button) => button.textContent.trim() === 'Hủy bỏ thay đổi').click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(errors, []);
  console.log('Word editor OK: save/reload IndexedDB, JSON backup, note và xác nhận thay đổi chưa lưu.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
