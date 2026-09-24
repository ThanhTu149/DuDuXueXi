import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllCourses, getCourse } from '../lib/db.js';

function fold(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ''); }
function title(entry) { return entry.word_zh || entry.grammar_title_zh || entry.phrase_zh || ''; }
const COMMANDS = [
  { id: 'home', label: 'Về lộ trình', detail: 'Màn hình chính' },
  { id: 'library', label: 'Mở thư viện', detail: 'Khóa học và tài liệu' },
  { id: 'new-course', label: 'Tạo khóa học mới', detail: 'Nhập tài liệu học' },
  { id: 'settings', label: 'Mở cài đặt', detail: 'Giao diện và Gemini API' },
  { id: 'theme', label: 'Đổi sáng / tối', detail: 'Chuyển giao diện' },
  { id: 'review', label: 'Ôn tập ngay', detail: 'SRS và câu sai' },
];
function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export default function GlobalCourseSearch({ isOpen, onClose, onSelect, onCommand, activeCourseId }) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query);
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('dudu-recent-commands') || '[]'); } catch { return []; } });
  const [courseId, setCourseId] = useState('all');
  const [courses, setCourses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    setCourseId(activeCourseId || 'all'); setQuery(''); setError('');
    getAllCourses().then(async (items) => {
      const records = await Promise.all(items.map((item) => getCourse(item.id)));
      if (!live) return;
      setCourses(items);
      setEntries(records.flatMap((record) => (record?.chapters || []).flatMap((chapter, index) => (chapter.glossary?.entries || []).map((entry) => ({ entry, courseId: record.id, courseName: record.name, bai: index + 1 })))));
    }).catch((cause) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [isOpen, activeCourseId]);
  const results = useMemo(() => {
    const search = fold(debouncedQuery);
    if (!search) return [];
    return entries.filter((item) => (courseId === 'all' || item.courseId === courseId) && [title(item.entry), item.entry.pinyin, item.entry.meaning_vi, item.entry.meaning_en, item.entry.grammar_title_vi, item.entry.explanation_vi].some((value) => fold(value).includes(search))).slice(0, 60);
  }, [debouncedQuery, courseId, entries]);
  const commands = useMemo(() => {
    const search = fold(query);
    const matching = COMMANDS.filter((command) => !search || fold(`${command.label} ${command.detail}`).includes(search));
    return matching.sort((a, b) => (recent.indexOf(a.id) < 0 ? 99 : recent.indexOf(a.id)) - (recent.indexOf(b.id) < 0 ? 99 : recent.indexOf(b.id)));
  }, [query, recent]);
  const runCommand = (id) => {
    const updated = [id, ...recent.filter((item) => item !== id)].slice(0, 5);
    setRecent(updated);
    try { localStorage.setItem('dudu-recent-commands', JSON.stringify(updated)); } catch { /* Private browsing can block storage. */ }
    onClose();
    onCommand?.(id);
  };
  const moveFocus = (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const options = [...event.currentTarget.closest('[role="dialog"]').querySelectorAll('[data-palette-option]')];
    if (!options.length) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    options[(current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
  };
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeys = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeys); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Tìm kiếm và lệnh" className="animate-modal-in w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl"><div className="flex gap-2 border-b border-border p-3"><input autoFocus aria-label="Tìm kiếm hoặc nhập lệnh" className="input min-w-0 flex-1" placeholder="Tìm từ vựng hoặc nhập lệnh..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && commands[0] && !results.length && query.trim()) runCommand(commands[0].id); else moveFocus(event); }} /><select aria-label="Lọc khóa học" className="input max-w-36 text-sm" value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="all">Tất cả</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select><button onClick={onClose} aria-label="Đóng tìm kiếm" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-tertiary text-text-muted hover:bg-border">✕</button></div><div className="max-h-[60vh] overflow-auto p-2">{error && <p className="p-3 text-sm text-error">{error}</p>}{commands.length > 0 && <div className="border-b border-border pb-2 mb-2"><p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">{query ? 'Lệnh phù hợp' : recent.length ? 'Gần đây & lệnh nhanh' : 'Lệnh nhanh'}</p>{commands.map((command) => <button data-palette-option key={command.id} onKeyDown={moveFocus} onClick={() => runCommand(command.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-tertiary focus-visible:bg-bg-tertiary focus-visible:ring-2 focus-visible:ring-accent outline-none"><span className="font-medium">{command.label}</span><span className="text-xs text-text-muted">{command.detail}</span></button>)}</div>}{query && !results.length && !commands.length && <p className="p-5 text-center text-sm text-text-muted">Không tìm thấy kết quả nào.</p>}{results.length > 0 && <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">Từ vựng ({results.length})</p>}{results.map((item) => <button data-palette-option key={`${item.courseId}-${item.entry.id}`} onKeyDown={moveFocus} onClick={() => onSelect(item)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg-tertiary focus-visible:bg-bg-tertiary focus-visible:ring-2 focus-visible:ring-accent outline-none"><span><strong className="block font-hanzi text-lg leading-tight">{title(item.entry)}</strong><small className="text-text-muted">{item.entry.pinyin || item.entry.meaning_vi || item.entry.grammar_title_vi}</small></span><span className="shrink-0 text-right text-xs text-accent">{item.courseName}<br />Bài {item.bai}</span></button>)}</div><div className="border-t border-border px-4 py-2 flex items-center gap-4 text-xs text-text-muted"><span>↑↓ Di chuyển</span><span>↵ Chọn</span><span>Esc Đóng</span></div></section></div>;
}
