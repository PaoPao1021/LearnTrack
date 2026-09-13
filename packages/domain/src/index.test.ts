import { describe, expect, it } from 'vitest';
import {
  effectiveSecondsBetween,
  splitRangeByLocalDay,
  localDateKey,
  isoWeekKey,
  mondayOf,
  addDays,
  computeStats,
  chapterProgress,
  quantityProgress,
  overlaps,
  entrySecondsByLocalDay,
  stableSeedId,
} from './index.js';
import type { Category, EntryRecord } from './index.js';

const TZ = 'Asia/Shanghai';

function ts(localStr: string): number {
  // Interpret "YYYY-MM-DDTHH:mm" as wall time in TZ by using the known +08:00 offset (no DST).
  return new Date(`${localStr}:00+08:00`).getTime();
}

function entry(partial: Partial<EntryRecord>): EntryRecord {
  return {
    id: 'e1', deviceId: 'd1', activityId: 'a1', method: 'duration',
    learningDate: '2026-09-10', startedAt: null, endedAt: null, timeZone: TZ,
    durationSeconds: 0, createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z',
    deletedAt: null, version: 1, ...partial,
  };
}

describe('time calculations', () => {
  it('computes effective seconds minus pauses', () => {
    const start = ts('2026-09-10T09:00');
    const end = ts('2026-09-10T10:00');
    const pauses = [{ startAt: ts('2026-09-10T09:20'), endAt: ts('2026-09-10T09:30') }];
    expect(effectiveSecondsBetween(start, end, pauses)).toBe(3000);
  });

  it('splits a cross-midnight range 23:30–00:30 into 30+30 minutes', () => {
    const buckets = splitRangeByLocalDay(ts('2026-09-10T23:30'), ts('2026-09-11T00:30'), TZ);
    expect(buckets['2026-09-10']).toBe(1800);
    expect(buckets['2026-09-11']).toBe(1800);
  });

  it('excludes pause intervals from day buckets', () => {
    const buckets = splitRangeByLocalDay(
      ts('2026-09-10T09:00'), ts('2026-09-10T10:00'), TZ,
      [{ startAt: ts('2026-09-10T09:00'), endAt: ts('2026-09-10T09:30') }],
    );
    expect(buckets['2026-09-10']).toBe(1800);
  });

  it('does not subtract overlapping pause intervals twice', () => {
    const start = ts('2026-09-10T09:00');
    const end = ts('2026-09-10T10:00');
    expect(effectiveSecondsBetween(start, end, [
      { startAt: ts('2026-09-10T09:10'), endAt: ts('2026-09-10T09:30') },
      { startAt: ts('2026-09-10T09:20'), endAt: ts('2026-09-10T09:40') },
    ])).toBe(1800);
  });

  it('formats local date keys and weeks', () => {
    expect(localDateKey(new Date(ts('2026-09-12T08:00')), TZ)).toBe('2026-09-12');
    expect(isoWeekKey('2026-09-07')).toMatch(/-W\d{2}$/);
    expect(mondayOf('2026-09-12')).toBe('2026-09-07');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('stats', () => {
  const cats: Category[] = [
    { id: 'm', level: 'major', parentId: null, name: '数学', color: '#000', archived: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
    { id: 's', level: 'subject', parentId: 'm', name: '高数', color: '#000', archived: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
    { id: 'a1', level: 'activity', parentId: 's', name: '习题', color: '#000', archived: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
  ];

  it('aggregates totals, averages, unspecified hours and coverage', () => {
    const entries = [
      entry({ id: 'e1', learningDate: '2026-09-10', durationSeconds: 5400 }), // duration-only
      entry({ id: 'e2', learningDate: '2026-09-10', method: 'range', startedAt: ts('2026-09-10T08:00'), endedAt: ts('2026-09-10T09:00'), durationSeconds: 3600 }),
      entry({ id: 'e3', learningDate: '2026-09-11', durationSeconds: 1800, deletedAt: '2026-09-11T00:00:00Z' }),
    ];
    const s = computeStats(entries, cats, '2026-09-07', '2026-09-13', { timeZone: TZ });
    expect(s.totalSeconds).toBe(9000);
    expect(s.entryCount).toBe(2);
    expect(s.activeDayCount).toBe(1);
    expect(s.calendarDayCount).toBe(7);
    expect(s.unspecifiedSeconds).toBe(5400);
    expect(s.rangeCoverage).toBeCloseTo(0.4);
    expect(s.byDay.find((p) => p.date === '2026-09-10')?.seconds).toBe(9000);
    const major = s.categories.find((c) => c.categoryId === 'm');
    expect(major?.totalSeconds).toBe(9000);
    expect(major?.children[0]?.categoryId).toBe('s');
  });

  it('does not double-count hour buckets for cross-midnight ranges', () => {
    const entries = [
      entry({ method: 'range', startedAt: ts('2026-09-10T23:00'), endedAt: ts('2026-09-11T01:00'), durationSeconds: 7200 }),
    ];
    const s = computeStats(entries, cats, '2026-09-07', '2026-09-13', { timeZone: TZ });
    const total = s.byHour.reduce((sum, h) => sum + h.seconds, 0);
    expect(total).toBe(7200); // 恰好 2 小时，而不是跨 2 天的 2 倍
    expect(s.byHour[23]?.seconds).toBe(3600);
    expect(s.byHour[0]?.seconds).toBe(3600);
  });

  it('allocates a cross-midnight entry to the selected local days', () => {
    const ranged = entry({
      method: 'range',
      learningDate: '2026-09-10',
      startedAt: ts('2026-09-10T23:30'),
      endedAt: ts('2026-09-11T00:30'),
      durationSeconds: 3600,
    });
    expect(entrySecondsByLocalDay(ranged)).toEqual({
      '2026-09-10': 1800,
      '2026-09-11': 1800,
    });
    const nextDay = computeStats([ranged], cats, '2026-09-11', '2026-09-11', { timeZone: TZ });
    expect(nextDay.totalSeconds).toBe(1800);
    expect(nextDay.byDay).toEqual([{ date: '2026-09-11', seconds: 1800 }]);
    expect(nextDay.categories[0]?.totalSeconds).toBe(1800);
  });

  it('uses wall-clock hour boundaries in half-hour time zones', () => {
    const indiaEntry = entry({
      method: 'range',
      learningDate: '2026-09-10',
      timeZone: 'Asia/Kolkata',
      startedAt: new Date('2026-09-10T10:15:00+05:30').getTime(),
      endedAt: new Date('2026-09-10T11:15:00+05:30').getTime(),
      durationSeconds: 3600,
    });
    const s = computeStats([indiaEntry], cats, '2026-09-10', '2026-09-10', { timeZone: 'Asia/Kolkata' });
    expect(s.byHour[10]?.seconds).toBe(2700);
    expect(s.byHour[11]?.seconds).toBe(900);
  });

  it('does not fake hour buckets for duration-only entries', () => {
    const s = computeStats([entry({ durationSeconds: 600 })], cats, '2026-09-07', '2026-09-13', { timeZone: TZ });
    expect(s.byHour.every((h) => h.seconds === 0)).toBe(true);
    expect(s.unspecifiedSeconds).toBe(600);
  });
});

describe('progress', () => {
  const path = { id: 'p', subjectId: 's', name: 'x', mode: 'chapters' as const, totalQuantity: null, completedQuantity: null, unit: null, createdAt: '', updatedAt: '', deletedAt: null, version: 1 };

  it('counts only leaf chapters', () => {
    const items = [
      { id: 'c1', pathId: 'p', parentId: null, title: '第1章', sortOrder: 0, done: false, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
      { id: 'c2', pathId: 'p', parentId: 'c1', title: '1.1', sortOrder: 0, done: true, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
      { id: 'c3', pathId: 'p', parentId: 'c1', title: '1.2', sortOrder: 1, done: false, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
      { id: 'c4', pathId: 'p', parentId: null, title: '第2章', sortOrder: 1, done: true, createdAt: '', updatedAt: '', deletedAt: null, version: 1 },
    ];
    const p = chapterProgress(path, items);
    expect(p).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
  });

  it('quantity progress flags exceeding target', () => {
    const qp = { ...path, mode: 'quantity' as const, totalQuantity: 1000, completedQuantity: 1200, unit: '题' };
    const p = quantityProgress(qp);
    expect(p.ratio).toBe(1);
    expect(p.exceedsTarget).toBe(true);
  });
});

it('detects overlapping ranges', () => {
  const a = { startedAt: ts('2026-09-10T09:00'), endedAt: ts('2026-09-10T10:00') };
  const b = { startedAt: ts('2026-09-10T09:30'), endedAt: ts('2026-09-10T11:00') };
  const c = { startedAt: ts('2026-09-10T10:00'), endedAt: ts('2026-09-10T11:00') };
  expect(overlaps(a, b)).toBe(true);
  expect(overlaps(a, c)).toBe(false);
});

it('derives the same valid built-in category id on every device', () => {
  const first = stableSeedId('math.calculus.习题');
  const second = stableSeedId('math.calculus.习题');
  expect(first).toBe(second);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
