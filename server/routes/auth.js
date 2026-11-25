import { randomUUID } from 'node:crypto';
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../lib/crypto.js';
import {
  ApiError,
  appendSetCookie,
  getClientIp,
  parseCookies,
  readJsonBody,
  sendJson,
  serializeCookie,
} from '../lib/http.js';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    displayName: row.display_name,
    headline: row.headline || 'Học viên Hán ngữ',
    bio: row.bio || '',
    showOnLeaderboard: Boolean(row.show_on_leaderboard),
    role: row.role || 'learner',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Đọc phiên đăng nhập từ HttpOnly cookie hoặc Authorization Bearer token. */
export function resolveSession(req, db, config) {
  let rawToken = null;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim();
  }
  if (!rawToken) {
    const cookies = parseCookies(req.headers.cookie || '');
    rawToken = cookies[config.sessionCookieName] || null;
  }
  if (!rawToken || rawToken.length < 16) return null;

  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.created_at AS session_created_at,
           u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash, now);

  if (!row || row.role === 'system') return null;

  try {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, row.session_id);
  } catch { /* không chặn request nếu cập nhật last_seen lỗi */ }

  return {
    sessionId: row.session_id,
    user: serializeUser(row),
    userRow: row,
  };
}

export function requireAuth(ctx) {
  if (!ctx.auth?.user) {
    throw new ApiError(401, 'unauthorized', 'Bạn cần đăng nhập để thực hiện thao tác này.');
  }
  return ctx.auth.user;
}

function createSessionForUser(db, config, req, res, userId) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlDays * 86400 * 1000).toISOString();
  const sessionId = `sess-${randomUUID()}`;
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  const ip = getClientIp(req);

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, ua, ip, expiresAt, now.toISOString(), now.toISOString());

  // Dọn các phiên hết hạn cũ của user này
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, now.toISOString());

  appendSetCookie(res, serializeCookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * 86400,
  }));

  return { sessionId, expiresAt };
}

function clearSessionCookie(config, res) {
  appendSetCookie(res, serializeCookie(config.sessionCookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: 0,
  }));
}

export function registerAuthRoutes(router, { db, config, authLimiter }) {
  // Luôn trả 200 OK để trình duyệt không log lỗi 401 đỏ ở Console khi người dùng chưa đăng nhập
  router.get('/api/auth/me', async (req, res, ctx) => {
    const user = ctx.auth?.user || null;
    let aiStatus = { serverKeyAvailable: Boolean(config.geminiApiKey), userKeyConfigured: false, userKeyHint: '' };
    if (user) {
      const settingsRow = db.prepare('SELECT gemini_key_enc, gemini_key_hint FROM user_settings WHERE user_id = ?').get(user.id);
      aiStatus.userKeyConfigured = Boolean(settingsRow?.gemini_key_enc);
      aiStatus.userKeyHint = settingsRow?.gemini_key_hint || '';
    }
    sendJson(res, 200, {
      ok: true,
      authenticated: Boolean(user),
      user,
      server: {
        version: '2.0.0',
        aiProxyAvailable: Boolean(config.geminiApiKey || aiStatus.userKeyConfigured),
        serverKeyAvailable: aiStatus.serverKeyAvailable,
        userKeyConfigured: aiStatus.userKeyConfigured,
        userKeyHint: aiStatus.userKeyHint,
      },
    });
  });

  router.post('/api/auth/register', async (req, res) => {
    authLimiter.check(`register:${getClientIp(req)}`, res);
    const body = await readJsonBody(req);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const displayName = String(body.displayName || username).trim();

    if (!USERNAME_RE.test(username)) {
      throw new ApiError(400, 'invalid_username', 'Tên đăng nhập cần dài 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    }
    if (username.toLowerCase() === 'dudu_official') {
      throw new ApiError(409, 'username_taken', 'Tên đăng nhập này đã được sử dụng.');
    }
    if (email && !EMAIL_RE.test(email)) {
      throw new ApiError(400, 'invalid_email', 'Địa chỉ email không hợp lệ.');
    }
    if (password.length < 6 || password.length > 128) {
      throw new ApiError(400, 'invalid_password', 'Mật khẩu cần từ 6 đến 128 ký tự.');
    }
    if (!displayName || displayName.length > 60) {
      throw new ApiError(400, 'invalid_display_name', 'Tên hiển thị cần từ 1 đến 60 ký tự.');
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(username.toLowerCase());
    if (existingUser) {
      throw new ApiError(409, 'username_taken', 'Tên đăng nhập này đã có người dùng. Hãy chọn tên khác.');
    }
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email_lower = ?').get(email.toLowerCase());
      if (existingEmail) {
        throw new ApiError(409, 'email_taken', 'Email này đã được đăng ký cho tài khoản khác.');
      }
    }

    const now = new Date().toISOString();
    const userId = `user-${randomUUID()}`;
    const { hash, salt } = hashPassword(password);

    db.prepare(`
      INSERT INTO users (
        id, username, username_lower, email, email_lower, display_name,
        headline, bio, show_on_leaderboard, password_hash, password_salt, role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'learner', ?, ?)
    `).run(
      userId,
      username,
      username.toLowerCase(),
      email || null,
      email ? email.toLowerCase() : null,
      displayName,
      'Học viên Hán ngữ',
      'Mỗi ngày tiến thêm một chút trên hành trình chinh phục tiếng Trung.',
      hash,
      salt,
      now,
      now,
    );

    db.prepare(`
      INSERT OR IGNORE INTO user_settings (user_id, updated_at) VALUES (?, ?)
    `).run(userId, now);

    createSessionForUser(db, config, req, res, userId);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    sendJson(res, 201, {
      ok: true,
      authenticated: true,
      user: serializeUser(created),
    });
  });

  router.post('/api/auth/login', async (req, res) => {
    authLimiter.check(`login:${getClientIp(req)}`, res);
    const body = await readJsonBody(req);
    const identifier = String(body.identifier || body.username || body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!identifier || !password) {
      throw new ApiError(400, 'missing_credentials', 'Vui lòng nhập tên đăng nhập (hoặc email) và mật khẩu.');
    }

    const row = db.prepare(`
      SELECT * FROM users
      WHERE (username_lower = ? OR email_lower = ?) AND role != 'system'
    `).get(identifier, identifier);

    if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) {
      throw new ApiError(401, 'invalid_credentials', 'Tên đăng nhập hoặc mật khẩu không đúng.');
    }

    createSessionForUser(db, config, req, res, row.id);
    sendJson(res, 200, {
      ok: true,
      authenticated: true,
      user: serializeUser(row),
    });
  });

  router.post('/api/auth/logout', async (req, res, ctx) => {
    if (ctx.auth?.sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(ctx.auth.sessionId);
    }
    clearSessionCookie(config, res);
    sendJson(res, 200, { ok: true, authenticated: false });
  });

  router.patch('/api/auth/profile', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const body = await readJsonBody(req);

    const displayName = body.displayName !== undefined ? String(body.displayName).trim() : user.displayName;
    const headline = body.headline !== undefined ? String(body.headline).trim().slice(0, 120) : user.headline;
    const bio = body.bio !== undefined ? String(body.bio).trim().slice(0, 500) : user.bio;
    const showOnLeaderboard = body.showOnLeaderboard !== undefined
      ? (body.showOnLeaderboard ? 1 : 0)
      : (user.showOnLeaderboard ? 1 : 0);

    if (!displayName || displayName.length > 60) {
      throw new ApiError(400, 'invalid_display_name', 'Tên hiển thị cần từ 1 đến 60 ký tự.');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET display_name = ?, headline = ?, bio = ?, show_on_leaderboard = ?, updated_at = ?
      WHERE id = ?
    `).run(displayName, headline || 'Học viên Hán ngữ', bio, showOnLeaderboard, now, user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    sendJson(res, 200, { ok: true, user: serializeUser(updated) });
  });

  router.post('/api/auth/password', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    authLimiter.check(`password:${user.id}`, res);
    const body = await readJsonBody(req);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (newPassword.length < 6 || newPassword.length > 128) {
      throw new ApiError(400, 'invalid_password', 'Mật khẩu mới cần từ 6 đến 128 ký tự.');
    }

    const row = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(currentPassword, row?.password_hash, row?.password_salt)) {
      throw new ApiError(400, 'wrong_password', 'Mật khẩu hiện tại chưa chính xác.');
    }

    const { hash, salt } = hashPassword(newPassword);
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').run(hash, salt, now, user.id);
    // Thu hồi các phiên đăng nhập khác để bảo mật
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, ctx.auth.sessionId);

    sendJson(res, 200, { ok: true, message: 'Đã đổi mật khẩu và đăng xuất các thiết bị khác.' });
  });

  router.get('/api/auth/sessions', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const now = new Date().toISOString();
    const rows = db.prepare(`
      SELECT id, user_agent, ip, created_at, last_seen_at, expires_at
      FROM sessions
      WHERE user_id = ? AND expires_at > ?
      ORDER BY last_seen_at DESC
    `).all(user.id, now);

    sendJson(res, 200, {
      ok: true,
      sessions: rows.map((item) => ({
        id: item.id,
        userAgent: item.user_agent,
        ip: item.ip,
        createdAt: item.created_at,
        lastSeenAt: item.last_seen_at,
        expiresAt: item.expires_at,
        current: item.id === ctx.auth.sessionId,
      })),
    });
  });

  router.delete('/api/auth/sessions/:id', async (req, res, ctx) => {
    const user = requireAuth(ctx);
    const targetId = ctx.params.id;
    const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(targetId, user.id);
    if (!result.changes) {
      throw new ApiError(404, 'not_found', 'Không tìm thấy phiên đăng nhập cần thu hồi.');
    }
    if (targetId === ctx.auth.sessionId) clearSessionCookie(config, res);
    sendJson(res, 200, { ok: true });
  });
}
