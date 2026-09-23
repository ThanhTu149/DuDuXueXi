const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const newHeader = [
  "function Header({ progress, onSearch, onLogoClick }) {",
  "  const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;",
  "  return (",
  "    <header className=\"sticky top-0 z-30 flex h-[56px] items-center justify-between border-b border-border bg-bg-secondary px-6\">",
  "      <button className=\"flex items-center gap-2\" onClick={onLogoClick} aria-label=\"Về trang chủ\">",
  "        <div className=\"grid h-7 w-7 place-items-center rounded bg-accent text-sm font-bold text-white\">好</div>",
  "        <span className=\"h3-text text-[16px] text-text-primary\">DuDu Hán Ngữ</span>",
  "      </button>",
  "",
  "      <button onClick={onSearch} className=\"flex h-8 w-[240px] items-center justify-between rounded-md border border-border bg-bg-primary px-3 text-text-muted transition hover:border-border-strong hover:bg-bg-tertiary\">",
  "        <div className=\"flex items-center gap-2 text-sm\">",
  "          <Icon.Search className=\"h-4 w-4\" />",
  "          <span>Tìm kiếm</span>",
  "        </div>",
  "        <kbd className=\"rounded border border-border bg-bg-secondary px-1.5 text-[11px] font-medium\">Ctrl K</kbd>",
  "      </button>",
  "",
  "      <div className=\"flex items-center gap-4\">",
  "        <div className=\"flex items-center gap-2 text-[13px] font-medium text-text-secondary\">",
  "          <span className=\"flex items-center gap-1\"><Icon.Target className=\"h-3.5 w-3.5 text-success\" /> {accuracy}%</span>",
  "          <span>·</span>",
  "          <span className=\"flex items-center gap-1\"><Icon.Flame className=\"h-3.5 w-3.5 text-error\" /> {progress.streak}</span>",
  "          <span>·</span>",
  "          <span className=\"flex items-center gap-1\"><Icon.Zap className=\"h-3.5 w-3.5 text-warning\" /> {progress.xp} XP</span>",
  "        </div>",
  "      </div>",
  "    </header>",
  "  );",
  "}"
].join('\n');

content = content.replace(/function Header\(\{ progress, onSearch, onLogoClick \}\) \{[\s\S]*?\}\n\n/s, newHeader + '\n\n');
fs.writeFileSync('./src/App.jsx', content, 'utf-8');
