import { ApiError } from './http.js';

/**
 * Bộ giới hạn tần suất (sliding window trong bộ nhớ) theo IP/tài khoản.
 * Bảo vệ endpoint đăng nhập, đăng ký và proxy Gemini khỏi spam/brute-force.
 */
export function createRateLimiter({ windowMs = 60_000, max = 60, disabled = false } = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size < 2000) return;
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  return {
    check(key, res) {
      if (disabled) return;
      const now = Date.now();
      prune(now);
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= max) {
        const oldest = list[0];
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
        res?.setHeader('Retry-After', String(retryAfterSec));
        res?.setHeader('X-RateLimit-Limit', String(max));
        res?.setHeader('X-RateLimit-Remaining', '0');
        throw new ApiError(429, 'rate_limited', `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSec} giây.`, { retryAfterSec });
      }
      list.push(now);
      hits.set(key, list);
      res?.setHeader('X-RateLimit-Limit', String(max));
      res?.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - list.length)));
    },
    reset() {
      hits.clear();
    },
  };
}
