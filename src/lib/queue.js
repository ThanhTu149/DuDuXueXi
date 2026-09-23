import { ParseError, RateLimitError, ServerError, TimeoutError } from './geminiClient.js';

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Đã hủy.', 'AbortError')); return; }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); reject(new DOMException('Đã hủy.', 'AbortError')); };
  signal?.addEventListener('abort', abort, { once: true });
});

export class ApiQueue {
  constructor({ maxPerMinute = 14, minInterval = 4500 } = {}) {
    this.maxPerMinute = maxPerMinute;
    this.minInterval = minInterval;
    this.timestamps = [];
    this.paused = false;
    this.cancelled = false;
    this.completed = 0;
    this.failed = 0;
    this.pending = 0;
    this.tail = Promise.resolve();
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  cancel() { this.cancelled = true; }
  getStatus() { return { paused: this.paused, cancelled: this.cancelled, pending: this.pending, completed: this.completed, failed: this.failed }; }
  add(task, options = {}) {
    this.pending += 1;
    const next = this.tail.then(() => this.run(task, options)).finally(() => { this.pending -= 1; });
    this.tail = next.catch(() => {});
    return next;
  }
  async run(task, { signal, onWait, onRetry } = {}) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      while (this.paused && !this.cancelled) await wait(250, signal);
      if (this.cancelled || signal?.aborted) throw new DOMException('Đã hủy.', 'AbortError');
      const now = Date.now();
      this.timestamps = this.timestamps.filter((time) => now - time < 60000);
      const perMinuteWait = this.timestamps.length >= this.maxPerMinute ? 60000 - (now - this.timestamps[0]) : 0;
      const intervalWait = this.timestamps.length ? this.minInterval - (now - this.timestamps.at(-1)) : 0;
      const delay = Math.max(0, perMinuteWait, intervalWait);
      if (delay) { onWait?.(delay); await wait(delay, signal); }
      while (this.paused && !this.cancelled) await wait(250, signal);
      if (this.cancelled || signal?.aborted) throw new DOMException('Đã hủy.', 'AbortError');
      this.timestamps.push(Date.now());
      try { const result = await task(); this.completed += 1; return result; }
      catch (error) {
        if (error.name === 'AbortError') throw error;
        if (attempt === 3 || !(error instanceof RateLimitError || error instanceof ServerError || error instanceof TimeoutError || error instanceof ParseError)) { this.failed += 1; throw error; }
        const delay = error instanceof ParseError ? 500 : Math.max(error.retryAfter || 0, [5000, 15000, 45000][attempt]);
        onRetry?.({ attempt: attempt + 2, delay, error });
        await wait(delay, signal);
      }
    }
    throw new Error('Không thể xử lý yêu cầu.');
  }
}
