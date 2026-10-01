import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPracticeDraft, writePracticeDraft, practiceDraftSeconds, type PracticeDraft } from './practiceDraft';

const draft: PracticeDraft = { question: 'A07', chapter: 'limits', date: '2026-09-30', result: 'incorrect', seconds: 127, note: '遗漏条件', startedAt: 10000 };
beforeEach(() => {
  const rows = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value), removeItem: (key: string) => rows.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe('practice draft recovery', () => {
  it('recovers every field and elapsed time after remounting', () => {
    expect(writePracticeDraft('source:normal', draft)).toBe(true);
    const restored = readPracticeDraft('source:normal', { ...draft, question: '' });
    expect(restored).toEqual(draft);
    expect(practiceDraftSeconds(restored, 22000)).toBe(139);
    expect(practiceDraftSeconds(restored, 9000)).toBe(127);
  });
  it('keeps another source or retry draft independent', () => {
    writePracticeDraft('math:normal', draft);
    writePracticeDraft('leetcode:retry-1', { ...draft, question: '70' });
    expect(readPracticeDraft('math:normal', draft).question).toBe('A07');
    expect(readPracticeDraft('leetcode:retry-1', draft).question).toBe('70');
  });
  it('clears a saved draft and rejects damaged storage without crashing', () => {
    writePracticeDraft('draft', draft);
    writePracticeDraft('draft', { ...draft, question: '', note: '', seconds: 0, startedAt: null });
    expect(sessionStorage.getItem('draft')).toBeNull();
    sessionStorage.setItem('draft', '{bad json');
    expect(readPracticeDraft('draft', draft)).toEqual(draft);
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(readPracticeDraft('draft', draft)).toEqual(draft);
    expect(writePracticeDraft('draft', draft)).toBe(false);
  });
});
