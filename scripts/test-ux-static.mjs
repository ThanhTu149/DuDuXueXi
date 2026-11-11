import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, app, search, importer, dialogHook, buildScript] = await Promise.all([
  readFile('src/index.css', 'utf8'),
  readFile('src/App.jsx', 'utf8'),
  readFile('src/components/GlobalCourseSearch.jsx', 'utf8'),
  readFile('src/screens/ImportScreen.jsx', 'utf8'),
  readFile('src/lib/useDialogA11y.js', 'utf8'),
  readFile('scripts/build.mjs', 'utf8'),
]);

const hexToRgb = (hex) => hex.match(/[a-f\d]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
const luminance = (hex) => hexToRgb(hex).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => { const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };
const variable = (source, name) => source.match(new RegExp(`--${name}:\\s*(#[A-Fa-f0-9]{6})`))?.[1];

/** Extract the body of the first CSS block whose selector starts with `needle`. */
const blockBody = (source, needle) => {
  const selectorStart = source.indexOf(needle);
  if (selectorStart < 0) return '';
  const bodyStart = source.indexOf('{', selectorStart) + 1;
  let depth = 1;
  let index = bodyStart;
  for (; index < source.length && depth > 0; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
  }
  return source.slice(bodyStart, index - 1);
};

const lightBlock = blockBody(css, ':root {');
const darkBlock = blockBody(css, '.dark {');

for (const [label, block] of [['sáng', lightBlock], ['tối', darkBlock]]) {
  const background = variable(block, 'bg-primary');
  for (const name of ['text-primary', 'text-secondary', 'text-muted', 'accent']) {
    const ratio = contrast(variable(block, name), background);
    assert.ok(ratio >= 4.5, `${label}: ${name} chỉ đạt ${ratio.toFixed(2)}:1`);
  }
}

// Color-theme palettes must exist for light and dark, and dark surfaces must
// stay dark (this is the regression that made cards turn white in dark mode).
assert.match(css, /\[data-color-theme="rose"\]/);
assert.match(css, /\[data-color-theme="ocean"\]/);
assert.match(css, /\.dark\[data-color-theme="rose"\]/);
assert.match(css, /\.dark\[data-color-theme="ocean"\]/);
assert.match(css, /--on-accent:/);
for (const theme of ['rose', 'ocean']) {
  for (const mode of ['light', 'dark']) {
    const selector = mode === 'dark' ? `.dark[data-color-theme="${theme}"] {` : `:root[data-color-theme="${theme}"] {`;
    const block = blockBody(css, selector);
    assert.ok(block.includes('--accent-subtle'), `${theme}/${mode}: thiếu --accent-subtle`);
    const subtle = variable(block, 'accent-subtle');
    assert.ok(subtle, `${theme}/${mode}: thiếu --accent-subtle`);
    const subtleIsDark = luminance(subtle) < 0.2;
    assert.equal(subtleIsDark, mode === 'dark', `${theme}/${mode}: accent-subtle phải ${mode === 'dark' ? 'tối' : 'sáng'}`);
  }
}

assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /content-visibility:\s*auto/);
assert.match(css, /\.skip-link:focus/);
assert.match(app, /lazy\(\(\) => import\('\.\/screens\/LibraryScreen\.jsx'\)\)/);
assert.match(app, /id="main-content"/);
assert.match(app, /screen !== 'quiz' && <Sidebar/);
assert.match(app, /onCommand=\{runPaletteCommand\}/);
assert.match(search, /dudu-recent-commands/);
assert.match(search, /event\.key !== 'Tab'/);
assert.match(importer, /onDrop=/);
assert.match(importer, /onDragOver=/);
assert.match(dialogHook, /event\.key === 'Escape'/);
assert.match(dialogHook, /event\.key !== 'Tab'/);
assert.match(dialogHook, /document\.body\.style\.overflow = 'hidden'/);
assert.match(app, /role="progressbar"/);
assert.doesNotMatch(app, /transition-all/);
assert.match(buildScript, /lesson-\$\{lesson\[1\]\}/);
const toast = app.slice(app.indexOf('function AchievementToast'), app.indexOf('function Confetti'));
assert.doesNotMatch(toast, /fixed inset-0/);

console.log('UX static OK: contrast AA, reduced motion, focus trap, ARIA progress, code splitting, keyboard palette và kéo-thả.');
