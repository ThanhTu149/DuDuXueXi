const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

content = content.replace(/<MascotPanda text="(.*?)" className="(.*?)" \/>/g, '<div className="flex items-center gap-3 \"><Mascot type="panda" size="md" /><p className="text-sm font-bold text-text-primary">\</p></div>');
content = content.replace(/<MascotPenguin text="(.*?)" className="(.*?)" \/>/g, '<div className="flex items-center gap-3 \"><Mascot type="penguin" size="md" /><p className="text-sm font-bold text-text-primary">\</p></div>');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
