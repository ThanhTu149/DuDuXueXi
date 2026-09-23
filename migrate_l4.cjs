const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const newEmptyState = `function EmptyState({ icon, title, text, mascot = 'penguin' }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border-strong bg-bg-secondary">
      <Mascot type={mascot} size="lg" className="mb-4 opacity-80 grayscale transition hover:grayscale-0" />
      <h3 className="mb-2 text-lg font-bold text-text-primary">{title}</h3>
      <p className="text-text-muted font-medium">{text}</p>
    </div>
  );
}`;

const newAchievementToast = `function AchievementToast({ badge, onClose }) {
  if (!badge) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Confetti />
      <div className="w-full max-w-sm rounded-2xl border border-white/50 bg-bg-secondary p-8 text-center shadow-2xl dark:border-border-strong dark:bg-accent animate-bounce-in">
        <Mascot type="panda" size="xl" className="mx-auto mb-4 drop-shadow-xl" />
        <h2 className="mb-2 text-2xl font-bold text-success">Danh hiệu mới!</h2>
        <h3 className="text-xl font-bold text-text-primary">{badge.title}</h3>
        <p className="mt-2 text-sm font-medium text-text-secondary">{badge.description}</p>
        <button onClick={onClose} className="btn-primary mt-6 w-full">Tuyệt vời!</button>
      </div>
    </div>
  );
}`;

content = content.replace(/function EmptyState\(\{ icon, title, text \}\) \{[\s\S]*?\n\}\n/s, newEmptyState + '\n');
content = content.replace(/function AchievementToast\(\{ badge, onClose \}\) \{[\s\S]*?\n\}\n/s, newAchievementToast + '\n');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
