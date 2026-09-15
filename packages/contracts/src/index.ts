import { z } from 'zod';

export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'expected a valid calendar date');
export const IsoDateTime = z.string().datetime();
export const Uuid = z.string().uuid();

export const CategoryLevel = z.enum(['major', 'subject', 'activity']);
export const EntryMethod = z.enum(['duration', 'range', 'timer']);
export const PathMode = z.enum(['chapters', 'quantity']);
export const GoalPeriod = z.enum(['daily', 'weekly']);

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema),
]));

export const CategoryDto = z.object({
  id: Uuid,
  level: CategoryLevel,
  parentId: Uuid.nullable(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  seedKey: z.string().optional(),
  archived: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const PauseIntervalDto = z.object({
  startAt: z.number(),
  endAt: z.number(),
});

export const EntryDto = z.object({
  id: Uuid,
  deviceId: z.string().min(1),
  activityId: Uuid,
  method: EntryMethod,
  learningDate: DateKey,
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  timeZone: z.string().min(1),
  durationSeconds: z.number().int().min(0),
  pauseIntervals: z.array(PauseIntervalDto).optional(),
  countdownTargetSeconds: z.number().int().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  moodScore: z.number().int().min(1).max(5).nullable().optional(),
  interruptionReason: z.string().max(200).nullable().optional(),
  linkedPathId: Uuid.nullable().optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const ProgressEventDto = z.object({
  id: Uuid,
  opId: Uuid,
  pathId: Uuid,
  itemId: Uuid.nullable(),
  quantityDelta: z.number().int().nullable(),
  itemDone: z.boolean().nullable(),
  entryId: Uuid.nullable(),
  undoneAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  version: z.number().int().positive(),
});

export const LearningPathDto = z.object({
  id: Uuid,
  subjectId: Uuid,
  name: z.string().min(1).max(200),
  mode: PathMode,
  totalQuantity: z.number().int().nonnegative().nullable(),
  completedQuantity: z.number().int().nonnegative().nullable(),
  unit: z.string().max(50).nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const PathItemDto = z.object({
  id: Uuid,
  pathId: Uuid,
  parentId: Uuid.nullable(),
  title: z.string().min(1).max(500),
  sortOrder: z.number().int(),
  done: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const TodoDto = z.object({
  id: Uuid,
  title: z.string().min(1).max(500),
  subjectId: Uuid.nullable(),
  pathId: Uuid.nullable(),
  itemId: Uuid.nullable(),
  scheduledDate: DateKey.nullable(),
  dueDate: DateKey.nullable(),
  done: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const GoalDto = z.object({
  id: Uuid,
  scope: z.enum(['all', 'subject']),
  subjectId: Uuid.nullable(),
  period: GoalPeriod,
  targetSeconds: z.number().int().nonnegative(),
  active: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});

export const QuickActionDto = z.object({
  id: Uuid,
  activityId: Uuid,
  label: z.string().min(1).max(200),
  pinned: z.boolean(),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
  version: z.number().int().positive(),
});

export const SettingDto = z.object({
  key: z.string().min(1),
  value: JsonValueSchema,
});

const entitySchemas: Record<string, z.ZodTypeAny> = {
  category: CategoryDto, entry: EntryDto, path: LearningPathDto,
  pathItem: PathItemDto, progressEvent: ProgressEventDto, todo: TodoDto,
  goal: GoalDto, quickAction: QuickActionDto, settings: SettingDto,
};

/** Device identity, credentials and sync cursors must never arrive from another device. */
const localSettings = new Set([
  'deviceId', 'serverUrl', 'lastSyncCursor', 'loggedIn', 'lastSyncState',
  'syncState', 'syncEpoch', 'serverBackupAt', 'computerBackupAt',
]);

/** Shared by the API, remote application and backup conflict validation. */
export function validateEntityPayload(entity: string, entityId: string, payload: unknown): boolean {
  if (!Object.hasOwn(entitySchemas, entity)) return false;
  if (entity === 'settings') {
    if (!entityId || localSettings.has(entityId)) return false;
  } else if (!Uuid.safeParse(entityId).success) return false;
  if (payload === null) return true;
  const parsed = entitySchemas[entity]!.safeParse(payload);
  if (!parsed.success) return false;
  if (entity === 'settings') return parsed.data.key === entityId;
  if (parsed.data.id !== entityId) return false;
  if (entity === 'entry') {
    const entry = parsed.data as z.infer<typeof EntryDto>;
    try { new Intl.DateTimeFormat('en', { timeZone: entry.timeZone }); } catch { return false; }
    if (entry.startedAt !== null && entry.endedAt !== null && entry.endedAt < entry.startedAt) return false;
    if (entry.pauseIntervals?.some((pause) => pause.endAt < pause.startAt)) return false;
  }
  return true;
}

export const SyncOpDto = z.object({
  opId: Uuid,
  deviceId: z.string().min(1),
  entity: z.enum(['category', 'entry', 'path', 'pathItem', 'progressEvent', 'todo', 'goal', 'settings', 'quickAction']),
  entityId: z.string().min(1),
  baseVersion: z.number().int().positive().nullable(),
  payload: JsonValueSchema,
  opGroupId: z.string().min(1).nullable(),
  clientTimestamp: IsoDateTime,
});

export const PendingOpDto = SyncOpDto.extend({
  seq: z.number().int().positive().optional(),
});

export const SyncPushRequest = z.object({
  deviceId: z.string().min(1),
  lastCursor: z.number().int().min(0),
  ops: z.array(SyncOpDto).max(1000),
});

export const SyncPushResponse = z.object({
  appliedOpIds: z.array(Uuid),
  /** ops that hit a version conflict and await user resolution */
  conflicts: z.array(z.object({
    opId: Uuid,
    entity: z.string(),
    entityId: z.string(),
    serverVersion: z.number().int().nonnegative(),
    serverPayload: JsonValueSchema,
  })),
  cursor: z.number().int().nonnegative(),
});

export const SyncPullResponse = z.object({
  cursor: z.number().int().nonnegative(),
  ops: z.array(SyncOpDto.extend({ serverTimestamp: IsoDateTime })),
});

export const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  version: z.string(),
});

export const BackupManifest = z.object({
  formatVersion: z.number().int().positive(),
  generatedAt: IsoDateTime,
  workspaceId: z.string(),
  counts: z.record(z.string(), z.number().int()),
  checksum: z.string(),
});

export type SyncPushRequestT = z.infer<typeof SyncPushRequest>;
export type SyncPushResponseT = z.infer<typeof SyncPushResponse>;
export type SyncPullResponseT = z.infer<typeof SyncPullResponse>;
export type BackupManifestT = z.infer<typeof BackupManifest>;
export type EntryDtoT = z.infer<typeof EntryDto>;
export type CategoryDtoT = z.infer<typeof CategoryDto>;
