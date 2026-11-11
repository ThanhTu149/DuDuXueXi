/**
 * queue.js — hàng đợi gọi Gemini có kiểm soát tốc độ + retry.
 *
 * Điểm mạnh so với bản cũ:
 *  - Backoff luỹ thừa có jitter, tôn trọng `Retry-After` (RateLimitError.retryAfter),
 *    có trần delay để không chờ vô hạn.
 *  - `cancel()` huỷ cả request đang bay: mỗi task nhận được AbortSignal qua tham số
 *    đầu tiên (task cũ không dùng tham số này vẫn chạy như trước).
 *  - Hỗ trợ giới hạn song song (`maxConcurrent`, mặc định 1 = tuần tự như cũ).
 *  - Pause/resume/cancel/getStatus giữ nguyên hành vi cũ.
 */

import {
  ParseError,
  RateLimitError,
  ServerError,
  TimeoutError,
  isAbortError,
} from './geminiClient.js';

export const DEFAULT_RETRY_DELAYS = [5000, 15000, 45000];
export const DEFAULT_MAX_DELAY_MS = 120000;
export const DEFAULT_JITTER_RATIO = 0.2;

function abortError(message = 'Đã hủy.') {
  return typeof DOMException === 'function' ? new DOMException(message, 'AbortError') : Object.assign(new Error(message), { name: 'AbortError' });
}

/** True nếu lỗi có thể thử lại (lỗi tạm thời phía mạng/Gemini). */
export function isRetryableError(error) {
  return error instanceof RateLimitError
    || error instanceof ServerError
    || error instanceof TimeoutError
    || error instanceof ParseError
    || error?.retryable === true;
}

/**
 * Tính thời gian chờ trước lần thử tiếp theo.
 * - `baseDelay` có thể là số (nhân đôi theo attempt) hoặc mảng delay cố định.
 * - `retryAfterMs` (từ Retry-After) luôn được tôn trọng làm sàn.
 * - jitter thêm ngẫu nhiên [0, jitterRatio*delay) để nhiều tab không retry cùng lúc.
 */
export function computeBackoff({
  attempt = 0,
  baseDelay = DEFAULT_RETRY_DELAYS,
  retryAfterMs = 0,
  maxDelay = DEFAULT_MAX_DELAY_MS,
  jitterRatio = DEFAULT_JITTER_RATIO,
  random = Math.random,
} = {}) {
  const exponential = Array.isArray(baseDelay)
    ? baseDelay[Math.min(Math.max(0, attempt), baseDelay.length - 1)] ?? baseDelay[baseDelay.length - 1] ?? 0
    : Number(baseDelay) * 2 ** Math.max(0, attempt);
  const floor = Math.max(Math.max(0, Number(retryAfterMs) || 0), Math.max(0, Number(exponential) || 0));
  const spread = jitterRatio > 0 ? Math.floor(floor * jitterRatio * Math.min(1, Math.max(0, random()))) : 0;
  return Math.max(0, Math.min(maxDelay, floor + spread));
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(abortError()); return; }
  const abort = () => { clearTimeout(timer); reject(abortError()); };
  const timer = setTimeout(() => { signal?.removeEventListener?.('abort', abort); resolve(); }, Math.max(0, ms));
  signal?.addEventListener?.('abort', abort, { once: true });
});

function linkSignals(signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return { signal: null, dispose() {} };
  if (active.length === 1) return { signal: active[0], dispose() {} };
  const controller = new AbortController();
  const onAbort = () => { try { controller.abort(); } catch { /* ignore */ } };
  for (const signal of active) {
    if (signal.aborted) { onAbort(); break; }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() { for (const signal of active) signal.removeEventListener?.('abort', onAbort); },
  };
}

export class ApiQueue {
  constructor({
    maxPerMinute = 14,
    minInterval = 4500,
    maxConcurrent = 1,
    maxAttempts = 4,
    baseDelay = DEFAULT_RETRY_DELAYS,
    maxDelay = DEFAULT_MAX_DELAY_MS,
    jitterRatio = DEFAULT_JITTER_RATIO,
    parseRetryDelay = 500,
    random = Math.random,
  } = {}) {
    this.maxPerMinute = maxPerMinute;
    this.minInterval = minInterval;
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.maxAttempts = Math.max(1, maxAttempts);
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.jitterRatio = jitterRatio;
    this.parseRetryDelay = parseRetryDelay;
    this.random = random;
    this.timestamps = [];
    this.paused = false;
    this.cancelled = false;
    this.completed = 0;
    this.failed = 0;
    this.pending = 0;
    this.active = 0;
    this.slotWaiters = [];
    this.controller = new AbortController();
    this.tail = Promise.resolve();
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /** Huỷ toàn bộ: task đang chờ và request đang bay (qua signal truyền cho task). */
  cancel(reason = 'Đã hủy.') {
    this.cancelled = true;
    this.cancelReason = reason;
    try { this.controller.abort(); } catch { /* ignore */ }
    for (const resolve of this.slotWaiters.splice(0)) resolve();
  }

  getStatus() {
    return {
      paused: this.paused,
      cancelled: this.cancelled,
      pending: this.pending,
      running: this.active,
      completed: this.completed,
      failed: this.failed,
    };
  }

  _throwIfCancelled(signal) {
    if (this.cancelled || signal?.aborted) throw abortError(this.cancelReason || 'Đã hủy.');
  }

  async _acquireSlot() {
    while (this.active >= this.maxConcurrent) {
      if (this.cancelled) break;
      await new Promise((resolve) => this.slotWaiters.push(resolve));
    }
    this.active += 1;
  }

  _releaseSlot() {
    this.active = Math.max(0, this.active - 1);
    const next = this.slotWaiters.shift();
    if (next) next();
  }

  async _waitWhilePaused(signal) {
    while (this.paused && !this.cancelled && !signal?.aborted) await wait(250, signal);
  }

  add(task, options = {}) {
    this.pending += 1;
    const execute = async () => {
      await this._acquireSlot();
      try {
        return await this.run(task, options);
      } finally {
        this._releaseSlot();
      }
    };
    const next = this.maxConcurrent > 1 ? execute() : this.tail.then(execute);
    const tracked = next.finally(() => { this.pending = Math.max(0, this.pending - 1); });
    this.tail = tracked.catch(() => {});
    return tracked;
  }

  async run(task, { signal, onWait, onRetry, label = '' } = {}) {
    const linked = linkSignals([this.controller.signal, signal]);
    try {
      for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
        await this._waitWhilePaused(linked.signal);
        this._throwIfCancelled(linked.signal);

        const now = Date.now();
        this.timestamps = this.timestamps.filter((time) => now - time < 60000);
        const perMinuteWait = this.timestamps.length >= this.maxPerMinute ? 60000 - (now - this.timestamps[0]) : 0;
        const intervalWait = this.timestamps.length ? this.minInterval - (now - this.timestamps.at(-1)) : 0;
        const delay = Math.max(0, perMinuteWait, intervalWait);
        if (delay) {
          onWait?.(delay);
          await wait(delay, linked.signal);
        }
        await this._waitWhilePaused(linked.signal);
        this._throwIfCancelled(linked.signal);
        this.timestamps.push(Date.now());

        try {
          const result = await task(linked.signal);
          this.completed += 1;
          return result;
        } catch (error) {
          if (isAbortError(error) || this.cancelled || linked.signal?.aborted) throw abortError();
          if (attempt >= this.maxAttempts - 1 || !isRetryableError(error)) {
            this.failed += 1;
            throw error;
          }
          // ParseError thường do model trả JSON lỗi: thử lại nhanh, cố định 500ms
          // (giữ nguyên hành vi cũ). Các lỗi tạm thời khác: backoff + jitter.
          const retryDelayMs = error instanceof ParseError
            ? this.parseRetryDelay
            : computeBackoff({
              attempt,
              baseDelay: this.baseDelay,
              retryAfterMs: error?.retryAfter || 0,
              maxDelay: this.maxDelay,
              jitterRatio: this.jitterRatio,
              random: this.random,
            });
          onRetry?.({ attempt: attempt + 2, delay: retryDelayMs, error, label });
          await wait(retryDelayMs, linked.signal);
        }
      }
      throw new Error('Không thể xử lý yêu cầu.');
    } finally {
      linked.dispose();
    }
  }
}
