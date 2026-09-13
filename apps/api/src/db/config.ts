import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  backupDir: string;
  username: string;
  passwordHash: string;
  sessionSecret: string;
  sessionTtlHours: number;
  version: string;
}

function loadConfig(): Config {
  const dataDir = process.env.LT_DATA_DIR ?? path.resolve(__dirname, '../../../../var/data');
  const backupDir = process.env.LT_BACKUP_DIR ?? path.resolve(__dirname, '../../../../var/backups');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const password = process.env.LT_PASSWORD;
  if (!password) throw new Error('缺少 LT_PASSWORD 环境变量（初始个人账号密码）');
  const port = Number(process.env.LT_PORT ?? 8787);
  const sessionTtlHours = Number(process.env.LT_SESSION_TTL_HOURS ?? 24 * 30);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LT_PORT 必须是 1–65535 的整数');
  if (!Number.isFinite(sessionTtlHours) || sessionTtlHours <= 0) throw new Error('LT_SESSION_TTL_HOURS 必须是正数');
  return {
    port,
    host: process.env.LT_HOST ?? '127.0.0.1',
    dataDir,
    backupDir,
    username: process.env.LT_USERNAME ?? 'paopao',
    // scrypt hash created at startup; login compares with scrypt
    passwordHash: hashPassword(password),
    sessionSecret: process.env.LT_SESSION_SECRET ?? 'dev-insecure-secret-change-me',
    sessionTtlHours,
    version: '0.1.0',
  };
}

import crypto from 'node:crypto';
export function hashPassword(password: string): string {
  const salt = process.env.LT_PASSWORD_SALT ?? 'learntrack-static-salt';
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

export function openDb(config: Config): InstanceType<typeof DatabaseSync> {
  const dbPath = path.join(config.dataDir, 'learntrack.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

export const config = loadConfig();

if (config.sessionSecret === 'dev-insecure-secret-change-me' || (process.env.LT_PASSWORD_SALT ?? 'learntrack-static-salt') === 'learntrack-static-salt') {
  console.warn('[LearnTrack] 警告：正在使用默认 LT_SESSION_SECRET / LT_PASSWORD_SALT，仅限本地开发，公网部署前必须更换。');
}
