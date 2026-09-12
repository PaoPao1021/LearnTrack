import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/database';
import { useTimer, elapsedSeconds } from '../../stores/timer';
import { formatClock, todayKey, TZ } from '../../utils';
import EntryModal from '../../components/common/EntryModal';
import { labelOf, useActivities } from '../../components/common/useActivities';
import { ActivityCombobox } from '../../components/common/ActivityCombobox';
import { toggleTodo, addQuickAction, removeQuickAction } from '../../services/commands';
import { computeStats, chapterProgress, quantityProgress, goalCompletion, formatDuration, mondayOf } from '@learntrack/domain';
import type { Category } from '@learntrack/domain';
import {
  Play, Pause, Square, Plus, Timer as TimerIcon, ListTodo, Route,
  Target, CalendarDays, Flame, Clock3, ChevronRight,
} from 'lucide-react';

function TimerCard() {
  const timer = useTimer();
  const activities = useActivities();
  const [countdownMin, setCountdownMin] = useState<number | ''>('');
  const elapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;
  const overtime = timer.countdownTargetSeconds ? Math.max(0, elapsed - timer.countdownTargetSeconds) : 0;
  const [pickActivity, setPickActivity] = useState('');
  const target = activities.find((a) => a.activity.id === pickActivity);

  if (timer.status === 'idle') {
    return (
      <section className="card rise p-6 md:p-8">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <div className="label">Focus Session</div>
            <h2 className="display text-2xl md:text-3xl">开始计时</h2>
          </div>
          <TimerIcon size={28} strokeWidth={1.4} className="opacity-30" />
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="min-w-52 flex-1">
            <select className="input h-full" value={pickActivity} onChange={(e) => setPickActivity(e.target.value)} aria-label="选择学习活动">
              <option value="">选择学习活动…</option>
              {activities.map((a) => (
                <option key={a.activity.id} value={a.activity.id}>{labelOf(a)} · {a.activity.name}</option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <input
              type="number" min={1} placeholder="倒计时(分)" className="input h-full"
              value={countdownMin}
              onChange={(e) => setCountdownMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!pickActivity}
            onClick={() => timer.start(pickActivity, '', countdownMin === '' ? null : (countdownMin as number) * 60)}
          >
            <Play size={15} /> 开始
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed opacity-50">
          支持正计时与可选倒计时；倒计时到点只提醒，不会自动停止，停止时保存全部实际时长。
        </p>
      </section>
    );
  }

  return (
    <section className="card rise p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="tick-text font-semibold" style={{ color: 'var(--accent)', fontSize: '3rem', lineHeight: 1 }}>
            {formatClock(elapsed)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs opacity-70">
            <span className={`mono ${timer.status === 'running' ? 'pulse-ring rounded-full px-2 py-0.5' : 'rounded-full px-2 py-0.5'}`} style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              {timer.status === 'paused' ? 'PAUSED' : 'RUNNING'}
            </span>
            {timer.countdownTargetSeconds ? <span className="tick-text">目标 {formatClock(timer.countdownTargetSeconds)}</span> : null}
            {overtime > 0 && <span className="tick-text font-semibold text-amber-500">超时 {formatClock(overtime)}</span>}
            {elapsed > 12 * 3600 && <span className="mono font-semibold text-red-500">超过 12 小时 · 请核对</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {timer.status === 'running'
            ? <button className="btn-ghost" onClick={timer.pause}><Pause size={15} /> 暂停</button>
            : <button className="btn-ghost" onClick={timer.resume}><Play size={15} /> 继续</button>}
          <button className="btn-primary" onClick={() => void timer.stop()}><Square size={14} /> 结束并保存</button>
        </div>
      </div>
      {target && (
        <div className="mt-4 border-t pt-3 text-xs opacity-60 hairline">
          {labelOf(target)} · {target.activity.name}
        </div>
      )}
    </section>
  );
}

function QuickActions({ onOpenEntry }: { onOpenEntry: (activityId: string) => void }) {
  const quickActions = useLiveQuery(() => db.quickActions.filter((q) => !q.hidden).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  const activities = useActivities();

  return (
    <section className="card rise rise-1 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="label">Quick Capture</div>
          <h2 className="display text-xl">快捷记录</h2>
        </div>
        <div className="w-56">
          <ActivityCombobox
            value=""
            placeholder="搜索并添加快捷项…"
            ariaLabel="添加快捷项"
            onChange={(id) => {
              if (!id) return;
              const opt = activities.find((a) => a.activity.id === id);
              if (opt) void addQuickAction(id, labelOf(opt));
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                <ChevronRight size={14} className="ml-auto opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
              <button
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border text-[var(--ink)] opacity-80 transition-transform hover:rotate-90 hairline group-hover:flex"
                style={{ background: 'var(--paper)' }}
                onClick={() => void removeQuickAction(qa.id)}
                aria-label="移除快捷项"
              >
                <Plus size={11} className="rotate-45" />
              </button>
            </div>
          );
        })}
        {(quickActions ?? []).length === 0 && (
          <div className="col-span-full text-sm opacity-50">
            还没有快捷项，从右上角添加常用活动（如“高数·习题”）。
          </div>
        )}
      </div>
    </section>
  );
}

function TodayTodos() {
  const todos = useLiveQuery(() => db.todos.filter((t) => !t.deletedAt).toArray(), [], []);
  const today = todayKey();
  const todays = (todos ?? []).filter((t) => !t.done && t.scheduledDate && t.scheduledDate <= today);
  const doneToday = (todos ?? []).filter((t) => t.done && t.scheduledDate === today);
  const overdue = (todos ?? []).filter((t) => !t.done && t.dueDate && t.dueDate < today);

  return (
    <section className="card rise rise-2 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">Agenda</div>
          <h2 className="display text-xl">今日待办</h2>
        </div>
        <ListTodo size={20} strokeWidth={1.6} className="opacity-30" />
      </div>
      {todays.length === 0 && doneToday.length === 0 && (
        <p className="text-sm opacity-50">今天没有安排待办。可在“学习”页添加。</p>
      )}
      <ul className="space-y-2.5">
        {overdue.length > 0 && (
          <li className="mono text-[10px] font-semibold text-red-500">逾期未完成 {overdue.length} 项</li>
        )}
        {[...overdue, ...todays].map((t) => (
          <li key={t.id} className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={false}
              onChange={() => void toggleTodo(t)}
              aria-label={`完成 ${t.title}`}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className={t.dueDate && t.dueDate < today ? 'text-red-500' : ''}>{t.title}</span>
            {t.dueDate && <span className="tick-text ml-auto text-[10px] opacity-40">{t.dueDate}</span>}
          </li>
        ))}
        {doneToday.map((t) => (
          <li key={t.id} className="flex items-center gap-2.5 text-sm opacity-40 line-through">
            <input type="checkbox" checked readOnly className="h-4 w-4 accent-[var(--accent)]" />
            {t.title}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoalsProgress({ todaySeconds, weekSeconds }: { todaySeconds: number; weekSeconds: number }) {
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt && g.active).toArray(), [], []);
  if ((goals ?? []).length === 0) return null;
  return (
    <section className="card rise rise-3 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">Goals</div>
          <h2 className="display text-xl">目标完成度</h2>
        </div>
        <Target size={20} strokeWidth={1.6} className="opacity-30" />
      </div>
      <div className="space-y-4">
        {(goals ?? []).map((g) => {
          const actual = g.period === 'daily' ? todaySeconds : weekSeconds;
          const c = goalCompletion(actual, g.targetSeconds);
          const label = g.period === 'daily' ? '每日' : '每周';
          return (
            <div key={g.id}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">{label}{g.scope === 'subject' ? ' · 科目目标' : ' · 全部学习'}</span>
                <span className="tick-text text-xs opacity-60">
                  {formatDuration(actual)} / {formatDuration(g.targetSeconds)}（{Math.round(c.ratio * 100)}%）
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
  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);
  const items = useLiveQuery(() => db.pathItems.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  if ((paths ?? []).length === 0) {
    return (
      <section className="card rise rise-3 p-6">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <div className="label">Routes</div>
            <h2 className="display text-xl">学习路线</h2>
          </div>
          <Route size={20} strokeWidth={1.6} className="opacity-30" />
        </div>
        <p className="text-sm leading-relaxed opacity-50">
          还没有学习路线。在<Link className="underline underline-offset-4" style={{ color: 'var(--accent)' }} to="/learning">学习</Link>页添加章节清单或数量目标后，这里会显示进度。
        </p>
      </section>
    );
  }
  return (
    <section className="card rise rise-3 p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="label">Routes</div>
          <h2 className="display text-xl">学习路线进度</h2>
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
            text = `${q.done}/${q.total} ${p.unit ?? ''}`;
            if (q.exceedsTarget) text += '（已超出目标，可在学习页调整总量）';
          } else {
            const cp = chapterProgress(p, (items ?? []).filter((i) => i.pathId === p.id));
            ratio = cp.ratio;
            text = `${cp.done}/${cp.total} 章节`;
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

function clockOf(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function Dashboard() {
  const timer = useTimer();
  const [entryModal, setEntryModal] = useState<{ open: boolean; activityId?: string }>({ open: false });

  const today = todayKey();
  const weekStart = mondayOf(today);
  const entries = useLiveQuery(() => db.entries.filter((e) => !e.deletedAt).toArray(), [], []);
  const runningElapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;

  const stats = computeStats(entries ?? [], [], weekStart, today, { timeZone: TZ });
  const todaySeconds = stats.byDay.find((d) => d.date === today)?.seconds ?? 0;
  const weekSeconds = stats.totalSeconds;

  return (
    <div className="space-y-5">
      <header className="rise mb-2 flex items-center justify-between">
        <h1 className="display text-xl">总览</h1>
        <div className="tick-text text-xs opacity-60">{today}</div>
      </header>

      <TimerCard />
      <QuickActions onOpenEntry={(activityId) => setEntryModal({ open: true, activityId })} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card rise rise-2 p-6">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <div className="label">Logged</div>
              <h2 className="display text-xl">今日与本周</h2>
            </div>
            <div className="flex gap-4 opacity-25">
              <CalendarDays size={20} strokeWidth={1.6} />
              <Flame size={20} strokeWidth={1.6} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="tick-text text-3xl font-semibold tracking-tight">{clockOf(todaySeconds)}</div>
              <div className="mt-1 text-xs opacity-50">
                今日已记录{runningElapsed > 0 ? `（另有计时中 ${formatClock(runningElapsed)}）` : ''}
              </div>
            </div>
            <div>
              <div className="tick-text text-3xl font-semibold tracking-tight opacity-60">{clockOf(weekSeconds)}</div>
              <div className="mt-1 flex items-center gap-1 text-xs opacity-50"><Clock3 size={12} /> 本周（周一起）</div>
            </div>
          </div>
          <div className="mt-6">
            <button className="btn-ghost" onClick={() => setEntryModal({ open: true })}>
              <Plus size={15} /> 补录 / 填时间段
            </button>
          </div>
        </section>
        <TodayTodos />
      </div>

      <GoalsProgress todaySeconds={todaySeconds} weekSeconds={weekSeconds} />
      <PathProgress />

      <EntryModal
        open={entryModal.open}
        initialActivityId={entryModal.activityId}
        onClose={() => setEntryModal({ open: false })}
      />
    </div>
  );
}
