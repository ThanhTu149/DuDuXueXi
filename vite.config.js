import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');
          if (normalized.includes('/node_modules/react')) return 'react-vendor';
          const lesson = normalized.match(/\/(?:glossary_|quiz_)?bai(\d{2})(?:\.json|\.txt)/);
          if (lesson) return `lesson-${lesson[1]}`;
          return undefined;
        },
      },
    },
  },
});
