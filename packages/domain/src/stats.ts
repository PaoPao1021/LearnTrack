import type { Category, EntryRecord, LearningPath, PathItem } from './model.js';
import { splitRangeByLocalDay, daysBetweenInclusive, mondayOf, addDays, localDateKey } from './time.js';

export interface CategoryTotals {
  categoryId: string;
  totalSeconds: number;
  share: number;
  children: CategoryTotals[];
}

export interface DayPoint {
  date: string;
  seconds: number;
}

export interface HourBucket {
  hour: number;
  seconds: number;
}

export interface StatsResult {
  from: string;
  to: string;
  totalSeconds: number;
  entryCount: number;
  calendarDayCount: number;
  activeDayCount: number;
  avgPerCalendarDaySeconds: number;
  avgPerActiveDaySeconds: number;
  /** share of total time backed by real start/end ranges */
  rangeCoverage: number;
  byDay: DayPoint[];
  byWeek: DayPoint[];
  byMonth: DayPoint[];
  /** hour 0-23 buckets from ranged records only */
  byHour: HourBucket[];
  unspecifiedSeconds: number;
  /** top-level majors with drilled-down children */
  categories: CategoryTotals[];
  moodDistribution: Record<number, number>;
  interruptionCounts: Record<string, number>;
}

export interface StatsOptions {
  timeZone: string;
}

function activeCategories(categories: Category[]): Map<string, Category> {
  return new Map(categories.filter((c) => !c.deletedAt).map((c) => [c.id, c]));
}

function levelOf(c: Category): 0 | 1 | 2 {
  return c.level === 'major' ? 0 : c.level === 'subject' ? 1 : 2;
}

/** Aggregates saved, non-deleted entries. Overlap-confirmed records count in full ("记录时长"). */
export function computeStats(
  entries: EntryRecord[],
  categories: Category[],
  from: string,
  to: string,
  options: StatsOptions,
): StatsResult {
  const tz = options.timeZone;
  const byId = activeCategories(categories);
  const calendarDayCount = Math.max(1, daysBetweenInclusive(from, to));
  const activeDays = new Set<string>();
  const dayMap = new Map<string, number>();
  const weekMap = new Map<string, number>();
  const monthMap = new Map<string, number>();
  const hourBuckets: number[] = new Array(24).fill(0);
  let unspecifiedSeconds = 0;
  let rangedSeconds = 0;
  let totalSeconds = 0;
  let entryCount = 0;
  const moodDistribution: Record<number, number> = {};
  const interruptionCounts: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const d = entry.learningDate;
    if (d < from || d > to) continue;
    const secs = Math.max(0, entry.durationSeconds);
    totalSeconds += secs;
    entryCount += 1;
    activeDays.add(d);
    dayMap.set(d, (dayMap.get(d) ?? 0) + secs);

    if (entry.startedAt != null && entry.endedAt != null) {
      rangedSeconds += secs;
      accumulateHourBuckets(entry, from, to, hourBuckets);
    } else {
      unspecifiedSeconds += secs;
    }

    if (entry.moodScore != null) {
      moodDistribution[entry.moodScore] = (moodDistribution[entry.moodScore] ?? 0) + 1;
    }
    if (entry.interruptionReason) {
      interruptionCounts[entry.interruptionReason] = (interruptionCounts[entry.interruptionReason] ?? 0) + 1;
    }
  }

  // weekly/monthly aggregation by local date key
  for (const [day, s] of dayMap) {
    const wk = isoWeekOfMonday(mondayOf(day));
    weekMap.set(wk, (weekMap.get(wk) ?? 0) + s);
    const mk = day.slice(0, 7);
    monthMap.set(mk, (monthMap.get(mk) ?? 0) + s);
  }

  const categoriesTree = buildCategoryTotals(entries, byId, from, to, totalSeconds);

  return {
    from,
    to,
    totalSeconds,
    entryCount,
    calendarDayCount,
    activeDayCount: activeDays.size,
    avgPerCalendarDaySeconds: Math.round(totalSeconds / calendarDayCount),
    avgPerActiveDaySeconds: activeDays.size ? Math.round(totalSeconds / activeDays.size) : 0,
    rangeCoverage: totalSeconds > 0 ? rangedSeconds / totalSeconds : 0,
    byDay: sortedPoints(dayMap),
    byWeek: sortedPoints(weekMap),
    byMonth: sortedPoints(monthMap),
    byHour: hourBuckets.map((seconds, hour) => ({ hour, seconds })),
    unspecifiedSeconds,
    categories: categoriesTree,
    moodDistribution,
    interruptionCounts,
  };
}

/**
 * Hour distribution: each entry is accumulated exactly once, split at exact hour
 * boundaries; only segments whose local date falls inside [from, to] count, so
 * cross-midnight records are not double-counted across stat invocations.
 */
function accumulateHourBuckets(
  entry: EntryRecord,
  from: string,
  to: string,
  hourBuckets: number[],
): void {
  if (entry.startedAt == null || entry.endedAt == null) return;
  const start = entry.startedAt;
  const end = entry.endedAt;
  const pauses = entry.pauseIntervals ?? [];
  let t = start;
  while (t < end) {
    const nextHour = Math.floor(t / 3_600_000) * 3_600_000 + 3_600_000;
    const segEnd = Math.min(nextHour, end);
    let seg = (segEnd - t) / 1000;
    for (const p of pauses) {
      const s = Math.max(p.startAt, t);
      const e = Math.min(p.endAt, segEnd);
      if (e > s) seg -= (e - s) / 1000;
    }
    seg = Math.max(0, Math.round(seg));
    if (seg > 0) {
      const day = localDateKey(new Date(t), entry.timeZone);
      if (day >= from && day <= to) {
        const hour = localHour(new Date(t), entry.timeZone);
        hourBuckets[hour] = (hourBuckets[hour] ?? 0) + seg;
      }
    }
    t = segEnd;
  }
}

function localHour(date: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(date);
  return Number(h) % 24;
}

function isoWeekOfMonday(mondayKey: string): string {
  return mondayKey; // label weeks by their Monday; display layer formats
}

function sortedPoints(map: Map<string, number>): DayPoint[] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, seconds]) => ({ date, seconds }));
}

function buildCategoryTotals(
  entries: EntryRecord[],
  byId: Map<string, Category>,
  from: string,
  to: string,
  totalSeconds: number,
): CategoryTotals[] {
  const secondsByActivity = new Map<string, number>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    if (e.learningDate < from || e.learningDate > to) continue;
    secondsByActivity.set(e.activityId, (secondsByActivity.get(e.activityId) ?? 0) + Math.max(0, e.durationSeconds));
  }
  const totals = new Map<string, number>();
  for (const [activityId, s] of secondsByActivity) {
    let cur: Category | undefined = byId.get(activityId);
    while (cur) {
      totals.set(cur.id, (totals.get(cur.id) ?? 0) + s);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  const build = (level: 0 | 1 | 2, parentId: string | null): CategoryTotals[] => {
    const nodes: CategoryTotals[] = [];
    for (const c of byId.values()) {
      if (levelOf(c) !== level) continue;
      if (c.parentId !== parentId) continue;
      const children = level < 2 ? build((level + 1) as 1 | 2, c.id) : [];
      const own = totals.get(c.id) ?? 0;
      if (own === 0 && children.every((ch) => ch.totalSeconds === 0)) continue;
      nodes.push({
        categoryId: c.id,
        totalSeconds: own,
        share: totalSeconds > 0 ? own / totalSeconds : 0,
        children: children.sort((a, b) => b.totalSeconds - a.totalSeconds),
      });
    }
    return nodes.sort((a, b) => b.totalSeconds - a.totalSeconds);
  };
  return build(0, null);
}

/** Chapter-mode progress: done leaf items / all leaf items. */
export function chapterProgress(path: LearningPath, items: PathItem[]): { done: number; total: number; ratio: number } {
  const live = items.filter((i) => !i.deletedAt);
  const childIds = new Set(live.filter((i) => i.parentId).map((i) => i.parentId as string));
  const leaves = live.filter((i) => !childIds.has(i.id));
  const done = leaves.filter((i) => i.done).length;
  const total = leaves.length;
  return { done, total, ratio: total > 0 ? done / total : 0 };
}

/** Quantity-mode progress; exceedsTarget lets UI ask for confirmation instead of silently truncating. */
export function quantityProgress(path: LearningPath): { done: number; total: number; ratio: number; exceedsTarget: boolean } {
  const done = Math.max(0, path.completedQuantity ?? 0);
  const total = Math.max(0, path.totalQuantity ?? 0);
  return {
    done,
    total,
    ratio: total > 0 ? Math.min(done / total, 1) : 0,
    exceedsTarget: total > 0 && done > total,
  };
}

export function goalCompletion(actualSeconds: number, targetSeconds: number): { ratio: number; remainingSeconds: number } {
  const ratio = targetSeconds > 0 ? actualSeconds / targetSeconds : 0;
  return { ratio, remainingSeconds: Math.max(0, targetSeconds - actualSeconds) };
}

/** Range [from,to] for the previous period of the same length. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetweenInclusive(from, to);
  return { from: addDays(from, -len), to: addDays(to, -len) };
}

export function overlaps(a: { startedAt: number; endedAt: number }, b: { startedAt: number; endedAt: number }): boolean {
  return a.startedAt < b.endedAt && b.startedAt < a.endedAt;
}
