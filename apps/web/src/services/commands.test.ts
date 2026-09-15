import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LearningPath } from '@learntrack/domain';
import { db } from '../db/database';
import { addPathItems, addQuantity, addQuickAction, deleteEntry, removeQuickAction, saveEntryWithProgress } from './commands';

const now = '2026-09-10T00:00:00.000Z';

describe('atomic local commands', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('writes an entry, clamped progress delta and outbox operations atomically', async () => {
    const path: LearningPath = {
      id: crypto.randomUUID(), subjectId: crypto.randomUUID(), name: '题库', mode: 'quantity',
      totalQuantity: 100, completedQuantity: 2, unit: '题', createdAt: now, updatedAt: now,
      deletedAt: null, version: 1,
    };
    await db.paths.add(path);

    const result = await saveEntryWithProgress({
      activityId: crypto.randomUUID(), method: 'duration', learningDate: '2026-09-10',
      startedAt: null, endedAt: null, durationSeconds: 1800,
      linkedPathId: path.id, quantityDelta: -5,
    });

    expect(await db.entries.get(result.entry.id)).toBeTruthy();
    expect((await db.paths.get(path.id))?.completedQuantity).toBe(0);
    const events = await db.progressEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ quantityDelta: -2, version: 1 });
    expect(await db.pendingOps.count()).toBe(3);
    await db.pendingOps.clear();
    await deleteEntry(result.entry.id, true);
    const undoOps = await db.pendingOps.toArray();
    expect(undoOps).toHaveLength(3);
    expect(new Set(undoOps.map((row) => row.opGroupId)).size).toBe(1);
    expect(undoOps[0]!.opGroupId).toBeTruthy();
    expect((await db.paths.get(path.id))?.completedQuantity).toBe(2);
  });

  it('serializes concurrent entry progress updates without losing a delta', async () => {
    const path: LearningPath = {
      id: crypto.randomUUID(), subjectId: crypto.randomUUID(), name: '题库', mode: 'quantity',
      totalQuantity: 100, completedQuantity: 0, unit: '题', createdAt: now, updatedAt: now,
      deletedAt: null, version: 1,
    };
    await db.paths.add(path);
    const input = {
      activityId: crypto.randomUUID(), method: 'duration' as const, learningDate: '2026-09-10',
      startedAt: null, endedAt: null, durationSeconds: 60, linkedPathId: path.id, quantityDelta: 1,
    };

    await Promise.all([saveEntryWithProgress(input), saveEntryWithProgress(input)]);

    expect((await db.paths.get(path.id))?.completedQuantity).toBe(2);
    expect(await db.progressEvents.count()).toBe(2);
    expect(await db.entries.count()).toBe(2);
    expect(await db.pendingOps.count()).toBe(6);
  });

  it('serializes concurrent quantity changes with their events and outbox writes', async () => {
    const path: LearningPath = {
      id: crypto.randomUUID(), subjectId: crypto.randomUUID(), name: '题库', mode: 'quantity',
      totalQuantity: 100, completedQuantity: 0, unit: '题', createdAt: now, updatedAt: now,
      deletedAt: null, version: 1,
    };
    await db.paths.add(path);

    await Promise.all([addQuantity(path.id, 1), addQuantity(path.id, 1)]);

    expect((await db.paths.get(path.id))?.completedQuantity).toBe(2);
    expect((await db.progressEvents.toArray()).map((event) => event.quantityDelta)).toEqual([1, 1]);
    expect(await db.pendingOps.count()).toBe(4);
  });

  it('deduplicates concurrent quick-action additions', async () => {
    const activityId = crypto.randomUUID();
    await Promise.all([
      addQuickAction(activityId, '高数·习题'),
      addQuickAction(activityId, '高数·习题'),
    ]);

    expect(await db.quickActions.where('activityId').equals(activityId).count()).toBe(1);
    expect(await db.pendingOps.count()).toBe(1);
  });

  it('queues a quick-action deletion against its current version', async () => {
    await addQuickAction(crypto.randomUUID(), '高数·习题');
    const action = await db.quickActions.toCollection().first();
    expect(action?.version).toBe(1);
    await db.pendingOps.clear();

    await removeQuickAction(action!.id);
    const deletion = await db.pendingOps.toCollection().first();
    expect(deletion).toMatchObject({ entity: 'quickAction', entityId: action!.id, baseVersion: 1, payload: null });
  });

  it('rejects oversized chapter groups before writing local data', async () => {
    await expect(addPathItems(crypto.randomUUID(), Array(1001).fill('chapter'))).rejects.toThrow('sync.errGroupTooLarge');
    expect(await db.pathItems.count()).toBe(0);
    expect(await db.pendingOps.count()).toBe(0);
  });
});
