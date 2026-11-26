import { useEffect, useRef, useState } from 'react';
import { GLOSSARY } from '../data-loader.js';
import {
  ClickableHanzi,
  Confetti,
  EmptyState,
  Icon,
  Mascot,
  ProgressBar,
  SpeakButton,
  StatBox,
  VirtualKeyboard,
} from '../components/StudyUi.jsx';
import { calculateSimilarity, gradeDictation } from '../lib/pedagogy.js';
import { LESSONS, shuffleArray } from '../lib/progressState.js';
import { getDictationSentences, getSentencesByBai, speak } from '../lib/studyHelpers.js';
import { sounds } from '../lib/theme.js';

export function MatchingGame() {
  const [bai, setBai] = useState(1);
  const [pairs, setPairs] = useState([]);
  const [selectedZh, setSelectedZh] = useState(null);
  const [selectedVi, setSelectedVi] = useState(null);
  const [matched, setMatched] = useState([]);
  const [misses, setMisses] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zhCards, setZhCards] = useState([]);
  const [viCards, setViCards] = useState([]);

  useEffect(() => {
    if (isPlaying && matched.length < pairs.length) {
      const interval = setInterval(() => setTime(Date.now() - startTime), 100);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isPlaying, matched.length, pairs.length, startTime]);

  const start = () => {
    const entries = (GLOSSARY[bai]?.entries || []).filter((e) => e.type === 'word' || e.type === 'phrase');
    if (!entries.length) return;
    const selectedPairs = shuffleArray(entries).slice(0, 8).map((e) => ({
      id: e.id,
      zh: e.word_zh || e.phrase_zh,
      vi: e.meaning_vi,
    }));
    setPairs(selectedPairs);
    setZhCards(shuffleArray([...selectedPairs]));
    setViCards(shuffleArray([...selectedPairs]));
    setMatched([]);
    setMisses(0);
    setSelectedZh(null);
    setSelectedVi(null);
    setStartTime(Date.now());
    setTime(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (selectedZh && selectedVi) {
      if (selectedZh.id === selectedVi.id) {
        sounds.correct();
        setMatched((prev) => [...prev, selectedZh.id]);
        setSelectedZh(null);
        setSelectedVi(null);
      } else {
        sounds.wrong();
        setMisses((prev) => prev + 1);
        setTimeout(() => {
          setSelectedZh(null);
          setSelectedVi(null);
        }, 500);
      }
    }
  }, [selectedZh, selectedVi]);

  if (!isPlaying) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="flex items-center justify-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-subtle text-accent"><Icon.Gamepad className="h-5 w-5" /></span><h1 className="h1-text font-bold">Ghép từ</h1></div>
        <p className="mt-2 text-text-muted">Nối chữ Hán và nghĩa tiếng Việt tương ứng — nhanh và ít lỗi để điểm cao.</p>
        <section className="mt-6 rounded-xl border border-border bg-bg-secondary p-6 shadow-sm">
          <div className="flex items-center gap-3 rounded-xl bg-bg-tertiary p-3 text-left"><Mascot type="panda" size="sm" /><div><p className="text-sm font-semibold">Trúc gợi ý</p><p className="text-xs text-text-muted">8 cặp mỗi lượt · mỗi lỗi sai trừ 50 điểm · chạm 2 thẻ để ghép.</p></div></div>
          <label className="mt-5 block text-left text-sm font-bold">Chọn bài để chơi
            <select value={bai} onChange={(e) => setBai(Number(e.target.value))} className="input mt-2 w-full">
              {LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}
            </select>
          </label>
          <button onClick={start} className="btn-primary mt-5 w-full py-3">Bắt đầu chơi</button>
        </section>
      </div>
    );
  }

  if (matched.length === pairs.length && pairs.length > 0) {
    const seconds = (time / 1000).toFixed(1);
    const score = Math.max(0, 1000 - (seconds * 10) - (misses * 50));
    return (
      <div className="mx-auto max-w-xl animate-fade-slide text-center">
        <Confetti />
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-xl bg-success-subtle text-success"><Icon.Trophy className="h-9 w-9" /></div>
        <h1 className="mt-5 h1-text font-bold">Hoàn thành xuất sắc!</h1>
        <div className="mt-6 grid grid-cols-3 gap-2">
          <StatBox label="Thời gian" value={`${seconds}s`} tone="sky" />
          <StatBox label="Lỗi sai" value={misses} tone="rose" />
          <StatBox label="Điểm" value={Math.round(score)} tone="amber" />
        </div>
        <button onClick={() => setIsPlaying(false)} className="btn-primary mt-6 w-full">Chơi lại</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-slide">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="h2-text font-bold">Bài {bai}</h2>
        <div className="flex gap-4">
          <span className="inline-flex items-center gap-2 font-mono text-xl font-bold"><Icon.Clock className="h-5 w-5" />{(time / 1000).toFixed(1)}s</span>
          <span className="inline-flex items-center gap-2 text-xl font-bold text-error"><Icon.X className="h-5 w-5" />{misses}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-8">
        <div className="grid gap-3">
          {zhCards.map((card) => {
            const isMatched = matched.includes(card.id);
            const isSelected = selectedZh?.id === card.id;
            const isWrong = isSelected && selectedVi && selectedZh.id !== selectedVi.id;
            if (isMatched) return <div key={card.id} className="h-16 opacity-0" />;
            return (
              <button
                key={card.id}
                onClick={() => setSelectedZh(card)}
                className={`h-16 rounded-xl border-2 text-xl font-bold transition ${isSelected ? (isWrong ? 'animate-shake border-error bg-error-subtle text-error' : 'border-accent-2 bg-accent-2-subtle text-accent-2') : 'border-border bg-bg-secondary hover:border-border-strong'}`}
              >{card.zh}</button>
            );
          })}
        </div>
        <div className="grid gap-3">
          {viCards.map((card) => {
            const isMatched = matched.includes(card.id);
            const isSelected = selectedVi?.id === card.id;
            const isWrong = isSelected && selectedZh && selectedZh.id !== selectedVi.id;
            if (isMatched) return <div key={card.id} className="h-16 opacity-0" />;
            return (
              <button
                key={card.id}
                onClick={() => setSelectedVi(card)}
                className={`h-16 rounded-xl border-2 text-sm font-bold transition ${isSelected ? (isWrong ? 'animate-shake border-error bg-error-subtle text-error' : 'border-success bg-success-subtle text-success') : 'border-border bg-bg-secondary hover:border-border-strong'}`}
              >{card.vi}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DictationScreen({ onComplete }) {
  const [bai, setBai] = useState(1);
  const [count, setCount] = useState(10);
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [replays, setReplays] = useState(0);
  const [scores, setScores] = useState([]);
  const [passedCount, setPassedCount] = useState(0);
  const textareaRef = useRef(null);
  const start = () => { setDeck(shuffleArray(getDictationSentences(bai)).slice(0, count)); setIndex(0); setAnswer(''); setResult(null); setReplays(0); setScores([]); setPassedCount(0); };
  const current = deck[index];
  const play = () => { if (current && replays < 3) { speak(current.zh); setReplays((value) => value + 1); } };
  const check = () => {
    const graded = gradeDictation(answer, current.zh);
    setResult(graded);
    setScores((items) => [...items, graded.score]);
    if (graded.isCorrect) setPassedCount((c) => c + 1);
  };
  const next = () => {
    if (index >= deck.length - 1) { onComplete?.(scores); setIndex(deck.length); return; }
    setIndex((value) => value + 1); setAnswer(''); setResult(null); setReplays(0);
  };
  if (!deck.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-2">Luyện nâng cao</p>
        <div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-2-subtle text-accent-2"><Icon.Headphones className="h-5 w-5" /></span><h1 className="h1-text font-bold">Luyện chính tả</h1></div>
        <p className="mt-2 text-text-muted">Nghe câu tiếng Trung rồi gõ lại chính xác.</p>
        <section className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">Bài<select value={bai} onChange={(event) => setBai(Number(event.target.value))} className="input mt-2 w-full">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select></label>
            <label className="text-sm font-bold">Số câu<select value={count} onChange={(event) => setCount(Number(event.target.value))} className="input mt-2 w-full">{[5, 10, 20].map((number) => <option key={number} value={number}>{number} câu</option>)}</select></label>
          </div>
          <p className="mt-4 text-sm text-text-muted">Bài {bai} có {getDictationSentences(bai).length} câu phù hợp.</p>
          <button onClick={start} className="btn-primary mt-5 w-full">Bắt đầu nghe</button>
        </section>
      </div>
    );
  }
  if (index >= deck.length) {
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-success bg-bg-secondary p-8 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-success-subtle text-success"><Icon.Headphones className="h-7 w-7" /></div>
        <h1 className="mt-4 h1-text font-bold">Hoàn thành chính tả</h1>
        <p className="mt-2 text-text-muted">Điểm trung bình {average}/100 · {passedCount}/{scores.length} câu đạt</p>
        <button onClick={() => setDeck([])} className="btn-primary mt-6 w-full">Luyện lượt mới</button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-accent-2">Chính tả · Bài {bai}</p><h1 className="mt-1 h2-text font-bold">Câu {index + 1}/{deck.length}</h1></div>
        <span className="rounded-xl bg-warning-subtle px-3 py-2 text-sm font-bold text-warning">Lượt nghe {replays}/3</span>
      </div>
      <ProgressBar value={((index + 1) / deck.length) * 100} label="Tiến độ luyện chính tả" />
      <section className="mt-5 rounded-xl border border-border bg-bg-secondary p-5 shadow-lg sm:p-7">
        <div className="text-center">
          <button onClick={play} disabled={replays >= 3} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-error text-white shadow-lg transition hover:scale-105 disabled:opacity-40" aria-label="Phát câu chính tả"><Icon.Volume className="h-8 w-8" /></button>
          <p className="mt-3 text-sm text-text-muted">Có thể nghe tối đa 3 lần</p>
        </div>
        <textarea ref={textareaRef} lang="zh-Hans" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={Boolean(result)} rows={3} placeholder="Gõ câu chữ Hán bạn nghe được..." className="input mt-6 w-full text-lg" />
        {!result && <VirtualKeyboard textareaRef={textareaRef} value={answer} onChange={setAnswer} />}
        {!result ? <button onClick={check} disabled={!answer.trim()} className="btn-primary mt-4 w-full disabled:opacity-40">Kiểm tra</button> : (
          <div className={`mt-5 rounded-xl border p-4 ${result.isCorrect ? 'border-success bg-success-subtle' : 'border-error bg-error-subtle'}`}>
            <p className="text-xl font-bold">{result.isCorrect ? '✓ Nghe chuẩn' : 'Cần nghe lại'} · {result.score}/100</p>
            {result.diff?.length > 0 && (
              <p className="mt-2 font-hanzi text-lg leading-8" lang="zh-Hans">
                {result.diff.map((d, i) => d.status === 'match'
                  ? <span key={i}>{d.char}</span>
                  : d.status === 'wrong'
                    ? <span key={i} className="rounded bg-error-subtle px-0.5 text-error underline decoration-error decoration-wavy" title={`Đúng là: ${d.expected}`}>{d.char}</span>
                    : d.status === 'missing'
                      ? <span key={i} className="rounded bg-warning-subtle px-0.5 text-warning underline decoration-dashed" title="Thiếu ký tự">[{d.expected}]</span>
                      : <span key={i} className="rounded bg-error-subtle px-0.5 text-error line-through" title="Dư ký tự">{d.char}</span>)}
              </p>
            )}
            <p className="mt-3 font-hanzi text-lg font-bold" lang="zh-Hans">{current.zh}</p>
            <p className="pinyin-text mt-1 text-sm text-success" lang="zh-Latn">{current.pinyin}</p>
            <p className="mt-1 text-sm text-text-muted">{current.vi}</p>
            <button onClick={next} className="btn-primary mt-4 w-full">{index === deck.length - 1 ? 'Xem kết quả' : 'Câu tiếp →'}</button>
          </div>
        )}
      </section>
    </div>
  );
}

export function PronunciationScreen({ onAttempt }) {
  const [bai, setBai] = useState(1);
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const recognitionRef = useRef(null);
  const entries = (GLOSSARY[bai]?.entries || []).filter((entry) => entry.type === 'word' && entry.word_zh);
  const entry = entries.length ? entries[index % entries.length] : null;
  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => () => recognitionRef.current?.abort(), []);
  if (!entry) return <EmptyState icon="🎤" title="Chưa có từ vựng để luyện phát âm" text="Hãy chọn bài khác hoặc thêm từ vựng vào khóa học này." />;
  const record = () => {
    if (!supported || listening) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setFeedback(null); };
    recognition.onresult = (event) => { const transcript = event.results[0][0].transcript; const score = calculateSimilarity(entry.word_zh, transcript); setFeedback({ transcript, score }); onAttempt?.(score); };
    recognition.onerror = (event) => setFeedback({ transcript: '', score: 0, error: event.error === 'not-allowed' ? 'Micro đang bị chặn. Hãy cấp quyền rồi thử lại.' : 'Không nhận được giọng nói. Hãy thử lại ở nơi yên tĩnh.' });
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition; recognition.start();
  };
  const next = () => { setIndex((value) => (value + 1) % entries.length); setFeedback(null); };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-accent-2">Luyện nâng cao</p><div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-2-subtle text-accent-2"><Icon.Mic className="h-5 w-5" /></span><h1 className="h1-text font-bold">Luyện phát âm</h1></div></div>
        <select value={bai} onChange={(event) => { setBai(Number(event.target.value)); setIndex(0); setFeedback(null); }} className="input">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select>
      </div>
      {!supported && <div role="alert" className="mt-5 rounded-xl border border-warning bg-warning-subtle p-4 font-semibold text-warning">Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy mở app bằng Chrome hoặc Edge.</div>}
      <section className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 text-center shadow-lg sm:p-8">
        <p className="font-hanzi text-6xl font-bold" lang="zh-Hans">{entry.word_zh}</p>
        <p className="pinyin-text mt-3 text-xl font-bold text-accent-2" lang="zh-Latn">{entry.pinyin}</p>
        <p className="mt-2 text-text-muted">{entry.meaning_vi}</p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <SpeakButton text={entry.word_zh} className="h-12 w-12 text-xl" />
          <button onClick={record} disabled={!supported || listening} className={`grid h-20 w-20 place-items-center rounded-full text-white shadow-lg transition ${listening ? 'animate-pulse bg-error ring-8 ring-error-subtle' : 'bg-error hover:scale-105'} disabled:opacity-40`} aria-label="Bắt đầu ghi âm"><Icon.Mic className="h-8 w-8" /></button>
        </div>
        <p className="mt-3 text-sm font-bold text-text-muted">{listening ? 'Đang nghe... hãy nói rõ từ trên' : 'Bấm micro rồi đọc từ trên'}</p>
        {feedback && (
          <div className={`mt-6 rounded-xl p-4 text-left ${feedback.score >= 80 ? 'bg-success-subtle' : feedback.score >= 50 ? 'bg-warning-subtle' : 'bg-error-subtle'}`}>
            <div className="flex items-center justify-between gap-3"><p className="min-w-0 font-bold">Bạn nói: {feedback.transcript || 'Không nhận diện được'}</p><span className="shrink-0 text-xl font-bold">{feedback.score}/100</span></div>
            {feedback.error && <p className="mt-2 text-sm text-error">{feedback.error}</p>}
            <div className="mt-4 flex gap-2"><button onClick={record} className="btn-secondary flex-1">Thử lại</button><button onClick={next} className="btn-primary flex-1">Tiếp →</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function SentenceChineseLine({ sentence, entries, onCharacter }) {
  const terms = entries.filter((entry) => entry.type === 'word' && entry.word_zh && sentence.includes(entry.word_zh)).sort((a, b) => b.word_zh.length - a.word_zh.length);
  const nodes = [];
  let cursor = 0;
  while (cursor < sentence.length) {
    const match = terms.find((entry) => sentence.startsWith(entry.word_zh, cursor));
    if (match) {
      nodes.push(
        <span key={`${cursor}-${match.id}`} className="rounded bg-warning-subtle px-0.5 font-bold underline decoration-warning/60 decoration-2 underline-offset-4">
          <ClickableHanzi text={match.word_zh} entry={match} onCharacter={onCharacter} />
        </span>,
      );
      cursor += match.word_zh.length;
    } else {
      nodes.push(<span key={cursor}>{sentence[cursor]}</span>);
      cursor += 1;
    }
  }
  return nodes;
}

export function SentenceMiningScreen({ bookmarks, notes, onCharacter, onStartPlaylist }) {
  const [bai, setBai] = useState(1);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showVi, setShowVi] = useState(true);
  const [filter, setFilter] = useState('all');
  const entries = GLOSSARY[bai]?.entries || [];
  const sentences = getSentencesByBai(bai).filter((sentence) => filter === 'all' || (filter === 'bookmarks' ? bookmarks.includes(sentence.source) : Boolean(notes[sentence.source])));
  const playlist = sentences.map((sentence) => ({ text: sentence.zh, label: sentence.zh, sublabel: sentence.vi }));
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent-2">Luyện nâng cao</p>
          <div className="mt-1 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-2-subtle text-accent-2"><Icon.Type className="h-5 w-5" /></span><h1 className="h1-text font-bold">Câu ví dụ</h1></div>
          <p className="mt-2 text-text-muted">Đọc theo ngữ cảnh và nghe liên tục theo bài.</p>
        </div>
        <button onClick={() => onStartPlaylist(playlist)} disabled={!playlist.length} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Icon.Volume className="h-4 w-4" />Đọc toàn bộ</button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <select value={bai} onChange={(event) => setBai(Number(event.target.value))} className="input py-2 font-bold">{LESSONS.map((lesson) => <option key={lesson} value={lesson}>Bài {lesson}</option>)}</select>
        <button onClick={() => setShowPinyin((value) => !value)} className={`filter-btn ${showPinyin ? 'active' : ''}`}>Pinyin</button>
        <button onClick={() => setShowVi((value) => !value)} className={`filter-btn ${showVi ? 'active' : ''}`}>Tiếng Việt</button>
        {[['all', 'Tất cả'], ['bookmarks', 'Đã đánh dấu'], ['notes', 'Có ghi chú']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`filter-btn ${filter === id ? 'active' : ''}`}>{label}</button>)}
      </div>
      <div className="mt-5 space-y-3">
        {sentences.map((sentence, index) => (
          <article key={`${sentence.source}-${index}`} className="rounded-xl border border-border bg-bg-secondary p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <p className="font-hanzi flex-1 text-xl font-semibold leading-9" lang="zh-Hans"><SentenceChineseLine sentence={sentence.zh} entries={entries} onCharacter={onCharacter} /></p>
              <SpeakButton text={sentence.zh} />
            </div>
            {showPinyin && sentence.pinyin && <p className="pinyin-text mt-2 text-sm text-success" lang="zh-Latn">{sentence.pinyin}</p>}
            {showVi && sentence.vi && <p className="mt-1 text-sm text-accent-2">{sentence.vi}</p>}
          </article>
        ))}
      </div>
      {!sentences.length && <EmptyState icon="文" title="Không có câu phù hợp" text="Đổi bộ lọc hoặc chọn bài khác để tiếp tục." />}
    </div>
  );
}
