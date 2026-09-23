const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const newSidebar = [
  "function Sidebar({ screen, onNavigate }) {",
  "  return (",
  "    <aside className=\"hidden w-[220px] shrink-0 border-r border-border bg-bg-primary px-3 py-4 lg:block\">",
  "      <nav className=\"sticky top-[76px] space-y-1\">",
  "        {NAV_ITEMS.map((item) => (",
  "          <button",
  "            key={item.id}",
  "            onClick={() => onNavigate(item.id)}",
  "            className={\
av-item \\}",
  "          >",
  "            {item.icon}",
  "            <span>{item.label}</span>",
  "          </button>",
  "        ))}",
  "        <hr className=\"divider my-4\" />",
  "        <div className=\"mb-2 px-3 text-[11px] font-medium tracking-widest text-text-muted uppercase\">Mở rộng</div>",
  "        {EXTRA_NAV.map((item) => (",
  "          <button",
  "            key={item.id}",
  "            onClick={() => onNavigate(item.id)}",
  "            className={\
av-item \\}",
  "          >",
  "            {item.icon}",
  "            <span>{item.label}</span>",
  "          </button>",
  "        ))}",
  "      </nav>",
  "    </aside>",
  "  );",
  "}"
].join('\n');

content = content.replace(/function Sidebar\(\{ screen, onNavigate \}\) \{[\s\S]*?\n\}\n\n/s, newSidebar + '\n\n');
fs.writeFileSync('./src/App.jsx', content, 'utf-8');
