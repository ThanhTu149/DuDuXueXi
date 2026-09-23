const fs = require('fs');

let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const replacements = [
  // Backgrounds
  [/bg-white dark:bg-slate-900/g, 'bg-bg-secondary'],
  [/bg-slate-100 dark:bg-slate-800\/50/g, 'bg-bg-tertiary'],
  [/bg-slate-50 dark:bg-slate-800\/50/g, 'bg-bg-tertiary'],
  [/bg-slate-100 dark:bg-slate-800/g, 'bg-bg-tertiary'],
  [/bg-slate-50 dark:bg-slate-950/g, 'bg-bg-primary'],
  [/bg-\[var\(--bg-primary\)\] dark:bg-slate-950/g, 'bg-bg-primary'],
  [/bg-\[var\(--bg-primary\)\]/g, 'bg-bg-primary'],
  [/dark:bg-slate-950/g, 'bg-bg-primary'],
  
  // Text
  [/text-\[var\(--text-primary\)\] dark:text-slate-100/g, 'text-text-primary'],
  [/text-\[var\(--text-primary\)\]/g, 'text-text-primary'],
  [/text-slate-950 dark:text-white/g, 'text-text-primary'],
  [/text-slate-900 dark:text-slate-100/g, 'text-text-primary'],
  [/text-slate-800 dark:text-slate-200/g, 'text-text-primary'],
  [/text-slate-600 dark:text-slate-300/g, 'text-text-secondary'],
  [/text-slate-500 dark:text-slate-400/g, 'text-text-muted'],
  [/text-slate-400 dark:text-slate-500/g, 'text-text-muted'],
  
  // Borders
  [/border-slate-200 dark:border-slate-800/g, 'border-border'],
  [/border-slate-200 dark:border-slate-700/g, 'border-border'],
  [/border-slate-300 dark:border-slate-700/g, 'border-border-strong'],
  [/border-slate-300 dark:border-slate-600/g, 'border-border-strong'],
  
  // Status - Error
  [/bg-rose-50 text-rose-800 dark:bg-rose-950\/40 dark:text-rose-200/g, 'bg-error-subtle text-error'],
  [/bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300/g, 'bg-error-subtle text-error'],
  [/bg-rose-50 text-rose-900 dark:bg-rose-950\/50 dark:text-rose-100/g, 'bg-error-subtle text-error'],
  [/border-rose-400/g, 'border-error'],
  [/border-rose-300 dark:border-rose-800/g, 'border-error'],
  [/bg-rose-50 dark:bg-rose-950\/30/g, 'bg-error-subtle'],
  [/border-rose-200 dark:border-rose-900/g, 'border-error'],
  [/bg-rose-100 text-rose-700/g, 'bg-error-subtle text-error'],
  [/bg-rose-50 dark:bg-rose-950\/40/g, 'bg-error-subtle'],
  [/text-rose-500 dark:text-rose-300/g, 'text-error'],
  [/text-rose-600 dark:text-rose-400/g, 'text-error'],
  [/text-rose-500/g, 'text-error'],
  [/bg-rose-500/g, 'bg-error'],
  [/hover:border-rose-300/g, 'hover:border-error'],
  [/hover:border-rose-200/g, 'hover:border-error'],

  // Status - Success
  [/bg-emerald-50 text-emerald-800 dark:bg-emerald-950\/40 dark:text-emerald-200/g, 'bg-success-subtle text-success'],
  [/bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300/g, 'bg-success-subtle text-success'],
  [/border-emerald-300 dark:border-emerald-800/g, 'border-success'],
  [/bg-emerald-50 dark:bg-emerald-950\/30/g, 'bg-success-subtle'],
  [/text-emerald-600 dark:text-emerald-300/g, 'text-success'],
  [/text-emerald-700 dark:text-emerald-300/g, 'text-success'],
  [/bg-emerald-500/g, 'bg-success'],

  // Status - Warning
  [/bg-amber-50 text-amber-800 dark:bg-amber-950\/40 dark:text-amber-200/g, 'bg-warning-subtle text-warning'],
  [/bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200/g, 'bg-warning-subtle text-warning'],
  [/border-amber-300 dark:border-amber-800/g, 'border-warning'],
  [/bg-amber-50 dark:bg-amber-950\/30/g, 'bg-warning-subtle'],
  [/text-amber-600/g, 'text-warning'],

  // Status - Accent 2
  [/bg-sky-50 text-sky-800 dark:bg-sky-950\/40 dark:text-sky-200/g, 'bg-accent-2-subtle text-accent-2'],
  [/bg-sky-100 text-sky-700/g, 'bg-accent-2-subtle text-accent-2'],
  [/border-sky-500/g, 'border-accent-2'],
  
  // Accents (Buttons primarily used slate-900)
  [/bg-slate-900 text-white dark:bg-white dark:text-slate-900/g, 'bg-accent text-white'],
  [/bg-slate-900 text-white dark:bg-rose-300 dark:text-slate-950/g, 'bg-accent text-white'],
  [/bg-slate-900/g, 'bg-accent'],
  
  // Roundings & Fonts
  [/rounded-2xl/g, 'rounded-xl'],
  [/rounded-3xl/g, 'rounded-xl'],
  [/font-black/g, 'font-bold'],
  [/text-4xl/g, 'display-text'],
  [/text-3xl/g, 'h1-text'],
  [/text-2xl/g, 'h2-text'],
  [/shadow-soft/g, 'shadow-lg'],
  [/shadow-2xl/g, 'shadow-lg'],

  // Extra colors
  [/dark:text-white/g, 'text-white'], // Clean up
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

// Remove THEMES, ThemeToggle, ThemePicker logic
content = content.replace(/const THEMES = \{[\s\S]*?\};\n\n/g, '');
content = content.replace(/function ThemeToggle\(\{ mode, onChange, expanded \}\) \{[\s\S]*?\}\n\n/g, '');
content = content.replace(/function ThemePicker\(\{ current, onChange \}\) \{[\s\S]*?\}\n\n/g, '');
content = content.replace(/<ThemePicker[^>]+>/g, '');
content = content.replace(/<ThemeToggle[^>]+>/g, '');
content = content.replace(/colorTheme: '[^']+',/g, '');
content = content.replace(/themeMode={progress.themeMode} effectiveTheme={effectiveTheme} onThemeChange={changeTheme} /g, '');
content = content.replace(/onThemeChange, onColorThemeChange, /g, '');
content = content.replace(/const changeTheme = \(mode\) => setProgress\(\(previous\) => \(\{ \.\.\.previous, themeMode: mode \}\)\);\n/g, '');
content = content.replace(/const changeColorTheme = \(theme\) => setProgress\(\(previous\) => \(\{ \.\.\.previous, colorTheme: theme \}\)\);\n/g, '');
content = content.replace(/const effectiveTheme = [\s\S]*?progress.colorTheme || 'pastel';\n/g, '');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
console.log('Done migrating');
