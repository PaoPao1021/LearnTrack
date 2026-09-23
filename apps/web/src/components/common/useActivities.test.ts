import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Category } from '@learntrack/domain';
import { buildActivityOptions, labelOf, pathLabelOf } from './useActivities';

let seq = 0;
function cat(partial: Partial<Category> & { id: string; level: Category['level'] }): Category {
  seq += 1;
  return {
    parentId: null,
    name: partial.id,
    color: '#64748b',
    archived: false,
    sortOrder: seq,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    deletedAt: null,
    version: 1,
    ...partial,
  };
}

const math = cat({ id: 'math', level: 'major', name: '数学' });
const calculus = cat({ id: 'calculus', level: 'subject', parentId: 'math', name: '高数' });
const lecture = cat({ id: 'lecture', level: 'activity', parentId: 'calculus', name: '听课' });

describe('buildActivityOptions', () => {
  it('keeps leaf activities with their full major / subject path', () => {
    const options = buildActivityOptions([math, calculus, lecture]);
    const pick = options.find((o) => o.activity.id === 'lecture')!;
    expect(pathLabelOf(pick)).toBe('数学 / 高数 / 听课');
    expect(labelOf(pick)).toBe('高数·听课');
  });

  // Regression: a subject added in Settings used to vanish from every picker
  // because only leaf activities were selectable, so its name never matched.
  it('offers a subject that has no activities underneath it', () => {
    const physics = cat({ id: 'physics', level: 'subject', parentId: 'math', name: '物理' });
    const options = buildActivityOptions([math, calculus, lecture, physics]);
    const pick = options.find((o) => o.activity.id === 'physics');
    expect(pick, '新科目应可直接被搜索到').toBeDefined();
    expect(pathLabelOf(pick!)).toBe('数学 / 物理');
    expect(labelOf(pick!)).toBe('物理');
  });

  it('offers a major that has no subjects underneath it', () => {
    const arts = cat({ id: 'arts', level: 'major', name: '艺术' });
    const options = buildActivityOptions([math, calculus, lecture, arts]);
    const pick = options.find((o) => o.activity.id === 'arts');
    expect(pick).toBeDefined();
    expect(pathLabelOf(pick!)).toBe('艺术');
  });

  it('keeps parent targets selectable after children are added', () => {
    const options = buildActivityOptions([math, calculus, lecture]);
    expect(options.map((o) => o.activity.id).sort()).toEqual(['calculus', 'lecture', 'math']);
  });

  it('skips archived and deleted categories', () => {
    const physics = cat({ id: 'physics', level: 'subject', parentId: 'math', name: '物理' });
    const gone = cat({ id: 'gone', level: 'subject', parentId: 'math', name: '已删', deletedAt: '2026-09-20T00:00:00.000Z' });
    const options = buildActivityOptions([math, calculus, lecture, physics, gone]);
    expect(options.map((o) => o.activity.id).sort()).toEqual(['calculus', 'lecture', 'math', 'physics']);
  });

  it('hides descendants of archived or deleted parents', () => {
    for (const patch of [{ archived: true }, { deletedAt: '2026-09-20T00:00:00.000Z' }]) {
      expect(buildActivityOptions([{ ...math, ...patch }, calculus, lecture])).toEqual([]);
    }
  });

  it('still offers an activity whose parent chain was removed', () => {
    const orphan = cat({ id: 'orphan', level: 'activity', parentId: 'missing', name: '错题' });
    const options = buildActivityOptions([orphan]);
    expect(pathLabelOf(options[0]!)).toBe('错题');
  });
});
