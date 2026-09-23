const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(
  /const Icon = \{/g,
  "const Icon = {\n  Minus: (props) => <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\" {...props}><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>,"
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
