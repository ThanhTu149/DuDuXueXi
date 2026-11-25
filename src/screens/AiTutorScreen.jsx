import { useEffect, useRef, useState } from 'react';
import {
  clearTutorHistoryApi,
  fetchTutorHistoryApi,
  saveCloudGeminiKey,
  sendTutorMessageApi,
} from '../lib/apiClient.js';
import { getSettings } from '../lib/db.js';
import { refreshServerInfo } from '../lib/cloudSync.js';

const QUICK_PROMPTS = [
  'Giải thích điểm ngữ pháp quan trọng nhất trong bài hiện tại kèm 2 ví dụ dễ hiểu.',
  'Tạo một đoạn hội thoại ngắn 4 câu sử dụng từ vựng bài đang học (kèm pinyin và dịch tiếng Việt).',
  'Phân biệt các từ dễ nhầm trong bài này giúp mình nhớ lâu hơn.',
  'Sửa giúp mình câu này và giải thích lỗi: 我昨天去图书馆看书了很多。',
];

function extractChineseSnippet(text) {
  const matches = String(text || '').match(/[\u3400-\u9fff][^\n]{1,60}/g);
  return matches ? matches[0].replace(/[*#`]/g, '').trim() : '';
}

function speakZh(text) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

export default function AiTutorScreen({ cloud, lessonContext, onOpenAuth, onOpenSettings }) {
  const [messages, setMessages] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [localKey, setLocalKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    let live = true;
    getSettings().then((s) => { if (live) setLocalKey(s.geminiApiKey || ''); }).catch(() => {});
    if (!cloud.serverAvailable || !cloud.authenticated) {
      setLoading(false);
      return () => { live = false; };
    }
    setLoading(true);
    setError('');
    fetchTutorHistoryApi()
      .then((res) => {
        if (!live) return;
        setMessages(res.messages || []);
        setAiAvailable(Boolean(res.aiAvailable));
      })
      .catch((cause) => { if (live) setError(cause.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cloud.serverAvailable, cloud.authenticated, cloud.serverInfo?.aiProxyAvailable]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const syncLocalKeyToServer = async () => {
    if (!localKey) return;
    setError('');
    try {
      const res = await saveCloudGeminiKey(localKey);
      refreshServerInfo({ userKeyConfigured: true, userKeyHint: res.hint || '', aiProxyAvailable: true });
      setAiAvailable(true);
    } catch (cause) {
      setError(cause.message || 'Không đồng bộ được API key lên máy chủ.');
    }
  };

  const send = async (textOverride = null) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setError('');
    setSending(true);
    if (textOverride === null) setInput('');
    const optimistic = { id: `tmp-${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await sendTutorMessageApi({
        message: text,
        courseId: lessonContext?.courseId || 'hanngu-tap2',
        lessonContext,
      });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        res.userMessage,
        res.reply,
      ]);
      setAiAvailable(true);
    } catch (cause) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      if (textOverride === null) setInput(text);
      setError(cause.message || 'Gia sư AI chưa phản hồi được.');
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    setError('');
    try {
      await clearTutorHistoryApi();
      setMessages([]);
    } catch (cause) {
      setError(cause.message);
    }
  };

  if (!cloud.serverAvailable) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Gia sư AI</p>
          <h1 className="mt-1 font-serif text-2xl font-bold">Gia sư Trúc AI</h1>
        </header>
        <section className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-subtle text-3xl" role="img" aria-label="Trúc">🐼</div>
          <h2 className="mt-4 font-serif text-lg font-semibold">Cần máy chủ DuDu Full-Stack</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Gia sư AI lưu lịch sử hỏi đáp trong SQLite và gọi Gemini qua máy chủ an toàn. Hãy khởi chạy <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm run dev</code> hoặc <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm start</code> để trò chuyện cùng Trúc.
          </p>
        </section>
      </div>
    );
  }

  if (!cloud.authenticated) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Gia sư AI</p>
          <h1 className="mt-1 font-serif text-2xl font-bold">Gia sư Trúc AI</h1>
          <p className="mt-1 text-sm text-text-secondary">Hỏi đáp ngữ pháp, sửa câu tiếng Trung, luyện hội thoại theo đúng bài đang học.</p>
        </header>
        <section className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent-subtle via-bg-secondary to-accent-2-subtle p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-bg-secondary text-4xl shadow-xs" role="img" aria-label="Trúc">🐼</div>
          <h2 className="mt-4 font-serif text-xl font-semibold">Đăng nhập để trò chuyện cùng Gia sư Trúc</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Lịch sử hỏi đáp của bạn được lưu riêng trên tài khoản và đồng bộ trên mọi thiết bị.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => onOpenAuth('login')} className="btn-primary">Đăng nhập</button>
            <button type="button" onClick={() => onOpenAuth('register')} className="btn-secondary">Tạo tài khoản</button>
          </div>
        </section>
      </div>
    );
  }

  const readyToChat = aiAvailable;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Gia sư AI</p>
          <h1 className="mt-1 font-serif text-2xl font-bold">Trò chuyện cùng Trúc 🐼</h1>
          {lessonContext?.lessonTitleZh && (
            <p className="mt-1 text-xs text-text-muted">
              Ngữ cảnh bài đang mở: <strong className="font-hanzi text-text-secondary">{lessonContext.lessonTitleZh}</strong>
              {lessonContext.lessonTitleVi ? ` · ${lessonContext.lessonTitleVi}` : ''}
            </p>
          )}
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={clearHistory} className="btn-secondary text-xs">
            Xóa lịch sử chat
          </button>
        )}
      </header>

      {!loading && !readyToChat && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-subtle px-4 py-3 text-sm">
          <span className="text-text-primary">
            {localKey
              ? 'Bạn đã lưu Gemini key trên trình duyệt. Hãy mã hoá đồng bộ key lên máy chủ (AES-256-GCM) để dùng Gia sư AI an toàn.'
              : 'Chưa có Gemini API key trên tài khoản hoặc máy chủ. Thêm key trong Cài đặt để bật Gia sư AI.'}
          </span>
          <div className="flex shrink-0 gap-2">
            {localKey && (
              <button type="button" onClick={syncLocalKeyToServer} className="btn-primary text-xs">Mã hoá & bật ngay</button>
            )}
            <button type="button" onClick={onOpenSettings} className="btn-secondary text-xs">Mở Cài đặt AI</button>
          </div>
        </div>
      )}

      <section className="flex min-h-[420px] flex-col rounded-2xl border border-border bg-bg-secondary shadow-xs">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 max-h-[58vh]">
          {loading ? (
            <div className="space-y-3" aria-label="Đang tải hội thoại">
              <div className="h-16 w-3/4 animate-pulse rounded-xl bg-bg-tertiary" />
              <div className="ml-auto h-12 w-1/2 animate-pulse rounded-xl bg-bg-tertiary" />
            </div>
          ) : !messages.length ? (
            <div className="py-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-subtle text-3xl" role="img" aria-label="Trúc">🐼</div>
              <p className="mt-3 font-serif text-lg font-semibold">Chào {cloud.user?.displayName || 'bạn'}! Hôm nay cần Trúc hỗ trợ gì nào?</p>
              <p className="mt-1 text-sm text-text-muted">Chọn một gợi ý nhanh bên dưới hoặc gõ câu hỏi tiếng Việt / tiếng Trung của bạn.</p>
              <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={sending}
                    onClick={() => send(prompt)}
                    className="rounded-xl border border-border bg-bg-primary p-3 text-xs leading-5 text-text-secondary transition hover:border-accent hover:text-text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              const zhSample = !isUser ? extractChineseSnippet(msg.content) : '';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <article
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
                      isUser
                        ? 'bg-accent text-[var(--on-accent)]'
                        : 'border border-border bg-bg-primary text-text-primary'
                    }`}
                  >
                    {!isUser && <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-accent">🐼 Gia sư Trúc</p>}
                    <div className="break-words">{msg.content}</div>
                    {zhSample && (
                      <button
                        type="button"
                        onClick={() => speakZh(zhSample)}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent-subtle"
                      >
                        🔊 Nghe câu mẫu
                      </button>
                    )}
                  </article>
                </div>
              );
            })
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-border bg-bg-primary px-4 py-3 text-sm text-text-muted">
                Trúc đang suy nghĩ và soạn giải thích...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="px-4 pb-2">
            <p role="alert" className="rounded-xl bg-error-subtle px-3 py-2 text-xs text-error">{error}</p>
          </div>
        )}

        <form
          onSubmit={(event) => { event.preventDefault(); send(); }}
          className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-end"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Hỏi ngữ pháp, gửi câu tiếng Trung cần sửa, hoặc nhờ đặt ví dụ... (Enter để gửi)"
            aria-label="Nhập câu hỏi cho Gia sư AI"
            className="input min-w-0 flex-1 resize-none"
          />
          <button type="submit" disabled={sending || !input.trim()} className="btn-primary shrink-0 px-5 py-2.5">
            {sending ? 'Đang gửi...' : 'Gửi'}
          </button>
        </form>
      </section>
    </div>
  );
}
