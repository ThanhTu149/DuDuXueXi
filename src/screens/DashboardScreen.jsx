import { useEffect, useRef, useState } from 'react';
import { ALL_GLOSSARY_ENTRIES, GLOSSARY, QUIZZES } from '../data-loader.js';
import AccountSyncPanel from '../components/AccountSyncPanel.jsx';
import CloudAnalyticsCard from '../components/CloudAnalyticsCard.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ModelSelector from '../components/ModelSelector.jsx';
import { Icon, PROFILE_BADGE_ICONS, ProgressBar, StreakCalendar } from '../components/StudyUi.jsx';
import { deleteCloudGeminiKey, saveCloudGeminiKey, testServerAiKey } from '../lib/apiClient.js';
import { refreshServerInfo, syncSettingsToCloud } from '../lib/cloudSync.js';
import { getSettings, saveSettings } from '../lib/db.js';
import { DEFAULT_GEMINI_MODEL, testApiKey } from '../lib/geminiClient.js';
import { getDueEntries } from '../lib/pedagogy.js';
import { ACHIEVEMENTS, LESSONS, localDate } from '../lib/progressState.js';
import { BACKGROUNDS, THEMES, sounds } from '../lib/theme.js';

function ImportExportPanel({ progress, onImport }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dudu-progress-${localDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Đã xuất tiến độ thành công.');
  };
  const importProgress = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.baiProgress || !parsed.accuracy) throw new Error('invalid');
      setPendingImport(parsed);
    } catch {
      setStatus('File không hợp lệ hoặc bị lỗi JSON.');
    }
  };
  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-4">
      <h3 className="font-bold">Sao lưu tiến độ</h3>
      <p className="mt-1 text-sm text-text-muted">Xuất file JSON để chuyển thiết bị hoặc khôi phục sau này.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button onClick={exportProgress} className="btn-primary flex items-center justify-center gap-2"><Icon.Download />Xuất tiến độ</button>
        <button onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-border-strong bg-bg-primary px-4 py-3 font-bold"><Icon.Upload />Nhập tiến độ</button>
      </div>
      <input ref={inputRef} type="file" accept="application/json,.json" onChange={importProgress} className="hidden" />
      {status && <p className="mt-3 text-sm font-bold text-success">{status}</p>}
      {pendingImport && (
        <ConfirmDialog
          title="Ghi đè tiến độ?"
          message="Tệp này sẽ thay thế toàn bộ tiến độ hiện tại trên thiết bị. Bạn có chắc muốn tiếp tục?"
          confirmLabel="Nhập tiến độ"
          danger
          onCancel={() => setPendingImport(null)}
          onConfirm={() => { onImport(pendingImport); setPendingImport(null); setStatus('Đã khôi phục tiến độ.'); }}
        />
      )}
    </section>
  );
}

function SoundToggle() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('dudu-sound-enabled') !== 'false');
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('dudu-sound-enabled', String(next));
    if (next) sounds.correct();
  };
  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-4">
      <h3 className="font-bold">Hiệu ứng âm thanh</h3>
      <p className="mb-4 mt-1 text-sm text-text-muted">Âm thanh khi trả lời đúng/sai hoặc hoàn thành.</p>
      <button onClick={toggle} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold ${enabled ? 'bg-success text-white' : 'bg-bg-tertiary text-text-muted'}`}>
        <Icon.Volume className="h-4 w-4" />{enabled ? 'Đang bật' : 'Đã tắt'}
      </button>
    </section>
  );
}

function BackgroundSettings({ settings, updateSettings, customBackground, onCustomBackgroundChange, effectiveTheme }) {
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  if (!settings) return null;
  const selectedImage = settings.background === 'custom'
    ? customBackground
    : settings.background !== 'none' ? `/backgrounds/${settings.background}.webp` : null;
  const backgroundEnabled = settings.enableBackground && settings.background !== 'none' && (settings.background !== 'custom' || Boolean(customBackground));
  const previewOverlay = Math.min(0.96, (Math.max(88, Number(settings.overlayOpacity) || 88) + (effectiveTheme === 'dark' ? 4 : 0)) / 100);

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('File phải là ảnh JPG, PNG hoặc WebP.'); return; }
    if (file.size > 3 * 1024 * 1024) { setError('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 3 MB.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setError('Không thể đọc ảnh này. Vui lòng thử file khác.');
    reader.onload = () => {
      const base64 = String(reader.result || '');
      if (base64.length > 4 * 1024 * 1024) { setError('Ảnh sau khi xử lý quá lớn để lưu trong trình duyệt.'); return; }
      const result = onCustomBackgroundChange(base64);
      if (!result.ok) { setError(result.message); return; }
      setError('');
      updateSettings({ enableBackground: true, background: 'custom' });
    };
    reader.readAsDataURL(file);
  };

  const removeCustom = () => {
    onCustomBackgroundChange(null);
    setError('');
    updateSettings({ enableBackground: false, background: 'none' });
  };
  const resetBackground = () => {
    onCustomBackgroundChange(null);
    setError('');
    updateSettings({ enableBackground: false, background: 'none', overlayOpacity: 88, backgroundBlur: 2 });
  };

  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between gap-4">
        <div><h3 className="font-bold">Ảnh nền</h3><p className="mt-1 text-sm text-text-muted">Dùng ảnh có độ tương phản thấp để nội dung luôn dễ đọc.</p></div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={backgroundEnabled} onChange={(event) => updateSettings({ enableBackground: event.target.checked, background: event.target.checked && (settings.background === 'none' || (settings.background === 'custom' && !customBackground)) ? (customBackground ? 'custom' : 'sakura') : settings.background })} />
          <span className="relative h-6 w-11 rounded-full bg-border transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-bg-secondary after:transition-transform after:content-[''] peer-checked:bg-success peer-checked:after:translate-x-full" />
        </label>
      </div>
      <div className="mt-5 space-y-5">
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleUpload} className="sr-only" />
        {customBackground ? (
          <div className="grid grid-cols-[128px_1fr] gap-4 rounded-xl border border-border bg-bg-tertiary p-3">
            <img src={customBackground} alt="Ảnh nền tùy chỉnh" className="h-20 w-32 rounded-md object-cover" />
            <div className="flex flex-col justify-center">
              <p className="text-sm font-semibold">Ảnh nền tùy chỉnh</p>
              <div className="mt-2 flex gap-2"><button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">Đổi ảnh</button><button type="button" onClick={removeCustom} className="btn-ghost text-error">Xóa</button></div>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary flex w-full items-center justify-center gap-2"><Icon.Upload className="h-4 w-4" />Tải ảnh lên</button>
        )}
        {error && <p role="alert" className="rounded-md bg-error-subtle px-3 py-2 text-sm font-semibold text-error">{error}</p>}
        {backgroundEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BACKGROUNDS.map((bg) => (
                <button key={bg.id} type="button" onClick={() => updateSettings({ background: bg.id, enableBackground: bg.id !== 'none' })} className={`relative aspect-video overflow-hidden rounded-xl border-2 transition ${settings.background === bg.id ? 'border-accent ring-2 ring-accent-subtle' : 'border-border hover:border-border-strong'}`}>
                  {bg.id !== 'none' ? <img src={`/backgrounds/${bg.id}.webp`} className="h-full w-full object-cover" alt={bg.name} /> : <span className="block h-full w-full bg-bg-primary" />}
                  <span className="absolute inset-x-0 bottom-0 bg-black/65 p-1 text-xs text-white">{bg.name}</span>
                </button>
              ))}
              {customBackground && (
                <button type="button" onClick={() => updateSettings({ background: 'custom' })} className={`relative aspect-video overflow-hidden rounded-xl border-2 transition ${settings.background === 'custom' ? 'border-accent ring-2 ring-accent-subtle' : 'border-border hover:border-border-strong'}`}>
                  <img src={customBackground} className="h-full w-full object-cover" alt="Tùy chỉnh" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/65 p-1 text-xs text-white">Tùy chỉnh</span>
                </button>
              )}
            </div>
            <div><label className="flex justify-between text-sm"><span className="font-bold">Độ đậm lớp phủ</span><span>{settings.overlayOpacity}%</span></label><input type="range" min="88" max="96" value={settings.overlayOpacity} onChange={(event) => updateSettings({ overlayOpacity: Number(event.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /><p className="mt-1 text-xs text-text-muted">Tối thiểu 88% để chữ luôn rõ trên ảnh.</p></div>
            <div><label className="flex justify-between text-sm"><span className="font-bold">Độ nhòe ảnh</span><span>{settings.backgroundBlur}px</span></label><input type="range" min="0" max="10" value={settings.backgroundBlur} onChange={(event) => updateSettings({ backgroundBlur: Number(event.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /></div>
            <div className="rounded-xl border border-border bg-bg-tertiary p-4"><p className="mb-2 text-sm font-bold">Xem trước</p><div className="relative h-24 overflow-hidden rounded-xl border border-border-strong">{selectedImage && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${selectedImage})`, filter: `blur(${settings.backgroundBlur}px)`, transform: settings.backgroundBlur > 0 ? 'scale(1.05)' : 'scale(1)' }} />}<div className="absolute inset-0 bg-bg-primary transition-opacity" style={{ opacity: previewOverlay }} /><div className="relative flex h-full items-center justify-center"><span className="font-hanzi text-lg font-bold text-text-primary">你好 · Xin chào</span></div></div></div>
          </>
        )}
        <button type="button" onClick={resetBackground} className="btn-ghost text-text-muted">Reset về mặc định</button>
      </div>
    </section>
  );
}

function PenguinProfileAvatar({ className = '' }) {
  return <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Băng"><circle cx="60" cy="60" r="57" fill="var(--accent-2-subtle)" /><ellipse cx="60" cy="66" rx="36" ry="43" fill="#222832" /><ellipse cx="60" cy="72" rx="26" ry="33" fill="#FFFDF7" /><circle cx="47" cy="51" r="4" fill="#FFFDF7" /><circle cx="73" cy="51" r="4" fill="#FFFDF7" /><circle cx="47" cy="51" r="1.8" fill="#222832" /><circle cx="73" cy="51" r="1.8" fill="#222832" /><path d="M53 59h14l-7 8-7-8Z" fill="var(--warm)" /><path d="M28 65c-10 7-12 18-8 26 9-2 15-8 18-17l-10-9ZM92 65c10 7 12 18 8 26-9-2-15-8-18-17l10-9Z" fill="#222832" /><path d="M41 103c4-7 11-9 18-4-4 7-11 9-18 4ZM79 103c-4-7-11-9-18-4 4 7 11 9 18 4Z" fill="var(--warm)" /><path d="M37 31c12-15 34-20 50-4" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" /></svg>;
}

function ProfileCoverArt() {
  return <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true"><defs><linearGradient id="profileCover" x1="0" x2="1"><stop stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs><rect width="800" height="200" fill="url(#profileCover)" /><circle cx="650" cy="45" r="24" fill="#FFFDF7" opacity=".75" /><path d="M0 165 115 79l88 67 112-111 107 111 87-75 118 89 73-61 100 66v35H0Z" fill="#FFFDF7" opacity=".2" /><path d="M0 180c135-35 254-14 381 0 149 17 278-21 419-5v25H0Z" fill="#FFFDF7" opacity=".28" /><path d="M86 38v129M62 73c25 2 43-13 54-37M65 100c22 0 39 11 52 28" stroke="#FFFDF7" strokeWidth="4" strokeLinecap="round" opacity=".5" /><g fill="#FFFDF7" opacity=".72"><circle cx="58" cy="68" r="6" /><circle cx="77" cy="55" r="7" /><circle cx="101" cy="41" r="6" /><circle cx="67" cy="102" r="6" /><circle cx="113" cy="128" r="7" /></g></svg>;
}

function ApiKeySection({ cloud = null }) {
  const [draft, setDraft] = useState('');
  const [configured, setConfigured] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [modelKey, setModelKey] = useState('');
  const [modelRefresh, setModelRefresh] = useState(0);
  const cloudProxyActive = Boolean(cloud?.authenticated && cloud?.serverInfo?.aiProxyAvailable);
  const cloudUserKeyHint = cloud?.serverInfo?.userKeyHint || '';
  const serverKeyAvailable = Boolean(cloud?.serverInfo?.serverKeyAvailable);

  useEffect(() => {
    let active = true;
    getSettings().then((settings) => {
      if (active) { setConfigured(Boolean(settings.geminiApiKey)); setModel(settings.geminiModel || DEFAULT_GEMINI_MODEL); setModelKey(settings.geminiApiKey || ''); }
    }).catch(() => {
      if (active) setStatus({ ok: false, message: 'Không đọc được cài đặt từ IndexedDB.' });
    });
    return () => { active = false; };
  }, []);

  const saveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    setBusy('saving');
    setStatus(null);
    try {
      await saveSettings({ geminiApiKey: key, geminiModel: model });
      let cloudMessage = '';
      if (cloud?.authenticated && cloud?.serverAvailable) {
        try {
          const cloudRes = await saveCloudGeminiKey(key, model);
          refreshServerInfo({ userKeyConfigured: true, userKeyHint: cloudRes.hint || '', aiProxyAvailable: true });
          cloudMessage = ' và đã mã hoá đồng bộ lên máy chủ.';
        } catch {
          cloudMessage = ' (chưa đẩy được lên máy chủ, vẫn dùng cục bộ).';
        }
      }
      setConfigured(true);
      setModelKey(key);
      setModelRefresh((count) => count + 1);
      setDraft('');
      setVisible(false);
      setStatus({ ok: true, message: `Đã lưu API key trên trình duyệt này${cloudMessage || '.'}` });
    } catch {
      setStatus({ ok: false, message: 'Không lưu được API key vào IndexedDB.' });
    } finally {
      setBusy(null);
    }
  };

  const removeCloudKey = async () => {
    setBusy('removing');
    setStatus(null);
    try {
      await deleteCloudGeminiKey();
      refreshServerInfo({ userKeyConfigured: false, userKeyHint: '', aiProxyAvailable: serverKeyAvailable });
      setStatus({ ok: true, message: 'Đã xoá Gemini API key đã mã hoá khỏi máy chủ.' });
    } catch (error) {
      setStatus({ ok: false, message: error.message || 'Không xoá được key trên máy chủ.' });
    } finally {
      setBusy(null);
    }
  };

  const checkKey = async () => {
    setBusy('checking');
    setStatus(null);
    try {
      const key = draft.trim() || (await getSettings()).geminiApiKey;
      if (!key && cloudProxyActive) {
        await testServerAiKey({ model });
        setModelRefresh((count) => count + 1);
        setStatus({ ok: true, message: 'Kết nối Gemini qua máy chủ hoạt động ổn định.' });
        return;
      }
      const result = await testApiKey(key, model);
      setModelKey(key || '');
      setModelRefresh((count) => count + 1);
      setStatus(result.ok
        ? { ok: true, message: draft.trim() ? 'API key hoạt động. Nhấn Lưu để dùng sau.' : 'API key hoạt động.' }
        : { ok: false, message: result.error });
    } catch (error) {
      setStatus({ ok: false, message: error?.message || 'Không đọc được API key đã lưu.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Gemini API Key</h2>
        {cloud?.authenticated && cloud?.serverInfo?.userKeyConfigured && (
          <span className="rounded-full bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success">Đã mã hoá trên máy chủ {cloudUserKeyHint ? `· ${cloudUserKeyHint}` : ''}</span>
        )}
        {cloud?.serverAvailable && serverKeyAvailable && !cloud?.serverInfo?.userKeyConfigured && (
          <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent">Máy chủ đã có sẵn key AI</span>
        )}
      </div>
      <p className="mt-1 text-sm text-text-muted">{configured ? 'Đã cấu hình. Key đã lưu không được hiển thị lại.' : cloudProxyActive ? 'Có thể dùng Gemini qua máy chủ mà không cần nhập lại key.' : 'Chưa cấu hình.'} Lấy key tại Google AI Studio.</p>
      <ModelSelector apiKey={modelKey} useServerProxy={!modelKey && cloudProxyActive} value={model} refreshToken={modelRefresh} onChange={async (value) => { setModel(value); try { await saveSettings({ geminiModel: value }); syncSettingsToCloud({ geminiModel: value }); } catch { setStatus({ ok: false, message: 'Không lưu được model.' }); } }} />
      {model.includes('pro') && <p className="mt-2 text-sm text-warning">Model Pro có thể phát sinh chi phí. Hãy kiểm tra quota và giá trong Google AI Studio trước khi xử lý tài liệu dài.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="min-w-[220px] flex-1" htmlFor="gemini-api-key"><span className="sr-only">Gemini API key</span><input id="gemini-api-key" className="input w-full" type={visible ? 'text' : 'password'} autoComplete="new-password" value={draft} onChange={(event) => { setDraft(event.target.value); setStatus(null); }} placeholder={configured ? 'Nhập key mới để thay thế' : 'Dán API key của bạn'} /></label>
        <button type="button" className="btn-secondary" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ẩn API key đang nhập' : 'Hiện API key đang nhập'}>{visible ? 'Ẩn' : 'Hiện'}</button>
        <button type="button" className="btn-primary" onClick={saveKey} disabled={!draft.trim() || Boolean(busy)}>Lưu</button>
        <button type="button" className="btn-secondary" onClick={checkKey} disabled={(!draft.trim() && !configured && !cloudProxyActive) || Boolean(busy)}>{busy === 'checking' ? 'Đang kiểm tra...' : 'Kiểm tra'}</button>
        {cloud?.authenticated && cloud?.serverInfo?.userKeyConfigured && (
          <button type="button" className="btn-ghost text-xs text-error" onClick={removeCloudKey} disabled={Boolean(busy)}>Xoá key máy chủ</button>
        )}
      </div>
      {status && <p role="status" className={`mt-3 text-sm ${status.ok ? 'text-success' : 'text-error'}`}>{status.message}</p>}
      <p className="mt-3 text-xs text-text-muted">{cloud?.authenticated ? 'Khi đăng nhập, key được mã hoá AES-256-GCM trên máy chủ để dùng cho Gia sư AI và đồng bộ đa thiết bị.' : 'Key chỉ lưu trong IndexedDB trên thiết bị này. Không dùng key nhạy cảm trên máy công cộng.'}</p>
    </section>
  );
}

export default function Dashboard({ progress, onImport, onThemeChange, onColorThemeChange, onChangeGoal, onUpdateProfile, updateSettings, customBackground, onCustomBackgroundChange, effectiveTheme, initialTab = 'overview', cloud = null, onOpenAuth = null, onCloudDataApplied = null }) {
  const [tab, setTab] = useState(initialTab);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(progress.profile);
  useEffect(() => setDraft(progress.profile), [progress.profile]);
  const accuracy = progress.accuracy.total ? Math.round((progress.accuracy.correct / progress.accuracy.total) * 100) : 0;
  const completedCount = LESSONS.filter((bai) => progress.baiProgress[bai]?.completed).length;
  const joinedDays = Math.max(1, Math.round((new Date(`${localDate()}T12:00:00`) - new Date(`${progress.profile.joinedAt || localDate()}T12:00:00`)) / 86400000));
  const joinedLabel = joinedDays <= 1 ? 'Bắt đầu hôm nay' : `Đồng hành ${joinedDays} ngày`;
  const lastSeven = Array.from({ length: 7 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() - (6 - offset)); const key = localDate(date); return { key, label: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()], value: progress.studyDays[key]?.xp ?? progress.dailyXp[key] ?? 0 }; });
  const maxXp = Math.max(...lastSeven.map((item) => item.value), 10);
  const recentStudy = Object.entries(progress.studyDays || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 5);
  const dueSrs = getDueEntries(progress.srs, ALL_GLOSSARY_ENTRIES).length;
  const skills = [
    { label: 'Từ vựng', value: Math.min(100, Math.round((Object.keys(progress.srs || {}).length / Math.max(1, ALL_GLOSSARY_ENTRIES.filter((entry) => entry.type === 'word').length)) * 100)), tone: 'bg-accent' },
    { label: 'Ngữ pháp', value: accuracy, tone: 'bg-[var(--accent-purple)]' },
    { label: 'Chính tả', value: progress.advancedStats?.dictationAverage || 0, tone: 'bg-accent-2' },
    { label: 'Phát âm', value: progress.advancedStats?.pronunciationBest || 0, tone: 'bg-warm' },
  ];
  const achievementProgress = (id) => ({ first_lesson: completedCount ? 100 : 0, streak_3: Math.min(100, progress.streak / 3 * 100), streak_7: Math.min(100, progress.streak / 7 * 100), combo_10: Math.min(100, progress.correctStreak / 10 * 100), clean_book: progress.accuracy.total && !progress.wrongAnswers.length ? 100 : 0, all_lessons: LESSONS.length ? completedCount / LESSONS.length * 100 : 0, accuracy_90: progress.accuracy.total >= 50 ? Math.min(100, accuracy / 90 * 100) : Math.min(99, progress.accuracy.total * 2), boss_first: progress.bossWins ? 100 : 0 }[id] || 0);
  const saveProfile = () => { onUpdateProfile({ name: draft.name.trim() || 'Học viên', headline: draft.headline.trim() || 'Học viên Hán ngữ', bio: draft.bio.trim() }); setEditing(false); };
  const tabs = [['overview', 'Tổng quan'], ['achievements', 'Thành tích'], ['activity', 'Hoạt động'], ['settings', 'Cài đặt']];
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xs">
        <div className="relative h-[200px] overflow-hidden"><ProfileCoverArt /></div>
        <div className="relative px-6 pb-6">
          <div className="-mt-[60px] flex items-end justify-between gap-4">
            <div className="h-[120px] w-[120px] overflow-hidden rounded-full border-4 border-bg-secondary bg-bg-secondary shadow-md transition duration-200 hover:rotate-[3deg]"><PenguinProfileAvatar className="h-full w-full" /></div>
            <button onClick={() => { setTab('overview'); setEditing(true); }} className="btn-secondary mb-2 flex items-center gap-2"><Icon.Pen />Chỉnh sửa</button>
          </div>
          <h1 className="mt-3 font-serif text-[28px] font-bold">{progress.profile.name || 'Học viên'}</h1>
          <p className="text-[15px] text-text-secondary">{progress.profile.headline}</p>
          <p className="mt-1 text-sm text-text-muted">Đang học {progress.unlockedBai.length}/{LESSONS.length} bài · {joinedLabel}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-text-secondary">
            {[[`${progress.xp} XP`, 'XP'], [`${progress.streak} ngày`, 'streak'], [`${accuracy}%`, 'accuracy'], [`${progress.accuracy.total} câu`, 'questions']].map(([value, key], index) => <span key={key} className="flex items-center gap-3">{index > 0 && <span className="text-border-strong">·</span>}{value}</span>)}
          </div>
        </div>
      </section>

      <nav className="flex overflow-x-auto border-b border-border" aria-label="Các phần hồ sơ">
        {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${tab === id ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}>{label}{tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}</button>)}
      </nav>
      {tab === 'settings' && cloud && <AccountSyncPanel cloud={cloud} onOpenAuth={onOpenAuth} onCloudDataApplied={onCloudDataApplied} />}
      {tab === 'settings' && <ApiKeySection cloud={cloud} />}

      {tab === 'overview' && (
        <div className="space-y-4">
          {cloud?.serverAvailable && !cloud.authenticated && <AccountSyncPanel cloud={cloud} onOpenAuth={onOpenAuth} onCloudDataApplied={onCloudDataApplied} />}
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-semibold">Giới thiệu</h2>{!editing && <button onClick={() => setEditing(true)} className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-bg-tertiary" aria-label="Sửa giới thiệu"><Icon.Pen /></button>}</div>
                {editing ? (
                  <div className="mt-4 space-y-3">
                    <input className="input w-full" value={draft.name} onChange={(event) => setDraft((item) => ({ ...item, name: event.target.value }))} aria-label="Tên hiển thị" />
                    <input className="input w-full" value={draft.headline} onChange={(event) => setDraft((item) => ({ ...item, headline: event.target.value }))} aria-label="Mô tả hồ sơ" />
                    <textarea className="input w-full" rows={4} value={draft.bio} onChange={(event) => setDraft((item) => ({ ...item, bio: event.target.value }))} aria-label="Giới thiệu bản thân" />
                    <div className="flex justify-end gap-2"><button onClick={() => { setDraft(progress.profile); setEditing(false); }} className="btn-secondary">Hủy</button><button onClick={saveProfile} className="btn-primary">Lưu hồ sơ</button></div>
                  </div>
                ) : <p className="mt-3 text-sm leading-6 text-text-secondary">{progress.profile.bio}</p>}
              </section>
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <h2 className="font-serif text-lg font-semibold">Kỹ năng</h2>
                <div className="mt-5 space-y-4">
                  {skills.map((skill) => (
                    <div key={skill.label}>
                      <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{skill.label}</span><span className="text-text-muted">{Math.round(skill.value)}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary"><div className={`h-full origin-left rounded-full transition-transform duration-300 ${skill.tone}`} style={{ transform: `scaleX(${Math.min(100, Math.max(0, skill.value)) / 100})` }} /></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <h2 className="font-serif text-lg font-semibold">Bài học gần đây</h2>
                <div className="mt-3 divide-y divide-border">
                  {progress.unlockedBai.slice().reverse().slice(0, 5).map((bai) => {
                    const lesson = progress.baiProgress[bai];
                    const meta = GLOSSARY[bai]?.metadata;
                    return (
                      <div key={bai} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-subtle font-serif font-semibold text-accent">{String(bai).padStart(2, '0')}</span>
                        <span className="min-w-0"><span className="block truncate font-hanzi font-medium">{meta?.title_zh || `Bài ${bai}`}</span><span className="block text-xs text-text-muted">{lesson.quizDone}/{QUIZZES[bai]?.questions.length || 30} câu</span></span>
                        <span className="text-xs font-semibold text-text-muted">{lesson.completed ? 'Đã xong' : 'Đang học'}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <h2 className="font-serif text-lg font-semibold">Bạn đã xem</h2>
                <div className="mt-4 space-y-3">{[[Icon.Bookmark, 'Từ đã lưu', progress.bookmarks.length], [Icon.Pen, 'Ghi chú', Object.keys(progress.notes || {}).length], [Icon.Refresh, 'SRS đến hạn', dueSrs]].map(([ItemIcon, label, value]) => <div key={label} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-bg-tertiary text-accent"><ItemIcon /></span><span className="flex-1 text-sm text-text-secondary">{label}</span><strong className="font-serif text-lg">{value}</strong></div>)}</div>
              </section>
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <h2 className="font-serif text-lg font-semibold">Huy hiệu</h2>
                <div className="mt-4 grid grid-cols-4 gap-2">{ACHIEVEMENTS.slice(0, 4).map((badge) => { const BadgeIcon = PROFILE_BADGE_ICONS[badge.id] || Icon.Star; const unlocked = progress.achievements.includes(badge.id); return <span key={badge.id} title={badge.title} className={`grid aspect-square place-items-center rounded-xl border ${unlocked ? 'border-warning bg-warning-subtle text-warning' : 'border-border bg-bg-tertiary text-text-muted opacity-45'}`}><BadgeIcon /></span>; })}</div>
                <button onClick={() => setTab('achievements')} className="btn-ghost mt-3 w-full text-accent">Xem thành tích</button>
              </section>
              <section className="rounded-xl border border-border bg-bg-secondary p-5">
                <h2 className="font-serif text-lg font-semibold">Lịch sử học</h2>
                <div className="mt-3 space-y-3">{recentStudy.length ? recentStudy.map(([date, data]) => <div key={date} className="flex items-center gap-3 text-sm"><span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-subtle text-accent"><Icon.Calendar /></span><span className="flex-1 text-text-secondary">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00`))}</span><strong>{data.questions || 0} câu</strong></div>) : <p className="text-sm text-text-muted">Chưa có phiên học được ghi nhận.</p>}</div>
              </section>
            </div>
          </div>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((badge) => {
            const unlocked = progress.achievements.includes(badge.id);
            const percent = Math.round(achievementProgress(badge.id));
            const BadgeIcon = PROFILE_BADGE_ICONS[badge.id] || Icon.Star;
            return (
              <article key={badge.id} className={`rounded-xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${unlocked ? 'border-warning bg-warning-subtle' : 'border-border bg-bg-secondary'}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${unlocked ? 'bg-warning text-white' : 'bg-bg-tertiary text-text-muted'}`}><BadgeIcon /></span>
                <h2 className="mt-4 text-[15px] font-semibold">{badge.title}</h2>
                <p className="mt-1 min-h-10 text-sm text-text-muted">{badge.description}</p>
                <ProgressBar value={percent} className="mt-4" />
                <div className="mt-2 flex justify-between text-xs font-semibold"><span className={unlocked ? 'text-success' : 'text-text-muted'}>{unlocked ? 'Đã đạt' : 'Chưa đạt'}</span><span className="text-text-muted">{percent}%</span></div>
              </article>
            );
          })}
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-4">
          <CloudAnalyticsCard cloud={cloud} />
          <section className="rounded-xl border border-border bg-bg-secondary p-5">
            <div className="flex items-center gap-2"><Icon.Chart className="text-accent" /><h2 className="font-serif text-lg font-semibold">XP trong 7 ngày</h2></div>
            <div className="mt-5 flex h-44 items-end gap-3">
              {lastSeven.map((item) => {
                const ratio = Math.max(0.04, item.value / maxXp);
                return (
                  <div key={item.key} className="flex h-full flex-1 flex-col text-center">
                    <span className="mb-2 text-xs font-semibold text-text-muted">{item.value}</span>
                    <div className="flex min-h-1 flex-1 items-end overflow-hidden rounded-t-lg"><div className="h-full w-full origin-bottom bg-accent transition-transform duration-300" style={{ transform: `scaleY(${ratio})` }} /></div>
                    <span className="mt-2 text-[11px] font-medium text-text-muted">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-bg-secondary p-5"><StreakCalendar studyDays={progress.studyDays} streak={progress.streak} /></section>
            <section className="rounded-xl border border-border bg-bg-secondary p-5">
              <h2 className="font-serif text-lg font-semibold">Tiến độ theo bài</h2>
              <div className="mt-4 space-y-3">
                {LESSONS.slice(0, 5).map((bai) => {
                  const data = progress.baiProgress[bai] || { quizDone: 0, quizCorrect: 0 };
                  const value = data.quizDone ? (data.quizCorrect / data.quizDone) * 100 : 0;
                  return <div key={bai} className="grid grid-cols-[42px_1fr_48px] items-center gap-2 text-xs"><strong>Bài {bai}</strong><ProgressBar value={value} /><span className="text-right text-text-muted">{data.quizCorrect}/{data.quizDone}</span></div>;
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Mục tiêu mỗi ngày</h2><p className="mt-1 text-sm text-text-muted">Điều chỉnh số câu muốn hoàn thành trong ngày.</p><div className="mt-4 grid grid-cols-4 gap-2">{[10, 20, 30, 50].map((goal) => <button key={goal} onClick={() => onChangeGoal(goal)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${progress.dailyGoal === goal ? 'border-accent bg-accent-subtle text-accent' : 'border-border hover:bg-bg-tertiary'}`}>{goal}</button>)}</div></section>
          <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Giao diện sáng / tối</h2><p className="mb-4 mt-1 text-sm text-text-muted">Chế độ tự động dùng giao diện sáng từ 06:00 đến 18:00.</p><div className="grid grid-cols-3 gap-2">{[['light', 'Sáng'], ['dark', 'Tối'], ['auto', 'Tự động']].map(([id, label]) => <button key={id} onClick={() => onThemeChange(id)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${progress.themeMode === id ? 'border-accent bg-accent-subtle text-accent' : 'border-border'}`}>{label}</button>)}</div></section>
          <section className="rounded-xl border border-border bg-bg-secondary p-5"><h2 className="font-serif text-lg font-semibold">Theme màu sắc</h2><div className="mt-4 grid grid-cols-3 gap-2">{Object.entries(THEMES).map(([id, theme]) => <button key={id} onClick={() => onColorThemeChange(id)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${progress.colorTheme === id ? 'border-accent bg-accent-subtle text-accent' : 'border-border'}`}>{theme.name}</button>)}</div></section>
          <BackgroundSettings settings={progress.settings} updateSettings={updateSettings} customBackground={customBackground} onCustomBackgroundChange={onCustomBackgroundChange} effectiveTheme={effectiveTheme} />
          <SoundToggle />
          <section className="rounded-xl border border-border bg-bg-secondary p-5"><div className="flex items-center gap-2"><Icon.Clock className="text-accent" /><h2 className="font-serif text-lg font-semibold">Pomodoro hôm nay</h2></div><p className="mt-3 font-serif text-2xl font-semibold text-error">{progress.pomodoroSessions} phiên</p><p className="mt-1 text-sm text-text-muted">Mỗi phiên tập trung kéo dài 25 phút.</p></section>
          <ImportExportPanel progress={progress} onImport={onImport} />
        </div>
      )}
    </div>
  );
}
