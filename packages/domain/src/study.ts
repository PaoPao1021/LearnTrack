export interface VersionedRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface StudyPlan extends VersionedRecord {
  title: string;
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  dailyQuestions: number;
  subjectId: string | null;
  status: 'active' | 'paused' | 'completed';
  note: string;
}

export type StudySource = 'zhangyu-2027-math1-30' | 'zhangyu-2027-math1-1000' | 'leetcode' | 'other';
export interface PracticeAttempt extends VersionedRecord {
  source: StudySource;
  chapterKey: string;
  questionKey: string;
  result: 'correct' | 'incorrect' | 'skipped';
  durationSeconds: number;
  learningDate: string;
  note: string;
  reviewDate: string | null;
}

export interface CourseProgress extends VersionedRecord {
  source: 'zhangyu-2027-math1-30';
  chapterKey: string;
  title: string;
  done: boolean;
  minutes: number;
  note: string;
}

// Knowledge-point groups, deliberately independent from unverified edition TOCs.
export const MATH_TOPICS = [
  ['limits', '函数、极限与连续'], ['derivatives', '导数与微分'], ['derivative-applications', '中值定理与导数应用'],
  ['integrals', '一元函数积分'], ['integral-applications', '积分应用'], ['ode', '微分方程'],
  ['vectors', '空间解析几何与向量'], ['multivariable', '多元函数微分'], ['multiple-integrals', '重积分'],
  ['line-surface', '曲线与曲面积分'], ['series', '无穷级数'], ['linear-algebra', '线性代数'],
  ['probability', '概率论'], ['statistics', '数理统计'], ['unassigned', '未分类'],
] as const;
export const STUDY_SOURCES: { id: StudySource; title: string; description: string }[] = [
  { id: 'zhangyu-2027-math1-30', title: '张宇基础 30 讲 · 2027 数一', description: '30 个讲次编号，可按教材编辑标题、记录完成情况与用时。' },
  { id: 'zhangyu-2027-math1-1000', title: '张宇 1000 题 · 2027 数一', description: '按册别、章节与原书题号记录；正确率和用时来自你的练习记录。' },
  { id: 'leetcode', title: '力扣练习', description: '按题号记录结果与用时，可查看公开提交日历。' },
  { id: 'other', title: '其他练习', description: '支持自定义题号和知识点。' },
];
export const LECTURES = Array.from({ length: 30 }, (_, index) => ({ key: `lecture-${index + 1}`, title: `第 ${index + 1} 讲` }));
export const CODE_TOPICS = [['arrays', '数组与哈希'], ['strings', '字符串'], ['linked-lists', '链表'], ['trees', '树与二叉树'], ['graphs', '图'], ['dp', '动态规划'], ['search', '搜索与回溯'], ['binary-search', '二分查找'], ['greedy', '贪心'], ['stacks', '栈与队列'], ['unassigned', '未分类']] as const;
export function topicsFor(source: StudySource): readonly (readonly [string, string])[] { return source === 'leetcode' ? CODE_TOPICS : MATH_TOPICS; }

export function practiceStats(rows: PracticeAttempt[]) {
  const active = rows.filter((r) => !r.deletedAt);
  const answered = active.filter((r) => r.result !== 'skipped');
  const correct = answered.filter((r) => r.result === 'correct').length;
  const latest = new Map<string, PracticeAttempt>();
  for (const row of [...active].sort((a, b) => a.learningDate.localeCompare(b.learningDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    latest.set(JSON.stringify([row.source, row.questionKey]), row);
  }
  const first = new Map<string, PracticeAttempt>();
  for (const row of [...answered].sort((a, b) => a.learningDate.localeCompare(b.learningDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const key = JSON.stringify([row.source, row.questionKey]);
    if (!first.has(key)) first.set(key, row);
  }
  const seconds = active.reduce((sum, row) => sum + row.durationSeconds, 0);
  const timed = active.filter((row) => row.durationSeconds > 0);
  return {
    attempts: active.length, answered: answered.length, correct, uniqueQuestions: latest.size,
    accuracy: answered.length ? correct / answered.length : null,
    firstAccuracy: first.size ? [...first.values()].filter((r) => r.result === 'correct').length / first.size : null,
    totalSeconds: seconds, averageSeconds: timed.length ? seconds / timed.length : null,
    review: [...latest.values()].filter((r) => r.result !== 'correct'),
  };
}

/** A historical cutoff must not be changed by corrections recorded after that day. */
export function reviewQueue(rows: PracticeAttempt[], through?: string) {
  const history = through ? rows.filter((row) => row.learningDate <= through) : rows;
  return practiceStats(history).review
    .filter((row) => !through || !row.reviewDate || row.reviewDate <= through)
    .sort((a, b) => (a.reviewDate ?? '').localeCompare(b.reviewDate ?? '') || a.questionKey.localeCompare(b.questionKey));
}

export function planDates(start: string, end: string): string[] {
  const startMs = Date.parse(`${start}T00:00:00Z`), endMs = Date.parse(`${end}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || new Date(startMs).toISOString().slice(0, 10) !== start || new Date(endMs).toISOString().slice(0, 10) !== end || endMs < startMs || endMs - startMs >= 366 * 86400000) throw new Error('计划日期范围不合法（最多 366 天）');
  return Array.from({ length: Math.round((endMs - startMs) / 86400000) + 1 }, (_, i) => new Date(startMs + i * 86400000).toISOString().slice(0, 10));
}
