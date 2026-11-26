import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const swDistPath = path.join(distDir, 'sw.js');

if (existsSync(assetsDir) && existsSync(swDistPath)) {
  const assetFiles = readdirSync(assetsDir).sort();
  const coreAssets = assetFiles
    .filter((file) => /^(?:index|react-vendor|lesson-01)-.+\.(?:js|css)$/.test(file))
    .map((file) => `/assets/${file}`);
  const extraShellAssets = [
    '/images/hero-panda-banner.webp',
    '/images/hero-panda-banner-dark.webp',
  ].filter((rel) => existsSync(path.join(distDir, rel.replace(/^\//, ''))));

  const indexHtml = existsSync(path.join(distDir, 'index.html'))
    ? readFileSync(path.join(distDir, 'index.html'), 'utf8')
    : '';
  const buildHash = createHash('sha256')
    .update(indexHtml)
    .update(coreAssets.join(','))
    .digest('hex')
    .slice(0, 10);

  const shellUrls = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    ...coreAssets,
    ...extraShellAssets,
  ];

  let swSource = readFileSync(swDistPath, 'utf8');
  swSource = swSource
    .replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = 'v-${buildHash}';`)
    .replace(/const SHELL_URLS = \[[\s\S]*?\];/, `const SHELL_URLS = ${JSON.stringify(shellUrls, null, 2)};`);
  writeFileSync(swDistPath, swSource, 'utf8');
  console.log(`SW build stamped: v-${buildHash} (${shellUrls.length} core shell URLs precached)`);
}
