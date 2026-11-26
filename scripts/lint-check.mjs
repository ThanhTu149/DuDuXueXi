/**
 * Kiểm tra cú pháp, JSX và JSON toàn repo không cần cài thêm ESLint/TypeScript:
 *   npm run lint
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const [serverFiles, scriptFiles, srcFiles, dataFiles] = await Promise.all([
  walk('server'),
  walk('scripts'),
  walk('src'),
  walk('data'),
]);

let checkedNode = 0;
for (const file of [...serverFiles, ...scriptFiles].filter((f) => /\.(?:js|mjs)$/.test(f))) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(res.status, 0, `Syntax error in ${file}: ${res.stderr}`);
  checkedNode += 1;
}

let checkedSrc = 0;
for (const file of srcFiles.filter((f) => /\.(?:js|jsx|mjs)$/.test(f))) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /\bdebugger\s*;/, `Leftover debugger in ${file}`);
  const loader = file.endsWith('.jsx') ? 'jsx' : 'js';
  await transform(source, { loader, jsx: 'automatic', sourcefile: file });
  checkedSrc += 1;
}

let checkedJson = 0;
for (const file of dataFiles.filter((f) => f.endsWith('.json') && !f.includes('node_modules'))) {
  const raw = await readFile(file, 'utf8');
  JSON.parse(raw);
  checkedJson += 1;
}

console.log(`Syntax/lint OK: ${checkedNode} server/script files, ${checkedSrc} src JS/JSX modules, ${checkedJson} data JSON files.`);
