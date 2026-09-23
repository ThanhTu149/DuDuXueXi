const fs = require('fs');
let content = fs.readFileSync('./src/App.jsx', 'utf-8');

const newComponents = `
const questionIsMcq = (q) => !TYPING_TYPES.has(q.type);

function QuestionPrompt({ question }) {
  if (!question) return null;
  return (
    <div className="mb-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">{question.type}</p>
      {question.source_sentence_zh && (
        <p className="text-xl font-bold mb-2">{question.source_sentence_zh}</p>
      )}
      <p className="text-2xl font-bold text-text-primary">{question.question_vi || question.question_zh}</p>
    </div>
  );
}

function McqOptions({ question, selected, result, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {question.options?.map(opt => {
        const isSelected = selected === opt.id;
        const isCorrectOption = opt.id === question.correct_option;
        
        let stateClass = "border-border bg-bg-secondary hover:border-border-strong hover:bg-bg-tertiary";
        if (result) {
          if (isCorrectOption) stateClass = "border-success bg-success-subtle text-success dark:bg-success-subtle dark:text-success";
          else if (isSelected) stateClass = "border-error bg-error-subtle text-error dark:bg-error-subtle dark:text-error";
          else stateClass = "border-border bg-bg-secondary opacity-50";
        } else if (isSelected) {
          stateClass = "border-accent bg-accent-subtle text-accent dark:bg-accent dark:border-accent dark:text-white";
        }

        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            disabled={!!result}
            className={\`flex items-center gap-3 rounded-xl border p-4 text-left font-bold transition \${stateClass}\`}
          >
            <span className={\`grid h-8 w-8 shrink-0 place-items-center rounded-lg border font-bold \${result ? (isCorrectOption ? 'border-success bg-success text-white' : isSelected ? 'border-error bg-error text-white' : 'border-border bg-bg-tertiary') : (isSelected ? 'border-accent bg-accent text-white dark:border-white' : 'border-border bg-bg-tertiary')}\`}>
              {opt.id}
            </span>
            <span>{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypingInput({ question, value, onChange, onCheck, result }) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!!result}
        placeholder="Nhập câu trả lời của bạn..."
        className={\`w-full min-h-[120px] resize-none rounded-xl border p-4 font-bold outline-none transition \${result ? (result.isCorrect ? 'border-success bg-success-subtle text-success' : 'border-error bg-error-subtle text-error') : 'border-border bg-bg-secondary focus:border-accent focus:ring-2 focus:ring-accent-subtle'}\`}
      />
      {!result && (
        <button onClick={onCheck} className="btn-primary mt-4 w-full">Kiểm tra</button>
      )}
    </div>
  );
}

function FeedbackPanel({ question, result, userAnswer, onNext, onOpenEntry, nextLabel }) {
  const isCorrect = result.isCorrect;
  return (
    <div className={\`mt-6 rounded-xl border p-5 \${isCorrect ? 'border-success bg-success-subtle' : 'border-error bg-error-subtle'}\`}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h3 className={\`text-xl font-bold flex items-center gap-2 \${isCorrect ? 'text-success' : 'text-error'}\`}>
            {isCorrect ? 'Chính xác!' : 'Chưa chính xác'}
          </h3>
          
          {!isCorrect && (
            <div className="mt-3">
              <p className="text-sm font-bold text-text-muted">Đáp án đúng:</p>
              <p className="text-lg font-bold text-text-primary mt-1">
                {question.options?.find(o => o.id === question.correct_option)?.text || question.sample_answer}
              </p>
            </div>
          )}
          
          {question.explanation && (
            <p className="mt-3 text-sm font-medium text-text-primary">{question.explanation}</p>
          )}
        </div>
        
        <button onClick={onNext} className={\`w-full sm:w-auto shrink-0 rounded-lg px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 \${isCorrect ? 'bg-success' : 'bg-error'}\`}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
`;

content = content.replace(/function QuizScreen/s, newComponents + '\nfunction QuizScreen');

fs.writeFileSync('./src/App.jsx', content, 'utf-8');
