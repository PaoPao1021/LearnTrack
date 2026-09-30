import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { createStudyPlan, updateStudyPlan, deleteStudyPlan, saveAttempt, saveLecture, importAgentTasks, importPracticeJson } from './study';
import { exportFullBackup, restoreBackup } from './backup';
import { applyRemoteOps, selectPushBatch } from './sync';
import { stableSeedId } from '@learntrack/domain';

beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
const planInput = { title: '积分复习', startDate: '2026-09-30', endDate: '2026-10-02', dailyMinutes: 90, dailyQuestions: 10, subjectId: null, note: '复习定积分' };
const attemptInput = { source: 'zhangyu-2027-math1-1000' as const, chapterKey: 'limits', questionKey: '高数·极限·A01', result: 'incorrect' as const, durationSeconds: 120, learningDate: '2026-09-30', note: '漏掉条件' };

describe('study data durability', () => {
  it('creates the plan and dated tasks in one operation group', async () => {
    const plan = await createStudyPlan(planInput, true);
    expect(await db.todos.count()).toBe(3);
    expect((await db.todos.toArray()).every((r) => r.planId === plan.id)).toBe(true);
    const ops = await db.pendingOps.toArray(); expect(ops).toHaveLength(4); expect(new Set(ops.map((op) => op.opGroupId)).size).toBe(1);
  });
  it('rolls back the complete plan if a task write fails', async () => {
    const spy = vi.spyOn(db.todos, 'add').mockRejectedValueOnce(new Error('disk full'));
    await expect(createStudyPlan(planInput, true)).rejects.toThrow('disk full'); spy.mockRestore();
    expect(await db.studyPlans.count()).toBe(0); expect(await db.pendingOps.count()).toBe(0);
  });
  it('adjusts unfinished plan tasks while preserving completed work', async () => {
    const plan = await createStudyPlan(planInput, true);
    const completed = (await db.todos.toArray()).find((todo) => todo.scheduledDate === '2026-09-30')!;
    await db.todos.update(completed.id, { done: true }); await db.pendingOps.clear();
    await updateStudyPlan(plan.id, { ...planInput, title: '新安排', startDate: '2026-10-02', endDate: '2026-10-03', dailyMinutes: 45 }, true);
    expect(await db.todos.get(completed.id)).toMatchObject({ done: true, deletedAt: null, title: planInput.title });
    const active = await db.todos.filter((todo) => !todo.deletedAt && !todo.done).toArray();
    expect(active.map((todo) => todo.scheduledDate).sort()).toEqual(['2026-10-02', '2026-10-03']);
    expect(active.every((todo) => todo.title === '新安排' && todo.estimatedMinutes === 45)).toBe(true);
    const ops = await db.pendingOps.toArray(); expect(new Set(ops.map((op) => op.opGroupId)).size).toBe(1);
    await deleteStudyPlan(plan.id);
    expect((await db.studyPlans.get(plan.id))?.deletedAt).toBeTruthy();
    expect(await db.todos.filter((todo) => !todo.deletedAt).count()).toBe(1);
    expect((await db.todos.get(completed.id))?.done).toBe(true);
  });
  it('rejects archived subjects without creating a plan or pending operations', async () => {
    const id = crypto.randomUUID();
    await db.categories.put({ id, name: '旧科目', level: 'subject', archived: true } as never);
    await expect(createStudyPlan({ ...planInput, subjectId: id }, true)).rejects.toThrow('不可用');
    expect(await db.studyPlans.count()).toBe(0); expect(await db.pendingOps.count()).toBe(0);
  });
  it('rejects invalid dates before writing data', async () => {
    await expect(createStudyPlan({ ...planInput, startDate: '2026-02-30' }, true)).rejects.toThrow();
    expect(await db.studyPlans.count()).toBe(0);
  });
  it('round-trips all new data and related tasks in a full backup', async () => {
    await createStudyPlan(planInput, true); const attempt = await saveAttempt(attemptInput);
    await saveLecture({ chapterKey: 'lecture-1', title: '第一讲', done: true, minutes: 60, note: '' });
    const backup = await (await exportFullBackup()).blob.text();
    await db.practiceAttempts.clear(); await db.studyPlans.clear(); await db.courseProgress.clear();
    await restoreBackup(backup);
    expect(await db.studyPlans.count()).toBe(1); expect(await db.courseProgress.count()).toBe(1);
    expect((await db.practiceAttempts.get(attempt.id))?.reviewDate).toBe('2026-10-03'); expect(await db.todos.count()).toBe(3);
  });
  it('applies new entity types from remote without overwriting pending changes', async () => {
    const attempt = await saveAttempt(attemptInput);
    await applyRemoteOps([{ entity: 'practiceAttempt', entityId: attempt.id, payload: { ...attempt, result: 'correct', version: 2 } }], 1);
    expect((await db.practiceAttempts.get(attempt.id))?.result).toBe('incorrect');
    await db.pendingOps.clear();
    await applyRemoteOps([{ entity: 'practiceAttempt', entityId: attempt.id, payload: { ...attempt, result: 'correct', version: 2 } }], 2);
    expect((await db.practiceAttempts.get(attempt.id))?.result).toBe('correct');
  });
  it('deduplicates imports and reviewed agent suggestions across repeated clicks', async () => {
    const attempt = await saveAttempt(attemptInput); await db.pendingOps.clear();
    expect(await importPracticeJson(JSON.stringify([attempt]))).toBe(0);
    const proposal = { summary: '计划', tasks: [{ title: '复习积分', scheduledDate: '2026-10-01', estimatedMinutes: 45 }] };
    await Promise.all([importAgentTasks(proposal, 'test-run'), importAgentTasks(proposal, 'test-run')]);
    expect(await db.todos.count()).toBe(1); expect(await db.pendingOps.count()).toBe(1);
  });
  it('serializes repeated lecture updates with a stable ID', async () => {
    const input = { chapterKey: 'lecture-1', title: '第一讲', done: false, minutes: 30, note: '' };
    await Promise.all([saveLecture(input), saveLecture({ ...input, done: true })]);
    expect(await db.courseProgress.count()).toBe(1);
    expect((await db.courseProgress.get(stableSeedId('course.zhangyu-2027-math1-30.lecture-1')))?.version).toBe(2);
  });
  it('imports more than 1000 exercise records without creating an oversized sync group', async () => {
    const row = await saveAttempt(attemptInput); await db.practiceAttempts.clear(); await db.pendingOps.clear();
    const rows = Array.from({ length: 1001 }, () => ({ ...row, id: crypto.randomUUID() }));
    expect(await importPracticeJson(JSON.stringify(rows))).toBe(1001);
    const ops = await db.pendingOps.toArray();
    const first = selectPushBatch(ops);
    expect(first).toHaveLength(1000); expect(selectPushBatch(ops.slice(first.length))).toHaveLength(1);
    expect(await db.practiceAttempts.count()).toBe(1001);
  });
});
