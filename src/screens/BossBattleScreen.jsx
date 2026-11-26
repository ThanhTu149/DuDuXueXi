import { useState } from 'react';
import { QUIZZES } from '../data-loader.js';
import { EmptyState, Icon, SectionHeading } from '../components/StudyUi.jsx';
import { gradeTyping } from '../lib/pedagogy.js';
import { LESSONS, XP_REWARDS, questionIsMcq, shuffleArray } from '../lib/progressState.js';
import { McqOptions, QuestionPrompt, TypingInput } from './QuizScreen.jsx';

export default function BossBattleScreen({ progress, onRecord, onWin }) {
  const eligibleBais = LESSONS.filter((bai) => progress.baiProgress[bai]?.completed);
  const poolBais = eligibleBais.length ? eligibleBais : LESSONS.slice(0, 1);
  const pickPool = () => shuffleArray(poolBais.flatMap((bai) => QUIZZES[bai]?.questions || []).filter((question) => ['apply', 'synthesize'].includes(question.level))).slice(0, 10);

  const [questions, setQuestions] = useState(pickPool);
  const [index, setIndex] = useState(0);
  const [bossHp, setBossHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [selected, setSelected] = useState('');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('active');
  const question = questions[index % Math.max(questions.length, 1)];

  const submit = (answer, grade) => {
    const isCorrect = questionIsMcq(question) ? grade.score === 100 : grade.score >= 70;
    setResult({ ...grade, isCorrect });
    if (isCorrect) setBossHp((hp) => Math.max(0, hp - 10));
    else setPlayerHp((hp) => Math.max(0, hp - 15));
    onRecord(question, answer, { ...grade, isCorrect }, 'boss');
  };
  const next = () => {
    if (bossHp <= 0) { setStatus('won'); onWin(); return; }
    if (playerHp <= 0) { setStatus('lost'); return; }
    if (index === questions.length - 1) setQuestions((items) => shuffleArray(items));
    setIndex((value) => (value + 1) % questions.length);
    setSelected(''); setInput(''); setResult(null);
  };
  const reset = () => { setQuestions(pickPool()); setIndex(0); setBossHp(100); setPlayerHp(100); setSelected(''); setInput(''); setResult(null); setStatus('active'); };

  if (status !== 'active') {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className={`mx-auto grid h-24 w-24 place-items-center rounded-lg ${status === 'won' ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`}>
          {status === 'won' ? <Icon.Trophy className="h-10 w-10" /> : <Icon.Refresh className="h-10 w-10" />}
        </div>
        <h1 className="mt-5 h1-text font-bold">{status === 'won' ? 'Chiến thắng!' : 'Thử lại nhé'}</h1>
        <p className="mt-2 text-text-muted">{status === 'won' ? `Bạn nhận ${XP_REWARDS.boss} XP và một huy hiệu mới.` : 'Ôn lại câu sai rồi quay lại sẽ hiệu quả hơn.'}</p>
        <button onClick={reset} className="btn-primary mt-6 w-full">Đấu lại</button>
      </div>
    );
  }
  if (!question) return <EmptyState icon="♛" title="Chưa có câu Boss" text="Hoàn thành thêm bài để mở câu hỏi tổng hợp." />;
  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeading eyebrow="Boss Battle" title="Thử thách tổng hợp" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-xs font-bold"><span>Người học</span><span>{playerHp} HP</span></div>
          <div role="progressbar" aria-label="Sinh lực người học" aria-valuemin={0} aria-valuemax={100} aria-valuenow={playerHp} className="h-3 overflow-hidden rounded-full bg-border">
            <div className="h-full origin-left bg-success transition-transform duration-300" style={{ transform: `scaleX(${playerHp / 100})` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs font-bold"><span>Boss</span><span>{bossHp} HP</span></div>
          <div role="progressbar" aria-label="Sinh lực Boss" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bossHp} className="h-3 overflow-hidden rounded-full bg-border">
            <div className="h-full origin-left bg-error transition-transform duration-300" style={{ transform: `scaleX(${bossHp / 100})` }} />
          </div>
        </div>
      </div>
      <section className="rounded-xl border border-border bg-bg-secondary p-5 shadow-lg sm:p-7">
        <QuestionPrompt question={question} />
        {questionIsMcq(question)
          ? <McqOptions question={question} selected={selected} result={result} onSelect={(option) => { setSelected(option); submit(option, { score: option === question.correct_option ? 100 : 0, level: option === question.correct_option ? 'perfect' : 'wrong' }); }} />
          : <TypingInput question={question} value={input} onChange={setInput} onCheck={() => submit(input, gradeTyping(input, question))} result={result} />}
        {result && (
          <div className={`mt-5 rounded-xl p-4 ${result.isCorrect ? 'bg-success-subtle' : 'bg-error-subtle'}`}>
            <p className="font-bold">{result.isCorrect ? 'Đòn đánh chính xác: Boss -10 HP' : 'Boss phản công: bạn -15 HP'}</p>
            <p className="mt-2 text-sm">{question.explanation?.why_correct}</p>
            <button onClick={next} className="btn-primary mt-4 w-full">Tiếp tục</button>
          </div>
        )}
      </section>
    </div>
  );
}
