import { describe, expect, it } from 'vitest';
import { averageDailySecondsForWeek } from './stats.js';

describe('historical weekly daily averages', () => {
  it('uses one included day on a selected historical Monday', () => {
    expect(averageDailySecondsForWeek(3 * 3600, '2026-09-21')).toBe(3 * 3600);
  });
  it('includes all seven days on a selected historical Sunday', () => {
    expect(averageDailySecondsForWeek(14 * 3600, '2026-09-27')).toBe(2 * 3600);
  });
});
