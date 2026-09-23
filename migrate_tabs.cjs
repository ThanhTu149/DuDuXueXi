const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const flashcardComponent = `
function FlashcardMode({ entries, title }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!entries.length) return <EmptyState mascot="panda" title="Trống" text="Không có từ nào để luyện." />;
  const entry = entries[index];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % entries.length);
  };
  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + entries.length) % entries.length);
  };

  return (
    <div className="mx-auto max-w-md text-center pb-10">
      <h3 className="mb-4 font-bold text-text-muted uppercase tracking-widest">{title} - {index + 1}/{entries.length}</h3>
      <div 
        onClick={() => setFlipped(!flipped)}
        className="group relative aspect-[4/3] w-full cursor-pointer perspective-1000"
      >
        <div className={\`absolute inset-0 h-full w-full rounded-2xl border border-border-strong transition-all duration-500 transform-style-3d shadow-xl \${flipped ? 'rotate-y-180 bg-accent' : 'bg-bg-secondary'}\`}>
          {/* Front */}
          <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-6">
            <p className="text-5xl font-bold text-text-primary">{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh}</p>
            {entry.pinyin && <p className="mt-4 text-xl text-text-muted">{entry.pinyin}</p>}
            <p className="mt-4 text-sm text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">Chạm để lật</p>
          </div>
          {/* Back */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-6 text-white">
            <p className="text-2xl font-bold">{entry.meaning_vi}</p>
            {entry.example_zh && (
              <div className="mt-6 border-t border-white/20 pt-4 text-left">
                <p className="text-lg font-medium">{entry.example_zh}</p>
                <p className="text-sm text-white/80">{entry.example_pinyin}</p>
                <p className="mt-2 text-sm text-white/90">{entry.example_vi}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-4">
        <button onClick={prev} className="grid h-12 w-12 place-items-center rounded-full bg-bg-secondary border border-border hover:bg-bg-tertiary transition">
          <Icon.ChevronLeft className="h-6 w-6" />
        </button>
        <button onClick={next} className="grid h-12 w-12 place-items-center rounded-full bg-bg-secondary border border-border hover:bg-bg-tertiary transition">
          <Icon.ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
`;

content = content.replace(/(const questionIsMcq =)/, flashcardComponent + '\n$1');

// Update LearnScreen to include Flashcard tab
content = content.replace(
  /const tabs = \[\s*\{ id: 'words', label: `Từ vựng \(\${words.length}\)` \},\s*\{ id: 'grammar', label: `Ngữ pháp \(\${grammar.length}\)` \},\s*\{ id: 'phrases', label: `Mẫu câu \(\${phrases.length}\)` \}\s*\];/,
  `const tabs = [
    { id: 'words', label: \`Từ vựng (\${words.length})\` },
    { id: 'grammar', label: \`Ngữ pháp (\${grammar.length})\` },
    { id: 'phrases', label: \`Mẫu câu (\${phrases.length})\` },
    { id: 'flashcards', label: 'Flashcard' }
  ];`
);

content = content.replace(
  /if \(activeTab === 'grammar'\) currentEntries = grammar;\n\s*if \(activeTab === 'phrases'\) currentEntries = phrases;/,
  `if (activeTab === 'grammar') currentEntries = grammar;
  if (activeTab === 'phrases') currentEntries = phrases;

  if (activeTab === 'flashcards') {
    return (
      <div className="mx-auto max-w-3xl pb-24">
        <div className="sticky top-0 z-10 bg-bg-primary pt-4 pb-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2-text">Bài {bai}</h2>
            <button onClick={() => onStartQuiz(bai)} className="btn-primary px-6">Bắt đầu Quiz</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={\`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition \${activeTab === tab.id ? 'bg-text-primary text-bg-primary dark:bg-accent dark:text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'}\`}
              >{tab.label}</button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <FlashcardMode entries={[...words, ...grammar, ...phrases]} title={\`Bài \${bai}\`} />
        </div>
      </div>
    );
  }`
);

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
