import { useEffect, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES } from '../data-loader.js';
import { getDueEntries } from '../lib/pedagogy.js';
import { getWeekKey, localDate } from '../lib/progressState.js';
import { EXTRA_NAV, Icon, NAV_ITEMS, PomodoroCard } from './StudyUi.jsx';

export function Header({ progress, onSearch, onNavigate, themeMode, onThemeChange, onMenu, onShortcuts, hidden = false, focused = false }) {
  const nextTheme = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
  const themeLabel = themeMode === 'dark' ? 'Tối' : themeMode === 'light' ? 'Sáng' : 'Tự động';
  return (
    <header className={`app-header bg-bg-primary/80 backdrop-blur-md transition-transform duration-200 ease-out ${hidden ? '-translate-y-full' : ''}`}>
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {!focused && (
            <button onClick={onMenu} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 bg-surface text-text-secondary shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:bg-subtle active:scale-[0.98] lg:hidden" aria-label="Mở menu">
              <span className="space-y-1"><span className="block h-px w-4 bg-current" /><span className="block h-px w-4 bg-current" /><span className="block h-px w-4 bg-current" /></span>
            </button>
          )}
          {focused ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-subtle text-base" role="img" aria-label="Trúc">🐼</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">Đang luyện tập</p>
                <p className="truncate text-[11px] leading-tight text-text-muted">Giữ nhịp tập trung nhé</p>
              </div>
            </div>
          ) : (
            <button onClick={onSearch} aria-label="Tìm kiếm hoặc mở lệnh" aria-keyshortcuts="Control+K" className="flex h-10 w-full max-w-[420px] min-w-0 items-center justify-between gap-2.5 rounded-full border border-border/60 bg-surface px-4 text-text-muted shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:shadow-sm active:scale-[0.99] focus-visible:border-accent">
              <div className="flex min-w-0 items-center gap-2.5 text-sm">
                <Icon.Search className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="truncate">Tìm từ vựng, ngữ pháp...</span>
              </div>
              <kbd className="hidden shrink-0 rounded-full border border-border/60 bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted sm:inline-block">Ctrl K</kbd>
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onNavigate('dashboard')} className="hidden h-10 items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3.5 text-[13px] font-semibold text-text-primary shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm active:scale-[0.98] focus-visible:ring-2 sm:inline-flex" title="Xem chuỗi ngày học" aria-label={`Chuỗi ${progress.streak} ngày`}><Icon.Flame className="h-4 w-4 text-accent-orange" /><span className="tabular-nums">{progress.streak}</span></button>
          <button onClick={() => onNavigate('dashboard')} className="hidden h-10 items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3.5 text-[13px] font-semibold text-text-primary shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm active:scale-[0.98] focus-visible:ring-2 sm:inline-flex" title="Xem XP" aria-label={`${progress.xp} điểm XP`}><Icon.Zap className="h-4 w-4 text-warning" /><span className="tabular-nums">{progress.xp} XP</span></button>
          <button onClick={onShortcuts} className="hidden h-10 w-10 place-items-center rounded-full border border-border/60 bg-surface text-[13px] font-semibold text-text-secondary shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-subtle hover:text-text-primary active:scale-[0.98] focus-visible:ring-2 md:grid" title="Phím tắt (Ctrl + /)" aria-label="Xem phím tắt">?</button>
          <button onClick={() => onThemeChange(nextTheme)} className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-surface text-text-secondary shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-subtle hover:text-text-primary active:scale-[0.98] focus-visible:ring-2" title={`Giao diện: ${themeLabel} — bấm để đổi`} aria-label={`Giao diện đang ${themeLabel}, bấm để đổi`}>{themeMode === 'dark' ? <Icon.Moon className="h-[18px] w-[18px]" /> : <Icon.Sun className="h-[18px] w-[18px]" />}</button>
        </div>
      </div>
    </header>
  );
}

export function Sidebar({ screen, progress, onNavigate, mobileOpen, onClose, cloud = null, onOpenAuth = null }) {
  const primaryPractice = EXTRA_NAV.slice(0, 4);
  const secondaryPractice = EXTRA_NAV.slice(4);
  const isSecondaryActive = secondaryPractice.some((item) => item.id === screen);
  const [moreOpen, setMoreOpen] = useState(isSecondaryActive);

  useEffect(() => {
    if (isSecondaryActive) setMoreOpen(true);
  }, [isSecondaryActive]);

  return (
    <>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={onClose} aria-label="Đóng menu" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[232px] flex-col border-r border-border/60 bg-surface px-3.5 py-3.5 shadow-xs transition-transform duration-200 ease-out lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu chính">
        <div className="flex h-10 shrink-0 items-center justify-between px-1.5">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5 text-left" aria-label="Về trang chủ">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent-subtle to-accent-2-subtle text-lg shadow-xs" role="img" aria-label="Trúc">🐼</span>
            <span className="min-w-0"><span className="block truncate font-serif text-[17px] font-bold leading-tight text-text-primary">DuDu Hán Ngữ</span><span className="block truncate text-[11px] text-text-muted">Học mỗi ngày</span></span>
          </button>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition-[background-color,color] duration-200 ease-out hover:bg-subtle hover:text-text-primary lg:hidden" aria-label="Đóng menu"><Icon.X /></button>
        </div>
        <nav aria-label="Menu chính" className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">Chính</div>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`nav-item py-2 text-sm ${screen === item.id ? 'active bg-accent-subtle font-medium text-accent' : ''}`}>
                {item.icon}<span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="mb-1 mt-3.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">Luyện tập</div>
          <div className="space-y-0.5">
            {primaryPractice.map((item) => (
              <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`nav-item py-2 text-sm ${screen === item.id ? 'active bg-accent-subtle font-medium text-accent' : ''}`}>
                {item.icon}<span className="truncate">{item.label}</span>
              </button>
            ))}
            <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className="nav-item py-2 text-sm text-text-muted">
              <Icon.ChevronRight className={`h-4 w-4 transition-transform duration-200 ease-out ${moreOpen ? 'rotate-90' : ''}`} />
              <span className="truncate">{moreOpen ? 'Thu gọn kỹ năng' : `Kỹ năng khác (${secondaryPractice.length})`}</span>
            </button>
            {moreOpen && (
              <div className="space-y-0.5 pl-2">
                {secondaryPractice.map((item) => (
                  <button key={item.id} onClick={() => onNavigate(item.id)} aria-current={screen === item.id ? 'page' : undefined} className={`nav-item py-2 text-sm ${screen === item.id ? 'active bg-accent-subtle font-medium text-accent' : ''}`}>
                    {item.icon}<span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="mt-auto shrink-0 space-y-2 border-t border-border/50 pt-3">
          {cloud?.serverAvailable && !cloud.authenticated && (
            <button onClick={() => { onClose(); onOpenAuth?.('login'); }} className="btn-outline flex w-full items-center justify-center gap-2 rounded-full py-2 text-xs">
              <Icon.Cloud className="h-4 w-4 text-accent" />
              <span>Đăng nhập đồng bộ</span>
            </button>
          )}
          <button onClick={() => onNavigate('dashboard')} className="flex w-full min-w-0 items-center gap-2.5 rounded-2xl p-2 text-left transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:bg-subtle active:scale-[0.98]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-2-subtle text-xl" role="img" aria-label="Băng">🐧</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text-primary">{cloud?.user?.displayName || progress.profile?.name || 'Học viên'}</span>
              <span className="block truncate text-[11px] text-text-muted">{cloud?.authenticated ? `@${cloud.user?.username} · ${cloud.syncState === 'syncing' ? 'Đang đồng bộ' : 'Đám mây'}` : `Cấp ${Math.max(1, Math.floor((progress.xp || 0) / 250) + 1)} · ${progress.xp || 0} XP`}</span>
            </span>
            <Icon.Settings className="h-[17px] w-[17px] shrink-0 text-text-muted" />
          </button>
        </div>
      </aside>
    </>
  );
}

export function RightPanel({ progress, onNavigate, pomodoro, showStackedBelowXl = false }) {
  const goal = Math.max(1, Number(progress.dailyGoal) || 20);
  const done = Math.max(0, Number(progress.todayCount) || 0);
  const goalPercent = Math.min(100, Math.round((done / goal) * 100));
  const circumference = 2 * Math.PI * 38;
  const dueCount = getDueEntries(progress.srs || {}, ALL_GLOSSARY_ENTRIES).length;
  const lastSeven = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDate(date);
    return { key, label: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()], active: Boolean(progress.studyDays?.[key]?.questions || progress.studyDays?.[key]?.xp), today: index === 6 };
  });
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const thisWeekXp = Number(progress.weeklyXP?.[getWeekKey(monday)]) || 0;
  const streakTarget = progress.streak < 3 ? 3 : progress.streak < 7 ? 7 : 10;
  const panelClass = 'rounded-3xl border border-border/60 bg-surface px-5 py-4 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:shadow-md';
  const asideClass = showStackedBelowXl
    ? 'mx-auto w-full max-w-[840px] px-4 pb-24 pt-2 sm:px-6 lg:px-8 lg:pb-12 xl:mx-0 xl:w-full xl:max-w-none xl:shrink-0 xl:px-0 xl:pb-20 xl:pt-5'
    : 'hidden w-full shrink-0 pb-20 pt-5 xl:block';
  return (
    <aside className={asideClass} aria-label="Bảng tiến độ">
      <div className={showStackedBelowXl ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 xl:gap-3.5' : 'space-y-3.5'}>
        <section className={panelClass}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon.Target className="h-[17px] w-[17px] text-accent" />
              <h2 className="font-serif text-[16px] font-semibold text-text-primary">Tiến độ hôm nay</h2>
            </div>
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">{thisWeekXp} XP tuần</span>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-[80px] w-[80px] shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" role="img" aria-label={`Đã đạt ${goalPercent}% mục tiêu hôm nay`}>
                <defs>
                  <linearGradient id="goalRing" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--accent-2)" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-tertiary)" strokeWidth="7.5" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="url(#goalRing)" strokeWidth="7.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - goalPercent / 100)} style={{ '--ring-length': circumference }} className="animate-ring-progress" />
              </svg>
              <span className="absolute inset-0 grid place-items-center font-sans text-[15px] font-bold text-text-primary tabular-nums">{goalPercent}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1 whitespace-nowrap font-sans tabular-nums">
                <span className="text-2xl font-bold leading-none tracking-tight text-text-primary">{done}</span>
                <span className="text-sm font-medium text-text-muted">/ {goal}</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">câu hôm nay</p>
              <p className="mt-1.5 text-xs font-semibold text-accent">{goalPercent >= 100 ? 'Đã hoàn thành!' : goalPercent >= 60 ? 'Sắp chạm mục tiêu!' : done === 0 ? 'Bắt đầu một câu nào!' : 'Cố lên, sắp xong rồi!'}</p>
            </div>
          </div>

          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Icon.Flame className="h-3.5 w-3.5 text-accent-orange" />
                <span className="text-xs font-semibold text-text-primary tabular-nums">Chuỗi {progress.streak} ngày</span>
                <span title="Khiên tự động giữ chuỗi nếu lỡ nghỉ 1 ngày (nhận thêm mỗi 7 ngày liên tiếp, tối đa 2)" className="rounded-full bg-accent-2-subtle px-1.5 py-0.5 text-[10px] font-semibold text-accent-2 tabular-nums">🛡 {progress.streakFreezes ?? 1}</span>
              </div>
              <span className="text-[11px] font-medium text-text-muted">7 ngày qua</span>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {lastSeven.map((day) => (
                <div key={day.key} className="text-center">
                  <span className="block text-[10px] font-medium uppercase text-text-muted">{day.label}</span>
                  <span title={day.key} className={`mx-auto mt-1.5 grid h-7 w-7 place-items-center rounded-full border ${day.active ? 'border-accent bg-accent text-[var(--on-accent)] shadow-xs' : day.today ? 'streak-today border-accent bg-accent-subtle/60 text-accent dark:bg-accent/15' : 'border-border/80 bg-bg-tertiary/70 text-text-muted dark:border-white/15 dark:bg-white/[0.06]'}`}>{day.active && <Icon.Check className="h-3.5 w-3.5" />}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-text-muted">
              <span className="truncate tabular-nums">{progress.achievements.length} huy hiệu · mốc {streakTarget} ngày</span>
              <button type="button" onClick={() => onNavigate('dashboard')} className="shrink-0 rounded-full px-1.5 py-0.5 font-semibold text-accent transition-[background-color,color,transform] duration-200 ease-out hover:bg-accent-subtle hover:text-accent-hover active:scale-[0.98] focus-visible:ring-2">Chi tiết →</button>
            </div>
          </div>
        </section>

        <div className="space-y-3.5">
          <section className={dueCount > 0 ? 'rounded-3xl border border-accent/20 bg-accent-subtle/75 px-5 py-4 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-accent/35 hover:shadow-md' : panelClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${dueCount > 0 ? 'text-accent' : 'text-text-muted'}`}>Ôn tập thông minh</p>
                <h3 className="mt-1 font-sans text-base font-semibold leading-snug text-text-primary tabular-nums">{dueCount > 0 ? `${dueCount} từ đến hạn` : 'Chưa có từ cần ôn'}</h3>
                <p className="mt-1 text-pretty text-xs leading-relaxed text-text-secondary">{dueCount > 0 ? 'Ôn đúng lúc giúp nhớ lâu gấp đôi.' : 'Đọc xong một bài, từ mới sẽ tự vào lịch ôn.'}</p>
              </div>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${dueCount > 0 ? 'bg-surface text-accent shadow-xs' : 'bg-subtle text-text-muted'}`}><Icon.Refresh className="h-4 w-4" /></span>
            </div>
            <button type="button" onClick={() => onNavigate('review')} className={`${dueCount > 0 ? 'btn-primary' : 'btn-soft'} mt-3 w-full rounded-full py-2 text-xs active:scale-[0.98] focus-visible:ring-2`}>
              {dueCount > 0 ? 'Ôn ngay' : 'Xem sổ ôn tập'}
            </button>
          </section>

          {pomodoro && <PomodoroCard pomodoro={pomodoro} />}
        </div>
      </div>
    </aside>
  );
}
