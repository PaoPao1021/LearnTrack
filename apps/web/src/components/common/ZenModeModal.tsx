import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Square, Minimize2, Maximize, Minimize, Volume2, VolumeX, CloudRain, Waves, Coffee, Sparkles } from 'lucide-react';
import { formatClock } from '../../utils';
import { useI18n } from '../../i18n';
import type { TimerState } from '../../stores/timer';
import { soundscape, type SoundType } from '../../services/soundscape';

interface ZenModeModalProps {
  open: boolean;
  onClose: () => void;
  timer: TimerState;
  elapsed: number;
  overtime: number;
  activityLabel?: string;
  activityColor?: string;
}

export function ZenModeModal({
  open,
  onClose,
  timer,
  elapsed,
  overtime,
  activityLabel,
  activityColor,
}: ZenModeModalProps) {
  const { t } = useI18n();
  const [sound, setSoundState] = useState<SoundType>(soundscape.getSound());
  const [vol, setVolState] = useState<number>(soundscape.getVolume());
  const [isNativeFs, setIsNativeFs] = useState<boolean>(typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false);

  const handleSoundChange = (type: SoundType) => {
    setSoundState(type);
    soundscape.setSound(type);
  };

  const handleVolChange = (v: number) => {
    setVolState(v);
    soundscape.setVolume(v);
  };

  const toggleNativeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsNativeFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleClose = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // ignore
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      soundscape.stopSound();
    };
  }, [open, onClose]);

  if (!open) return null;


  const targetSec = timer.countdownTargetSeconds;
  const progressRatio = targetSec ? Math.min(1, elapsed / targetSec) : 0;
  const remaining = targetSec ? Math.max(0, targetSec - elapsed) : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('zen.title')}
      className="zen-overlay fixed inset-0 z-[100] p-6 sm:p-10 select-none"
      style={{
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${activityColor ?? 'var(--accent)'} 12%, transparent), transparent 70%), color-mix(in srgb, var(--bg-base) 90%, transparent)`,
      }}
    >
      {/* Top bar */}
      <header className="flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              timer.status === 'running' ? 'animate-pulse bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'
            }`}
          />
          <span className="mono text-xs font-semibold tracking-wider opacity-70">
            LearnTrack · {t('zen.title')}
          </span>
        </div>

        {/* 声学心流控制器 */}
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-white/50 p-1 backdrop-blur-md dark:bg-white/[0.06]">
          <button
            type="button"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              sound === 'none' ? 'bg-[var(--accent)] text-white shadow-xs' : 'opacity-60 hover:opacity-100'
            }`}
            onClick={() => handleSoundChange('none')}
            title="静音"
          >
            <VolumeX size={13} />
            <span className="hidden sm:inline">静音</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              sound === 'rain' ? 'bg-[var(--accent)] text-white shadow-xs' : 'opacity-60 hover:opacity-100'
            }`}
            onClick={() => handleSoundChange('rain')}
            title="柔和雨声"
          >
            <CloudRain size={13} />
            <span className="hidden sm:inline">雨声</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              sound === 'ocean' ? 'bg-[var(--accent)] text-white shadow-xs' : 'opacity-60 hover:opacity-100'
            }`}
            onClick={() => handleSoundChange('ocean')}
            title="潮汐海浪"
          >
            <Waves size={13} />
            <span className="hidden sm:inline">潮汐</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              sound === 'brown' ? 'bg-[var(--accent)] text-white shadow-xs' : 'opacity-60 hover:opacity-100'
            }`}
            onClick={() => handleSoundChange('brown')}
            title="深空噪波"
          >
            <Coffee size={13} />
            <span className="hidden sm:inline">白噪</span>
          </button>
          {sound !== 'none' && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={vol}
              onChange={(e) => handleVolChange(Number(e.target.value))}
              className="ml-1 h-1.5 w-14 cursor-pointer accent-[var(--accent)] sm:w-16"
              aria-label="音量"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleNativeFullscreen}
            className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
            title={isNativeFs ? "退出全屏模式" : "切换浏览器全屏"}
          >
            {isNativeFs ? <Minimize size={14} /> : <Maximize size={14} />}
            <span className="hidden sm:inline">{isNativeFs ? "窗口化" : "全屏沉浸"}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
            title={t('zen.escHint')}
          >
            <Minimize2 size={14} />
            <span className="hidden sm:inline">{t('zen.exit')}</span>
            <kbd className="ml-1 rounded border px-1 text-[10px] opacity-60">ESC</kbd>
          </button>
        </div>
      </header>

      {/* Main Focus Clock */}
      <main className="flex flex-col items-center justify-center text-center">
        {activityLabel && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium glass-regular shadow-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: activityColor ?? 'var(--accent)' }}
            />
            <span>{activityLabel}</span>
          </div>
        )}

        <div className="relative">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full blur-3xl opacity-30"
            style={{
              background: timer.status === 'paused' ? 'var(--warning)' : 'var(--accent)',
            }}
          />
          <div
            className={`tick-text relative z-10 font-extrabold tracking-tight ${
              timer.status === 'paused' ? 'text-amber-500' : 'text-gradient-accent'
            }`}
            style={{
              fontSize: 'clamp(4.5rem, 15vw, 9.5rem)',
              lineHeight: 1,
              textShadow: timer.status === 'paused'
                ? '0 4px 30px rgba(245, 158, 11, 0.25)'
                : '0 4px 36px color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            {formatClock(elapsed)}
          </div>
        </div>

        {/* Status & Overtime / Target */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm">
          <span
            className="mono rounded-full px-3 py-1 font-semibold"
            style={
              timer.status === 'paused'
                ? {
                    background: 'color-mix(in srgb, var(--warning) 16%, var(--surface-elevated))',
                    color: 'var(--warning)',
                  }
                : {
                    background: 'color-mix(in srgb, var(--accent) 14%, var(--surface-elevated))',
                    color: 'var(--accent)',
                  }
            }
          >
            {timer.status === 'paused' ? t('timer.paused') : t('timer.running')}
          </span>

          {targetSec ? (
            <span className="tick-text font-medium" style={{ color: 'var(--text-secondary)' }}>
              {remaining > 0
                ? `${t('timer.target', { time: formatClock(targetSec) })} · 剩 ${formatClock(remaining)}`
                : t('timer.target', { time: formatClock(targetSec) })}
            </span>
          ) : null}

          {overtime > 0 && (
            <span className="tick-text font-semibold text-amber-500">
              {t('timer.overtime', { time: formatClock(overtime) })}
            </span>
          )}
        </div>

        {/* Liquid Progress Bar for Countdown */}
        {targetSec ? (
          <div className="mt-6 w-full max-w-sm sm:max-w-md">
            <div className="liquid-progress-track">
              <div
                className="liquid-progress-bar"
                style={{
                  width: `${progressRatio * 100}%`,
                  background:
                    overtime > 0
                      ? 'linear-gradient(90deg, var(--warning), color-mix(in srgb, var(--danger) 80%, white 20%))'
                      : undefined,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-mono opacity-50">
              <span>{Math.round(progressRatio * 100)}%</span>
              <span>{formatClock(targetSec)}</span>
            </div>
          </div>
        ) : null}

        <p className="mt-8 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles size={13} />
          <span>{t('zen.subtitle')}</span>
        </p>
      </main>

      {/* Action Controls */}
      <footer className="flex w-full max-w-md items-center justify-center gap-4 pb-2">
        {timer.status === 'running' ? (
          <button
            type="button"
            className="btn-ghost flex-1 py-3 text-sm font-medium"
            onClick={timer.pause}
          >
            <Pause size={16} /> {t('timer.pause')}
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost flex-1 py-3 text-sm font-medium"
            onClick={timer.resume}
          >
            <Play size={16} /> {t('timer.resume')}
          </button>
        )}
        <button
          type="button"
          className="btn-primary flex-1 py-3 text-sm font-medium"
          disabled={timer.stopping}
          onClick={() => {
            handleClose();
            void timer.stop();
          }}
        >
          <Square size={15} /> {t('timer.finish')}
        </button>
      </footer>
    </div>,
    document.body
  );
}
