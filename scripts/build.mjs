import { build } from 'vite';
import react from '@vitejs/plugin-react';

await build({
  root: process.cwd(),
  configFile: false,
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
