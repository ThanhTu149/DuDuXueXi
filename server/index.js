import { createApp } from './app.js';

const serveStatic = process.env.DUDU_API_ONLY !== 'true';
const app = createApp({ serveStatic });

const address = await app.listen();
const host = typeof address === 'object' && address ? address.address : app.config.host;
const port = typeof address === 'object' && address ? address.port : app.config.port;

console.log(`DuDu Hán Ngữ Full-Stack Server đang chạy tại http://${host}:${port}`);
console.log(`  - API:      http://${host}:${port}/api/health`);
console.log(`  - Database: ${app.config.dbPath}`);
console.log(`  - Chế độ:   ${serveStatic ? `Full-Stack (API + ${app.config.distDir})` : 'API-only (dev proxy)'}`);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nĐang dừng DuDu Server (${signal})...`);
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
