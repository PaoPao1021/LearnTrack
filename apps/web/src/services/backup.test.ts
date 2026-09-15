import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Category, EntryRecord } from '@learntrack/domain';
import { db } from '../db/database';
import { exportCsv, exportFullBackup, inspectBackup, restoreBackup } from './backup';

const createdAt = '2026-09-10T00:00:00.000Z';

async function withChecksum(value: { manifest: { checksum: string }; data: unknown }): Promise<string> {
  const text = JSON.stringify(value.data);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  value.manifest.checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return JSON.stringify(value);
}

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

  it('round-trips unresolved conflicts and their optional group metadata', async () => {
    const category: Category = {
      id: crypto.randomUUID(), level: 'major', parentId: null, name: '数学', color: '#3b82f6', archived: false,
      sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.categories.add(category);
    const opId = crypto.randomUUID();
    await db.conflicts.add({
      opId,
      entity: 'category', entityId: category.id, localPayload: category,
      serverPayload: { ...category, name: '旧数学', version: 2 }, serverVersion: 2,
      createdAt, opGroupId: 'group-1',
    } as never);
    const { blob } = await exportFullBackup();
    const text = await blob.text();
    await db.conflicts.clear();
    await restoreBackup(text);
    const restored = await db.conflicts.toArray() as Array<{ opId?: string; opGroupId?: string; localPayload: Category }>;
    expect(restored).toHaveLength(1);
    expect(restored[0]?.opId).toBe(opId);
    expect(restored[0]?.opGroupId).toBe('group-1');
    expect(restored[0]?.localPayload).toMatchObject({ id: category.id, name: '数学' });
  });

  it('accepts legacy backups without conflicts and clears stale conflict candidates', async () => {
    const { blob } = await exportFullBackup();
    const legacy = JSON.parse(await blob.text()) as { manifest: { checksum: string; counts: Record<string, number> }; data: Record<string, unknown> };
    delete legacy.data.conflicts;
    delete legacy.manifest.counts.conflicts;
    const text = await withChecksum(legacy);
    await db.conflicts.add({
      entity: 'category', entityId: crypto.randomUUID(), localPayload: null, serverPayload: null, serverVersion: 0, createdAt,
    });
    await restoreBackup(text);
    expect(await db.conflicts.count()).toBe(0);
  });

  it('does not inherit device or login settings from a backup when this device has none', async () => {
    await db.settings.bulkPut([
      { key: 'deviceId', value: 'backup-device' },
      { key: 'serverUrl', value: 'https://backup.example' },
      { key: 'loggedIn', value: true },
      { key: 'syncEpoch', value: 'backup-epoch' },
    ]);
    const { blob } = await exportFullBackup();
    await db.settings.bulkDelete(['deviceId', 'serverUrl', 'loggedIn']);
    await restoreBackup(await blob.text());
    await expect(db.settings.get('deviceId')).resolves.toBeUndefined();
    await expect(db.settings.get('serverUrl')).resolves.toBeUndefined();
    await expect(db.settings.get('loggedIn')).resolves.toBeUndefined();
    expect((await db.settings.get('syncEpoch'))?.value).not.toBe('backup-epoch');
  });

  it('keeps the original device ID on restored pending operations', async () => {
    const category: Category = {
      id: crypto.randomUUID(), level: 'major', parentId: null, name: '物理', color: '#3b82f6', archived: false,
      sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.categories.add(category);
    await db.pendingOps.add({
      opId: crypto.randomUUID(), deviceId: 'source-device', entity: 'category', entityId: category.id,
      baseVersion: null, payload: category, opGroupId: null, clientTimestamp: createdAt,
    });
    const { blob } = await exportFullBackup();
    await db.pendingOps.clear();
    await db.settings.put({ key: 'deviceId', value: 'this-device' });
    await restoreBackup(await blob.text());
    expect((await db.pendingOps.toArray())[0]?.deviceId).toBe('source-device');
    expect((await db.settings.get('deviceId'))?.value).toBe('this-device');
  });

  it('rejects invalid conflict payloads without changing existing local data', async () => {
    const local: Category = {
      id: crypto.randomUUID(), level: 'major', parentId: null, name: '本地分类', color: '#3b82f6', archived: false,
      sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.categories.add(local);
    const { blob } = await exportFullBackup();
    const backup = JSON.parse(await blob.text()) as { manifest: { checksum: string; counts: Record<string, number> }; data: { conflicts: unknown[] } };
    backup.data.conflicts = [{
      entity: 'category', entityId: local.id, localPayload: { id: local.id }, serverPayload: null, serverVersion: 1, createdAt,
    }];
    backup.manifest.counts.conflicts = 1;
    const text = await withChecksum(backup);
    await expect(restoreBackup(text)).rejects.toThrow('conflicts');
    expect(await db.categories.get(local.id)).toMatchObject({ name: '本地分类' });
  });

  it('rejects invalid pending-operation payloads without changing existing local data', async () => {
    const local: Category = {
      id: crypto.randomUUID(), level: 'major', parentId: null, name: '本地分类', color: '#3b82f6', archived: false,
      sortOrder: 0, createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    await db.categories.add(local);
    const { blob } = await exportFullBackup();
    const backup = JSON.parse(await blob.text()) as {
      manifest: { checksum: string; counts: Record<string, number> };
      data: { pendingOps: unknown[] };
    };
    backup.data.pendingOps = [{
      opId: crypto.randomUUID(), deviceId: 'source-device', entity: 'entry', entityId: crypto.randomUUID(),
      baseVersion: null, payload: { id: crypto.randomUUID(), version: 1 }, opGroupId: null, clientTimestamp: createdAt,
    }];
    backup.manifest.counts.pendingOps = 1;
    const text = await withChecksum(backup);
    await expect(restoreBackup(text)).rejects.toThrow('pendingOps');
    expect(await db.categories.get(local.id)).toMatchObject({ name: '本地分类' });
  });
});
