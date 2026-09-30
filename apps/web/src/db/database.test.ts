import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './database';

afterEach(async () => { db.close(); await db.delete(); });

describe('database upgrade from the deployed version', () => {
  it('preserves historical records, settings, pending writes, conflicts and assets from version 3', async () => {
    db.close(); await db.delete();
    const old = new Dexie('learntrack');
    old.version(3).stores({
      categories: 'id, level, parentId, seedKey, deletedAt',
      entries: 'id, activityId, learningDate, startedAt, deletedAt, [activityId+learningDate]',
      paths: 'id, subjectId, deletedAt', pathItems: 'id, pathId, parentId, deletedAt, [pathId+parentId]',
      progressEvents: 'id, opId, pathId, entryId, createdAt', todos: 'id, scheduledDate, done, deletedAt',
      goals: 'id, subjectId, period, deletedAt', quickActions: 'id, activityId, sortOrder', settings: 'key',
      pendingOps: '++seq, opId, entityId', conflicts: '++id, entityId', assets: 'hash',
    });
    await old.open();
    const category = { id: crypto.randomUUID(), name: '自定义科目', level: 'subject', parentId: null, color: '#123456', version: 7 };
    const entry = { id: crypto.randomUUID(), activityId: category.id, learningDate: '2026-09-29', durationSeconds: 7200, note: '升级前记录' };
    const pending = { opId: crypto.randomUUID(), entity: 'category', entityId: category.id, payload: category, deviceId: 'old-device', baseVersion: 6 };
    const conflict = { entity: 'category', entityId: category.id, localPayload: category, serverVersion: 8 };
    const asset = { hash: 'existing-background', blob: new Blob(['original asset']), updatedAt: '2026-09-29T00:00:00Z' };
    await old.table('categories').put(category); await old.table('entries').put(entry);
    await old.table('pendingOps').add(pending); await old.table('conflicts').add(conflict);
    await old.table('settings').bulkPut([{ key: 'deviceId', value: 'old-device' }, { key: 'lastSyncCursor', value: 42 }]);
    await old.table('assets').put(asset); old.close();
    await db.open();
    expect(db.verno).toBe(4);
    expect(await db.categories.get(category.id)).toEqual(category);
    expect(await db.entries.get(entry.id)).toEqual(entry);
    expect((await db.pendingOps.toArray())[0]).toMatchObject(pending);
    expect((await db.conflicts.toArray())[0]).toMatchObject(conflict);
    expect((await db.settings.get('lastSyncCursor'))?.value).toBe(42);
    expect((await db.settings.get('deviceId'))?.value).toBe('old-device');
    expect(await (await db.assets.get(asset.hash))?.blob.text()).toBe('original asset');
    expect(await Promise.all([db.studyPlans.count(), db.practiceAttempts.count(), db.courseProgress.count()])).toEqual([0, 0, 0]);
  });
});
