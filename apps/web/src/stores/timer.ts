import { create } from 'zustand';
import { db } from '../db/database';
import { enqueueOp, bumpVersion } from '../services/queue';
import { uuid, nowIso, TZ } from '../utils';
import type { EntryRecord } from '@learntrack/domain';
import { effectiveSecondsBetween } from '@learntrack/domain';
import { ensureDeviceId } from '../db/seed';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerState {
  status: TimerStatus;
  activityId: string | null;
  label: string;
  startedAt: number | null;
  /** closed pause intervals */
  pauses: { startAt: number; endAt: number }[];
  /** open pause start (paused state) */
  pausedAt: number | null;
  countdownTargetSeconds: number | null;
  lastTickAt: number;
  start: (activityId: string, label: string, countdownSeconds?: number | null) => void;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<EntryRecord | null>;
  switchActivity: (activityId: string, label: string) => Promise<void>;
  tick: () => void;
}

function persisted(s: TimerState) {
  return {
    status: s.status,
    activityId: s.activityId,
    label: s.label,
    startedAt: s.startedAt,
    pauses: s.pauses,
    pausedAt: s.pausedAt,
    countdownTargetSeconds: s.countdownTargetSeconds,
  };
}

const STORAGE_KEY = 'learntrack.timer';

function loadPersisted(): Partial<TimerState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersisted(s: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted(s)));
  } catch { /* storage full or blocked */ }
}

export function elapsedSeconds(s: Pick<TimerState, 'status' | 'startedAt' | 'pauses' | 'pausedAt'>): number {
  if (!s.startedAt) return 0;
  const now = Date.now();
  const end = s.status === 'paused' && s.pausedAt ? s.pausedAt : now;
  return effectiveSecondsBetween(s.startedAt, Math.max(end, s.startedAt), s.pauses);
}

const initial = loadPersisted();

export const useTimer = create<TimerState>((set, get) => ({
  status: (initial.status as TimerStatus) ?? 'idle',
  activityId: initial.activityId ?? null,
  label: initial.label ?? '',
  startedAt: initial.startedAt ?? null,
  pauses: initial.pauses ?? [],
  pausedAt: initial.pausedAt ?? null,
  countdownTargetSeconds: initial.countdownTargetSeconds ?? null,
  lastTickAt: Date.now(),

  start: (activityId, label, countdownSeconds = null) => {
    const s: TimerState = {
      ...get(),
      status: 'running',
      activityId,
      label,
      startedAt: Date.now(),
      pauses: [],
      pausedAt: null,
      countdownTargetSeconds: countdownSeconds,
      lastTickAt: Date.now(),
    };
    savePersisted(s);
    set(s);
  },

  pause: () => {
    const s = get();
    if (s.status !== 'running' || !s.startedAt) return;
    const next = { ...s, status: 'paused' as const, pausedAt: Date.now() };
    savePersisted(next);
    set(next);
  },

  resume: () => {
    const s = get();
    if (s.status !== 'paused' || !s.pausedAt) return;
    const next = {
      ...s,
      status: 'running' as const,
      pauses: [...s.pauses, { startAt: s.pausedAt, endAt: Date.now() }],
      pausedAt: null,
    };
    savePersisted(next);
    set(next);
  },

  stop: async () => {
    const s = get();
    if (!s.startedAt || !s.activityId) return null;
    const endedAt = s.status === 'paused' && s.pausedAt ? s.pausedAt : Date.now();
    const pauses = [...s.pauses];
    const duration = effectiveSecondsBetween(s.startedAt, endedAt, pauses);
    if (duration <= 0) {
      const cleared: TimerState = { ...s, status: 'idle', startedAt: null, pauses: [], pausedAt: null, activityId: null, label: '', countdownTargetSeconds: null };
      savePersisted(cleared);
      set(cleared);
      return null;
    }
    const deviceId = await ensureDeviceId();
    const entry: EntryRecord = {
      id: uuid(),
      deviceId,
      activityId: s.activityId,
      method: 'timer',
      learningDate: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(s.startedAt)),
      startedAt: s.startedAt,
      endedAt,
      timeZone: TZ,
      durationSeconds: duration,
      pauseIntervals: pauses,
      countdownTargetSeconds: s.countdownTargetSeconds,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      version: 1,
    };
    await db.transaction('rw', db.entries, db.pendingOps, async () => {
      await db.entries.add(entry);
      await enqueueOp('entry', entry.id, entry, null, null, deviceId);
    });
    const cleared: TimerState = { ...s, status: 'idle', startedAt: null, pauses: [], pausedAt: null, activityId: null, label: '', countdownTargetSeconds: null };
    savePersisted(cleared);
    set(cleared);
    return entry;
  },

  switchActivity: async (activityId, label) => {
    const s = get();
    if (s.status === 'idle' || !s.startedAt) {
      get().start(activityId, label);
      return;
    }
    await get().stop();
    get().start(activityId, label);
  },

  tick: () => set({ lastTickAt: Date.now() }),
}));
