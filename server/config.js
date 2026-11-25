import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Đọc tệp .env tối giản (không cần phụ thuộc bên ngoài).
 * Chỉ điền biến chưa có trong process.env để tôn trọng cấu hình môi trường thật.
 */
export function loadDotEnv(envPath = path.join(ROOT_DIR, '.env')) {
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* Bỏ qua nếu không đọc được .env */
  }
}

function resolveSecret(envValue, secretFilePath) {
  if (envValue && envValue.trim().length >= 16) return envValue.trim();
  try {
    if (existsSync(secretFilePath)) {
      const saved = readFileSync(secretFilePath, 'utf8').trim();
      if (saved.length >= 32) return saved;
    }
    mkdirSync(path.dirname(secretFilePath), { recursive: true });
    const generated = randomBytes(32).toString('hex');
    writeFileSync(secretFilePath, `${generated}\n`, { mode: 0o600 });
    return generated;
  } catch {
    return randomBytes(32).toString('hex');
  }
}

export function createConfig(overrides = {}) {
  loadDotEnv();
  const env = { ...process.env, ...overrides };
  const nodeEnv = env.NODE_ENV || 'development';
  const dbPath = env.DUDU_DB_PATH
    ? (env.DUDU_DB_PATH === ':memory:' ? ':memory:' : path.resolve(ROOT_DIR, env.DUDU_DB_PATH))
    : path.join(ROOT_DIR, 'data', 'dudu.sqlite');

  const secretBaseDir = dbPath === ':memory:' ? path.join(ROOT_DIR, 'data') : path.dirname(dbPath);
  const encryptionSecret = env.ENCRYPTION_KEY || env.SESSION_SECRET || (
    dbPath === ':memory:'
      ? randomBytes(32).toString('hex')
      : resolveSecret('', path.join(secretBaseDir, '.dudu-secret'))
  );

  return {
    rootDir: ROOT_DIR,
    nodeEnv,
    isProd: nodeEnv === 'production',
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT ?? 3001),
    dbPath,
    distDir: path.resolve(ROOT_DIR, env.DIST_DIR || 'dist'),
    sessionCookieName: env.SESSION_COOKIE_NAME || 'dudu_session',
    sessionTtlDays: Math.max(1, Number(env.SESSION_TTL_DAYS || 30)),
    encryptionSecret,
    geminiApiKey: (env.GEMINI_API_KEY || '').trim() || null,
    corsOrigin: (env.CORS_ORIGIN || '').trim() || null,
    trustProxy: env.TRUST_PROXY === 'true',
    cookieSecure: env.COOKIE_SECURE === 'true' || (nodeEnv === 'production' && env.COOKIE_SECURE !== 'false'),
    rateLimitDisabled: env.DUDU_DISABLE_RATE_LIMIT === 'true',
    quietLogs: env.DUDU_QUIET_LOGS === 'true' || dbPath === ':memory:',
    maxCoursesPerUser: Math.max(5, Number(env.MAX_COURSES_PER_USER || 50)),
    serverAiDailyRequests: Math.max(1, Number(env.SERVER_AI_DAILY_LIMIT || 30)),
    serverAiDailyChars: Math.max(1000, Number(env.SERVER_AI_DAILY_CHARS || 120_000)),
  };
}
