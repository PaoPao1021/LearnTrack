import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { DatabaseSync } from 'node:sqlite';
import type { Config } from '../db/config.js';

export interface BackupResult {
  fileName: string;
  checksum: string;
  counts: Record<string, number>;
}

/**
 * Generate a consistent backup: use SQLite online backup to a snapshot file first,
 * read entities from the snapshot, then package manifest + data into a ZIP.
 */
export async function makeBackup(db: InstanceType<typeof DatabaseSync>, config: Config): Promise<BackupResult> {
  const generatedAt = new Date();
  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(config.backupDir, `snapshot-${stamp}.db`);

  // VACUUM INTO writes a consistent snapshot of the live database
  db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const tables = ['sync_ops', 'entity_versions'];
    const data: Record<string, unknown[]> = {
      entityVersions: snapshot.prepare('SELECT * FROM entity_versions').all() as unknown[],
      ops: snapshot.prepare('SELECT * FROM sync_ops').all() as unknown[],
    };
    void tables;
    const json = JSON.stringify(data);
    const checksum = crypto.createHash('sha256').update(json).digest('hex');
    const counts = { entityVersions: (data.entityVersions as unknown[]).length, ops: (data.ops as unknown[]).length };

    const manifest = {
      formatVersion: 1,
      generatedAt: generatedAt.toISOString(),
      workspaceId: 'personal',
      counts,
      checksum,
    };

    const fileName = `learntrack-backup-${stamp}.zip`;
    const zipPath = path.join(config.backupDir, fileName);
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.append(json, { name: 'data.json' });
      void archive.finalize();
    });

    db.prepare('INSERT INTO backup_log (generated_at, file_name, checksum, counts_json) VALUES (?, ?, ?, ?)')
      .run(manifest.generatedAt, fileName, checksum, JSON.stringify(counts));

    // 滚动清理：只保留最近 10 份备份，防止磁盘无限增长
    const keep = 10;
    const zips = fs.readdirSync(config.backupDir)
      .filter((f) => f.startsWith('learntrack-backup-') && f.endsWith('.zip'))
      .sort()
      .reverse();
    const stale = zips.slice(keep);
    for (const f of stale) fs.rmSync(path.join(config.backupDir, f), { force: true });

    return { fileName, checksum, counts };
  } finally {
    snapshot.close();
    fs.rmSync(snapshotPath, { force: true });
  }
}
