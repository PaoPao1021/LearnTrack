import { z } from 'zod';

const DraftSchema = z.object({
  question: z.string().max(120), chapter: z.string().max(100), date: z.string().max(10),
  result: z.enum(['correct', 'incorrect', 'skipped']), seconds: z.number().int().min(0).max(86400),
  note: z.string().max(2000), startedAt: z.number().finite().nonnegative().nullable(),
});
export type PracticeDraft = z.infer<typeof DraftSchema>;

export function readPracticeDraft(key: string, fallback: PracticeDraft): PracticeDraft {
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
    return parsed.success ? parsed.data : fallback;
  } catch { return fallback; }
}

export function writePracticeDraft(key: string, draft: PracticeDraft): boolean {
  try {
    if (!draft.question && !draft.note && draft.seconds === 0 && draft.startedAt === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch { return false; }
}

export function practiceDraftSeconds(draft: Pick<PracticeDraft, 'seconds' | 'startedAt'>, now = Date.now()) {
  return Math.min(86400, draft.seconds + (draft.startedAt === null ? 0 : Math.max(0, Math.floor((now - draft.startedAt) / 1000))));
}
