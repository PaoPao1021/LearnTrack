/** Core shared data model (storage-agnostic). All IDs are stable UUIDs. */

export type CategoryLevel = 'major' | 'subject' | 'activity';

export interface Category {
  id: string;
  level: CategoryLevel;
  parentId: string | null;
  name: string;
  color: string;
  /** Stable seed id for built-in categories, e.g. `builtin.major.math`. */
  seedKey?: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type EntryMethod = 'duration' | 'range' | 'timer';

export interface EntryRecord {
  id: string;
  deviceId: string;
  activityId: string;
  method: EntryMethod;
  /** `YYYY-MM-DD` local learning date; authoritative for duration-only entries. */
  learningDate: string;
  /** UTC epoch ms; present for range/timer entries. */
  startedAt: number | null;
  endedAt: number | null;
  /** Timezone used when the range was recorded, e.g. `Asia/Shanghai`. */
  timeZone: string;
  durationSeconds: number;
  pauseIntervals?: { startAt: number; endAt: number }[];
  countdownTargetSeconds?: number | null;
  note?: string | null;
  /** Optional 1–5 self rating; absent means "not rated", never zero. */
  moodScore?: number | null;
  /** Optional interruption reason; absent means "not filled", not "no interruption". */
  interruptionReason?: string | null;
  linkedPathId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type PathMode = 'chapters' | 'quantity';

export interface LearningPath {
  id: string;
  subjectId: string;
  name: string;
  mode: PathMode;
  /** quantity mode */
  totalQuantity: number | null;
  completedQuantity: number | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface PathItem {
  id: string;
  pathId: string;
  parentId: string | null;
  title: string;
  sortOrder: number;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

/** Incremental progress event; deduplicated by operation id during sync. */
export interface ProgressEvent {
  id: string;
  opId: string;
  pathId: string;
  itemId: string | null;
  /** signed delta for quantity mode */
  quantityDelta: number | null;
  /** chapter mode state change */
  itemDone: boolean | null;
  entryId: string | null;
  undoneAt: string | null;
  createdAt: string;
  version: number;
}

export interface Todo {
  id: string;
  title: string;
  subjectId: string | null;
  pathId: string | null;
  itemId: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export type GoalPeriod = 'daily' | 'weekly';

export interface Goal {
  id: string;
  scope: 'all' | 'subject';
  subjectId: string | null;
  period: GoalPeriod;
  targetSeconds: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface QuickAction {
  id: string;
  activityId: string;
  label: string;
  pinned: boolean;
  sortOrder: number;
  hidden: boolean;
  version: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  backgroundAssetId: string | null;
  backgroundPosition: string;
  backgroundBlur: number;
  backgroundOverlay: number;
  weekStart: 'monday';
  timeZone: string;
}

/** One synced operation. Idempotent by `opId`. */
export interface SyncOp {
  opId: string;
  deviceId: string;
  entity: 'category' | 'entry' | 'path' | 'pathItem' | 'progressEvent' | 'todo' | 'goal' | 'settings' | 'quickAction';
  entityId: string;
  baseVersion: number | null;
  /** null payload with deletedAt marker = tombstone */
  payload: unknown | null;
  opGroupId: string | null;
  clientTimestamp: string;
}
