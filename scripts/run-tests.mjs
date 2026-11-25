/**
 * Chạy tuần tự toàn bộ 10 bộ kiểm thử Node thuần (không cần Chrome), thoát ngay khi gặp lỗi đầu tiên.
 *   npm test
 */
import { spawnSync } from 'node:child_process';

const PURE_NODE_SUITES = [
  { name: 'test:api', args: ['scripts/test-api.mjs'] },
  { name: 'test:pedagogy', args: ['--test', 'scripts/test-pedagogy.mjs'] },
  { name: 'test:gemini-retry', args: ['scripts/test-gemini-retry.mjs'] },
  { name: 'test:processing', args: ['scripts/test-processing.mjs'] },
  { name: 'test:processing-jobs', args: ['scripts/test-processing-jobs.mjs'] },
  { name: 'test:storage', args: ['scripts/test-storage-resilience.mjs'] },
  { name: 'test:db-schema', args: ['scripts/test-db-schema.mjs'] },
  { name: 'test:backup', args: ['scripts/test-backup-validation.mjs'] },
  { name: 'test:pwa', args: ['scripts/test-pwa.mjs'] },
  { name: 'test:ux', args: ['scripts/test-ux-static.mjs'] },
];

for (const suite of PURE_NODE_SUITES) {
  console.log(`\n=== [${suite.name}] node ${suite.args.join(' ')} ===`);
  const res = spawnSync(process.execPath, suite.args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.error) {
    console.error(`[${suite.name}] failed to spawn:`, res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`[${suite.name}] exited with code ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

console.log(`\nAll ${PURE_NODE_SUITES.length} pure-Node test suites passed.`);
