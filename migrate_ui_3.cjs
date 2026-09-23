const fs = require('fs');

let content = fs.readFileSync('./src/App.jsx', 'utf-8');

// Fix the classes
content = content.replace(/text-text-primary text-white/g, 'text-text-primary');
content = content.replace(/border-border bg-bg-primary\/95 backdrop-blur border-border/g, 'border-b border-border bg-bg-primary/95 backdrop-blur');
content = content.replace(/text-text-primary bg-bg-secondary/g, 'text-text-primary');
content = content.replace(/bg-error-subtle text-xl text-white/g, 'bg-error text-xl text-white'); // The logo should probably be bg-error not subtle

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
