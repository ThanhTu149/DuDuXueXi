import { useEffect, useState } from 'react';
import {
  changeAccountPassword,
  exportAccountDataApi,
  fetchAccountSessions,
  revokeAccountSession,
} from '../lib/apiClient.js';
import {
  deleteUserAccount,
  signOutAccount,
  syncAllWithCloud,
  syncProfileUpdate,
} from '../lib/cloudSync.js';

function formatSyncTime(iso) {
  if (!iso) return 'Chưa đồng bộ';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AccountSyncPanel({ cloud, onOpenAuth, onCloudDataApplied }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    setSessions([]);
    setSessionsLoaded(false);
    setShowDeleteForm(false);
  }, [cloud.authenticated, cloud.user?.id]);

  const handleManualSync = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await syncAllWithCloud({ onCloudDataApplied });
      setNotice(res
        ? { ok: true, text: 'Đã đồng bộ dữ liệu hai chiều với máy chủ.' }
        : { ok: false, text: 'Không đồng bộ được lúc này. Hãy kiểm tra kết nối mạng.' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLeaderboard = async (checked) => {
    setBusy(true);
    setNotice(null);
    try {
      await syncProfileUpdate({ showOnLeaderboard: checked });
      setNotice({ ok: true, text: checked ? 'Đã bật hiển thị trên bảng xếp hạng.' : 'Đã ẩn hồ sơ khỏi bảng xếp hạng.' });
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await changeAccountPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
      setNotice({ ok: true, text: res.message || 'Đã đổi mật khẩu.' });
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleExportCloud = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const payload = await exportAccountDataApi();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dudu-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ ok: true, text: 'Đã xuất toàn bộ dữ liệu đám mây dạng JSON.' });
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const loadSessions = async () => {
    setBusy(true);
    try {
      const res = await fetchAccountSessions();
      setSessions(res.sessions || []);
      setSessionsLoaded(true);
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (sessionId) => {
    setBusy(true);
    try {
      await revokeAccountSession(sessionId);
      setSessions((items) => items.filter((item) => item.id !== sessionId));
      setNotice({ ok: true, text: 'Đã thu hồi phiên thiết bị.' });
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async (wipeLocal = false) => {
    setBusy(true);
    try {
      await signOutAccount({ wipeLocal });
      if (wipeLocal) {
        window.location.reload();
        return;
      }
      setNotice({ ok: true, text: 'Đã đăng xuất. Tiến độ cục bộ vẫn được giữ (tài khoản khác đăng nhập sẽ tự cô lập dữ liệu).' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await deleteUserAccount(deletePassword);
      window.location.reload();
    } catch (error) {
      setNotice({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.serverAvailable) {
    return (
      <section className="rounded-xl border border-border bg-bg-secondary p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold">Đồng bộ đám mây</h2>
          <span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-text-muted">Chế độ cục bộ</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Ứng dụng đang chạy độc lập trên trình duyệt (IndexedDB + PWA offline). Khởi chạy máy chủ full-stack (<code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm run dev</code> hoặc <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">npm start</code>) để bật tài khoản, đồng bộ đa thiết bị, bảng xếp hạng và Gia sư AI.
        </p>
      </section>
    );
  }

  if (!cloud.authenticated) {
    return (
      <section className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent-subtle via-bg-secondary to-accent-2-subtle p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Full-Stack Cloud</p>
            <h2 className="mt-1 font-serif text-lg font-semibold">Tài khoản & Đồng bộ đa thiết bị</h2>
            <p className="mt-1.5 text-sm text-text-secondary">
              Đăng nhập để sao lưu tiến độ, SRS, ghi chú, khóa học tự tạo lên SQLite, tham gia bảng xếp hạng cộng đồng và dùng Gia sư AI DuDu.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpenAuth('login')} className="btn-primary">Đăng nhập</button>
          <button type="button" onClick={() => onOpenAuth('register')} className="btn-secondary">Tạo tài khoản miễn phí</button>
        </div>
        {notice && (
          <p role="status" className={`mt-3 text-sm ${notice.ok ? 'text-success' : 'text-error'}`}>{notice.text}</p>
        )}
      </section>
    );
  }

  const syncBadge = cloud.syncState === 'syncing'
    ? { label: 'Đang đồng bộ...', tone: 'bg-accent-2-subtle text-accent-2' }
    : cloud.syncState === 'offline'
      ? { label: `Chờ mạng (${cloud.pendingCount})`, tone: 'bg-warning-subtle text-warning' }
      : cloud.syncState === 'error'
        ? { label: 'Cần thử lại', tone: 'bg-error-subtle text-error' }
        : { label: 'Đã đồng bộ', tone: 'bg-success-subtle text-success' };

  return (
    <section className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Tài khoản đám mây</p>
          <h2 className="mt-1 font-serif text-lg font-semibold">{cloud.user?.displayName || cloud.user?.username}</h2>
          <p className="text-xs text-text-muted">
            @{cloud.user?.username}{cloud.user?.email ? ` · ${cloud.user.email}` : ''} · Đồng bộ gần nhất: {formatSyncTime(cloud.lastSyncedAt)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${syncBadge.tone}`}>{syncBadge.label}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={handleManualSync} className="btn-primary">
          {busy ? 'Đang xử lý...' : 'Đồng bộ ngay'}
        </button>
        <button type="button" disabled={busy} onClick={handleExportCloud} className="btn-secondary">
          Xuất dữ liệu cloud
        </button>
        <button type="button" disabled={busy} onClick={() => setShowPasswordForm((v) => !v)} className="btn-secondary">
          Đổi mật khẩu
        </button>
        <button type="button" disabled={busy} onClick={loadSessions} className="btn-secondary">
          Phiên đăng nhập
        </button>
        <button type="button" disabled={busy} onClick={() => handleLogout(false)} className="btn-ghost text-text-secondary">
          Đăng xuất
        </button>
        <button type="button" disabled={busy} onClick={() => handleLogout(true)} className="btn-ghost text-xs text-error" title="Dành cho máy tính dùng chung / công cộng">
          Đăng xuất & xoá máy này
        </button>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-bg-primary px-4 py-3 text-sm">
        <span>
          <span className="block font-semibold">Hiện trên Bảng xếp hạng cộng đồng</span>
          <span className="text-xs text-text-muted">Cho phép chia sẻ XP tuần và chuỗi học với người học khác.</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={Boolean(cloud.user?.showOnLeaderboard)}
          disabled={busy}
          onChange={(event) => handleToggleLeaderboard(event.target.checked)}
        />
      </label>

      {showPasswordForm && (
        <form onSubmit={handleChangePassword} className="space-y-3 rounded-xl border border-border bg-bg-primary p-4">
          <h3 className="text-sm font-semibold">Đổi mật khẩu tài khoản</h3>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Mật khẩu hiện tại"
            className="input w-full"
          />
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
            className="input w-full"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">Cập nhật mật khẩu</button>
            <button type="button" onClick={() => setShowPasswordForm(false)} className="btn-secondary">Hủy</button>
          </div>
        </form>
      )}

      {sessionsLoaded && (
        <div className="space-y-2 rounded-xl border border-border bg-bg-primary p-4">
          <h3 className="text-sm font-semibold">Thiết bị đang đăng nhập ({sessions.length})</h3>
          {sessions.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {item.current ? 'Thiết bị này · ' : ''}{item.userAgent || 'Trình duyệt'}
                </p>
                <p className="text-text-muted">IP {item.ip || 'local'} · Hoạt động {formatSyncTime(item.lastSeenAt)}</p>
              </div>
              {!item.current && (
                <button type="button" onClick={() => handleRevoke(item.id)} className="text-error hover:underline">
                  Thu hồi
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-3">
        {!showDeleteForm ? (
          <button type="button" onClick={() => setShowDeleteForm(true)} className="text-xs text-error hover:underline">
            Xoá vĩnh viễn tài khoản đám mây...
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="space-y-3 rounded-xl border border-error/40 bg-error-subtle/40 p-4">
            <p className="text-sm font-semibold text-error">Xoá vĩnh viễn tài khoản & dữ liệu đám mây</p>
            <p className="text-xs text-text-secondary">Thao tác này không thể hoàn tác. Hãy xuất sao lưu trước nếu cần giữ dữ liệu.</p>
            <input
              type="password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="Nhập mật khẩu để xác nhận xoá tài khoản"
              className="input w-full"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !deletePassword} className="rounded-lg border border-error bg-error px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                Xác nhận xoá vĩnh viễn
              </button>
              <button type="button" onClick={() => { setShowDeleteForm(false); setDeletePassword(''); }} className="btn-secondary text-xs">
                Hủy
              </button>
            </div>
          </form>
        )}
      </div>

      {notice && (
        <p role="status" className={`text-sm ${notice.ok ? 'text-success' : 'text-error'}`}>{notice.text}</p>
      )}
    </section>
  );
}
