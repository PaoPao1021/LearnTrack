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

/** Split one entry into authoritative local-day buckets. */
export function entrySecondsByLocalDay(entry: EntryRecord): Record<string, number> {
  if (entry.startedAt == null || entry.endedAt == null) {
    return entry.durationSeconds > 0 ? { [entry.learningDate]: Math.max(0, entry.durationSeconds) } : {};
  }
  const buckets = splitRangeByLocalDay(
    entry.startedAt,
    entry.endedAt,
    entry.timeZone,
    entry.pauseIntervals ?? [],
  );
  const keys = Object.keys(buckets).sort();
  const computed = keys.reduce((sum, key) => sum + (buckets[key] ?? 0), 0);
  const recorded = Math.max(0, entry.durationSeconds);
  // Keep the stored duration authoritative while retaining the midnight split.
  // Normally this only corrects a one-second rounding difference.
  if (keys.length > 0 && computed !== recorded) {
    const last = keys[keys.length - 1]!;
    buckets[last] = Math.max(0, (buckets[last] ?? 0) + recorded - computed);
  }
  return buckets;
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
    const perDay = entrySecondsByLocalDay(entry);
    const inRange = Object.entries(perDay).filter(([day]) => day >= from && day <= to);
    const secs = inRange.reduce((sum, [, seconds]) => sum + seconds, 0);
    if (secs <= 0) continue;
    totalSeconds += secs;
    entryCount += 1;
    for (const [day, seconds] of inRange) {
      activeDays.add(day);
      dayMap.set(day, (dayMap.get(day) ?? 0) + seconds);
    }

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
    const nextHour = localHourBoundaryAfter(t, end, entry.timeZone);
    const segEnd = Math.min(nextHour, end);
    const seg = effectiveSegmentSeconds(t, segEnd, pauses);
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

function effectiveSegmentSeconds(
  startAt: number,
  endAt: number,
  pauses: { startAt: number; endAt: number }[],
): number {
  const clipped = pauses
    .map((p) => ({ startAt: Math.max(startAt, p.startAt), endAt: Math.min(endAt, p.endAt) }))
    .filter((p) => p.endAt > p.startAt)
    .sort((a, b) => a.startAt - b.startAt);
  let pausedMs = 0;
  let cursorStart: number | null = null;
  let cursorEnd: number | null = null;
  for (const p of clipped) {
    if (cursorStart == null || cursorEnd == null) {
      cursorStart = p.startAt;
      cursorEnd = p.endAt;
    } else if (p.startAt <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, p.endAt);
    } else {
      pausedMs += cursorEnd - cursorStart;
      cursorStart = p.startAt;
      cursorEnd = p.endAt;
    }
  }
  if (cursorStart != null && cursorEnd != null) pausedMs += cursorEnd - cursorStart;
  return Math.max(0, Math.round((endAt - startAt - pausedMs) / 1000));
}

/** Find the next wall-clock hour boundary, including half/quarter-hour time zones. */
function localHourBoundaryAfter(atMs: number, endAtMs: number, timeZone: string): number {
  const startKey = localDateHourKey(atMs, timeZone);
  const step = 15 * 60 * 1000;
  let hi = Math.min(endAtMs, atMs + step);
  while (hi < endAtMs && localDateHourKey(hi, timeZone) === startKey) {
    hi = Math.min(endAtMs, hi + step);
  }
  if (localDateHourKey(hi, timeZone) === startKey) return endAtMs;
  let lo = Math.max(atMs, hi - step);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateHourKey(mid, timeZone) === startKey) lo = mid;
    else hi = mid;
  }
  return hi;
}

function localDateHourKey(atMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(atMs));
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}`;
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
    const seconds = Object.entries(entrySecondsByLocalDay(e))
      .filter(([day]) => day >= from && day <= to)
      .reduce((sum, [, value]) => sum + value, 0);
    if (seconds <= 0) continue;
    secondsByActivity.set(e.activityId, (secondsByActivity.get(e.activityId) ?? 0) + seconds);
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
