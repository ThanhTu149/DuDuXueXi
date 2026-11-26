import { useEffect, useMemo, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES, ALL_QUESTIONS, GLOSSARY } from '../data-loader.js';
import {
  EmptyState,
  FlashcardMode,
  GrammarCard,
  Icon,
  NoteEditor,
  PhraseCard,
  ProgressBar,
  SectionHeading,
  SpeakButton,
  WordCard,
} from '../components/StudyUi.jsx';
import {
  DEFAULT_DAILY_NEW_CARDS,
  LEECH_THRESHOLD,
  buildEntryPracticeQuestions,
  getDueEntries,
  getSuspendedEntries,
} from '../lib/pedagogy.js';
import { LESSONS, SRS_RATINGS, questionIsMcq, shuffleArray } from '../lib/progressState.js';
import { TYPE_LABELS, entryMeaning, entryTitle } from '../lib/studyHelpers.js';

function WrongAnswerBook({ progress, onPractice, onOpenEntry, onNavigate }) {
  const wrong = progress.wrongAnswers;
  if (!wrong.length) {
    return (
      <EmptyState
        icon="✓"
        title="Sổ tay đang sạch"
        text="Các câu chưa đạt sẽ tự xuất hiện tại đây. Làm quiz để Trúc theo dõi giúp bạn nhé."
        action={onNavigate ? <button onClick={() => onNavigate('quiz')} className="btn-primary">Luyện quiz ngay</button> : null}
      />
    );
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-text-muted">{wrong.length} câu cần ôn lại</p>
        <button onClick={() => onPractice(wrong.map((item) => item.questionId))} className="btn-primary text-sm">Luyện lại câu sai</button>
      </div>
      <div className="space-y-3">
        {wrong.map((item) => {
          const question = ALL_QUESTIONS.find((candidate) => candidate.id === item.questionId);
          if (!question) return null;
          const correct = questionIsMcq(question)
            ? `${question.correct_option}. ${question.options.find((option) => option.id === question.correct_option)?.text}`
            : question.sample_answer;
          return (
            <article key={item.questionId} className="rounded-xl border border-error bg-bg-secondary p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><span className="text-xs font-bold uppercase tracking-wider text-error">Bài {question.bai}</span><h3 className="mt-1 font-bold">{question.question_vi}</h3></div>
                <span className="rounded-md bg-error-subtle px-2 py-1 text-xs font-bold text-error">{item.score}/100</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-xl bg-error-subtle p-3"><strong>Bạn trả lời:</strong><br />{item.userAnswer || 'Bỏ trống'}</p>
                <p className="rounded-xl bg-success-subtle p-3"><strong>Đáp án:</strong><br />{correct}</p>
              </div>
              <p className="mt-3 text-sm text-text-secondary">{question.explanation?.why_correct}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {question.related_glossary?.map((id) => {
                  const entry = ALL_GLOSSARY_ENTRIES.find((candidate) => candidate.id === id);
                  return entry ? <button key={id} onClick={() => onOpenEntry(entry)} className="rounded-md bg-bg-tertiary px-2 py-1 text-xs font-bold hover:bg-border">{entryTitle(entry)}</button> : null;
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function BookmarksPanel({ progress, onToggleBookmark, onOpenEntry, onSaveNote }) {
  const [baiFilter, setBaiFilter] = useState('all');
  const entries = progress.bookmarks
    .map((id) => ALL_GLOSSARY_ENTRIES.find((entry) => entry.id === id))
    .filter((entry) => entry && (baiFilter === 'all' || entry.bai === Number(baiFilter)));
  const openRelated = (id) => { const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (entry) onOpenEntry(entry); };
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-text-muted">{entries.length} mục đã đánh dấu</p>
        <select value={baiFilter} onChange={(event) => setBaiFilter(event.target.value)} className="rounded-xl border border-border-strong bg-bg-secondary px-3 py-2 text-sm">
          <option value="all">Tất cả bài</option>
          {LESSONS.map((bai) => <option key={bai} value={bai}>Bài {bai}</option>)}
        </select>
      </div>
      {!entries.length && <EmptyState icon="☆" title="Chưa có mục yêu thích" text="Bấm dấu sao trên từ vựng, ngữ pháp hoặc mẫu câu để lưu." />}
      <div className="space-y-3">
        {entries.map((entry) => {
          if (entry.type === 'word') return <WordCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
          if (entry.type === 'grammar') return <GrammarCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
          return <PhraseCard key={entry.id} entry={entry} onRelated={openRelated} bookmarks={progress.bookmarks} onToggleBookmark={onToggleBookmark} notes={progress.notes} onSaveNote={onSaveNote} />;
        })}
      </div>
    </div>
  );
}

function SRSReviewScreen({ progress, onRate, onUnsuspend }) {
  const dueEntries = useMemo(() => getDueEntries(progress.srs, ALL_GLOSSARY_ENTRIES), [progress.srs]);
  const suspendedEntries = useMemo(() => getSuspendedEntries(progress.srs, ALL_GLOSSARY_ENTRIES), [progress.srs]);
  const [phase, setPhase] = useState('intro');
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState([]);

  const start = () => { setDeck(shuffleArray(dueEntries)); setIndex(0); setFlipped(false); setRatings([]); setPhase('review'); };
  const rate = (rating) => {
    const entry = deck[index];
    onRate(entry.id, rating);
    const nextRatings = [...ratings, rating];
    setRatings(nextRatings);
    if (index >= deck.length - 1) setPhase('summary');
    else { setIndex((value) => value + 1); setFlipped(false); }
  };

  useEffect(() => {
    if (phase !== 'review' || !flipped) return undefined;
    const onKeyDown = (event) => {
      const rating = SRS_RATINGS[Number(event.key) - 1];
      if (!rating) return;
      event.preventDefault();
      rate(rating.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, flipped, index]);

  if (phase === 'intro') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-bg-secondary p-6 text-center shadow-sm">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-accent-subtle text-accent"><Icon.Refresh className="h-7 w-7" /></div>
          <h2 className="mt-4 h2-text font-bold">Cần ôn hôm nay: {dueEntries.length} mục</h2>
          <p className="mt-2 text-sm text-text-muted">{Object.keys(progress.srs).length} mục đang theo dõi (SM-2) · Tối đa {DEFAULT_DAILY_NEW_CARDS} thẻ mới/ngày (từ vựng, ngữ pháp & mẫu câu).</p>
          <button onClick={start} disabled={!dueEntries.length} className="btn-primary mt-6 w-full">Bắt đầu ôn</button>
        </div>
        {suspendedEntries.length > 0 && (
          <section className="rounded-xl border border-warning/40 bg-warning-subtle/50 p-4">
            <h3 className="text-sm font-bold text-text-primary">Thẻ khó đã tạm ẩn (Leech ≥ {LEECH_THRESHOLD} lần quên)</h3>
            <p className="mt-0.5 text-xs text-text-muted">Các mục quên nhiều lần được tạm dừng để tránh quá tải. Bạn có thể khôi phục khi sẵn sàng.</p>
            <div className="mt-3 space-y-2">
              {suspendedEntries.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg-secondary px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-hanzi font-semibold" lang="zh-Hans">{entryTitle(item)}</p>
                    <p className="truncate text-xs text-text-muted">{entryMeaning(item)}</p>
                  </div>
                  <button type="button" onClick={() => onUnsuspend?.(item.id)} className="btn-soft shrink-0 rounded-full px-3 py-1 text-xs">Khôi phục</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }
  if (phase === 'summary') {
    const remembered = ratings.filter((rating) => ['good', 'easy'].includes(rating)).length;
    const retry = ratings.length - remembered;
    return (
      <div className="rounded-xl border border-success bg-bg-secondary p-6 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-success-subtle h1-text">✓</div>
        <h2 className="mt-4 h2-text font-bold">Hoàn thành lượt ôn</h2>
        <p className="mt-2 text-text-muted">Đã ôn {ratings.length} mục, {remembered} mục nhớ tốt, {retry} mục cần ôn lại.</p>
        <button onClick={() => setPhase('intro')} className="btn-primary mt-6 w-full">Xem lịch ôn</button>
      </div>
    );
  }
  const entry = deck[index];
  const isWord = entry.type === 'word';
  const reps = entry.srs.repetitions ?? entry.srs.level ?? 0;
  const ease = Number(entry.srs.ease || 2.5).toFixed(2);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm font-bold text-text-muted"><span>Thẻ {index + 1}/{deck.length}</span><span className="tabular-nums">Lần {reps} · EF {ease} · {entry.srs.interval} ngày</span></div>
      <ProgressBar value={((index + 1) / deck.length) * 100} />
      <div role="button" tabIndex={0} onClick={() => setFlipped((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setFlipped((value) => !value); }} className="relative mt-4 flex min-h-80 flex-col items-center justify-center rounded-xl border border-border bg-bg-secondary p-7 text-center shadow-lg">
        <span className="absolute left-4 top-4 text-xs font-bold uppercase tracking-wider text-text-muted">{flipped ? 'Mặt nghĩa' : 'Mặt chữ'}</span>
        <SpeakButton text={isWord ? entry.word_zh : entry.examples?.[0]?.zh || entry.grammar_title_zh || entry.phrase_zh} className="absolute right-4 top-4" />
        {!flipped ? (
          <>
            <span className="display-text font-bold" lang="zh-Hans">{entryTitle(entry)}</span>
            {entry.pinyin && <span className="pinyin-text mt-4 text-xl font-bold text-accent-2" lang="zh-Latn">{entry.pinyin}</span>}
            <span className="mt-6 text-sm font-bold text-text-muted">Chạm để xem nghĩa</span>
          </>
        ) : (
          <>
            <span className="h2-text font-bold">{entryMeaning(entry)}</span>
            {isWord && (
              <>
                <span className="mt-2 text-text-muted">{entry.meaning_en}</span>
                <span className="mt-6 font-bold" lang="zh-Hans">{entry.example_zh}</span>
                <span className="pinyin-text mt-1 text-sm text-success" lang="zh-Latn">{entry.example_pinyin}</span>
                <span className="mt-1 text-sm text-text-muted">{entry.example_vi}</span>
              </>
            )}
            {!isWord && entry.structure && <span className="mt-5 rounded-xl border border-border bg-bg-tertiary px-4 py-3 font-mono text-sm font-bold text-success" lang="zh-Hans">{entry.structure}</span>}
            {!isWord && entry.examples?.[0]?.zh && (
              <>
                <span className="mt-5 font-bold" lang="zh-Hans">{entry.examples[0].zh}</span>
                <span className="pinyin-text mt-1 text-sm text-success" lang="zh-Latn">{entry.examples[0].pinyin}</span>
                <span className="mt-1 text-sm text-text-muted">{entry.examples[0].vi}</span>
              </>
            )}
          </>
        )}
      </div>
      {flipped && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SRS_RATINGS.map((rating) => (
            <button key={rating.id} onClick={() => rate(rating.id)} className={`rounded-lg px-3 py-3 font-bold transition hover:-translate-y-0.5 ${rating.tone}`}>
              <kbd className="mr-2 rounded border border-current/30 px-1.5 py-0.5 text-[10px] opacity-70">{rating.shortcut}</kbd>{rating.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesPanel({ progress, onSaveNote, onOpenEntry }) {
  const items = Object.entries(progress.notes || {})
    .map(([id, note]) => ({ entry: ALL_GLOSSARY_ENTRIES.find((candidate) => candidate.id === id), note }))
    .filter((item) => item.entry && item.note);
  if (!items.length) return <EmptyState icon="记" title="Chưa có ghi chú" text="Thêm ghi chú từ thẻ từ vựng, ngữ pháp hoặc mẫu câu." />;
  return (
    <div className="space-y-3">
      {items.map(({ entry, note }) => (
        <article key={entry.id} className="rounded-xl border border-warning bg-bg-secondary p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => onOpenEntry(entry)} className="min-w-0 flex-1 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-error">Bài {entry.bai} · {entry.type}</p>
              <h3 className="mt-1 text-xl font-bold">{entryTitle(entry)}</h3>
              <p className="mt-1 text-sm text-text-muted">{entryMeaning(entry)}</p>
            </button>
            <NoteEditor entryId={entry.id} note={note} onSave={onSaveNote} />
          </div>
          <p className="mt-4 rounded-xl bg-warning-subtle p-3 text-sm leading-relaxed">{note}</p>
        </article>
      ))}
    </div>
  );
}

function analyzeWeakTopics(progress) {
  const history = progress.wrongAnswersDetailed || [];
  const detailed = history.length
    ? history
    : progress.wrongAnswers.map((wrong) => {
      const question = ALL_QUESTIONS.find((item) => item.id === wrong.questionId);
      return question ? { questionId: question.id, bai: question.bai, type: question.type, related_glossary: question.related_glossary || [] } : null;
    }).filter(Boolean);
  const stats = { byBai: {}, byEntry: {}, byType: {}, byTag: {}, byQuestion: {} };
  for (const wrong of detailed) {
    const question = ALL_QUESTIONS.find((item) => item.id === wrong.questionId);
    const bai = wrong.bai || question?.bai;
    const type = wrong.type || question?.type;
    const related = wrong.related_glossary || question?.related_glossary || [];
    if (bai) stats.byBai[bai] = (stats.byBai[bai] || 0) + 1;
    if (type) stats.byType[type] = (stats.byType[type] || 0) + 1;
    if (wrong.questionId) stats.byQuestion[wrong.questionId] = (stats.byQuestion[wrong.questionId] || 0) + 1;
    for (const entryId of related) {
      stats.byEntry[entryId] = (stats.byEntry[entryId] || 0) + 1;
      const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === entryId);
      for (const tag of entry?.tags || []) stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
    }
  }
  return stats;
}

function WeakTopicsScreen({ progress, onPractice, onOpenEntry }) {
  const stats = useMemo(() => analyzeWeakTopics(progress), [progress]);
  const lessons = Object.entries(stats.byBai).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const entries = Object.entries(stats.byEntry).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => ({ entry: ALL_GLOSSARY_ENTRIES.find((item) => item.id === id), count })).filter((item) => item.entry);
  const types = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tags = Object.entries(stats.byTag).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const questionIds = Object.entries(stats.byQuestion).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (!lessons.length) return <EmptyState icon="析" title="Chưa có chủ đề yếu" text="Kết quả sẽ xuất hiện sau khi bạn luyện quiz." />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-error bg-error-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold">Lượt luyện theo điểm yếu</p>
          <p className="mt-1 text-sm text-text-secondary">Tạo từ {questionIds.length} câu từng trả lời chưa đúng.</p>
        </div>
        <button onClick={() => onPractice(questionIds.slice(0, 20))} disabled={!questionIds.length} className="btn-primary inline-flex items-center justify-center gap-2"><Icon.Target className="h-4 w-4" />Ôn chủ đề yếu</button>
      </div>
      <section>
        <h2 className="text-lg font-bold">Bài cần ôn lại</h2>
        <div className="mt-3 space-y-2">
          {lessons.map(([bai, count]) => {
            const attempts = Math.max(progress.baiProgress[bai]?.quizDone || 0, count);
            const percent = Math.min(100, Math.round((count / attempts) * 100));
            return <div key={bai} className="grid grid-cols-[60px_1fr_54px] items-center gap-3 rounded-xl bg-bg-secondary p-3"><span className="font-bold">Bài {bai}</span><ProgressBar value={percent} /><span className="text-right text-sm font-bold text-error">{percent}%</span></div>;
          })}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold">Từ vựng và ngữ pháp hay sai</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {entries.map(({ entry, count }) => (
            <button key={entry.id} onClick={() => onOpenEntry(entry)} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-secondary p-3 text-left">
              <span><span className="block font-bold">{entryTitle(entry)}</span><span className="mt-1 block text-xs text-text-muted">Bài {entry.bai} · {entryMeaning(entry)}</span></span>
              <span className="rounded-md bg-error-subtle px-2 py-1 text-xs font-bold text-error">{count}×</span>
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-5 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">Dạng câu hay sai</h2>
          <div className="mt-3 space-y-2">{types.map(([type, count]) => <div key={type} className="flex items-center justify-between rounded-xl bg-bg-secondary p-3 text-sm"><span className="font-bold">{TYPE_LABELS[type] || type}</span><span className="font-bold text-error">{count} lần</span></div>)}</div>
        </div>
        <div>
          <h2 className="text-lg font-bold">Tag cần củng cố</h2>
          <div className="mt-3 flex flex-wrap gap-2">{tags.map(([tag, count]) => <span key={tag} className="rounded-xl bg-warning-subtle px-3 py-2 text-sm font-bold text-warning">{tag.replaceAll('_', ' ')} · {count}</span>)}</div>
        </div>
      </section>
    </div>
  );
}

export default function ReviewScreen({ progress, onPracticeWrong, onStartCustomQuiz, onOpenEntry, onToggleBookmark, onSaveNote, onRateSrs, onUnsuspendSrs, onNavigate }) {
  const [tab, setTab] = useState('wrong');
  const learnedBais = progress.unlockedBai;
  const learnedEntries = learnedBais.flatMap((bai) => GLOSSARY[bai]?.entries || []);
  const grammar = learnedEntries.filter((entry) => entry.type === 'grammar');
  const dueSrs = getDueEntries(progress.srs, ALL_GLOSSARY_ENTRIES).length;
  const tabs = [
    { id: 'wrong', label: 'Câu sai', count: progress.wrongAnswers.length },
    { id: 'flashcards', label: 'Từ vựng' },
    { id: 'grammar', label: 'Ngữ pháp' },
    { id: 'bookmarks', label: 'Đánh dấu', count: progress.bookmarks.length },
    { id: 'srs', label: 'SRS', count: dueSrs },
    { id: 'notes', label: 'Ghi chú', count: Object.keys(progress.notes || {}).length },
    { id: 'weak', label: 'Điểm yếu' },
  ];

  const practiceUnlockedGrammar = () => {
    const qs = buildEntryPracticeQuestions(grammar, { limit: 15, types: ['grammar'] });
    if (qs.length) onStartCustomQuiz?.('Ôn đặt câu ngữ pháp', qs);
  };

  return (
    <div>
      <SectionHeading eyebrow="Ôn tập thông minh" title="Nội dung cần củng cố" />
      <p className="-mt-3 mb-5 flex items-center gap-2 text-sm text-text-muted">Ôn theo lịch nhớ SM-2, sổ câu sai và ghi chú của riêng bạn.</p>
      <div role="tablist" aria-label="Các mục ôn tập" className="tabs-container scrollbar-thin mb-6">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setTab(tabs[next].id);
              event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
            }}
            className={`tab ${tab === item.id ? 'active' : ''}`}
          >
            {item.label}{Number.isFinite(item.count) && <span className="tab-count">{item.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'wrong' && <WrongAnswerBook progress={progress} onPractice={onPracticeWrong} onOpenEntry={onOpenEntry} onNavigate={onNavigate} />}
      {tab === 'flashcards' && <FlashcardMode entries={learnedEntries} title="Từ vựng đã mở khóa" />}
      {tab === 'grammar' && (
        <div className="space-y-3">
          {grammar.length > 0 && onStartCustomQuiz && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm">
              <span className="text-text-secondary">Luyện viết câu trực tiếp cho {grammar.length} mẫu ngữ pháp đã mở khóa</span>
              <button type="button" onClick={practiceUnlockedGrammar} className="btn-primary rounded-full px-4 py-1.5 text-xs">Luyện đặt câu ngữ pháp</button>
            </div>
          )}
          {grammar.map((entry) => (
            <GrammarCard
              key={entry.id}
              entry={entry}
              onRelated={(id) => { const related = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (related) onOpenEntry(related); }}
              bookmarks={progress.bookmarks}
              onToggleBookmark={onToggleBookmark}
              notes={progress.notes}
              onSaveNote={onSaveNote}
            />
          ))}
        </div>
      )}
      {tab === 'bookmarks' && <BookmarksPanel progress={progress} onToggleBookmark={onToggleBookmark} onOpenEntry={onOpenEntry} onSaveNote={onSaveNote} />}
      {tab === 'srs' && <SRSReviewScreen progress={progress} onRate={onRateSrs} onUnsuspend={onUnsuspendSrs} />}
      {tab === 'notes' && <NotesPanel progress={progress} onSaveNote={onSaveNote} onOpenEntry={onOpenEntry} />}
      {tab === 'weak' && <WeakTopicsScreen progress={progress} onPractice={onPracticeWrong} onOpenEntry={onOpenEntry} />}
    </div>
  );
}
