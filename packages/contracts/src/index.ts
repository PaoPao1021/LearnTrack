import { z } from 'zod';

export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const IsoDateTime = z.string().datetime();
export const Uuid = z.string().uuid();

export const CategoryLevel = z.enum(['major', 'subject', 'activity']);
export const EntryMethod = z.enum(['duration', 'range', 'timer']);
export const PathMode = z.enum(['chapters', 'quantity']);
export const GoalPeriod = z.enum(['daily', 'weekly']);

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
});

export const SyncOpDto = z.object({
  opId: Uuid,
  deviceId: z.string().min(1),
  entity: z.enum(['category', 'entry', 'path', 'pathItem', 'progressEvent', 'todo', 'goal', 'settings', 'quickAction']),
  entityId: z.string().min(1),
  baseVersion: z.number().int().positive().nullable(),
  payload: z.unknown().nullable(),
  opGroupId: z.string().nullable(),
  clientTimestamp: IsoDateTime,
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
    serverVersion: z.number().int(),
    serverPayload: z.unknown(),
  })),
  cursor: z.number().int(),
});

export const SyncPullResponse = z.object({
  cursor: z.number().int(),
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
