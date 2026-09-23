import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { migrateBuiltInCourse } from './lib/db.js';
import './index.css';

migrateBuiltInCourse().catch((error) => {
  console.warn('Không thể khởi tạo dữ liệu học tập trong IndexedDB:', error);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
