import { useEffect, useState } from 'react';
import { fetchStudyAnalytics } from '../lib/apiClient.js';

const EVENT_LABELS = {
  quiz_answer: 'Câu quiz',
  srs_review: 'Lượt ôn SRS',
  boss_win: 'Thắng Boss',
  pomodoro_complete: 'Phiên Pomodoro',
  course_clone: 'Khóa cộng đồng tải',
};

export default function CloudAnalyticsCard({ cloud }) {
  const [analytics, setAnalytics] = useState(cloud?.analytics || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cloud?.authenticated || !cloud?.serverAvailable) return undefined;
    let live = true;
    setLoading(true);
    fetchStudyAnalytics()
      .then((res) => { if (live && res?.analytics) setAnalytics(res.analytics); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cloud?.authenticated, cloud?.serverAvailable, cloud?.lastSyncedAt]);

  if (!cloud?.authenticated || !cloud?.serverAvailable) return null;
  if (!analytics && loading) {
    return <div className="h-36 animate-pulse rounded-xl border border-border bg-bg-tertiary" aria-label="Đang tải thống kê đám mây" />;
  }
  if (!analytics) return null;

  const days = analytics.last30Days || [];
  const maxDayXp = Math.max(...days.map((d) => Number(d.xp) || 0), 10);
  const eventEntries = Object.entries(analytics.eventsByType || {});

  return (
    <section className="rounded-xl border border-accent/25 bg-bg-secondary p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Thống kê đám mây</p>
          <h2 className="mt-0.5 font-serif text-lg font-semibold">Tổng hợp toàn tài khoản</h2>
        </div>
        <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent">
          {analytics.coursesTracked || 0} khóa học
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-bg-primary p-3">
          <p className="text-xs text-text-muted">Tổng XP</p>
          <p className="mt-1 font-serif text-xl font-bold tabular text-accent">{analytics.totalXp || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-primary p-3">
          <p className="text-xs text-text-muted">Chuỗi cao nhất</p>
          <p className="mt-1 font-serif text-xl font-bold tabular">{analytics.bestStreak || 0} ngày</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-primary p-3">
          <p className="text-xs text-text-muted">Chính xác chung</p>
          <p className="mt-1 font-serif text-xl font-bold tabular text-success">{analytics.accuracy || 0}%</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-primary p-3">
          <p className="text-xs text-text-muted">Tổng câu đã làm</p>
          <p className="mt-1 font-serif text-xl font-bold tabular">{analytics.totalQuestions || 0}</p>
        </div>
      </div>

      {days.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-text-muted">Nhịp XP gần đây ({days.length} ngày có học)</p>
          <div className="flex h-20 items-end gap-1 rounded-xl border border-border bg-bg-primary p-2.5">
            {days.map((item) => {
              const ratio = Math.max(0.08, (Number(item.xp) || 0) / maxDayXp);
              return (
                <div key={item.date} title={`${item.date}: ${item.xp} XP · ${item.questions} câu`} className="flex h-full flex-1 items-end">
                  <div className="h-full w-full origin-bottom rounded-t bg-accent/85 transition-transform duration-300" style={{ transform: `scaleY(${ratio})` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {eventEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {eventEntries.map(([type, info]) => (
            <span key={type} className="rounded-lg border border-border bg-bg-primary px-2.5 py-1 text-xs text-text-secondary">
              {EVENT_LABELS[type] || type}: <strong>{info.count}</strong>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
