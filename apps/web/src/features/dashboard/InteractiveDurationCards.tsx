import React, { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { averageDailySecondsForWeek } from '@learntrack/domain';
import { useI18n } from '../../i18n';
import { formatClock, todayKey } from '../../utils';

export type DurationUnitMode = 'zh' | 'compact' | 'decimal';
const STORAGE_KEY = 'learntrack_duration_display_mode';

export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const from = previous.current; previous.current = target;
    if (Math.abs(target - from) <= 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
    let frame: number; const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - progress, 4))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function Duration({ seconds, mode }: { seconds: number; mode: DurationUnitMode }) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600), minutes = Math.floor((rounded % 3600) / 60);
  return <div className="flex items-baseline gap-2 whitespace-nowrap tabular-nums">
    {mode === 'decimal' ? <><span className="text-3xl font-semibold">{(rounded / 3600).toFixed(2)}</span><span className="text-sm muted">小时</span></> : <>
      <span className="text-3xl font-semibold">{hours}</span><span className="text-sm muted">{mode === 'compact' ? 'h' : '小时'}</span>
      <span className="text-3xl font-semibold">{String(minutes).padStart(2, '0')}</span><span className="text-sm muted">{mode === 'compact' ? 'm' : '分'}</span>
    </>}
  </div>;
}

interface InteractiveDurationCardsProps {
  todaySeconds: number;
  weekSeconds: number;
  selectedDate: string;
  runningElapsed: number;
  onOpenAddEntry: () => void;
  timelineSlot?: React.ReactNode;
}

export function InteractiveDurationCards({ todaySeconds, weekSeconds, selectedDate, runningElapsed, onOpenAddEntry, timelineSlot }: InteractiveDurationCardsProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DurationUnitMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'compact' || saved === 'decimal' ? saved : 'zh';
  });
  const todayValue = useCountUp(todaySeconds), weekValue = useCountUp(weekSeconds);
  const share = weekSeconds > 0 ? Math.min(100, Math.round(todaySeconds / weekSeconds * 100)) : 0;
  const average = averageDailySecondsForWeek(weekSeconds, selectedDate);
  const dailyLabel = selectedDate === todayKey() ? t('logged.today') : `${selectedDate} 已记录`;
  return <section className="card p-6">
    <div className="section-heading mb-5"><h2 className="text-xl font-semibold">{t('logged.title')}</h2>
      <label className="field max-w-44">时间格式<select className="input" value={mode} onChange={(e) => { const value = e.target.value as DurationUnitMode; setMode(value); localStorage.setItem(STORAGE_KEY, value); }}><option value="zh">小时 / 分钟</option><option value="compact">h / m</option><option value="decimal">小数小时</option></select></label>
    </div>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="border border-[var(--border-soft)] rounded-lg p-4 min-w-0">
        <dt className="text-sm muted mb-3">{dailyLabel}</dt><dd><Duration seconds={todayValue} mode={mode}/></dd>
        {runningElapsed > 0 && <p className="muted text-xs mt-2">计时尚未保存：{formatClock(runningElapsed)}</p>}
        <div className="border-t border-[var(--border-soft)] mt-4 pt-3"><div className="flex justify-between text-xs muted mb-2"><span>当日占本周</span><span>{share}%</span></div><progress className="w-full h-1.5" max={100} value={share} aria-label="当日占本周已记录时长比例"/></div>
      </div>
      <div className="border border-[var(--border-soft)] rounded-lg p-4 min-w-0">
        <dt className="text-sm muted mb-3">本周（截至 {selectedDate}）</dt><dd><Duration seconds={weekValue} mode={mode}/></dd>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border-soft)] mt-4 pt-3 text-xs"><span className="muted">本周日均</span><span aria-label="本周日均时长">{mode === 'decimal' ? `${(average / 3600).toFixed(2)} 小时` : `${Math.floor(average / 3600)}小时 ${Math.floor(average % 3600 / 60)}分`}</span></div>
      </div>
    </dl>
    {timelineSlot}
    <button type="button" className="btn-ghost mt-5" onClick={onOpenAddEntry}><Plus size={15}/>{t('logged.add')}</button>
  </section>;
}
