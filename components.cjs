const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

// Fix the mangled className in Sidebar
content = content.replace(/className=\{av-item \\\}/g, "className={`nav-item ${screen === item.id ? 'active' : ''}`}");

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
