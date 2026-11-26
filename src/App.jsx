import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES, ALL_QUESTIONS, GLOSSARY, QUIZZES, activateCourseData, applyBuiltInEdits } from './data-loader.js';
import { BUILT_IN_COURSE_ID, getCourse, getProgress, getSettings, migrateBuiltInCourse, saveProgress, saveSettings, subscribeDbChanges, subscribeDbState } from './lib/db.js';
import { updateGrammarInCourse, updateQuestionInCourse, updateWordInCourse } from './lib/courseContent.js';
import { getActiveProcessingJobs, resumeInterruptedJobs, subscribeProcessingJobs } from './lib/processingJobs.js';
import { mergeProgressData, readProgress, subscribeStorageChanges, writeProgress } from './lib/storage.js';
import {
  SRS_ELIGIBLE_TYPES,
  calculateNextReview,
  createSrsEntry,
  evaluateLessonMastery,
  unsuspendSrsEntry,
} from './lib/pedagogy.js';
import {
  getCloudState,
  initCloudSession,
  queueProgressCloudSync,
  subscribeCloudState,
  syncAllWithCloud,
  syncCourseToCloud,
  syncProfileUpdate,
  syncSettingsToCloud,
  trackStudyEvent,
} from './lib/cloudSync.js';
import {
  LESSONS,
  TYPING_TYPES,
  XP_REWARDS,
  addDays,
  buildHashRoute,
  cloneProgressForUpdate,
  createInitialProgress,
  evaluateAchievements,
  getWeekKey,
  localDate,
  mergeProgress,
  parseHashRoute,
  previousDate,
  progressForCourse,
  readRawStorage,
  readStorage,
  rolloverDailyProgress,
  shuffleArray,
  writeStorage,
} from './lib/progressState.js';
import { refreshPinyinIndex } from './lib/studyHelpers.js';
import { THEMES, applyTheme, getAutoTheme } from './lib/theme.js';
import AuthModal from './components/AuthModal.jsx';
import GlobalCourseSearch from './components/GlobalCourseSearch.jsx';
import ContentEditorModal from './components/editors/ContentEditorModal.jsx';
import TypingEditorModal from './components/editors/TypingEditorModal.jsx';
import WordEditorModal from './components/editors/WordEditorModal.jsx';
import { Header, RightPanel, Sidebar } from './components/AppShell.jsx';
import {
  AchievementToast,
  BackgroundLayer,
  BottomNav,
  CharacterDetailModal,
  EmptyState,
  GlossaryModal,
  KeyboardShortcutsModal,
  PlaylistFloatingPlayer,
  PomodoroDock,
  usePomodoro,
} from './components/StudyUi.jsx';
import HomeScreen from './screens/HomeScreen.jsx';

const LibraryScreen = lazy(() => import('./screens/LibraryScreen.jsx'));
const ImportScreen = lazy(() => import('./screens/ImportScreen.jsx'));
const ProcessingScreen = lazy(() => import('./screens/ProcessingScreen.jsx'));
const ReviewGeneratedScreen = lazy(() => import('./screens/ReviewGeneratedScreen.jsx'));
const CommunityScreen = lazy(() => import('./screens/CommunityScreen.jsx'));
const AiTutorScreen = lazy(() => import('./screens/AiTutorScreen.jsx'));
const LearnScreen = lazy(() => import('./screens/LearnScreen.jsx'));
const QuizScreen = lazy(() => import('./screens/QuizScreen.jsx'));
const ReviewScreen = lazy(() => import('./screens/ReviewScreen.jsx'));
const ExamScreen = lazy(() => import('./screens/ExamScreen.jsx'));
const BossBattleScreen = lazy(() => import('./screens/BossBattleScreen.jsx'));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen.jsx'));
const MatchingGame = lazy(() => import('./screens/PracticeScreens.jsx').then((m) => ({ default: m.MatchingGame })));
const DictationScreen = lazy(() => import('./screens/PracticeScreens.jsx').then((m) => ({ default: m.DictationScreen })));
const PronunciationScreen = lazy(() => import('./screens/PracticeScreens.jsx').then((m) => ({ default: m.PronunciationScreen })));
const SentenceMiningScreen = lazy(() => import('./screens/PracticeScreens.jsx').then((m) => ({ default: m.SentenceMiningScreen })));

export default function App() {
  const initialRouteRef = useRef(null);
  if (initialRouteRef.current === null) {
    initialRouteRef.current = typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : null;
  }
  const [screen, setScreen] = useState(initialRouteRef.current?.screen || 'home');
  const [currentBai, setCurrentBai] = useState(initialRouteRef.current?.bai || 1);
  // Read once, outside the state initializer, so the "progress was corrupt"
  // diagnostic can be surfaced as a toast after the first render.
  const bootProgressRef = useRef(null);
  if (bootProgressRef.current === null) bootProgressRef.current = readProgress();
  const [progress, setProgress] = useState(() => {
    const saved = bootProgressRef.current?.progress || null;
    const merged = mergeProgress(saved);
    if (!saved?.themeMode) merged.themeMode = readStorage('dudu-theme-mode', readStorage('dudu-dark', false) ? 'dark' : 'auto');
    return rolloverDailyProgress(merged);
  });
  const [effectiveTheme, setEffectiveTheme] = useState(() => (progress.themeMode === 'auto' ? getAutoTheme() : progress.themeMode));
  const [glossaryEntry, setGlossaryEntry] = useState(null);
  const [toast, setToast] = useState(null);
  const [quizSession, setQuizSession] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [characterDetail, setCharacterDetail] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customBackground, setCustomBackground] = useState(() => readRawStorage('customBg', null));
  const [wordOverrides, setWordOverrides] = useState({});
  const [wordEditorReady, setWordEditorReady] = useState(false);
  const [wordEditorError, setWordEditorError] = useState('');
  const [editingWord, setEditingWord] = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [dashboardTab, setDashboardTab] = useState(initialRouteRef.current?.dashboardTab || 'overview');
  const [activeCourseId, setActiveCourseId] = useState(BUILT_IN_COURSE_ID);
  const [activeCourse, setActiveCourse] = useState(null);
  const [courseReady, setCourseReady] = useState(false);
  const [targetCourseId, setTargetCourseId] = useState(null);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [processingJobs, setProcessingJobs] = useState(() => getActiveProcessingJobs());
  const [headerHidden, setHeaderHidden] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [cloud, setCloud] = useState(() => getCloudState());
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' });

  const progressRef = useRef(progress);
  const goKeyRef = useRef(0);
  const pomodoroCompleteRef = useRef(() => {});
  const pomodoro = usePomodoro(pomodoroCompleteRef);
  const remoteAppliedAtRef = useRef('');
  const activeCourseRef = useRef(activeCourse);
  const activeCourseIdRef = useRef(activeCourseId);
  const applyingHashRef = useRef(false);
  const screenRef = useRef(screen);
  const currentBaiRef = useRef(currentBai);
  const dashboardTabRef = useRef(dashboardTab);
  const mainRef = useRef(null);
  const mountedScreenRef = useRef(false);

  activeCourseRef.current = activeCourse;
  activeCourseIdRef.current = activeCourseId;
  progressRef.current = progress;
  screenRef.current = screen;
  currentBaiRef.current = currentBai;
  dashboardTabRef.current = dashboardTab;

  useEffect(() => {
    const titles = {
      home: 'DuDu Hán Ngữ — Học Hán ngữ mỗi ngày',
      library: 'Thư viện — DuDu Hán Ngữ',
      learn: `Bài ${currentBai} · Học — DuDu Hán Ngữ`,
      quiz: `Bài ${currentBai} · Quiz — DuDu Hán Ngữ`,
      review: 'Ôn tập SRS — DuDu Hán Ngữ',
      dashboard: 'Hồ sơ & Cài đặt — DuDu Hán Ngữ',
      community: 'Cộng đồng — DuDu Hán Ngữ',
      tutor: 'Gia sư AI — DuDu Hán Ngữ',
      exam: 'Thi thử — DuDu Hán Ngữ',
      boss: 'Boss Battle — DuDu Hán Ngữ',
      minigame: 'Ghép từ — DuDu Hán Ngữ',
      dictation: 'Chính tả — DuDu Hán Ngữ',
      pronunciation: 'Phát âm — DuDu Hán Ngữ',
      sentences: 'Câu ví dụ — DuDu Hán Ngữ',
    };
    document.title = titles[screen] || 'DuDu Hán Ngữ';
    if (!mountedScreenRef.current) {
      mountedScreenRef.current = true;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [screen, currentBai]);

  useEffect(() => {
    if (!courseReady || !LESSONS.length) return;
    if (!LESSONS.includes(currentBai)) setCurrentBai(LESSONS[0]);
  }, [courseReady, currentBai]);

  useEffect(() => {
    if (applyingHashRef.current) {
      applyingHashRef.current = false;
      return;
    }
    const nextHash = buildHashRoute(screen, currentBai, dashboardTab);
    if (!nextHash) return;
    const currentHash = window.location.hash || '';
    if (screen === 'home' && !currentHash.startsWith('#/')) return;
    if (currentHash !== nextHash) window.history.pushState(null, '', nextHash);
  }, [screen, currentBai, dashboardTab]);

  useEffect(() => {
    const syncFromHash = () => {
      const raw = window.location.hash || '';
      if (!raw || !raw.startsWith('#/')) {
        if (raw === '' || raw === '#') {
          const changed = screenRef.current !== 'home';
          if (changed) {
            applyingHashRef.current = true;
            setScreen('home');
          }
          setSidebarOpen(false);
          setHeaderHidden(false);
        }
        return;
      }
      const parsed = parseHashRoute(raw);
      if (!parsed) return;
      const nextBai = parsed.bai
        ? (LESSONS.includes(parsed.bai) ? parsed.bai : (LESSONS[0] || 1))
        : currentBaiRef.current;
      const nextTab = parsed.dashboardTab ?? dashboardTabRef.current;
      const changed =
        parsed.screen !== screenRef.current ||
        nextBai !== currentBaiRef.current ||
        nextTab !== dashboardTabRef.current;
      if (changed) applyingHashRef.current = true;
      setSidebarOpen(false);
      setHeaderHidden(false);
      if (parsed.bai) setCurrentBai(nextBai);
      if (parsed.dashboardTab) setDashboardTab(parsed.dashboardTab);
      setScreen(parsed.screen);
    };
    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('popstate', syncFromHash);
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

  useEffect(() => {
    const onSwUpdate = (event) => {
      const reg = event?.detail;
      setToast({
        icon: '✓',
        title: 'Đã có bản cập nhật mới',
        description: 'Tải lại trang để dùng phiên bản mới nhất của DuDu Hán Ngữ.',
        action: {
          label: 'Tải lại ngay',
          onClick: () => {
            try { reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }); } catch { /* ignore */ }
            window.location.reload();
          },
        },
      });
    };
    window.addEventListener('dudu-sw-update', onSwUpdate);
    return () => window.removeEventListener('dudu-sw-update', onSwUpdate);
  }, []);

  const applyCloudData = useCallback((payload) => {
    if (!payload) return;
    const currentId = activeCourseIdRef.current || BUILT_IN_COURSE_ID;
    const nextProg = payload.progressByCourse?.[currentId];
    if (nextProg) {
      remoteAppliedAtRef.current = nextProg._savedAt || '';
      const merged = progressForCourse(nextProg, activeCourseRef.current);
      if (payload.user?.displayName && !merged.profile?.name) {
        merged.profile = { ...merged.profile, name: payload.user.displayName, headline: payload.user.headline || merged.profile.headline, bio: payload.user.bio || merged.profile.bio };
      }
      setProgress(merged);
    } else if (payload.switchedAccount) {
      const fresh = progressForCourse(createInitialProgress(), activeCourseRef.current);
      if (payload.user?.displayName) {
        fresh.profile = { ...fresh.profile, name: payload.user.displayName, headline: payload.user.headline || fresh.profile.headline, bio: payload.user.bio || fresh.profile.bio };
      }
      fresh._savedAt = new Date().toISOString();
      remoteAppliedAtRef.current = fresh._savedAt;
      setProgress(fresh);
    } else if (payload.user?.displayName) {
      setProgress((prev) => (!prev.profile?.name ? { ...prev, profile: { ...prev.profile, name: payload.user.displayName, headline: payload.user.headline || prev.profile.headline, bio: payload.user.bio || prev.profile.bio } } : prev));
    }
    setLibraryRefresh((value) => value + 1);
  }, []);

  useEffect(() => subscribeCloudState(setCloud), []);

  useEffect(() => {
    if (!courseReady) return undefined;
    initCloudSession({ onCloudDataApplied: applyCloudData }).catch(() => {});
    return undefined;
  }, [courseReady, applyCloudData]);

  useEffect(() => {
    let active = true;
    (async () => {
      await migrateBuiltInCourse();
      resumeInterruptedJobs().catch(() => {});
      const settings = await getSettings();
      const course = await getCourse(settings.activeCourseId) || await getCourse(BUILT_IN_COURSE_ID);
      if (!active || !course) return;
      const count = activateCourseData(course);
      applyBuiltInEdits(course);
      LESSONS.splice(0, LESSONS.length, ...Array.from({ length: count }, (_, index) => index + 1));
      refreshPinyinIndex();
      const saved = course.id === BUILT_IN_COURSE_ID ? readProgress().progress : await getProgress(course.id);
      if (!active) return;
      setProgress(progressForCourse(saved, course));
      setActiveCourseId(course.id);
      setActiveCourse(course);
      setWordOverrides(Object.fromEntries(course.chapters.flatMap((chapter) => chapter.glossary?.entries || []).filter((entry) => entry.type === 'word').map((entry) => [entry.id, entry])));
      setWordEditorReady(true);
      setCourseReady(true);
    })().catch((error) => {
      if (active) {
        setWordEditorError(`Không thể mở dữ liệu: ${error.message}`);
        setCourseReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeProcessingJobs((id, snapshot) => {
    setProcessingJobs(getActiveProcessingJobs());
    if (['completed', 'error', 'cancelled'].includes(snapshot.state)) setLibraryRefresh((value) => value + 1);
  }), []);

  useEffect(() => {
    const boot = bootProgressRef.current;
    if (boot?.corrupt) {
      setToast({ icon: '!', title: 'Tiến độ cũ bị hỏng', description: boot.error?.userMessage || 'Dữ liệu tiến độ không đọc được nên đã bắt đầu lại từ mặc định.' });
    }
  }, []);

  useEffect(() => subscribeDbChanges(() => setLibraryRefresh((value) => value + 1)), []);
  useEffect(() => subscribeDbState((event) => {
    if (event?.type === 'version-change' || event?.type === 'blocked') {
      setWordEditorError(event.message || 'Dữ liệu đang được mở ở tab khác. Hãy đóng bớt tab rồi thử lại.');
    }
  }), []);

  useEffect(() => subscribeStorageChanges(() => {
    const incoming = readProgress();
    if (!incoming.ok || !incoming.progress) return;
    const incomingAt = Date.parse(incoming.progress._savedAt || '') || 0;
    const currentAt = Date.parse(progressRef.current._savedAt || '') || 0;
    if (incomingAt <= currentAt) return;
    remoteAppliedAtRef.current = incoming.progress._savedAt;
    const merged = mergeProgressData(progressRef.current, incoming.progress);
    setProgress(progressForCourse(merged, activeCourseRef.current));
  }), []);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      syncAllWithCloud({ onCloudDataApplied: applyCloudData }).catch(() => {});
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [applyCloudData]);

  useEffect(() => {
    let previous = window.scrollY;
    const onScroll = () => {
      const current = window.scrollY;
      if (Math.abs(current - previous) >= 8) setHeaderHidden(current > 120 && current > previous);
      previous = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = progress.themeMode === 'auto' ? getAutoTheme() : progress.themeMode;
      setEffectiveTheme(nextTheme);
      applyTheme(progress.colorTheme || 'pastel', nextTheme === 'dark');
    };
    syncTheme();
    writeStorage('dudu-theme-mode', progress.themeMode);
    if (progress.themeMode !== 'auto') return undefined;
    const interval = setInterval(syncTheme, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [progress.themeMode, progress.colorTheme]);

  useEffect(() => {
    if (!courseReady) return undefined;
    if (remoteAppliedAtRef.current && progress._savedAt === remoteAppliedAtRef.current) {
      remoteAppliedAtRef.current = '';
      return undefined;
    }
    if (activeCourseId === BUILT_IN_COURSE_ID) {
      const result = writeProgress(progress);
      if (!result.ok) setWordEditorError(`Không lưu được tiến độ: ${result.error?.userMessage || 'lỗi không xác định'}`);
    }
    queueProgressCloudSync(activeCourseId, progress);
    const timer = setTimeout(() => saveProgress(activeCourseId, progress).catch((error) => setWordEditorError(`Không lưu được tiến độ: ${error.message}`)), 400);
    return () => clearTimeout(timer);
  }, [progress, activeCourseId, courseReady]);

  const selectCourse = async (courseId) => {
    try {
      if (courseReady && await getCourse(activeCourseId)) await saveProgress(activeCourseId, progressRef.current);
      const course = await getCourse(courseId);
      if (!course) throw new Error('Không tìm thấy khóa học.');
      const saved = course.id === BUILT_IN_COURSE_ID ? readProgress().progress : await getProgress(course.id);
      const count = activateCourseData(course);
      applyBuiltInEdits(course);
      LESSONS.splice(0, LESSONS.length, ...Array.from({ length: count }, (_, index) => index + 1));
      refreshPinyinIndex();
      setProgress(progressForCourse(saved, course));
      setActiveCourseId(course.id);
      setActiveCourse(course);
      setCurrentBai(1);
      setQuizSession(null);
      setGlossaryEntry(null);
      setEditingWord(null);
      setWordOverrides(Object.fromEntries(course.chapters.flatMap((chapter) => chapter.glossary?.entries || []).filter((entry) => entry.type === 'word').map((entry) => [entry.id, entry])));
      setScreen(course.chapters.length ? 'home' : 'library');
      setLibraryRefresh((value) => value + 1);
      const settings = await getSettings();
      const recentCourseIds = [course.id, ...(settings.recentCourseIds || []).filter((id) => id !== course.id)].slice(0, 5);
      await saveSettings({ activeCourseId: course.id, recentCourseIds });
      syncSettingsToCloud({ activeCourseId: course.id, recentCourseIds });
      return course;
    } catch (error) {
      setToast({ icon: '!', title: 'Không mở được khóa học', description: error.message });
      return null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); return; }
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          setSearchOpen(false);
        }
        return;
      }

      if (shortcutsOpen) {
        if (e.key === 'Escape') setShortcutsOpen(false);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'h': e.preventDefault(); navigate('home'); break;
          case 'l': e.preventDefault(); setScreen('learn'); break;
          case 'q': e.preventDefault(); startLessonQuiz(currentBai); break;
          case 'r': e.preventDefault(); setScreen('review'); break;
          case 'b': if (glossaryEntry) { e.preventDefault(); toggleBookmark(glossaryEntry.id); } break;
          case 'e':
            if (glossaryEntry?.type === 'word') { e.preventDefault(); setEditingWord(glossaryEntry); }
            else if (glossaryEntry?.type === 'grammar') { e.preventDefault(); setEditingContent(glossaryEntry); }
            break;
          case '/': e.preventDefault(); setShortcutsOpen(true); break;
          default: break;
        }
        if (e.shiftKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          setProgress((prev) => ({ ...prev, themeMode: prev.themeMode === 'dark' ? 'light' : 'dark' }));
        }
        if (e.shiftKey && e.key.toLowerCase() === 't') {
          e.preventDefault();
          const themeKeys = Object.keys(THEMES);
          const current = progress.colorTheme || 'pastel';
          const next = themeKeys[(themeKeys.indexOf(current) + 1) % themeKeys.length];
          setProgress((prev) => ({ ...prev, colorTheme: next }));
        }
      } else {
        if (e.key.toLowerCase() === 'g') { goKeyRef.current = Date.now(); return; }
        if (Date.now() - goKeyRef.current < 1000) {
          const target = { h: 'home', l: 'library', q: 'quiz', r: 'review' }[e.key.toLowerCase()];
          if (target) { e.preventDefault(); goKeyRef.current = 0; navigate(target); return; }
        }
        if (e.key === '?') { e.preventDefault(); setShortcutsOpen(true); }
        if (e.key === 'Escape') {
          setSearchOpen(false);
          setCharacterDetail(null);
          setGlossaryEntry(null);
          setPlaylist(null);
        }
        if (e.key === ' ' && playlist) e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, shortcutsOpen, currentBai, playlist, glossaryEntry, progress.colorTheme]);

  const navigate = (target) => {
    setSidebarOpen(false);
    setHeaderHidden(false);
    if (target === 'quiz') {
      startLessonQuiz(currentBai);
      return;
    }
    if (target === 'dashboard') setDashboardTab('overview');
    setScreen(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCharacter = (char, entry) => setCharacterDetail({ char, entry });
  const startPlaylist = (entries) => {
    if (!entries?.length) return;
    setPlaylist({ id: Date.now(), entries });
  };

  const startLessonQuiz = (bai) => {
    if (!QUIZZES[bai]?.questions?.length) {
      setToast({ icon: '!', title: 'Bài này chưa có quiz', description: 'Hãy duyệt lại nội dung khóa học.' });
      return;
    }
    setCurrentBai(bai);
    setQuizSession({ id: `lesson-${bai}-${Date.now()}`, kind: 'lesson', bai, questions: QUIZZES[bai].questions });
    setScreen('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startCustomQuiz = (label, questions, bai = null) => {
    if (!questions?.length) return;
    setQuizSession({ id: `practice-${Date.now()}`, kind: 'practice', label, bai, questions });
    setScreen('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startWrongReview = (ids) => {
    const questions = ids.map((id) => ALL_QUESTIONS.find((item) => item.id === id)).filter(Boolean);
    if (!questions.length) return;
    setQuizSession({ id: `wrong-${Date.now()}`, kind: 'wrong', bai: null, questions: shuffleArray(questions) });
    setScreen('quiz');
  };

  const updateStudyDate = (next) => {
    const today = localDate();
    if (next.todayDate !== today) {
      next.todayDate = today;
      next.todayCount = 0;
    }
    if (next.pomodoroDate !== today) {
      next.pomodoroDate = today;
      next.pomodoroSessions = 0;
    }
    if (next.lastStudyDate !== today) {
      const yesterday = previousDate(today);
      const twoDaysAgo = addDays(today, -2);
      const freezes = Math.max(0, Number(next.streakFreezes ?? 1));
      if (next.lastStudyDate === yesterday) {
        next.streak = next.streak + 1;
      } else if (next.lastStudyDate === twoDaysAgo && next.streak > 0 && freezes > 0) {
        next.streak = next.streak + 1;
        next.streakFreezes = freezes - 1;
        next.lastFrozenDate = yesterday;
      } else {
        next.streak = 1;
      }
      if (next.streak > 0 && next.streak % 7 === 0 && (next.streakFreezes ?? freezes) < 2) {
        next.streakFreezes = Math.min(2, (next.streakFreezes ?? freezes) + 1);
      }
      next.lastStudyDate = today;
      next.studyDates = [...new Set([...next.studyDates, today])];
    }
    return today;
  };

  const recordAnswer = (question, userAnswer, result, mode) => {
    const isTypingQuestion = TYPING_TYPES.has(question.type);
    const approxXp = isTypingQuestion ? (result.score >= 80 ? XP_REWARDS.typingHigh : result.score >= 60 ? XP_REWARDS.typingMid : 0) : (result.isCorrect ? XP_REWARDS.mcq : 0);
    trackStudyEvent({ eventType: 'quiz_answer', courseId: activeCourseId, bai: question.bai, questionId: question.id, isCorrect: result.isCorrect, xpEarned: approxXp, meta: { mode, type: question.type } });
    setProgress((previous) => {
      const next = cloneProgressForUpdate(previous, mode === 'lesson' ? question.bai : null);
      const today = updateStudyDate(next);
      const wasWrong = next.wrongAnswers.some((item) => item.questionId === question.id);
      const isTyping = TYPING_TYPES.has(question.type);
      let earned = 0;
      if (isTyping) earned = result.score >= 80 ? XP_REWARDS.typingHigh : result.score >= 60 ? XP_REWARDS.typingMid : 0;
      else if (result.isCorrect) earned = XP_REWARDS.mcq;
      if (wasWrong && result.isCorrect) earned += XP_REWARDS.correction;
      next.accuracy.total += 1;
      if (result.isCorrect) next.accuracy.correct += 1;
      next.correctStreak = result.isCorrect ? next.correctStreak + 1 : 0;

      if (result.isCorrect) {
        next.wrongAnswers = next.wrongAnswers.filter((item) => item.questionId !== question.id);
      } else {
        next.wrongCounts[question.id] = (next.wrongCounts[question.id] || 0) + 1;
        const record = { questionId: question.id, userAnswer, score: result.score, updatedAt: new Date().toISOString() };
        next.wrongAnswers = [...next.wrongAnswers.filter((item) => item.questionId !== question.id), record];
        next.wrongAnswersDetailed = [...next.wrongAnswersDetailed, {
          questionId: question.id,
          bai: question.bai,
          type: question.type,
          related_glossary: question.related_glossary || [],
          score: result.score,
          createdAt: new Date().toISOString(),
        }].slice(-1000);
        for (const entryId of question.related_glossary || []) {
          const entry = ALL_GLOSSARY_ENTRIES.find((item) => item.id === entryId);
          if (entry && SRS_ELIGIBLE_TYPES.has(entry.type)) {
            next.srs[entryId] = previous.srs?.[entryId]
              ? calculateNextReview(previous.srs[entryId], 'forgot', { fuzzSeed: entryId })
              : createSrsEntry();
          }
        }
      }

      if (mode === 'lesson') {
        const lesson = next.baiProgress[question.bai];
        const wasAlreadyAttempted = lesson.attemptedIds.includes(question.id);
        lesson.attemptedIds = wasAlreadyAttempted ? lesson.attemptedIds : [...lesson.attemptedIds, question.id];
        if (!wasAlreadyAttempted && result.isCorrect && !lesson.firstAttemptCorrectIds.includes(question.id)) {
          lesson.firstAttemptCorrectIds = [...lesson.firstAttemptCorrectIds, question.id];
        }
        lesson.correctIds = result.isCorrect
          ? [...new Set([...lesson.correctIds, question.id])]
          : lesson.correctIds.filter((id) => id !== question.id);
        lesson.quizDone = lesson.attemptedIds.length;
        lesson.quizCorrect = lesson.correctIds.length;
        const mastery = evaluateLessonMastery(lesson, QUIZZES[question.bai].questions.length);
        if (!lesson.completed && mastery.passed) {
          lesson.completed = true;
          earned += XP_REWARDS.lesson;
          if (question.bai < LESSONS.length) next.unlockedBai = [...new Set([...next.unlockedBai, question.bai + 1])].sort((a, b) => a - b);
        } else if (!lesson.completed && mastery.attempted >= mastery.totalQuestions && !wasAlreadyAttempted) {
          setToast({ icon: '!', title: `Đạt ${mastery.accuracyPercent}% — chưa mở khóa bài tiếp`, description: `Cần đạt ≥ ${mastery.requiredPercent}% để hoàn thành & mở khóa bài tiếp theo.` });
        }
      }

      next.todayCount += 1;
      next.xp += earned;
      next.dailyXp[today] = (next.dailyXp[today] || 0) + earned;
      const weekKey = getWeekKey(today);
      next.weeklyXP[weekKey] = (next.weeklyXP[weekKey] || 0) + earned;
      const day = next.studyDays[today] || { xp: 0, questions: 0 };
      next.studyDays[today] = { xp: day.xp + earned, questions: day.questions + 1 };
      if (next.todayCount >= next.dailyGoal && !next.goalRewardDates.includes(today)) {
        next.goalRewardDates = [...next.goalRewardDates, today];
        next.xp += XP_REWARDS.dailyGoal;
        next.dailyXp[today] += XP_REWARDS.dailyGoal;
        next.weeklyXP[weekKey] += XP_REWARDS.dailyGoal;
        next.studyDays[today].xp += XP_REWARDS.dailyGoal;
        setToast({ icon: 'goal', title: 'Đã đạt mục tiêu hôm nay', description: `Thưởng ${XP_REWARDS.dailyGoal} XP` });
      }

      const newBadges = evaluateAchievements(next);
      if (newBadges.length) {
        next.achievements = [...next.achievements, ...newBadges.map((badge) => badge.id)];
        setToast(newBadges[0]);
      }
      return next;
    });
  };

  const recordBossWin = () => {
    trackStudyEvent({ eventType: 'boss_win', courseId: activeCourseId, xpEarned: XP_REWARDS.boss });
    setProgress((previous) => {
      const next = cloneProgressForUpdate(previous);
      const today = updateStudyDate(next);
      next.bossWins += 1;
      next.xp += XP_REWARDS.boss;
      next.dailyXp[today] = (next.dailyXp[today] || 0) + XP_REWARDS.boss;
      const weekKey = getWeekKey(today);
      next.weeklyXP[weekKey] = (next.weeklyXP[weekKey] || 0) + XP_REWARDS.boss;
      const day = next.studyDays[today] || { xp: 0, questions: 0 };
      next.studyDays[today] = { ...day, xp: day.xp + XP_REWARDS.boss };
      const badges = evaluateAchievements(next);
      if (badges.length) { next.achievements = [...next.achievements, ...badges.map((badge) => badge.id)]; setToast(badges[0]); }
      return next;
    });
  };

  const changeDailyGoal = (goal) => setProgress((previous) => ({ ...previous, dailyGoal: goal }));
  const changeTheme = (themeMode) => { setProgress((previous) => ({ ...previous, themeMode })); syncSettingsToCloud({ themeMode }); };
  const changeColorTheme = (colorTheme) => { setProgress((previous) => ({ ...previous, colorTheme })); syncSettingsToCloud({ colorTheme }); };
  const toggleBookmark = (entryId) => setProgress((previous) => ({
    ...previous,
    bookmarks: previous.bookmarks.includes(entryId)
      ? previous.bookmarks.filter((id) => id !== entryId)
      : [...previous.bookmarks, entryId],
  }));
  const saveNote = (entryId, note) => setProgress((previous) => {
    const notes = { ...(previous.notes || {}) };
    if (note) notes[entryId] = note;
    else delete notes[entryId];
    return { ...previous, notes };
  });
  const saveEditedWord = async (values) => {
    if (!editingWord) return;
    const { note, ...changes } = values;
    const updated = await updateWordInCourse(activeCourseId, editingWord.id, changes);
    getCourse(activeCourseId).then((c) => syncCourseToCloud(c)).catch(() => {});
    const source = GLOSSARY[updated.bai]?.entries;
    if (source) { const index = source.findIndex((entry) => entry.id === updated.id); if (index >= 0) source[index] = updated; }
    const allIndex = ALL_GLOSSARY_ENTRIES.findIndex((entry) => entry.id === updated.id);
    if (allIndex >= 0) ALL_GLOSSARY_ENTRIES[allIndex] = updated;
    setWordOverrides((previous) => ({ ...previous, [updated.id]: updated }));
    setGlossaryEntry((previous) => (previous?.id === updated.id ? updated : previous));
    saveNote(updated.id, note.trim());
  };

  const runPaletteCommand = (id) => {
    if (id === 'theme') { changeTheme(progress.themeMode === 'dark' ? 'light' : 'dark'); return; }
    if (id === 'settings') { setDashboardTab('settings'); setScreen('dashboard'); return; }
    if (id === 'new-course') {
      navigate('library');
      window.setTimeout(() => document.querySelector('input[aria-label="Tên khóa học"]')?.focus(), 250);
      return;
    }
    navigate(id);
  };
  const saveEditedContent = async (values) => {
    if (!editingContent) return;
    if (editingContent.type === 'grammar') {
      const updated = await updateGrammarInCourse(activeCourseId, editingContent.id, values);
      const entries = GLOSSARY[updated.bai]?.entries;
      const index = entries?.findIndex((entry) => entry.id === updated.id) ?? -1;
      if (index >= 0) entries[index] = updated;
      const allIndex = ALL_GLOSSARY_ENTRIES.findIndex((entry) => entry.id === updated.id);
      if (allIndex >= 0) ALL_GLOSSARY_ENTRIES[allIndex] = updated;
      setGlossaryEntry((previous) => (previous?.id === updated.id ? updated : previous));
    } else {
      const updated = await updateQuestionInCourse(activeCourseId, editingContent.id, values);
      const questions = QUIZZES[updated.bai]?.questions;
      const index = questions?.findIndex((question) => question.id === updated.id) ?? -1;
      if (index >= 0) questions[index] = updated;
      const allIndex = ALL_QUESTIONS.findIndex((question) => question.id === updated.id);
      if (allIndex >= 0) ALL_QUESTIONS[allIndex] = updated;
      setQuizSession((previous) => (previous ? { ...previous, questions: previous.questions.map((question) => (question.id === updated.id ? updated : question)) } : previous));
    }
    getCourse(activeCourseId).then((c) => syncCourseToCloud(c)).catch(() => {});
    setToast({ icon: '✓', title: 'Đã lưu nội dung', description: 'Thay đổi đã lưu vào khóa học.' });
  };
  const updateProfile = (updates) => {
    setProgress((previous) => ({ ...previous, profile: { ...previous.profile, ...updates } }));
    syncProfileUpdate(updates).catch(() => {});
  };
  const addLessonToSrs = (bai) => {
    setProgress((previous) => {
      const eligible = GLOSSARY[bai]?.entries?.filter((entry) => SRS_ELIGIBLE_TYPES.has(entry.type)) || [];
      const currentSrs = previous.srs || {};
      const missing = eligible.filter((entry) => !currentSrs[entry.id]);
      if (!missing.length) return previous;
      const srs = { ...currentSrs };
      for (const entry of missing) srs[entry.id] = createSrsEntry();
      setToast({ icon: 'srs', title: `Đã thêm ${missing.length} mục vào SRS`, description: `Bài ${bai} (từ vựng, ngữ pháp & mẫu câu) đã sẵn sàng để ôn.` });
      return { ...previous, srs };
    });
  };
  const rateSrs = (entryId, rating) => {
    trackStudyEvent({ eventType: 'srs_review', courseId: activeCourseId, meta: { entryId, rating } });
    setProgress((previous) => ({
      ...previous,
      srs: { ...(previous.srs || {}), [entryId]: calculateNextReview(previous.srs?.[entryId], rating, { fuzzSeed: entryId }) },
    }));
  };
  const unsuspendSrs = (entryId) => {
    setProgress((previous) => {
      if (!previous.srs?.[entryId]) return previous;
      return { ...previous, srs: { ...previous.srs, [entryId]: unsuspendSrsEntry(previous.srs[entryId]) } };
    });
  };
  const importProgress = (imported) => {
    setProgress(rolloverDailyProgress(mergeProgress(imported)));
    setToast({ icon: '✓', title: 'Đã nhập tiến độ', description: 'Dữ liệu học tập đã được khôi phục.' });
  };
  const completePomodoro = () => {
    trackStudyEvent({ eventType: 'pomodoro_complete', courseId: activeCourseId });
    setProgress((previous) => {
      const next = rolloverDailyProgress(cloneProgressForUpdate(previous));
      const today = updateStudyDate(next);
      next.pomodoroSessions += 1;
      next.studyDays[today] = next.studyDays[today] || { xp: 0, questions: 0 };
      setToast({ icon: '✓', title: 'Hoàn thành một phiên tập trung', description: 'Nghỉ 5 phút rồi quay lại nhé — bạn đang giữ nhịp rất tốt.' });
      return next;
    });
  };
  pomodoroCompleteRef.current = completePomodoro;
  const updateSettings = (updates) => setProgress((previous) => ({ ...previous, settings: { ...previous.settings, ...updates } }));
  const updateCustomBackground = (value) => {
    try {
      if (value) localStorage.setItem('customBg', value);
      else localStorage.removeItem('customBg');
      setCustomBackground(value || null);
      return { ok: true };
    } catch (error) {
      const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
      return { ok: false, message: quota ? 'Bộ nhớ trình duyệt đã đầy. Hãy dùng ảnh nhỏ hơn hoặc xóa ảnh cũ.' : 'Không thể lưu ảnh trong trình duyệt này.' };
    }
  };
  const completeDictation = (scores) => setProgress((previous) => {
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    const sessions = previous.advancedStats.dictationSessions + 1;
    const lifetimeAverage = Math.round(((previous.advancedStats.dictationAverage * (sessions - 1)) + average) / sessions);
    return { ...previous, advancedStats: { ...previous.advancedStats, dictationSessions: sessions, dictationAverage: lifetimeAverage } };
  });
  const recordPronunciation = (score) => setProgress((previous) => ({
    ...previous,
    advancedStats: {
      ...previous.advancedStats,
      pronunciationAttempts: previous.advancedStats.pronunciationAttempts + 1,
      pronunciationBest: Math.max(previous.advancedStats.pronunciationBest, score),
    },
  }));
  const selectSearchResult = async (result) => {
    if (result.courseId && result.courseId !== activeCourseId) {
      const selected = await selectCourse(result.courseId);
      if (!selected) return;
    }
    setCurrentBai(result.bai);
    setScreen('learn');
    setSearchOpen(false);
    if (result.entry) setGlossaryEntry(result.entry);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAuth = (mode = 'login') => setAuthModal({ open: true, mode });
  const currentLessonContext = useMemo(() => {
    const g = GLOSSARY[currentBai];
    return {
      courseId: activeCourseId,
      courseName: activeCourse?.name || 'Hán Ngữ Tập 2',
      bai: currentBai,
      lessonTitleZh: g?.metadata?.title_zh || '',
      lessonTitleVi: g?.metadata?.title_vi || '',
      vocabSample: (g?.entries || []).filter((e) => e.type === 'word').slice(0, 12).map((e) => `${e.word_zh} (${e.pinyin}: ${e.meaning_vi})`),
    };
  }, [activeCourseId, activeCourse?.name, currentBai, wordOverrides]);

  let content;
  if (!courseReady) {
    content = (
      <div className="space-y-4 py-5" aria-label="Đang tải khóa học">
        <div className="h-40 animate-pulse rounded-md bg-bg-tertiary" />
        <div className="h-20 animate-pulse rounded-md bg-bg-tertiary" />
        <div className="h-20 animate-pulse rounded-md bg-bg-tertiary" />
      </div>
    );
  } else if (screen === 'library') {
    content = <LibraryScreen activeCourseId={activeCourseId} refreshKey={libraryRefresh} cloud={cloud} onOpenCommunity={() => navigate('community')} onSelect={selectCourse} onImport={(id) => { setTargetCourseId(id); setScreen('import-document'); }} onProcess={(id) => { setTargetCourseId(id); setScreen('process-document'); }} onReview={(id) => { setTargetCourseId(id); setScreen('review-generated'); }} />;
  } else if (screen === 'community') {
    content = <CommunityScreen cloud={cloud} onOpenAuth={openAuth} onNavigateLibrary={() => navigate('library')} onCourseCloned={(cloned) => { setLibraryRefresh((v) => v + 1); setToast({ icon: '✓', title: 'Đã tải khóa học cộng đồng', description: cloned.name }); }} />;
  } else if (screen === 'tutor') {
    content = <AiTutorScreen cloud={cloud} lessonContext={currentLessonContext} onOpenAuth={openAuth} onOpenSettings={() => { setDashboardTab('settings'); setScreen('dashboard'); }} />;
  } else if (screen === 'import-document') {
    content = <ImportScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onSaved={(id) => { setTargetCourseId(id); setLibraryRefresh((value) => value + 1); setScreen('process-document'); }} />;
  } else if (screen === 'process-document') {
    content = <ProcessingScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onDone={(id) => { setTargetCourseId(id); setLibraryRefresh((value) => value + 1); setScreen('review-generated'); }} onSettings={() => { setDashboardTab('settings'); setScreen('dashboard'); }} />;
  } else if (screen === 'review-generated') {
    content = <ReviewGeneratedScreen key={targetCourseId} courseId={targetCourseId} onBack={() => setScreen('library')} onRetry={() => setScreen('process-document')} onCommitted={(id) => { setLibraryRefresh((value) => value + 1); selectCourse(id); }} />;
  } else if (!LESSONS.length && screen !== 'dashboard') {
    content = <div className="rounded-md border border-border bg-bg-secondary p-8 text-center"><h1 className="font-serif text-xl font-semibold">{activeCourse?.name || 'Khóa học'} chưa có bài học</h1><p className="mt-2 text-sm text-text-secondary">Nhập tài liệu để bắt đầu tạo nội dung.</p><button onClick={() => { setTargetCourseId(activeCourseId); setScreen('import-document'); }} className="btn-primary mt-5">Nhập tài liệu</button></div>;
  } else if (screen === 'home') {
    content = <HomeScreen progress={progress} courseName={activeCourse?.name || 'Hán Ngữ Tập 2'} onOpenLesson={(bai) => { setCurrentBai(bai); setScreen('learn'); }} onNavigate={navigate} />;
  } else if (screen === 'learn') {
    content = <LearnScreen bai={currentBai} progress={progress} unlockedBai={progress.unlockedBai} bookmarks={progress.bookmarks} notes={progress.notes} onToggleBookmark={toggleBookmark} onSaveNote={saveNote} onLessonRead={addLessonToSrs} onStartQuiz={startLessonQuiz} onStartCustomQuiz={startCustomQuiz} onOpenEntry={setGlossaryEntry} onCharacter={openCharacter} onStartPlaylist={startPlaylist} onChangeBai={setCurrentBai} wordOverrides={wordOverrides} onEditWord={wordEditorReady ? setEditingWord : null} onEditGrammar={wordEditorReady ? setEditingContent : null} editorError={wordEditorError} />;
  } else if (screen === 'quiz') {
    content = quizSession
      ? <QuizScreen key={quizSession.id} session={quizSession} progress={progress} onAnswer={recordAnswer} onFinish={() => {}} onExit={() => setScreen('home')} onOpenEntry={setGlossaryEntry} onEditQuestion={wordEditorReady ? setEditingContent : null} onPracticeWrong={startWrongReview} />
      : <EmptyState icon="✓" title="Chọn một bài để luyện" text="Chọn bài học trong Lộ trình để bắt đầu." />;
  } else if (screen === 'review') {
    content = <ReviewScreen progress={progress} onPracticeWrong={startWrongReview} onStartCustomQuiz={startCustomQuiz} onOpenEntry={setGlossaryEntry} onToggleBookmark={toggleBookmark} onSaveNote={saveNote} onRateSrs={rateSrs} onUnsuspendSrs={unsuspendSrs} onNavigate={navigate} />;
  } else if (screen === 'exam') {
    content = <ExamScreen onRecord={recordAnswer} />;
  } else if (screen === 'boss') {
    content = <BossBattleScreen progress={progress} onRecord={recordAnswer} onWin={recordBossWin} />;
  } else if (screen === 'minigame') {
    content = <MatchingGame />;
  } else if (screen === 'dictation') {
    content = <DictationScreen onComplete={completeDictation} />;
  } else if (screen === 'pronunciation') {
    content = <PronunciationScreen onAttempt={recordPronunciation} />;
  } else if (screen === 'sentences') {
    content = <SentenceMiningScreen bookmarks={progress.bookmarks} notes={progress.notes} onCharacter={openCharacter} onStartPlaylist={startPlaylist} />;
  } else {
    content = <DashboardScreen progress={progress} onImport={importProgress} onThemeChange={changeTheme} onColorThemeChange={changeColorTheme} onChangeGoal={changeDailyGoal} onUpdateProfile={updateProfile} updateSettings={updateSettings} customBackground={customBackground} onCustomBackgroundChange={updateCustomBackground} effectiveTheme={effectiveTheme} initialTab={dashboardTab} cloud={cloud} onOpenAuth={openAuth} onCloudDataApplied={applyCloudData} />;
  }

  const hasBackground = progress.settings?.enableBackground && progress.settings?.background !== 'none' && (progress.settings.background !== 'custom' || Boolean(customBackground));
  const rootBgClass = hasBackground ? 'bg-transparent text-text-primary' : 'bg-bg-primary text-text-primary';
  const shownGlossaryEntry = glossaryEntry ? wordOverrides[glossaryEntry.id] || glossaryEntry : null;

  return (
    <div
      className={`relative isolate min-h-screen transition-colors duration-300 ${rootBgClass}`}
      onPointerDownCapture={(event) => {
        const button = event.target.closest?.('.btn-primary');
        if (!button) return;
        const box = button.getBoundingClientRect();
        button.style.setProperty('--press-x', `${event.clientX - box.left}px`);
        button.style.setProperty('--press-y', `${event.clientY - box.top}px`);
      }}
    >
      <div id="dudu-app-shell">
        <a href="#main-content" className="skip-link">Bỏ qua menu, đến nội dung chính</a>
        {!online && <div role="status" className="fixed inset-x-0 top-0 z-[120] bg-warning-subtle px-4 py-1.5 text-center text-xs font-semibold text-warning">Mất kết nối mạng — bài học đã tải vẫn dùng được, tính năng tạo nội dung bằng AI sẽ tạm chờ.</div>}
        <BackgroundLayer settings={progress.settings} customBackground={customBackground} effectiveTheme={effectiveTheme} />
        {screen !== 'quiz' && <Sidebar screen={screen} progress={progress} onNavigate={navigate} mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} cloud={cloud} onOpenAuth={openAuth} />}
        <div className={`relative z-10 min-h-screen ${screen === 'quiz' ? '' : 'lg:pl-[232px]'}`}>
          <Header progress={progress} themeMode={progress.themeMode} onThemeChange={changeTheme} onSearch={() => setSearchOpen(true)} onNavigate={navigate} onMenu={() => setSidebarOpen(true)} onShortcuts={() => setShortcutsOpen(true)} hidden={headerHidden} focused={screen === 'quiz'} />
          <div className={screen === 'quiz' ? '' : 'mx-auto max-w-[1280px] xl:grid xl:min-h-[calc(100vh-4rem)] xl:grid-cols-[minmax(0,1fr)_316px] xl:gap-7 xl:px-8'}>
            <div className="min-w-0">
              {processingJobs.length > 0 && (
                <div className="mx-auto max-w-[840px] px-4 pt-3 sm:px-6 lg:px-8 xl:max-w-none xl:px-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent-subtle px-4 py-2.5 text-sm shadow-xs">
                    <span className="font-semibold">{processingJobs.map((job) => `${job.courseName}: ${job.state === 'paused' ? 'tạm dừng' : 'đang xử lý'} ${job.current}/${job.total}`).join(' · ')}</span>
                    <button className="font-semibold text-accent" onClick={() => { setTargetCourseId(processingJobs[0].courseId); setScreen('process-document'); }}>Xem tiến độ</button>
                  </div>
                </div>
              )}
              <main id="main-content" ref={mainRef} tabIndex={-1} key={screen} className={`mx-auto min-w-0 animate-fade-slide px-4 pt-6 sm:px-6 lg:px-8 ${screen === 'home' ? 'pb-6 xl:pb-12' : 'pb-24 lg:pb-12'} ${screen === 'quiz' ? 'max-w-[720px]' : 'max-w-[840px] xl:max-w-none xl:px-0'}`}>
                <Suspense fallback={<div aria-label="Đang tải màn hình" className="space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-bg-tertiary" /><div className="h-48 animate-pulse rounded-2xl bg-bg-tertiary" /></div>}>
                  {content}
                </Suspense>
              </main>
            </div>
            {screen !== 'quiz' && <RightPanel progress={progress} onNavigate={navigate} pomodoro={pomodoro} showStackedBelowXl={screen === 'home'} />}
          </div>
        </div>
        {screen !== 'quiz' && <BottomNav screen={screen} onNavigate={navigate} />}
        <PlaylistFloatingPlayer playlist={playlist} onClose={() => setPlaylist(null)} />
        <PomodoroDock pomodoro={pomodoro} sessionsToday={progress.pomodoroSessions} />
      </div>

      <GlossaryModal entry={shownGlossaryEntry} onClose={() => setGlossaryEntry(null)} onOpenEntry={setGlossaryEntry} bookmarks={progress.bookmarks} onToggleBookmark={toggleBookmark} notes={progress.notes} onSaveNote={saveNote} onCharacter={openCharacter} onEditWord={wordEditorReady ? setEditingWord : null} />
      {editingWord && <WordEditorModal entry={wordOverrides[editingWord.id] || editingWord} note={progress.notes[editingWord.id] || ''} onSave={saveEditedWord} onClose={() => setEditingWord(null)} />}
      {editingContent && (editingContent.type !== 'grammar' && !Array.isArray(editingContent.options) ? <TypingEditorModal item={editingContent} onSave={saveEditedContent} onClose={() => setEditingContent(null)} /> : <ContentEditorModal item={editingContent} onSave={saveEditedContent} onClose={() => setEditingContent(null)} />)}
      <CharacterDetailModal detail={characterDetail} onClose={() => setCharacterDetail(null)} />
      <AchievementToast badge={toast} onClose={() => setToast(null)} />
      <GlobalCourseSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} onSelect={selectSearchResult} onCommand={runPaletteCommand} activeCourseId={activeCourseId} />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <AuthModal isOpen={authModal.open} initialMode={authModal.mode} onClose={() => setAuthModal((prev) => ({ ...prev, open: false }))} onAuthenticated={(info) => { applyCloudData(info); if (info?.user) setToast({ icon: '✓', title: info.justSignedUp ? 'Đã tạo tài khoản' : 'Đã đăng nhập', description: `Chào mừng ${info.user.displayName || info.user.username} — dữ liệu đã được đồng bộ.` }); }} />
    </div>
  );
}
