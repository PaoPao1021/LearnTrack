import { db } from '../db/database';
import { ensureDeviceId } from '../db/seed';
import { enqueueOp, bumpVersion } from '../services/queue';
import { uuid, nowIso, TZ, todayKey } from '../utils';
import { overlaps } from '@learntrack/domain';
import { AppError } from './errors';
import type { EntryRecord, LearningPath, PathItem, ProgressEvent, Todo, Goal, Category, QuickAction } from '@learntrack/domain';

function uuid2(): string { return uuid(); }

export interface SaveEntryInput {
  activityId: string;
  method: EntryRecord['method'];
  learningDate: string;
  startedAt: number | null;
  endedAt: number | null;
  durationSeconds: number;
  note?: string | null;
  moodScore?: number | null;
  interruptionReason?: string | null;
  linkedPathId?: string | null;
  quantityDelta?: number | null;
}

/** Warn about overlapping ranged records; returns conflicting entries. */
export async function findOverlaps(startedAt: number, endedAt: number): Promise<EntryRecord[]> {
  const candidates = await db.entries
    .filter((e) => !e.deletedAt && e.startedAt != null && e.endedAt != null)
    .toArray();
  return candidates.filter((e) => overlaps({ startedAt, endedAt }, { startedAt: e.startedAt!, endedAt: e.endedAt! }));
}

/** Save entry (+ optional progress delta) in one local transaction with one op group. */
export async function saveEntryWithProgress(
  input: SaveEntryInput,
): Promise<{ entry: EntryRecord; overlapCount: number }> {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new AppError('err.durationPositive');
  if (input.quantityDelta != null && !Number.isInteger(input.quantityDelta)) throw new AppError('err.quantityInteger');
  const deviceId = await ensureDeviceId();
  const overlapCount = input.startedAt != null && input.endedAt != null
    ? (await findOverlaps(input.startedAt, input.endedAt)).length
    : 0;

  const entry: EntryRecord = {
    id: uuid2(),
    deviceId,
    activityId: input.activityId,
    method: input.method,
    learningDate: input.learningDate,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    timeZone: TZ,
    durationSeconds: Math.max(0, Math.round(input.durationSeconds)),
    note: input.note ?? null,
    moodScore: input.moodScore ?? null,
    interruptionReason: input.interruptionReason ?? null,
    linkedPathId: input.linkedPathId ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
    version: 1,
  };

  if (input.linkedPathId && input.quantityDelta) {
    const quantityDelta = input.quantityDelta;
    await db.transaction('rw', db.entries, db.paths, db.progressEvents, db.pendingOps, async () => {
      // Read the path inside the write transaction. Otherwise two concurrent
      // entries can both derive their update from the same completed quantity.
      const path = await db.paths.get(input.linkedPathId!);
      if (!path || path.mode !== 'quantity') {
        await db.entries.add(entry);
        await enqueueOp('entry', entry.id, entry, null, null, deviceId);
        return;
      }
      const previousCompleted = path.completedQuantity ?? 0;
      const newCompleted = Math.max(0, previousCompleted + quantityDelta);
      const appliedDelta = newCompleted - previousCompleted;
      await db.entries.add(entry);
      if (appliedDelta === 0) {
        await enqueueOp('entry', entry.id, entry, null, null, deviceId);
        return;
      }
      const updated: LearningPath = { ...path, completedQuantity: newCompleted, updatedAt: nowIso(), version: bumpVersion(path.version) };
      const progress: ProgressEvent = {
        id: uuid2(),
        opId: uuid2(),
        pathId: path.id,
        itemId: null,
        quantityDelta: appliedDelta,
        itemDone: null,
        entryId: entry.id,
        undoneAt: null,
        createdAt: nowIso(),
        version: 1,
      };
      await db.paths.put(updated);
      await db.progressEvents.add(progress);
      const groupId = uuid2();
      await enqueueOp('entry', entry.id, entry, null, groupId, deviceId);
      await enqueueOp('path', updated.id, updated, path.version, groupId, deviceId);
      await enqueueOp('progressEvent', progress.id, progress, null, groupId, deviceId);
    });
    return { entry, overlapCount };
  }

  await db.transaction('rw', db.entries, db.pendingOps, async () => {
    await db.entries.add(entry);
    await enqueueOp('entry', entry.id, entry, null, null, deviceId);
  });
  return { entry, overlapCount };
}

export async function updateEntry(id: string, patch: Partial<EntryRecord>): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.entries, db.pendingOps, async () => {
    const existing = await db.entries.get(id);
    if (!existing) return;
    const updated: EntryRecord = { ...existing, ...patch, updatedAt: nowIso(), version: bumpVersion(existing.version) };
    await db.entries.put(updated);
    await enqueueOp('entry', id, updated, existing.version, null, deviceId);
  });
}

/**
 * Delete an entry. Default keeps linked progress; when undoProgress is true,
 * only the progress events directly linked to this entry are reverted, and only
 * if the linked path has not changed since (guard via a fresh read).
 */
export async function deleteEntry(id: string, undoProgress: boolean): Promise<string | null> {
  const deviceId = await ensureDeviceId();
  let warning: string | null = null;
  await db.transaction('rw', [db.entries, db.paths, db.progressEvents, db.pendingOps], async () => {
    const existing = await db.entries.get(id);
    if (!existing) return;
    const updated: EntryRecord = { ...existing, deletedAt: nowIso(), updatedAt: nowIso(), version: bumpVersion(existing.version) };
    await db.entries.put(updated);
    await enqueueOp('entry', id, updated, existing.version, null, deviceId);

    if (undoProgress && existing.linkedPathId) {
      const events = await db.progressEvents.where('entryId').equals(id).filter((e) => !e.undoneAt).toArray();
      const path = await db.paths.get(existing.linkedPathId);
      if (path) {
        const totalDelta = events.reduce((sum, e) => sum + (e.quantityDelta ?? 0), 0);
        const nextCompleted = Math.max(0, (path.completedQuantity ?? 0) - totalDelta);
        if (totalDelta !== 0) {
          const updatedPath: LearningPath = { ...path, completedQuantity: nextCompleted, updatedAt: nowIso(), version: bumpVersion(path.version) };
          await db.paths.put(updatedPath);
          await enqueueOp('path', path.id, updatedPath, path.version, null, deviceId);
          for (const ev of events) {
            const undone: ProgressEvent = { ...ev, undoneAt: nowIso(), version: bumpVersion(ev.version) };
            await db.progressEvents.put(undone);
            await enqueueOp('progressEvent', ev.id, undone, ev.version, null, deviceId);
          }
        } else {
          warning = 'warn.noProgressToUndo';
        }
      }
    }
  });
  return warning;
}

export async function addCategory(level: Category['level'], parentId: string | null, name: string, color: string): Promise<Category> {
  const deviceId = await ensureDeviceId();
  const row: Category = {
    id: uuid2(), level, parentId, name, color, archived: false,
    sortOrder: 0, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
  };
  await db.transaction('rw', db.categories, db.pendingOps, async () => {
    await db.categories.add(row);
    await enqueueOp('category', row.id, row, null, null, deviceId);
  });
  return row;
}

/** Categories with any referencing data can only be archived, never physically deleted. */
export async function archiveCategory(id: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.categories, db.pendingOps, async () => {
    const existing = await db.categories.get(id);
    if (!existing) return;
    const updated: Category = { ...existing, archived: true, updatedAt: nowIso(), version: bumpVersion(existing.version) };
    await db.categories.put(updated);
    await enqueueOp('category', id, updated, existing.version, null, deviceId);
  });
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.categories, db.pendingOps, async () => {
    const existing = await db.categories.get(id);
    if (!existing) return;
    const updated: Category = { ...existing, name, updatedAt: nowIso(), version: bumpVersion(existing.version) };
    await db.categories.put(updated);
    await enqueueOp('category', id, updated, existing.version, null, deviceId);
  });
}

export async function createPath(input: {
  subjectId: string; name: string; mode: LearningPath['mode'];
  totalQuantity?: number | null; unit?: string | null; initialCompleted?: number;
}): Promise<LearningPath> {
  if (input.mode === 'quantity') {
    if (!Number.isInteger(input.totalQuantity) || (input.totalQuantity ?? 0) < 1) throw new AppError('err.pathTotal');
    if (!Number.isInteger(input.initialCompleted ?? 0) || (input.initialCompleted ?? 0) < 0) throw new AppError('err.pathInitial');
  }
  const deviceId = await ensureDeviceId();
  const path: LearningPath = {
    id: uuid2(), subjectId: input.subjectId, name: input.name, mode: input.mode,
    totalQuantity: input.totalQuantity ?? null,
    completedQuantity: input.initialCompleted ?? (input.mode === 'quantity' ? 0 : null),
    unit: input.unit ?? null,
    createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
  };
  await db.transaction('rw', db.paths, db.pendingOps, async () => {
    await db.paths.add(path);
    await enqueueOp('path', path.id, path, null, null, deviceId);
  });
  return path;
}

export async function addPathItems(pathId: string, titles: string[]): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.paths, db.pathItems, db.pendingOps, async () => {
    const path = await db.paths.get(pathId);
    if (!path) return;
    const existing = await db.pathItems.where('pathId').equals(pathId).filter((i) => !i.deletedAt).toArray();
    let order = existing.length;
    const rows: PathItem[] = titles.map((t) => ({
      id: uuid2(), pathId, parentId: null, title: t, sortOrder: order++,
      done: false, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
    }));
    const groupId = uuid2();
    await db.pathItems.bulkAdd(rows);
    for (const r of rows) await enqueueOp('pathItem', r.id, r, null, groupId, deviceId);
  });
}

export async function setItemDone(item: PathItem, done: boolean): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.pathItems, db.progressEvents, db.pendingOps, async () => {
    const current = await db.pathItems.get(item.id);
    if (!current || current.done === done) return;
    const updated: PathItem = { ...current, done, updatedAt: nowIso(), version: bumpVersion(current.version) };
    const event: ProgressEvent = {
      id: uuid2(), opId: uuid2(), pathId: current.pathId, itemId: current.id,
      quantityDelta: null, itemDone: done, entryId: null, undoneAt: null, createdAt: nowIso(),
      version: 1,
    };
    const groupId = uuid2();
    await db.pathItems.put(updated);
    await db.progressEvents.add(event);
    await enqueueOp('pathItem', current.id, updated, current.version, groupId, deviceId);
    await enqueueOp('progressEvent', event.id, event, null, groupId, deviceId);
  });
}

export async function addQuantity(pathId: string, delta: number): Promise<void> {
  if (!Number.isInteger(delta)) throw new AppError('err.quantityInteger');
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.paths, db.progressEvents, db.pendingOps, async () => {
    const path = await db.paths.get(pathId);
    if (!path) return;
    const previous = path.completedQuantity ?? 0;
    const next = Math.max(0, previous + delta);
    const appliedDelta = next - previous;
    if (appliedDelta === 0) return;
    const updated: LearningPath = { ...path, completedQuantity: next, updatedAt: nowIso(), version: bumpVersion(path.version) };
    const event: ProgressEvent = {
      id: uuid2(), opId: uuid2(), pathId, itemId: null,
      quantityDelta: appliedDelta, itemDone: null, entryId: null, undoneAt: null, createdAt: nowIso(),
      version: 1,
    };
    const groupId = uuid2();
    await db.paths.put(updated);
    await db.progressEvents.add(event);
    await enqueueOp('path', pathId, updated, path.version, groupId, deviceId);
    await enqueueOp('progressEvent', event.id, event, null, groupId, deviceId);
  });
}

export async function deletePath(pathId: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.paths, db.pendingOps, async () => {
    const path = await db.paths.get(pathId);
    if (!path) return;
    const updated: LearningPath = { ...path, deletedAt: nowIso(), updatedAt: nowIso(), version: bumpVersion(path.version) };
    await db.paths.put(updated);
    await enqueueOp('path', pathId, updated, path.version, null, deviceId);
  });
}

export async function addTodo(input: { title: string; subjectId: string | null; scheduledDate: string | null; dueDate: string | null }): Promise<void> {
  const deviceId = await ensureDeviceId();
  const todo: Todo = {
    id: uuid2(), title: input.title, subjectId: input.subjectId, pathId: null, itemId: null,
    scheduledDate: input.scheduledDate, dueDate: input.dueDate, done: false,
    createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
  };
  await db.transaction('rw', db.todos, db.pendingOps, async () => {
    await db.todos.add(todo);
    await enqueueOp('todo', todo.id, todo, null, null, deviceId);
  });
}

export async function toggleTodo(todo: Todo): Promise<void> {
  const deviceId = await ensureDeviceId();
  const updated: Todo = { ...todo, done: !todo.done, updatedAt: nowIso(), version: bumpVersion(todo.version) };
  await db.transaction('rw', db.todos, db.pendingOps, async () => {
    await db.todos.put(updated);
    await enqueueOp('todo', todo.id, updated, todo.version, null, deviceId);
  });
}

export async function deleteTodo(id: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.todos, db.pendingOps, async () => {
    const todo = await db.todos.get(id);
    if (!todo) return;
    const updated: Todo = { ...todo, deletedAt: nowIso(), updatedAt: nowIso(), version: bumpVersion(todo.version) };
    await db.todos.put(updated);
    await enqueueOp('todo', id, updated, todo.version, null, deviceId);
  });
}

export async function setGoal(input: { scope: Goal['scope']; subjectId: string | null; period: Goal['period']; targetSeconds: number }): Promise<void> {
  if (!Number.isFinite(input.targetSeconds) || input.targetSeconds < 0) throw new AppError('err.goalNonNegative');
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.goals, db.pendingOps, async () => {
    // Keep lookup and write together so concurrent saves cannot create duplicate goals.
    const existing = await db.goals
      .filter((g) => !g.deletedAt && g.scope === input.scope && g.period === input.period && g.subjectId === input.subjectId)
      .first();
    if (existing) {
      const updated: Goal = { ...existing, targetSeconds: input.targetSeconds, active: input.targetSeconds > 0, updatedAt: nowIso(), version: bumpVersion(existing.version) };
      await db.goals.put(updated);
      await enqueueOp('goal', existing.id, updated, existing.version, null, deviceId);
      return;
    }
    if (input.targetSeconds <= 0) return;
    const goal: Goal = {
      id: uuid2(), scope: input.scope, subjectId: input.subjectId, period: input.period,
      targetSeconds: input.targetSeconds, active: true,
      createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
    };
    await db.goals.add(goal);
    await enqueueOp('goal', goal.id, goal, null, null, deviceId);
  });
}

export async function addQuickAction(activityId: string, label: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.quickActions, db.pendingOps, async () => {
    const duplicate = await db.quickActions.where('activityId').equals(activityId).filter((q) => !q.hidden).first();
    if (duplicate) return;
    const qa: QuickAction = {
      id: uuid2(), activityId, label, pinned: true,
      sortOrder: await db.quickActions.count(), hidden: false, version: 1,
    };
    await db.quickActions.add(qa);
    await enqueueOp('quickAction', qa.id, qa, null, null, deviceId);
  });
}

export async function removeQuickAction(id: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.quickActions, db.pendingOps, async () => {
    const existing = await db.quickActions.get(id);
    if (!existing) return;
    await db.quickActions.delete(id);
    await enqueueOp('quickAction', id, null, existing.version, null, deviceId);
  });
}

export async function todayEntries(): Promise<EntryRecord[]> {
  const today = todayKey();
  return db.entries.where('learningDate').equals(today).filter((e) => !e.deletedAt).toArray();
}
