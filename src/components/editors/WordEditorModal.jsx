import { useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog.jsx';
import useDialogA11y from '../../lib/useDialogA11y.js';

const FIELDS = [
  { key: 'word_zh', label: 'Chữ Hán', required: true },
  { key: 'pinyin', label: 'Pinyin', required: true },
  { key: 'word_type', label: 'Từ loại' },
  { key: 'meaning_vi', label: 'Nghĩa tiếng Việt', required: true },
  { key: 'meaning_en', label: 'Nghĩa tiếng Anh' },
  { key: 'example_zh', label: 'Ví dụ (chữ Hán)' },
  { key: 'example_pinyin', label: 'Ví dụ (pinyin)' },
  { key: 'example_vi', label: 'Ví dụ (tiếng Việt)' },
];
const WORD_TYPES = ['名', '动', '形', '副', '助', '介', '连', '代', '量', '数', '叹', '动、名'];

export default function WordEditorModal({ entry, note = '', onSave, onClose }) {
  const initial = useMemo(() => ({
    ...Object.fromEntries(FIELDS.map(({ key }) => [key, entry[key] || ''])),
    note,
  }), [entry, note]);
  const [draft, setDraft] = useState(initial);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  const dialogRef = useDialogA11y(!confirmDiscard, requestClose);

  const save = async () => {
    if (saving) return;
    if (!draft.word_zh.trim() || !draft.pinyin.trim() || !draft.meaning_vi.trim()) {
      setError('Cần điền chữ Hán, pinyin và nghĩa tiếng Việt.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onClose();
    } catch (failure) {
      setError(failure.message || 'Không lưu được từ vựng.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (confirmDiscard) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        save();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });

  return <>
    <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="word-editor-title" className="animate-modal-in flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-lg">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="word-editor-title" className="font-serif text-lg font-semibold">Sửa từ vựng</h2>
          <button type="button" onClick={requestClose} aria-label="Đóng" className="grid h-10 w-10 place-items-center rounded-xl text-text-muted hover:bg-bg-tertiary"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); save(); }} className="overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(({ key, label, required }) => <label key={key} className={key.startsWith('example_') ? 'sm:col-span-2' : ''}>
              <span className="mb-1 block text-sm font-medium">{label}{required ? ' *' : ''}</span>
              {key === 'word_type'
                ? <select className="input w-full" value={draft.word_type} onChange={(event) => setDraft((value) => ({ ...value, word_type: event.target.value }))}>{['', ...new Set([entry.word_type, ...WORD_TYPES].filter(Boolean))].map((type) => <option key={type} value={type}>{type || 'Chưa xác định'}</option>)}</select>
                : <input autoFocus={key === 'word_zh'} required={required} className="input w-full" value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} />}
            </label>)}
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Ghi chú của tôi</span><textarea className="input w-full" rows={3} value={draft.note} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} /></label>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
          <div className="sticky bottom-0 mt-5 flex justify-end gap-2 bg-bg-secondary py-2"><button type="button" onClick={requestClose} className="btn-secondary">Hủy</button><button type="submit" disabled={saving} aria-busy={saving} className="btn-primary inline-flex min-w-32 items-center justify-center gap-2">{saving && <span className="spinner" aria-hidden="true"/>}{saving ? 'Đang lưu' : 'Lưu thay đổi'}</button></div>
        </form>
      </section>
    </div>
    {confirmDiscard && <ConfirmDialog title="Có thay đổi chưa lưu" message="Bạn muốn hủy các thay đổi trong từ vựng này?" confirmLabel="Hủy bỏ thay đổi" danger onConfirm={onClose} onCancel={() => setConfirmDiscard(false)} />}
  </>;
}
