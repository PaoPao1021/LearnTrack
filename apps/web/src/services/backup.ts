import { db } from '../db/database';
import type { Category, EntryRecord, LearningPath, PathItem, ProgressEvent, Todo, Goal, QuickAction } from '@learntrack/domain';

export interface BackupManifest {
  formatVersion: 1;
  generatedAt: string;
  workspaceId: string;
  counts: Record<string, number>;
  checksum: string;
}

async function checksumOf(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Full JSON backup including unsynced state; import validates before replacing. */
export async function exportFullBackup(): Promise<{ manifest: BackupManifest; blob: Blob }> {
  const [categories, entries, paths, pathItems, progressEvents, todos, goals, quickActions, settings, pendingOps] = await Promise.all([
    db.categories.toArray(), db.entries.toArray(), db.paths.toArray(), db.pathItems.toArray(),
    db.progressEvents.toArray(), db.todos.toArray(), db.goals.toArray(), db.quickActions.toArray(),
    db.settings.toArray(), db.pendingOps.toArray(),
  ]);
  const data = { categories, entries, paths, pathItems, progressEvents, todos, goals, quickActions, settings, pendingOps };
  const json = JSON.stringify(data);
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const manifest: BackupManifest = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    workspaceId: 'personal',
    counts,
    checksum: await checksumOf(json),
  };
  const blob = new Blob([JSON.stringify({ manifest, data }, null, 2)], { type: 'application/json' });
  return { manifest, blob };
}

export interface RestoreSummary {
  counts: Record<string, number>;
  dateRange: [string, string] | null;
}

export async function inspectBackup(text: string): Promise<RestoreSummary> {
  const parsed = JSON.parse(text) as { manifest: BackupManifest; data: Record<string, unknown[]> };
  if (!parsed.manifest || parsed.manifest.formatVersion !== 1) {
    throw new Error('不支持的备份格式版本，已拒绝导入。');
  }
  const json = JSON.stringify(parsed.data);
  const actual = await checksumOf(json);
  if (actual !== parsed.manifest.checksum) {
    throw new Error('备份文件校验失败，可能已损坏，已拒绝导入。');
  }
  const entries = (parsed.data.entries ?? []) as EntryRecord[];
  const dates = entries.map((e) => e.learningDate).sort();
  return {
    counts: parsed.manifest.counts,
    dateRange: dates.length ? [dates[0]!, dates[dates.length - 1]!] as [string, string] : null,
  };
}

export async function restoreBackup(text: string): Promise<void> {
  await inspectBackup(text); // throws on invalid
  const parsed = JSON.parse(text) as { data: Record<string, unknown[]> };
  // 本机身份与同步上下文不随业务备份替换
  const preserveKeys = ['deviceId', 'serverUrl', 'loggedIn', 'lastSyncCursor', 'lastSyncState'];
  const preserved = new Map<string, unknown>();
  for (const key of preserveKeys) {
    const row = await db.settings.get(key);
    if (row) preserved.set(key, row.value);
  }
  await db.transaction(
    'rw',
    [db.categories, db.entries, db.paths, db.pathItems, db.progressEvents, db.todos, db.goals, db.quickActions, db.settings, db.pendingOps],
    async () => {
      await Promise.all([
        db.categories.clear(), db.entries.clear(), db.paths.clear(), db.pathItems.clear(),
        db.progressEvents.clear(), db.todos.clear(), db.goals.clear(), db.quickActions.clear(),
        db.settings.clear(), db.pendingOps.clear(),
      ]);
      await db.categories.bulkAdd(parsed.data.categories as Category[]);
      await db.entries.bulkAdd(parsed.data.entries as EntryRecord[]);
      await db.paths.bulkAdd(parsed.data.paths as LearningPath[]);
      await db.pathItems.bulkAdd(parsed.data.pathItems as PathItem[]);
      await db.progressEvents.bulkAdd(parsed.data.progressEvents as ProgressEvent[]);
      await db.todos.bulkAdd(parsed.data.todos as Todo[]);
      await db.goals.bulkAdd(parsed.data.goals as Goal[]);
      await db.quickActions.bulkAdd(parsed.data.quickActions as QuickAction[]);
      await db.settings.bulkAdd(parsed.data.settings as { key: string; value: unknown }[]);
      for (const [key, value] of preserved) await db.settings.put({ key, value });
      await db.pendingOps.bulkAdd(parsed.data.pendingOps as never[]);
    },
  );
}

/** CSV time detail export for analysis; not a restore format. */
export async function exportCsv(): Promise<Blob> {
  const [entries, categories] = await Promise.all([db.entries.toArray(), db.categories.toArray()]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? '';
  const parentOf = (id: string) => {
    const c = byId.get(id);
    return c?.parentId ? nameOf(c.parentId) : '';
  };
  const safeCell = (v: string): string =>
    // 防公式注入：Excel 会把 =+-@ 开头的单元格当公式执行
    /^[=+\-@]/.test(v) ? `'` + v : v;
  const rows: string[] = ['record_id,learning_date,method,major,subject,activity,start,end,duration_seconds,note,mood,interruption'];
  for (const e of entries.filter((x) => !x.deletedAt)) {
    const cells = [
      e.id, e.learningDate, e.method, parentOf(e.activityId),
      byId.get(e.activityId)?.parentId ? nameOf(e.activityId) : '',
      nameOf(e.activityId),
      e.startedAt != null ? new Date(e.startedAt).toISOString() : '',
      e.endedAt != null ? new Date(e.endedAt).toISOString() : '',
      String(e.durationSeconds),
      ...[(e.note ?? '').replace(/[",\n]/g, ' '), e.moodScore != null ? String(e.moodScore) : '', (e.interruptionReason ?? '').replace(/[",\n]/g, ' ')].map(safeCell),
    ];
    rows.push(cells.join(','));
  }
  return new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
