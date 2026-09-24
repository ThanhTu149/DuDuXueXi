import { useEffect, useState } from 'react';
import { getCourse, getRawDocument, saveRawDocument } from '../lib/db.js';
import { commitChapters } from '../lib/contentProcessor.js';
import WordEditorModal from '../components/editors/WordEditorModal.jsx';
import ContentEditorModal from '../components/editors/ContentEditorModal.jsx';
import TypingEditorModal from '../components/editors/TypingEditorModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function ReviewGeneratedScreen({ courseId, onBack, onCommitted, onRetry }) {
  const [course, setCourse] = useState(null);
  const [document, setDocument] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { let live = true; getCourse(courseId).then(async (item) => { if (!live) return; setCourse(item); const doc = await getRawDocument(item.rawDocumentId); if (live) { setDocument(doc); setChapters(item.status === 'ready' || item.type === 'built-in' ? item.chapters || [] : doc?.draftChapters || item.chapters || []); setDirty(false); } }).catch((cause) => { if (live) setError(cause.message); }); return () => { live = false; }; }, [courseId]);
  useEffect(() => { if (!dirty) return undefined; const warn = (event) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const updateChapter = (index, changes) => { setDirty(true); setChapters((items) => items.map((item, at) => at === index ? { ...item, ...changes } : item)); };
  const removeEntry = (chapterIndex, field, id) => { setDirty(true); setChapters((items) => items.map((item, at) => at !== chapterIndex ? item : { ...item, [field]: { ...item[field], [field === 'glossary' ? 'entries' : 'questions']: item[field][field === 'glossary' ? 'entries' : 'questions'].filter((entry) => entry.id !== id) } })); };
  const saveDraft = async () => { if (document && course.status !== 'ready') await saveRawDocument({ ...document, draftChapters: chapters }); else await commitChapters(courseId, chapters); setDirty(false); };
  const bulk = (mode) => {
    const ids = new Set(selected);
    setChapters((items) => items.map((chapter) => Object.fromEntries(Object.entries(chapter).map(([key, value]) => {
      if (key !== 'glossary' && key !== 'quiz') return [key, value];
      const listKey = key === 'glossary' ? 'entries' : 'questions';
      const list = value[listKey].flatMap((entry) => {
        if (!ids.has(entry.id)) return [entry];
        if (mode === 'delete') return [];
        if (mode === 'duplicate') return [entry, { ...structuredClone(entry), id: `${entry.id}-copy-${crypto.randomUUID().slice(0, 6)}` }];
        return [{ ...entry, note: 'Cần sửa' }];
      });
      return [key, { ...value, [listKey]: list }];
    }))));
    setDirty(true); setSelected([]); setConfirm(null);
  };
  const saveItem = async (value) => {
    const { chapterIndex, field, id } = editing;
    setChapters((items) => items.map((chapter, at) => at !== chapterIndex ? chapter : { ...chapter, [field]: { ...chapter[field], [field === 'glossary' ? 'entries' : 'questions']: chapter[field][field === 'glossary' ? 'entries' : 'questions'].map((item) => item.id === id ? { ...item, ...value, id, ...(field === 'glossary' ? { note: value.note ?? item.note } : {}) } : item) } }));
    setDirty(true);
  };
  const commit = async () => { setBusy(true); setError(''); try { await commitChapters(courseId, chapters); if (document && course.status !== 'ready') await saveRawDocument({ ...document, draftChapters: chapters }); setDirty(false); onCommitted(courseId); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const failures = Object.values(document?.generated || {}).filter((item) => item.error);
  return <div className="space-y-5"><button onClick={() => dirty ? setConfirm({ type: 'leave' }) : onBack()} className="text-sm text-accent">← Thư viện</button><header><p className="text-xs font-semibold uppercase text-accent">{course?.name || 'Khóa học'}</p><h1 className="mt-1 font-serif text-2xl font-semibold">Duyệt nội dung</h1><p className="mt-2 text-sm text-text-secondary">Kiểm tra nội dung Gemini tạo trước khi lưu thành bài học.</p></header>
    {error && <p role="alert" className="rounded-lg bg-error-subtle p-3 text-sm text-error">{error}</p>}
    <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-bg-secondary p-4 text-sm"><span>{chapters.length} chương</span><span>{chapters.reduce((sum, chapter) => sum + chapter.glossary.entries.length, 0)} mục từ/ngữ pháp</span><span>{chapters.reduce((sum, chapter) => sum + chapter.quiz.questions.length, 0)} câu hỏi</span>{failures.length > 0 && <button onClick={onRetry} className="text-error hover:underline">{failures.length} đoạn lỗi · thử lại</button>}</div>
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm"><strong>{selected.length} mục đã chọn</strong><button onClick={() => bulk('duplicate')} className="text-accent hover:underline">Nhân bản</button><button onClick={() => bulk('flag')} className="text-accent hover:underline">Đánh dấu cần sửa</button><button onClick={() => setConfirm({ type: 'bulk-delete' })} className="text-error hover:underline">Xóa</button><button onClick={() => setSelected([])} className="text-text-muted hover:text-text-primary">Bỏ chọn</button></div>}
    <div className="space-y-3">{chapters.map((chapter, index) => <details key={chapter.id} className="rounded-lg border border-border bg-bg-secondary p-4"><summary className="cursor-pointer font-semibold">Bài {index + 1}: {chapter.title_zh} · {chapter.title_vi} <span className="text-xs font-normal text-text-muted">({chapter.glossary.entries.length} mục · {chapter.quiz.questions.length} câu)</span></summary><div className="mt-4 space-y-4"><label className="block text-sm font-medium">Tên bài tiếng Việt<input className="input mt-1 w-full" value={chapter.title_vi} onChange={(event) => updateChapter(index, { title_vi: event.target.value })} /></label><label className="block text-sm font-medium">Tóm tắt<textarea className="input mt-1 w-full" rows={3} value={chapter.summary_vi} onChange={(event) => updateChapter(index, { summary_vi: event.target.value })} /></label>
      <section><h3 className="font-semibold">Từ vựng và ngữ pháp</h3><div className="mt-2 space-y-1">{chapter.glossary.entries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm"><label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(entry.id)} onChange={() => setSelected((items) => items.includes(entry.id) ? items.filter((id) => id !== entry.id) : [...items, entry.id])} /><span>{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh} · {entry.meaning_vi || entry.grammar_title_vi}</span></label><span className="flex gap-3">{entry.type !== 'phrase' && <button onClick={() => setEditing({ chapterIndex: index, field: 'glossary', id: entry.id, item: entry })} className="text-accent hover:underline">Sửa</button>}<button onClick={() => setConfirm({ type: 'entry-delete', chapterIndex: index, field: 'glossary', id: entry.id })} className="text-error hover:underline">Xóa</button></span></div>)}</div></section>
      <section><h3 className="font-semibold">Quiz</h3><div className="mt-2 space-y-1">{chapter.quiz.questions.map((question) => <div key={question.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm"><label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selected.includes(question.id)} onChange={() => setSelected((items) => items.includes(question.id) ? items.filter((id) => id !== question.id) : [...items, question.id])} /><span>{question.question_vi}</span></label><span className="flex gap-3"><button onClick={() => setEditing({ chapterIndex: index, field: 'quiz', id: question.id, item: question })} className="text-accent hover:underline">Sửa</button><button onClick={() => setConfirm({ type: 'entry-delete', chapterIndex: index, field: 'quiz', id: question.id })} className="text-error hover:underline">Xóa</button></span></div>)}</div></section><button onClick={() => setConfirm({ type: 'chapter-delete', chapterIndex: index })} className="text-sm text-error">Xóa chương này</button></div></details>)}</div>
    <div className="flex gap-2"><button onClick={() => { saveDraft().catch((cause) => setError(cause.message)); }} className="btn-secondary">Lưu bản nháp</button><button disabled={busy || !chapters.length} onClick={commit} className="btn-primary">Lưu vào khóa học</button></div>
    {editing?.item.type === 'word' && <WordEditorModal entry={editing.item} note={editing.item.note || ''} onSave={saveItem} onClose={() => setEditing(null)} />}
    {editing && editing.item.type !== 'word' && (editing.item.type !== 'grammar' && !Array.isArray(editing.item.options) ? <TypingEditorModal item={editing.item} onSave={saveItem} onClose={() => setEditing(null)} /> : <ContentEditorModal item={editing.item} onSave={saveItem} onClose={() => setEditing(null)} />)}
    {confirm && <ConfirmDialog title={confirm.type === 'leave' ? 'Thay đổi chưa lưu' : confirm.type === 'chapter-delete' ? 'Xóa chương' : 'Xóa nội dung'} message={confirm.type === 'leave' ? 'Rời màn hình và bỏ các thay đổi chưa lưu?' : confirm.type === 'bulk-delete' ? `Xóa ${selected.length} mục đã chọn?` : 'Nội dung đã xóa sẽ không còn trong bài học sau khi lưu.'} confirmLabel={confirm.type === 'leave' ? 'Rời màn hình' : 'Xóa'} danger onConfirm={() => { if (confirm.type === 'leave') onBack(); else if (confirm.type === 'bulk-delete') bulk('delete'); else if (confirm.type === 'entry-delete') removeEntry(confirm.chapterIndex, confirm.field, confirm.id); else if (confirm.type === 'chapter-delete') { setDirty(true); setChapters((items) => items.filter((_, at) => at !== confirm.chapterIndex)); } setConfirm(null); }} onCancel={() => setConfirm(null)} />}
  </div>;
}
