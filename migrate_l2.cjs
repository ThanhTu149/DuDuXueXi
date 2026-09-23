const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const newHomeScreen = `
function HomeScreen({ progress, onOpenLesson, onNavigate, onChangeGoal }) {
  const currentBai = progress.unlockedBai;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 text-center">
        <Mascot type="panda" size="lg" className="mx-auto mb-4" />
        <h1 className="h1-text mb-2 text-3xl">Lộ trình Hán ngữ</h1>
        <p className="text-text-muted">Tiến bộ từng ngày, nắm chắc từng chữ.</p>
      </div>

      <div className="space-y-4">
        {LESSONS.map((bai) => {
          const isUnlocked = bai <= currentBai;
          const isCurrent = bai === currentBai;
          const accuracy = progress.baiProgress?.[bai]?.accuracy || 0;
          
          return (
            <button
              key={bai}
              onClick={() => isUnlocked && onOpenLesson(bai)}
              className={\`w-full flex items-center justify-between rounded-xl border p-5 text-left transition \${
                isCurrent 
                  ? 'border-accent bg-accent-subtle shadow-md dark:bg-accent dark:border-accent' 
                  : isUnlocked 
                    ? 'border-border bg-bg-secondary hover:border-border-strong' 
                    : 'border-border bg-bg-tertiary opacity-60 cursor-not-allowed'
              }\`}
            >
              <div className="flex items-center gap-4">
                <div className={\`grid h-12 w-12 shrink-0 place-items-center rounded-full font-bold \${isCurrent ? 'bg-accent text-white' : isUnlocked ? 'bg-bg-tertiary text-text-secondary' : 'bg-bg-tertiary text-text-muted'}\`}>
                  {bai}
                </div>
                <div>
                  <h3 className={\`font-bold \${isUnlocked ? 'text-text-primary' : 'text-text-muted'}\`}>
                    Bài {bai}
                  </h3>
                  {isUnlocked && (
                    <p className="text-sm text-text-muted mt-1">
                      {accuracy}% độ chính xác
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isUnlocked ? (
                  <Icon.ChevronRight className={\`h-5 w-5 \${isCurrent ? 'text-accent' : 'text-text-muted'}\`} />
                ) : (
                  <Icon.Minus className="h-5 w-5 text-text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
`;

const newLearnScreen = `
function LearnScreen({ bai, unlockedBai, bookmarks, notes, onToggleBookmark, onSaveNote, onLessonRead, onStartQuiz, onOpenEntry, onCharacter, onStartPlaylist, onChangeBai }) {
  const [activeTab, setActiveTab] = useState('words');
  const lessonData = GLOSSARY[bai];
  if (!lessonData) return null;

  const words = lessonData.entries.filter((e) => e.type === 'word');
  const grammar = lessonData.entries.filter((e) => e.type === 'grammar');
  const phrases = lessonData.entries.filter((e) => e.type === 'phrase');

  const tabs = [
    { id: 'words', label: \`Từ vựng (\${words.length})\` },
    { id: 'grammar', label: \`Ngữ pháp (\${grammar.length})\` },
    { id: 'phrases', label: \`Mẫu câu (\${phrases.length})\` }
  ];

  let currentEntries = words;
  if (activeTab === 'grammar') currentEntries = grammar;
  if (activeTab === 'phrases') currentEntries = phrases;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="sticky top-0 z-10 bg-bg-primary pt-4 pb-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h2-text">Bài {bai}</h2>
          <button onClick={() => onStartQuiz(bai)} className="btn-primary px-6">
            Bắt đầu Quiz
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={\`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition \${
                activeTab === tab.id 
                  ? 'bg-text-primary text-bg-primary dark:bg-accent dark:text-white' 
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              }\`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {currentEntries.map(entry => (
          <div key={entry.id} className="card p-5 group flex flex-col gap-2 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-1">{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh}</h3>
                {entry.pinyin && <p className="text-sm font-medium text-text-muted mb-2">{entry.pinyin}</p>}
                
                <p className="text-text-primary font-medium">{entry.meaning_vi}</p>
              </div>
              <button 
                onClick={() => onToggleBookmark(entry.id)}
                className={\`grid h-10 w-10 shrink-0 place-items-center rounded-full transition \${bookmarks.includes(entry.id) ? 'text-accent bg-accent-subtle' : 'text-text-muted hover:bg-bg-tertiary'}\`}
              >
                <Icon.Bookmark className="h-5 w-5" />
              </button>
            </div>
            
            {entry.example_zh && (
              <div className="mt-4 rounded-lg bg-bg-tertiary p-4">
                <p className="font-bold text-text-primary">{entry.example_zh}</p>
                <p className="text-sm text-text-muted mt-1">{entry.example_pinyin}</p>
                <p className="text-sm text-text-secondary mt-1">{entry.example_vi}</p>
              </div>
            )}
            
            <button 
              onClick={() => onOpenEntry(entry)}
              className="mt-4 text-sm font-bold text-accent hover:underline self-start"
            >
              Xem chi tiết →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
`;

content = content.replace(/function HomeScreen\(\{ progress, onOpenLesson, onNavigate, onChangeGoal \}\) \{[\s\S]*?\n\}\n/s, newHomeScreen + '\n');
content = content.replace(/function LearnScreen\(\{ bai, unlockedBai, bookmarks, notes, onToggleBookmark, onSaveNote, onLessonRead, onStartQuiz, onOpenEntry, onCharacter, onStartPlaylist, onChangeBai \}\) \{[\s\S]*?\n\}\n/s, newLearnScreen + '\n');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
