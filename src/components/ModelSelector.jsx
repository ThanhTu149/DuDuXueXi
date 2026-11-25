import { useEffect, useState } from 'react';
import { DEFAULT_GEMINI_MODEL, fetchAvailableModels } from '../lib/geminiClient.js';

const FALLBACK_MODELS = [
  { id: DEFAULT_GEMINI_MODEL, displayName: 'Gemini Flash (Latest)', description: 'Alias Flash mới nhất' },
  { id: 'gemini-pro-latest', displayName: 'Gemini Pro (Latest)', description: 'Alias Pro mới nhất' },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'Nhanh, phù hợp nội dung học tập' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash-Lite', description: 'Chi phí thấp' },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: 'Chất lượng cao hơn, có thể tốn phí' },
];

function contextLabel(tokens) {
  if (!tokens) return null;
  return tokens >= 1000000 ? `${(tokens / 1000000).toFixed(1)}M tokens` : `${Math.round(tokens / 1000)}K tokens`;
}

export default function ModelSelector({ apiKey, value, onChange, refreshToken = 0, useServerProxy = false }) {
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const canQuery = Boolean(apiKey?.trim() || useServerProxy);

  useEffect(() => {
    if (!canQuery) {
      setModels(FALLBACK_MODELS);
      setFallback(true);
      setError('');
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setLoading(true);
    setError('');
    fetchAvailableModels(apiKey, { force: refreshCount > 0 || refreshToken > 0, signal: controller.signal, useServerProxy })
      .then((items) => {
        if (!active) return;
        setModels(items);
        setFallback(false);
      })
      .catch((reason) => {
        if (!active) return;
        if (timedOut) {
          setError('Hết thời gian chờ danh sách model.');
        } else {
          setError(reason.message || 'Không kết nối được Gemini.');
        }
        setModels(FALLBACK_MODELS);
        setFallback(true);
      })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [apiKey, useServerProxy, canQuery, refreshCount, refreshToken]);

  const visibleModels = models.some((model) => model.id === value)
    ? models
    : [{ id: value, displayName: value, description: 'Model đã chọn trước đây; có thể không còn khả dụng.' }, ...models];

  return <div className="mt-4">
    <div className="flex items-center justify-between gap-3">
      <h3 id="gemini-model-label" className="text-sm font-semibold">Model Gemini</h3>
      <button type="button" className="text-sm font-semibold text-accent disabled:opacity-50" onClick={() => setRefreshCount((count) => count + 1)} disabled={loading || !canQuery} aria-label="Làm mới danh sách model">{loading ? 'Đang tải...' : 'Làm mới'}</button>
    </div>
    {loading && <p role="status" className="mt-2 text-xs text-text-muted">Đang lấy danh sách model từ Gemini...</p>}
    {(fallback || error) && <div role="alert" className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-text-secondary">
      <p>{error || (canQuery ? 'Không thể lấy danh sách model mới nhất.' : 'Chưa có API key.')} Đang dùng danh sách mặc định.</p>
      {canQuery && <button type="button" className="mt-1 font-semibold text-accent" disabled={loading} onClick={() => setRefreshCount((count) => count + 1)}>Thử lại</button>}
    </div>}
    <div role="radiogroup" aria-labelledby="gemini-model-label" className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-md border border-border bg-bg-primary p-1">
      {loading && fallback ? [0, 1, 2].map((index) => <div key={index} className="h-16 animate-pulse rounded-md bg-bg-tertiary" aria-hidden="true" />) : visibleModels.map((model) => <label key={model.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${value === model.id ? 'border-accent bg-accent-subtle' : 'border-transparent hover:bg-bg-tertiary'}`}>
        <input type="radio" name="gemini-model" value={model.id} checked={value === model.id} onChange={() => onChange(model.id)} className="mt-1 accent-[var(--accent)]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="break-all">{model.id}</span>{model.id.endsWith('-latest') && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">Latest</span>}{model.id.includes('preview') && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">Preview</span>}</span>
          <span className="mt-0.5 block text-xs text-text-secondary">{model.displayName}{model.description && model.description !== model.displayName ? ` · ${model.description.slice(0, 110)}` : ''}</span>
          {model.inputTokenLimit && <span className="mt-0.5 block text-[11px] text-text-muted">Context: {contextLabel(model.inputTokenLimit)}</span>}
        </span>
      </label>)}
    </div>
    <p className="mt-2 text-xs text-text-muted">{fallback ? 'Chọn model mặc định; khả năng truy cập tùy API key.' : 'Danh sách lấy trực tiếp từ Google Gemini API.'}</p>
  </div>;
}
