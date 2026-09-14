import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useI18n } from '../../i18n';
import { shiftDateKey } from '../../utils';
import { soundscape } from '../../services/soundscape';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarDays,
  X,
  Sparkles,
  Flame,
  RotateCcw,
} from 'lucide-react';
import type { Category } from '@learntrack/domain';

interface GlassCalendarModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD
  actualToday: string;   // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

function formatDurationCn(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0 && remM > 0) return `${h}小时${remM}分`;
  if (h > 0) return `${h}小时`;
  return `${remM}分钟`;
}

export function GlassCalendarModal({
  open,
  onClose,
  selectedDate,
  actualToday,
  onSelectDate,
}: GlassCalendarModalProps) {
  const { t, lang } = useI18n();
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = new Date(`${selectedDate || actualToday}T12:00:00`);
    return Number.isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d = new Date(`${selectedDate || actualToday}T12:00:00`);
    return Number.isNaN(d.getMonth()) ? new Date().getMonth() : d.getMonth();
  });

  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Synchronize view with selectedDate when opened
  useEffect(() => {
    if (open && selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (typeof y === 'number' && !Number.isNaN(y) && typeof m === 'number' && !Number.isNaN(m)) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [open, selectedDate]);

  // Keyboard navigation & ESC
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Query entries to provide activity indicators
  const entries = useLiveQuery(() => db.entries.filter((e) => !e.deletedAt).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);

  const catColorMap = useMemo(() => {
    return new Map((categories ?? []).map((c) => [c.id, c.color]));
  }, [categories]);

  // Aggregate stats by date
  const dateStatsMap = useMemo(() => {
    const map = new Map<string, { totalSeconds: number; count: number; colors: string[] }>();
    if (!entries) return map;

    for (const e of entries) {
      const d = e.learningDate;
      if (!d) continue;
      const existing = map.get(d) || { totalSeconds: 0, count: 0, colors: [] };
      existing.totalSeconds += e.durationSeconds;
      existing.count += 1;
      const col = catColorMap.get(e.activityId) || 'var(--accent)';
      if (!existing.colors.includes(col) && existing.colors.length < 3) {
        existing.colors.push(col);
      }
      map.set(d, existing);
    }
    return map;
  }, [entries, catColorMap]);

  if (!open) return null;

  // Generate 42 cells (6 weeks × 7 days) starting Monday
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const rawDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const startDayOffset = (rawDayOfWeek + 6) % 7; // Mon=0, Sun=6

  const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { dateKey: string; dayNum: number; isCurrentMonth: boolean }[] = [];

  // 1. Previous month trailing days
  for (let i = startDayOffset - 1; i >= 0; i--) {
    const dNum = daysInPrevMonth - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateKey = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    cells.push({ dateKey, dayNum: dNum, isCurrentMonth: false });
  }

  // 2. Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ dateKey, dayNum: d, isCurrentMonth: true });
  }

  // 3. Next month leading days (fill up to 42 cells)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateKey = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ dateKey, dayNum: d, isCurrentMonth: false });
  }

  const prevMonth = () => {
    soundscape.playTick();
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    soundscape.playTick();
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const prevYear = () => {
    soundscape.playTick();
    setViewYear((y) => y - 1);
  };

  const nextYear = () => {
    soundscape.playTick();
    setViewYear((y) => y + 1);
  };

  const jumpToToday = () => {
    soundscape.playPop();
    const [y, m] = actualToday.split('-').map(Number);
    if (typeof y === 'number' && !Number.isNaN(y) && typeof m === 'number' && !Number.isNaN(m)) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
    onSelectDate(actualToday);
    onClose();
  };

  const selectDate = (dateKey: string) => {
    soundscape.playPop();
    onSelectDate(dateKey);
    onClose();
  };

  const weekdays = lang === 'zh'
    ? ['一', '二', '三', '四', '五', '六', '日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthNamesZh = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonthLabel = lang === 'zh'
    ? `${viewYear}年 ${monthNamesZh[viewMonth]}`
    : `${monthNamesEn[viewMonth]} ${viewYear}`;

  const hoveredStats = hoveredDate ? dateStatsMap.get(hoveredDate) : null;
  const selectedStats = dateStatsMap.get(selectedDate);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="选择学习与复盘日期"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      {/* Calendar Card Modal */}
      <div
        className="relative w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xl transition-all select-none dark:border-slate-700/80 dark:bg-[#181e2a] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)] shadow-xs">
              <CalendarDays size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="mono text-[10px] font-extrabold tracking-wider text-[var(--accent)]">
                  LEARNTRACK · CALENDAR
                </span>
              </div>
              <h3 className="display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                {currentMonthLabel}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={jumpToToday}
              className="rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[var(--accent)] dark:hover:text-white"
              title="跳转至今天"
            >
              今天
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="关闭日历"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Navigation Bar: Year and Month fast toggles */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 mb-3.5 dark:border-slate-700/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevYear}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              title="上一年"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              title="上一月"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <span className="mono text-xs font-extrabold text-slate-800 dark:text-slate-100">
            {currentMonthLabel}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              title="下一月"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={nextYear}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
              title="下一年"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>

        {/* Weekday Grid */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {weekdays.map((w, idx) => (
            <div
              key={w}
              className={`mono text-[11px] font-bold py-1 ${
                idx >= 5 ? 'text-[var(--accent)] font-extrabold' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {cells.map(({ dateKey, dayNum, isCurrentMonth }) => {
            const isToday = dateKey === actualToday;
            const isSelected = dateKey === selectedDate;
            const stats = dateStatsMap.get(dateKey);
            const hasActivity = stats && stats.totalSeconds > 0;

            let stateClasses = 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80';
            if (isSelected) {
              stateClasses = 'bg-[var(--accent)] text-white shadow-md font-bold scale-105 z-10';
            } else if (isToday) {
              stateClasses = 'border-2 border-[var(--accent)] text-[var(--accent)] font-bold bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20';
            } else if (!isCurrentMonth) {
              stateClasses = 'text-slate-400/60 dark:text-slate-600 font-normal hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40';
            }

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => selectDate(dateKey)}
                onMouseEnter={() => setHoveredDate(dateKey)}
                onMouseLeave={() => setHoveredDate(null)}
                className={`group relative flex flex-col items-center justify-center h-10 rounded-2xl text-xs font-semibold transition-all duration-150 ${stateClasses}`}
                style={
                  isSelected
                    ? {
                        boxShadow: '0 4px 14px -2px color-mix(in srgb, var(--accent) 60%, transparent)',
                      }
                    : undefined
                }
              >
                {/* Date number */}
                <span className="tick-text text-[13px]">{dayNum}</span>

                {/* Activity indicator micro-dots */}
                {hasActivity ? (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {stats.colors.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : ''}`}
                        style={isSelected ? undefined : { background: c }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="h-1.5 w-1.5 mt-0.5" />
                )}

                {/* Today tiny pulsing green badge */}
                {isToday && !isSelected && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Dynamic Micro-Stats Bar (Hovered or Selected day insight) */}
        <div className="mt-4 rounded-2xl border border-slate-200/90 bg-slate-50 p-3 dark:border-slate-700/80 dark:bg-[#202737]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {hoveredDate || selectedDate}
              </span>
              {(hoveredDate || selectedDate) === actualToday ? (
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  今日
                </span>
              ) : (
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  复盘记录
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
              {(hoveredStats || selectedStats)?.totalSeconds ? (
                <>
                  <Flame size={13} className="text-amber-500" />
                  <span>
                    {formatDurationCn((hoveredStats || selectedStats)!.totalSeconds)} ·{' '}
                    {(hoveredStats || selectedStats)!.count} 次专注
                  </span>
                </>
              ) : (
                <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">暂无专注记录</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick presets footer (Non-overflowing grid) */}
        <div className="mt-4 pt-3 border-t border-slate-200/90 dark:border-slate-700/80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">快速跳转:</span>
            <div className="grid grid-cols-4 gap-1.5 flex-1">
              <button
                type="button"
                onClick={() => selectDate(actualToday)}
                className="rounded-xl border border-slate-200 bg-slate-100 py-1.5 px-1 text-center text-[11px] font-bold text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[var(--accent)] dark:hover:text-white"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => selectDate(shiftDateKey(actualToday, -1))}
                className="rounded-xl border border-slate-200 bg-slate-100 py-1.5 px-1 text-center text-[11px] font-bold text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[var(--accent)] dark:hover:text-white"
              >
                昨天
              </button>
              <button
                type="button"
                onClick={() => selectDate(shiftDateKey(actualToday, -2))}
                className="rounded-xl border border-slate-200 bg-slate-100 py-1.5 px-1 text-center text-[11px] font-bold text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[var(--accent)] dark:hover:text-white"
              >
                前天
              </button>
              <button
                type="button"
                onClick={() => selectDate(shiftDateKey(actualToday, -7))}
                className="rounded-xl border border-slate-200 bg-slate-100 py-1.5 px-1 text-center text-[11px] font-bold text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[var(--accent)] dark:hover:text-white"
              >
                一周前
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
