import { db, SETTINGS_KEYS } from '../db/database';
import { uuid, nowIso } from '../utils';
import { ensureDeviceId } from '../db/seed';

/**
 * Append a pending sync op after a successful local write.
 * The outbox entry stores the entity payload and its new version.
 */
export async function enqueueOp(
  entity: string,
  entityId: string,
  payload: unknown,
  baseVersion: number | null,
  opGroupId: string | null = null,
  knownDeviceId?: string,
): Promise<string> {
  const deviceId = knownDeviceId ?? await ensureDeviceId();
  const opId = uuid();
  await db.pendingOps.add({
    opId,
    deviceId,
    entity,
    entityId,
    baseVersion,
    payload,
    opGroupId,
    clientTimestamp: nowIso(),
  });
  void SETTINGS_KEYS;
  return opId;
}

/** pendingOps is keyed by auto-increment seq, so resolve opIds before deletion. */
export async function deletePendingOpsByOpId(opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  const rows = await db.pendingOps.where('opId').anyOf(opIds).toArray();
  const keys = rows.flatMap((row) => row.seq == null ? [] : [row.seq]);
  if (keys.length > 0) await db.pendingOps.bulkDelete(keys);
}

export function bumpVersion(v: number): number {
  return v + 1;
}
