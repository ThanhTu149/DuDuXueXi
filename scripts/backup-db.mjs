/**
 * Sao lưu trực tuyến cơ sở dữ liệu SQLite bằng `VACUUM INTO` và kiểm tra tính toàn vẹn (`PRAGMA integrity_check`).
 * Dùng cho: `npm run db:backup` hoặc cron/systemd backup khi server đang chạy WAL mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/**
 * Tạo bản sao lưu SQLite an toàn (consistent snapshot) từ `sourceDbPath` vào `backupDir`.
 * Trả về `{ path, sizeBytes }`.
 */
export function backupSqliteDatabase(sourceDbPath, backupDir = 'backups') {
  const resolvedSource = path.resolve(sourceDbPath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Không tìm thấy file SQLite nguồn: ${resolvedSource}`);
  }

  const resolvedDir = path.resolve(backupDir);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(resolvedDir, `dudu-${stamp}.sqlite`);
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const db = new DatabaseSync(resolvedSource);
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    const escapedPath = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}';`);
  } finally {
    db.close();
  }

  const verifyDb = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const row = verifyDb.prepare('PRAGMA integrity_check;').get();
    if (!row || row.integrity_check !== 'ok') {
      throw new Error(`Bản sao lưu SQLite không đạt PRAGMA integrity_check: ${JSON.stringify(row)}`);
    }
  } finally {
    verifyDb.close();
  }

  const stat = fs.statSync(backupPath);
  return {
    path: backupPath,
    sizeBytes: stat.size,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const sourcePath = process.argv[2] || process.env.DUDU_DB_PATH || path.resolve('data/dudu.sqlite');
  const targetDir = process.argv[3] || process.env.BACKUP_DIR || path.resolve('backups');
  const result = backupSqliteDatabase(sourcePath, targetDir);
  console.log(`SQLite backup OK: ${result.path} (${result.sizeBytes} bytes, integrity_check=ok)`);
}
