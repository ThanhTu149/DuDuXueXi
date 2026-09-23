const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

// The iconsCode string from migrate_icons.cjs
const iconsCode = [
  "const Icon = {",
  "  Home: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>,",
  "  Book: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M4 19.5A2.5 2.5 0 016.5 17H20\"/><path d=\"M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z\"/></svg>,",
  "  Check: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polyline points=\"20 6 9 17 4 12\"/></svg>,",
  "  Refresh: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polyline points=\"23 4 23 10 17 10\"/><polyline points=\"1 20 1 14 7 14\"/><path d=\"M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15\"/></svg>,",
  "  Chart: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"18\" y1=\"20\" x2=\"18\" y2=\"10\"/><line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"4\"/><line x1=\"6\" y1=\"20\" x2=\"6\" y2=\"14\"/></svg>,",
  "  Search: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><circle cx=\"11\" cy=\"11\" r=\"8\"/><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"/></svg>,",
  "  Pen: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M12 19l7-7 3 3-7 7-3-3z\"/><path d=\"M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z\"/><path d=\"M2 2l7.586 7.586\"/><circle cx=\"11\" cy=\"11\" r=\"2\"/></svg>,",
  "  Trophy: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M6 9H4.5a2.5 2.5 0 010-5H6\"/><path d=\"M18 9h1.5a2.5 2.5 0 000-5H18\"/><path d=\"M4 22h16\"/><path d=\"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22\"/><path d=\"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22\"/><path d=\"M18 2H6v7a6 6 0 0012 0V2z\"/></svg>,",
  "  Sun: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><circle cx=\"12\" cy=\"12\" r=\"5\"/><line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"3\"/><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"/><line x1=\"4.22\" y1=\"4.22\" x2=\"5.64\" y2=\"5.64\"/><line x1=\"18.36\" y1=\"18.36\" x2=\"19.78\" y2=\"19.78\"/><line x1=\"1\" y1=\"12\" x2=\"3\" y2=\"12\"/><line x1=\"21\" y1=\"12\" x2=\"23\" y2=\"12\"/><line x1=\"4.22\" y1=\"19.78\" x2=\"5.64\" y2=\"18.36\"/><line x1=\"18.36\" y1=\"5.64\" x2=\"19.78\" y2=\"4.22\"/></svg>,",
  "  Moon: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z\"/></svg>,",
  "  Settings: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z\"/></svg>,",
  "  Play: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polygon points=\"5 3 19 12 5 21 5 3\"/></svg>,",
  "  Pause: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><rect x=\"6\" y=\"4\" width=\"4\" height=\"16\"/><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\"/></svg>,",
  "  Volume: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polygon points=\"11 5 6 9 2 9 2 15 6 15 11 19 11 5\"/><path d=\"M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07\"/></svg>,",
  "  Mic: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z\"/><path d=\"M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8\"/></svg>,",
  "  Star: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"/></svg>,",
  "  Bookmark: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z\"/></svg>,",
  "  ChevronRight: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polyline points=\"9 18 15 12 9 6\"/></svg>,",
  "  ChevronLeft: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polyline points=\"15 18 9 12 15 6\"/></svg>,",
  "  X: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>,",
  "  Plus: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>,",
  "  Minus: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>,",
  "  Flame: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z\"/></svg>,",
  "  Target: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/></svg>,",
  "  Zap: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"/></svg>,",
  "  Gamepad: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"6\" y1=\"12\" x2=\"10\" y2=\"12\"/><line x1=\"8\" y1=\"10\" x2=\"8\" y2=\"14\"/><line x1=\"15\" y1=\"13\" x2=\"15.01\" y2=\"13\"/><line x1=\"18\" y1=\"11\" x2=\"18.01\" y2=\"11\"/><rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"2\"/></svg>,",
  "  Headphones: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><path d=\"M3 18v-6a9 9 0 0118 0v6\"/><path d=\"M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z\"/></svg>,",
  "  Type: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><polyline points=\"4 7 4 4 20 4 20 7\"/><line x1=\"9\" y1=\"20\" x2=\"15\" y2=\"20\"/><line x1=\"12\" y1=\"4\" x2=\"12\" y2=\"20\"/></svg>",
  "};",
  "",
  "const MASCOTS = {",
  "  panda: { emoji: '🐼', name: 'Trúc', role: 'senpai' },",
  "  penguin: { emoji: '🐧', name: 'Băng', role: 'kohai' },",
  "};",
  "",
  "function Mascot({ type = 'panda', size = 'md', className = '' }) {",
  "  const sizes = {",
  "    sm: 'text-3xl',",
  "    md: 'text-5xl',",
  "    lg: 'text-7xl',",
  "    xl: 'text-8xl',",
  "  };",
  "  const mascot = MASCOTS[type];",
  "  return (",
  "    <div className={`\\${sizes[size]} \\${className} select-none`} aria-label={`Linh vật \\${mascot.name}`} role=\"img\">",
  "      {mascot.emoji}",
  "    </div>",
  "  );",
  "}"
].join('\n');

// Find BACKGROUNDS array and insert iconsCode right before it
content = content.replace(/(const BACKGROUNDS = \[)/, iconsCode + '\n\n$1');

// Clean up the accidental "1const NAV_ITEMS..." bug from migrate_nav.cjs
content = content.replace(/1const NAV_ITEMS = \[/, 'const NAV_ITEMS = [');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
console.log('Restored icons and Mascot successfully');
