import { createServer } from 'node:http';
import { createConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { ApiError, createRouter, sendJson, serveStaticDist } from './lib/http.js';
import { createRateLimiter } from './lib/rateLimit.js';
import { registerAuthRoutes, resolveSession } from './routes/auth.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerLeaderboardRoutes } from './routes/leaderboard.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerAiRoutes } from './routes/ai.js';

/**
 * Tạo ứng dụng HTTP full-stack DuDu Hán Ngữ (API + phục vụ SPA dist/ khi bật serveStatic).
 * Tách riêng hàm factory để dễ kiểm thử song song với SQLite :memory: hoặc file tạm.
 */
export function createApp({ configOverrides = {}, serveStatic = true, seed = true } = {}) {
  const config = createConfig(configOverrides);
  const database = openDatabase(config.dbPath, { seed });
  const { db, getSchemaVersion } = database;

  const router = createRouter();
  const authLimiter = createRateLimiter({ windowMs: 60_000, max: 30, disabled: config.rateLimitDisabled });
  const aiLimiter = createRateLimiter({ windowMs: 60_000, max: 45, disabled: config.rateLimitDisabled });

  registerHealthRoutes(router, { db, getSchemaVersion, config });
  registerAuthRoutes(router, { db, config, authLimiter });
  registerSettingsRoutes(router, { db, config });
  registerSyncRoutes(router, { db, config });
  registerCourseRoutes(router, { db, config });
  registerLeaderboardRoutes(router, { db });
  registerAiRoutes(router, { db, config, aiLimiter });

  function applySecurityHeaders(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.headers.origin;
    if (origin && config.corsOrigin && (config.corsOrigin === '*' || config.corsOrigin.split(',').map((s) => s.trim()).includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
  }

  async function handleRequest(req, res) {
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
      sendJson(res, 400, { ok: false, error: { code: 'bad_url', message: 'Đường dẫn không hợp lệ.' } });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const matched = router.match(req.method || 'GET', url.pathname);
      if (!matched) {
        sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Không tìm thấy API endpoint này.' } });
        return;
      }
      try {
        const auth = resolveSession(req, db, config);
        const ctx = {
          params: matched.params,
          query: url.searchParams,
          url,
          auth,
          config,
          db,
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
          });
          return;
        }
        console.error('[DuDu API Error]', req.method, url.pathname, error);
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'internal_error',
            message: 'Máy chủ gặp lỗi ngoài ý muốn. Vui lòng thử lại sau.',
          },
        });
      }
      return;
    }

    if (serveStatic) {
      await serveStaticDist(req, res, config.distDir);
      return;
    }

    sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Chỉ phục vụ API ở chế độ này.' } });
  }

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('[DuDu Fatal]', error);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: { code: 'fatal', message: 'Lỗi xử lý kết nối.' } });
      } else {
        try { res.end(); } catch { /* ignore */ }
      }
    });
  });

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
