import { useEffect, useState } from 'react';
import { BUILT_IN_COURSE_ID, deleteCourse, getAllCourses, getCourse, getSettings, saveCourse } from '../lib/db.js';
import { exportCourse, importCourse, mergeCourses, previewCourseBackup } from '../lib/courseBackup.js';
import { publishCourseToCommunity } from '../lib/apiClient.js';
import { syncCourseDeleteToCloud, syncCourseToCloud } from '../lib/cloudSync.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { getProcessingJob } from '../lib/processingJobs.js';
import useDialogA11y from '../lib/useDialogA11y.js';

export default function LibraryScreen({ activeCourseId, onSelect, onImport, onProcess, onReview, refreshKey = 0, cloud = null, onOpenCommunity = null }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [recentIds, setRecentIds] = useState([]);
  const [action, setAction] = useState(null);
  const [actionInput, setActionInput] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [backupPreview, setBackupPreview] = useState(null);
  const closeBackup = () => setBackupPreview(null);
  const closeAction = () => setAction(null);
  const backupDialogRef = useDialogA11y(Boolean(backupPreview), closeBackup);
  const actionDialogRef = useDialogA11y(Boolean(action && action.type !== 'merge'), closeAction);
  useEffect(() => {
    let live = true;
    Promise.all([getAllCourses(), getSettings()]).then(([items, settings]) => { if (live) { setCourses(items); setRecentIds(settings.recentCourseIds || []); setLoading(false); } }).catch((cause) => { if (live) { setError(cause.message); setLoading(false); } });
    return () => { live = false; };
  }, [refreshKey]);

  const create = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const course = await saveCourse({ id: `course-${crypto.randomUUID()}`, name: name.trim(), description: '', type: 'imported', status: 'empty', metadata: {}, chapters: [] });
      syncCourseToCloud(course);
      setCourses((items) => [...items, { ...course, chapterCount: 0 }]);
      setName('');
      onImport(course.id);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const openAction = (type, course) => {
    setAction({ type, course });
    setActionInput(type === 'rename' ? course.name : '');
    if (type === 'publish') {
      setPublishDesc(course.description || '');
      setPublishTags(Array.isArray(course.tags) ? course.tags.join(', ') : '');
    }
  };
  const performAction = async () => {
    if (!action) return;
    const { type, course } = action;
    setBusy(true); setError('');
    try {
      if (type === 'rename') {
        const nextName = actionInput.trim();
        if (!nextName) throw new Error('Tên khóa học không được để trống.');
        const saved = await saveCourse({ ...await getCourse(course.id), name: nextName });
        syncCourseToCloud(saved);
        setCourses((items) => items.map((item) => item.id === course.id ? { ...item, name: nextName } : item));
      } else if (type === 'delete') {
        if (actionInput !== course.name) throw new Error('Tên xác nhận chưa khớp.');
        if (getProcessingJob(course.id) || ['processing', 'paused'].includes((await getCourse(course.id))?.status)) throw new Error('Hãy hủy xử lý trước khi xóa khóa học.');
        await deleteCourse(course.id);
        syncCourseDeleteToCloud(course.id);
        setCourses((items) => items.filter((item) => item.id !== course.id));
        if (activeCourseId === course.id) onSelect(BUILT_IN_COURSE_ID);
      } else if (type === 'merge') {
        const merged = await mergeCourses(course.id, mergeTarget);
        syncCourseToCloud(merged);
        setCourses(await getAllCourses()); setMergeTarget('');
      } else if (type === 'publish') {
        const full = await getCourse(course.id);
        await syncCourseToCloud(full);
        const nextPublic = !course.isPublic;
        const tags = publishTags.split(',').map((t) => t.trim()).filter(Boolean);
        const res = await publishCourseToCommunity(course.id, { isPublic: nextPublic, description: publishDesc.trim(), tags });
        const updated = await saveCourse({ ...full, description: res.course.description, isPublic: res.course.isPublic, shareCode: res.course.shareCode, tags: res.course.tags });
        setCourses((items) => items.map((item) => item.id === course.id ? { ...item, description: updated.description, isPublic: updated.isPublic, shareCode: updated.shareCode, tags: updated.tags } : item));
      }
      setAction(null); setActionInput('');
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const duplicate = async (course) => {
    try {
      const original = await getCourse(course.id);
      const copy = await saveCourse({ ...original, id: `course-${crypto.randomUUID()}`, name: `${original.name} (bản sao)`, type: 'imported', rawDocumentId: null, isPublic: false, shareCode: null });
      syncCourseToCloud(copy);
      setCourses((items) => [...items, { ...copy, chapterCount: copy.chapters.length }]);
    } catch (cause) { setError(cause.message); }
  };
  const inspectBackup = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try { const course = await previewCourseBackup(file); setBackupPreview({ course, file }); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const importBackup = async () => {
    if (!backupPreview) return;
    setBusy(true); setError('');
    try { const course = await importCourse(backupPreview.file); syncCourseToCloud(course); setCourses((items) => [...items, { ...course, chapterCount: course.chapters.length }]); setBackupPreview(null); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const merge = async (sourceId) => {
    if (!mergeTarget) { setError('Chọn khóa đích để ghép.'); return; }
    openAction('merge', courses.find((course) => course.id === sourceId));
  };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-accent">Thư viện</p><h1 className="mt-1 font-serif text-2xl font-semibold">Khóa học của bạn</h1><p className="mt-2 text-sm text-text-secondary">{cloud?.authenticated ? 'Khóa học được lưu cục bộ và tự động đồng bộ lên tài khoản đám mây.' : 'Quản lý tài liệu và nội dung học tập trên thiết bị này.'}</p></div>{cloud?.serverAvailable && onOpenCommunity && <button type="button" onClick={onOpenCommunity} className="btn-secondary shrink-0">Kho cộng đồng</button>}</header>
    <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row"><input aria-label="Tên khóa học" className="input min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên khóa học mới" /><button disabled={busy || !name.trim()} aria-busy={busy} className="btn-primary inline-flex shrink-0 items-center justify-center gap-2">{busy && <span className="spinner" aria-hidden="true"/>}{busy ? 'Đang tạo' : 'Thêm khóa học'}</button></form>
    <label className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed border-border-strong bg-bg-secondary px-4 py-3 text-sm transition hover:border-accent sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block font-semibold text-text-primary">Nhập khóa học từ bản sao lưu</span>
        <span className="mt-0.5 block text-xs text-text-muted">Chọn file .dudu đã xuất trước đó — dữ liệu hiện có được giữ nguyên.</span>
      </span>
      <span className="btn-secondary inline-flex shrink-0 items-center justify-center">Chọn file .dudu</span>
      <input type="file" accept=".dudu" className="sr-only" onChange={(event) => { inspectBackup(event.target.files?.[0]); event.target.value = ''; }} />
    </label>
    {error && <p role="alert" className="rounded-lg bg-error-subtle p-3 text-sm text-error">{error}</p>}
    {recentIds.some((id) => courses.some((course) => course.id === id)) && <section className="border-b border-border pb-4"><h2 className="text-sm font-semibold">Mở gần đây</h2><div className="mt-2 flex flex-wrap gap-2">{recentIds.map((id) => { const item = courses.find((course) => course.id === id); return item ? <button key={id} onClick={() => onSelect(id)} className="btn-secondary text-sm">{item.name}</button> : null; })}</div></section>}
    {loading && <div className="space-y-2" aria-label="Đang tải khóa học">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg border border-border bg-bg-tertiary" />)}</div>}
    {!loading && !courses.length && <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-accent-subtle text-accent"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><p className="mt-4 font-semibold">Thư viện đang trống</p><p className="mt-1 text-sm text-text-muted">Đặt tên khóa học phía trên để nhập tài liệu đầu tiên.</p><button type="button" onClick={() => document.querySelector('input[aria-label="Tên khóa học"]')?.focus()} className="btn-primary mt-5">Tạo khóa học</button></div>}
    <div className="space-y-2">{courses.map((course) => <article key={course.id} className="rounded-xl border border-border bg-bg-secondary p-4 transition hover:border-border-strong hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{course.name}</h2>{activeCourseId === course.id && <span className="rounded bg-accent-subtle px-2 py-0.5 text-xs text-accent">Đang học</span>}{course.isPublic && <span className="rounded bg-success-subtle px-2 py-0.5 text-xs text-success">Công khai{course.shareCode ? ` #${course.shareCode}` : ''}</span>}</div><p className="mt-1 text-xs text-text-muted">{course.chapterCount || 0} bài · {course.type === 'built-in' ? 'Có sẵn' : course.status === 'processing' ? 'Đang sinh bài học' : course.status === 'paused' ? 'Đã tạm dừng' : course.status === 'has-raw' ? 'Đã nhập tài liệu' : course.status === 'review' ? 'Cần duyệt' : course.chapterCount ? 'Sẵn sàng học' : 'Chưa có nội dung'}</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => onSelect(course.id)} className="btn-secondary">Mở</button>{course.type !== 'built-in' && <><button disabled={Boolean(getProcessingJob(course.id)) || ['processing', 'paused'].includes(course.status)} onClick={() => onImport(course.id)} className="btn-secondary">Nhập tài liệu</button>{['has-raw', 'processing', 'paused'].includes(course.status) && <button onClick={() => onProcess(course.id)} className="btn-primary">{course.status === 'processing' || course.status === 'paused' ? 'Xem tiến độ' : 'Sinh bài học'}</button>}{course.status === 'review' && <button onClick={() => onReview(course.id)} className="btn-primary">Duyệt nội dung</button>}</>}</div></div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3 text-xs"><button onClick={() => openAction('rename', course)} className="text-accent">Đổi tên</button><button onClick={() => duplicate(course)} className="text-accent">Nhân bản</button>{course.type !== 'built-in' && course.chapterCount > 0 && <button onClick={() => onReview(course.id)} className="text-accent">Sửa nội dung</button>}{cloud?.authenticated && course.type !== 'built-in' && course.chapterCount > 0 && <button onClick={() => openAction('publish', course)} className="text-accent">{course.isPublic ? 'Quản lý chia sẻ' : 'Chia sẻ cộng đồng'}</button>}<button onClick={() => exportCourse(course.id).catch((cause) => setError(cause.message))} className="text-accent">Xuất .dudu</button>{course.type !== 'built-in' && <button onClick={() => openAction('delete', course)} className="text-error">Xóa</button>}</div>
      {course.chapterCount > 0 && courses.some((item) => item.chapterCount > 0 && item.id !== course.id) && <div className="mt-3 flex items-center gap-2"><select aria-label="Khóa để ghép" className="input min-w-0 flex-1 text-xs" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Ghép với khóa học…</option>{courses.filter((item) => item.chapterCount > 0 && item.id !== course.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={busy || !mergeTarget || mergeTarget === course.id} onClick={() => merge(course.id)} className="btn-secondary">Ghép</button></div>}
    </article>)}</div>
    {action?.type === 'merge' && <ConfirmDialog title="Ghép khóa học" message={`Tạo khóa học mới từ ${action.course.name} và khóa đã chọn? Hai khóa gốc được giữ nguyên.`} onConfirm={performAction} onCancel={() => setAction(null)} />}
    {backupPreview && <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBackup(); }}><section ref={backupDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Xem trước khóa học" className="animate-modal-in w-full max-w-md rounded-xl border border-border bg-bg-secondary p-5 shadow-lg"><h2 className="font-serif text-lg font-semibold">Nhập khóa học</h2><p className="mt-2 font-semibold">{backupPreview.course.name}</p><p className="text-sm text-text-secondary">{backupPreview.course.chapters.length} bài · {backupPreview.course.description || 'Không có mô tả'}</p><p className="mt-3 text-xs text-text-muted">Bản nhập sẽ được tạo thành khóa học mới, không ghi đè dữ liệu hiện có.</p><div className="mt-5 flex justify-end gap-2"><button onClick={closeBackup} className="btn-secondary">Hủy</button><button disabled={busy} aria-busy={busy} onClick={importBackup} className="btn-primary inline-flex items-center gap-2">{busy && <span className="spinner" aria-hidden="true"/>}Nhập khóa học</button></div></section></div>}
    {action && action.type === 'publish' && <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAction(); }}><form ref={actionDialogRef} tabIndex={-1} onSubmit={(event) => { event.preventDefault(); performAction(); }} role="dialog" aria-modal="true" aria-label="Chia sẻ khóa học cộng đồng" className="animate-modal-in w-full max-w-md rounded-xl border border-border bg-bg-secondary p-5 shadow-lg"><h2 className="font-serif text-lg font-semibold">{action.course.isPublic ? 'Tắt chia sẻ cộng đồng' : 'Chia sẻ lên Kho cộng đồng'}</h2><p className="mt-2 text-sm text-text-secondary">{action.course.isPublic ? 'Ẩn khóa học này khỏi Kho cộng đồng? Bản gốc trong thư viện của bạn vẫn được giữ nguyên.' : `Mọi học viên DuDu có thể xem trước và tải bản sao của "${action.course.name}" về học.`}</p>{!action.course.isPublic && <div className="mt-4 space-y-3"><label className="block text-sm font-medium">Mô tả ngắn<textarea rows={3} className="input mt-1 w-full" value={publishDesc} onChange={(e) => setPublishDesc(e.target.value)} placeholder="Khóa học này phù hợp cho ai, gồm những nội dung gì?" /></label><label className="block text-sm font-medium">Thẻ chủ đề (cách nhau bởi dấu phẩy)<input className="input mt-1 w-full" value={publishTags} onChange={(e) => setPublishTags(e.target.value)} placeholder="HSK 2, Giao tiếp, Ôn thi" /></label></div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeAction} className="btn-secondary">Hủy</button><button disabled={busy} aria-busy={busy} className="btn-primary">{busy ? 'Đang lưu...' : action.course.isPublic ? 'Ẩn khỏi cộng đồng' : 'Chia sẻ ngay'}</button></div></form></div>}
    {action && !['merge', 'publish'].includes(action.type) && <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAction(); }}><form ref={actionDialogRef} tabIndex={-1} onSubmit={(event) => { event.preventDefault(); performAction(); }} role="dialog" aria-modal="true" aria-label={action.type === 'delete' ? 'Xóa khóa học' : 'Đổi tên khóa học'} className="animate-modal-in w-full max-w-md rounded-xl border border-border bg-bg-secondary p-5 shadow-lg"><h2 className="font-serif text-lg font-semibold">{action.type === 'delete' ? 'Xóa khóa học' : 'Đổi tên khóa học'}</h2><p className="mt-2 text-sm text-text-secondary">{action.type === 'delete' ? `Gõ chính xác "${action.course.name}" để xóa vĩnh viễn cả tiến độ và tài liệu.` : 'Đặt tên mới cho khóa học.'}</p><input autoFocus className="input mt-4 w-full" value={actionInput} onChange={(event) => setActionInput(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeAction} className="btn-secondary">Hủy</button><button disabled={busy || (action.type === 'delete' ? actionInput !== action.course.name : !actionInput.trim())} aria-busy={busy} className={action.type === 'delete' ? 'rounded-lg border border-error bg-error px-4 py-2 font-semibold text-white disabled:opacity-50' : 'btn-primary'}>{busy ? 'Đang lưu...' : action.type === 'delete' ? 'Xóa vĩnh viễn' : 'Lưu'}</button></div></form></div>}
  </div>;
}
