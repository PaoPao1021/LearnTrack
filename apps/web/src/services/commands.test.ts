import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LearningPath } from '@learntrack/domain';
import { db } from '../db/database';
import { addQuickAction, removeQuickAction, saveEntryWithProgress } from './commands';

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
});
