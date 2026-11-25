import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import path from 'node:path';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const COMPRESSIBLE_MIME = /^(?:text\/|application\/(?:json|javascript|manifest\+json)|image\/svg\+xml)/i;
const MIN_COMPRESS_BYTES = 1024;

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

function appendVary(res, headerName) {
  const existing = String(res.getHeader('Vary') || '');
  if (!existing) {
    res.setHeader('Vary', headerName);
    return;
  }
  const tokens = existing.split(',').map((t) => t.trim().toLowerCase());
  if (!tokens.includes(headerName.toLowerCase())) {
    res.setHeader('Vary', `${existing}, ${headerName}`);
  }
}

function compressBuffer(req, buffer, contentType) {
  if (!req || !buffer || buffer.length < MIN_COMPRESS_BYTES || !COMPRESSIBLE_MIME.test(contentType)) {
    return { body: buffer, encoding: null };
  }
  const accept = String(req.headers?.['accept-encoding'] || '').toLowerCase();
  if (accept.includes('br')) {
    return {
      body: brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }),
      encoding: 'br',
    };
  }
  if (accept.includes('gzip')) {
    return { body: gzipSync(buffer, { level: 6 }), encoding: 'gzip' };
  }
  return { body: buffer, encoding: null };
}

export function sendJson(res, status, payload, extraHeaders = {}, req = null) {
  const rawBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const contentType = 'application/json; charset=utf-8';
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  const { body, encoding } = compressBuffer(req || res.req, rawBuffer, contentType);
  if (encoding) {
    res.setHeader('Content-Encoding', encoding);
    appendVary(res, 'Accept-Encoding');
  }
  res.setHeader('Content-Length', String(body.length));
  res.end(body);
}

/** Đọc JSON body với giới hạn dung lượng và lọc prototype pollution. */
export async function readJsonBody(req, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, 'payload_too_large', `Dữ liệu gửi lên vượt giới hạn ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
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

/**
 * Lấy IP client an toàn: CHỈ tin X-Forwarded-For khi TRUST_PROXY=true để tránh giả mạo IP vượt rate-limit.
 */
export function getClientIp(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim().slice(0, 64);
    }
  }
  return (req.socket?.remoteAddress || '127.0.0.1').slice(0, 64);
}

/**
 * Kiểm tra chống CSRF cho các request thay đổi dữ liệu (POST/PUT/PATCH/DELETE) dùng Cookie auth.
 * - Chặn Fetch Metadata `Sec-Fetch-Site: cross-site` trừ khi origin nằm trong CORS_ORIGIN whitelist.
 * - Nếu trình duyệt gửi Origin (hoặc Referer), bắt buộc trùng Host (hoặc CORS_ORIGIN whitelist).
 */
export function assertCsrfSafe(req, config) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  // Request dùng Bearer token (không phụ thuộc cookie tự động của trình duyệt) không bị CSRF cookie
  if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')) {
    return;
  }

  const allowedOrigins = config.corsOrigin && config.corsOrigin !== '*'
    ? new Set(config.corsOrigin.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
    : null;

  const isAllowedOrigin = (originValue) => {
    if (!originValue) return false;
    try {
      const parsed = new URL(originValue);
      const reqHost = String(req.headers.host || '').toLowerCase();
      if (parsed.host.toLowerCase() === reqHost) return true;
      if (config.corsOrigin === '*') return true;
      if (allowedOrigins && allowedOrigins.has(parsed.origin.toLowerCase())) return true;
      return false;
    } catch {
      return false;
    }
  };

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (fetchSite === 'cross-site' && !isAllowedOrigin(origin)) {
    throw new ApiError(403, 'csrf_blocked', 'Yêu cầu từ nguồn bên ngoài bị chặn để bảo vệ tài khoản (CSRF).');
  }
  if (origin && !isAllowedOrigin(origin)) {
    throw new ApiError(403, 'csrf_blocked', 'Nguồn gốc yêu cầu (Origin) không khớp máy chủ.');
  }
  if (!origin && referer && !isAllowedOrigin(referer)) {
    throw new ApiError(403, 'csrf_blocked', 'Nguồn tham chiếu (Referer) không hợp lệ.');
  }
}

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

/** Phục vụ thư mục tĩnh (production dist/) với SPA fallback, ETag 304, nén gzip/br và chống path traversal. */
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

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cacheControl);

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim()).includes(etag)) {
    res.statusCode = 304;
    res.end();
    return true;
  }

  const rawBuffer = await readFile(filePath);
  const { body, encoding } = compressBuffer(req, rawBuffer, mime);
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  if (encoding) {
    res.setHeader('Content-Encoding', encoding);
    appendVary(res, 'Accept-Encoding');
  }
  res.setHeader('Content-Length', String(body.length));
  if (method === 'HEAD') res.end();
  else res.end(body);
  return true;
}
