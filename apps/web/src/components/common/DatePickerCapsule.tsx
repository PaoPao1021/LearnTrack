import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { shiftDateKey } from '../../utils';
import { soundscape } from '../../services/soundscape';
import { showToast } from './Toast';
import { GlassCalendarModal } from './GlassCalendarModal';

interface DatePickerCapsuleProps {
  selectedDate: string;
  actualToday: string;
  onSelectDate: (date: string) => void;
}

export function DatePickerCapsule({
  selectedDate,
  actualToday,
  onSelectDate,
}: DatePickerCapsuleProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isToday = selectedDate === actualToday;
  const isPast = selectedDate < actualToday;

  const handleOpenPicker = () => {
    soundscape.playTick();
    setCalendarOpen(true);
  };

  const handlePrevDay = () => {
    soundscape.playTick();
    const next = shiftDateKey(selectedDate, -1);
    onSelectDate(next);
  };

  const handleNextDay = () => {
    soundscape.playTick();
    const next = shiftDateKey(selectedDate, 1);
    onSelectDate(next);
  };

  const handleResetToday = () => {
    soundscape.playPop();
    onSelectDate(actualToday);
    showToast('已切换至今日视图', 'info');
  };

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Quick Return to Today button if inspecting past or future */}
        {!isToday && (
          <button
            type="button"
            onClick={handleResetToday}
            className="inline-flex items-center gap-1 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent)] shadow-xs transition-all hover:bg-[var(--accent)]/20 hover:scale-105 active:scale-95"
            title="点击重置回今日"
          >
            <RotateCcw size={11} className="transition-transform group-hover:-rotate-45" />
            <span>回到今天</span>
          </button>
        )}

        {/* Date Navigator Capsule */}
        <div className="relative inline-flex items-center rounded-2xl border border-[var(--border-soft)] bg-white/60 p-0.5 shadow-xs backdrop-blur-md transition-all hover:border-[var(--accent)]/40 hover:shadow-md dark:bg-white/[0.06]">
          {/* Previous Day Arrow */}
          <button
            type="button"
            onClick={handlePrevDay}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-black/5 hover:text-[var(--ink)] active:scale-95 dark:hover:bg-white/10"
            title="前一天"
            aria-label="查看前一天"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Center Clickable Date Trigger */}
          <button
            type="button"
            onClick={handleOpenPicker}
            className="flex items-center gap-2 px-2.5 py-1 text-xs font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
            title="点击打开全景学习复盘日历"
            aria-label="点击打开全景学习复盘日历"
          >
            <CalendarDays
              size={14}
              className={`transition-transform group-hover:scale-110 ${
                isToday ? 'text-[var(--accent)]' : 'text-amber-500'
              }`}
            />
            <span className="tick-text tracking-wide">{selectedDate}</span>
            {!isToday && (
              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                {isPast ? '历史' : '未来'}
              </span>
            )}
          </button>

          {/* Next Day Arrow */}
          <button
            type="button"
            onClick={handleNextDay}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-black/5 hover:text-[var(--ink)] active:scale-95 dark:hover:bg-white/10"
            title="后一天"
            aria-label="查看后一天"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* High-Aesthetic Glass Calendar Modal */}
      <GlassCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedDate={selectedDate}
        actualToday={actualToday}
        onSelectDate={(newDate) => {
          onSelectDate(newDate);
          if (newDate === actualToday) {
            showToast('已切换至今日视图', 'info');
          } else {
            showToast(`已切换至 ${newDate} 复盘记录`, 'info');
          }
        }}
      />
    </>
  );
}
