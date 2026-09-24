import { useEffect, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import useDialogA11y from '../../lib/useDialogA11y.js';

const FIELDS = [
  ['question_vi', 'Câu hỏi tiếng Việt'], ['source_sentence_vi', 'Câu nguồn tiếng Việt'],
  ['source_sentence_zh', 'Câu nguồn tiếng Trung'], ['source_sentence_pinyin', 'Pinyin câu nguồn'],
  ['pinyin', 'Pinyin từ gợi ý'], ['meaning_vi', 'Nghĩa gợi ý'],
  ['sample_answer', 'Đáp án mẫu'], ['sample_answer_pinyin', 'Pinyin đáp án mẫu'],
];

export default function TypingEditorModal({ item, onSave, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(item));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const requiredFields = new Set(['question_vi', 'sample_answer', ...(draft.type === 'translation_vi_to_zh' ? ['source_sentence_vi'] : []), ...(draft.type === 'translation_zh_to_vi' ? ['source_sentence_zh'] : []), ...(draft.type === 'typing_zh_from_pinyin' ? ['pinyin', 'meaning_vi'] : [])]);
  const update = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const requestClose = () => { if (busy) return; if (JSON.stringify(draft) !== JSON.stringify(item)) setDiscard(true); else onClose(); };
  const dialogRef = useDialogA11y(!discard, requestClose);
  const save = async (event) => {
    event.preventDefault();
    if (!draft.question_vi?.trim() || !draft.sample_answer?.trim()) { setError('Cần câu hỏi và đáp án mẫu.'); return; }
    if (draft.type === 'translation_vi_to_zh' && !draft.source_sentence_vi?.trim()) { setError('Cần câu nguồn tiếng Việt để người học dịch.'); return; }
    if (draft.type === 'translation_zh_to_vi' && !draft.source_sentence_zh?.trim()) { setError('Cần câu nguồn tiếng Trung để người học dịch.'); return; }
    if (draft.type === 'typing_zh_from_pinyin' && (!draft.pinyin?.trim() || !draft.meaning_vi?.trim())) { setError('Cần pinyin và nghĩa tiếng Việt.'); return; }
    if (draft.type === 'sentence_reorder' && !(draft.shuffled_parts || []).some((part) => String(part).trim())) { setError('Cần các phần câu để sắp xếp.'); return; }
    if (draft.keywords_required?.some((keyword) => !String(keyword.zh || keyword.vi || '').trim())) { setError('Từ khóa bắt buộc không được để trống.'); return; }
    setBusy(true); setError('');
    try {
      const clean = (items) => (items || []).map((part) => String(part).trim()).filter(Boolean);
      await onSave({ ...draft, alternative_answers: clean(draft.alternative_answers), hints: clean(draft.hints), shuffled_parts: draft.shuffled_parts ? clean(draft.shuffled_parts) : draft.shuffled_parts, explanation: { ...(draft.explanation || {}), common_mistakes: clean(draft.explanation?.common_mistakes) } });
      onClose();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  useEffect(() => {
    const keydown = (event) => {
      if (discard) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); save(event); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  });
  const keywordLanguage = item.type === 'translation_zh_to_vi' ? 'vi' : 'zh';
  return <><div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Sửa câu gõ" className="animate-modal-in max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-bg-secondary p-5 shadow-lg"><header className="flex items-center justify-between"><div><h2 className="font-serif text-lg font-semibold">Sửa câu gõ</h2><p className="text-xs text-text-muted">{item.type}</p></div><button type="button" onClick={requestClose} className="grid h-10 w-10 place-items-center rounded-xl text-text-muted hover:bg-bg-tertiary" aria-label="Đóng"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><form onSubmit={save} className="mt-4 space-y-3">
    <label className="block text-sm">Mức độ<select className="input mt-1 w-full" value={draft.level} onChange={(event) => update('level', event.target.value)}>{['recall', 'understand', 'apply', 'synthesize'].map((level) => <option key={level}>{level}</option>)}</select></label>
    {FIELDS.filter(([key]) => draft[key] !== undefined || requiredFields.has(key)).map(([key, label]) => <label key={key} className="block text-sm">{label}{requiredFields.has(key) ? ' *' : ''}<textarea className="input mt-1 w-full" rows={key === 'question_vi' ? 2 : 1} value={draft[key] || ''} onChange={(event) => update(key, event.target.value)} /></label>)}
    {draft.shuffled_parts && <label className="block text-sm">Các phần để sắp xếp (mỗi dòng một phần)<textarea className="input mt-1 w-full" rows={4} value={draft.shuffled_parts.join('\n')} onChange={(event) => update('shuffled_parts', event.target.value.split('\n'))} /></label>}
    <label className="block text-sm">Đáp án khác (mỗi dòng một câu)<textarea className="input mt-1 w-full" rows={3} value={(draft.alternative_answers || []).join('\n')} onChange={(event) => update('alternative_answers', event.target.value.split('\n'))} /></label>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Từ khóa bắt buộc</legend>{(draft.keywords_required || []).map((keyword, index) => <div key={index} className="flex gap-2"><input className="input min-w-0 flex-1" aria-label={`Từ khóa ${index + 1}`} value={keyword[keywordLanguage] || ''} onChange={(event) => update('keywords_required', draft.keywords_required.map((item, at) => at === index ? { ...item, [keywordLanguage]: event.target.value } : item))} /><button type="button" onClick={() => update('keywords_required', draft.keywords_required.filter((_, at) => at !== index))} className="text-error">Xóa</button></div>)}<button type="button" onClick={() => update('keywords_required', [...(draft.keywords_required || []), { [keywordLanguage]: '' }])} className="btn-secondary">Thêm từ khóa</button></fieldset>
    <label className="block text-sm">Gợi ý (mỗi dòng một gợi ý)<textarea className="input mt-1 w-full" rows={3} value={(draft.hints || []).join('\n')} onChange={(event) => update('hints', event.target.value.split('\n'))} /></label>
    <label className="block text-sm">Vì sao đúng<textarea className="input mt-1 w-full" rows={3} value={draft.explanation?.why_correct || ''} onChange={(event) => update('explanation', { ...(draft.explanation || {}), why_correct: event.target.value })} /></label>
    <label className="block text-sm">Lỗi thường gặp (mỗi dòng một lỗi)<textarea className="input mt-1 w-full" rows={3} value={(draft.explanation?.common_mistakes || []).join('\n')} onChange={(event) => update('explanation', { ...(draft.explanation || {}), common_mistakes: event.target.value.split('\n') })} /></label>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={requestClose} className="btn-secondary">Hủy</button><button disabled={busy} aria-busy={busy} className="btn-primary inline-flex min-w-24 items-center justify-center gap-2">{busy && <span className="spinner" aria-hidden="true"/>}{busy ? 'Đang lưu' : 'Lưu'}</button></div>
  </form></section></div>{discard && <ConfirmDialog title="Thay đổi chưa lưu" message="Bỏ các thay đổi đang chỉnh sửa?" confirmLabel="Bỏ thay đổi" danger onConfirm={onClose} onCancel={() => setDiscard(false)} />}</>;
}
