import { describe, expect, it } from 'vitest';
import type { Category, EntryRecord } from './model.js';
import { categoryPath, isSelfOrDescendant, majorOf, subjectOf } from './tree.js';
import { computeStats } from './stats.js';

const createdAt = '2026-09-21T00:00:00.000Z';
const category = (id: string, level: Category['level'], parentId: string | null): Category => ({
  id, level, parentId, name: id, color: '#64748b', archived: false, sortOrder: 0,
  createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
});

describe('category ancestry and statistics', () => {
  it('resolves direct parent records and child records to the same subject and major', () => {
    const major = category('major', 'major', null);
    const subject = category('subject', 'subject', major.id);
    const activity = category('activity', 'activity', subject.id);
    const index = new Map([major, subject, activity].map((row) => [row.id, row]));
    expect(majorOf(index, subject.id)).toEqual(major);
    expect(subjectOf(index, subject.id)).toEqual(subject);
    expect(subjectOf(index, activity.id)).toEqual(subject);
    expect(isSelfOrDescendant(index, subject.id, subject.id)).toBe(true);
    expect(isSelfOrDescendant(index, activity.id, major.id)).toBe(true);
    expect(isSelfOrDescendant(index, major.id, subject.id)).toBe(false);
  });

  it('terminates on corrupt cyclic category links without freezing statistics', () => {
    const categories = [category('a', 'subject', 'b'), category('b', 'activity', 'a')];
    const index = new Map(categories.map((row) => [row.id, row]));
    expect(categoryPath(index, 'a').map((row) => row.id)).toEqual(['a', 'b']);
    expect(categoryPath(index, 'missing')).toEqual([]);
    const entry: EntryRecord = {
      id: 'entry', deviceId: 'device', activityId: 'b', method: 'duration', learningDate: '2026-09-21',
      startedAt: null, endedAt: null, timeZone: 'Asia/Shanghai', durationSeconds: 60,
      createdAt, updatedAt: createdAt, deletedAt: null, version: 1,
    };
    expect(computeStats([entry], categories, '2026-09-21', '2026-09-21', { timeZone: 'Asia/Shanghai' }).totalSeconds).toBe(60);
  });
});
