import React, { useState, useEffect, useRef } from 'react';
import { Flame, Clock3, Plus, Sparkles, TrendingUp, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { formatClock } from '../../utils';

export type DurationUnitMode = 'zh' | 'compact' | 'decimal';

const STORAGE_KEY = 'learntrack_duration_display_mode';

/** 平滑数字递增缓动 Hook（Quintic Ease-Out） */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);
  const isMounted = useRef(false);

  useEffect(() => {
    // 首次加载从 0 滚向初始值，带来成就感进场
    const from = !isMounted.current ? 0 : prevRef.current;
    isMounted.current = true;
    prevRef.current = target;

    const diff = target - from;
    if (diff === 0) {
      setValue(target);
      return;
    }

    // 若为实时秒级微增（如正在计时），直接更新，保持绝对同步
    if (Math.abs(diff) <= 2) {
      setValue(target);
      return;
    }

    let frameId: number;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Quintic ease-out: 极速启动、优雅减速
      const ease = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(from + diff * ease));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, durationMs]);

  return value;
}

/** 格式化分块展示 */
function renderDurationSegments(seconds: number, mode: DurationUnitMode) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (mode === 'compact') {
    return (
      <div className="flex items-baseline gap-1 select-none">
        <span className="tick-text text-3xl font-extrabold tracking-tight">{h}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mr-2 opacity-75">
          h
        </span>
        <span className="tick-text text-3xl font-extrabold tracking-tight">
          {String(m).padStart(2, '0')}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-75">
          m
        </span>
      </div>
    );
  }

  if (mode === 'decimal') {
    const dec = (s / 3600).toFixed(2);
    return (
      <div className="flex items-baseline gap-1.5 select-none">
        <span className="tick-text text-3xl font-extrabold tracking-tight">{dec}</span>
        <span className="text-xs font-semibold text-[var(--text-secondary)] opacity-80">
          小时
        </span>
      </div>
    );
  }

  // 默认中文模式：X 小时 Y 分
  return (
    <div className="flex items-baseline gap-1 select-none">
      <span className="tick-text text-3xl font-extrabold tracking-tight">{h}</span>
      <span className="text-xs font-semibold text-[var(--text-secondary)] mr-2 opacity-80">
        小时
      </span>
      <span className="tick-text text-3xl font-extrabold tracking-tight">
        {String(m).padStart(2, '0')}
      </span>
      <span className="text-xs font-semibold text-[var(--text-secondary)] opacity-80">
        分
      </span>
    </div>
  );
}

/** 单张卡片组件（支持光标聚光灯微动效 + 3D 浮雕与点击切换） */
function StatCard({
  title,
  subtitle,
  icon,
  seconds,
  mode,
  onCycleMode,
  spotlightColor,
  isToday,
  footer,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  icon?: React.ReactNode;
  seconds: number;
  mode: DurationUnitMode;
  onCycleMode: () => void;
  spotlightColor: string;
  isToday?: boolean;
  footer: React.ReactNode;
}) {
  const animatedSeconds = useCountUp(seconds);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onCycleMode}
      title="点击快速切换时间格式 (小时分 / h m / 工时)"
      className="interactive-stat-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white/50 p-4 backdrop-blur-md cursor-pointer dark:bg-white/[0.03] active:scale-[0.985]"
    >
      {/* 鼠标物理聚光灯光晕 */}
      {mousePos && (
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(180px circle at ${mousePos.x}px ${mousePos.y}px, ${spotlightColor}, transparent 75%)`,
          }}
        />
      )}

      {/* 顶部主数字与单位切换微胶囊 */}
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className={isToday ? 'text-[var(--accent)]' : 'text-[var(--ink)]'}>
            {renderDurationSegments(animatedSeconds, mode)}
          </div>

          {/* 切换微指示器 */}
          <span className="flex items-center gap-1 rounded-full border border-black/5 bg-black/[0.03] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)] opacity-60 transition-all duration-200 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent)]/10 group-hover:text-[var(--accent)] group-hover:opacity-100 dark:border-white/10 dark:bg-white/[0.05]">
            <RotateCcw size={10} className="transition-transform duration-300 group-hover:rotate-180" />
            <span>
              {mode === 'zh' ? '小时分' : mode === 'compact' ? 'h/m' : '工时'}
            </span>
          </span>
        </div>

        {/* 次级说明行 */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          {icon}
          {subtitle}
        </div>
      </div>

      {/* 底部联动微分析指标 */}
      <div className="relative z-10 mt-3.5 border-t border-[var(--border-soft)]/50 pt-2.5">
        {footer}
      </div>
    </div>
  );
}

interface InteractiveDurationCardsProps {
  todaySeconds: number;
  weekSeconds: number;
  runningElapsed: number;
  onOpenAddEntry: () => void;
  timelineSlot?: React.ReactNode;
}

export function InteractiveDurationCards({
  todaySeconds,
  weekSeconds,
  runningElapsed,
  onOpenAddEntry,
  timelineSlot,
}: InteractiveDurationCardsProps) {
  const { t } = useI18n();

  // 格式偏好：支持 localStorage 持久化
  const [mode, setMode] = useState<DurationUnitMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as DurationUnitMode | null;
    return saved === 'zh' || saved === 'compact' || saved === 'decimal' ? saved : 'zh';
  });

  const cycleMode = () => {
    const modes: DurationUnitMode[] = ['zh', 'compact', 'decimal'];
    const curIdx = modes.indexOf(mode);
    const next = modes[(curIdx + 1) % modes.length] ?? 'zh';
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  // 今日占本周的比例
  const weeklySharePercent = weekSeconds > 0
    ? Math.min(100, Math.round((todaySeconds / weekSeconds) * 100))
    : 0;

  // 本周日均
  const dayOfWeek = Math.max(1, new Date().getDay() || 7);
  const dailyAverageSeconds = Math.round(weekSeconds / dayOfWeek);

  // 状态评级徽章
  const focusLevel = (() => {
    if (todaySeconds < 900) {
      return { label: '蓄力启航', tip: '刚刚开始，专注一小步也是进步！', color: 'text-slate-400' };
    }
    if (todaySeconds < 3600) {
      return { label: '专注起步', tip: '已渐入佳境，继续保持心流！', color: 'text-amber-500' };
    }
    if (todaySeconds < 10800) {
      return { label: '深度专注', tip: '沉浸心流状态，成果显著！', color: 'text-emerald-500' };
    }
    return { label: '卓越心流', tip: '今日专注已突破3小时，超神发挥！', color: 'text-indigo-500' };
  })();

  return (
    <section className="card rise rise-2 p-6">
      {/* 头部：标题与动态状态徽章 */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="label">{t('label.logged')}</div>
          <h2 className="display text-xl font-bold tracking-tight">{t('logged.title')}</h2>
        </div>

        {/* 今日专注成就徽章（鼠标悬浮跃动） */}
        <div
          className="group relative flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-black/[0.02] px-3 py-1 text-xs text-[var(--text-secondary)] transition-all duration-300 hover:border-amber-400/40 hover:bg-amber-50/60 dark:bg-white/[0.04] dark:hover:bg-amber-950/20 cursor-default"
          title={focusLevel.tip}
        >
          <Flame
            size={13}
            className={`${focusLevel.color} transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12`}
          />
          <span className="tick-text font-medium text-[11px]">
            {focusLevel.label}
          </span>
        </div>
      </div>

      {/* 双核心统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 今日已记录 */}
        <StatCard
          title={t('logged.today')}
          isToday
          seconds={todaySeconds}
          mode={mode}
          onCycleMode={cycleMode}
          spotlightColor="color-mix(in srgb, var(--accent) 18%, transparent)"
          icon={
            <span
              className={`h-2 w-2 rounded-full bg-[var(--accent)] ${
                runningElapsed > 0 ? 'animate-ping' : ''
              }`}
            />
          }
          subtitle={
            runningElapsed > 0
              ? t('logged.todayWithTimer', { time: formatClock(runningElapsed) })
              : t('logged.today')
          }
          footer={
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                  <Sparkles size={11} className="text-amber-500" />
                  本周贡献度
                </span>
                <span className="tick-text font-bold text-[var(--accent)]">
                  {weeklySharePercent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                <div
                  className="relative h-full rounded-full transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    width: `${weeklySharePercent}%`,
                    background:
                      'linear-gradient(90deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 70%, #6366f1) 100%)',
                  }}
                >
                  <div className="animate-shimmer absolute inset-0 bg-white/35" />
                </div>
              </div>
            </div>
          }
        />

        {/* 本周（周一起） */}
        <StatCard
          title={t('logged.week')}
          seconds={weekSeconds}
          mode={mode}
          onCycleMode={cycleMode}
          spotlightColor="rgba(99, 102, 241, 0.15)"
          icon={<Clock3 size={12} className="text-[var(--text-tertiary)]" />}
          subtitle={t('logged.week')}
          footer={
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                <TrendingUp size={11} className="text-emerald-500" />
                本周日均
              </span>
              <span className="tick-text font-semibold text-[var(--ink)] opacity-85">
                {mode === 'decimal'
                  ? `${(dailyAverageSeconds / 3600).toFixed(2)} 小时`
                  : mode === 'compact'
                  ? `${Math.floor(dailyAverageSeconds / 3600)}h ${Math.floor(
                      (dailyAverageSeconds % 3600) / 60
                    )}m`
                  : `${Math.floor(dailyAverageSeconds / 3600)}小时 ${Math.floor(
                      (dailyAverageSeconds % 3600) / 60
                    )}分`}
              </span>
            </div>
          }
        />
      </div>

      {/* 注入时光轴插槽 */}
      {timelineSlot}

      {/* 补录按钮：磁吸动效 + 90度旋转快门感 */}
      <div className="mt-5">
        <button
          type="button"
          className="group relative inline-flex items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-white/60 px-4 py-2 text-sm font-medium text-[var(--ink)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-white hover:shadow-md active:scale-95 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          onClick={onOpenAddEntry}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] transition-all duration-300 group-hover:rotate-90 group-hover:bg-[var(--accent)] group-hover:text-white">
            <Plus size={13} strokeWidth={2.5} />
          </span>
          <span>{t('logged.add')}</span>
        </button>
      </div>
    </section>
  );
}
