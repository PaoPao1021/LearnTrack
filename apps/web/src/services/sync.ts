import { db, SETTINGS_KEYS, getSetting, setSetting } from '../db/database';

export interface SyncState {
  loggedIn: boolean;
  serverUrl: string;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  pendingCount: number;
}

export async function getServerUrl(): Promise<string> {
  return getSetting<string>(SETTINGS_KEYS.serverUrl, '');
}

export async function setServerUrl(url: string): Promise<void> {
  await setSetting(SETTINGS_KEYS.serverUrl, url.replace(/\/$/, ''));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await getServerUrl();
  if (!base) throw new Error('未配置同步服务器地址');
  return fetch(`${base}/api/v1${path}`, { credentials: 'include', ...init });
}

export async function login(username: string, password: string): Promise<void> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`登录失败（${res.status}）`);
  await setSetting('loggedIn', true);
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
  const deviceId = await getSetting<string>(SETTINGS_KEYS.deviceId, 'unknown');
  const ops = await db.pendingOps.orderBy('seq').limit(500).toArray();
  if (ops.length === 0) return { applied: [], conflicts: [] };
  const lastCursor = await getSetting<number>(SETTINGS_KEYS.lastSyncCursor, 0);
  const res = await apiFetch('/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, lastCursor, ops }),
  });
  if (!res.ok) throw new Error(`推送失败（${res.status}）`);
  const data = (await res.json()) as { appliedOpIds: string[]; conflicts: { entityId: string; serverVersion: number; serverPayload: unknown; opId: string }[]; cursor: number };
  await db.pendingOps.bulkDelete(data.appliedOpIds);
  // 注意：push 不推进游标；游标只由 pull 推进，否则其他设备的较小 seq 会被跳过
  // Version conflicts: keep both candidates for user resolution; never silently overwrite.
  for (const c of data.conflicts) {
    const local = ops.find((o) => o.opId === c.opId);
    if (local) {
      await db.conflicts.add({
        entity: local.entity,
        entityId: c.entityId,
        localPayload: local.payload,
        serverPayload: c.serverPayload,
        serverVersion: c.serverVersion,
        createdAt: new Date().toISOString(),
      });
      await db.pendingOps.delete(local.opId);
    }
  }
  void data.cursor;
  return { applied: data.appliedOpIds, conflicts: data.conflicts };
}

async function pullOnce(): Promise<number> {
  const cursor = await getSetting<number>(SETTINGS_KEYS.lastSyncCursor, 0);
  const res = await apiFetch(`/sync/pull?cursor=${cursor}`);
  if (!res.ok) throw new Error(`拉取失败（${res.status}）`);
  const data = (await res.json()) as { cursor: number; ops: { entity: string; entityId: string; payload: Record<string, unknown> | null }[] };
  await applyRemoteOps(data.ops);
  await setSetting(SETTINGS_KEYS.lastSyncCursor, data.cursor);
  return data.ops.length;
}

/** Apply remote ops idempotently: entity tables are keyed by stable UUID, ops by opId. */
export async function applyRemoteOps(ops: { entity: string; entityId: string; payload: Record<string, unknown> | null }[]): Promise<void> {
  for (const op of ops) {
    // null payload = 删除标记（tombstone）：本地同样删除，避免远端复活
    if (!op.payload) {
      switch (op.entity) {
        case 'category': await db.categories.delete(op.entityId); break;
        case 'entry': await db.entries.delete(op.entityId); break;
        case 'path': await db.paths.delete(op.entityId); break;
        case 'pathItem': await db.pathItems.delete(op.entityId); break;
        case 'progressEvent': await db.progressEvents.delete(op.entityId); break;
        case 'todo': await db.todos.delete(op.entityId); break;
        case 'goal': await db.goals.delete(op.entityId); break;
        case 'quickAction': await db.quickActions.delete(op.entityId); break;
        default: break;
      }
      continue;
    }
    const p = op.payload as { id: string; version?: number; deletedAt?: string | null };
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
}

let syncing = false;

export async function syncNow(): Promise<SyncState> {
  const state = await readSyncState();
  if (syncing) return state;
  const base = await getServerUrl();
  if (!base) return state;
  syncing = true;
  try {
    const push = await pushOnce();
    const pulled = await pullOnce();
    const next: SyncState = {
      loggedIn: await getSetting<boolean>('loggedIn', false),
      serverUrl: base,
      lastPushAt: push.applied.length > 0 ? new Date().toISOString() : state.lastPushAt,
      lastPullAt: new Date().toISOString(),
      lastError: null,
      pendingCount: await db.pendingOps.count(),
    };
    void pulled;
    await setSetting('lastSyncState', next);
    return next;
  } catch (err) {
    const next: SyncState = {
      ...state,
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
