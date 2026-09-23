import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
