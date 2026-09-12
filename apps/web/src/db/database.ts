import Dexie, { type Table } from 'dexie';
import type {
  Category, EntryRecord, LearningPath, PathItem, ProgressEvent,
  Todo, Goal, QuickAction, AppSettings,
} from '@learntrack/domain';

export interface PendingOp {
  opId: string;
  seq?: number;
  deviceId: string;
  entity: string;
  entityId: string;
  baseVersion: number | null;
  payload: unknown | null;
  opGroupId: string | null;
  clientTimestamp: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface ConflictCandidate {
  id?: number;
  entity: string;
  entityId: string;
  localPayload: unknown;
  serverPayload: unknown;
  serverVersion: number;
  createdAt: string;
}

export class LearnTrackDB extends Dexie {
  categories!: Table<Category, string>;
  entries!: Table<EntryRecord, string>;
  paths!: Table<LearningPath, string>;
  pathItems!: Table<PathItem, string>;
  progressEvents!: Table<ProgressEvent, string>;
  todos!: Table<Todo, string>;
  goals!: Table<Goal, string>;
  quickActions!: Table<QuickAction, string>;
  settings!: Table<Meta, string>;
  pendingOps!: Table<PendingOp, string>;
  conflicts!: Table<ConflictCandidate, number>;
  assets!: Table<{ hash: string; blob: Blob; updatedAt: string }, string>;

  constructor() {
    super('learntrack');
    this.version(1).stores({
      categories: 'id, level, parentId, seedKey, deletedAt',
      entries: 'id, activityId, learningDate, startedAt, deletedAt, [activityId+learningDate]',
      paths: 'id, subjectId, deletedAt',
      pathItems: 'id, pathId, parentId, deletedAt, [pathId+parentId]',
      progressEvents: 'id, opId, pathId, entryId, createdAt',
      todos: 'id, scheduledDate, done, deletedAt',
      goals: 'id, subjectId, period, deletedAt',
      quickActions: 'id, activityId, sortOrder',
      settings: 'key',
      pendingOps: '++seq, opId, entityId',
      conflicts: '++id, entityId',
      assets: 'hash',
    });
  }
}

export const db = new LearnTrackDB();

export const SETTINGS_KEYS = {
  theme: 'theme',
  accent: 'accentColor',
  background: 'background',
  sync: 'syncState',
  lastSyncCursor: 'lastSyncCursor',
  deviceId: 'deviceId',
  serverUrl: 'serverUrl',
  serverBackupAt: 'serverBackupAt',
  computerBackupAt: 'computerBackupAt',
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  accentColor: '#3b82f6',
  backgroundAssetId: null,
  backgroundPosition: 'center',
  backgroundBlur: 0,
  backgroundOverlay: 40,
  weekStart: 'monday',
  timeZone: 'Asia/Shanghai',
};
