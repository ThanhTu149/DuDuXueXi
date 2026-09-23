const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const navCode = [
  "const NAV_ITEMS = [",
  "  { id: 'home', icon: <Icon.Home />, label: 'Lộ trình' },",
  "  { id: 'learn', icon: <Icon.Book />, label: 'Học' },",
  "  { id: 'quiz', icon: <Icon.Check />, label: 'Quiz' },",
  "  { id: 'review', icon: <Icon.Refresh />, label: 'Ôn tập' },",
  "  { id: 'dashboard', icon: <Icon.Chart />, label: 'Hồ sơ' },",
  "];",
  "",
  "const EXTRA_NAV = [",
  "  { id: 'exam', icon: <Icon.Pen />, label: 'Thi thử' },",
  "  { id: 'boss', icon: <Icon.Trophy />, label: 'Boss Battle' },",
  "  { id: 'matching', icon: <Icon.Gamepad />, label: 'Ghép từ' },",
  "];"
].join('\n');

content = content.replace(/const NAV_ITEMS = \[[\s\S]*?\];\n\nconst EXTRA_NAV = \[[\s\S]*?\];\n\n/g, '');
content = content.replace(/(const Icon = \{[\s\S]*?\};\n\n)/, '1' + navCode + '\n\n');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
