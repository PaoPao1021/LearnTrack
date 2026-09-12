import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { Category } from '@learntrack/domain';

/** Grouped three-level category tree for pickers. */
export interface ActivityOption {
  activity: Category;
  subject: Category;
  major: Category;
}

export function useActivities(): ActivityOption[] {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).filter((c) => !c.deletedAt && !c.archived).map((c) => [c.id, c]));
  const out: ActivityOption[] = [];
  for (const activity of byId.values()) {
    if (activity.level !== 'activity') continue;
    const subject = activity.parentId ? byId.get(activity.parentId) : undefined;
    const major = subject?.parentId ? byId.get(subject.parentId) : undefined;
    if (subject && major) out.push({ activity, subject, major });
  }
  return out.sort((a, b) => (a.major.name + a.subject.name + a.activity.name).localeCompare(b.major.name + b.subject.name + b.activity.name, 'zh'));
}

export function labelOf(opt: ActivityOption): string {
  return `${opt.subject.name}·${opt.activity.name}`;
}
