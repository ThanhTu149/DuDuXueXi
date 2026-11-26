import { useEffect, useState } from 'react';
import { recoverAccountPassword } from '../lib/apiClient.js';
import { signInWithPassword, signUpWithPassword } from '../lib/cloudSync.js';
import useDialogA11y from '../lib/useDialogA11y.js';

export default function AuthModal({ isOpen, initialMode = 'login', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const trapRef = useDialogA11y(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError('');
      setNotice('');
      setPassword('');
      setConfirmPassword('');
      setRecoveryCode('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'recover') {
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận chưa khớp.');
        return;
      }
      setBusy(true);
      try {
        const res = await recoverAccountPassword({
          identifier: identifier.trim(),
          recoveryCode: recoveryCode.trim(),
          newPassword: password,
        });
        setRecoveryCode('');
        setConfirmPassword('');
        setPassword('');
        setMode('login');
        setNotice(res.message || 'Đã đặt lại mật khẩu. Hãy đăng nhập lại.');
      } catch (cause) {
        setError(cause?.message || 'Không khôi phục được tài khoản.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận chưa khớp.');
        return;
      }
      setBusy(true);
      try {
        const user = await signUpWithPassword(
          { username: username.trim(), displayName: displayName.trim() || username.trim(), email: email.trim(), password },
          { onCloudDataApplied: onAuthenticated },
        );
        onAuthenticated?.({ user, justSignedUp: true });
        onClose();
      } catch (cause) {
        setError(cause?.message || 'Không tạo được tài khoản.');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const user = await signInWithPassword(
        { identifier: identifier.trim(), password },
        { onCloudDataApplied: onAuthenticated },
      );
      onAuthenticated?.({ user, justSignedIn: true });
      onClose();
    } catch (cause) {
      setError(cause?.message || 'Đăng nhập chưa thành công.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={trapRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="animate-modal-in max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-bg-secondary p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Tài khoản DuDu</p>
            <h2 id="auth-modal-title" className="mt-1 font-serif text-2xl font-bold">
              {mode === 'login' ? 'Đăng nhập đồng bộ' : mode === 'recover' ? 'Khôi phục mật khẩu' : 'Tạo tài khoản học tập'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ tài khoản"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-bg-tertiary p-1" role="tablist" aria-label="Chế độ tài khoản">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => { setMode('login'); setError(''); }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-bg-secondary text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'}`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => { setMode('register'); setError(''); }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-bg-secondary text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'}`}
          >
            Tạo tài khoản
          </button>
        </div>

        <p className="mt-3 rounded-xl bg-accent-subtle px-3.5 py-2.5 text-xs leading-5 text-text-secondary">
          Tiến độ học, SRS, ghi chú và khóa học đang có trên máy này sẽ được <strong>tự động gộp và sao lưu</strong> lên đám mây — không mất dữ liệu cũ.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3.5">
          {(mode === 'login' || mode === 'recover') ? (
            <>
              <label className="block text-sm font-medium">
                Tên đăng nhập hoặc email
                <input
                  name="identifier"
                  autoFocus
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="vd: minhthu hoặc email@domain.com"
                  className="input mt-1.5 w-full"
                />
              </label>
              {mode === 'recover' && (
                <label className="block text-sm font-medium">
                  Mã khôi phục một lần
                  <input
                    name="recoveryCode"
                    required
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="input mt-1.5 w-full font-mono uppercase tracking-wider"
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm font-medium">
                Tên đăng nhập
                <input
                  name="username"
                  autoFocus
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="3–32 ký tự (chữ, số, _ . -)"
                  className="input mt-1.5 w-full"
                />
              </label>
              <label className="block text-sm font-medium">
                Tên hiển thị
                <input
                  name="displayName"
                  maxLength={60}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Tên hiển thị trên hồ sơ & bảng xếp hạng"
                  className="input mt-1.5 w-full"
                />
              </label>
              <label className="block text-sm font-medium">
                Email <span className="font-normal text-text-muted">(không bắt buộc)</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ban@example.com"
                  className="input mt-1.5 w-full"
                />
              </label>
            </>
          )}

          <label className="block text-sm font-medium">
            {mode === 'recover' ? 'Mật khẩu mới' : 'Mật khẩu'}
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ít nhất 6 ký tự"
              className="input mt-1.5 w-full"
            />
          </label>

          {(mode === 'register' || mode === 'recover') && (
            <label className="block text-sm font-medium">
              Nhập lại mật khẩu
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="input mt-1.5 w-full"
              />
            </label>
          )}

          {notice && (
            <p role="status" className="rounded-xl bg-success-subtle px-3.5 py-2.5 text-sm text-success">
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-error-subtle px-3.5 py-2.5 text-sm text-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5"
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy
              ? (mode === 'login' ? 'Đang đăng nhập...' : mode === 'recover' ? 'Đang đặt lại...' : 'Đang tạo tài khoản...')
              : (mode === 'login' ? 'Đăng nhập' : mode === 'recover' ? 'Đặt lại mật khẩu' : 'Tạo tài khoản và đồng bộ')}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('recover'); setError(''); setNotice(''); setPassword(''); setConfirmPassword(''); }}
              className="w-full text-center text-xs font-medium text-accent hover:underline"
            >
              Quên mật khẩu? Dùng mã khôi phục
            </button>
          )}
          {mode === 'recover' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setNotice(''); }}
              className="w-full text-center text-xs font-medium text-text-muted hover:text-text-primary"
            >
              ← Quay lại đăng nhập
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
