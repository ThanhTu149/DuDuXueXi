/**
 * Versioned SQLite schema migrations for DuDu Hán Ngữ Full-Stack.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_fullstack_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_lower TEXT NOT NULL UNIQUE,
        email TEXT,
        email_lower TEXT UNIQUE,
        display_name TEXT NOT NULL,
        headline TEXT NOT NULL DEFAULT 'Học viên Hán ngữ',
        bio TEXT NOT NULL DEFAULT 'Mỗi ngày tiến thêm một chút trên hành trình chinh phục tiếng Trung.',
        show_on_leaderboard INTEGER NOT NULL DEFAULT 1,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'learner',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        active_course_id TEXT NOT NULL DEFAULT 'hanngu-tap2',
        theme_mode TEXT NOT NULL DEFAULT 'auto',
        color_theme TEXT NOT NULL DEFAULT 'pastel',
        gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-latest',
        gemini_key_enc TEXT,
        gemini_key_iv TEXT,
        gemini_key_tag TEXT,
        gemini_key_hint TEXT,
        recent_course_ids_json TEXT NOT NULL DEFAULT '[]',
        settings_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'imported',
        status TEXT NOT NULL DEFAULT 'ready',
        raw_document_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        chapters_json TEXT NOT NULL DEFAULT '[]',
        is_public INTEGER NOT NULL DEFAULT 0,
        share_code TEXT UNIQUE,
        tags_json TEXT NOT NULL DEFAULT '[]',
        clone_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_id);
      CREATE INDEX IF NOT EXISTS idx_courses_public ON courses(is_public, clone_count DESC, updated_at DESC);

      CREATE TABLE IF NOT EXISTS raw_documents (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        file_type TEXT NOT NULL DEFAULT 'txt',
        status TEXT NOT NULL DEFAULT 'chunked',
        doc_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_raw_documents_course ON raw_documents(course_id);
      CREATE INDEX IF NOT EXISTS idx_raw_documents_owner ON raw_documents(owner_id);

      CREATE TABLE IF NOT EXISTS user_progress (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        accuracy_correct INTEGER NOT NULL DEFAULT 0,
        accuracy_total INTEGER NOT NULL DEFAULT 0,
        achievements_count INTEGER NOT NULL DEFAULT 0,
        weekly_xp_json TEXT NOT NULL DEFAULT '{}',
        client_saved_at TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, course_id)
      );
      CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_progress_xp ON user_progress(xp DESC);

      CREATE TABLE IF NOT EXISTS study_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        bai INTEGER,
        question_id TEXT,
        is_correct INTEGER,
        xp_earned INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_user_date ON study_events(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS tutor_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL DEFAULT 'hanngu-tap2',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tutor_user_created ON tutor_messages(user_id, created_at ASC);
    `,
  },
  {
    version: 2,
    name: 'precomputed_course_counts_and_leaderboard_columns',
    sql: `
      ALTER TABLE courses ADD COLUMN chapter_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE courses ADD COLUMN total_entries INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE courses ADD COLUMN total_questions INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE user_progress ADD COLUMN current_week_key TEXT NOT NULL DEFAULT '';
      ALTER TABLE user_progress ADD COLUMN current_week_xp INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_progress_week ON user_progress(current_week_key, current_week_xp DESC);
      CREATE INDEX IF NOT EXISTS idx_users_leaderboard ON users(show_on_leaderboard, role);
    `,
  },
  {
    version: 3,
    name: 'ai_daily_usage_quota',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_daily_usage (
        user_id INTEGER NOT NULL,
        usage_date TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        char_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, usage_date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `,
  },
];
