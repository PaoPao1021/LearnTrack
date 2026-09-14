import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Category, EntryRecord } from '@learntrack/domain';
import { db } from '../db/database';
import { exportCsv, exportFullBackup, inspectBackup, restoreBackup } from './backup';

const createdAt = '2026-09-10T00:00:00.000Z';

describe('local backup and CSV export', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('exports the correct major, subject and activity columns with CSV escaping', async () => {
    const categories: Category[] = [
      { id: crypto.randomUUID(), level: 'major', parentId: null, name: '数学', color: '#3b82f6', archived: false, sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1 },
      { id: crypto.randomUUID(), level: 'subject', parentId: '', name: '高数', color: '#3b82f6', archived: false, sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1 },
      { id: crypto.randomUUID(), level: 'activity', parentId: '', name: '习题', color: '#3b82f6', archived: false, sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1 },
    ];
    categories[1]!.parentId = categories[0]!.id;
    categories[2]!.parentId = categories[1]!.id;
    const entry: EntryRecord = {
      id: crypto.randomUUID(), deviceId: 'device-1', activityId: categories[2]!.id,
      method: 'duration', learningDate: '2026-09-10', startedAt: null, endedAt: null,
      timeZone: 'Asia/Shanghai', durationSeconds: 1800, note: '=SUM(1,2)',
      createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.categories.bulkAdd(categories);
    await db.entries.add(entry);

    const csv = await (await exportCsv()).text();
    expect(csv).toContain(',数学,高数,习题,');
    expect(csv).toContain('"\'=SUM(1,2)"');
  });

  it('validates collection counts and resets the sync cursor after restore', async () => {
    await db.settings.put({ key: 'lastSyncCursor', value: 99 });
    const { blob } = await exportFullBackup();
    const text = await blob.text();
    await expect(inspectBackup(text)).resolves.toBeTruthy();
    await restoreBackup(text);
    expect((await db.settings.get('lastSyncCursor'))?.value).toBe(0);

    const tampered = JSON.parse(text) as { manifest: { counts: Record<string, number> } };
    tampered.manifest.counts.entries = 100;
    await expect(inspectBackup(JSON.stringify(tampered))).rejects.toThrow('计数不一致');
  });

  it('rejects a checksummed backup with orphaned entity references', async () => {
    const entry: EntryRecord = {
      id: crypto.randomUUID(), deviceId: 'device-1', activityId: crypto.randomUUID(),
      method: 'duration', learningDate: '2026-09-10', startedAt: null, endedAt: null,
      timeZone: 'Asia/Shanghai', durationSeconds: 60,
      createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.entries.add(entry);

    const { blob } = await exportFullBackup();
    await expect(inspectBackup(await blob.text())).rejects.toThrow('不存在的活动');
  });
});
