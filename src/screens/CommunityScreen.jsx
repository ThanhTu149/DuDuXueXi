import { useEffect, useState } from 'react';
import {
  cloneCommunityCourseApi,
  fetchCommunityCourseDetail,
  fetchCommunityCourses,
  fetchLeaderboardApi,
} from '../lib/apiClient.js';
import { saveCourse } from '../lib/db.js';
import useDialogA11y from '../lib/useDialogA11y.js';

export default function CommunityScreen({ cloud, onOpenAuth, onCourseCloned, onNavigateLibrary }) {
  const [tab, setTab] = useState('courses');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sort, setSort] = useState('popular');
  const [courses, setCourses] = useState([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [tags, setTags] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preview, setPreview] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [copiedCode, setCopiedCode] = useState('');

  const [period, setPeriod] = useState('week');
  const [leaderboard, setLeaderboard] = useState({ entries: [], currentUserRank: null, totalParticipants: 0, weekKey: '' });
  const [loadingBoard, setLoadingBoard] = useState(false);

  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const closePreview = () => setPreview(null);
  const previewDialogRef = useDialogA11y(Boolean(preview), closePreview);

  useEffect(() => {
    if (!cloud.serverAvailable) {
      setLoadingCourses(false);
      return undefined;
    }
    let live = true;
    setLoadingCourses(true);
    setError('');
    const timer = setTimeout(() => {
      fetchCommunityCourses({ q: query, tag: selectedTag, sort, limit: 20, offset: 0 })
        .then((res) => {
          if (!live) return;
          setCourses(res.courses || []);
          setTotalCourses(Number(res.total ?? res.courses?.length ?? 0));
          setTags(res.tags || []);
        })
        .catch((cause) => { if (live) setError(cause.message); })
        .finally(() => { if (live) setLoadingCourses(false); });
    }, query ? 220 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [cloud.serverAvailable, query, selectedTag, sort]);

  const loadMoreCourses = async () => {
    setLoadingMore(true);
    try {
      const res = await fetchCommunityCourses({ q: query, tag: selectedTag, sort, limit: 20, offset: courses.length });
      setCourses((prev) => [...prev, ...(res.courses || [])]);
      setTotalCourses(Number(res.total ?? 0));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const copyShareCode = async (code) => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((cur) => (cur === code ? '' : cur)), 2000);
    } catch { /* bỏ qua nếu trình duyệt chặn clipboard */ }
  };

  useEffect(() => {
    if (!cloud.serverAvailable || tab !== 'leaderboard') return undefined;
    let live = true;
    setLoadingBoard(true);
    setError('');
    fetchLeaderboardApi({ period, limit: 30 })
      .then((res) => {
        if (live) setLeaderboard(res);
      })
      .catch((cause) => { if (live) setError(cause.message); })
      .finally(() => { if (live) setLoadingBoard(false); });
    return () => { live = false; };
  }, [cloud.serverAvailable, tab, period, cloud.authenticated]);

  const openPreview = async (courseId) => {
    setError('');
    try {
      const res = await fetchCommunityCourseDetail(courseId);
      setPreview(res.course);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const handleClone = async (courseId) => {
    setCloningId(courseId);
    setError('');
    setToast('');
    try {
      const res = await cloneCommunityCourseApi(courseId);
      const saved = await saveCourse(res.course);
      setCourses((items) => items.map((item) => (
        item.id === courseId ? { ...item, cloneCount: res.cloneCount } : item
      )));
      setPreview(null);
      setToast(`Đã thêm "${saved.name}" vào Thư viện của bạn.`);
      onCourseCloned?.(saved);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setCloningId(null);
    }
  };

  if (!cloud.serverAvailable) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Cộng đồng</p>
          <h1 className="mt-1 font-serif text-2xl font-bold">Kho khóa học & Bảng xếp hạng</h1>
        </header>
        <section className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-subtle text-2xl" role="img" aria-label="Trúc">🐼</div>
          <h2 className="mt-4 font-serif text-lg font-semibold">Cần kết nối máy chủ DuDu Full-Stack</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Bạn đang học ở chế độ ngoại tuyến / tĩnh. Chạy máy chủ backend (<code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm run dev</code> hoặc <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm start</code>) để khám phá khóa học cộng đồng và bảng xếp hạng trực tuyến.
          </p>
          <button type="button" onClick={onNavigateLibrary} className="btn-primary mt-5">Về Thư viện cá nhân</button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Cộng đồng DuDu</p>
          <h1 className="mt-1 font-serif text-2xl font-bold">Khám phá & Xếp hạng</h1>
          <p className="mt-1 text-sm text-text-secondary">Tải khóa học từ cộng đồng người học hoặc thi đua XP hằng tuần.</p>
        </div>
        {!cloud.authenticated && (
          <button type="button" onClick={() => onOpenAuth('register')} className="btn-primary">
            Đăng nhập tham gia
          </button>
        )}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Mục cộng đồng">
        {[
          ['courses', 'Kho khóa học'],
          ['leaderboard', 'Bảng xếp hạng'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${tab === id ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
          >
            {label}
            {tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="rounded-xl bg-error-subtle px-4 py-3 text-sm text-error">{error}</p>}
      {toast && <p role="status" className="rounded-xl bg-success-subtle px-4 py-3 text-sm font-semibold text-success">{toast}</p>}

      {tab === 'courses' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              aria-label="Tìm khóa học cộng đồng"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, chủ đề, tác giả hoặc mã chia sẻ..."
              className="input min-w-0 flex-1"
            />
            <select
              aria-label="Sắp xếp khóa học"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="input sm:w-44"
            >
              <option value="popular">Phổ biến nhất</option>
              <option value="newest">Mới chia sẻ</option>
            </select>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTag('')}
                className={`filter-btn ${!selectedTag ? 'active' : ''}`}
              >
                Tất cả
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag((cur) => (cur === tag ? '' : tag))}
                  className={`filter-btn ${selectedTag === tag ? 'active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {loadingCourses ? (
            <div className="space-y-3" aria-label="Đang tải kho cộng đồng">
              {[1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-bg-tertiary" />)}
            </div>
          ) : !courses.length ? (
            <section className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
              <p className="font-semibold">Chưa tìm thấy khóa học phù hợp</p>
              <p className="mt-1 text-sm text-text-muted">Thử từ khóa khác hoặc chia sẻ khóa học đầu tiên từ Thư viện của bạn.</p>
            </section>
          ) : (
            <div className="grid gap-3">
              {courses.map((course) => (
                <article key={course.id} className="rounded-xl border border-border bg-bg-secondary p-5 transition hover:border-border-strong hover:shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-serif text-lg font-semibold">{course.name}</h2>
                        {course.metadata?.official && (
                          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold text-accent">Chính thức</span>
                        )}
                        {course.shareCode && (
                          <button
                            type="button"
                            onClick={() => copyShareCode(course.shareCode)}
                            title="Sao chép mã chia sẻ"
                            className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-[11px] text-text-muted transition hover:text-accent"
                          >
                            {copiedCode === course.shareCode ? '✓ Đã sao chép' : `#${course.shareCode}`}
                          </button>
                        )}
                      </div>
                      {course.description && (
                        <p className="mt-1.5 text-sm leading-6 text-text-secondary">{course.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                        <span>Tác giả: <strong className="text-text-secondary">{course.authorName}</strong></span>
                        <span>· {course.chapterCount} bài</span>
                        <span>· {course.totalEntries} mục từ/ngữ pháp</span>
                        <span>· {course.totalQuestions} câu hỏi</span>
                        <span>· {course.cloneCount} lượt tải</span>
                      </div>
                      {course.tags?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {course.tags.map((tag) => (
                            <span key={tag} className="rounded-md bg-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => openPreview(course.id)} className="btn-secondary">
                        Xem trước
                      </button>
                      <button
                        type="button"
                        disabled={cloningId === course.id}
                        onClick={() => handleClone(course.id)}
                        className="btn-primary"
                      >
                        {cloningId === course.id ? 'Đang thêm...' : 'Thêm vào thư viện'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {courses.length < totalCourses && (
                <button type="button" disabled={loadingMore} onClick={loadMoreCourses} className="btn-secondary mx-auto">
                  {loadingMore ? 'Đang tải thêm...' : `Xem thêm (${totalCourses - courses.length} khóa nữa)`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPeriod('week')}
                className={`filter-btn ${period === 'week' ? 'active' : ''}`}
              >
                Tuần này {leaderboard.weekKey ? `(${leaderboard.weekKey})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className={`filter-btn ${period === 'all' ? 'active' : ''}`}
              >
                Tổng XP mọi thời đại
              </button>
            </div>
            <span className="text-xs text-text-muted">{leaderboard.totalParticipants} học viên tham gia</span>
          </div>

          {leaderboard.currentUserRank && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-subtle px-4 py-3 text-sm">
              <div>
                <span className="font-semibold text-accent">Hạng của bạn: #{leaderboard.currentUserRank.rank}</span>
                <span className="ml-2 text-text-secondary">
                  {leaderboard.currentUserRank.xp} XP · Chuỗi {leaderboard.currentUserRank.streak} ngày · Chính xác {leaderboard.currentUserRank.accuracy}%
                </span>
              </div>
              <span className="rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-semibold">Cấp {leaderboard.currentUserRank.level}</span>
            </section>
          )}

          {loadingBoard ? (
            <div className="space-y-2" aria-label="Đang tải bảng xếp hạng">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-bg-tertiary" />)}
            </div>
          ) : !leaderboard.entries?.length ? (
            <section className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
              <p className="font-serif text-lg font-semibold">Chưa có học viên trên bảng xếp hạng</p>
              <p className="mt-1 text-sm text-text-muted">Tạo tài khoản và làm bài quiz đầu tiên để ghi tên lên vị trí #1!</p>
              {!cloud.authenticated && (
                <button type="button" onClick={() => onOpenAuth('register')} className="btn-primary mt-4">Đăng ký ngay</button>
              )}
            </section>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-secondary">
              {leaderboard.entries.map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 ${entry.isCurrentUser ? 'bg-accent-subtle/70' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-serif text-sm font-bold ${
                        entry.rank === 1
                          ? 'bg-warning text-white'
                          : entry.rank === 2
                            ? 'bg-accent-2-subtle text-accent-2'
                            : entry.rank === 3
                              ? 'bg-warm-subtle text-warm'
                              : 'bg-bg-tertiary text-text-muted'
                      }`}
                    >
                      #{entry.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {entry.displayName}
                        {entry.isCurrentUser && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] text-white">Bạn</span>}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        @{entry.username} · Cấp {entry.level} · Chuỗi {entry.streak} ngày · {entry.accuracy}% đúng
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-lg font-bold tabular text-accent">{entry.xp} XP</p>
                    {period === 'week' && entry.totalXp !== entry.xp && (
                      <p className="text-[11px] text-text-muted">Tổng {entry.totalXp} XP</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div
          className="modal-backdrop fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }}
        >
          <section
            ref={previewDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Xem trước ${preview.name}`}
            className="animate-modal-in max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg-secondary p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold uppercase text-accent">Xem trước khóa học</p>
                <h2 className="mt-1 font-serif text-xl font-bold">{preview.name}</h2>
                <p className="mt-1 text-sm text-text-secondary">{preview.description || 'Khóa học được chia sẻ từ cộng đồng.'}</p>
              </div>
              <button type="button" onClick={closePreview} aria-label="Đóng xem trước" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg-tertiary">✕</button>
            </div>

            <div className="mt-4 space-y-3">
              {(preview.chapters || []).map((chapter, idx) => (
                <div key={chapter.id || idx} className="rounded-xl border border-border bg-bg-primary p-4">
                  <p className="font-hanzi font-semibold">Bài {idx + 1}: {chapter.title_zh} {chapter.title_vi ? `· ${chapter.title_vi}` : ''}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {chapter.glossary?.entries?.length || 0} mục từ vựng/ngữ pháp · {chapter.quiz?.questions?.length || 0} câu hỏi quiz
                  </p>
                  {chapter.glossary?.entries?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {chapter.glossary.entries.slice(0, 6).map((entry) => (
                        <span key={entry.id} className="rounded-md bg-bg-secondary px-2 py-1 text-xs border border-border">
                          <strong className="font-hanzi">{entry.word_zh || entry.grammar_title_zh || entry.phrase_zh}</strong>
                          {entry.meaning_vi ? ` — ${entry.meaning_vi}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closePreview} className="btn-secondary">Đóng</button>
              <button
                type="button"
                disabled={cloningId === preview.id}
                onClick={() => handleClone(preview.id)}
                className="btn-primary"
              >
                {cloningId === preview.id ? 'Đang thêm...' : 'Thêm vào thư viện và học'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
