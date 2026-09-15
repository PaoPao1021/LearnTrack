import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateKey, validateEntityPayload } from '@learntrack/contracts';
import type { Category } from '@learntrack/domain';
import { db, type PendingOp } from '../db/database';
import { applyRemoteOps, getServerUrl, login, selectPushBatch, setServerUrl, syncNow } from './sync';
import { resolveConflict } from './conflicts';

const now = '2026-09-15T00:00:00.000Z';
const category = (name = '数学', version = 1): Category => ({
  id: crypto.randomUUID(), level: 'major', parentId: null, name, color: '#3b82f6',
  archived: false, sortOrder: 0, createdAt: now, updatedAt: now, deletedAt: null, version,
});
const op = (payload = category(), opGroupId: string | null = null): PendingOp => ({
  opId: crypto.randomUUID(), deviceId: 'device-1', entity: 'category', entityId: payload.id,
  payload, baseVersion: payload.version === 1 ? null : payload.version - 1, opGroupId, clientTimestamp: now,
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
async function enableSync() {
  await setServerUrl('/');
  await db.settings.put({ key: 'loggedIn', value: true });
}

describe('safe client synchronization', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('validates DTOs, calendar dates and local-only settings', () => {
    const row = category();
    expect(validateEntityPayload('category', row.id, row)).toBe(true);
    expect(validateEntityPayload('entry', row.id, { id: row.id, version: 1 })).toBe(false);
    expect(validateEntityPayload('unknown', row.id, null)).toBe(false);
    expect(validateEntityPayload('settings', 'deviceId', { key: 'deviceId', value: 'remote' })).toBe(false);
    expect(validateEntityPayload('settings', 'lastSyncCursor', null)).toBe(false);
    expect(DateKey.safeParse('2026-02-31').success).toBe(false);
    expect(DateKey.safeParse('2024-02-29').success).toBe(true);
  });

  it('requires explicit sync opt-in and uses the same-origin API for /', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await syncNow();
    expect(fetch).not.toHaveBeenCalled();
    await setServerUrl('/');
    await login('user', 'password');
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ credentials: 'include' }));
    expect(await getServerUrl()).toBe('/');
    await setServerUrl(' https://example.com/ ');
    expect(await getServerUrl()).toBe('https://example.com');
    expect((await db.settings.get('loggedIn'))?.value).toBe(false);
    await expect(setServerUrl('javascript:alert(1)')).rejects.toThrow();
    await expect(setServerUrl('https://example.com/api')).rejects.toThrow();
  });

  it('keeps a group together across the 1000-operation push boundary', () => {
    const single = op();
    const rows = Array.from({ length: 999 }, () => ({ ...single, opId: crypto.randomUUID() }));
    const group = [op(category(), 'group'), op(category(), 'group'), op(category(), 'group')];
    expect(selectPushBatch([...rows, ...group])).toHaveLength(999);
    expect(selectPushBatch(group)).toHaveLength(3);
    expect(() => selectPushBatch(Array.from({ length: 1001 }, () => group[0]!))).toThrow();
  });

  it('rolls back all remote writes and the cursor if any payload is invalid', async () => {
    const row = category();
    await expect(applyRemoteOps([
      op(row), { entity: 'entry', entityId: crypto.randomUUID(), payload: { version: 1 } },
    ], 2)).rejects.toThrow();
    expect(await db.categories.count()).toBe(0);
    expect(await db.settings.get('lastSyncCursor')).toBeUndefined();
  });

  it('preserves unsent local edits while applying other remote rows and advancing the cursor', async () => {
    const local = category('local', 2);
    const remote = { ...local, name: 'remote' };
    const other = category('other');
    await db.categories.add(local);
    await db.pendingOps.add(op(local));
    await applyRemoteOps([op(remote), op(other)], 2);
    expect((await db.categories.get(local.id))?.name).toBe('local');
    expect(await db.categories.get(other.id)).toEqual(other);
    expect((await db.settings.get('lastSyncCursor'))?.value).toBe(2);
  });

  it('refreshes server conflict candidates without overwriting the local candidate', async () => {
    const local = category('local', 2);
    await db.categories.add(local);
    await db.conflicts.add({ entity: 'category', entityId: local.id, localPayload: local, serverPayload: { ...local, name: 'old server' }, serverVersion: 2, createdAt: now });
    const remote = { ...local, name: 'new server', version: 3 };
    await applyRemoteOps([op(remote)], 3);
    expect(await db.conflicts.toCollection().first()).toMatchObject({ localPayload: local, serverPayload: remote, serverVersion: 3 });
    expect(await db.categories.get(local.id)).toEqual(local);
  });

  it('serializes concurrent sync calls before the first await', async () => {
    await enableSync();
    const pending = op();
    await db.pendingOps.add(pending);
    let pushes = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/push')) { pushes++; return json({ appliedOpIds: [pending.opId], conflicts: [], cursor: 1 }); }
      return json({ ops: [], cursor: 0 });
    }));
    await Promise.all([syncNow(), syncNow()]);
    expect(pushes).toBe(1);
    expect(await db.pendingOps.count()).toBe(0);
  });

  it('persists group conflicts and acknowledges the queue in one transaction', async () => {
    await enableSync();
    const pending = op(category(), 'group');
    await db.pendingOps.add(pending);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/push')
      ? json({ appliedOpIds: [], conflicts: [{ opId: pending.opId, entity: pending.entity, entityId: pending.entityId, serverVersion: 0, serverPayload: null }], cursor: 0 })
      : json({ ops: [], cursor: 0 })));
    const failure = vi.spyOn(db.conflicts, 'add').mockRejectedValueOnce(new Error('disk full'));
    expect((await syncNow()).lastError).toContain('disk full');
    expect(await db.pendingOps.count()).toBe(1);
    expect(await db.conflicts.count()).toBe(0);
    failure.mockRestore();
    expect((await syncNow()).lastError).toBeNull();
    expect(await db.pendingOps.count()).toBe(0);
    expect(await db.conflicts.toCollection().first()).toMatchObject({ opId: pending.opId, opGroupId: 'group', localPayload: pending.payload });
  });

  it('rejects partial operation-group acknowledgements without removing queued data', async () => {
    await enableSync();
    const rows = [op(category(), 'group'), op(category(), 'group')];
    await db.pendingOps.bulkAdd(rows);
    vi.stubGlobal('fetch', vi.fn(async () => json({ appliedOpIds: [rows[0]!.opId], conflicts: [{ ...rows[1], serverVersion: 0, serverPayload: null }], cursor: 1 })));
    expect((await syncNow()).lastError).toContain('sync.errInvalidPush');
    expect(await db.pendingOps.count()).toBe(2);
    expect(await db.conflicts.count()).toBe(0);
  });

  it('applies successive pull pages until caught up', async () => {
    await enableSync();
    const rows = [op(), op()];
    let page = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const next = rows[page++];
      return json(next ? { ops: [{ ...next, serverTimestamp: now }], cursor: page } : { ops: [], cursor: rows.length });
    }));
    expect((await syncNow()).lastError).toBeNull();
    expect(await db.categories.count()).toBe(2);
    expect(page).toBe(3);
  });

  it('discards an in-flight push response after a backup restore changes the epoch', async () => {
    await enableSync();
    const pending = op();
    await db.pendingOps.add(pending);
    vi.stubGlobal('fetch', vi.fn(async () => {
      const response = json({});
      vi.spyOn(response, 'json').mockImplementation(async () => {
        await db.settings.put({ key: 'syncEpoch', value: 'restored-database' });
        return { appliedOpIds: [pending.opId], conflicts: [], cursor: 1 };
      });
      return response;
    }));
    expect((await syncNow()).lastError).toContain('sync.errServerChanged');
    expect(await db.pendingOps.count()).toBe(1);
    expect((await db.settings.get('lastSyncCursor'))?.value).toBe(0);
  });

  it('discards an in-flight pull response after a backup restore changes the epoch', async () => {
    await enableSync();
    const pending = op();
    vi.stubGlobal('fetch', vi.fn(async () => {
      const response = json({});
      vi.spyOn(response, 'json').mockImplementation(async () => {
        await db.settings.put({ key: 'syncEpoch', value: 'restored-database' });
        return { ops: [{ ...pending, serverTimestamp: now }], cursor: 1 };
      });
      return response;
    }));
    expect((await syncNow()).lastError).toContain('sync.errServerChanged');
    expect(await db.categories.count()).toBe(0);
    expect((await db.settings.get('lastSyncCursor'))?.value).toBe(0);
  });
});

describe('atomic conflict resolution', () => {
  beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
  const addConflict = async (local: Category, server: Category | null, group: string | null = 'group') => db.conflicts.add({
    entity: 'category', entityId: local.id, localPayload: local, serverPayload: server,
    serverVersion: server?.version ?? 0, opGroupId: group, createdAt: now,
  });

  it('rebases every entity in a group and queues one new atomic group', async () => {
    const first = category('first', 2), second = category('second', 2);
    const id = await addConflict(first, { ...first, name: 'server', version: 3 });
    await addConflict(second, null);
    await resolveConflict(id, 'local');
    expect(await db.conflicts.count()).toBe(0);
    expect((await db.categories.get(first.id))?.version).toBe(4);
    expect((await db.categories.get(second.id))?.version).toBe(1);
    const pending = await db.pendingOps.toArray();
    expect(pending).toHaveLength(2);
    expect(pending.map((row) => row.baseVersion)).toEqual([3, null]);
    expect(new Set(pending.map((row) => row.opGroupId)).size).toBe(1);
    expect(pending[0]!.opGroupId).toBeTruthy();
    expect(pending[0]!.opGroupId).not.toBe('group');
  });

  it('uses all server candidates together, including deletion, without re-enqueueing', async () => {
    const first = category(), second = category();
    await db.categories.bulkAdd([first, second]);
    const id = await addConflict(first, { ...first, name: 'server', version: 3 });
    await addConflict(second, null);
    await resolveConflict(id, 'server');
    expect((await db.categories.get(first.id))?.name).toBe('server');
    expect(await db.categories.get(second.id)).toBeUndefined();
    expect(await db.pendingOps.count()).toBe(0);
    expect(await db.conflicts.count()).toBe(0);
  });

  it('coalesces later conflicts on the same entity while protecting newer pending edits', async () => {
    const first = category('first', 2), latest = { ...first, name: 'latest', version: 3 };
    const id = await addConflict(first, { ...first, version: 4 });
    await addConflict(latest, { ...first, version: 4 }, null);
    await db.pendingOps.add(op({ ...latest, version: 4 }));
    await expect(resolveConflict(id, 'local')).rejects.toThrow('conflicts.pending');
    expect(await db.conflicts.count()).toBe(2);
    await db.pendingOps.clear();
    await resolveConflict(id, 'local');
    expect(await db.pendingOps.count()).toBe(1);
    expect(await db.categories.get(first.id)).toMatchObject({ name: 'latest', version: 5 });
  });
});
