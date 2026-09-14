import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/database';
import { useTimer, elapsedSeconds } from '../../stores/timer';
import { formatClock, todayKey, minuteOfDay, TZ } from '../../utils';
import { useI18n } from '../../i18n';
import EntryModal from '../../components/common/EntryModal';
import { labelOf, useActivities } from '../../components/common/useActivities';
import { ActivityCombobox } from '../../components/common/ActivityCombobox';
import { toggleTodo, addQuickAction, removeQuickAction } from '../../services/commands';
import { computeStats, chapterProgress, quantityProgress, goalCompletion, mondayOf, entrySecondsByLocalDay } from '@learntrack/domain';
import type { Category, EntryRecord } from '@learntrack/domain';
import {
  Play, Pause, Square, Plus, Timer as TimerIcon, ListTodo, Route,
  Target, CalendarDays, Flame, Clock3, ChevronRight, Maximize2, Sparkles, Check,
} from 'lucide-react';
import { ZenModeModal } from '../../components/common/ZenModeModal';
import { EmptyState } from '../../components/common/EmptyState';
import { ChronoRing } from '../../components/common/ChronoRing';
import { CelebrationModal } from '../../components/common/CelebrationModal';
import { DatePickerCapsule } from '../../components/common/DatePickerCapsule';
import { InteractiveDurationCards } from './InteractiveDurationCards';
import { soundscape } from '../../services/soundscape';
import { showToast } from '../../components/common/Toast';

const TIMER_PRESETS = [
  { labelKey: 'timer.presetCountUp', val: '' },
  { labelKey: 'timer.preset15', val: 15 },
  { labelKey: 'timer.presetPomodoro', val: 25 },
  { labelKey: 'timer.presetDeep', val: 45 },
  { labelKey: 'timer.presetSprint', val: 60 },
  { labelKey: 'timer.presetExam', val: 90 },
] as const;

function TimerCard({ onFinishSession }: { onFinishSession?: (name: string, color: string, duration: number) => void }) {
  const { t } = useI18n();
  const timer = useTimer();
  const activities = useActivities();
  const [countdownMin, setCountdownMin] = useState<number | ''>('');
  const [zenOpen, setZenOpen] = useState(false);
  const [autoZen, setAutoZen] = useState(() => {
    try {
      const saved = localStorage.getItem('learntrack_auto_zen');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const elapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;
  const overtime = timer.countdownTargetSeconds ? Math.max(0, elapsed - timer.countdownTargetSeconds) : 0;
  const [pickActivity, setPickActivity] = useState('');
  const activeActivityId = timer.status !== 'idle' ? (timer.activityId ?? '') : pickActivity;
  const target = activities.find((a) => a.activity.id === activeActivityId);

  const handleStartTimer = () => {
    soundscape.playPop();
    timer.start(pickActivity, '', countdownMin === '' ? null : Math.round((countdownMin as number) * 60));
    showToast('专注计时已启动 · 沉浸心流吧', 'info');
    if (autoZen) {
      setZenOpen(true);
      try {
        if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  };

  const handleFinish = async () => {
    const actName = target ? `${labelOf(target)} · ${target.activity.name}` : (timer.label || '专注');
    const actColor = target?.subject.color ?? 'var(--accent)';
    const dur = elapsed;
    soundscape.playSuccess();
    await timer.stop();
    if (dur >= 10 && onFinishSession) {
      onFinishSession(actName, actColor, dur);
    }
  };

  if (timer.status === 'idle') {
    return (
      <>
        <section className="card card-hero rise p-6 md:p-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <div className="label">{t('label.focus')}</div>
              <h2 className="display text-2xl md:text-3xl font-bold tracking-tight">{t('timer.startTitle')}</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shadow-xs">
              <TimerIcon size={22} strokeWidth={1.8} />
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="min-w-52 flex-1">
              <select className="input h-full" value={pickActivity} onChange={(e) => setPickActivity(e.target.value)} aria-label={t('timer.activityLabel')}>
                <option value="">{t('timer.pickPlaceholder')}</option>
                {activities.map((a) => (
                  <option key={a.activity.id} value={a.activity.id}>{labelOf(a)} · {a.activity.name}</option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <input
                type="number" min={1} placeholder={t('timer.countdownPlaceholder')} className="input h-full" aria-label={t('timer.countdownLabel')}
                value={countdownMin}
                onChange={(e) => setCountdownMin(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <button
              className="btn-primary"
              disabled={!pickActivity || (countdownMin !== '' && (!Number.isFinite(countdownMin) || countdownMin <= 0))}
              onClick={handleStartTimer}
            >
              <Play size={15} /> {t('timer.start')}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {TIMER_PRESETS.map((p) => {
              const isActive = countdownMin === p.val;
              return (
                <button
                  key={p.labelKey}
                  type="button"
                  className={`preset-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    soundscape.playTick();
                    setCountdownMin(p.val);
                  }}
                >
                  {t(p.labelKey)}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[var(--text-secondary)] hover:text-[var(--ink)] transition-colors">
              <input
                type="checkbox"
                checked={autoZen}
                onChange={(e) => {
                  setAutoZen(e.target.checked);
                  try {
                    localStorage.setItem('learntrack_auto_zen', String(e.target.checked));
                  } catch {}
                }}
                className="h-3.5 w-3.5 accent-[var(--accent)] rounded cursor-pointer"
              />
              <Sparkles size={13} className="text-[var(--accent)]" />
              <span>开始专注时自动全屏 (禅模式)</span>
            </label>
            <p className="leading-relaxed">{t('timer.hint')}</p>
          </div>
        </section>

        <ZenModeModal
          open={zenOpen && timer.status !== 'idle'}
          onClose={() => setZenOpen(false)}
          timer={timer}
          elapsed={elapsed}
          overtime={overtime}
          activityLabel={target ? `${labelOf(target)} · ${target.activity.name}` : timer.label}
          activityColor={target?.subject.color}
        />
      </>
    );
  }

  const targetSec = timer.countdownTargetSeconds;
  const progressRatio = targetSec ? Math.min(1, elapsed / targetSec) : 0;

  return (
    <>
      <section className={`card card-hero rise p-6 md:p-8 ${timer.status === 'running' ? 'is-running' : 'is-paused'}`}>
        <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8">
          <ChronoRing
            size={144}
            strokeWidth={7}
            progressRatio={progressRatio}
            isCountdown={Boolean(targetSec)}
            isRunning={timer.status === 'running'}
            isPaused={timer.status === 'paused'}
            isOvertime={overtime > 0}
            accentColor={target?.subject.color ?? 'var(--accent)'}
          >
            <div className="tick-text font-extrabold tracking-tight text-gradient-accent" style={{ fontSize: '1.75rem', lineHeight: 1.1 }}>
              {formatClock(elapsed)}
            </div>
            <div className="mono mt-1 text-[10px] font-semibold opacity-60">
              {timer.status === 'paused' ? t('timer.paused') : t('timer.running')}
            </div>
          </ChronoRing>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            {target && (
              <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white/60 px-3 py-1 text-xs font-medium backdrop-blur-sm dark:bg-white/[0.06]">
                <span className="h-2 w-2 rounded-full shadow-xs" style={{ background: target.subject.color }} />
                <span>{labelOf(target)} · {target.activity.name}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {targetSec ? (
                <span className="tick-text rounded-lg border border-[var(--border-soft)] bg-black/[0.02] px-2 py-0.5 font-medium dark:bg-white/[0.04]">
                  {t('timer.target', { time: formatClock(targetSec) })}
                </span>
              ) : null}
              {overtime > 0 && (
                <span className="tick-text rounded-lg bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-500">
                  {t('timer.overtime', { time: formatClock(overtime) })}
                </span>
              )}
              {elapsed > 12 * 3600 && <span className="mono font-semibold" style={{ color: 'var(--danger)' }}>{t('timer.over12h')}</span>}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZenOpen(true)}
                title={t('zen.enter')}
              >
                <Maximize2 size={15} />
                <span className="hidden sm:inline">{t('zen.enter')}</span>
              </button>
              {timer.status === 'running'
                ? <button className="btn-ghost" onClick={() => { soundscape.playTick(); timer.pause(); }}><Pause size={15} /> {t('timer.pause')}</button>
                : <button className="btn-ghost" onClick={() => { soundscape.playTick(); timer.resume(); }}><Play size={15} /> {t('timer.resume')}</button>}
              <button className="btn-primary shadow-md" disabled={timer.stopping} onClick={() => void handleFinish()}>
                <Square size={14} /> {t('timer.finish')}
              </button>
            </div>
          </div>
        </div>

        {targetSec ? (
          <div className="mt-6">
            <div className="liquid-progress-track">
              <div
                className="liquid-progress-bar"
                style={{
                  width: `${progressRatio * 100}%`,
                  background: overtime > 0
                    ? 'linear-gradient(90deg, var(--warning), color-mix(in srgb, var(--danger) 80%, white 20%))'
                    : undefined,
                }}
              />
            </div>
          </div>
        ) : null}

        {(target || timer.label) && (
          <div className="mt-4 border-t pt-3 text-xs opacity-60 hairline">
            {target ? `${labelOf(target)} · ${target.activity.name}` : timer.label}
          </div>
        )}
      </section>

      <ZenModeModal
        open={zenOpen}
        onClose={() => setZenOpen(false)}
        timer={timer}
        elapsed={elapsed}
        overtime={overtime}
        activityLabel={target ? `${labelOf(target)} · ${target.activity.name}` : timer.label}
        activityColor={target?.subject.color}
      />
    </>
  );
}

function QuickActions({ onOpenEntry }: { onOpenEntry: (activityId: string) => void }) {
  const { t } = useI18n();
  const quickActions = useLiveQuery(() => db.quickActions.filter((q) => !q.hidden).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  const activities = useActivities();

  return (
    <section className="card rise rise-1 p-6 relative z-20">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between relative z-30">
        <div>
          <div className="label">{t('label.quickCapture')}</div>
          <h2 className="display text-xl">{t('qa.title')}</h2>
        </div>
        <div className="w-full sm:w-64">
          <ActivityCombobox
            value=""
            placeholder={t('qa.searchPlaceholder')}
            ariaLabel={t('qa.addLabel')}
            onChange={(id) => {
              if (!id) return;
              const opt = activities.find((a) => a.activity.id === id);
              if (opt) void addQuickAction(id, labelOf(opt));
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 relative z-10">
        {(quickActions ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((qa) => {
          const activity = byId.get(qa.activityId);
          return (
            <div key={qa.id} className="group relative">
              <button
                className="btn-ghost w-full justify-start"
                onClick={() => onOpenEntry(qa.activityId)}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: activity?.color ?? '#999' }} />
                <span className="truncate">{qa.label}</span>
                <ChevronRight size={14} className="ml-auto shrink-0 opacity-30 transition-opacity group-hover:opacity-70" />
              </button>
              {/* 移除按钮常显：不依赖 hover，键盘与触屏均可发现 */}
              <button
                className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border opacity-70 transition-transform hover:rotate-90 focus-visible:opacity-100 hairline"
                style={{ background: 'var(--surface-elevated)' }}
                onClick={() => void removeQuickAction(qa.id)}
                aria-label={t('qa.remove', { label: qa.label })}
              >
                <Plus size={11} className="rotate-45" />
              </button>
            </div>
          );
        })}
        {(quickActions ?? []).length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={<Plus size={18} />}
              title={t('empty.noQuickActions')}
              description={t('qa.empty')}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function TodayTodos({ targetDate }: { targetDate?: string }) {
  const { t } = useI18n();
  const todos = useLiveQuery(() => db.todos.filter((td) => !td.deletedAt).toArray(), [], []);
  const today = targetDate ?? todayKey();
  const overdue = (todos ?? []).filter((td) => !td.done && td.dueDate && td.dueDate < today);
  const overdueIds = new Set(overdue.map((td) => td.id));
  const todays = (todos ?? []).filter((td) => !td.done && td.scheduledDate && td.scheduledDate <= today && !overdueIds.has(td.id));
  const doneToday = (todos ?? []).filter((td) => td.done && td.scheduledDate === today);

  return (
    <section className="card rise rise-2 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">{t('label.agenda')}</div>
          <h2 className="display text-xl">{t('todos.title')}</h2>
        </div>
        <ListTodo size={20} strokeWidth={1.6} className="opacity-30" />
      </div>
      {todays.length === 0 && doneToday.length === 0 && (
        <EmptyState
          icon={<ListTodo size={18} />}
          title={t('empty.noTodos')}
          description={t('todos.empty')}
          action={{
            label: t('nav.learning'),
            to: '/learning',
          }}
        />
      )}
      <ul className="space-y-2">
        {overdue.length > 0 && (
          <li className="mono text-[10px] font-semibold text-red-500 py-0.5">{t('todos.overdue', { count: overdue.length })}</li>
        )}
        {[...overdue, ...todays].map((td) => (
          <li
            key={td.id}
            className="group flex items-center justify-between gap-3 rounded-xl p-2 transition-all duration-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  soundscape.playPop();
                  void toggleTodo(td);
                  showToast(`已完成待办：${td.title}`, 'success');
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-white/70 shadow-xs transition-all duration-200 hover:scale-110 hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 active:scale-90 dark:bg-white/[0.06]"
                title="标记为完成"
              />
              <span className={`text-sm truncate ${td.dueDate && td.dueDate < today ? 'font-medium text-red-500' : 'text-[var(--ink)]'}`}>
                {td.title}
              </span>
            </div>
            {td.dueDate && (
              <span className="tick-text shrink-0 text-[10px] text-[var(--text-tertiary)] opacity-60">
                {td.dueDate}
              </span>
            )}
          </li>
        ))}
        {doneToday.map((td) => (
          <li
            key={td.id}
            className="group flex items-center justify-between gap-3 rounded-xl p-2 opacity-50 transition-all duration-200 hover:opacity-80"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  soundscape.playTick();
                  void toggleTodo(td);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white shadow-xs transition-all duration-200 hover:scale-110 active:scale-90"
                title="撤销完成状态"
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <span className="text-sm line-through text-[var(--text-tertiary)] truncate">
                {td.title}
              </span>
            </div>
            <span className="text-[10px] text-emerald-500 font-medium">已完成</span>
          </li>
        ))}
      </ul>

      {todays.length === 0 && doneToday.length > 0 && (
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-50/50 p-3 text-xs text-emerald-800 backdrop-blur-xs dark:bg-emerald-950/20 dark:text-emerald-300 animate-[panel-in_0.3s_var(--ease-spring)_both]">
          <Sparkles size={15} className="text-emerald-500 shrink-0" />
          <span>今日待办已全部清空！专注极佳，继续保持！</span>
        </div>
      )}
    </section>
  );
}

function GoalsProgress({ todaySeconds, weekSeconds }: { todaySeconds: number; weekSeconds: number }) {
  const { t, fmtDuration } = useI18n();
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt && g.active).toArray(), [], []);
  const entries = useLiveQuery(() => db.entries.filter((e) => !e.deletedAt).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const today = todayKey();
  const weekStart = mondayOf(today);
  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const actualFor = useMemo(() => {
    const cache = new Map<string, number>();
    return (subjectId: string, period: 'daily' | 'weekly') => {
      const key = `${subjectId}:${period}`;
      if (cache.has(key)) return cache.get(key)!;
      const matching = (entries ?? []).filter((entry) => {
        const activity = byId.get(entry.activityId);
        return activity?.parentId === subjectId;
      });
      const val = computeStats(matching, [], period === 'daily' ? today : weekStart, today, { timeZone: TZ }).totalSeconds;
      cache.set(key, val);
      return val;
    };
  }, [entries, byId, today, weekStart]);
  if ((goals ?? []).length === 0) return null;
  return (
    <section className="card rise rise-3 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">{t('label.goals')}</div>
          <h2 className="display text-xl">{t('goals.title')}</h2>
        </div>
        <Target size={20} strokeWidth={1.6} className="opacity-30" />
      </div>
      <div className="space-y-4">
        {(goals ?? []).map((g) => {
          const actual = g.scope === 'subject' && g.subjectId
            ? actualFor(g.subjectId, g.period)
            : g.period === 'daily' ? todaySeconds : weekSeconds;
          const c = goalCompletion(actual, g.targetSeconds);
          const label = g.period === 'daily' ? t('goals.daily') : t('goals.weekly');
          return (
            <div key={g.id}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">{label}{g.scope === 'subject' ? t('goals.subjectSuffix') : t('goals.allSuffix')}</span>
                <span className="tick-text text-xs opacity-60">
                  {fmtDuration(actual)} / {fmtDuration(g.targetSeconds)}（{Math.round(c.ratio * 100)}%）
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `${Math.min(100, c.ratio * 100)}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PathProgress() {
  const { t } = useI18n();
  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);
  const items = useLiveQuery(() => db.pathItems.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  if ((paths ?? []).length === 0) {
    return (
      <section className="card rise rise-3 p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="label">{t('label.routes')}</div>
            <h2 className="display text-xl">{t('paths.title')}</h2>
          </div>
          <Route size={20} strokeWidth={1.6} className="opacity-30" />
        </div>
        <EmptyState
          icon={<Route size={18} />}
          title={t('empty.noPaths')}
          description={t('paths.empty')}
          action={{
            label: t('empty.createFirstPath'),
            to: '/learning',
          }}
        />
      </section>
    );
  }
  return (
    <section className="card rise rise-3 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">{t('label.routes')}</div>
          <h2 className="display text-xl">{t('paths.progressTitle')}</h2>
        </div>
        <Route size={20} strokeWidth={1.6} className="opacity-30" />
      </div>
      <div className="space-y-4">
        {(paths ?? []).map((p) => {
          const subject = p.subjectId ? byId.get(p.subjectId) : null;
          let ratio = 0;
          let text = '';
          if (p.mode === 'quantity') {
            const q = quantityProgress(p);
            ratio = q.ratio;
            text = t('paths.quantityText', { done: q.done, total: q.total, unit: p.unit ?? '' });
            if (q.exceedsTarget) text += t('paths.exceeds');
          } else {
            const cp = chapterProgress(p, (items ?? []).filter((i) => i.pathId === p.id));
            ratio = cp.ratio;
            text = t('paths.chaptersText', { done: cp.done, total: cp.total });
          }
          return (
            <div key={p.id}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">{p.name}{subject ? <span className="opacity-50"> · {subject.name}</span> : null}</span>
                <span className="tick-text text-xs opacity-60">{text}（{Math.round(ratio * 100)}%）</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `${ratio * 100}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RhythmStreakCapsule({
  stats,
  entries,
  today,
}: {
  stats: { byDay: { date: string; seconds: number }[] };
  entries: EntryRecord[];
  today: string;
}) {
  const weekStart = mondayOf(today);
  const weekDates = useMemo(() => {
    const dates: string[] = [];
    const parts = weekStart.split('-').map(Number);
    const y = parts[0] ?? 2026;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      dates.push(dt.toISOString().slice(0, 10));
    }
    return dates;
  }, [weekStart]);

  const streak = useMemo(() => {
    const days = new Set(
      entries
        .filter((e) => !e.deletedAt)
        .flatMap((e) => Object.keys(entrySecondsByLocalDay(e))),
    );
    if (days.size === 0) return 0;
    let count = 0;
    const probe = new Date(`${today}T00:00:00Z`);
    if (!days.has(probe.toISOString().slice(0, 10))) probe.setUTCDate(probe.getUTCDate() - 1);
    while (days.has(probe.toISOString().slice(0, 10)) && count < 999) {
      count += 1;
      probe.setUTCDate(probe.getUTCDate() - 1);
    }
    return count;
  }, [entries, today]);

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-white/50 px-3 py-1.5 backdrop-blur-md dark:bg-white/[0.04]">
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border-soft)]">
        <span className="text-amber-500 animate-pulse">🔥</span>
        <span className="tick-text text-xs font-bold text-[var(--ink)]">
          {streak}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">天连胜</span>
      </div>

      <div className="flex items-center gap-1.5">
        {weekDates.map((d, i) => {
          const isToday = d === today;
          const daySec = stats.byDay.find((b) => b.date === d)?.seconds ?? 0;
          const isDone = daySec > 0;
          const isFuture = d > today;

          return (
            <div
              key={d}
              className="flex flex-col items-center"
              title={`${d}: ${Math.round(daySec / 60)} 分钟`}
            >
              <div
                className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[9px] sm:text-[10px] font-semibold transition-all ${
                  isDone
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : isToday
                    ? 'border-2 border-[var(--accent)] text-[var(--accent)] animate-pulse'
                    : isFuture
                    ? 'border border-dashed border-[var(--border-soft)] text-[var(--text-tertiary)] opacity-50'
                    : 'bg-black/[0.04] text-[var(--text-tertiary)] dark:bg-white/[0.06]'
                }`}
                style={isDone ? { boxShadow: '0 2px 6px color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
              >
                {dayLabels[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodayTimelineStream({
  entries,
  categories,
  today,
}: {
  entries: EntryRecord[];
  categories: Category[];
  today: string;
}) {
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const todayEntries = useMemo(
    () => (entries ?? []).filter((e) => !e.deletedAt && e.learningDate === today),
    [entries, today],
  );

  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const needlePos = Math.min(100, (currentMinute / 1440) * 100);

  return (
    <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="mono text-[10px] font-semibold tracking-wider text-[var(--text-tertiary)]">24H TIMELINE · 今日时光流</span>
        <span className="tick-text text-[11px] font-medium text-[var(--text-secondary)]">
          {todayEntries.length} 次专注记录
        </span>
      </div>
      <div className="relative h-6 w-full rounded-xl border border-[var(--border-soft)] bg-black/[0.03] p-0.5 backdrop-blur-xs dark:bg-white/[0.04] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex justify-between px-2 text-[8px] font-semibold opacity-25 select-none items-center">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>

        {todayEntries.map((e) => {
          const act = byId.get(e.activityId);
          const color = act?.color ?? 'var(--accent)';
          let leftPercent = 0;
          let widthPercent = 0;
          let tooltip = act?.name ?? '学习';

          if (e.startedAt && e.endedAt) {
            const s = new Date(e.startedAt);
            const en = new Date(e.endedAt);
            const sm = s.getHours() * 60 + s.getMinutes();
            const em = en.getHours() * 60 + en.getMinutes();
            leftPercent = (sm / 1440) * 100;
            widthPercent = Math.max(1, ((em - sm) / 1440) * 100);
            tooltip = `${minuteOfDay(s)} - ${minuteOfDay(en)} · ${act?.name ?? '专注'} (${Math.round(e.durationSeconds / 60)}m)`;
          } else {
            leftPercent = Math.max(0, Math.min(95, needlePos - 4));
            widthPercent = Math.max(1.5, (e.durationSeconds / 86400) * 100);
            tooltip = `${act?.name ?? '专注'} · ${Math.round(e.durationSeconds / 60)}m`;
          }

          return (
            <div
              key={e.id}
              className="absolute top-0.5 bottom-0.5 rounded-xs transition-transform hover:scale-y-125 hover:z-20 cursor-pointer"
              style={{
                left: `${leftPercent}%`,
                width: `${Math.min(100 - leftPercent, widthPercent)}%`,
                background: color,
                boxShadow: `0 0 6px ${color}90`,
              }}
              title={tooltip}
            />
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)] z-10 pointer-events-none"
          style={{ left: `${needlePos}%` }}
          title={`当前时间 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
        />
      </div>
    </div>
  );
}


export default function Dashboard() {
  const { t } = useI18n();
  const timer = useTimer();
  const [entryModal, setEntryModal] = useState<{ open: boolean; activityId?: string }>({ open: false });
  const [celebration, setCelebration] = useState<{ open: boolean; name: string; color: string; duration: number } | null>(null);

  const actualToday = todayKey();
  const [selectedDate, setSelectedDate] = useState(actualToday);
  const isViewingToday = selectedDate === actualToday;
  const weekStart = mondayOf(selectedDate);
  const entries = useLiveQuery(() => db.entries.filter((e) => !e.deletedAt).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const runningElapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;

  const stats = useMemo(
    () => computeStats(entries ?? [], [], weekStart, selectedDate, { timeZone: TZ }),
    [entries, weekStart, selectedDate],
  );
  const selectedDateSeconds = stats.byDay.find((d) => d.date === selectedDate)?.seconds ?? 0;
  const weekSeconds = stats.totalSeconds;

  const currentHour = new Date().getHours();
  const greeting = useMemo(() => {
    if (!isViewingToday) {
      return `时光复盘 · ${selectedDate}`;
    }
    if (currentHour >= 5 && currentHour < 12) return '晨光正好 · 开启专注';
    if (currentHour >= 12 && currentHour < 18) return '午后时光 · 保持节奏';
    if (currentHour >= 18 && currentHour < 22) return '晚风轻拂 · 复盘沉淀';
    return '静谧深夜 · 沉浸心流';
  }, [currentHour, isViewingToday, selectedDate]);

  const activeCategory = useMemo(() => {
    if (!timer.activityId || !categories) return null;
    return categories.find((c) => c.id === timer.activityId) ?? null;
  }, [timer.activityId, categories]);

  return (
    <div
      className="space-y-5"
      style={{
        '--active-subject-color': timer.status !== 'idle' ? (activeCategory?.color ?? 'var(--accent)') : 'var(--accent)',
      } as React.CSSProperties}
    >
      <header className="rise mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isViewingToday ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`} />
            <span className="mono text-[11px] font-semibold tracking-wider text-[var(--accent)]">
              {greeting}
            </span>
          </div>
          <h1 className="display mt-0.5 text-2xl font-bold tracking-tight text-[var(--ink)]">
            {isViewingToday ? t('nav.overview') : `复盘概览 (${selectedDate})`}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <RhythmStreakCapsule stats={stats} entries={entries ?? []} today={actualToday} />
          <DatePickerCapsule
            selectedDate={selectedDate}
            actualToday={actualToday}
            onSelectDate={setSelectedDate}
          />
        </div>
      </header>

      <TimerCard
        onFinishSession={(name, color, duration) =>
          setCelebration({ open: true, name, color, duration })
        }
      />
      <div className="relative z-20">
        <QuickActions onOpenEntry={(activityId) => setEntryModal({ open: true, activityId })} />
      </div>

      <div className="relative z-10 grid gap-5 lg:grid-cols-2">
        <InteractiveDurationCards
          todaySeconds={selectedDateSeconds}
          weekSeconds={weekSeconds}
          runningElapsed={runningElapsed}
          onOpenAddEntry={() => setEntryModal({ open: true })}
          timelineSlot={
            <TodayTimelineStream entries={entries ?? []} categories={categories ?? []} today={selectedDate} />
          }
        />
        <TodayTodos targetDate={selectedDate} />
      </div>

      <GoalsProgress todaySeconds={selectedDateSeconds} weekSeconds={weekSeconds} />
      <PathProgress />

      <EntryModal
        open={entryModal.open}
        initialActivityId={entryModal.activityId}
        onClose={() => setEntryModal({ open: false })}
      />

      <CelebrationModal
        open={Boolean(celebration?.open)}
        activityName={celebration?.name ?? ''}
        activityColor={celebration?.color}
        durationSeconds={celebration?.duration ?? 0}
        todayTotalSeconds={selectedDateSeconds}
        onClose={() => setCelebration(null)}
      />
    </div>
  );
}
