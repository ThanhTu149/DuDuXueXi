import { safeJsonParse, sendJson } from '../lib/http.js';

function getIsoWeekKey(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const year = date.getFullYear();
  const weekOne = new Date(year, 0, 4);
  const week = 1 + Math.round(((date - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function registerLeaderboardRoutes(router, { db }) {
  router.get('/api/leaderboard', async (req, res, ctx) => {
    const period = ctx.query.get('period') === 'all' ? 'all' : 'week';
    const limit = Math.min(50, Math.max(5, Number(ctx.query.get('limit') || 20)));
    const weekKey = getIsoWeekKey();
    const currentUserId = ctx.auth?.user?.id || null;

    const users = db.prepare(`
      SELECT id, username, display_name, headline, show_on_leaderboard, created_at
      FROM users
      WHERE role != 'system'
    `).all();

    const progressRows = db.prepare(`
      SELECT user_id, xp, streak, accuracy_correct, accuracy_total, achievements_count, weekly_xp_json
      FROM user_progress
    `).all();

    const byUser = new Map();
    for (const row of progressRows) {
      const entry = byUser.get(row.user_id) || {
        totalXp: 0,
        weeklyXp: 0,
        streak: 0,
        correct: 0,
        total: 0,
        achievements: 0,
      };
      entry.totalXp += Number(row.xp) || 0;
      entry.streak = Math.max(entry.streak, Number(row.streak) || 0);
      entry.correct += Number(row.accuracy_correct) || 0;
      entry.total += Number(row.accuracy_total) || 0;
      entry.achievements = Math.max(entry.achievements, Number(row.achievements_count) || 0);
      const weeklyMap = safeJsonParse(row.weekly_xp_json, {}) || {};
      entry.weeklyXp += Number(weeklyMap[weekKey]) || 0;
      byUser.set(row.user_id, entry);
    }

    const rankedAll = users
      .filter((u) => Boolean(u.show_on_leaderboard))
      .map((u) => {
        const stats = byUser.get(u.id) || { totalXp: 0, weeklyXp: 0, streak: 0, correct: 0, total: 0, achievements: 0 };
        const score = period === 'week' ? stats.weeklyXp : stats.totalXp;
        return {
          userId: u.id,
          username: u.username,
          displayName: u.display_name,
          headline: u.headline || 'Học viên Hán ngữ',
          xp: score,
          totalXp: stats.totalXp,
          weeklyXp: stats.weeklyXp,
          level: Math.max(1, Math.floor(stats.totalXp / 250) + 1),
          streak: stats.streak,
          accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
          achievements: stats.achievements,
          isCurrentUser: u.id === currentUserId,
        };
      })
      .sort((a, b) => (
        b.xp - a.xp
        || b.totalXp - a.totalXp
        || b.streak - a.streak
        || a.displayName.localeCompare(b.displayName)
      ))
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    const currentUserRank = currentUserId
      ? rankedAll.find((item) => item.userId === currentUserId) || null
      : null;

    sendJson(res, 200, {
      ok: true,
      period,
      weekKey,
      totalParticipants: rankedAll.length,
      entries: rankedAll.slice(0, limit),
      currentUserRank,
    });
  });
}
