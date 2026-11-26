import { useState } from 'react';
import { QUIZZES } from '../data-loader.js';
import { ProgressBar, SectionHeading, StatBox } from '../components/StudyUi.jsx';
import { gradeTyping } from '../lib/pedagogy.js';
import { LESSONS, questionIsMcq, shuffleArray } from '../lib/progressState.js';
import { McqOptions, QuestionPrompt } from './QuizScreen.jsx';

export default function ExamScreen({ onRecord }) {
  const [selectedBais, setSelectedBais] = useState([1]);
  const [count, setCount] = useState(20);
  const [phase, setPhase] = useState('setup');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [result, setResult] = useState(null);

  const toggleBai = (bai) => setSelectedBais((items) => items.includes(bai) ? items.filter((item) => item !== bai) : [...items, bai]);
  const start = () => {
    const pool = selectedBais.flatMap((bai) => QUIZZES[bai]?.questions || []);
    const selected = shuffleArray(pool).slice(0, Math.min(count, pool.length));
    if (!selected.length) return;
    setQuestions(selected);
    setAnswers({});
    setIndex(0);
    setDraft('');
    setStartedAt(Date.now());
    setResult(null);
    setPhase('active');
  };

  const saveAndMove = () => {
    const question = questions[index];
    if (!draft.trim()) return;
    const nextAnswers = { ...answers, [question.id]: draft };
    setAnswers(nextAnswers);
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      setDraft(nextAnswers[questions[index + 1].id] || '');
    } else {
      const details = questions.map((item) => {
        const answer = nextAnswers[item.id] || '';
        const grade = questionIsMcq(item)
          ? { score: answer === item.correct_option ? 100 : 0, level: answer === item.correct_option ? 'perfect' : 'wrong' }
          : gradeTyping(answer, item);
        const isCorrect = questionIsMcq(item) ? grade.score === 100 : grade.score >= 70;
        onRecord(item, answer, { ...grade, isCorrect }, 'exam');
        return { question: item, answer, score: grade.score, isCorrect };
      });
      setResult({ details, seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) });
      setPhase('result');
    }
  };

  if (phase === 'setup') {
    return (
      <div>
        <SectionHeading eyebrow="Thi thử" title="Tạo đề theo mục tiêu" />
        <div className="rounded-xl border border-border bg-bg-secondary p-5 shadow-sm">
          <p className="font-bold">Chọn bài</p>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {LESSONS.map((bai) => <button key={bai} onClick={() => toggleBai(bai)} className={`rounded-lg py-2 font-bold ${selectedBais.includes(bai) ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted'}`}>{bai}</button>)}
          </div>
          <div className="mt-5">
            <p className="font-bold">Số câu</p>
            <div className="mt-3 flex gap-2">{[20, 30, 50].map((value) => <button key={value} onClick={() => setCount(value)} className={`rounded-lg px-5 py-2 font-bold ${count === value ? 'bg-success text-white' : 'bg-bg-tertiary'}`}>{value}</button>)}</div>
          </div>
          <button onClick={start} disabled={!selectedBais.length} className="btn-primary mt-7 w-full">Bắt đầu thi</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const correct = result.details.filter((item) => item.isCorrect).length;
    return (
      <div>
        <SectionHeading eyebrow="Kết quả" title={`${correct}/${result.details.length} câu đạt`} action={<span className="rounded-xl bg-warning-subtle px-3 py-2 text-sm font-bold text-warning">{Math.floor(result.seconds / 60)}m {result.seconds % 60}s</span>} />
        <div className="mb-5 grid grid-cols-3 gap-2">
          <StatBox label="Điểm" value={`${Math.round((correct / result.details.length) * 100)}%`} tone="mint" />
          <StatBox label="Đúng" value={correct} tone="amber" />
          <StatBox label="Sai" value={result.details.length - correct} tone="rose" />
        </div>
        <div className="space-y-3">
          {result.details.map((item, itemIndex) => (
            <article key={item.question.id} className={`rounded-xl border bg-bg-secondary p-4 ${item.isCorrect ? 'border-success' : 'border-error'}`}>
              <p className="text-xs font-bold text-text-muted">Câu {itemIndex + 1} · Bài {item.question.bai}</p>
              <p className="mt-1 font-bold">{item.question.question_vi}</p>
              <p className="mt-2 text-sm"><strong>Trả lời:</strong> {item.answer}</p>
              <p className="mt-1 text-sm"><strong>Đáp án:</strong> {questionIsMcq(item.question) ? item.question.correct_option : item.question.sample_answer}</p>
              <p className="mt-2 text-sm text-text-muted">{item.question.explanation?.why_correct}</p>
            </article>
          ))}
        </div>
        <button onClick={() => setPhase('setup')} className="btn-primary mt-5 w-full">Tạo đề mới</button>
      </div>
    );
  }

  const question = questions[index];
  const isMcq = questionIsMcq(question);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4"><div className="mb-2 flex justify-between text-sm font-bold"><span>Đề thi</span><span>{index + 1}/{questions.length}</span></div><ProgressBar value={((index + 1) / questions.length) * 100} /></div>
      <section className="rounded-xl border border-border bg-bg-secondary p-5 shadow-lg sm:p-7">
        <QuestionPrompt question={question} />
        {isMcq ? (
          <McqOptions question={question} selected={draft} result={null} onSelect={setDraft} />
        ) : (
          <div className="mt-6">
            {question.hints?.length > 0 && (
              <details className="mb-3 rounded-xl border border-warning bg-warning-subtle p-3 text-sm">
                <summary className="cursor-pointer font-bold text-warning">Gợi ý</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">{question.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
              </details>
            )}
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="w-full rounded-xl border border-border-strong bg-bg-secondary px-4 py-3" placeholder={question.type === 'translation_zh_to_vi' ? 'Gõ câu tiếng Việt...' : 'Gõ chữ Hán...'} />
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button onClick={() => { if (index > 0) { const previous = index - 1; setAnswers((items) => ({ ...items, [question.id]: draft })); setIndex(previous); setDraft(answers[questions[previous].id] || ''); } }} disabled={index === 0} className="rounded-xl border border-border-strong bg-bg-secondary px-4 py-3 font-bold disabled:opacity-40">← Trước</button>
          <button onClick={saveAndMove} disabled={!draft.trim()} className="btn-primary flex-1 disabled:opacity-40">{index === questions.length - 1 ? 'Nộp bài' : 'Câu tiếp →'}</button>
        </div>
      </section>
    </div>
  );
}
