import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createApp } from '../server/app.js';

const apiPort = Number(process.env.API_PORT || process.env.PORT || 3001);
const apiHost = process.env.HOST || '127.0.0.1';

const backend = createApp({
  configOverrides: { PORT: String(apiPort), HOST: apiHost },
  serveStatic: false,
});
const addr = await backend.listen(apiPort, apiHost);
const actualApiPort = typeof addr === 'object' && addr ? addr.port : apiPort;
const apiTarget = `http://${apiHost}:${actualApiPort}`;

console.log(`DuDu API Server đang chạy tại ${apiTarget} (DB: ${backend.config.dbPath})`);

const shouldOpen = process.argv.includes('--open') || process.env.DUDU_OPEN === '1';

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    open: shouldOpen,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
});

await viteServer.listen();
viteServer.printUrls();

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([viteServer.close(), backend.close()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
