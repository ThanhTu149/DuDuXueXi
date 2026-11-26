import { useEffect, useRef, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES } from '../data-loader.js';
import { Confetti, Icon, StatBox, VirtualKeyboard } from '../components/StudyUi.jsx';
import { gradeTyping } from '../lib/pedagogy.js';
import { questionIsMcq } from '../lib/progressState.js';
import { TYPE_LABELS, entryTitle } from '../lib/studyHelpers.js';
import { sounds } from '../lib/theme.js';

export function QuestionPrompt({ question }) {
  if (!question) return null;
  const sourceVi = question.source_sentence_vi || question.sentence_vi || question.prompt_sentence_vi;
  const sourceZh = question.source_sentence_zh || question.sentence_zh || question.prompt_sentence_zh;
  const promptError = question.type === 'translation_vi_to_zh' && !sourceVi ? 'Câu hỏi này đang thiếu câu nguồn tiếng Việt.'
    : question.type === 'translation_zh_to_vi' && !sourceZh ? 'Câu hỏi này đang thiếu câu nguồn tiếng Trung.'
      : question.type === 'typing_zh_from_pinyin' && (!question.pinyin || !question.meaning_vi) ? 'Câu hỏi này đang thiếu pinyin hoặc nghĩa tiếng Việt.'
        : question.type === 'sentence_reorder' && !question.shuffled_parts?.length ? 'Câu hỏi này đang thiếu các phần câu cần sắp xếp.' : '';
  return (
    <div className="mb-6 text-center">
      <p className="mb-3 text-sm font-bold uppercase tracking-widest text-text-muted">{TYPE_LABELS[question.type] || question.type}</p>
      <p className="text-2xl font-bold text-text-primary">{question.question_vi || question.question_zh}</p>
      {sourceVi && (
        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-accent/30 bg-accent-subtle px-5 py-4" aria-label="Câu tiếng Việt cần dịch">
          <p className="text-lg font-semibold leading-8 text-text-primary">{sourceVi}</p>
        </div>
      )}
      {sourceZh && (
        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-accent-2/30 bg-accent-2-subtle px-5 py-4" aria-label="Câu tiếng Trung cần dịch">
          <p className="font-hanzi text-xl font-semibold leading-8 text-text-primary">{sourceZh}</p>
          {question.source_sentence_pinyin && <p className="pinyin-text mt-2 text-sm text-text-muted">{question.source_sentence_pinyin}</p>}
        </div>
      )}
      {question.type === 'typing_zh_from_pinyin' && (
        <div className="mx-auto mt-5 grid max-w-xl gap-3 rounded-xl border border-border bg-bg-tertiary p-4 text-left sm:grid-cols-2">
          <p><span className="block text-xs font-bold uppercase tracking-wider text-text-muted">Pinyin</span><span className="pinyin-text mt-1 block text-lg font-semibold text-accent">{question.pinyin || 'Chưa có dữ liệu'}</span></p>
          <p><span className="block text-xs font-bold uppercase tracking-wider text-text-muted">Nghĩa tiếng Việt</span><span className="mt-1 block font-semibold">{question.meaning_vi || 'Chưa có dữ liệu'}</span></p>
        </div>
      )}
      {question.type === 'sentence_reorder' && (
        <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Các phần câu cần sắp xếp">
          {(question.shuffled_parts || []).map((part, index) => <span key={`${part}-${index}`} className="rounded-md border border-border-strong bg-bg-secondary px-3 py-2 font-hanzi text-lg font-semibold shadow-xs">{part}</span>)}
        </div>
      )}
      {promptError && <p role="alert" className="mx-auto mt-5 max-w-2xl rounded-xl border border-error bg-error-subtle p-4 text-sm font-semibold text-error">{promptError} Hãy sửa câu hỏi trước khi tiếp tục.</p>}
    </div>
  );
}

export function McqOptions({ question, selected, result, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {question.options?.map((opt) => {
        const isSelected = selected === opt.id;
        const isCorrectOption = opt.id === question.correct_option;

        let stateClass = 'border-border bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary';
        let animClass = '';
        if (result) {
          if (isCorrectOption) { stateClass = 'border-success bg-success-subtle text-success '; animClass = 'animate-correct-pulse'; }
          else if (isSelected) { stateClass = 'border-error bg-error-subtle text-error '; animClass = 'animate-shake'; }
          else stateClass = 'border-border bg-bg-secondary opacity-50';
        } else if (isSelected) {
          stateClass = 'border-accent bg-accent-subtle text-accent';
        }

        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            disabled={!!result}
            className={`flex items-center gap-3 rounded-xl border p-4 text-left font-bold transition ${stateClass} ${animClass}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border font-bold ${result ? (isCorrectOption ? 'border-success bg-success text-white' : isSelected ? 'border-error bg-error text-white' : 'border-border bg-bg-tertiary') : (isSelected ? 'border-accent bg-accent text-white dark:border-white' : 'border-border bg-bg-tertiary')}`}>
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TypingInput({ question, value, onChange, onCheck, result }) {
  const textareaRef = useRef(null);
  const useKeyboard = ['translation_vi_to_zh', 'typing_zh_from_pinyin'].includes(question.type);
  const placeholder = question.type === 'translation_zh_to_vi' ? 'Gõ câu tiếng Việt...' : question.type === 'sentence_reorder' ? 'Gõ câu theo đúng thứ tự...' : 'Gõ chữ Hán...';
  const promptMissing = question.type === 'translation_vi_to_zh' ? !(question.source_sentence_vi || question.sentence_vi || question.prompt_sentence_vi)
    : question.type === 'translation_zh_to_vi' ? !(question.source_sentence_zh || question.sentence_zh || question.prompt_sentence_zh)
      : question.type === 'typing_zh_from_pinyin' ? !question.pinyin || !question.meaning_vi
        : question.type === 'sentence_reorder' ? !question.shuffled_parts?.length : false;
  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!!result}
        placeholder={placeholder}
        className={`w-full min-h-[120px] resize-none rounded-xl border p-4 font-bold outline-none transition ${result ? (result.isCorrect ? 'border-success bg-success-subtle text-success' : 'border-error bg-error-subtle text-error') : 'border-border bg-bg-secondary focus:border-accent focus:ring-2 focus:ring-accent-subtle'}`}
      />
      {!result && useKeyboard && <VirtualKeyboard textareaRef={textareaRef} value={value} onChange={onChange} />}
      {!result && (
        <button onClick={onCheck} disabled={!value.trim() || promptMissing} className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40">Kiểm tra</button>
      )}
    </div>
  );
}

export function FeedbackPanel({ question, result, onNext, onOpenEntry, onEditQuestion, nextLabel, xpGained }) {
  const isCorrect = result.isCorrect;
  const explanation = typeof question.explanation === 'string' ? question.explanation : question.explanation?.why_correct;
  const [showXp, setShowXp] = useState(false);
  useEffect(() => {
    if (xpGained && isCorrect) {
      setShowXp(true);
      const t = setTimeout(() => setShowXp(false), 1000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [xpGained, isCorrect]);
  return (
    <div className={`animate-fade-slide mt-6 rounded-xl border p-5 ${isCorrect ? 'border-success bg-success-subtle' : 'border-error bg-error-subtle'}`}>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">{isCorrect ? '🐼' : '🐧'}</span>
            <h3 role="status" aria-live="polite" className={`text-xl font-bold ${isCorrect ? 'text-success' : 'text-error'}`}>
              {isCorrect ? 'Chính xác!' : 'Chưa chính xác'}
              {!questionIsMcq(question) && <span className="ml-2 text-base">· {result.score}/100</span>}
            </h3>
            {showXp && xpGained && (
              <span className="relative inline-block" aria-hidden="true">
                <span className="animate-xp-float absolute -top-1 left-0 text-sm font-bold text-warning">+{xpGained} XP</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {isCorrect ? 'Trúc: Làm tốt lắm, giữ nhịp này nhé!' : 'Băng: Không sao, xem lại một chút rồi mình làm tiếp.'}
          </p>

          {!isCorrect && (
            <div className="mt-3">
              {!questionIsMcq(question) && result.orderIssue && (
                <p className="mb-1.5 text-xs font-semibold text-warning">Lưu ý: Trật tự từ chưa đúng cấu trúc câu.</p>
              )}
              {!questionIsMcq(question) && result.missingKeywords?.length > 0 && (
                <p className="mb-2 text-xs text-text-secondary">
                  <strong>Ý chính còn thiếu:</strong> {result.missingKeywords.join(' · ')}
                </p>
              )}
              <p className="text-sm font-bold text-text-muted">Đáp án đúng:</p>
              <p className="mt-1 text-lg font-bold text-text-primary" lang={question.type === 'translation_zh_to_vi' ? undefined : 'zh-Hans'}>
                {question.options?.find((o) => o.id === question.correct_option)?.text || question.sample_answer}
              </p>
            </div>
          )}

          {explanation && <p className="mt-3 text-sm font-medium text-text-primary">{explanation}</p>}
          {(question.explanation?.keyword_tip || question.explanation?.common_mistakes?.length || question.explanation?.why_others_wrong || question.related_glossary?.length) && (
            <details className="mt-3 text-sm text-text-secondary">
              <summary className="cursor-pointer font-semibold text-accent">Xem giải thích chi tiết</summary>
              {question.explanation?.keyword_tip && <p className="mt-2"><strong>Ghi nhớ:</strong> {question.explanation.keyword_tip}</p>}
              {question.explanation?.common_mistakes?.map((mistake, index) => <p key={index} className="mt-1">{mistake}</p>)}
              {Object.entries(question.explanation?.why_others_wrong || {}).map(([option, reason]) => <p key={option} className="mt-1">{option}: {reason}</p>)}
              {question.related_glossary?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.related_glossary.map((id) => {
                    const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id);
                    return entry ? <button key={id} onClick={() => onOpenEntry?.(entry)} className="rounded-md bg-bg-secondary px-2 py-1 text-xs font-bold text-accent">{entryTitle(entry)}</button> : null;
                  })}
                </div>
              )}
            </details>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {onEditQuestion && !String(question.id || '').startsWith('gen-') && (
            <button onClick={() => onEditQuestion(question)} className="btn-secondary">Sửa câu hỏi</button>
          )}
          <button onClick={onNext} className={`rounded-xl px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 active:translate-y-0 ${isCorrect ? 'bg-success hover:bg-success/90' : 'bg-error hover:bg-error/90'}`}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuizScreen({ session, progress, onAnswer, onFinish, onExit, onOpenEntry, onEditQuestion, onPracticeWrong }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState([]);

  const questions = session.questions;
  const question = questions[index];
  const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;
  const combo = Number(progress.correctStreak) || 0;

  const submit = (answer, grading) => {
    const isCorrect = questionIsMcq(question) ? grading.score === 100 : grading.score >= 70;
    const finalResult = { ...grading, isCorrect };
    if (isCorrect) sounds.correct();
    else sounds.wrong();
    setResult(finalResult);
    setSummary((prev) => [...prev, finalResult]);
    onAnswer(question, answer, finalResult, session.kind);
  };

  const selectMcq = (optionId) => {
    if (result) return;
    setSelected(optionId);
    submit(optionId, { score: optionId === question.correct_option ? 100 : 0, level: optionId === question.correct_option ? 'perfect' : 'wrong' });
  };

  const checkTyping = () => submit(userInput, gradeTyping(userInput, question));
  const next = () => {
    if (index === questions.length - 1) {
      onFinish(summary, session);
      setIndex(questions.length);
      return;
    }
    setIndex((value) => value + 1);
    setSelected('');
    setUserInput('');
    setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (result) next();
          else if (userInput.trim()) checkTyping();
        }
        return;
      }
      if (['1', '2', '3', '4'].includes(e.key) && !result && questionIsMcq(question)) {
        e.preventDefault();
        const optId = ['A', 'B', 'C', 'D'][+e.key - 1];
        if (question.options?.find((o) => o.id === optId)) selectMcq(optId);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (result) next();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, result, userInput, question]);

  if (index >= questions.length) {
    const correct = summary.filter((item) => item.isCorrect).length;
    const average = summary.length ? Math.round(summary.reduce((sum, item) => sum + item.score, 0) / summary.length) : 0;
    const wrongIds = summary.flatMap((item, itemIndex) => item.isCorrect ? [] : [questions[itemIndex]?.id]).filter(Boolean);
    const isPerfect = correct === questions.length;
    const isGood = correct / questions.length >= 0.7;
    const retry = () => { setIndex(0); setSelected(''); setUserInput(''); setResult(null); setSummary([]); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    return (
      <div className="mx-auto max-w-xl text-center">
        {(isPerfect || isGood) && <Confetti />}
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-xl text-5xl ${isPerfect ? 'bg-warning-subtle' : isGood ? 'bg-success-subtle' : 'bg-error-subtle'}`}>
          {isPerfect ? <Icon.Trophy className="h-9 w-9 text-warning" /> : isGood ? <Icon.Check className="h-9 w-9 text-success" /> : <Icon.Book className="h-9 w-9 text-error" />}
        </div>
        <h1 className="mt-5 h1-text font-bold">{isPerfect ? 'Hoàn hảo!' : isGood ? 'Làm tốt lắm!' : 'Tiếp tục cố lên!'}</h1>
        <p className="mt-2 text-text-muted">{correct}/{questions.length} câu đạt · điểm trung bình {average}</p>
        <p className="mt-1 text-sm text-text-secondary">
          {isPerfect ? 'Trúc tự hào về bạn lắm!' : isGood ? 'Trúc: Giỏi, giữ đà này nhé!' : 'Băng: Không sao, ôn lại rồi thử lần nữa nhé!'}
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          <StatBox label="Đạt" value={correct} tone="mint" />
          <StatBox label="Cần ôn" value={questions.length - correct} tone="rose" />
          <StatBox label="TB điểm" value={average} tone="amber" />
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button onClick={onExit} className="btn-primary flex-1">Về lộ trình</button>
          <button onClick={retry} className="btn-secondary flex-1">Làm lại lượt này</button>
          {wrongIds.length > 0 && onPracticeWrong && <button onClick={() => onPracticeWrong(wrongIds)} className="btn-secondary flex-1">Luyện {wrongIds.length} câu sai</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onExit} className="icon-action grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-strong bg-bg-secondary text-text-muted" aria-label="Thoát quiz" data-tooltip="Thoát quiz"><Icon.X /></button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-text-muted">
            <span>{session.label ? `${session.label} · ` : ''}Câu {index + 1}/{questions.length}</span>
            <div className="flex items-center gap-2">
              {combo >= 2 && <span className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-bold text-warning"><Icon.Flame className="h-3 w-3" />Chuỗi {combo}</span>}
              <span className="tabular">{accuracy}% chính xác</span>
            </div>
          </div>
          <div className="flex gap-1" role="progressbar" aria-label={`Tiến độ câu ${index + 1} trên ${questions.length}`} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + (result ? 1 : 0)}>
            {questions.map((item, itemIndex) => <span key={item.id || itemIndex} className={`h-1.5 flex-1 rounded-full transition-colors ${itemIndex < index || (itemIndex === index && result) ? 'bg-accent' : itemIndex === index ? 'bg-accent-subtle' : 'bg-bg-tertiary'}`} />)}
          </div>
        </div>
      </div>
      <section className="card">
        <QuestionPrompt question={question} />
        {questionIsMcq(question) ? (
          <McqOptions question={question} selected={selected} result={result} onSelect={selectMcq} />
        ) : (
          <TypingInput question={question} value={userInput} onChange={setUserInput} onCheck={checkTyping} result={result} />
        )}
        {result && <FeedbackPanel question={question} result={result} userAnswer={questionIsMcq(question) ? selected : userInput} onNext={next} onOpenEntry={onOpenEntry} onEditQuestion={onEditQuestion} nextLabel={index === questions.length - 1 ? 'Xem kết quả' : 'Tiếp'} />}
      </section>
      <p className="mt-4 hidden text-center text-xs text-text-muted sm:block">
        {questionIsMcq(question)
          ? <>Phím tắt: <kbd className="rounded border border-border bg-bg-secondary px-1.5 py-0.5 font-bold">1</kbd>–<kbd className="rounded border border-border bg-bg-secondary px-1.5 py-0.5 font-bold">4</kbd> chọn đáp án</>
          : <>Nhấn <kbd className="rounded border border-border bg-bg-secondary px-1.5 py-0.5 font-bold">Enter</kbd> để kiểm tra</>}
        {result && <> · <kbd className="rounded border border-border bg-bg-secondary px-1.5 py-0.5 font-bold">Enter</kbd> cho câu tiếp theo</>}
      </p>
    </div>
  );
}
