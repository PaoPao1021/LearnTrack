import type { EntryRecord } from './model.js';

/** All domain quantities are integer seconds. Dates are local `YYYY-MM-DD`. */

export interface PauseInterval {
  /** epoch ms */
  startAt: number;
  /** epoch ms, exclusive */
  endAt: number;
}

/** Effective studied seconds between start and end minus pause intervals (clamped to the window). */
export function effectiveSecondsBetween(
  startAtMs: number,
  endAtMs: number,
  pauseIntervals: PauseInterval[] = [],
): number {
  if (endAtMs <= startAtMs) return 0;
  let total = (endAtMs - startAtMs) / 1000;
  const pauses = pauseIntervals
    .map((p) => ({ startAt: Math.max(p.startAt, startAtMs), endAt: Math.min(p.endAt, endAtMs) }))
    .filter((p) => p.endAt > p.startAt)
    .sort((a, b) => a.startAt - b.startAt);
  let pauseStart: number | null = null;
  let pauseEnd: number | null = null;
  for (const p of pauses) {
    if (pauseStart == null || pauseEnd == null) {
      pauseStart = p.startAt;
      pauseEnd = p.endAt;
    } else if (p.startAt <= pauseEnd) {
      pauseEnd = Math.max(pauseEnd, p.endAt);
    } else {
      total -= (pauseEnd - pauseStart) / 1000;
      pauseStart = p.startAt;
      pauseEnd = p.endAt;
    }
  }
  if (pauseStart != null && pauseEnd != null) {
    total -= (pauseEnd - pauseStart) / 1000;
  }
  return Math.max(0, Math.round(total));
}

/**
 * Split a timed range into per-local-date buckets of seconds.
 * A 23:30–00:30 session yields 30 minutes on each of the two days.
 */
export function splitRangeByLocalDay(
  startAtMs: number,
  endAtMs: number,
  timeZone: string,
  pauseIntervals: PauseInterval[] = [],
): Record<string, number> {
  const buckets: Record<string, number> = {};
  if (endAtMs <= startAtMs) return buckets;

  const DAY_MS = 86_400_000;
  // Walk in small steps at day boundaries in the target timezone.
  let cursor = startAtMs;
  while (cursor < endAtMs) {
    const nextMidnight = localMidnightAfter(cursor, timeZone);
    const segEnd = Math.min(nextMidnight, endAtMs);
    const seg = effectiveSecondsBetween(cursor, segEnd, pauseIntervals);
    if (seg > 0) {
      const day = localDateKey(new Date(cursor), timeZone);
      buckets[day] = (buckets[day] ?? 0) + seg;
    }
    if (segEnd <= cursor) break;
    cursor = segEnd;
  }
  return buckets;
}

/** Epoch ms of the next local midnight in `timeZone` strictly after `atMs`. */
export function localMidnightAfter(atMs: number, timeZone: string): number {
  // Compute by formatting the date in the tz, then find the wall-clock next day 00:00 offset.
  const probeStepMs = 30 * 60 * 1000; // half hour steps are safe for all real timezones
  let t = atMs + probeStepMs;
  const startDay = localDateKey(new Date(atMs), timeZone);
  while (localDateKey(new Date(t), timeZone) === startDay) t += probeStepMs;
  // Binary search to the millisecond.
  let lo = t - probeStepMs;
  let hi = t;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (localDateKey(new Date(mid), timeZone) === startDay) lo = mid;
    else hi = mid;
  }
  return Math.ceil(hi);
}

/** `YYYY-MM-DD` of an instant in `timeZone`. */
export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA gives YYYY-MM-DD
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = toKey.split('-').map(Number) as [number, number, number];
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  ) + 1;
}

/** Monday-based ISO week key like `2026-W37`. */
export function isoWeekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - dayNum + 3);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the week containing `dateKey`. */
export function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return s > 0 ? `${s} 秒` : '0 分钟';
  if (h === 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

export function hoursFromSeconds(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}
