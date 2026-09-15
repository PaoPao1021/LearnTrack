import Dexie, { type Table } from 'dexie';
import type {
  Category, EntryRecord, LearningPath, PathItem, ProgressEvent,
  Todo, Goal, QuickAction, AppSettings,
} from '@learntrack/domain';
import { stableSeedId } from '@learntrack/domain';

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
  opId?: string;
  opGroupId?: string | null;
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
  pendingOps!: Table<PendingOp, number>;
  conflicts!: Table<ConflictCandidate, number>;
  assets!: Table<{ hash: string; blob: Blob; updatedAt: string }, string>;

  constructor() {
    super('learntrack');
    const stores = {
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
    };
    this.version(1).stores(stores);
    this.version(2).stores(stores).upgrade(async (tx) => {
      const categories = await tx.table<Category>('categories').toArray();
      const idMap = new Map<string, string>();
      for (const category of categories) {
        if (category.seedKey) idMap.set(category.id, stableSeedId(category.seedKey));
      }
      if (idMap.size === 0 || [...idMap].every(([oldId, newId]) => oldId === newId)) return;

      const remapId = (id: string | null | undefined) => id == null ? id : (idMap.get(id) ?? id);
      const remapPayload = (payload: unknown): unknown => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
        const row = { ...(payload as Record<string, unknown>) };
        for (const key of ['id', 'parentId', 'activityId', 'subjectId']) {
          if (typeof row[key] === 'string') row[key] = remapId(row[key] as string);
        }
        return row;
      };

      const merged = new Map<string, Category>();
      for (const category of categories) {
        const next: Category = {
          ...category,
          id: remapId(category.id) as string,
          parentId: remapId(category.parentId) as string | null,
        };
        const current = merged.get(next.id);
        if (!current || current.updatedAt < next.updatedAt) merged.set(next.id, next);
      }
      const categoryTable = tx.table<Category>('categories');
      await categoryTable.clear();
      await categoryTable.bulkPut([...merged.values()]);

      for (const tableName of ['entries', 'paths', 'todos', 'goals', 'quickActions'] as const) {
        const table = tx.table<Record<string, unknown>>(tableName);
        await table.toCollection().modify((row) => {
          for (const key of ['activityId', 'subjectId']) {
            if (typeof row[key] === 'string') row[key] = remapId(row[key] as string);
          }
        });
      }
      await tx.table<PendingOp>('pendingOps').toCollection().modify((op) => {
        if (op.entity === 'category') op.entityId = remapId(op.entityId) as string;
        op.payload = remapPayload(op.payload);
      });
      await tx.table<ConflictCandidate>('conflicts').toCollection().modify((conflict) => {
        if (conflict.entity === 'category') conflict.entityId = remapId(conflict.entityId) as string;
        conflict.localPayload = remapPayload(conflict.localPayload);
        conflict.serverPayload = remapPayload(conflict.serverPayload);
      });
    });
    this.version(3).stores(stores).upgrade(async (tx) => {
      await tx.table<ProgressEvent>('progressEvents').toCollection().modify((event) => {
        if (!Number.isInteger(event.version) || event.version < 1) event.version = 1;
      });
      await tx.table<QuickAction>('quickActions').toCollection().modify((action) => {
        if (!Number.isInteger(action.version) || action.version < 1) action.version = 1;
      });
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
  accentColor: '#007aff',
  backgroundAssetId: null,
  backgroundPosition: 'center',
  backgroundBlur: 0,
  backgroundOverlay: 40,
  weekStart: 'monday',
  timeZone: 'Asia/Shanghai',
};
