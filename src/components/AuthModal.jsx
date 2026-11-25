import { useEffect, useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../lib/cloudSync.js';
import useDialogA11y from '../lib/useDialogA11y.js';

export default function AuthModal({ isOpen, initialMode = 'login', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trapRef = useDialogA11y(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError('');
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
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
              {mode === 'login' ? 'Đăng nhập đồng bộ' : 'Tạo tài khoản học tập'}
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
          {mode === 'login' ? (
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
            Mật khẩu
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

          {mode === 'register' && (
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
              ? (mode === 'login' ? 'Đang đăng nhập...' : 'Đang tạo tài khoản...')
              : (mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản và đồng bộ')}
          </button>
        </form>
      </section>
    </div>
  );
}
