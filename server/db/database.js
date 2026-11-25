import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.js';
import { seedOfficialCommunityCourses } from './seed.js';

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getIsoWeekKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const year = date.getFullYear();
  const weekOne = new Date(year, 0, 4);
  const week = 1 + Math.round(((date - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function backfillV2Columns(db) {
  const courses = db.prepare('SELECT id, chapters_json FROM courses WHERE chapter_count = 0 AND chapters_json != \'[]\'').all();
  const updateCourse = db.prepare('UPDATE courses SET chapter_count = ?, total_entries = ?, total_questions = ? WHERE id = ?');
  for (const row of courses) {
    const chapters = safeParse(row.chapters_json, []);
    if (!Array.isArray(chapters)) continue;
    const totalEntries = chapters.reduce((s, ch) => s + (ch?.glossary?.entries?.length || 0), 0);
    const totalQuestions = chapters.reduce((s, ch) => s + (ch?.quiz?.questions?.length || 0), 0);
    updateCourse.run(chapters.length, totalEntries, totalQuestions, row.id);
  }

  const weekKey = getIsoWeekKey();
  const progRows = db.prepare('SELECT user_id, course_id, weekly_xp_json FROM user_progress WHERE current_week_key = \'\'').all();
  const updateProg = db.prepare('UPDATE user_progress SET current_week_key = ?, current_week_xp = ? WHERE user_id = ? AND course_id = ?');
  for (const row of progRows) {
    const weekly = safeParse(row.weekly_xp_json, {});
    const weekXp = Math.max(0, Math.floor(Number(weekly?.[weekKey]) || 0));
    updateProg.run(weekKey, weekXp, row.user_id, row.course_id);
  }
}

export function openDatabase(dbPath, { seed = true } = {}) {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      if (migration.version === 2) backfillV2Columns(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  if (seed) {
    seedOfficialCommunityCourses(db);
  }

  function pruneExpiredSessions() {
    try {
      const res = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
      return Number(res?.changes || 0);
    } catch {
      return 0;
    }
  }

  // Dọn phiên hết hạn ngay lúc khởi động
  pruneExpiredSessions();

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw error;
    }
  }

  function getSchemaVersion() {
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return Number(row?.version || 0);
  }

  return {
    db,
    transaction,
    getSchemaVersion,
    pruneExpiredSessions,
    close() {
      if (dbPath !== ':memory:') {
        try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* ignore */ }
      }
      db.close();
    },
  };
}
