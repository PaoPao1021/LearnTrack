import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { Modal } from '../../components/common/Modal';
import { Segmented } from '../../components/common/Segmented';
import { useI18n, type MessageKey } from '../../i18n';
import { THEME_CHANGE_EVENT } from '../settings/useTheme';
import {
  computeStats, formatDuration, previousRange, daysBetweenInclusive,
  entrySecondsByLocalDay,
} from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import {
  CalendarComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { StatsResult, CategoryTotals, Category, EntryRecord } from '@learntrack/domain';
import { ChevronRight, Layers, BarChart3, Clock3, Flame, ListChecks, TrendingUp } from 'lucide-react';
import { useCountUp } from '../dashboard/InteractiveDurationCards';
import { soundscape } from '../../services/soundscape';

echarts.use([
  BarChart, HeatmapChart, LineChart, PieChart,
  CalendarComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  CanvasRenderer,
]);

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type Granularity = 'auto' | 'day' | 'week' | 'month';

/** ECharts 需要可直接解析的色值：从设计令牌读取（不能给 color-mix 表达式） */
function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function chartPalette() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return {
    accent: cssVar('--accent', '#007aff'),
    label: isDark ? '#94a3b8' : '#566070',
    line: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(23,30,46,0.12)',
    grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(23,30,46,0.07)',
    prev: isDark ? '#64748b' : '#9ca3af',
    pieBorder: isDark ? '#1a1f2a' : '#ffffff',
    heat: [0, 1, 2, 3, 4].map((i) => cssVar(`--heat-${i}`, '#40c463')),
  };
}

const PRESETS: Preset[] = ['day', 'week', 'month', 'year', 'custom'];

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = todayKey();
  if (preset === 'day') return { from: today, to: today };
  if (preset === 'week') return { from: mondayOf(today), to: today };
  if (preset === 'month') return { from: today.slice(0, 7) + '-01', to: today };
  if (preset === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  return { from: customFrom, to: customTo };
}

function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

function useChart(setOptions: (chart: echarts.ECharts) => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(ref.current);
      setOptions(chart);
    } catch (err) {
      console.error('chart init failed', err);
      chart?.dispose();
      return;
    }
    const onResize = () => chart?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** 每个大科目一条日序列；duration-only 记录按学习日期归属，时间段记录按当地午夜拆分。 */
function buildMajorSeries(
  entries: EntryRecord[],
  categories: Category[],
  from: string,
  to: string,
): { days: string[]; series: { name: string; color: string; data: number[] }[] } {
  const days: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const toDate = new Date(Date.UTC(ty, tm - 1, td));
  let guard = 0;
  while (cur <= toDate && guard < 1000) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const majorOf = (activityId: string): Category | undefined => {
    const activity = byId.get(activityId);
    const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
    return subject?.parentId ? byId.get(subject.parentId) : undefined;
  };

  const maps = new Map<string, Map<string, number>>(); // majorId -> dayKey -> seconds
  for (const e of entries) {
    if (e.deletedAt) continue;
    const major = majorOf(e.activityId);
    if (!major) continue;
    let perDay = maps.get(major.id);
    if (!perDay) { perDay = new Map(); maps.set(major.id, perDay); }
    for (const [day, seconds] of Object.entries(entrySecondsByLocalDay(e))) {
      if (day >= from && day <= to) perDay.set(day, (perDay.get(day) ?? 0) + seconds);
    }
  }

  const series = [...maps.entries()]
    .map(([majorId, perDay]) => ({
      name: byId.get(majorId)?.name ?? '?',
      color: byId.get(majorId)?.color ?? '#888',
      data: days.map((k) => perDay.get(k) ?? 0),
    }))
    .sort((a, b) => b.data.reduce((s, v) => s + v, 0) - a.data.reduce((s, v) => s + v, 0));
  return { days, series };
}

function streakOf(entries: EntryRecord[]): { current: number; longest: number } {
  const days = new Set(entries.filter((e) => !e.deletedAt).flatMap((e) => Object.keys(entrySecondsByLocalDay(e))));
  if (days.size === 0) return { current: 0, longest: 0 };
  const sorted = [...days].sort();
  let longest = 1; let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prevDay = new Date(`${sorted[i - 1]}T00:00:00Z`);
    const curDay = new Date(`${sorted[i]}T00:00:00Z`);
    const diff = (curDay.getTime() - prevDay.getTime()) / 86_400_000;
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  // current streak：从今天往回数；今天没有记录则从昨天开始
  let current = 0;
  const probe = new Date(`${todayKey()}T00:00:00Z`);
  if (!days.has(probe.toISOString().slice(0, 10))) probe.setUTCDate(probe.getUTCDate() - 1);
  while (days.has(probe.toISOString().slice(0, 10)) && current < 999) {
    current += 1;
    probe.setUTCDate(probe.getUTCDate() - 1);
  }
  return { current, longest };
}

function entrySecondsInRange(entry: EntryRecord, from: string, to: string): number {
  if (entry.deletedAt) return 0;
  return Object.entries(entrySecondsByLocalDay(entry))
    .filter(([day]) => day >= from && day <= to)
    .reduce((sum, [, seconds]) => sum + seconds, 0);
}

function DrillModal({ title, entries, onClose }: { title: string; entries: EntryRecord[]; onClose: () => void }) {
  const { t, fmtDuration, locale } = useI18n();
  return (
    <Modal labelledBy="drill-title" onClose={onClose} panelClassName="modal-panel glass-emphasis max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
      <h2 id="drill-title" className="display mb-3 text-lg">{title}</h2>
      {entries.length === 0 && <p className="text-sm opacity-60">{t('drill.empty')}</p>}
      <ul className="space-y-2 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, var(--ink) 5%, transparent)' }}>
            <span className="font-semibold">{fmtDuration(e.durationSeconds)}</span>
            {e.startedAt != null && (
              <span className="ml-2 text-xs opacity-60">
                {new Date(e.startedAt).toLocaleString(locale, { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{t('drill.since')}
              </span>
            )}
            {e.note ? <span className="ml-2 opacity-70">{e.note}</span> : null}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** 图表容器的空状态覆盖层：空数据不再只剩空白坐标轴。 */
function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="text-sm opacity-60">{text}</p>
    </div>
  );
}

function AnalyticsMetricsGrid({
  stats,
  deltaPct,
  streak,
  span,
}: {
  stats: StatsResult;
  deltaPct: number | null;
  streak: { current: number; longest: number };
  span: number;
}) {
  const { t, fmtDuration } = useI18n();
  const animatedTotal = useCountUp(stats.totalSeconds);
  const animatedCount = useCountUp(stats.entryCount);
  const animatedCalAvg = useCountUp(stats.avgPerCalendarDaySeconds);
  const animatedActAvg = useCountUp(stats.avgPerActiveDaySeconds);
  const animatedCoverage = useCountUp(Math.round(stats.rangeCoverage * 100));

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text text-lg font-bold text-[var(--accent)]">{fmtDuration(animatedTotal)}</div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">
          {t('metric.total')}
          {deltaPct != null && (
            <span className={deltaPct >= 0 ? 'text-emerald-500 font-semibold ml-1' : 'text-rose-500 font-semibold ml-1'}>
              {deltaPct >= 0 ? `+${deltaPct}%` : `${deltaPct}%`}
            </span>
          )}
        </div>
      </div>
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text text-lg font-bold text-[var(--ink)]">{animatedCount}</div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">{t('metric.count')}</div>
      </div>
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text text-lg font-bold text-[var(--ink)]">{fmtDuration(animatedCalAvg)}</div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">{t('metric.calendarAvg', { days: span })}</div>
      </div>
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text text-lg font-bold text-[var(--ink)]">{fmtDuration(animatedActAvg)}</div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">{t('metric.activeAvg', { days: stats.activeDayCount })}</div>
      </div>
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text flex items-center justify-center gap-1 text-lg font-bold text-[var(--ink)]">
          <Flame size={15} className="text-amber-500" />
          {streak.current}
        </div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">{t('metric.streak', { best: streak.longest })}</div>
      </div>
      <div className="interactive-stat-card card p-3.5 text-center">
        <div className="tick-text text-lg font-bold text-[var(--ink)]">{animatedCoverage}%</div>
        <div className="chart-title mt-1 text-xs text-[var(--text-tertiary)]">{t('metric.coverage')}</div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { t, fmtDuration, locale, lang } = useI18n();
  // 预设、自定义范围与粒度保存在 URL：刷新、返回、分享链接都能还原上下文
  const [searchParams, setSearchParams] = useSearchParams();
  const presetRaw = searchParams.get('preset') as Preset | null;
  const preset: Preset = presetRaw && PRESETS.includes(presetRaw) ? presetRaw : 'week';
  const customFrom = searchParams.get('from') ?? todayKey();
  const customTo = searchParams.get('to') ?? todayKey();
  const granRaw = searchParams.get('gran') as Granularity | null;
  const granularity: Granularity = granRaw && ['auto', 'day', 'week', 'month'].includes(granRaw) ? granRaw : 'auto';

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const entries = useLiveQuery(() => db.entries.toArray(), [], [] as EntryRecord[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const [drill, setDrill] = useState<{ title: string; entries: EntryRecord[] } | null>(null);
  // 主题切换（深浅色 / 强调色 / 语言）后重绘图表，读取新的调色令牌与文案
  const [themeTick, bumpThemeTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => bumpThemeTick());
    };
    window.addEventListener(THEME_CHANGE_EVENT, handler);

    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => bumpThemeTick());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handler);
      observer.disconnect();
    };
  }, []);

  const range = rangeFor(preset, customFrom, customTo);
  const stats: StatsResult = useMemo(
    () => computeStats(entries ?? [], categories ?? [], range.from, range.to, { timeZone: TZ }),
    [entries, categories, range.from, range.to],
  );
  const prev = previousRange(range.from, range.to);
  const prevStats = useMemo(
    () => computeStats(entries ?? [], categories ?? [], prev.from, prev.to, { timeZone: TZ }),
    [entries, categories, prev.from, prev.to],
  );

  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  const catName = (id: string) => byId.get(id)?.name ?? '?';
  const majorSeries = useMemo(
    () => buildMajorSeries((entries ?? []).filter((e) => !e.deletedAt), categories ?? [], range.from, range.to),
    [entries, categories, range.from, range.to],
  );
  const prevMajorSeries = useMemo(
    () => buildMajorSeries((entries ?? []).filter((e) => !e.deletedAt), categories ?? [], prev.from, prev.to),
    [entries, categories, prev.from, prev.to],
  );
  const streak = useMemo(() => streakOf(entries ?? []), [entries]);

  // 趋势粒度：范围长于 45 天自动切周，长于 400 天切月
  const span = daysBetweenInclusive(range.from, range.to);
  const gran: 'day' | 'week' | 'month' =
    granularity === 'auto' ? (span > 400 ? 'month' : span > 45 ? 'week' : 'day') : granularity;
  const granName = t(`gran.${gran}` as MessageKey);

  const aggregateSeries = (data: number[], dates: string[]): { labels: string[]; values: number[] } => {
    if (gran === 'day') return { labels: dates, values: data };
    const buckets = new Map<string, number>();
    dates.forEach((date, i) => {
      const key = gran === 'week' ? mondayOf(date) : date.slice(0, 7);
      buckets.set(key, (buckets.get(key) ?? 0) + (data[i] ?? 0));
    });
    const labels = [...buckets.keys()].sort();
    return { labels, values: labels.map((k) => buckets.get(k) ?? 0) };
  };

  // 主趋势：各科目叠加曲线 + 上期总量灰色虚线（按索引对齐）；渐变面积增强可读性
  const trendRef = useChart((chart) => {
    const palette = chartPalette();
    const safeHex = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#808080');
    const gradient = (color: string) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: safeHex(color) + '3d' },
      { offset: 1, color: safeHex(color) + '00' },
    ]);
    const currentByDay = new Map(stats.byDay.map((d) => [d.date, d.seconds]));
    const previousByDay = new Map(prevStats.byDay.map((d) => [d.date, d.seconds]));
    const cur = aggregateSeries(majorSeries.days.map((day) => currentByDay.get(day) ?? 0), majorSeries.days);
    const prevAgg = aggregateSeries(prevMajorSeries.days.map((day) => previousByDay.get(day) ?? 0), prevMajorSeries.days);
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v), lang) },
      legend: { top: 0, textStyle: { fontSize: 11, color: palette.label } },
      grid: { left: 48, right: 12, top: 36, bottom: 24 },
      xAxis: { type: 'category', data: cur.labels, axisLabel: { fontSize: 10, color: palette.label }, axisLine: { lineStyle: { color: palette.line } } },
      yAxis: {
        type: 'value', splitNumber: 4,
        axisLabel: { formatter: (v: number) => `${Math.round(v / 3600)}h`, color: palette.label },
        splitLine: { lineStyle: { color: palette.grid } },
      },
      series: [
        ...majorSeries.series.map((s) => ({
          name: s.name, type: 'line' as const, smooth: 0.4, symbol: 'none',
          data: aggregateSeries(s.data, majorSeries.days).values,
          lineStyle: { width: 2.5, color: s.color }, itemStyle: { color: s.color },
          areaStyle: { color: gradient(s.color) },
          emphasis: { focus: 'series' as const },
        })),
        {
          name: t('trend.prev'), type: 'line' as const, smooth: 0.4, symbol: 'none',
          data: prevAgg.values, lineStyle: { width: 1.5, type: 'dashed', opacity: 0.5 },
          itemStyle: { color: palette.prev },
        },
      ],
    });
  }, [stats.byDay, prevStats.byDay, majorSeries, prevMajorSeries, gran, lang, themeTick]);

  // 扇形图：内层实心圆（大分类），外层加粗圆环（具体科目/活动）；圆盘外部展示总时长与核心指标，点击下钻原始记录（零值分类不参与渲染）
  const pieRef = useChart((chart) => {
    const palette = chartPalette();
    const inner = stats.categories.map((c) => ({ name: catName(c.categoryId), value: c.totalSeconds, id: c.categoryId })).filter((d) => d.value > 0);
    const outer = stats.categories.flatMap((m) =>
      m.children.map((s) => ({ name: catName(s.categoryId), value: s.totalSeconds, id: s.categoryId })),
    ).filter((d) => d.value > 0);
    const colorOf = (id: string) => byId.get(id)?.color;
    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string; value: number; percent: number }) =>
          `<div style="font-weight:600;margin-bottom:2px">${p.name}</div><div>投入: ${formatDuration(p.value, lang)} (${p.percent}%)</div>`,
      },
      legend: { bottom: 0, textStyle: { fontSize: 10, color: palette.label }, type: 'scroll' },
      title: {
        show: false,
      },
      series: [
        {
          name: '核心领域',
          type: 'pie',
          radius: [0, '46%'],
          center: ['50%', '46%'],
          label: {
            show: true,
            position: 'inner',
            formatter: (p: { percent: number; name: string }) => (p.percent >= 8 ? p.name : ''),
            fontSize: 11,
            fontWeight: 600,
            color: '#ffffff',
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowBlur: 3,
          },
          itemStyle: { borderColor: palette.pieBorder, borderWidth: 2 },
          emphasis: { scaleSize: 4 },
          data: inner.map((d) => ({ ...d, itemStyle: { color: colorOf(d.id) } })),
        },
        {
          name: '细分科目',
          type: 'pie',
          radius: ['52%', '80%'],
          center: ['50%', '46%'],
          label: { show: false },
          itemStyle: { borderColor: palette.pieBorder, borderWidth: 2, borderRadius: 3 },
          emphasis: { scaleSize: 4 },
          data: outer.map((d) => ({ ...d, itemStyle: { color: colorOf(d.id), opacity: 0.85 } })),
        },
      ],
    }, true);
    chart.off('click');
    chart.on('click', (p: unknown) => {
      const id = (p as { data?: { id?: string } }).data?.id;
      if (!id) return;
      // 命中该分类自身及直接子分类的记录
      const childIds = new Set((categories ?? []).filter((c) => c.parentId === id).map((c) => c.id));
      const hits = (entries ?? []).filter((e) => {
        if (entrySecondsInRange(e, range.from, range.to) <= 0) return false;
        return e.activityId === id || childIds.has(e.activityId)
          || (() => {
            const activity = byId.get(e.activityId);
            const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
            return subject?.parentId === id;
          })();
      });
      setDrill({ title: `${catName(id)} · ${range.from} → ${range.to}`, entries: hits });
    });
  }, [stats.categories, categories, entries, range.from, range.to, lang, themeTick]);

  // 科目排行（具体科目横向条形）
  const ranking = useMemo(() => {
    const list: { name: string; color: string; seconds: number }[] = [];
    for (const m of stats.categories) {
      for (const s of m.children) {
        list.push({ name: catName(s.categoryId), color: byId.get(s.categoryId)?.color ?? '#888', seconds: s.totalSeconds });
      }
    }
    return list.filter((r) => r.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 10);
  }, [stats.categories, categories]);

  const rankRef = useChart((chart) => {
    const palette = chartPalette();
    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string; value: number; marker: string }) => {
          return `<div style="font-weight:600;margin-bottom:2px">${p.name}</div><div>${p.marker} ${formatDuration(Number(p.value), lang)}</div>`;
        },
      },
      grid: { left: 90, right: 52, top: 8, bottom: 8 },
      xAxis: { type: 'value', show: false, splitLine: { show: false } },
      yAxis: {
        type: 'category', inverse: true, data: ranking.map((r) => r.name),
        axisLabel: { fontSize: 11, color: palette.label },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar', barWidth: 12, borderRadius: 6,
        data: ranking.map((r) => ({ value: r.seconds, itemStyle: { color: r.color } })),
        emphasis: {
          itemStyle: {
            opacity: 0.85,
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.15)',
          },
        },
        label: { show: true, position: 'right', fontSize: 10, color: palette.label, formatter: (p: { value: number }) => `${(p.value / 3600).toFixed(1)}h` },
      }],
    }, true);
  }, [ranking, lang, themeTick]);

  // 单次时长分布
  const durationDist = useMemo(() => {
    const buckets = [
      { label: '<30', min: 0, max: 1800, count: 0 },
      { label: '30–60', min: 1800, max: 3600, count: 0 },
      { label: '1–2h', min: 3600, max: 7200, count: 0 },
      { label: '>2h', min: 7200, max: Infinity, count: 0 },
    ];
    for (const e of entries ?? []) {
      if (entrySecondsInRange(e, range.from, range.to) <= 0) continue;
      const b = buckets.find((x) => e.durationSeconds >= x.min && e.durationSeconds < x.max);
      if (b) b.count += 1;
    }
    return buckets;
  }, [entries, range.from, range.to]);

  const distRef = useChart((chart) => {
    const palette = chartPalette();
    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string; value: number; marker: string }) => {
          return `<div style="font-weight:600;margin-bottom:2px">单次时长: ${p.name}</div><div>${p.marker} ${p.value} 条记录</div>`;
        },
      },
      grid: { left: 40, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: durationDist.map((b) => b.label), axisLabel: { fontSize: 10, color: palette.label }, axisLine: { lineStyle: { color: palette.line } } },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 3, axisLabel: { color: palette.label }, splitLine: { lineStyle: { color: palette.grid } } },
      series: [{
        type: 'bar',
        barWidth: 26,
        borderRadius: [6, 6, 0, 0],
        data: durationDist.map((b) => b.count),
        itemStyle: { color: palette.accent },
        emphasis: {
          itemStyle: {
            opacity: 0.85,
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.15)',
          },
        },
      }],
    }, true);
  }, [durationDist, lang, themeTick]);

  const hourRef = useChart((chart) => {
    const palette = chartPalette();
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v), lang) },
      grid: { left: 44, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: stats.byHour.map((h) => `${h.hour}`), axisLabel: { fontSize: 10, color: palette.label }, axisLine: { lineStyle: { color: palette.line } } },
      yAxis: {
        type: 'value', splitNumber: 3,
        axisLabel: { formatter: (v: number) => `${Math.round(v / 3600)}h`, color: palette.label },
        splitLine: { lineStyle: { color: palette.grid } },
      },
      series: [{ type: 'bar', barWidth: '70%', borderRadius: [4, 4, 0, 0], data: stats.byHour.map((h) => h.seconds), itemStyle: { color: palette.accent } }],
    });
  }, [stats.byHour, lang, themeTick]);

  // 热力图：GitHub 贡献图风格——固定小方格、周日开头、月份置顶、五档色阶、空日补 0
  const today = todayKey();
  const heatByDay = useMemo(() => new Map(stats.byDay.map((d) => [d.date, d.seconds])), [stats.byDay]);
  const heatDays = useMemo(() => {
    const days: string[] = [];
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const cur = new Date(Date.UTC(Number(yearStart.slice(0, 4)), 0, 1));
    const end = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))));
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }, [today]);
  const heatSummary = useMemo(() => {
    const activeDays = stats.byDay.filter((d) => d.seconds > 0).length;
    const total = stats.byDay.reduce((sum, d) => sum + d.seconds, 0);
    return { activeDays, total };
  }, [stats.byDay]);

  const heatRef = useChart((chart) => {
    const palette = chartPalette();
    const yearStart = `${todayKey().slice(0, 4)}-01-01`;
    const data = heatDays.map((day) => [day, heatByDay.get(day) ?? 0]);
    const isZh = lang === 'zh';
    chart.setOption({
      tooltip: {
        formatter: (p: { value: [string, number] }) => `${p.value[0]}: ${formatDuration(p.value[1], lang)}`,
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        pieces: [
          { max: 0, color: palette.heat[0] },
          { min: 1, max: 1800, color: palette.heat[1] },
          { min: 1801, max: 3600, color: palette.heat[2] },
          { min: 3601, max: 7200, color: palette.heat[3] },
          { min: 7201, color: palette.heat[4] },
        ],
      },
      calendar: {
        range: [yearStart, todayKey()],
        cellSize: ['auto', 11],
        left: 26, right: 8, top: 20, bottom: 4,
        itemStyle: { color: 'transparent', borderColor: 'transparent', borderWidth: 0 },
        splitLine: { show: false },
        dayLabel: {
          firstDay: 0, // 周日在第一行，与 GitHub 一致
          nameMap: isZh ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
          color: palette.label, fontSize: 9,
        },
        monthLabel: {
          position: 'top',
          nameMap: isZh ? 'cn' : 'en',
          color: palette.label, fontSize: 10, fontWeight: 600,
        },
        yearLabel: { show: false },
      },
      series: [{
        type: 'heatmap', coordinateSystem: 'calendar', data,
        itemStyle: { borderRadius: 2.5 },
        emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.3)', borderRadius: 2.5 } },
      }],
    });
    chart.off('click');
    chart.on('click', (params: unknown) => {
      const day = (params as { value?: [string, number] }).value?.[0];
      if (!day) return;
      setDrill({ title: t('heat.drillTitle', { day }), entries: (entries ?? []).filter((e) => !e.deletedAt && (entrySecondsByLocalDay(e)[day] ?? 0) > 0) });
    });
  }, [heatDays, heatByDay, entries, lang, themeTick]);

  const deltaPct = prevStats.totalSeconds > 0
    ? Math.round(((stats.totalSeconds - prevStats.totalSeconds) / prevStats.totalSeconds) * 100)
    : null;
  const bestDay = [...stats.byDay].sort((a, b) => b.seconds - a.seconds)[0];
  const topSubject = stats.categories.flatMap((m) => m.children).sort((a, b) => b.totalSeconds - a.totalSeconds)[0];

  const distAria = durationDist.map((b) => `${b.label} ${b.count}`).join(', ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl">{t('stats.title')}</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 md:justify-end">
          <Segmented
            ariaLabel={t('stats.title')}
            value={preset}
            onChange={(p) => {
              soundscape.playTick();
              setParams({ preset: p });
            }}
            options={PRESETS.map((p) => ({ value: p, label: t(`preset.${p}` as MessageKey) }))}
          />
          {preset === 'custom' && (
            <span className="flex items-center gap-2">
              <input type="date" className="input w-auto py-1.5 text-xs" aria-label={t('stats.fromLabel')} value={customFrom} onChange={(e) => setParams({ from: e.target.value })} />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('stats.to')}</span>
              <input type="date" className="input w-auto py-1.5 text-xs" aria-label={t('stats.toLabel')} value={customTo} onChange={(e) => setParams({ to: e.target.value })} />
            </span>
          )}
          <select className="input py-1.5 text-xs" style={{ width: 132 }} value={granularity} onChange={(e) => setParams({ gran: e.target.value })} aria-label={t('stats.granularityLabel')}>
            <option value="auto">{t('gran.auto')}</option>
            <option value="day">{t('gran.day')}</option>
            <option value="week">{t('gran.week')}</option>
            <option value="month">{t('gran.month')}</option>
          </select>
        </div>
      </div>

      {/* 核心指标卡片（支持顺滑数字滚动 + 磁吸微立体质感） */}
      <AnalyticsMetricsGrid
        stats={stats}
        deltaPct={deltaPct}
        streak={streak}
        span={span}
      />

      {/* 多科目趋势 */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="display flex items-center gap-2 text-lg"><Layers size={17} /> {t('trend.title')}</h2>
            <p className="chart-title mt-1">{t('trend.subtitle', { gran: granName })}</p>
          </div>
          {bestDay && bestDay.seconds > 0 && <span className="chart-title">{t('trend.peak', { date: bestDay.date, dur: fmtDuration(bestDay.seconds) })}</span>}
        </div>
        <div
          className="relative"
          role="img"
          aria-label={t('trend.aria', {
            total: fmtDuration(stats.totalSeconds),
            peak: bestDay && bestDay.seconds > 0 ? t('trend.peakPart', { date: bestDay.date, dur: fmtDuration(bestDay.seconds) }) : '',
          })}
        >
          <div ref={trendRef} className="h-64" />
          {stats.entryCount === 0 && <ChartEmpty text={t('chart.empty')} />}
        </div>
        <p className="sr-only">
          {majorSeries.series.length > 0
            ? t('trend.srAll', { list: majorSeries.series.map((s) => `${s.name} ${fmtDuration(s.data.reduce((sum, v) => sum + v, 0))}`).join(', ') })
            : t('trend.srNone')}
        </p>
      </section>

      {/* 扇形图 + 排行 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="display flex items-center gap-2 text-lg"><BarChart3 size={17} /> {t('pie.title')}</h2>
              <p className="chart-title mt-0.5">{t('pie.subtitle')}</p>
            </div>
            {stats.totalSeconds > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-black/[0.03] px-3 py-1 text-xs dark:bg-white/[0.04]">
                <span className="text-[var(--text-tertiary)]">总投入:</span>
                <span className="tick-text font-bold text-[var(--accent)]">{fmtDuration(stats.totalSeconds)}</span>
              </div>
            )}
          </div>

          {/* 圆盘外直观统计看板 */}
          {stats.totalSeconds > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-[var(--border-soft)] bg-black/[0.02] px-3.5 py-2.5 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-tertiary)]">总学习投入:</span>
                <span className="tick-text text-base font-extrabold text-[var(--ink)]">
                  {fmtDuration(stats.totalSeconds)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                <span>{stats.categories.filter((c) => c.totalSeconds > 0).length} 个核心领域</span>
                {topSubject && topSubject.totalSeconds > 0 && (
                  <span className="hidden sm:inline border-l border-[var(--border-soft)] pl-3 text-[var(--accent)] font-semibold">
                    最多: {catName(topSubject.categoryId)}
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            className="relative"
            role="img"
            aria-label={topSubject && topSubject.totalSeconds > 0
              ? t('pie.ariaTop', { name: catName(topSubject.categoryId), dur: fmtDuration(topSubject.totalSeconds), pct: Math.round(topSubject.share * 100) })
              : t('pie.ariaEmpty')}
          >
            <div ref={pieRef} className="h-72" />
            {stats.totalSeconds === 0 && <ChartEmpty text={t('chart.empty')} />}
          </div>
          {topSubject && topSubject.totalSeconds > 0 && (
            <p className="chart-title text-center mt-2">
              {t('pie.top', { name: catName(topSubject.categoryId), dur: fmtDuration(topSubject.totalSeconds), pct: Math.round(topSubject.share * 100) })}
            </p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><BarChart3 size={17} /> {t('rank.title')}</h2>
          <p className="chart-title mb-2">{t('rank.subtitle')}</p>
          <div
            className="relative"
            role="img"
            aria-label={ranking.length > 0
              ? t('rank.ariaTop', { list: ranking.slice(0, 3).map((r) => `${r.name} ${fmtDuration(r.seconds)}`).join(', ') })
              : t('rank.ariaEmpty')}
          >
            <div ref={rankRef} className="h-72" />
            {stats.totalSeconds === 0 && <ChartEmpty text={t('chart.empty')} />}
          </div>
        </section>
      </div>

      {/* 小时分布 + 单次时长分布 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><Clock3 size={17} /> {t('hour.title')}</h2>
          <p className="chart-title mb-2">
            {t('hour.subtitle', { pct: Math.round(stats.rangeCoverage * 100), dur: fmtDuration(stats.unspecifiedSeconds) })}
          </p>
          <div
            className="relative"
            role="img"
            aria-label={t('hour.aria', { pct: Math.round(stats.rangeCoverage * 100) })}
          >
            <div ref={hourRef} className="h-52" />
            {stats.byHour.every((h) => h.seconds === 0) && <ChartEmpty text={t('chart.empty')} />}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> {t('dist.title')}</h2>
          <p className="chart-title mb-2">{t('dist.subtitle')}</p>
          <div
            className="relative"
            role="img"
            aria-label={t('dist.aria', { list: distAria })}
          >
            <div ref={distRef} className="h-52" />
            {durationDist.every((b) => b.count === 0) && <ChartEmpty text={t('chart.empty')} />}
          </div>
        </section>
      </div>

      {/* 活动明细表 */}
      <section className="card p-5">
        <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> {t('table.title')}</h2>
        <p className="chart-title mb-3">{t('table.subtitle')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-125 text-sm">
            <caption className="sr-only">{t('table.caption')}</caption>
            <thead>
              <tr className="border-b text-left hairline">
                <th className="py-2 pr-4 font-medium" scope="col">{t('table.activity')}</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">{t('table.count')}</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">{t('table.duration')}</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">{t('table.share')}</th>
                <th className="py-2 font-medium" scope="col">{t('table.mix')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const activityAgg = new Map<string, { seconds: number; count: number }>();
                for (const e of entries ?? []) {
                  const seconds = entrySecondsInRange(e, range.from, range.to);
                  if (seconds <= 0) continue;
                  const a = activityAgg.get(e.activityId) ?? { seconds: 0, count: 0 };
                  a.seconds += seconds; a.count += 1;
                  activityAgg.set(e.activityId, a);
                }
                const rows = [...activityAgg.entries()]
                  .map(([id, v]) => ({ id, ...v, name: catName(id) }))
                  .sort((a, b) => b.seconds - a.seconds);
                if (rows.length === 0) {
                  return (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-sm opacity-60">{t('chart.empty')}</td>
                    </tr>
                  );
                }
                const max = Math.max(1, ...rows.map((r) => r.seconds));
                return rows.map((r) => {
                  const a = byId.get(r.id);
                  const s = a?.parentId ? byId.get(a.parentId) : undefined;
                  const mj = s?.parentId ? byId.get(s.parentId) : undefined;
                  const openDrill = () => {
                    setDrill({ title: `${r.name} · ${range.from} → ${range.to}`, entries: (entries ?? []).filter((e) => e.activityId === r.id && entrySecondsInRange(e, range.from, range.to) > 0) });
                  };
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-label={t('table.rowAria', { name: r.name })}
                      className="cursor-pointer border-b hairline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      onClick={openDrill}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrill(); } }}
                    >
                      <td className="py-2 pr-4">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: a?.color ?? '#888' }} />
                        <span className="opacity-60">{mj?.name} / {s?.name} / </span>{r.name}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.count}</td>
                      <td className="py-2 pr-4 text-right font-semibold tabular-nums">{fmtDuration(r.seconds)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{stats.totalSeconds > 0 ? Math.round((r.seconds / stats.totalSeconds) * 100) : 0}%</td>
                      <td className="py-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(r.seconds / max) * 100}%`, background: a?.color ?? '#888' }} />
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* 热力图（GitHub 贡献图风格） */}
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-lg">{t('heat.title')}</h2>
          <div className="flex items-center gap-2">
            <label className="chart-title" htmlFor="heat-day-input">{t('heat.pick')}</label>
            <input
              id="heat-day-input"
              type="date"
              className="input w-auto py-1.5 text-xs"
              onChange={(e) => {
                const day = e.target.value;
                if (!day) return;
                setDrill({ title: t('heat.drillTitle', { day }), entries: (entries ?? []).filter((en) => !en.deletedAt && (entrySecondsByLocalDay(en)[day] ?? 0) > 0) });
              }}
            />
          </div>
        </div>
        <p className="chart-title mb-2">
          {t('heat.summary', { days: heatSummary.activeDays, total: fmtDuration(heatSummary.total) })}
        </p>
        <div
          className="relative"
          role="img"
          aria-label={t('heat.aria', { current: streak.current, best: streak.longest })}
        >
          <div ref={heatRef} className="h-32" />
          {stats.byDay.every((d) => d.seconds === 0) && <ChartEmpty text={t('chart.empty')} />}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="chart-title">{t('heat.less')}</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ background: chartPalette().heat[i] }}
              aria-hidden
            />
          ))}
          <span className="chart-title">{t('heat.more')}</span>
        </div>
      </section>

      {/* 状态与打断 */}
      {(Object.keys(stats.moodDistribution).length > 0 || Object.keys(stats.interruptionCounts).length > 0) && (
        <div className="card grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <h2 className="display mb-2 text-lg">{t('mood.title')}</h2>
            {Object.keys(stats.moodDistribution).length === 0
              ? <p className="text-sm opacity-50">{t('mood.empty')}</p>
              : (
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const count = stats.moodDistribution[n] ?? 0;
                    const total = Object.values(stats.moodDistribution).reduce((sum, v) => sum + v, 0);
                    return (
                      <div key={n} className="flex items-center gap-2 text-sm">
                        <span className="w-8 shrink-0 tabular-nums">{n}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                          <div className="h-full rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, background: 'var(--accent)' }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs opacity-60">{t('mood.count', { count })}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            <p className="mt-2 text-xs opacity-40">{t('mood.hint')}</p>
          </div>
          <div>
            <h2 className="display mb-2 text-lg">{t('interruption.title')}</h2>
            {Object.keys(stats.interruptionCounts).length === 0
              ? <p className="text-sm opacity-50">{t('interruption.empty')}</p>
              : (
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(stats.interruptionCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums opacity-60">{t('interruption.times', { count: v })}</span></li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      )}

      {drill && <DrillModal title={drill.title} entries={drill.entries} onClose={() => setDrill(null)} />}
      <div className="flex justify-center pb-2 text-slate-300 dark:text-slate-700">
        <ChevronRight size={0} />
      </div>
    </div>
  );
}
