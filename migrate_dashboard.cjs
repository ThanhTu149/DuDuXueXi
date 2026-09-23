const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(
  /className=\{`rounded-lg px-4 py-2 text-sm font-bold \$\{tab === 'overview' \? 'bg-error-subtle text-white' : 'bg-bg-secondary'\}`\}/g,
  "className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'overview' ? 'bg-text-primary text-bg-primary dark:bg-accent dark:text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'}`}"
);

content = content.replace(
  /className=\{`rounded-lg px-4 py-2 text-sm font-bold \$\{tab === 'settings' \? 'bg-error-subtle text-white' : 'bg-bg-secondary'\}`\}/g,
  "className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'settings' ? 'bg-text-primary text-bg-primary dark:bg-accent dark:text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'}`}"
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
