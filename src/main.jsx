import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { migrateBuiltInCourse } from './lib/db.js';
import './index.css';

// Apply the persisted theme before the first paint so dark-mode users never see
// a light flash. Palette values themselves live in index.css.
function bootTheme() {
  try {
    const mode = localStorage.getItem('dudu-theme-mode');
    const rawProgress = localStorage.getItem('dudu-progress-v1');
    const saved = rawProgress ? JSON.parse(rawProgress) : null;
    const themeMode = JSON.parse(mode || 'null') || saved?.themeMode || (localStorage.getItem('dudu-dark') === 'true' ? 'dark' : 'auto');
    const colorTheme = saved?.colorTheme || 'pastel';
    const hour = new Date().getHours();
    const isDark = themeMode === 'dark' || (themeMode === 'auto' && (hour < 6 || hour >= 18));
    const root = document.documentElement;
    root.dataset.colorTheme = ['pastel', 'rose', 'ocean'].includes(colorTheme) ? colorTheme : 'pastel';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#14161A' : '#FAF9F5');
  } catch {
    /* Storage can be blocked; the app still renders with default tokens. */
  }
}
bootTheme();

migrateBuiltInCourse().catch((error) => {
  console.warn('Không thể khởi tạo dữ liệu học tập trong IndexedDB:', error);
});

// Offline-first: the service worker caches the app shell and lesson chunks so
// lessons keep working without a network connection.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const notifyUpdate = () => window.dispatchEvent(new CustomEvent('dudu-sw-update', { detail: registration }));
      if (registration.waiting && navigator.serviceWorker.controller) notifyUpdate();
      registration.addEventListener('updatefound', () => {
        const nextWorker = registration.installing;
        if (!nextWorker) return;
        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate();
        });
      });
    }).catch((error) => {
      console.warn('Không đăng ký được service worker:', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
