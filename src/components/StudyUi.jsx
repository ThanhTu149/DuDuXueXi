import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES } from '../data-loader.js';
import {
  BACKGROUNDS,
  sounds,
} from '../lib/theme.js';
import {
  ACHIEVEMENTS,
  localDate,
  readStorage,
  writeStorage,
} from '../lib/progressState.js';
import {
  RADICALS,
  entryMeaning,
  entryTitle,
  getCharacterInfo,
  normalizePinyin,
  searchPinyin,
  speak,
} from '../lib/studyHelpers.js';
import useDialogA11y from '../lib/useDialogA11y.js';

export const Icon = {
  Home: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  Book: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>,
  Check: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12" /></svg>,
  Refresh: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>,
  Chart: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  Search: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Pen: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>,
  Trophy: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>,
  Sun: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
  Moon: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>,
  Settings: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  Play: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  Pause: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>,
  Volume: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></svg>,
  Mic: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>,
  Star: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  Bookmark: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>,
  ChevronRight: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="9 18 15 12 9 6" /></svg>,
  ChevronLeft: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="15 18 9 12 15 6" /></svg>,
  X: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Plus: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Minus: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Flame: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></svg>,
  Target: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  Zap: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  Gamepad: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /><rect x="2" y="6" width="20" height="12" rx="2" /></svg>,
  Headphones: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" /></svg>,
  Type: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>,
  Clock: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  Calendar: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>,
  Download: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>,
  Upload: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 16V4M7 9l5-5 5 5M4 21h16" /></svg>,
  Bell: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
  User: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 21a8 8 0 00-16 0" /><circle cx="12" cy="7" r="4" /></svg>,
  Globe: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  Sparkles: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 3v4M21 5h-4M5 17v4M7 19H3" /></svg>,
  Cloud: (props) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></svg>,
};

export const PROFILE_BADGE_ICONS = {
  first_lesson: Icon.Check,
  streak_3: Icon.Flame,
  streak_7: Icon.Flame,
  combo_10: Icon.Target,
  clean_book: Icon.Book,
  all_lessons: Icon.Trophy,
  accuracy_90: Icon.Star,
  boss_first: Icon.Gamepad,
};

export const NAV_ITEMS = [
  { id: 'home', icon: <Icon.Home />, label: 'Lộ trình' },
  { id: 'library', icon: <Icon.Book />, label: 'Thư viện' },
  { id: 'learn', icon: <Icon.Book />, label: 'Học' },
  { id: 'quiz', icon: <Icon.Check />, label: 'Quiz' },
  { id: 'review', icon: <Icon.Refresh />, label: 'Ôn tập' },
  { id: 'dashboard', icon: <Icon.Chart />, label: 'Hồ sơ' },
];

export const EXTRA_NAV = [
  { id: 'community', icon: <Icon.Globe />, label: 'Cộng đồng' },
  { id: 'tutor', icon: <Icon.Sparkles />, label: 'Gia sư AI' },
  { id: 'exam', icon: <Icon.Pen />, label: 'Thi thử' },
  { id: 'boss', icon: <Icon.Trophy />, label: 'Boss Battle' },
  { id: 'minigame', icon: <Icon.Gamepad />, label: 'Ghép từ' },
  { id: 'dictation', icon: <Icon.Headphones />, label: 'Chính tả' },
  { id: 'pronunciation', icon: <Icon.Mic />, label: 'Phát âm' },
  { id: 'sentences', icon: <Icon.Type />, label: 'Câu ví dụ' },
];

const MASCOTS = {
  panda: { emoji: '🐼', name: 'Trúc', role: 'senpai' },
  penguin: { emoji: '🐧', name: 'Băng', role: 'kohai' },
};

export function Mascot({ type = 'panda', size = 'md', className = '' }) {
  const sizes = { sm: 'text-3xl', md: 'text-5xl', lg: 'text-7xl', xl: 'text-8xl' };
  const mascot = MASCOTS[type];
  return (
    <div className={`${sizes[size]} ${className} select-none`} aria-label={`Linh vật ${mascot.name}`} role="img">
      {mascot.emoji}
    </div>
  );
}

export function ProgressBar({ value, className = '', label = 'Tiến độ' }) {
  const safe = Math.min(100, Math.max(0, Number(value) || 0));
  const heightClass = /\bh-/.test(className) ? '' : 'h-2';
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe} className={`${heightClass} overflow-hidden rounded-full bg-subtle ${className}`}>
      <div className="h-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${safe / 100})` }} />
    </div>
  );
}

export function SpeakButton({ text, lang = 'zh-CN', className = '' }) {
  const [speaking, setSpeaking] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setSpeaking(true);
        if (!speak(text, lang, 0.85, () => setSpeaking(false))) setSpeaking(false);
      }}
      disabled={!text || (typeof window !== 'undefined' && !('speechSynthesis' in window))}
      className={`icon-action grid h-8 w-8 shrink-0 place-items-center rounded-md bg-bg-tertiary text-text-secondary transition hover:text-accent disabled:opacity-40 ${className}`}
      aria-label={`Đọc to ${text || ''}`}
      data-tooltip="Phát âm"
    >
      {speaking ? '•••' : <Icon.Volume className="h-4 w-4" />}
    </button>
  );
}

export function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-text-primary">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function BottomNav({ screen, onNavigate }) {
  return (
    <nav aria-label="Điều hướng nhanh" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border/60 bg-surface/95 p-1.5 backdrop-blur-md lg:hidden">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          aria-current={screen === item.id ? 'page' : undefined}
          className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium transition-[background-color,color] duration-200 ease-out ${screen === item.id ? 'bg-accent-subtle text-accent' : 'text-text-muted'}`}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function StreakCalendar({ studyDays = {}, streak = 0 }) {
  const days = Array.from({ length: 28 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (27 - index));
    const key = localDate(date);
    return { key, active: Boolean(studyDays[key]?.questions || studyDays[key]?.xp) };
  });
  return (
    <div>
      <h2 className="text-lg font-bold">Lịch học</h2>
      <div className="mt-5 grid grid-cols-7 gap-2">
        {days.map((day) => <span key={day.key} title={day.key} className={`aspect-square rounded ${day.active ? 'bg-accent' : 'bg-bg-tertiary'}`} />)}
      </div>
      <p className="mt-3 text-sm font-bold text-text-muted">Chuỗi hiện tại: {streak} ngày</p>
    </div>
  );
}

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  const trapRef = useDialogA11y(isOpen, onClose);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const shortcuts = [
    ['Ctrl K', 'Tìm kiếm'], ['G L', 'Thư viện'], ['G H', 'Lộ trình'], ['G Q', 'Quiz'], ['G R', 'Ôn tập'],
    ['1–4', 'Chọn đáp án Quiz'], ['Enter', 'Câu tiếp theo'], ['Ctrl E', 'Sửa mục đang mở'],
    ['Ctrl B', 'Đánh dấu mục đang mở'], ['Ctrl Shift D', 'Sáng / tối'], ['Esc', 'Đóng cửa sổ'],
  ];
  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={trapRef} role="dialog" aria-modal="true" aria-label="Phím tắt bàn phím" className="animate-modal-in max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-bg-secondary p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Phím tắt</h2>
          <button onClick={onClose} aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded bg-bg-tertiary"><Icon.X /></button>
        </div>
        <div className="mt-5 space-y-2">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-xl bg-bg-tertiary px-3 py-2">
              <span>{label}</span>
              <kbd className="rounded border border-border bg-bg-secondary px-2 py-1 text-xs font-bold">{key}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BookmarkButton({ entryId, bookmarks = [], onToggle }) {
  const active = bookmarks.includes(entryId);
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle?.(entryId); }}
      className={`icon-action grid h-8 w-8 place-items-center rounded-md ${active ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`}
      aria-label={active ? 'Bỏ đánh dấu' : 'Đánh dấu'}
      data-tooltip={active ? 'Bỏ đánh dấu' : 'Đánh dấu'}
    >
      <Icon.Bookmark className="h-4 w-4" />
    </button>
  );
}

export function NoteEditor({ entryId, note = '', onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const close = useCallback(() => setOpen(false), []);
  const trapRef = useDialogA11y(open, close);
  useEffect(() => { if (open) setDraft(note); }, [open, note]);
  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        className={`icon-action grid h-8 w-8 place-items-center rounded-md ${note ? 'bg-warning-subtle text-warning' : 'bg-bg-tertiary text-text-muted'}`}
        aria-label="Ghi chú"
        data-tooltip="Ghi chú"
      >
        <Icon.Pen className="h-4 w-4" />
      </button>
      {open && (
        <div className="modal-backdrop fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Ghi chú cá nhân" className="animate-modal-in w-full max-w-lg rounded-xl bg-bg-secondary p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Ghi chú cá nhân</h2>
              <button onClick={close} aria-label="Đóng ghi chú" className="icon-action grid h-10 w-10 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:bg-border" data-tooltip="Đóng"><Icon.X /></button>
            </div>
            <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} className="input mt-4 w-full" placeholder="Viết cách nhớ hoặc lưu ý riêng..." />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { onSave?.(entryId, ''); close(); }} className="btn-secondary">Xóa</button>
              <button onClick={() => { onSave?.(entryId, draft.trim()); close(); }} className="btn-primary ml-auto">Lưu</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function ClickableHanzi({ text = '', entry, onCharacter }) {
  const chars = [...text];
  const firstHanziIndex = chars.findIndex((char) => /[\u3400-\u9fff]/.test(char));
  const onHanziKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = [...(event.currentTarget.parentElement?.querySelectorAll('button[data-hanzi-char]') || [])];
    const currentIndex = buttons.indexOf(event.currentTarget);
    if (currentIndex < 0 || buttons.length <= 1) return;
    event.preventDefault();
    const nextIndex = (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };
  return (
    <span lang="zh-Hans" className="inline">
      {chars.map((char, index) => /[\u3400-\u9fff]/.test(char) ? (
        <button
          key={`${char}-${index}`}
          type="button"
          data-hanzi-char="1"
          tabIndex={index === firstHanziIndex ? 0 : -1}
          onKeyDown={onHanziKeyDown}
          onClick={(event) => { event.stopPropagation(); onCharacter?.(char, entry); }}
          className="rounded px-0.5 hover:bg-warning-subtle hover:text-warning"
          title={`Xem chữ ${char}`}
        >
          {char}
        </button>
      ) : (
        <span key={`${char}-${index}`}>{char}</span>
      ))}
    </span>
  );
}

function EntryActions({ entry, bookmarks, onToggleBookmark, notes, onSaveNote, onEdit }) {
  return (
    <div className="flex items-center gap-2">
      <SpeakButton text={entryTitle(entry)} />
      <NoteEditor entryId={entry.id} note={notes[entry.id]} onSave={onSaveNote} />
      <BookmarkButton entryId={entry.id} bookmarks={bookmarks} onToggle={onToggleBookmark} />
      {onEdit && (
        <button type="button" onClick={() => onEdit(entry)} className="grid h-8 w-8 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:text-accent" title="Sửa từ vựng" aria-label={`Sửa từ vựng ${entry.word_zh}`}>
          <Icon.Pen className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function RelatedLinks({ entry, onRelated }) {
  return entry.related_words?.length ? (
    <div className="mt-4 flex flex-wrap gap-2">
      {entry.related_words.map((id) => {
        const related = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id);
        return <button key={id} onClick={() => onRelated?.(id)} className="rounded-md bg-bg-tertiary px-2 py-1 text-xs font-bold hover:bg-border">{related ? entryTitle(related) : id}</button>;
      })}
    </div>
  ) : null;
}

export const WordCard = memo(function WordCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter, onEdit }) {
  const needsOcrCheck = entry.confidence === 'medium' || entry.confidence === 'low';
  const isAiExample = entry.example_source === 'ai_inferred';
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanzi text-3xl font-bold" lang="zh-Hans"><ClickableHanzi text={entry.word_zh} entry={entry} onCharacter={onCharacter} /></h3>
          <p className="pinyin-text mt-1 text-accent" lang="zh-Latn">{entry.pinyin}</p>
        </div>
        <EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onEdit={onEdit} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="font-bold">{entry.meaning_vi}</p>
        {needsOcrCheck && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-warning">Cần đối chiếu OCR</span>}
      </div>
      {entry.meaning_en && <p className="text-sm text-text-muted">{entry.meaning_en}</p>}
      {entry.example_zh && (
        <div className="mt-4 rounded-xl bg-bg-tertiary p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-hanzi font-bold" lang="zh-Hans">{entry.example_zh}</p>
            {isAiExample && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-muted">Ví dụ AI</span>}
          </div>
          <p className="pinyin-text text-sm text-success" lang="zh-Latn">{entry.example_pinyin}</p>
          <p className="text-sm text-text-muted">{entry.example_vi}</p>
        </div>
      )}
      <RelatedLinks entry={entry} onRelated={onRelated} />
      {notes[entry.id] && <div className="mt-4 flex gap-2 rounded-xl bg-warning-subtle p-3 text-sm"><Icon.Pen className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><p>{notes[entry.id]}</p></div>}
    </article>
  );
});

export function GrammarCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter }) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanzi text-xl font-bold" lang="zh-Hans"><ClickableHanzi text={entry.grammar_title_zh} entry={entry} onCharacter={onCharacter} /></h3>
          <p className="text-accent">{entry.grammar_title_vi}</p>
        </div>
        <EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} />
      </div>
      {entry.structure && <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-bg-tertiary p-3 text-sm text-accent" lang="zh-Hans">{entry.structure}</pre>}
      <p className="mt-4 text-text-secondary">{entry.explanation_vi}</p>
      {(entry.examples || []).map((example, index) => (
        <div key={index} className="mt-3 border-l-2 border-warning pl-3">
          <p className="font-hanzi font-bold" lang="zh-Hans">{example.zh}</p>
          <p className="pinyin-text text-sm text-success" lang="zh-Latn">{example.pinyin}</p>
          <p className="text-sm text-text-muted">{example.vi}</p>
        </div>
      ))}
      <RelatedLinks entry={entry} onRelated={onRelated} />
    </article>
  );
}

export function PhraseCard({ entry, onRelated, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter }) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanzi text-2xl font-bold" lang="zh-Hans"><ClickableHanzi text={entry.phrase_zh} entry={entry} onCharacter={onCharacter} /></h3>
          <p className="pinyin-text text-accent" lang="zh-Latn">{entry.pinyin}</p>
        </div>
        <EntryActions entry={entry} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} />
      </div>
      <p className="mt-4 font-bold">{entry.meaning_vi}</p>
      <p className="mt-2 text-sm text-text-muted">{entry.usage_note}</p>
      <RelatedLinks entry={entry} onRelated={onRelated} />
    </article>
  );
}

export function VirtualKeyboard({ textareaRef, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchPinyin(query), [query]);
  const insert = (text) => {
    const target = textareaRef.current;
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${text}${value.slice(end)}`);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((val) => !val)} className="btn-secondary inline-flex items-center gap-2">
        <Icon.Type className="h-4 w-4" />Bàn phím tiếng Trung
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-border bg-bg-tertiary p-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full" placeholder="Gõ pinyin không dấu, ví dụ: bianhua" aria-label="Tìm chữ Hán theo pinyin" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {results.map((item, index) => (
              <button key={`${item.key}-${item.zh}-${index}`} onClick={() => insert(item.zh)} className="rounded-xl bg-bg-secondary p-2 text-left hover:ring-1 hover:ring-accent">
                <span className="block text-lg font-bold">{item.zh}</span>
                <span className="block truncate text-xs text-text-muted">{item.pinyin} · {item.vi}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FlashcardMode({ entries, title }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!entries.length) return <EmptyState mascot="panda" title="Trống" text="Không có từ nào để luyện." />;
  const entry = entries[index % entries.length];
  const next = () => { setFlipped(false); setIndex((i) => (i + 1) % entries.length); };
  const prev = () => { setFlipped(false); setIndex((i) => (i - 1 + entries.length) % entries.length); };

  return (
    <div className="mx-auto max-w-md pb-10 text-center">
      <h3 className="mb-4 font-bold uppercase tracking-widest text-text-muted">{title} - {(index % entries.length) + 1}/{entries.length}</h3>
      <button type="button" onClick={() => setFlipped(!flipped)} className={`flip-card group ${flipped ? 'flipped' : ''}`} aria-label={flipped ? 'Xem mặt chữ Hán' : 'Xem nghĩa của thẻ'}>
        <span className="flip-card-inner">
          <span className="flip-card-face flip-card-front">
            <span className="font-hanzi text-5xl font-bold text-text-primary">{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh}</span>
            {entry.pinyin && <span className="pinyin-text mt-4 text-xl text-text-muted">{entry.pinyin}</span>}
            <span className="mt-4 text-sm text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">Chạm để lật</span>
          </span>
          <span className="flip-card-face flip-card-back">
            <span className="text-2xl font-bold">{entry.meaning_vi || entry.grammar_title_vi || entry.usage_note}</span>
            {entry.meaning_en && <span className="mt-2 text-sm italic text-text-muted">{entry.meaning_en}</span>}
            {entry.example_zh && (
              <span className="mt-6 block border-t border-border pt-4 text-left">
                <span className="font-hanzi block text-lg font-medium">{entry.example_zh}</span>
                <span className="pinyin-text block text-sm text-success">{entry.example_pinyin}</span>
                <span className="mt-2 block text-sm text-text-secondary">{entry.example_vi}</span>
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="mt-8 flex justify-center gap-4">
        <button onClick={prev} aria-label="Thẻ trước" className="grid h-12 w-12 place-items-center rounded-full border border-border bg-bg-secondary transition hover:bg-bg-tertiary"><Icon.ChevronLeft className="h-6 w-6" /></button>
        <button onClick={next} aria-label="Thẻ tiếp theo" className="grid h-12 w-12 place-items-center rounded-full border border-border bg-bg-secondary transition hover:bg-bg-tertiary"><Icon.ChevronRight className="h-6 w-6" /></button>
      </div>
    </div>
  );
}

export function StatBox({ label, value, tone }) {
  const tones = { mint: 'bg-success-subtle text-success', rose: 'bg-error-subtle text-error', amber: 'bg-warning-subtle text-warning', sky: 'bg-accent-2-subtle text-accent-2' };
  return (
    <div className={`rounded-xl p-4 text-center ${tones[tone]}`}>
      <p className="h2-text font-bold">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}

export function EmptyState({ title, text, mascot = 'panda', icon, action, secondaryAction }) {
  return (
    <div className="animate-fade-slide px-4 py-14 text-center">
      <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-2xl bg-gradient-to-br from-accent-subtle to-accent-2-subtle shadow-xs">
        {icon ? <span aria-hidden="true" className="font-hanzi text-[34px] leading-none text-accent">{icon}</span> : <span className="animate-float"><Mascot type={mascot} size="lg" /></span>}
      </div>
      <h2 className="mt-5 font-serif text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{text}</p>
      {(action || secondaryAction) && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}{secondaryAction}</div>}
    </div>
  );
}

export function CharacterDetailModal({ detail, onClose }) {
  const trapRef = useDialogA11y(Boolean(detail), onClose);
  if (!detail) return null;
  const { char, entry } = detail;
  const info = getCharacterInfo(char);
  const compounds = ALL_GLOSSARY_ENTRIES.filter((item) => item.type === 'word' && item.word_zh?.includes(char)).slice(0, 12);
  const exact = entry || compounds[0];
  const examples = [...new Set(compounds.map((item) => item.example_zh).filter(Boolean))].slice(0, 4);
  return (
    <div className="modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="character-detail-title" className="animate-modal-in max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-bg-secondary p-4 shadow-xl sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <span id="character-detail-title" className="font-hanzi text-6xl font-bold leading-none sm:text-7xl">{char}</span>
            <div className="min-w-0">
              <p className="text-xl font-bold text-accent-2">{exact?.pinyin || 'Chưa có pinyin riêng'}</p>
              <p className="mt-2 font-bold">{entryMeaning(exact || {}) || 'Xem các từ ghép bên dưới'}</p>
            </div>
            <SpeakButton text={char} className="h-10 w-10" />
          </div>
          <button onClick={onClose} className="icon-action grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng chi tiết chữ Hán" data-tooltip="Đóng"><Icon.X /></button>
        </header>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-warning-subtle p-4"><p className="text-xs font-bold uppercase tracking-wider text-warning">Bộ thủ và số nét</p><p className="mt-2 text-lg font-bold">{info.radical ? `${info.radical} · ${RADICALS[info.radical] || 'bộ thủ'}` : 'Chưa có trong bảng bộ thủ'}</p><p className="mt-1 text-sm text-text-muted">{info.strokes ? `${info.strokes} nét` : 'Số nét chưa được ghi nhận'}</p></div>
          <div className="rounded-xl bg-accent-2-subtle p-4"><p className="text-xs font-bold uppercase tracking-wider text-accent-2">Nghĩa trong bài</p><p className="mt-2 font-bold">{exact?.meaning_vi || exact?.grammar_title_vi || 'Chưa có nghĩa riêng cho một chữ'}</p>{exact?.meaning_en && <p className="mt-1 text-sm text-text-muted">{exact.meaning_en}</p>}</div>
        </div>
        <div className="mt-5">
          <h3 className="font-bold">Từ ghép chứa “{char}”</h3>
          {compounds.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {compounds.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between"><span className="text-xl font-bold">{item.word_zh}</span><SpeakButton text={item.word_zh} /></div>
                  <p className="text-xs font-bold text-error">{item.pinyin}</p>
                  <p className="mt-1 text-xs text-text-muted">{item.meaning_vi}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-text-muted">Chưa có từ ghép khác trong 10 bài.</p>}
        </div>
        {examples.length > 0 && (
          <div className="mt-5">
            <h3 className="font-bold">Câu ví dụ</h3>
            <div className="mt-3 space-y-2">{examples.map((example) => <div key={example} className="flex items-center gap-3 rounded-xl bg-bg-primary p-3"><p className="flex-1 font-semibold">{example}</p><SpeakButton text={example} /></div>)}</div>
          </div>
        )}
      </section>
    </div>
  );
}

export function GlossaryModal({ entry, onClose, onOpenEntry, bookmarks = [], onToggleBookmark, notes = {}, onSaveNote, onCharacter, onEditWord }) {
  const trapRef = useDialogA11y(Boolean(entry), onClose);
  if (!entry) return null;
  const openRelated = (id) => { const target = ALL_GLOSSARY_ENTRIES.find((item) => item.id === id); if (target) onOpenEntry(target); };
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="animate-modal-in max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-xl bg-bg-primary p-4 shadow-lg sm:rounded-xl sm:p-6" ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Chi tiết mục từ">
        <div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-text-muted">Bài {entry.bai} · {entry.type}</p><button onClick={onClose} className="icon-action grid h-10 w-10 place-items-center rounded-xl bg-bg-secondary text-text-muted shadow-sm" aria-label="Đóng" data-tooltip="Đóng"><Icon.X /></button></div>
        {entry.type === 'word' && <WordCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} onEdit={onEditWord} />}
        {entry.type === 'grammar' && <GrammarCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />}
        {entry.type === 'phrase' && <PhraseCard entry={entry} onRelated={openRelated} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} notes={notes} onSaveNote={onSaveNote} onCharacter={onCharacter} />}
      </div>
    </div>
  );
}

export function PlaylistFloatingPlayer({ playlist, onClose }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(0.85);
  const [loop, setLoop] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const entries = playlist?.entries || [];
  useEffect(() => { setIndex(0); setPlaying(Boolean(entries.length)); }, [playlist?.id]);
  useEffect(() => {
    if (!playing || !entries.length) return undefined;
    let cancelled = false;
    let timerId = null;
    const current = entries[index];
    const advance = () => {
      if (cancelled) return;
      timerId = setTimeout(() => {
        if (index < entries.length - 1) setIndex((value) => value + 1);
        else if (loop) setIndex(0);
        else setPlaying(false);
      }, 1600);
    };
    speak(current.text, 'zh-CN', rate, () => {
      if (cancelled) return;
      timerId = setTimeout(() => speak(current.text, 'zh-CN', rate, advance), 800);
    });
    return () => { cancelled = true; clearTimeout(timerId); window.speechSynthesis?.cancel(); };
  }, [entries, index, loop, playing, rate]);
  if (!entries.length) return null;
  const move = (direction) => { setIndex((value) => Math.min(entries.length - 1, Math.max(0, value + direction))); setPlaying(true); };
  return (
    <aside aria-label="Trình phát playlist" className={`animate-toast-in fixed bottom-20 left-3 right-3 z-30 rounded-2xl border border-border/60 bg-surface shadow-lg sm:bottom-5 sm:left-auto sm:right-5 ${minimized ? 'sm:w-56' : 'sm:w-80'}`}>
      <div className="flex items-center gap-2 border-b border-border p-3"><Icon.Volume className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><p className="min-w-0 flex-1 truncate text-sm font-bold">Playlist · {index + 1}/{entries.length}</p><button onClick={() => setMinimized((value) => !value)} className="icon-action grid h-9 w-9 place-items-center rounded-xl bg-bg-tertiary text-xs hover:bg-border" data-tooltip={minimized ? 'Mở rộng' : 'Thu nhỏ'} aria-label={minimized ? 'Mở rộng playlist' : 'Thu nhỏ playlist'}>{minimized ? <Icon.Plus /> : <Icon.Minus />}</button><button onClick={onClose} className="icon-action grid h-9 w-9 place-items-center rounded-xl bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng playlist" data-tooltip="Đóng"><Icon.X /></button></div>
      {!minimized && <div className="p-4"><p className="truncate h2-text font-bold">{entries[index]?.label || entries[index]?.text}</p><p className="mt-1 truncate text-sm text-text-muted">{entries[index]?.sublabel}</p><ProgressBar value={((index + 1) / entries.length) * 100} className="mt-4" /><div className="mt-4 flex items-center justify-center gap-2"><button onClick={() => move(-1)} disabled={index === 0} className="grid h-9 w-9 place-items-center rounded-xl bg-bg-tertiary font-bold disabled:opacity-30 hover:bg-border" title="Trước" aria-label="Bài trước">‹</button><button onClick={() => setPlaying((value) => !value)} className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-white hover:bg-accent/90" aria-label={playing ? 'Tạm dừng' : 'Tiếp tục phát'}>{playing ? 'Ⅱ' : '▶'}</button><button onClick={() => move(1)} disabled={index === entries.length - 1 && !loop} className="grid h-9 w-9 place-items-center rounded-xl bg-bg-tertiary font-bold disabled:opacity-30 hover:bg-border" title="Tiếp" aria-label="Bài tiếp theo">›</button></div><div className="mt-4 flex items-center justify-between gap-2"><select value={rate} onChange={(event) => setRate(Number(event.target.value))} className="rounded-xl border border-border bg-bg-tertiary px-2 py-1.5 text-xs font-bold" aria-label="Tốc độ phát"><option value="0.7">0.7x</option><option value="0.85">0.85x</option><option value="1">1.0x</option></select><label className="flex cursor-pointer items-center gap-2 text-xs font-bold"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Lặp</label></div></div>}
    </aside>
  );
}

export function AchievementToast({ badge, onClose }) {
  const isAchievement = !!(badge?.id && PROFILE_BADGE_ICONS[badge.id]);
  useEffect(() => {
    if (!badge) return undefined;
    if (isAchievement) sounds.achievement();
    if (badge.action) return undefined;
    const timer = setTimeout(onClose, isAchievement ? 5000 : 3500);
    return () => clearTimeout(timer);
  }, [badge, onClose, isAchievement]);
  if (!badge) return null;
  const BadgeIcon = isAchievement ? (PROFILE_BADGE_ICONS[badge.id] || Icon.Star) : null;
  const iconStr = String(badge.icon || '');
  const isError = iconStr === '!';
  const StatusIcon = iconStr === 'srs' ? Icon.Refresh : iconStr === 'goal' ? Icon.Target : iconStr === '✓' ? Icon.Check : null;
  const iconBg = isAchievement ? 'bg-warning-subtle text-warning' : isError ? 'bg-error-subtle text-error' : 'bg-accent-subtle text-accent';
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[110] sm:right-6" role="status" aria-live="polite">
      <div className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-bg-secondary p-4 shadow-md">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg ${iconBg}`} aria-hidden="true">
          {isAchievement ? <BadgeIcon className="h-5 w-5" /> : StatusIcon ? <StatusIcon className="h-5 w-5" /> : iconStr}
        </span>
        <div className="min-w-0 flex-1">
          {isAchievement && <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Thành tựu mới</p>}
          <p className={`font-bold leading-snug ${isAchievement ? 'text-accent' : 'text-text-primary'}`}>{badge.title}</p>
          {badge.description && <p className="mt-0.5 text-sm text-text-secondary">{badge.description}</p>}
          {badge.action && (
            <button type="button" onClick={badge.action.onClick} className="mt-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
              {badge.action.label}
            </button>
          )}
        </div>
        <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-bg-tertiary text-text-muted hover:bg-border" aria-label="Đóng thông báo"><Icon.X className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export function Confetti() {
  const particles = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: ['#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'][i % 5],
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          to { transform: translateY(100vh) rotate(720deg); }
        }
        .confetti-particle {
          position: absolute; top: -20px; width: 10px; height: 10px;
          animation: confetti-fall linear infinite;
        }
      `}</style>
      {particles.map((p) => (
        <div key={p.id} className="confetti-particle" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, backgroundColor: p.color }} />
      ))}
    </div>
  );
}

export function BackgroundLayer({ settings, customBackground, effectiveTheme }) {
  if (!settings || !settings.enableBackground || settings.background === 'none') return null;
  const image = settings.background === 'custom' ? customBackground : `/backgrounds/${settings.background}.webp`;
  if (!image) return null;
  const overlay = Math.min(0.96, (Math.max(88, Number(settings.overlayOpacity) || 88) + (effectiveTheme === 'dark' ? 4 : 0)) / 100);
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})`, filter: `blur(${settings.backgroundBlur}px)`, transform: settings.backgroundBlur > 0 ? 'scale(1.05)' : 'scale(1)' }} />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-bg-primary transition-opacity duration-300" style={{ opacity: overlay }} />
    </>
  );
}

const POMODORO_WORK = 25 * 60;
const POMODORO_BREAK = 5 * 60;

export function usePomodoro(onCompleteRef) {
  const [timer, setTimer] = useState(() => {
    const saved = readStorage('dudu-pomodoro-v1', null);
    return saved && ['work', 'break'].includes(saved.mode)
      ? { isRunning: false, mode: saved.mode, timeLeft: Number(saved.timeLeft) || POMODORO_WORK }
      : { isRunning: false, mode: 'work', timeLeft: POMODORO_WORK };
  });

  useEffect(() => writeStorage('dudu-pomodoro-v1', timer), [timer]);
  useEffect(() => {
    if (!timer.isRunning) return undefined;
    const interval = setInterval(() => {
      setTimer((previous) => {
        if (previous.timeLeft > 1) return { ...previous, timeLeft: previous.timeLeft - 1 };
        const completedWork = previous.mode === 'work';
        const nextMode = completedWork ? 'break' : 'work';
        if (completedWork) onCompleteRef.current?.();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(completedWork ? 'Đến giờ nghỉ 5 phút' : 'Sẵn sàng học tiếp');
        }
        return { isRunning: completedWork, mode: nextMode, timeLeft: nextMode === 'work' ? POMODORO_WORK : POMODORO_BREAK };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.isRunning, onCompleteRef]);

  const duration = timer.mode === 'work' ? POMODORO_WORK : POMODORO_BREAK;
  const percent = ((duration - timer.timeLeft) / duration) * 100;
  const minutes = String(Math.floor(timer.timeLeft / 60)).padStart(2, '0');
  const seconds = String(timer.timeLeft % 60).padStart(2, '0');
  const toggle = () => setTimer((previous) => ({ ...previous, isRunning: !previous.isRunning }));
  const reset = () => setTimer((previous) => ({ isRunning: false, mode: previous.mode, timeLeft: duration }));
  const switchMode = () => setTimer((previous) => {
    const mode = previous.mode === 'work' ? 'break' : 'work';
    return { isRunning: false, mode, timeLeft: mode === 'work' ? POMODORO_WORK : POMODORO_BREAK };
  });
  return { ...timer, duration, percent, minutes, seconds, toggle, reset, switchMode };
}

export function PomodoroCard({ pomodoro, compact = false }) {
  const label = pomodoro.mode === 'work' ? 'Phiên học' : 'Giờ nghỉ';
  return (
    <section className={compact ? 'rounded-3xl border border-border/60 bg-surface px-4 py-3.5 shadow-lg' : 'rounded-3xl border border-border/60 bg-surface px-5 py-3.5 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:shadow-md'}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon.Clock className={`h-4 w-4 shrink-0 ${pomodoro.mode === 'work' ? 'text-accent-2' : 'text-success'}`} />
          <h3 className="font-sans text-[15px] font-semibold text-text-primary">{label}</h3>
        </div>
        <button type="button" onClick={pomodoro.switchMode} className="rounded-full bg-subtle px-2.5 py-0.5 text-[11px] font-medium text-text-muted transition-[background-color,color,transform] duration-200 ease-out hover:bg-accent-subtle hover:text-accent active:scale-[0.98] focus-visible:ring-2">
          {pomodoro.mode === 'work' ? '5 phút nghỉ' : '25 phút học'}
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="font-sans text-2xl font-bold leading-none tracking-tight text-text-primary tabular-nums">{pomodoro.minutes}:{pomodoro.seconds}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={pomodoro.toggle} className="btn-soft rounded-full px-4 py-1.5 text-xs active:scale-[0.98] focus-visible:ring-2">{pomodoro.isRunning ? 'Tạm dừng' : 'Bắt đầu'}</button>
          <button type="button" onClick={pomodoro.reset} className="btn-ghost icon-action grid h-8 w-8 place-items-center rounded-full p-0 text-text-muted hover:text-text-primary active:scale-[0.98] focus-visible:ring-2" aria-label="Đặt lại Pomodoro" data-tooltip="Đặt lại"><Icon.Refresh className="h-4 w-4" /></button>
        </div>
      </div>
      <ProgressBar value={pomodoro.percent} label="Tiến độ Pomodoro" className="mt-2.5 h-1" />
    </section>
  );
}

export function PomodoroDock({ pomodoro, sessionsToday }) {
  const [open, setOpen] = useState(false);
  const running = pomodoro.isRunning;
  return (
    <div className="fixed bottom-20 right-5 z-30 lg:bottom-5 xl:hidden">
      {open && (
        <div className="mb-2 w-[min(19rem,calc(100vw-2.5rem))]">
          <PomodoroCard pomodoro={pomodoro} compact />
          <p className="mt-1 text-right text-[11px] font-semibold text-text-muted tabular-nums">{sessionsToday} phiên hôm nay</p>
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Đóng bộ hẹn giờ Pomodoro' : 'Mở bộ hẹn giờ Pomodoro'} aria-expanded={open} className={`ml-auto flex h-11 items-center gap-2 rounded-full border border-border/60 bg-surface px-3.5 shadow-md transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:bg-subtle active:scale-[0.98] focus-visible:ring-2 ${running ? 'text-accent' : 'text-text-secondary'}`}>
        <Icon.Clock className="h-4 w-4" />
        <span className="text-xs font-bold tabular-nums">{pomodoro.minutes}:{pomodoro.seconds}</span>
      </button>
    </div>
  );
}
