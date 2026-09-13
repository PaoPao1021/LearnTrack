import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { Modal } from '../../components/common/Modal';
import { Segmented } from '../../components/common/Segmented';
import { THEME_CHANGE_EVENT } from '../settings/useTheme';
import {
  computeStats, formatDuration, previousRange, daysBetweenInclusive,
  entrySecondsByLocalDay,
} from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import {
  CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { StatsResult, CategoryTotals, Category, EntryRecord } from '@learntrack/domain';
import { ChevronRight, Layers, BarChart3, Clock3, Flame, ListChecks } from 'lucide-react';

echarts.use([
  BarChart, HeatmapChart, LineChart, PieChart,
  CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent,
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
  return {
    accent: cssVar('--accent', '#007aff'),
    label: cssVar('--chart-label', '#566070'),
    line: cssVar('--chart-line', 'rgba(23,30,46,0.12)'),
    grid: cssVar('--chart-grid', 'rgba(23,30,46,0.07)'),
    prev: cssVar('--chart-label', '#9ca3af'),
  };
}

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
    const chart = echarts.init(ref.current);
    setOptions(chart);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
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
      name: byId.get(majorId)?.name ?? '未知',
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
  return (
    <Modal labelledBy="drill-title" onClose={onClose} panelClassName="modal-panel glass-emphasis max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
      <h2 id="drill-title" className="display mb-3 text-lg">{title}</h2>
      {entries.length === 0 && <p className="text-sm opacity-60">没有记录。</p>}
      <ul className="space-y-2 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, var(--ink) 5%, transparent)' }}>
            <span className="font-semibold">{formatDuration(e.durationSeconds)}</span>
            {e.startedAt != null && (
              <span className="ml-2 text-xs opacity-60">
                {new Date(e.startedAt).toLocaleString('zh-CN', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 起
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
function ChartEmpty({ text = '所选范围内暂无记录' }: { text?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="text-sm opacity-60">{text}</p>
    </div>
  );
}

export default function Analytics() {
  // 预设、自定义范围与粒度保存在 URL：刷新、返回、分享链接都能还原上下文
  const [searchParams, setSearchParams] = useSearchParams();
  const PRESETS: Preset[] = ['day', 'week', 'month', 'year', 'custom'];
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
  // 主题切换（深浅色 / 强调色）后重绘图表，读取新的调色令牌
  const [themeTick, bumpThemeTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => bumpThemeTick();
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
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

  // 主趋势：各科目叠加曲线 + 上期总量灰色虚线（按索引对齐）
  const trendRef = useChart((chart) => {
    const palette = chartPalette();
    const currentByDay = new Map(stats.byDay.map((d) => [d.date, d.seconds]));
    const previousByDay = new Map(prevStats.byDay.map((d) => [d.date, d.seconds]));
    const cur = aggregateSeries(majorSeries.days.map((day) => currentByDay.get(day) ?? 0), majorSeries.days);
    const prevAgg = aggregateSeries(prevMajorSeries.days.map((day) => previousByDay.get(day) ?? 0), prevMajorSeries.days);
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v)) },
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
          name: s.name, type: 'line' as const, smooth: true, symbol: 'none',
          data: aggregateSeries(s.data, majorSeries.days).values,
          lineStyle: { width: 2.5, color: s.color }, itemStyle: { color: s.color },
          areaStyle: { opacity: 0.08, color: s.color },
        })),
        {
          name: '上期', type: 'line' as const, smooth: true, symbol: 'none',
          data: prevAgg.values, lineStyle: { width: 1.5, type: 'dashed', opacity: 0.5 },
          itemStyle: { color: palette.prev },
        },
      ],
    });
  }, [stats.byDay, prevStats.byDay, majorSeries, prevMajorSeries, gran, themeTick]);

  // 扇形图：双层环，内环大科目，外环具体科目；点击下钻原始记录（零值分类不参与渲染）
  const pieRef = useChart((chart) => {
    const palette = chartPalette();
    const inner = stats.categories.map((c) => ({ name: catName(c.categoryId), value: c.totalSeconds, id: c.categoryId })).filter((d) => d.value > 0);
    const outer = stats.categories.flatMap((m) =>
      m.children.map((s) => ({ name: catName(s.categoryId), value: s.totalSeconds, id: s.categoryId })),
    ).filter((d) => d.value > 0);
    const colorOf = (id: string) => byId.get(id)?.color;
    chart.setOption({
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${formatDuration(p.value)}（${p.percent}%）` },
      legend: { bottom: 0, textStyle: { fontSize: 10, color: palette.label }, type: 'scroll' },
      series: [
        {
          type: 'pie', radius: ['34%', '52%'], label: { show: false },
          data: inner.map((d) => ({ ...d, itemStyle: { color: colorOf(d.id) } })),
        },
        {
          type: 'pie', radius: ['62%', '78%'], label: { show: false },
          data: outer.map((d) => ({ ...d, itemStyle: { color: colorOf(d.id), opacity: 0.55 } })),
        },
      ],
    });
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
      setDrill({ title: `${catName(id)} 的记录（${range.from} 至 ${range.to}）`, entries: hits });
    });
  }, [stats.categories, categories, entries, range.from, range.to, themeTick]);

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
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatDuration(Number(v)) },
      grid: { left: 90, right: 52, top: 8, bottom: 8 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: ranking.map((r) => r.name), axisLabel: { fontSize: 11, color: palette.label } },
      series: [{
        type: 'bar', barWidth: 12, borderRadius: 6,
        data: ranking.map((r) => ({ value: r.seconds, itemStyle: { color: r.color } })),
        label: { show: true, position: 'right', fontSize: 10, color: palette.label, formatter: (p: { value: number }) => `${(p.value / 3600).toFixed(1)}h` },
      }],
    });
  }, [ranking, themeTick]);

  // 单次时长分布
  const durationDist = useMemo(() => {
    const buckets = [
      { label: '<30 分钟', min: 0, max: 1800, count: 0 },
      { label: '30–60 分钟', min: 1800, max: 3600, count: 0 },
      { label: '1–2 小时', min: 3600, max: 7200, count: 0 },
      { label: '2 小时以上', min: 7200, max: Infinity, count: 0 },
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
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 40, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: durationDist.map((b) => b.label), axisLabel: { fontSize: 10, color: palette.label }, axisLine: { lineStyle: { color: palette.line } } },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 3, axisLabel: { color: palette.label }, splitLine: { lineStyle: { color: palette.grid } } },
      series: [{ type: 'bar', barWidth: 26, borderRadius: [6, 6, 0, 0], data: durationDist.map((b) => b.count), itemStyle: { color: palette.accent } }],
    });
  }, [durationDist, themeTick]);

  const hourRef = useChart((chart) => {
    const palette = chartPalette();
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v)) },
      grid: { left: 44, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: stats.byHour.map((h) => `${h.hour}`), axisLabel: { fontSize: 10, color: palette.label }, axisLine: { lineStyle: { color: palette.line } } },
      yAxis: {
        type: 'value', splitNumber: 3,
        axisLabel: { formatter: (v: number) => `${Math.round(v / 3600)}h`, color: palette.label },
        splitLine: { lineStyle: { color: palette.grid } },
      },
      series: [{ type: 'bar', barWidth: '70%', borderRadius: [4, 4, 0, 0], data: stats.byHour.map((h) => h.seconds), itemStyle: { color: palette.accent } }],
    });
  }, [stats.byHour, themeTick]);

  const heatRef = useChart((chart) => {
    const palette = chartPalette();
    const yearStart = `${todayKey().slice(0, 4)}-01-01`;
    const data = stats.byDay.map((d) => [d.date, d.seconds]);
    chart.setOption({
      tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0]}: ${formatDuration(p.value[1])}` },
      visualMap: { min: 0, max: Math.max(4 * 3600, ...stats.byDay.map((d) => d.seconds)), show: false },
      calendar: {
        range: [yearStart, todayKey()],
        cellSize: ['auto', 14],
        left: 48, top: 24,
        itemStyle: { color: 'rgba(128,128,128,0.12)', borderColor: 'transparent' },
        dayLabel: { color: palette.label },
        monthLabel: { color: palette.label },
        yearLabel: { show: false },
      },
      series: [{
        type: 'heatmap', coordinateSystem: 'calendar', data,
        itemStyle: { borderRadius: 3 },
      }],
    });
    chart.off('click');
    chart.on('click', (params: unknown) => {
      const day = (params as { value?: [string, number] }).value?.[0];
      if (!day) return;
      setDrill({ title: `${day} 的记录`, entries: (entries ?? []).filter((e) => !e.deletedAt && (entrySecondsByLocalDay(e)[day] ?? 0) > 0) });
    });
  }, [stats.byDay, entries, themeTick]);

  const deltaPct = prevStats.totalSeconds > 0
    ? Math.round(((stats.totalSeconds - prevStats.totalSeconds) / prevStats.totalSeconds) * 100)
    : null;
  const bestDay = [...stats.byDay].sort((a, b) => b.seconds - a.seconds)[0];
  const topSubject = stats.categories.flatMap((m) => m.children).sort((a, b) => b.totalSeconds - a.totalSeconds)[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl">统计</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 md:justify-end">
          <Segmented
            ariaLabel="统计范围"
            value={preset}
            onChange={(p) => setParams({ preset: p })}
            options={[
              { value: 'day', label: '今日' },
              { value: 'week', label: '本周' },
              { value: 'month', label: '本月' },
              { value: 'year', label: '今年' },
              { value: 'custom', label: '自定义' },
            ] as const}
          />
          {preset === 'custom' && (
            <span className="flex items-center gap-2">
              <input type="date" className="input w-auto py-1.5 text-xs" aria-label="开始日期" value={customFrom} onChange={(e) => setParams({ from: e.target.value })} />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>至</span>
              <input type="date" className="input w-auto py-1.5 text-xs" aria-label="结束日期" value={customTo} onChange={(e) => setParams({ to: e.target.value })} />
            </span>
          )}
          <select className="input py-1.5 text-xs" style={{ width: 132 }} value={granularity} onChange={(e) => setParams({ gran: e.target.value })} aria-label="趋势粒度">
            <option value="auto">粒度：自动</option>
            <option value="day">按日</option>
            <option value="week">按周</option>
            <option value="month">按月</option>
          </select>
        </div>
      </div>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-3.5 text-center">
          <div className="tick-text text-lg font-semibold">{formatDuration(stats.totalSeconds)}</div>
          <div className="chart-title mt-1">总时长{deltaPct != null && ` · 上期${deltaPct >= 0 ? '+' : ''}${deltaPct}%`}</div>
        </div>
        <div className="card p-3.5 text-center">
          <div className="tick-text text-lg font-semibold">{stats.entryCount}</div>
          <div className="chart-title mt-1">记录次数</div>
        </div>
        <div className="card p-3.5 text-center">
          <div className="tick-text text-lg font-semibold">{formatDuration(stats.avgPerCalendarDaySeconds)}</div>
          <div className="chart-title mt-1">自然日日均（{span} 天）</div>
        </div>
        <div className="card p-3.5 text-center">
          <div className="tick-text text-lg font-semibold">{formatDuration(stats.avgPerActiveDaySeconds)}</div>
          <div className="chart-title mt-1">有记录日日均（{stats.activeDayCount} 天）</div>
        </div>
        <div className="card p-3.5 text-center">
          <div className="tick-text flex items-center justify-center gap-1 text-lg font-semibold"><Flame size={15} className="text-orange-500" />{streak.current}</div>
          <div className="chart-title mt-1">连续天数（最长 {streak.longest}）</div>
        </div>
        <div className="card p-3.5 text-center">
          <div className="tick-text text-lg font-semibold">{Math.round(stats.rangeCoverage * 100)}%</div>
          <div className="chart-title mt-1">时间段覆盖率</div>
        </div>
      </div>

      {/* 多科目趋势 */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="display flex items-center gap-2 text-lg"><Layers size={17} /> 学习趋势 · 科目叠加</h2>
            <p className="chart-title mt-1">实线为各大科目（{gran === 'day' ? '按日' : gran === 'week' ? '按周' : '按月'}），虚线为上一同长度区间总量对比</p>
          </div>
          {bestDay && <span className="chart-title">单日峰值 {bestDay.date} · {formatDuration(bestDay.seconds)}</span>}
        </div>
        <div
          className="relative"
          role="img"
          aria-label={`学习趋势图：范围内总时长 ${formatDuration(stats.totalSeconds)}${bestDay ? `，单日峰值 ${bestDay.date} ${formatDuration(bestDay.seconds)}` : ''}。文字版见下方活动明细表。`}
        >
          <div ref={trendRef} className="h-64" />
          {stats.entryCount === 0 && <ChartEmpty />}
        </div>
        <p className="sr-only">
          {majorSeries.series.length > 0
            ? `各科目总时长：${majorSeries.series.map((s) => `${s.name} ${formatDuration(s.data.reduce((sum, v) => sum + v, 0))}`).join('，')}`
            : '各科目暂无时长记录'}
        </p>
      </section>

      {/* 扇形图 + 排行 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><BarChart3 size={17} /> 科目分布</h2>
          <p className="chart-title mb-2">内环大科目 · 外环具体科目 · 原始记录请用下方活动明细表（键盘可用）</p>
          <div
            className="relative"
            role="img"
            aria-label={topSubject
              ? `科目分布环形图：投入最多 ${catName(topSubject.categoryId)}，${formatDuration(topSubject.totalSeconds)}，占 ${Math.round(topSubject.share * 100)}%`
              : '科目分布环形图：暂无数据'}
          >
            <div ref={pieRef} className="h-72" />
            {stats.totalSeconds === 0 && <ChartEmpty />}
          </div>
          {topSubject && (
            <p className="chart-title text-center">
              投入最多：{catName(topSubject.categoryId)} · {formatDuration(topSubject.totalSeconds)}（{Math.round(topSubject.share * 100)}%）
            </p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><BarChart3 size={17} /> 具体科目排行</h2>
          <p className="chart-title mb-2">所选范围内 Top 10</p>
          <div
            className="relative"
            role="img"
            aria-label={ranking.some((r) => r.seconds > 0)
              ? `具体科目排行：${ranking.slice(0, 3).map((r) => `${r.name} ${formatDuration(r.seconds)}`).join('，')}`
              : '具体科目排行：暂无数据'}
          >
            <div ref={rankRef} className="h-72" />
            {stats.totalSeconds === 0 && <ChartEmpty />}
          </div>
        </section>
      </div>

      {/* 小时分布 + 单次时长分布 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><Clock3 size={17} /> 小时分布</h2>
          <p className="chart-title mb-2">
            仅真实时间段记录（覆盖率 {Math.round(stats.rangeCoverage * 100)}%）· 未指定时段 {formatDuration(stats.unspecifiedSeconds)} 不随机分配
          </p>
          <div
            className="relative"
            role="img"
            aria-label={`小时分布图：时间段记录覆盖率 ${Math.round(stats.rangeCoverage * 100)}%`}
          >
            <div ref={hourRef} className="h-52" />
            {stats.byHour.every((h) => h.seconds === 0) && <ChartEmpty />}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> 单次时长分布</h2>
          <p className="chart-title mb-2">一次记录的长短习惯（条数）</p>
          <div
            className="relative"
            role="img"
            aria-label={`单次时长分布：${durationDist.map((b) => `${b.label} ${b.count} 条`).join('，')}`}
          >
            <div ref={distRef} className="h-52" />
            {durationDist.every((b) => b.count === 0) && <ChartEmpty />}
          </div>
        </section>
      </div>

      {/* 活动明细表 */}
      <section className="card p-5">
        <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> 活动明细</h2>
        <p className="chart-title mb-3">活动级汇总，点击行或按回车查看原始记录（图表的键盘等价操作）</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-125 text-sm">
            <caption className="sr-only">所选时间范围内各活动的次数、时长与占比</caption>
            <thead>
              <tr className="border-b text-left hairline">
                <th className="py-2 pr-4 font-medium" scope="col">活动</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">次数</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">时长</th>
                <th className="py-2 pr-4 text-right font-medium" scope="col">占比</th>
                <th className="py-2 font-medium" scope="col">分布</th>
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
                      <td colSpan={5} className="py-6 text-center text-sm opacity-60">所选范围内暂无记录</td>
                    </tr>
                  );
                }
                const max = Math.max(1, ...rows.map((r) => r.seconds));
                return rows.map((r) => {
                  const a = byId.get(r.id);
                  const s = a?.parentId ? byId.get(a.parentId) : undefined;
                  const mj = s?.parentId ? byId.get(s.parentId) : undefined;
                  const openDrill = () => {
                    setDrill({ title: `${r.name} 的记录（${range.from} 至 ${range.to}）`, entries: (entries ?? []).filter((e) => e.activityId === r.id && entrySecondsInRange(e, range.from, range.to) > 0) });
                  };
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-label={`查看 ${r.name} 的原始记录`}
                      className="cursor-pointer border-b hairline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      onClick={openDrill}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrill(); } }}
                    >
                      <td className="py-2 pr-4">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: a?.color ?? '#888' }} />
                        <span className="opacity-60">{mj?.name} / {s?.name} / </span>{r.name}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.count}</td>
                      <td className="py-2 pr-4 text-right font-semibold tabular-nums">{formatDuration(r.seconds)}</td>
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

      {/* 热力图 */}
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-lg">学习热力图</h2>
          <div className="flex items-center gap-2">
            <label className="chart-title" htmlFor="heat-day-input">查看某日明细</label>
            <input
              id="heat-day-input"
              type="date"
              className="input w-auto py-1.5 text-xs"
              onChange={(e) => {
                const day = e.target.value;
                if (!day) return;
                setDrill({ title: `${day} 的记录`, entries: (entries ?? []).filter((en) => !en.deletedAt && (entrySecondsByLocalDay(en)[day] ?? 0) > 0) });
              }}
            />
          </div>
        </div>
        <p className="chart-title mb-2">本年度按日展示</p>
        <div
          className="relative"
          role="img"
          aria-label={`本年度学习热力图：当前连续学习 ${streak.current} 天，最长连续 ${streak.longest} 天`}
        >
          <div ref={heatRef} className="h-40" />
          {stats.byDay.every((d) => d.seconds === 0) && <ChartEmpty />}
        </div>
      </section>

      {/* 状态与打断 */}
      {(Object.keys(stats.moodDistribution).length > 0 || Object.keys(stats.interruptionCounts).length > 0) && (
        <div className="card grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <h2 className="display mb-2 text-lg">自评状态分布</h2>
            {Object.keys(stats.moodDistribution).length === 0
              ? <p className="text-sm opacity-50">暂无评分</p>
              : (
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const count = stats.moodDistribution[n] ?? 0;
                    const total = Object.values(stats.moodDistribution).reduce((sum, v) => sum + v, 0);
                    return (
                      <div key={n} className="flex items-center gap-2 text-sm">
                        <span className="w-8 shrink-0 tabular-nums">{n} 分</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                          <div className="h-full rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, background: 'var(--accent)' }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs opacity-60">{count} 条</span>
                      </div>
                    );
                  })}
                </div>
              )}
            <p className="mt-2 text-xs opacity-40">未评分的记录不按零分处理。</p>
          </div>
          <div>
            <h2 className="display mb-2 text-lg">打断原因</h2>
            {Object.keys(stats.interruptionCounts).length === 0
              ? <p className="text-sm opacity-50">暂无填写（未填写不等于没有打断）</p>
              : (
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(stats.interruptionCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums opacity-60">{v} 次</span></li>
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
