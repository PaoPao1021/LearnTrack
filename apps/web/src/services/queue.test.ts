import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { deletePendingOpsByOpId, enqueueOp } from './queue';

describe('pending sync queue', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('deletes acknowledged operations by opId rather than the numeric primary key', async () => {
    const first = await enqueueOp('entry', 'entry-1', { id: 'entry-1' }, null, null, 'device-1');
    const second = await enqueueOp('entry', 'entry-2', { id: 'entry-2' }, null, null, 'device-1');

    const queued = await db.pendingOps.orderBy('seq').toArray();
    expect(queued.map((row) => row.opId)).toEqual([first, second]);
    expect(queued.every((row) => typeof row.seq === 'number')).toBe(true);

    await deletePendingOpsByOpId([first]);
    expect((await db.pendingOps.toArray()).map((row) => row.opId)).toEqual([second]);
  });
});
