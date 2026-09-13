import { CATEGORY_SEEDS, ACTIVITY_SEEDS, stableSeedId } from '@learntrack/domain';
import { db, SETTINGS_KEYS, getSetting, setSetting } from './database';
import type { Category } from '@learntrack/domain';

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Initialize built-in categories with stable seed keys so multiple devices
 * converge on the same subjects without duplication. Safe to re-run.
 */
export async function ensureSeeded(): Promise<void> {
  const existing = await db.categories.toArray();
  const bySeed = new Map(existing.filter((c) => c.seedKey).map((c) => [c.seedKey as string, c]));
  let sortOrder = existing.filter((c) => c.level === 'major').length;

  await db.transaction('rw', db.categories, db.quickActions, async () => {
    for (const major of CATEGORY_SEEDS) {
      let majorRow = bySeed.get(major.seedKey);
      if (!majorRow) {
        majorRow = {
          id: stableSeedId(major.seedKey), level: 'major', parentId: null, name: major.name, color: major.color,
          seedKey: major.seedKey, archived: false, sortOrder: sortOrder++,
          createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
        };
        await db.categories.add(majorRow);
      }
      for (const [si, subject] of (major.children ?? []).entries()) {
        let subjectRow = bySeed.get(subject.seedKey);
        if (!subjectRow) {
          subjectRow = {
            id: stableSeedId(subject.seedKey), level: 'subject', parentId: majorRow.id, name: subject.name, color: subject.color,
            seedKey: subject.seedKey, archived: false, sortOrder: si,
            createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
          };
          await db.categories.add(subjectRow);
        }
        const acts = ACTIVITY_SEEDS[subject.seedKey] ?? [];
        for (const [ai, activity] of acts.entries()) {
          const key = `${subject.seedKey}.${activity}`;
          if (bySeed.has(key)) continue;
          const row: Category = {
            id: stableSeedId(key), level: 'activity', parentId: subjectRow!.id, name: activity, color: subject.color,
            seedKey: key, archived: false, sortOrder: ai,
            createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null, version: 1,
          };
          await db.categories.add(row);
        }
      }
    }

    // Default quick actions once, on first init only.
    const qaCount = await db.quickActions.count();
    if (qaCount === 0) {
      const all = await db.categories.toArray();
      const byId = new Map(all.map((c) => [c.id, c]));
      const preferred = ['习题', '听课', '刷题', '学习'];
      const picks: Category[] = [];
      for (const name of preferred) {
        for (const a of all.filter((c) => c.level === 'activity' && c.name === name)) {
          if (picks.length < 6) picks.push(a);
        }
      }
      await db.quickActions.bulkAdd(
        picks.map((a, i) => {
          const subject = a.parentId ? byId.get(a.parentId) : undefined;
          return {
            id: stableSeedId(`quick-action:${a.seedKey ?? a.id}`), activityId: a.id,
            label: subject ? `${subject.name}·${a.name}` : a.name,
            pinned: true, sortOrder: i, hidden: false, version: 1,
          };
        }),
      );
    }
  });
  await setSetting('categoriesSeeded', true);
}

export async function ensureDeviceId(): Promise<string> {
  let id = await getSetting<string>(SETTINGS_KEYS.deviceId, '');
  if (!id) {
    id = uuid();
    await setSetting(SETTINGS_KEYS.deviceId, id);
  }
  return id;
}
