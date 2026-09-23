import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { ensureSeeded } from '../../db/seed';
import { addCategory, addQuickAction, saveEntryWithProgress } from '../../services/commands';
import { computeStats } from '@learntrack/domain';
import { exportFullBackup, inspectBackup, restoreBackup, exportCsv } from '../../services/backup';
import { buildActivityOptions, pathLabelOf } from './useActivities';

/**
 * Walks the reported flow end to end: seed the app, add a brand-new subject in
 * Settings, then look for it the way the entry picker does.
 */
describe('a subject added in Settings is reachable from the entry picker', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    await ensureSeeded();
  });

  it('shows up in the picker even though it has no activities yet', async () => {
    const math = (await db.categories.filter((c) => c.level === 'major').toArray())[0]!;
    await addCategory('subject', math.id, '物理', '#64748b');

    const options = buildActivityOptions(await db.categories.toArray());
    const pick = options.find((o) => o.activity.name === '物理');
    expect(pick, '设置里新建的科目必须能在添加记录时被搜到').toBeDefined();
    expect(pathLabelOf(pick!)).toBe(`${math.name} / 物理`);
  });

  it('keeps working after the subject gains an activity', async () => {
    const math = (await db.categories.filter((c) => c.level === 'major').toArray())[0]!;
    const physics = await addCategory('subject', math.id, '物理', '#64748b');
    await addCategory('activity', physics.id, '听课', '#64748b');

    const options = buildActivityOptions(await db.categories.toArray());
    expect(options.find((o) => o.activity.name === '听课')).toBeDefined();
    // 已有记录和快捷项仍然可以使用原科目。
    expect(options.find((o) => o.activity.id === physics.id)).toBeDefined();
  });

  it.each(['major', 'subject'] as const)('saves, aggregates and restores direct %s records and shortcuts', async (level) => {
    const major = await addCategory('major', null, '科学', '#64748b');
    const target = level === 'major' ? major : await addCategory('subject', major.id, '物理', '#64748b');
    const { entry } = await saveEntryWithProgress({ activityId: target.id, method: 'duration', learningDate: '2026-09-21', startedAt: null, endedAt: null, durationSeconds: 1800 });
    await addQuickAction(target.id, '复习');
    const stats = computeStats(await db.entries.toArray(), await db.categories.toArray(), '2026-09-21', '2026-09-21', { timeZone: 'Asia/Shanghai' });
    expect(stats.totalSeconds).toBe(1800);
    expect(stats.categories.find((c) => c.categoryId === major.id)?.totalSeconds).toBe(1800);
    expect(await (await exportCsv()).text()).toContain(level === 'major' ? ',科学,,,' : ',科学,物理,,');
    const text = await (await exportFullBackup()).blob.text();
    await expect(inspectBackup(text)).resolves.toBeTruthy();
    await db.entries.clear();
    await restoreBackup(text);
    expect((await db.entries.get(entry.id))?.activityId).toBe(target.id);
    expect((await db.quickActions.toArray()).some((q) => q.activityId === target.id)).toBe(true);
    expect((await db.pendingOps.toArray()).some((op) => op.entityId === entry.id)).toBe(true);
  });
});
