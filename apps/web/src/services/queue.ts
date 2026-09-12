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
): Promise<string> {
  const deviceId = await ensureDeviceId();
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

export function bumpVersion(v: number): number {
  return v + 1;
}
