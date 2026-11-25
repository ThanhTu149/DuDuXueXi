import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createConfig } from './config.js';
import { openDatabase } from './db/database.js';
import {
  ApiError,
  assertCsrfSafe,
  createRouter,
  getClientIp,
  sendJson,
  serveStaticDist,
} from './lib/http.js';
import { createRateLimiter } from './lib/rateLimit.js';
import { registerAuthRoutes, resolveSession } from './routes/auth.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerHealthRoutes } from './routes/health.js';
import { createLeaderboardController } from './routes/leaderboard.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerAiRoutes } from './routes/ai.js';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://cdnjs.cloudflare.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Tạo ứng dụng HTTP full-stack DuDu Hán Ngữ (API + phục vụ SPA dist/ khi bật serveStatic).
 */
export function createApp({ configOverrides = {}, serveStatic = true, seed = true } = {}) {
  const config = createConfig(configOverrides);
  const database = openDatabase(config.dbPath, { seed });
  const { db, getSchemaVersion, pruneExpiredSessions } = database;

  const router = createRouter();
  const generalLimiter = createRateLimiter({ windowMs: 60_000, max: 240, disabled: config.rateLimitDisabled });
  const authLimiter = createRateLimiter({ windowMs: 60_000, max: 30, disabled: config.rateLimitDisabled });
  const aiLimiter = createRateLimiter({ windowMs: 60_000, max: 45, disabled: config.rateLimitDisabled });
  const cloneLimiter = createRateLimiter({ windowMs: 60_000, max: 20, disabled: config.rateLimitDisabled });

  const leaderboard = createLeaderboardController({ db });

  registerHealthRoutes(router, { db, getSchemaVersion, config });
  registerAuthRoutes(router, { db, config, authLimiter, onLeaderboardInvalidated: leaderboard.invalidate });
  registerSettingsRoutes(router, { db, config });
  registerSyncRoutes(router, { db, config, onLeaderboardInvalidated: leaderboard.invalidate });
  registerCourseRoutes(router, { db, config, cloneLimiter });
  leaderboard.registerRoutes(router);
  registerAiRoutes(router, { db, config, aiLimiter });

  // Dọn phiên hết hạn mỗi 6 giờ (unref để không giữ process khi test)
  const sessionPruneTimer = setInterval(() => {
    pruneExpiredSessions();
  }, 6 * 60 * 60 * 1000);
  if (typeof sessionPruneTimer.unref === 'function') sessionPruneTimer.unref();

  function applySecurityHeaders(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (config.cookieSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    const origin = req.headers.origin;
    if (origin && config.corsOrigin && (config.corsOrigin === '*' || config.corsOrigin.split(',').map((s) => s.trim()).includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DuDu-Client');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
  }

  async function handleRequest(req, res) {
    const startMs = Date.now();
    const incomingReqId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
    const reqId = /^[A-Za-z0-9._-]{8,64}$/.test(incomingReqId) ? incomingReqId : randomUUID();
    res.setHeader('X-Request-Id', reqId);
    applySecurityHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 'bad_url', message: 'Đường dẫn không hợp lệ.' } }, {}, req);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const matched = router.match(req.method || 'GET', url.pathname);
      if (!matched) {
        sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Không tìm thấy API endpoint này.' } }, {}, req);
        return;
      }
      let reqUserId = null;
      try {
        // Kiểm tra CSRF cho mọi mutation request dùng cookie
        assertCsrfSafe(req, config);
        // Rate limit tổng cho toàn bộ /api/*
        generalLimiter.check(`api:${getClientIp(req, { trustProxy: config.trustProxy })}`, res);

        const auth = resolveSession(req, db, config);
        reqUserId = auth?.user?.id || null;
        const ctx = {
          params: matched.params,
          query: url.searchParams,
          url,
          auth,
          config,
          db,
          reqId,
        };
        await matched.route.handler(req, res, ctx);
      } catch (error) {
        if (error instanceof ApiError) {
          sendJson(res, error.status, {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
          }, {}, req);
        } else {
          console.error('[DuDu API Error]', reqId, req.method, url.pathname, error);
          sendJson(res, 500, {
            ok: false,
            error: {
              code: 'internal_error',
              message: 'Máy chủ gặp lỗi ngoài ý muốn. Vui lòng thử lại sau.',
            },
          }, {}, req);
        }
      } finally {
        if (!config.quietLogs) {
          const duration = Date.now() - startMs;
          if (config.isProd) {
            console.log(JSON.stringify({
              level: res.statusCode >= 500 ? 'error' : 'info',
              time: new Date().toISOString(),
              reqId,
              method: req.method,
              path: url.pathname,
              status: res.statusCode,
              durationMs: duration,
              ...(reqUserId ? { userId: reqUserId } : {}),
            }));
          } else {
            console.log(`[API] ${reqId.slice(0, 8)} ${req.method} ${url.pathname} ${res.statusCode} ${duration}ms`);
          }
        }
      }
      return;
    }

    if (serveStatic) {
      await serveStaticDist(req, res, config.distDir);
      return;
    }

    sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Chỉ phục vụ API ở chế độ này.' } }, {}, req);
  }

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('[DuDu Fatal]', error);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: { code: 'fatal', message: 'Lỗi xử lý kết nối.' } }, {}, req);
      } else {
        try { res.end(); } catch { /* ignore */ }
      }
    });
  });

  // Bảo vệ chống Slowloris / treo kết nối
  server.headersTimeout = 15_000;
  server.requestTimeout = 70_000;
  server.keepAliveTimeout = 5_000;

  async function listen(port = config.port, host = config.host) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    return server.address();
  }

  async function close() {
    clearInterval(sessionPruneTimer);
    await new Promise((resolve) => server.close(() => resolve()));
    database.close();
  }

  return {
    server,
    config,
    db,
    database,
    listen,
    close,
  };
}
