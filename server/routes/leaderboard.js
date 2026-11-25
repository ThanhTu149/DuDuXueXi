import { getIsoWeekKey } from '../db/database.js';
import { sendJson } from '../lib/http.js';

const CACHE_TTL_MS = 5000;

/**
 * Bảng xếp hạng cộng đồng tối ưu hoá bằng truy vấn SQLite GROUP BY trực tiếp
 * trên cột `current_week_xp` / `xp` có chỉ mục + bộ nhớ đệm ngắn 5 giây.
 */
export function createLeaderboardController({ db }) {
  const cache = new Map();

  function invalidate() {
    cache.clear();
  }

  function queryRanked(period, weekKey) {
    const cacheKey = `${period}:${weekKey}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.rows;
    }

    const rows = db.prepare(`
      SELECT
        u.id AS user_id,
        u.username,
        u.display_name,
        u.headline,
        COALESCE(SUM(p.xp), 0) AS total_xp,
        COALESCE(SUM(CASE WHEN p.current_week_key = ? THEN p.current_week_xp ELSE 0 END), 0) AS weekly_xp,
        COALESCE(MAX(p.streak), 0) AS streak,
        COALESCE(SUM(p.accuracy_correct), 0) AS correct,
        COALESCE(SUM(p.accuracy_total), 0) AS total,
        COALESCE(MAX(p.achievements_count), 0) AS achievements
      FROM users u
      LEFT JOIN user_progress p ON p.user_id = u.id
      WHERE u.role != 'system' AND u.show_on_leaderboard = 1
      GROUP BY u.id
      ORDER BY
        CASE WHEN ? = 'week' THEN weekly_xp ELSE total_xp END DESC,
        total_xp DESC,
        streak DESC,
        u.display_name ASC
    `).all(weekKey, period);

    const ranked = rows.map((row, idx) => {
      const totalXp = Number(row.total_xp) || 0;
      const weeklyXp = Number(row.weekly_xp) || 0;
      const total = Number(row.total) || 0;
      const correct = Number(row.correct) || 0;
      return {
        rank: idx + 1,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        headline: row.headline || 'Học viên Hán ngữ',
        xp: period === 'week' ? weeklyXp : totalXp,
        totalXp,
        weeklyXp,
        level: Math.max(1, Math.floor(totalXp / 250) + 1),
        streak: Number(row.streak) || 0,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        achievements: Number(row.achievements) || 0,
      };
    });

    cache.set(cacheKey, { at: Date.now(), rows: ranked });
    return ranked;
  }

  function registerRoutes(router) {
    router.get('/api/leaderboard', async (req, res, ctx) => {
      const period = ctx.query.get('period') === 'all' ? 'all' : 'week';
      const limit = Math.min(50, Math.max(5, Number(ctx.query.get('limit') || 20)));
      const weekKey = getIsoWeekKey();
      const currentUserId = ctx.auth?.user?.id || null;

      const rankedAll = queryRanked(period, weekKey);
      const entries = rankedAll.slice(0, limit).map((item) => ({
        ...item,
        isCurrentUser: item.userId === currentUserId,
      }));
      const found = currentUserId ? rankedAll.find((item) => item.userId === currentUserId) : null;
      const currentUserRank = found ? { ...found, isCurrentUser: true } : null;

      sendJson(res, 200, {
        ok: true,
        period,
        weekKey,
        totalParticipants: rankedAll.length,
        entries,
        currentUserRank,
      });
    });
  }

  return { registerRoutes, invalidate };
}
