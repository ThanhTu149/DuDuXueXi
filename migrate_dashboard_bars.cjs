const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(
  /className="flex h-3 overflow-hidden rounded-full bg-error-subtle dark:bg-error-subtle"><div className="bg-success-subtle"/g,
  'className="flex h-3 overflow-hidden rounded-full bg-bg-tertiary"><div className="bg-accent"'
);

// Also the XP bars:
content = content.replace(
  /className="min-h-1 rounded-t-md bg-success-subtle"/g,
  'className="min-h-1 rounded-t-md bg-accent"'
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
