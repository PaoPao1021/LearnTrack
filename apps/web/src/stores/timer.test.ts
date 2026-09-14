import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { useTimer, syncFromStorage } from './timer';

describe('timer store', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    useTimer.setState({
      status: 'idle', activityId: null, label: '', startedAt: null,
      pauses: [], pausedAt: null, countdownTargetSeconds: null, stopping: false,
    });
  });

  it('persists only one entry when stop is called concurrently', async () => {
    useTimer.setState({
      status: 'running', activityId: crypto.randomUUID(), label: '习题',
      startedAt: Date.now() - 60_000, pauses: [], pausedAt: null, stopping: false,
    });

    const results = await Promise.all([useTimer.getState().stop(), useTimer.getState().stop()]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.entries.count()).toBe(1);
    expect(await db.pendingOps.count()).toBe(1);
    expect(useTimer.getState().status).toBe('idle');
    expect(useTimer.getState().stopping).toBe(false);
  });

  it('does not tick when idle, but ticks when running', () => {
    const baseline = 1000;
    useTimer.setState({ status: 'idle', lastTickAt: baseline });
    useTimer.getState().tick();
    expect(useTimer.getState().lastTickAt).toBe(baseline);

    useTimer.setState({ status: 'running', lastTickAt: baseline });
    useTimer.getState().tick();
    expect(useTimer.getState().lastTickAt).toBeGreaterThan(baseline);
  });

  it('synchronizes state when a storage event is received from another tab', () => {
    const activityId = crypto.randomUUID();
    syncFromStorage({
      status: 'running',
      activityId,
      label: '阅读',
      startedAt: 123456,
      pauses: [],
      pausedAt: null,
      countdownTargetSeconds: 1800,
    });

    expect(useTimer.getState().status).toBe('running');
    expect(useTimer.getState().activityId).toBe(activityId);
    expect(useTimer.getState().label).toBe('阅读');
    expect(useTimer.getState().countdownTargetSeconds).toBe(1800);
  });
});
