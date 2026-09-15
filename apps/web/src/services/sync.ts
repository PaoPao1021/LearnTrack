import { db, SETTINGS_KEYS, getSetting, setSetting, type PendingOp } from '../db/database';
import { deletePendingOpsByOpId } from './queue';
import { SyncPullResponse, SyncPushResponse, validateEntityPayload } from '@learntrack/contracts';
import { AppError } from './errors';

export interface SyncState {
  loggedIn: boolean;
  serverUrl: string;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  pendingCount: number;
}

interface SyncContext { serverUrl: string; epoch: string }
async function readContext(): Promise<SyncContext> {
  return db.transaction('r', db.settings, async () => ({
    serverUrl: await getServerUrl(), epoch: await getSetting('syncEpoch', ''),
  }));
}
async function assertContext(context: SyncContext): Promise<void> {
  if (context.serverUrl !== await getServerUrl() || context.epoch !== await getSetting('syncEpoch', '')) throw new AppError('sync.errServerChanged');
}

export async function getServerUrl(): Promise<string> {
  return getSetting<string>(SETTINGS_KEYS.serverUrl, '');
}

export async function setServerUrl(url: string): Promise<void> {
  let normalized = url.trim();
  if (normalized && normalized !== '/') {
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
      normalized = parsed.origin;
    } catch { throw new AppError('sync.errServerUrl'); }
  }
  if (syncing) throw new AppError('sync.errBusy');
  await db.transaction('rw', db.settings, async () => {
    const previous = await getServerUrl();
    await setSetting(SETTINGS_KEYS.serverUrl, normalized);
    if (previous !== normalized) {
      await setSetting('syncEpoch', crypto.randomUUID());
      await setSetting(SETTINGS_KEYS.lastSyncCursor, 0);
      await setSetting('loggedIn', false);
      await db.settings.delete('lastSyncState');
    }
  });
}

async function apiFetch(path: string, init?: RequestInit, context?: SyncContext): Promise<Response> {
  context ??= await readContext();
  const base = context.serverUrl;
  if (!base) throw new AppError('sync.errNotConfigured');
  await assertContext(context);
  const response = await fetch(`${base === '/' ? '' : base}/api/v1${path}`, { credentials: 'include', ...init, signal: AbortSignal.timeout(30_000) });
  await assertContext(context);
  if (response.status === 401 && path !== '/auth/login') await setSetting('loggedIn', false);
  return response;
}

export async function login(username: string, password: string): Promise<void> {
  const context = await readContext();
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, context);
  if (!res.ok) throw new AppError('sync.errLogin', { status: res.status });
  await db.transaction('rw', db.settings, async () => {
    await assertContext(context);
    await setSetting('loggedIn', true);
  });
}

export async function logout(): Promise<void> {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* offline is fine */ }
  await setSetting('loggedIn', false);
}

export async function checkSession(): Promise<boolean> {
  try {
    const res = await apiFetch('/auth/session');
    return res.ok;
  } catch {
    return false;
  }
}

export async function healthCheck(): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await apiFetch('/health');
    if (!res.ok) return { ok: false };
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false };
  }
}

async function pushOnce(): Promise<{ applied: string[]; conflicts: unknown[] }> {
  const context = await readContext();
  const deviceId = await getSetting<string>(SETTINGS_KEYS.deviceId, 'unknown');
  const ops = selectPushBatch(await db.pendingOps.orderBy('seq').toArray());
  if (ops.length === 0) return { applied: [], conflicts: [] };
  const lastCursor = await getSetting<number>(SETTINGS_KEYS.lastSyncCursor, 0);
  const res = await apiFetch('/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, lastCursor, ops }),
  }, context);
  if (!res.ok) throw new AppError('sync.errPush', { status: res.status });
  const parsed = SyncPushResponse.safeParse(await res.json());
  if (!parsed.success) throw new AppError('sync.errInvalidPush');
  const data = parsed.data;
  const acknowledged = new Set([...data.appliedOpIds, ...data.conflicts.map((c) => c.opId)]);
  if (acknowledged.size !== ops.length || data.appliedOpIds.length + data.conflicts.length !== ops.length || ops.some((op) => !acknowledged.has(op.opId))) throw new AppError('sync.errInvalidPush');
  const appliedIds = new Set(data.appliedOpIds);
  const groupResults = new Map<string, boolean>();
  for (const op of ops) {
    if (!op.opGroupId) continue;
    const applied = appliedIds.has(op.opId);
    if (groupResults.has(op.opGroupId) && groupResults.get(op.opGroupId) !== applied) throw new AppError('sync.errInvalidPush');
    groupResults.set(op.opGroupId, applied);
  }
  for (const c of data.conflicts) {
    const local = ops.find((op) => op.opId === c.opId)!;
    if (c.entity !== local.entity || c.entityId !== local.entityId || !validateEntityPayload(c.entity, c.entityId, c.serverPayload)) throw new AppError('sync.errInvalidPush');
  }
  await db.transaction('rw', [db.pendingOps, db.conflicts, db.settings], async () => {
    await assertContext(context);
    await deletePendingOpsByOpId(data.appliedOpIds);
    // Only pull advances the cursor, otherwise older ops from other devices are skipped.
    for (const c of data.conflicts) {
      const local = ops.find((o) => o.opId === c.opId)!;
      // Another tab may already have acknowledged or resolved this operation.
      if (!await db.pendingOps.where('opId').equals(local.opId).count()) continue;
      await db.conflicts.add({
        opId: local.opId,
        opGroupId: local.opGroupId,
        entity: local.entity,
        entityId: c.entityId,
        localPayload: local.payload,
        serverPayload: c.serverPayload,
        serverVersion: c.serverVersion,
        createdAt: new Date().toISOString(),
      });
      await deletePendingOpsByOpId([local.opId]);
    }
  });
  void data.cursor;
  return { applied: data.appliedOpIds, conflicts: data.conflicts };
}

/** Never split an atomic operation group at the HTTP batch boundary. */
export function selectPushBatch(rows: PendingOp[], limit = 1000): PendingOp[] {
  const batch: PendingOp[] = [];
  for (let i = 0; i < rows.length;) {
    const first = rows[i]!;
    let end = i + 1;
    if (first.opGroupId) while (end < rows.length && rows[end]!.opGroupId === first.opGroupId) end++;
    if (end - i > limit) {
      if (batch.length) break;
      throw new AppError('sync.errGroupTooLarge');
    }
    if (batch.length + end - i > limit) break;
    batch.push(...rows.slice(i, end));
    i = end;
  }
  return batch;
}

async function pullOnce(): Promise<number> {
  const context = await readContext();
  const cursor = await getSetting<number>(SETTINGS_KEYS.lastSyncCursor, 0);
  const res = await apiFetch(`/sync/pull?cursor=${cursor}`, undefined, context);
  if (!res.ok) throw new AppError('sync.errPull', { status: res.status });
  const parsed = SyncPullResponse.safeParse(await res.json());
  if (!parsed.success) throw new AppError('sync.errInvalidPull');
  const data = parsed.data;
  if (data.cursor < cursor || (data.ops.length > 0 && data.cursor === cursor)) throw new AppError('sync.errInvalidPull');
  await applyRemoteOps(data.ops, data.cursor, context, cursor);
  return data.ops.length;
}

/** Apply remote ops idempotently: entity tables are keyed by stable UUID, ops by opId. */
export async function applyRemoteOps(ops: { entity: string; entityId: string; payload?: unknown | null; opGroupId?: string | null; baseVersion?: number | null }[], cursor?: number, context?: SyncContext, expectedCursor?: number): Promise<void> {
  await db.transaction('rw', [
    db.categories, db.entries, db.paths, db.pathItems, db.progressEvents,
    db.todos, db.goals, db.quickActions, db.settings, db.pendingOps, db.conflicts,
  ], async () => {
    if (context) await assertContext(context);
    if (expectedCursor !== undefined && expectedCursor !== await getSetting(SETTINGS_KEYS.lastSyncCursor, 0)) throw new AppError('sync.errServerChanged');
    const protectedRows = [...await db.pendingOps.toArray(), ...await db.conflicts.toArray()];
    const protectedKeys = new Set(protectedRows.map((row) => `${row.entity}:${row.entityId}`));
    for (const op of ops) {
      if (op.payload === undefined) throw new AppError('sync.errMissingPayload', { entity: op.entity });
      if (!validateEntityPayload(op.entity, op.entityId, op.payload)) throw new AppError('sync.errBadPayload', { entity: op.entity });
      const version = op.payload && typeof op.payload === 'object' && 'version' in op.payload
        ? Number(op.payload.version) : op.baseVersion === undefined ? undefined : (op.baseVersion ?? 0) + 1;
      if (version !== undefined) {
        await db.conflicts.where('entityId').equals(op.entityId)
          .filter((row) => row.entity === op.entity && row.serverVersion < version)
          .modify({ serverPayload: op.payload, serverVersion: version });
      }
      // Keep unsent local edits and conflict candidates intact until explicit resolution.
      if (protectedKeys.has(`${op.entity}:${op.entityId}`)) continue;
      // null payload = 删除标记（tombstone）：本地同样删除，避免远端复活
      if (op.payload == null) {
        switch (op.entity) {
          case 'category': await db.categories.delete(op.entityId); break;
          case 'entry': await db.entries.delete(op.entityId); break;
          case 'path': await db.paths.delete(op.entityId); break;
          case 'pathItem': await db.pathItems.delete(op.entityId); break;
          case 'progressEvent': await db.progressEvents.delete(op.entityId); break;
          case 'todo': await db.todos.delete(op.entityId); break;
          case 'goal': await db.goals.delete(op.entityId); break;
          case 'quickAction': await db.quickActions.delete(op.entityId); break;
          case 'settings': await db.settings.delete(op.entityId); break;
          default: break;
        }
        continue;
      }
      if (typeof op.payload !== 'object' || Array.isArray(op.payload)) {
        throw new AppError('sync.errBadPayload', { entity: op.entity });
      }
      if (op.entity === 'settings') {
        const setting = op.payload as { key?: string; value?: unknown };
        if (setting.key !== op.entityId) throw new AppError('sync.errSettingMismatch');
        await db.settings.put({ key: setting.key, value: setting.value });
        continue;
      }
      const p = op.payload as { id?: string; version?: number; deletedAt?: string | null };
      if (p.id !== op.entityId) {
        throw new AppError('sync.errIdMismatch', { entity: op.entity });
      }
      switch (op.entity) {
        case 'category': await db.categories.put(p as never); break;
        case 'entry': await db.entries.put(p as never); break;
        case 'path': await db.paths.put(p as never); break;
        case 'pathItem': await db.pathItems.put(p as never); break;
        case 'progressEvent': await db.progressEvents.put(p as never); break;
        case 'todo': await db.todos.put(p as never); break;
        case 'goal': await db.goals.put(p as never); break;
        case 'quickAction': await db.quickActions.put(p as never); break;
        default: break;
      }
    }
    if (cursor !== undefined) await setSetting(SETTINGS_KEYS.lastSyncCursor, cursor);
  });
}

let syncing = false;

export async function syncNow(): Promise<SyncState> {
  if (syncing) return readSyncState();
  syncing = true;
  let state: SyncState | undefined;
  try {
    state = await readSyncState();
    const base = state.serverUrl;
    if (!base || !state.loggedIn) return state;
    let applied = 0;
    for (let page = 0; page < 20; page++) {
      const push = await pushOnce();
      applied += push.applied.length;
      if (push.applied.length + push.conflicts.length === 0) break;
    }
    for (let page = 0; page < 20; page++) {
      if (await pullOnce() === 0) break;
    }
    const next: SyncState = {
      loggedIn: await getSetting<boolean>('loggedIn', false),
      serverUrl: base,
      lastPushAt: applied > 0 ? new Date().toISOString() : state.lastPushAt,
      lastPullAt: new Date().toISOString(),
      lastError: null,
      pendingCount: await db.pendingOps.count(),
    };
    await setSetting('lastSyncState', next);
    return next;
  } catch (err) {
    if (!state) throw err;
    const next: SyncState = {
      ...state,
      loggedIn: await getSetting<boolean>('loggedIn', false),
      lastError: err instanceof Error ? err.message : String(err),
      pendingCount: await db.pendingOps.count(),
    };
    await setSetting('lastSyncState', next);
    return next;
  } finally {
    syncing = false;
  }
}

export async function readSyncState(): Promise<SyncState> {
  const s = await getSetting<Partial<SyncState>>('lastSyncState', {});
  return {
    loggedIn: await getSetting<boolean>('loggedIn', false),
    serverUrl: await getServerUrl(),
    lastPushAt: s.lastPushAt ?? null,
    lastPullAt: s.lastPullAt ?? null,
    lastError: s.lastError ?? null,
    pendingCount: await db.pendingOps.count(),
  };
}

/** Foreground online loop: push/pull immediately on network regain + every 15s. */
export function startSyncLoop(): () => void {
  const timer = window.setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') void syncNow();
  }, 15_000);
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  if (navigator.onLine) void syncNow();
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
