import { useEffect, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import useDialogA11y from '../../lib/useDialogA11y.js';

const GRAMMAR_FIELDS = [
  ['grammar_title_zh', 'Tên tiếng Trung'], ['grammar_title_vi', 'Tên tiếng Việt'], ['structure', 'Cấu trúc'],
  ['explanation_vi', 'Giải thích tiếng Việt'], ['explanation_zh', 'Giải thích tiếng Trung'],
];

export default function ContentEditorModal({ item, onSave, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const grammar = item.type === 'grammar';
  const requestClose = () => { if (busy) return; if (JSON.stringify(draft) !== JSON.stringify(item)) setConfirmDiscard(true); else onClose(); };
  const dialogRef = useDialogA11y(!confirmDiscard, requestClose);
  useEffect(() => {
    const shortcut = (event) => {
      if (confirmDiscard) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); save(event); }
    };
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  });
  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (grammar && (!draft.grammar_title_zh?.trim() || !draft.explanation_vi?.trim())) { setError('Cần tên và giải thích ngữ pháp.'); return; }
    if (!grammar && (!draft.question_vi?.trim() || !Array.isArray(draft.options) || draft.options.length < 2 || draft.options.some((option) => !option.text?.trim()) || new Set(draft.options.map((option) => option.id)).size !== draft.options.length || !draft.options.some((option) => option.id === draft.correct_option))) { setError('Cần câu hỏi, ít nhất hai lựa chọn khác rỗng và một đáp án đúng.'); return; }
    setBusy(true); setError('');
    try { await onSave(draft); onClose(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <><div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={grammar ? 'Sửa ngữ pháp' : 'Sửa câu hỏi'} className="animate-modal-in max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-bg-secondary p-5 shadow-lg"><header className="flex items-center justify-between"><h2 className="font-serif text-lg font-semibold">{grammar ? 'Sửa ngữ pháp' : 'Sửa câu hỏi'}</h2><button type="button" onClick={requestClose} className="grid h-10 w-10 place-items-center rounded-lg text-text-muted hover:bg-bg-tertiary" aria-label="Đóng"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><form onSubmit={save} className="mt-4 space-y-3">
    {grammar ? <>{GRAMMAR_FIELDS.map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}{key.startsWith('explanation') ? <textarea className="input mt-1 w-full" value={draft[key] || ''} onChange={(event) => set(key, event.target.value)} /> : <input className="input mt-1 w-full" value={draft[key] || ''} onChange={(event) => set(key, event.target.value)} />}</label>)}<h3 className="font-semibold">Ví dụ</h3>{(draft.examples || []).map((example, index) => <div key={index} className="rounded-md border border-border p-2"><div className="flex justify-end"><button type="button" onClick={() => set('examples', draft.examples.filter((_, at) => at !== index))} className="text-xs text-error">Xóa ví dụ</button></div>{['zh', 'pinyin', 'vi'].map((key) => <input key={key} className="input mt-1 w-full" placeholder={key} value={example[key] || ''} onChange={(event) => set('examples', draft.examples.map((item, at) => at === index ? { ...item, [key]: event.target.value } : item))} />)}</div>)}<button type="button" onClick={() => set('examples', [...(draft.examples || []), { zh: '', pinyin: '', vi: '' }])} className="btn-secondary">Thêm ví dụ</button></>
      : <><label className="block text-sm font-medium">Loại<select className="input mt-1 w-full" value={draft.type} onChange={(event) => set('type', event.target.value)}>{['mcq_meaning_zh_to_vi', 'mcq_fill_blank', 'reading_comprehension', 'mcq_grammar', 'mcq_pinyin', 'mcq_word_type', 'mcq_error_detection', 'mcq_meaning_vi_to_zh'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="block text-sm font-medium">Mức độ<select className="input mt-1 w-full" value={draft.level} onChange={(event) => set('level', event.target.value)}>{['recall', 'understand', 'apply', 'synthesize'].map((level) => <option key={level}>{level}</option>)}</select></label><label className="block text-sm font-medium">Câu hỏi<textarea className="input mt-1 w-full" value={draft.question_vi || ''} onChange={(event) => set('question_vi', event.target.value)} /></label><h3 className="font-semibold">Đáp án</h3>{(draft.options || []).map((option, index) => <div key={option.id} className="flex items-center gap-2"><input type="radio" name="correct" checked={draft.correct_option === option.id} onChange={() => set('correct_option', option.id)} aria-label={`Đáp án ${option.id} đúng`} /><span className="w-5 text-sm">{option.id}</span><input className="input min-w-0 flex-1" value={option.text || ''} onChange={(event) => set('options', draft.options.map((value, at) => at === index ? { ...value, text: event.target.value } : value))} /><button type="button" disabled={draft.options.length <= 2} onClick={() => { const options = draft.options.filter((_, at) => at !== index); setDraft((previous) => ({ ...previous, options, correct_option: previous.correct_option === option.id ? options[0].id : previous.correct_option })); }} className="text-error">×</button></div>)}<button type="button" onClick={() => { const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((letter) => !draft.options.some((option) => option.id === letter)); if (id) set('options', [...draft.options, { id, text: '' }]); }} className="btn-secondary">Thêm đáp án</button><label className="block text-sm font-medium">Giải thích<textarea className="input mt-1 w-full" value={draft.explanation?.why_correct || ''} onChange={(event) => set('explanation', { ...(draft.explanation || {}), why_correct: event.target.value })} /></label></>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}<div className="flex justify-end gap-2 pt-3"><button type="button" onClick={requestClose} className="btn-secondary">Hủy</button><button disabled={busy} aria-busy={busy} className="btn-primary inline-flex min-w-24 items-center justify-center gap-2">{busy && <span className="spinner" aria-hidden="true"/>}{busy ? 'Đang lưu' : 'Lưu'}</button></div>
  </form></section></div>{confirmDiscard && <ConfirmDialog title="Thay đổi chưa lưu" message="Bỏ các thay đổi đang chỉnh sửa?" confirmLabel="Bỏ thay đổi" danger onConfirm={onClose} onCancel={() => setConfirmDiscard(false)} />}</>;
}
