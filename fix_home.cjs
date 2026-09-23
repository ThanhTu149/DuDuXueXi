const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(
  /const currentBai = progress.unlockedBai;/,
  'const currentBai = Math.max(...progress.unlockedBai);'
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
