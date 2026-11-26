import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES, GLOSSARY, LESSON_TEXTS, QUIZZES } from '../data-loader.js';
import {
  EmptyState,
  FlashcardMode,
  GrammarCard,
  Icon,
  PhraseCard,
  SpeakButton,
  WordCard,
} from '../components/StudyUi.jsx';
import { buildEntryPracticeQuestions } from '../lib/pedagogy.js';
import { LESSONS } from '../lib/progressState.js';
import { extractReadingLines, getSentencesByBai, normalizeText } from '../lib/studyHelpers.js';

function ReadingModeTab({ bai }) {
  const [showPinyin, setShowPinyin] = useState(true);
  const [showVi, setShowVi] = useState(true);
  const entries = GLOSSARY[bai]?.entries || [];
  const examples = useMemo(() => getSentencesByBai(bai), [bai]);
  const lines = useMemo(
    () => extractReadingLines(LESSON_TEXTS[bai]).map((text, index) => {
      const match = examples.find((item) => normalizeText(text).includes(normalizeText(item.zh)));
      const words = entries.filter((entry) => entry.word_zh && text.includes(entry.word_zh));
      return {
        id: `${bai}-${index}`,
        text,
        pinyin: match?.pinyin || words.map((entry) => `${entry.word_zh} ${entry.pinyin}`).join(' · '),
        vi: match?.vi || words.map((entry) => `${entry.word_zh}: ${entry.meaning_vi}`).join(' · '),
      };
    }),
    [bai, entries, examples],
  );
  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-border bg-bg-primary py-3">
        <span className="filter-btn active">Hán</span>
        <button onClick={() => setShowPinyin((value) => !value)} className={`filter-btn ${showPinyin ? 'active' : ''}`}>Pinyin</button>
        <button onClick={() => setShowVi((value) => !value)} className={`filter-btn ${showVi ? 'active' : ''}`}>Tiếng Việt</button>
      </div>
      <div className="space-y-3">
        {lines.map((line) => (
          <article key={line.id} className="card">
            <div className="flex items-start gap-3">
              <p className="font-hanzi flex-1 text-xl font-medium leading-9" lang="zh-Hans">{line.text}</p>
              <SpeakButton text={line.text} />
            </div>
            {showPinyin && line.pinyin && <p className="pinyin-text mt-2 text-sm text-success" lang="zh-Latn">{line.pinyin}</p>}
            {showVi && line.vi && <p className="mt-1 text-sm text-accent-2">{line.vi}</p>}
          </article>
        ))}
      </div>
      {!lines.length && <EmptyState icon="文" title="Chưa nhận diện được bài khóa" text="Nội dung OCR chưa có phần 课文 rõ ràng." />}
    </div>
  );
}

export default function LearnScreen({
  bai,
  progress,
  unlockedBai,
  bookmarks,
  notes,
  onToggleBookmark,
  onSaveNote,
  onLessonRead,
  onStartQuiz,
  onStartCustomQuiz,
  onOpenEntry,
  onCharacter,
  onStartPlaylist,
  onChangeBai,
  wordOverrides,
  onEditWord,
  onEditGrammar,
  editorError,
}) {
  const [activeTab, setActiveTab] = useState('words');
  const readSentinelRef = useRef(null);
  const lessonData = GLOSSARY[bai];

  useEffect(() => {
    if (!lessonData || activeTab !== 'words' || !readSentinelRef.current) return undefined;
    const observer = new IntersectionObserver(([item]) => {
      if (item.isIntersecting) onLessonRead?.(bai);
    }, { threshold: 0.8 });
    observer.observe(readSentinelRef.current);
    return () => observer.disconnect();
  }, [lessonData, activeTab, bai, onLessonRead]);

  if (!lessonData) return null;

  const meta = lessonData.metadata || {};
  const lessonStat = progress?.baiProgress?.[bai] || {};
  const quizTotal = QUIZZES[bai]?.questions?.length || 0;
  const quizDone = Math.min(quizTotal, lessonStat.quizDone || 0);
  const nextLockedCount = Math.max(0, LESSONS.length - unlockedBai.length);

  const words = lessonData.entries.filter((e) => e.type === 'word').map((entry) => wordOverrides[entry.id] || entry);
  const grammar = lessonData.entries.filter((e) => e.type === 'grammar');
  const phrases = lessonData.entries.filter((e) => e.type === 'phrase');

  const tabs = [
    { id: 'words', label: 'Từ vựng', count: words.length },
    { id: 'grammar', label: 'Ngữ pháp', count: grammar.length },
    { id: 'phrases', label: 'Mẫu câu', count: phrases.length },
    { id: 'flashcards', label: 'Flashcard', count: words.length + grammar.length + phrases.length },
    { id: 'reading', label: 'Bài khóa' },
  ];

  const startVocabDrill = () => {
    const questions = buildEntryPracticeQuestions(words, { bai, limit: 20, types: ['word'] });
    if (questions.length) onStartCustomQuiz?.(`Từ vựng Bài ${bai}`, questions, bai);
  };

  const startGrammarDrill = () => {
    const questions = buildEntryPracticeQuestions(grammar, { bai, limit: 12, types: ['grammar'] });
    if (questions.length) onStartCustomQuiz?.(`Đặt câu ngữ pháp Bài ${bai}`, questions, bai);
  };

  const lessonTabs = (
    <div className="tabs-container scrollbar-thin" role="tablist" aria-label="Nội dung bài học">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.findIndex((item) => item.id === tab.id);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            setActiveTab(tabs[next].id);
            event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
          }}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
        >
          {tab.label}{Number.isFinite(tab.count) && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );

  const lessonHeader = (
    <div className="learn-toolbar bg-bg-primary pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="lesson-select" className="sr-only">Chọn bài học</label>
            <select id="lesson-select" value={bai} onChange={(event) => onChangeBai(Number(event.target.value))} className="input lesson-select text-sm">
              {LESSONS.map((lesson) => <option key={lesson} value={lesson} disabled={!unlockedBai.includes(lesson)}>Bài {lesson}{unlockedBai.includes(lesson) ? '' : ' · khóa'}</option>)}
            </select>
            {quizTotal > 0 && <span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-text-secondary tabular">{quizDone}/{quizTotal} câu</span>}
            {lessonStat.completed && <span className="badge badge-success">Đã xong</span>}
            {!lessonStat.completed && nextLockedCount > 0 && <span className="hidden text-xs text-text-muted sm:inline">còn {nextLockedCount} bài đang khóa</span>}
          </div>
          <h2 className="mt-2 break-words font-hanzi text-[22px] font-semibold leading-snug">{meta.title_zh || `Bài ${bai}`}</h2>
          {meta.title_vi && <p className="mt-0.5 text-sm text-text-muted">{meta.title_vi}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => onStartPlaylist(words.map((entry) => ({ text: entry.word_zh, label: entry.word_zh, sublabel: entry.meaning_vi })))} className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 sm:flex-none"><Icon.Volume className="h-4 w-4" />Playlist</button>
          <button onClick={() => onStartQuiz(bai)} className="btn-primary inline-flex flex-1 items-center justify-center gap-2 px-4 sm:flex-none sm:px-6"><Icon.Play className="h-4 w-4" />Quiz</button>
        </div>
      </div>
      {lessonTabs}
    </div>
  );

  let currentEntries = words;
  if (activeTab === 'grammar') currentEntries = grammar;
  if (activeTab === 'phrases') currentEntries = phrases;

  if (activeTab === 'reading') {
    return <div className="mx-auto max-w-3xl pb-24">{lessonHeader}<div className="mt-5"><ReadingModeTab bai={bai} /></div></div>;
  }

  if (activeTab === 'flashcards') {
    return (
      <div className="mx-auto max-w-3xl pb-24">
        {lessonHeader}
        <div className="mt-6">
          <FlashcardMode entries={[...words, ...grammar, ...phrases]} title={`Bài ${bai}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {lessonHeader}
      {activeTab === 'words' && words.length >= 4 && onStartCustomQuiz && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-2.5 text-xs">
          <span className="text-text-secondary">Muốn kiểm tra đủ toàn bộ <strong>{words.length} từ</strong> trong Bài {bai}?</span>
          <button type="button" onClick={startVocabDrill} className="btn-soft rounded-full px-3 py-1 text-xs">Luyện nhanh {Math.min(20, words.length)} từ</button>
        </div>
      )}
      {activeTab === 'grammar' && grammar.length > 0 && onStartCustomQuiz && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-2.5 text-xs">
          <span className="text-text-secondary">Luyện viết câu trực tiếp theo <strong>{grammar.length} điểm ngữ pháp</strong> của bài:</span>
          <button type="button" onClick={startGrammarDrill} className="btn-soft rounded-full px-3 py-1 text-xs">Luyện đặt câu ngữ pháp</button>
        </div>
      )}
      {editorError && <p role="alert" className="mt-4 rounded-xl bg-error-subtle p-3 text-sm text-error">{editorError}</p>}
      <div className="mt-6 space-y-4">
        {currentEntries.map((entry) => entry.type === 'word'
          ? <WordCard key={entry.id} entry={entry} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} onEdit={onEditWord} />
          : entry.type === 'grammar'
            ? (
              <div key={entry.id}>
                <GrammarCard entry={entry} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />
                {onEditGrammar && <button onClick={() => onEditGrammar(entry)} className="mt-1 text-xs text-accent">Sửa ngữ pháp</button>}
              </div>
            )
            : <PhraseCard key={entry.id} entry={entry} onRelated={(id) => onOpenEntry(ALL_GLOSSARY_ENTRIES.find((item) => item.id === id))} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />)}
      </div>
      {activeTab === 'words' && <div ref={readSentinelRef} className="h-1" aria-hidden="true" />}
    </div>
  );
}
