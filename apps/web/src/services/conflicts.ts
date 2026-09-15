import { validateEntityPayload } from '@learntrack/contracts';
import { db, type ConflictCandidate } from '../db/database';
import { ensureDeviceId } from '../db/seed';
import { nowIso, uuid } from '../utils';
import { enqueueOp } from './queue';
import { AppError } from './errors';

const tables = {
  category: db.categories, entry: db.entries, path: db.paths, pathItem: db.pathItems,
  progressEvent: db.progressEvents, todo: db.todos, goal: db.goals,
  quickAction: db.quickActions, settings: db.settings,
};
const key = (row: ConflictCandidate) => `${row.entity}:${row.entityId}`;

/** Resolve related candidates together, including later edits to the same entity. */
export async function resolveConflict(id: number, pick: 'local' | 'server'): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', [...Object.values(tables), db.pendingOps, db.conflicts], async () => {
    const all = await db.conflicts.toArray();
    const first = all.find((row) => row.id === id);
    if (!first) return;
    const selected = new Set<ConflictCandidate>([first]);
    const keys = new Set([key(first)]);
    const groups = new Set(first.opGroupId ? [first.opGroupId] : []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of all) {
        if (selected.has(row) || !(keys.has(key(row)) || (row.opGroupId && groups.has(row.opGroupId)))) continue;
        selected.add(row);
        keys.add(key(row));
        if (row.opGroupId) groups.add(row.opGroupId);
        changed = true;
      }
    }
    if ((await db.pendingOps.toArray()).some((row) => keys.has(`${row.entity}:${row.entityId}`))) throw new AppError('conflicts.pending');
    if (keys.size > 1000) throw new AppError('sync.errGroupTooLarge');
    const grouped = new Map<string, ConflictCandidate[]>();
    for (const row of selected) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
    const opGroupId = keys.size > 1 ? uuid() : null;
    for (const rows of grouped.values()) {
      rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      const latest = rows[rows.length - 1]!;
      const server = rows.reduce((a, b) => b.serverVersion >= a.serverVersion ? b : a);
      const candidate = pick === 'local' ? latest.localPayload : server.serverPayload;
      const payload = pick === 'local' && candidate !== null && typeof candidate === 'object' && 'version' in candidate
        ? { ...candidate, version: server.serverVersion + 1, ...('updatedAt' in candidate ? { updatedAt: nowIso() } : {}) }
        : candidate;
      if (!validateEntityPayload(latest.entity, latest.entityId, payload)) throw new AppError('sync.errBadPayload', { entity: latest.entity });
      const table = tables[latest.entity as keyof typeof tables];
      if (payload === null) await table.delete(latest.entityId);
      else await table.put(payload as never);
      if (pick === 'local') await enqueueOp(latest.entity, latest.entityId, payload, server.serverVersion || null, opGroupId, deviceId);
    }
    await db.conflicts.bulkDelete([...selected].map((row) => row.id!));
  });
}
