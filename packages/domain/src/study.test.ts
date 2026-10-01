import { describe, expect, it } from 'vitest';
import { practiceStats, reviewQueue, planDates, type PracticeAttempt } from './study.js';
const row = (questionKey: string, result: PracticeAttempt['result'], learningDate: string, source: PracticeAttempt['source'] = 'other'): PracticeAttempt => ({
  id: crypto.randomUUID(), createdAt: `${learningDate}T10:00:00Z`, updatedAt: `${learningDate}T10:00:00Z`, deletedAt: null, version: 1,
  questionKey, result, learningDate, source, chapterKey: 'limits', durationSeconds: 120, note: '', reviewDate: null,
});
describe('practice analysis', () => {
  it('counts repeats independently and removes corrected questions from review', () => {
    const stats = practiceStats([row('A1', 'incorrect', '2026-09-01'), row('A1', 'correct', '2026-09-04'), row('A2', 'skipped', '2026-09-05')]);
    expect(stats.uniqueQuestions).toBe(2); expect(stats.answered).toBe(2); expect(stats.accuracy).toBe(.5); expect(stats.firstAccuracy).toBe(0);
    expect(stats.review.map((r) => r.questionKey)).toEqual(['A2']); expect(stats.totalSeconds).toBe(360);
  });
  it('keeps source namespaces distinct and excludes deleted attempts', () => {
    const deleted = { ...row('A3', 'incorrect', '2026-09-01'), deletedAt: '2026-09-02T00:00:00Z' };
    expect(practiceStats([row('1', 'correct', '2026-09-01'), row('1', 'incorrect', '2026-09-01', 'leetcode'), deleted]).uniqueQuestions).toBe(2);
    expect(practiceStats([]).accuracy).toBeNull(); expect(practiceStats([row('1', 'skipped', '2026-09-01')]).accuracy).toBeNull();
  });
  it('uses the learning date, even when historical attempts are imported later', () => {
    const older = { ...row('A1', 'incorrect', '2026-09-01'), createdAt: '2026-09-20T00:00:00Z' };
    expect(practiceStats([row('A1', 'correct', '2026-09-04'), older]).review).toHaveLength(0);
  });
  it('keeps review cutoffs consistent across sources and historical corrections', () => {
    const failed = { ...row('A1', 'incorrect', '2026-09-01'), reviewDate: '2026-09-04' };
    const futureCorrection = row('A1', 'correct', '2026-10-02');
    const code = row('70', 'incorrect', '2026-09-05', 'leetcode');
    const later = { ...row('A2', 'incorrect', '2026-09-29'), reviewDate: '2026-10-02' };
    expect(reviewQueue([failed, futureCorrection, code, later], '2026-09-30').map(r => r.questionKey)).toEqual(['70', 'A1']);
    expect(reviewQueue([failed, futureCorrection, code, later]).map(r => r.questionKey)).toEqual(['70', 'A2']);
  });
});
describe('daily plan dates', () => {
  it('crosses leap days without local timezone drift', () => { expect(planDates('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']); });
  it('rejects reversed and unbounded plans', () => { expect(() => planDates('2026-10-01', '2026-09-01')).toThrow(); expect(() => planDates('2026-01-01', '2028-01-01')).toThrow(); });
  it('rejects impossible dates and counts the 366 day boundary inclusively', () => {
    expect(() => planDates('2026-02-30', '2026-03-01')).toThrow();
    expect(() => planDates('2026-1-1', '2026-01-02')).toThrow();
    expect(planDates('2028-01-01', '2028-12-31')).toHaveLength(366);
    expect(() => planDates('2028-01-01', '2029-01-01')).toThrow();
  });
});
