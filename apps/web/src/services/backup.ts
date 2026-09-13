import { db } from '../db/database';
import type { Category, EntryRecord, LearningPath, PathItem, ProgressEvent, Todo, Goal, QuickAction } from '@learntrack/domain';
import { BackupManifest as BackupManifestSchema, CategoryDto, EntryDto } from '@learntrack/contracts';

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

const COLLECTIONS = [
  'categories', 'entries', 'paths', 'pathItems', 'progressEvents',
  'todos', 'goals', 'quickActions', 'settings', 'pendingOps',
] as const;

function parseBackup(text: string): { manifest: BackupManifest; data: Record<string, unknown[]> } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON，已拒绝导入。');
  }
  if (!value || typeof value !== 'object') throw new Error('备份内容结构不正确，已拒绝导入。');
  const parsed = value as { manifest?: unknown; data?: unknown };
  const manifestResult = BackupManifestSchema.safeParse(parsed.manifest);
  if (!manifestResult.success || manifestResult.data.formatVersion !== 1) {
    throw new Error('不支持的备份格式版本，已拒绝导入。');
  }
  if (!parsed.data || typeof parsed.data !== 'object') throw new Error('备份缺少数据区，已拒绝导入。');
  const data = parsed.data as Record<string, unknown[]>;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(data[key])) throw new Error(`备份缺少 ${key} 数据表，已拒绝导入。`);
    if (manifestResult.data.counts[key] !== data[key]!.length) {
      throw new Error(`备份 ${key} 计数不一致，已拒绝导入。`);
    }
  }
  if (!CategoryDto.array().safeParse(data.categories).success || !EntryDto.array().safeParse(data.entries).success) {
    throw new Error('备份中的分类或记录字段不合法，已拒绝导入。');
  }
  for (const key of COLLECTIONS) {
    const identity = key === 'settings' ? 'key' : key === 'pendingOps' ? 'opId' : 'id';
    const ids = data[key]!.map((row) => row && typeof row === 'object' ? (row as Record<string, unknown>)[identity] : null);
    if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
      throw new Error(`备份 ${key} 的标识字段不合法或重复，已拒绝导入。`);
    }
  }
  return { manifest: manifestResult.data as BackupManifest, data };
}

export async function inspectBackup(text: string): Promise<RestoreSummary> {
  const parsed = parseBackup(text);
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
  const parsed = parseBackup(text);
  // 本机身份与同步上下文不随业务备份替换
  const preserveKeys = ['deviceId', 'serverUrl', 'loggedIn'];
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
      await db.progressEvents.bulkAdd((parsed.data.progressEvents as ProgressEvent[]).map((event) => ({
        ...event,
        version: Number.isInteger(event.version) && event.version > 0 ? event.version : 1,
      })));
      await db.todos.bulkAdd(parsed.data.todos as Todo[]);
      await db.goals.bulkAdd(parsed.data.goals as Goal[]);
      await db.quickActions.bulkAdd((parsed.data.quickActions as QuickAction[]).map((action) => ({
        ...action,
        version: Number.isInteger(action.version) && action.version > 0 ? action.version : 1,
      })));
      await db.settings.bulkAdd(parsed.data.settings as { key: string; value: unknown }[]);
      for (const [key, value] of preserved) await db.settings.put({ key, value });
      // 业务数据已被替换，必须从服务端游标 0 重新对账，不能跳过旧操作。
      await db.settings.put({ key: 'lastSyncCursor', value: 0 });
      await db.settings.delete('lastSyncState');
      await db.pendingOps.bulkAdd(parsed.data.pendingOps as never[]);
    },
  );
}

/** CSV time detail export for analysis; not a restore format. */
export async function exportCsv(): Promise<Blob> {
  const [entries, categories] = await Promise.all([db.entries.toArray(), db.categories.toArray()]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const csvCell = (value: string): string => {
    // 防公式注入：Excel 会把 =+-@ 开头的单元格当公式执行
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows: string[] = ['record_id,learning_date,method,major,subject,activity,start,end,duration_seconds,note,mood,interruption'];
  for (const e of entries.filter((x) => !x.deletedAt)) {
    const activity = byId.get(e.activityId);
    const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
    const major = subject?.parentId ? byId.get(subject.parentId) : undefined;
    const cells = [
      e.id, e.learningDate, e.method, major?.name ?? '',
      subject?.name ?? '', activity?.name ?? '',
      e.startedAt != null ? new Date(e.startedAt).toISOString() : '',
      e.endedAt != null ? new Date(e.endedAt).toISOString() : '',
      String(e.durationSeconds),
      e.note ?? '', e.moodScore != null ? String(e.moodScore) : '', e.interruptionReason ?? '',
    ];
    rows.push(cells.map(csvCell).join(','));
  }
  return new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
