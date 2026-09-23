const fs = require('fs');

let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const replacements = [
  // Header remaining
  [/bg-rose-50\/95 backdrop-blur dark:border-slate-800 bg-bg-primary\/95/g, 'bg-bg-primary/95 backdrop-blur border-border'],
  [/border-white\/70/g, 'border-border'],
  [/themeMode, onThemeChange, /g, ''],
  [/themeMode=\{progress.themeMode\} onThemeChange=\{changeTheme\} /g, ''],

  // Catch remaining bg-* dark:bg-*
  [/bg-white dark:bg-slate-950/g, 'bg-bg-primary'],
  [/bg-white/g, 'bg-bg-secondary'],
  [/bg-slate-100/g, 'bg-bg-tertiary'],
  [/bg-slate-200/g, 'bg-border'],
  [/bg-slate-50/g, 'bg-bg-tertiary'],
  [/dark:bg-slate-900/g, ''],
  [/dark:bg-slate-950/g, ''],
  [/dark:bg-slate-800/g, ''],
  [/dark:bg-slate-700/g, ''],
  
  // Catch remaining text-* dark:text-*
  [/text-slate-950/g, 'text-text-primary'],
  [/text-slate-900/g, 'text-text-primary'],
  [/text-slate-800/g, 'text-text-primary'],
  [/text-slate-700/g, 'text-text-secondary'],
  [/text-slate-600/g, 'text-text-secondary'],
  [/text-slate-500/g, 'text-text-muted'],
  [/text-slate-400/g, 'text-text-muted'],
  [/text-slate-300/g, 'text-text-muted'],
  [/text-slate-200/g, 'text-text-muted'],
  [/dark:text-slate-100/g, ''],
  [/dark:text-slate-200/g, ''],
  [/dark:text-slate-300/g, ''],
  [/dark:text-slate-400/g, ''],
  [/dark:text-slate-500/g, ''],
  [/dark:text-white/g, ''],

  // Catch remaining border-* dark:border-*
  [/border-slate-800/g, 'border-border-strong'],
  [/border-slate-700/g, 'border-border-strong'],
  [/border-slate-600/g, 'border-border-strong'],
  [/border-slate-300/g, 'border-border-strong'],
  [/border-slate-200/g, 'border-border'],
  [/border-slate-100/g, 'border-border'],
  [/dark:border-slate-[0-9]+/g, ''],
  
  // Rose / Pink
  [/border-rose-300/g, 'border-error'],
  [/border-rose-200/g, 'border-error'],
  [/border-rose-100/g, 'border-error'],
  [/bg-rose-950\/[0-9]+/g, ''],
  [/bg-rose-[0-9]+/g, 'bg-error-subtle'],
  [/text-rose-[0-9]+/g, 'text-error'],
  [/border-rose-[0-9]+/g, 'border-error'],
  [/ring-rose-[0-9]+/g, 'ring-error'],
  [/dark:text-rose-[0-9]+/g, ''],
  [/dark:border-rose-[0-9]+/g, ''],
  [/dark:bg-rose-[0-9]+\/[0-9]+/g, ''],
  
  // Emerald
  [/border-emerald-[0-9]+/g, 'border-success'],
  [/text-emerald-[0-9]+/g, 'text-success'],
  [/bg-emerald-[0-9]+/g, 'bg-success-subtle'],
  [/dark:text-emerald-[0-9]+/g, ''],
  [/dark:bg-emerald-[0-9]+\/[0-9]+/g, ''],
  [/dark:border-emerald-[0-9]+/g, ''],

  // Amber
  [/text-amber-[0-9]+/g, 'text-warning'],
  [/bg-amber-[0-9]+/g, 'bg-warning-subtle'],
  [/border-amber-[0-9]+/g, 'border-warning'],
  [/dark:text-amber-[0-9]+/g, ''],
  [/dark:bg-amber-[0-9]+\/[0-9]+/g, ''],
  [/dark:border-amber-[0-9]+/g, ''],

  // Sky
  [/text-sky-[0-9]+/g, 'text-accent-2'],
  [/bg-sky-[0-9]+/g, 'bg-accent-2-subtle'],
  [/border-sky-[0-9]+/g, 'border-accent-2'],
  [/dark:text-sky-[0-9]+/g, ''],
  [/dark:bg-sky-[0-9]+\/[0-9]+/g, ''],
  [/dark:border-sky-[0-9]+/g, ''],

  // Ring
  [/dark:ring-slate-[0-9]+/g, ''],
  [/ring-slate-[0-9]+/g, 'ring-border-strong'],
  
  // Hover
  [/dark:hover:bg-slate-[0-9]+/g, 'hover:bg-bg-tertiary'],
  [/hover:bg-rose-[0-9]+/g, 'hover:bg-error-subtle'],
  [/dark:hover:border-rose-[0-9]+/g, ''],

  // Fix Background Layer
  [/bg-bg-secondary bg-bg-primary/g, 'bg-bg-primary'],
  [/bg-\[var\(--bg-primary\)\]/g, 'bg-bg-primary'],
  [/text-\[var\(--text-primary\)\]/g, 'text-text-primary'],
  
  // Clean up duplicate spaces
  [/ +/g, ' '],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
console.log('Done cleaning up');
