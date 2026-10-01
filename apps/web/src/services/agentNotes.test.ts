import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { agentWeakTopics, deleteAgentNote, listAgentNotes, saveAgentNote, type AgentNote } from './agentNotes';
import { exportFullBackup, restoreBackup } from './backup';
import type { PracticeAttempt } from '@learntrack/domain';
beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
const note: AgentNote = { id: '4eb5a685-7c99-424c-b767-6a6b2e295635', title: '本周总结', content: '积分边界核对', createdAt: '2026-10-01T08:00:00Z', origin: 'self' };
describe('saved learning summaries', () => {
  it('survives full backup restore without creating sync operations or duplicate run IDs', async () => {
    await saveAgentNote(note); await saveAgentNote(note);
    expect(await listAgentNotes()).toEqual([note]); expect(await db.pendingOps.count()).toBe(0);
    const { blob } = await exportFullBackup();
    await deleteAgentNote(note.id); expect(await listAgentNotes()).toEqual([]);
    await restoreBackup(await blob.text()); expect(await listAgentNotes()).toEqual([note]);
  });
  it('rejects empty or oversized notes and ignores invalid stored values', async () => {
    await expect(saveAgentNote({ ...note, content: ' ' })).rejects.toThrow();
    await expect(saveAgentNote({ ...note, content: 'x'.repeat(6001) })).rejects.toThrow();
    await db.settings.put({ key: 'agentNote:bad', value: { content: 'bad' } });
    expect(await listAgentNotes()).toEqual([]);
  });
  it('includes coding and custom topics while keeping source sample sizes separate', () => {
    const rows = (source: PracticeAttempt['source'], chapterKey: string, count: number): PracticeAttempt[] => Array.from({length: count}, (_, i) => ({ id: crypto.randomUUID(), source, chapterKey, questionKey: String(i), result: 'incorrect', durationSeconds: 60, learningDate: '2026-10-01', note: '', reviewDate: null, createdAt: note.createdAt, updatedAt: note.createdAt, deletedAt: null, version: 1 }));
    const topics = agentWeakTopics([...rows('leetcode', 'dp', 3), ...rows('other', '递推关系', 3), ...rows('other', 'limits', 2), ...rows('zhangyu-2027-math1-1000', 'limits', 2)]);
    expect(topics).toHaveLength(2); expect(topics[0]).toContain('动态规划'); expect(topics[1]).toContain('递推关系');
  });
});
