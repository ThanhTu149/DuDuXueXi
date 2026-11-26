import { GLOSSARY, QUIZZES } from '../data-loader.js';
import { Icon, ProgressBar } from '../components/StudyUi.jsx';
import { LESSONS } from '../lib/progressState.js';
import { getLessonThumbnail } from '../lib/studyHelpers.js';

function HomeSectionHeader({ title, onAction }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-serif text-[18px] font-semibold text-text-primary">{title}</h2>
      <button onClick={onAction} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-accent transition-[background-color,color,transform] duration-200 ease-out hover:bg-accent-subtle hover:text-accent-hover active:scale-[0.98] focus-visible:ring-2">
        Xem tất cả<Icon.ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function HomeScreen({ progress, courseName = 'Hán Ngữ Tập 2', onOpenLesson, onNavigate }) {
  const unlocked = progress.unlockedBai?.length ? progress.unlockedBai : [1];
  const currentBai = unlocked.find((bai) => !progress.baiProgress?.[bai]?.completed) || Math.max(...unlocked);
  const currentGlossary = GLOSSARY[currentBai];
  const currentQuiz = QUIZZES[currentBai];
  const currentProgress = progress.baiProgress?.[currentBai] || {};
  const totalQuestions = currentQuiz?.questions?.length || 30;
  const completedQuestions = Math.min(totalQuestions, currentProgress.quizDone || 0);
  const completion = currentProgress.completed ? 100 : Math.round((completedQuestions / totalQuestions) * 100);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const dailyGoal = Math.max(1, Number(progress.dailyGoal) || 20);
  const todayCount = Number(progress.todayCount) || 0;
  const remainingToday = Math.max(0, dailyGoal - todayCount);
  const heroSubtitle = todayCount === 0
    ? 'Bắt đầu một bài ngắn hôm nay — chỉ 5 phút cũng đủ giữ chuỗi học.'
    : remainingToday === 0
      ? 'Bạn đã chạm mục tiêu hôm nay. Nghỉ một chút hoặc thử thách thêm nhé!'
      : `Bạn đã hoàn thành ${todayCount} câu hôm nay — thêm ${remainingToday} câu nữa là chạm mục tiêu.`;
  const currentThumb = getLessonThumbnail({
    id: currentBai,
    title_zh: currentGlossary?.metadata?.title_zh,
    title_vi: currentGlossary?.metadata?.title_vi,
  });
  const totalWords = Object.values(GLOSSARY).reduce((sum, lesson) => sum + (lesson?.entries || []).filter((entry) => entry.type === 'word').length, 0);
  const totalGrammar = Object.values(GLOSSARY).reduce((sum, lesson) => sum + (lesson?.entries || []).filter((entry) => entry.type === 'grammar').length, 0);
  const skillCards = [
    {
      id: 'dictation',
      title: 'Chính tả',
      caption: `${progress.advancedStats?.dictationSessions || 0} phiên`,
      icon: <Icon.Headphones className="h-[18px] w-[18px]" />,
      cardTone: 'border-violet-200/70 bg-violet-50/90 hover:border-violet-300/90 hover:bg-violet-100/70 dark:border-white/5 dark:bg-violet-500/10 dark:hover:border-violet-400/25 dark:hover:bg-violet-500/15',
      badgeTone: 'bg-violet-600 text-white dark:bg-violet-500/25 dark:text-violet-300',
      arrowTone: 'group-hover:text-violet-700 dark:group-hover:text-violet-300',
    },
    {
      id: 'pronunciation',
      title: 'Phát âm',
      caption: `${progress.advancedStats?.pronunciationAttempts || 0} lượt`,
      icon: <Icon.Mic className="h-[18px] w-[18px]" />,
      cardTone: 'border-rose-200/70 bg-rose-50/90 hover:border-rose-300/90 hover:bg-rose-100/70 dark:border-white/5 dark:bg-rose-500/10 dark:hover:border-rose-400/25 dark:hover:bg-rose-500/15',
      badgeTone: 'bg-rose-500 text-white dark:bg-rose-500/25 dark:text-rose-300',
      arrowTone: 'group-hover:text-rose-700 dark:group-hover:text-rose-300',
    },
    {
      id: 'learn',
      title: 'Từ vựng',
      caption: `${totalWords} từ`,
      icon: <Icon.Book className="h-[18px] w-[18px]" />,
      cardTone: 'border-emerald-200/70 bg-emerald-50/90 hover:border-emerald-300/90 hover:bg-emerald-100/70 dark:border-white/5 dark:bg-emerald-500/10 dark:hover:border-emerald-400/25 dark:hover:bg-emerald-500/15',
      badgeTone: 'bg-emerald-600 text-white dark:bg-emerald-500/25 dark:text-emerald-300',
      arrowTone: 'group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
    },
    {
      id: 'learn',
      title: 'Ngữ pháp',
      caption: `${totalGrammar} điểm`,
      icon: <Icon.Pen className="h-[18px] w-[18px]" />,
      cardTone: 'border-amber-200/70 bg-amber-50/90 hover:border-amber-300/90 hover:bg-amber-100/70 dark:border-white/5 dark:bg-amber-500/10 dark:hover:border-amber-400/25 dark:hover:bg-amber-500/15',
      badgeTone: 'bg-amber-600 text-white dark:bg-amber-500/25 dark:text-amber-300',
      arrowTone: 'group-hover:text-amber-700 dark:group-hover:text-amber-300',
    },
  ];
  const recentLessons = [...new Set([...unlocked.slice().reverse(), ...LESSONS])].slice(0, 5);
  return (
    <div className="space-y-6">
      <section className="relative flex min-h-[216px] items-center overflow-hidden rounded-3xl border border-border/60 bg-surface p-6 shadow-sm sm:min-h-[224px] sm:px-7 sm:py-6">
        <img
          src="/images/hero-panda-banner.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover object-[right_35%] dark:hidden"
        />
        <img
          src="/images/hero-panda-banner-dark.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 hidden h-full w-full select-none object-cover object-[right_35%] dark:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg-secondary/95 via-bg-secondary/85 to-bg-secondary/65 sm:via-bg-secondary/60 sm:to-transparent dark:from-bg-secondary/92 dark:via-bg-secondary/78 dark:to-bg-secondary/45 sm:dark:from-bg-secondary/85 sm:dark:via-bg-secondary/40 sm:dark:to-transparent"
        />
        <div className="relative z-10 max-w-[380px] sm:max-w-[420px] xl:max-w-[360px] min-[1400px]:max-w-[500px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">{greeting},</p>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary shadow-xs backdrop-blur-md transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-border-strong hover:bg-surface hover:text-text-primary active:scale-[0.98] focus-visible:ring-2"
              title="Đổi khóa học trong thư viện"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              <span className="max-w-[150px] truncate">{courseName}</span>
              <Icon.ChevronRight className="h-3 w-3 text-text-muted" />
            </button>
          </div>
          <h1 className="mt-1.5 break-words font-serif text-[26px] font-bold leading-tight text-text-primary sm:text-[32px]">
            {progress.profile?.name ? <>{progress.profile.name} <span className="inline-block align-middle text-[22px]">👋</span></> : <>Hôm nay học gì? <span className="inline-block align-middle text-[22px]">👋</span></>}
          </h1>
          <p className="mt-2 max-w-[350px] text-pretty text-sm leading-relaxed text-text-secondary sm:max-w-[400px] xl:max-w-[350px] min-[1400px]:max-w-lg">{heroSubtitle}</p>
          <div className="mt-5">
            <button onClick={() => onOpenLesson(currentBai)} className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 active:scale-[0.98] focus-visible:ring-2 sm:w-auto">
              <span>Tiếp tục học</span>
              <Icon.ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section>
        <HomeSectionHeader title="Tiếp tục học" onAction={() => onNavigate('learn')} />
        <article
          onClick={() => onOpenLesson(currentBai)}
          className="group flex cursor-pointer flex-col gap-4 rounded-3xl border border-border/60 bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-md active:scale-[0.98] sm:flex-row sm:items-center sm:gap-5 sm:p-5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-2xl bg-subtle ring-1 ring-border/40 sm:h-[88px] sm:w-32">
              <img
                src={currentThumb.src}
                alt=""
                aria-hidden="true"
                decoding="async"
                className={`h-full w-full object-cover transition-transform duration-300 ease-out dark:brightness-[0.88] ${currentThumb.cropClass}`}
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold leading-tight text-white backdrop-blur-sm tabular-nums">
                {String(currentBai).padStart(2, '0')}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted tabular-nums">Bài {currentBai} · {completedQuestions}/{totalQuestions} câu</p>
              <h3 className="mt-0.5 truncate font-hanzi text-lg font-semibold text-text-primary sm:text-[20px]" lang="zh-Hans">{currentGlossary?.metadata?.title_zh || `Bài ${currentBai}`}</h3>
              <p className="truncate text-sm text-text-secondary">{currentGlossary?.metadata?.title_vi || 'Tiếp tục hành trình học tập'}</p>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar value={completion} className="h-2 flex-1" />
                <span className="text-xs font-semibold text-text-secondary tabular-nums">{completion}%</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpenLesson(currentBai); }}
            className="btn-soft flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 active:scale-[0.98] focus-visible:ring-2 group-hover:border-accent group-hover:bg-accent group-hover:text-[var(--on-accent)] hover:border-accent-hover hover:bg-accent-hover"
          >
            <Icon.Play className="h-4 w-4" />
            <span>Bắt đầu</span>
          </button>
        </article>
      </section>

      <section>
        <HomeSectionHeader title="Kỹ năng" onAction={() => onNavigate('review')} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {skillCards.map((skill, index) => (
            <button
              key={`${skill.id}-${index}`}
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => onNavigate(skill.id)}
              className={`animate-card-reveal group rounded-2xl border p-4 text-left shadow-xs transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:ring-2 ${skill.cardTone}`}
            >
              <span className={`grid h-10 w-10 place-items-center rounded-2xl shadow-xs transition-transform duration-200 ease-out group-hover:-rotate-3 group-hover:scale-105 ${skill.badgeTone}`}>{skill.icon}</span>
              <span className="mt-3 block font-sans text-[15px] font-semibold text-text-primary">{skill.title}</span>
              <span className="mt-0.5 flex items-center justify-between text-xs font-medium text-text-secondary tabular-nums">
                <span>{skill.caption}</span>
                <Icon.ChevronRight className={`h-4 w-4 text-text-muted transition-[transform,color] duration-200 ease-out group-hover:translate-x-0.5 ${skill.arrowTone}`} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <HomeSectionHeader title="Bài học gần đây" onAction={() => onNavigate('learn')} />
        <div className="space-y-2.5">
          {recentLessons.map((bai) => {
            const isUnlocked = unlocked.includes(bai);
            const item = progress.baiProgress?.[bai] || {};
            const quizTotal = QUIZZES[bai]?.questions?.length || 30;
            const percent = item.completed ? 100 : Math.round(((item.quizDone || 0) / quizTotal) * 100);
            const accuracy = item.quizDone ? Math.round(((item.quizCorrect || 0) / item.quizDone) * 100) : 0;
            const metadata = GLOSSARY[bai]?.metadata || {};
            const thumb = getLessonThumbnail({ id: bai, title_zh: metadata.title_zh, title_vi: metadata.title_vi });
            return (
              <button
                key={bai}
                disabled={!isUnlocked}
                onClick={() => isUnlocked && onOpenLesson(bai)}
                className={`group grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out focus-visible:ring-2 sm:grid-cols-[64px_minmax(0,1fr)_96px] sm:gap-4 sm:p-4 ${isUnlocked ? 'border-border/60 bg-surface shadow-xs hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-md active:scale-[0.98]' : 'cursor-not-allowed border-border/45 bg-subtle opacity-60'}`}
              >
                <span className="relative block h-12 w-16 overflow-hidden rounded-xl bg-subtle ring-1 ring-border/40">
                  <img
                    src={thumb.src}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover transition-transform duration-300 ease-out dark:brightness-[0.88] ${thumb.cropClass} ${isUnlocked ? '' : 'grayscale-[45%] opacity-75'}`}
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white backdrop-blur-sm tabular-nums">
                    {String(bai).padStart(2, '0')}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">Bài {bai}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${item.completed ? 'bg-success-subtle text-success' : isUnlocked ? 'bg-warning-subtle text-warning' : 'bg-surface text-text-muted'}`}>
                      {item.completed ? 'Đã xong' : isUnlocked ? 'Đang học' : 'Đã khóa'}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-hanzi text-[16px] font-medium text-text-primary" lang="zh-Hans">{metadata.title_zh || `Bài ${bai}`}</span>
                  <span className="block truncate text-xs text-text-muted">{metadata.title_vi || `${quizTotal} câu hỏi`}</span>
                </span>
                <span className="col-span-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-right sm:col-span-1 sm:block sm:w-24">
                  <span className="text-xs font-semibold text-text-secondary tabular-nums">{isUnlocked ? `${percent}%` : '—'}</span>
                  <ProgressBar value={percent} label={`Tiến độ bài ${bai}`} className="h-1.5 sm:mt-2" />
                  {isUnlocked && <span className="text-[10px] text-text-muted tabular-nums sm:mt-1 sm:block">{accuracy}% chính xác</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
