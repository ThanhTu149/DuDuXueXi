import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Loại bỏ các khoá nguy hiểm chống prototype pollution. */
export function sanitizeDeep(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    clean[key] = sanitizeDeep(item, seen);
  }
  return clean;
}

export function safeJsonParse(raw, fallback = null) {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
  } catch {
    return fallback;
  }
}

export function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of String(cookieHeader).split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const rawVal = part.slice(eq + 1).trim();
    if (!name || UNSAFE_KEYS.has(name)) continue;
    try {
      cookies[name] = decodeURIComponent(rawVal);
    } catch {
      cookies[name] = rawVal;
    }
  }
  return cookies;
}

export function serializeCookie(name, value, {
  httpOnly = true,
  sameSite = 'Lax',
  secure = false,
  path: cookiePath = '/',
  maxAge = null,
} = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== null && Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

export function appendSetCookie(res, cookieString) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', [cookieString]);
  else if (Array.isArray(existing)) res.setHeader('Set-Cookie', [...existing, cookieString]);
  else res.setHeader('Set-Cookie', [String(existing), cookieString]);
}

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(body);
}

/** Đọc JSON body với giới hạn dung lượng và lọc prototype pollution. */
export async function readJsonBody(req, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new ApiError(413, 'payload_too_large', `Dữ liệu gửi lên vượt giới hạn ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, 'invalid_json', 'Nội dung yêu cầu phải là đối tượng JSON hợp lệ.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid_json', 'Không đọc được JSON trong yêu cầu.');
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return (req.socket?.remoteAddress || '127.0.0.1').slice(0, 64);
}

/** Router nhẹ hỗ trợ path param (:id) và kiểm tra method. */
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler, options = {}) {
    const keys = [];
    const regexStr = pattern
      .replace(/\/+$/, '')
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const regex = new RegExp(`^${regexStr || ''}/?$`);
    routes.push({ method: method.toUpperCase(), regex, keys, handler, options });
  }

  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o),
    delete: (p, h, o) => add('DELETE', p, h, o),
    match(method, pathname) {
      const upper = method.toUpperCase();
      for (const route of routes) {
        if (route.method !== upper) continue;
        const m = pathname.match(route.regex);
        if (!m) continue;
        const params = {};
        route.keys.forEach((key, idx) => {
          params[key] = decodeURIComponent(m[idx + 1]);
        });
        return { route, params };
      }
      return null;
    },
  };
}

/** Phục vụ thư mục tĩnh (production dist/) với SPA fallback và bảo vệ path traversal. */
export async function serveStaticDist(req, res, distDir) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return true;
  }
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.statusCode = 400;
    res.end('Bad Request');
    return true;
  }

  const rootResolved = path.resolve(distDir);
  const candidate = path.resolve(rootResolved, `.${pathname}`);
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  let filePath = candidate;
  let info = await stat(filePath).catch(() => null);
  let isFallback = false;
  if (!info || info.isDirectory()) {
    // Không fallback sang HTML nếu đường dẫn trông giống tệp asset thiếu
    if (pathname.startsWith('/assets/') || /\.(?:js|css|map|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(pathname)) {
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }
    filePath = path.join(rootResolved, 'index.html');
    info = await stat(filePath).catch(() => null);
    isFallback = true;
  }

  if (!info) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Frontend chua duoc build. Chay "npm run build" truoc khi dung che do production.');
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = pathname.startsWith('/assets/') && !isFallback
    ? 'public, max-age=31536000, immutable'
    : (pathname === '/sw.js' || isFallback || ext === '.html')
      ? 'no-cache'
      : 'public, max-age=3600';

  const body = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', cacheControl);
  if (method === 'HEAD') res.end();
  else res.end(body);
  return true;
}
