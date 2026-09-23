import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { categoryPath, majorOf, subjectOf } from '@learntrack/domain';
import type { Category } from '@learntrack/domain';

/** One selectable row for pickers, always carrying a full three-level path. */
export interface ActivityOption {
  activity: Category;
  subject: Category;
  major: Category;
}

/**
 * Flatten the category tree into the rows time can be attached to.
 *
 * Every active category can receive time directly. Keep parents selectable even
 * after children are added, so existing timers and shortcuts retain their target.
 * Hide descendants of archived/deleted parents without altering saved records.
 */
export function buildActivityOptions(categories: Category[]): ActivityOption[] {
  const allById = new Map(categories.map((c) => [c.id, c]));
  const live = categories.filter((c) => categoryPath(allById, c.id).every((p) => !p.deletedAt && !p.archived));
  const byId = new Map(live.map((c) => [c.id, c]));

  const out: ActivityOption[] = [];
  for (const c of live) {
    out.push({
      activity: c,
      subject: subjectOf(byId, c.id) ?? c,
      major: majorOf(byId, c.id) ?? c,
    });
  }
  return out.sort((a, b) => pathLabelOf(a).localeCompare(pathLabelOf(b), 'zh'));
}

export function useActivities(): ActivityOption[] {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  return useMemo(() => buildActivityOptions(categories), [categories]);
}

/** Short label: `科目·活动`, or the bare name for a self-referencing row. */
export function labelOf(opt: ActivityOption): string {
  return opt.activity.id === opt.subject.id ? opt.subject.name : `${opt.subject.name}·${opt.activity.name}`;
}

/** Full breadcrumb, collapsing the repeated segments of a self-referencing row. */
export function pathLabelOf(opt: ActivityOption): string {
  const parts = [opt.major.name];
  if (opt.subject.id !== opt.major.id) parts.push(opt.subject.name);
  if (opt.activity.id !== opt.subject.id) parts.push(opt.activity.name);
  return parts.join(' / ');
}
