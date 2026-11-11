import React from 'react';

const STORAGE_KEYS = ['dudu-progress-v1', 'dudu-theme-mode', 'dudu-dark', 'customBg', 'dudu-pomodoro-v1', 'dudu-sound-enabled'];

/**
 * Top-level safety net: a rendering crash used to leave a blank white page with
 * no way back. This boundary keeps the shell usable, explains the failure in
 * Vietnamese and offers non-destructive recovery steps.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, detailsOpen: false, recovering: false, notice: '' };
    this.handleReset = this.handleReset.bind(this);
    this.handleReload = this.handleReload.bind(this);
    this.handleClearLocalData = this.handleClearLocalData.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DuDu] Màn hình gặp lỗi không mong muốn:', error, info?.componentStack);
    this.setState({ componentStack: info?.componentStack || '' });
  }

  handleReload() {
    window.location.reload();
  }

  handleReset() {
    this.setState({ recovering: true, error: null, notice: 'Đã thử tải lại giao diện. Nếu lỗi còn lặp lại, hãy dùng nút "Xóa dữ liệu cục bộ" bên dưới.' });
    // Reset only UI-related state; data is untouched.
    window.setTimeout(() => this.setState({ recovering: false }), 400);
  }

  handleClearLocalData() {
    const confirmed = window.confirm(
      'Xóa dữ liệu cục bộ sẽ xoá tiến độ học, cài đặt và ảnh nền lưu trong trình duyệt này (không ảnh hưởng khóa học mặc định). Bạn đã xuất bản sao lưu chưa?',
    );
    if (!confirmed) return;
    try {
      STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
      window.location.reload();
    } catch (error) {
      this.setState({ notice: `Không xoá được dữ liệu: ${error.message}` });
    }
  }

  render() {
    if (!this.state.error) {
      return (
        <>
          {this.state.notice && (
            <div role="status" className="fixed inset-x-0 top-0 z-[200] bg-success-subtle px-4 py-2 text-center text-sm font-semibold text-success">
              {this.state.notice}
            </div>
          )}
          {this.props.children}
        </>
      );
    }
    const message = this.state.error?.message || String(this.state.error);
    return (
      <div className="grid min-h-screen place-items-center bg-bg-primary px-4 py-12 text-text-primary">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-secondary p-6 shadow-lg">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-error-subtle text-2xl" role="img" aria-label="Lỗi">
            🐼
          </span>
          <h1 className="mt-4 font-serif text-2xl font-semibold">Trúc vấp một chút rồi</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Giao diện gặp lỗi khi vẽ màn hình. Tiến độ học của bạn vẫn được lưu an toàn trong trình duyệt. Hãy thử một trong các cách sau:
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={this.handleReload} className="btn-primary">
              Tải lại trang
            </button>
            <button type="button" onClick={this.handleReset} disabled={this.state.recovering} className="btn-secondary">
              {this.state.recovering ? 'Đang thử…' : 'Thử khôi phục giao diện'}
            </button>
            <button type="button" onClick={this.handleClearLocalData} className="btn-ghost text-error">
              Xóa dữ liệu cục bộ
            </button>
          </div>
          {this.state.notice && <p className="mt-4 rounded-lg bg-success-subtle px-3 py-2 text-sm font-semibold text-success">{this.state.notice}</p>}
          <details className="mt-5 rounded-xl bg-bg-tertiary p-3 text-sm" open={this.state.detailsOpen} onToggle={(event) => this.setState({ detailsOpen: event.currentTarget.open })}>
            <summary className="cursor-pointer font-semibold text-text-secondary">Chi tiết kỹ thuật</summary>
            <p className="mt-2 break-words font-mono text-xs text-text-muted">{message}</p>
            {this.state.componentStack && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-text-muted">{this.state.componentStack}</pre>
            )}
          </details>
        </div>
      </div>
    );
  }
}
