import { StudyPlanDto, PracticeAttemptDto, CourseProgressDto, AgentProposal } from '@learntrack/contracts';
import { planDates, stableSeedId } from '@learntrack/domain';
import type { StudyPlan, PracticeAttempt, CourseProgress, Todo } from '@learntrack/domain';
import { db } from '../db/database';
import { ensureDeviceId } from '../db/seed';
import { enqueueOp } from './queue';
import { nowIso, uuid, shiftDateKey } from '../utils';

export async function createStudyPlan(input: Omit<StudyPlan, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version' | 'status'>, generateTasks: boolean) {
  const timestamp = nowIso();
  const plan = StudyPlanDto.parse({ ...input, id: uuid(), createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1, status: 'active' });
  const deviceId = await ensureDeviceId();
  const dates = generateTasks ? planDates(plan.startDate, plan.endDate) : [];
  const group = uuid();
  await db.transaction('rw', [db.studyPlans, db.todos, db.categories, db.pendingOps], async () => {
    if (plan.subjectId) {
      const subject = await db.categories.get(plan.subjectId);
      if (!subject || subject.level !== 'subject' || subject.deletedAt || subject.archived) throw new Error('所选科目已不可用，请重新选择');
    }
    await db.studyPlans.add(plan);
    await enqueueOp('studyPlan', plan.id, plan, null, group, deviceId);
    for (const date of dates) {
      const todo: Todo = { id: uuid(), title: plan.title, subjectId: plan.subjectId, pathId: null, itemId: null, planId: plan.id,
        estimatedMinutes: plan.dailyMinutes, scheduledDate: date, dueDate: date, done: false,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1 };
      await db.todos.add(todo);
      await enqueueOp('todo', todo.id, todo, null, group, deviceId);
    }
  });
  return plan;
}

export async function setPlanStatus(id: string, status: StudyPlan['status']) {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.studyPlans, db.pendingOps, async () => {
    const current = await db.studyPlans.get(id);
    if (!current || current.deletedAt) return;
    const next = { ...current, status, updatedAt: nowIso(), version: current.version + 1 };
    await db.studyPlans.put(next);
    await enqueueOp('studyPlan', id, next, current.version, null, deviceId);
  });
}

export async function updateStudyPlan(id: string, input: Pick<StudyPlan, 'title' | 'startDate' | 'endDate' | 'dailyMinutes' | 'dailyQuestions' | 'subjectId' | 'note'>, fillTasks: boolean) {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', [db.studyPlans, db.todos, db.categories, db.pendingOps], async () => {
    const current = await db.studyPlans.get(id);
    if (!current || current.deletedAt) throw new Error('计划已不存在');
    const timestamp = nowIso(), group = uuid();
    const next = StudyPlanDto.parse({ ...current, ...input, updatedAt: timestamp, version: current.version + 1 });
    if (next.subjectId) {
      const subject = await db.categories.get(next.subjectId);
      if (!subject || subject.level !== 'subject' || subject.deletedAt || subject.archived) throw new Error('所选科目已不可用，请重新选择');
    }
    const linked = await db.todos.filter((todo) => todo.planId === id && !todo.deletedAt).toArray();
    const dates = new Set(linked.filter((todo) => todo.scheduledDate && todo.scheduledDate >= next.startDate && todo.scheduledDate <= next.endDate).map((todo) => todo.scheduledDate));
    await db.studyPlans.put(next); await enqueueOp('studyPlan', id, next, current.version, group, deviceId);
    for (const todo of linked.filter((todo) => !todo.done)) {
      const outside = !todo.scheduledDate || todo.scheduledDate < next.startDate || todo.scheduledDate > next.endDate;
      const updated = { ...todo, title: next.title, subjectId: next.subjectId, estimatedMinutes: next.dailyMinutes, deletedAt: outside ? timestamp : null, updatedAt: timestamp, version: todo.version + 1 };
      await db.todos.put(updated); await enqueueOp('todo', todo.id, updated, todo.version, group, deviceId);
    }
    if (fillTasks) for (const date of planDates(next.startDate, next.endDate)) {
      if (dates.has(date)) continue;
      const todo: Todo = { id: uuid(), title: next.title, subjectId: next.subjectId, pathId: null, itemId: null, planId: id,
        estimatedMinutes: next.dailyMinutes, scheduledDate: date, dueDate: date, done: false,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1 };
      await db.todos.add(todo); await enqueueOp('todo', todo.id, todo, null, group, deviceId);
    }
    if (await db.pendingOps.where('opId').above('').filter((op) => op.opGroupId === group).count() > 1000) throw new Error('关联任务过多，请缩小计划范围');
  });
}

export async function deleteStudyPlan(id: string) {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.studyPlans, db.todos, db.pendingOps, async () => {
    const plan = await db.studyPlans.get(id);
    if (!plan || plan.deletedAt) return;
    const timestamp = nowIso(), group = uuid();
    const tasks = await db.todos.filter((todo) => todo.planId === id && !todo.done && !todo.deletedAt).toArray();
    if (tasks.length >= 1000) throw new Error('关联任务过多，请先移除部分任务');
    const next = { ...plan, deletedAt: timestamp, updatedAt: timestamp, version: plan.version + 1 };
    await db.studyPlans.put(next); await enqueueOp('studyPlan', id, next, plan.version, group, deviceId);
    for (const todo of tasks) {
      const nextTodo = { ...todo, deletedAt: timestamp, updatedAt: timestamp, version: todo.version + 1 };
      await db.todos.put(nextTodo); await enqueueOp('todo', todo.id, nextTodo, todo.version, group, deviceId);
    }
  });
}

export async function saveAttempt(input: Omit<PracticeAttempt, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version' | 'reviewDate'>) {
  const timestamp = nowIso();
  const row = PracticeAttemptDto.parse({ ...input, questionKey: input.questionKey.trim(), id: uuid(), createdAt: timestamp, updatedAt: timestamp,
    deletedAt: null, version: 1, reviewDate: input.result === 'correct' ? null : shiftDateKey(input.learningDate, 3) });
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.practiceAttempts, db.pendingOps, async () => {
    await db.practiceAttempts.add(row);
    await enqueueOp('practiceAttempt', row.id, row, null, null, deviceId);
  });
  return row;
}

export async function deleteAttempt(id: string) {
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.practiceAttempts, db.pendingOps, async () => {
    const current = await db.practiceAttempts.get(id);
    if (!current || current.deletedAt) return;
    const next = { ...current, deletedAt: nowIso(), updatedAt: nowIso(), version: current.version + 1 };
    await db.practiceAttempts.put(next);
    await enqueueOp('practiceAttempt', id, next, current.version, null, deviceId);
  });
}

export async function saveLecture(input: Pick<CourseProgress, 'chapterKey' | 'title' | 'done' | 'minutes' | 'note'>) {
  const deviceId = await ensureDeviceId();
  const id = stableSeedId(`course.zhangyu-2027-math1-30.${input.chapterKey}`);
  await db.transaction('rw', db.courseProgress, db.pendingOps, async () => {
    const current = await db.courseProgress.get(id), timestamp = nowIso();
    const row = CourseProgressDto.parse({ ...input, source: 'zhangyu-2027-math1-30', id,
      createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, deletedAt: null, version: (current?.version ?? 0) + 1 });
    await db.courseProgress.put(row);
    await enqueueOp('courseProgress', id, row, current?.version ?? null, null, deviceId);
  });
}

/** Validates the whole import before writing anything; preserved IDs make retries idempotent. */
export async function importPracticeJson(text: string) {
  const rows = PracticeAttemptDto.array().max(10000).parse(JSON.parse(text));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('导入文件包含重复记录 ID');
  const deviceId = await ensureDeviceId();
  let imported = 0;
  await db.transaction('rw', db.practiceAttempts, db.pendingOps, async () => {
    let group = uuid();
    for (const [index, row] of rows.entries()) {
      // Each exercise is independent; keep server operation groups within 1000.
      if (index > 0 && index % 1000 === 0) group = uuid();
      if (await db.practiceAttempts.get(row.id)) continue;
      // Imported records are new to this server. Normalize the local version.
      const next = { ...row, version: 1 };
      await db.practiceAttempts.add(next);
      await enqueueOp('practiceAttempt', next.id, next, null, group, deviceId);
      imported++;
    }
  });
  return imported;
}

export async function importAgentTasks(value: unknown, runId: string) {
  const proposal = AgentProposal.parse(value);
  const deviceId = await ensureDeviceId();
  await db.transaction('rw', db.todos, db.pendingOps, async () => {
    const group = uuid();
    for (const [index, task] of proposal.tasks.entries()) {
      const id = stableSeedId(`agent.${runId}.${index}`);
      if (await db.todos.get(id)) continue;
      const timestamp = nowIso();
      const row: Todo = { ...task, id, subjectId: null, pathId: null, itemId: null, dueDate: task.scheduledDate,
        done: false, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1 };
      await db.todos.add(row);
      await enqueueOp('todo', id, row, null, group, deviceId);
    }
  });
}
