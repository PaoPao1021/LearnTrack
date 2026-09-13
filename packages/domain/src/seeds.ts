import type { Category } from './model.js';

/**
 * Built-in category seeds with stable seed keys so multiple devices initialize
 * the same subjects without duplicating them.
 */
export interface CategorySeed {
  seedKey: string;
  name: string;
  color: string;
  children?: CategorySeed[];
}

export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    seedKey: 'math',
    name: '数学',
    color: '#3b82f6',
    children: [
      { seedKey: 'math.calculus', name: '高数', color: '#3b82f6' },
      { seedKey: 'math.linear', name: '线性代数', color: '#2563eb' },
      { seedKey: 'math.probability', name: '概率论与数理统计', color: '#1d4ed8' },
    ],
  },
  {
    seedKey: 'english',
    name: '英语',
    color: '#10b981',
    children: [
      { seedKey: 'english.vocabulary', name: '单词', color: '#10b981' },
      { seedKey: 'english.reading', name: '阅读', color: '#059669' },
    ],
  },
  {
    seedKey: 'cs408',
    name: '408',
    color: '#f59e0b',
    children: [
      { seedKey: 'cs408.datastructure', name: '数据结构', color: '#f59e0b' },
      { seedKey: 'cs408.computer-organization', name: '计算机组成原理', color: '#d97706' },
      { seedKey: 'cs408.os', name: '操作系统', color: '#b45309' },
      { seedKey: 'cs408.network', name: '计算机网络', color: '#92400e' },
    ],
  },
  {
    seedKey: 'politics',
    name: '政治',
    color: '#8b5cf6',
    children: [{ seedKey: 'politics.general', name: '综合学习', color: '#8b5cf6' }],
  },
  {
    seedKey: 'algorithm',
    name: '算法',
    color: '#ec4899',
    children: [{ seedKey: 'algorithm.leetcode', name: 'LeetCode', color: '#ec4899' }],
  },
];

export const ACTIVITY_SEEDS: Record<string, string[]> = {
  'math.calculus': ['听课', '习题', '复习'],
  'math.linear': ['听课', '习题', '复习'],
  'math.probability': ['听课', '习题', '复习'],
  'english.vocabulary': ['学习', '复习'],
  'english.reading': ['学习', '复习'],
  'cs408.datastructure': ['听课', '习题', '复习'],
  'cs408.computer-organization': ['听课', '习题', '复习'],
  'cs408.os': ['听课', '习题', '复习'],
  'cs408.network': ['听课', '习题', '复习'],
  'politics.general': ['听课', '习题', '背诵', '复习'],
  'algorithm.leetcode': ['刷题', '复盘'],
};

/** Deterministic UUID-shaped id derived from a built-in seed key. */
export function stableSeedId(seedKey: string): string {
  const bytes = new TextEncoder().encode(`learntrack:${seedKey}`);
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (const byte of bytes) {
    for (let i = 0; i < hashes.length; i += 1) {
      hashes[i] = Math.imul((hashes[i]! ^ byte) >>> 0, (0x01000193 + i * 2) >>> 0) >>> 0;
      hashes[i] = (hashes[i]! ^ (hashes[i]! >>> 13)) >>> 0;
    }
  }
  const chars = hashes.map((h) => h.toString(16).padStart(8, '0')).join('').split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface FlattenedSeed {
  major: { seedKey: string; name: string; color: string };
  subject: { seedKey: string; name: string; color: string } | null;
  activity: { seedKey: string; name: string } | null;
}

export function flattenSeeds(): FlattenedSeed[] {
  const out: FlattenedSeed[] = [];
  for (const major of CATEGORY_SEEDS) {
    for (const subject of major.children ?? []) {
      for (const activity of ACTIVITY_SEEDS[subject.seedKey] ?? []) {
        out.push({ major, subject, activity: { seedKey: `${subject.seedKey}.${activity}`, name: activity } });
      }
    }
  }
  return out;
}

/** Create the initial category set; reuses existing rows that match a seedKey. */
export function mergeSeedCategories(
  existing: Category[],
  now: string,
  makeCategory: (c: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => Category,
): { toCreate: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'version'>[] } {
  const existingSeeds = new Set(existing.filter((c) => c.seedKey).map((c) => c.seedKey as string));
  const toCreate: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'version'>[] = [];
  const parentKeyToId = new Map<string, string>();
  // categories cannot reference ids before creation; the caller wires parent ids by seedKey afterwards
  for (const major of CATEGORY_SEEDS) {
    if (!existingSeeds.has(major.seedKey)) {
      toCreate.push({
        level: 'major', parentId: null, name: major.name, color: major.color,
        seedKey: major.seedKey, archived: false, sortOrder: toCreate.length,
        deletedAt: null,
      });
    }
    for (const subject of major.children ?? []) {
      if (!existingSeeds.has(subject.seedKey)) {
        toCreate.push({
          level: 'subject', parentId: `seed:${major.seedKey}`, name: subject.name, color: subject.color,
          seedKey: subject.seedKey, archived: false, sortOrder: 0, deletedAt: null,
        });
      }
      for (const activity of ACTIVITY_SEEDS[subject.seedKey] ?? []) {
        const key = `${subject.seedKey}.${activity}`;
        if (!existingSeeds.has(key)) {
          toCreate.push({
            level: 'activity', parentId: `seed:${subject.seedKey}`, name: activity, color: subject.color,
            seedKey: key, archived: false, sortOrder: 0, deletedAt: null,
          });
        }
      }
    }
  }
  void now;
  void makeCategory;
  void parentKeyToId;
  return { toCreate };
}
