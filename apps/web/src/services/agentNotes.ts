import { z } from 'zod';
import { db } from '../db/database';
import { practiceStats, topicsFor, STUDY_SOURCES, type PracticeAttempt } from '@learntrack/domain';

const PREFIX = 'agentNote:';
const NoteSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(6000),
  createdAt: z.string().datetime(), origin: z.enum(['self', 'assistant']), model: z.string().max(200).optional(),
});
export type AgentNote = z.infer<typeof NoteSchema>;
export async function listAgentNotes(): Promise<AgentNote[]> {
  const rows = await db.settings.where('key').startsWith(PREFIX).toArray();
  return rows.flatMap(row => { const parsed = NoteSchema.safeParse(row.value); return parsed.success && row.key === PREFIX + parsed.data.id ? [parsed.data] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveAgentNote(note: AgentNote) {
  const parsed = NoteSchema.parse(note);
  await db.settings.put({ key: PREFIX + parsed.id, value: parsed });
}
export async function deleteAgentNote(id: string) { await db.settings.delete(PREFIX + z.string().uuid().parse(id)); }

/** Include coding and custom topics without merging identical keys from different materials. */
export function agentWeakTopics(attempts: PracticeAttempt[]) {
  const groups = new Map<string, PracticeAttempt[]>();
  for (const row of attempts.filter(row => !row.deletedAt)) {
    const key = JSON.stringify([row.source, row.chapterKey]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap(rows => {
    const stats = practiceStats(rows), first = rows[0]!;
    if (stats.answered < 3 || (stats.accuracy ?? 1) >= .6) return [];
    const source = STUDY_SOURCES.find(item => item.id === first.source)?.title ?? first.source;
    const topic = topicsFor(first.source).find(([key]) => key === first.chapterKey)?.[1] ?? first.chapterKey;
    return [`${source}：${topic}（${stats.correct}/${stats.answered}）`.slice(0, 100)];
  }).slice(0, 20);
}
