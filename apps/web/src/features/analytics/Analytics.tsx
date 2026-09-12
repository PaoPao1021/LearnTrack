import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import {
  computeStats, formatDuration, previousRange, daysBetweenInclusive,
  splitRangeByLocalDay,
} from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import * as echarts from 'echarts';
import type { StatsResult, CategoryTotals, Category, EntryRecord } from '@learntrack/domain';
import { ChevronRight, Layers, BarChart3, Clock3, Flame, ListChecks } from 'lucide-react';

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type Granularity = 'auto' | 'day' | 'week' | 'month';

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
    if (e.learningDate < from || e.learningDate > to) continue;
    const major = majorOf(e.activityId);
    if (!major) continue;
    let perDay = maps.get(major.id);
    if (!perDay) { perDay = new Map(); maps.set(major.id, perDay); }
    if (e.startedAt != null && e.endedAt != null) {
      const buckets = splitRangeByLocalDay(e.startedAt, e.endedAt, e.timeZone, e.pauseIntervals ?? []);
      for (const [day, s] of Object.entries(buckets)) {
        if (day >= from && day <= to) perDay.set(day, (perDay.get(day) ?? 0) + s);
      }
    } else {
      perDay.set(e.learningDate, (perDay.get(e.learningDate) ?? 0) + e.durationSeconds);
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
  const days = new Set(entries.filter((e) => !e.deletedAt).map((e) => e.learningDate));
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

function DrillModal({ title, entries, onClose }: { title: string; entries: EntryRecord[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[80vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="display mb-3 text-lg">{title}</h2>
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
      </div>
    </div>
  );
}

export default function Analytics() {
  const [preset, setPreset] = useState<Preset>('week');
  const [customFrom, setCustomFrom] = useState(todayKey());
  const [customTo, setCustomTo] = useState(todayKey());
  const [granularity, setGranularity] = useState<Granularity>('auto');
  const entries = useLiveQuery(() => db.entries.toArray(), [], [] as EntryRecord[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const [drill, setDrill] = useState<{ title: string; entries: EntryRecord[] } | null>(null);

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
    const cur = aggregateSeries(stats.byDay.map((d) => d.seconds), stats.byDay.map((d) => d.date));
    const prevAgg = aggregateSeries(prevStats.byDay.map((d) => d.seconds), prevStats.byDay.map((d) => d.date));
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v)) },
      legend: { top: 0, textStyle: { fontSize: 11 } },
      grid: { left: 48, right: 12, top: 36, bottom: 24 },
      xAxis: { type: 'category', data: cur.labels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', splitNumber: 4, axisLabel: { formatter: (v: number) => `${Math.round(v / 3600)}h` } },
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
          itemStyle: { color: '#9ca3af' },
        },
      ],
    });
  }, [stats.byDay, prevStats.byDay, majorSeries, prevMajorSeries, gran]);

  // 扇形图：双层环，内环大科目，外环具体科目；点击下钻原始记录
  const pieRef = useChart((chart) => {
    const inner = stats.categories.map((c) => ({ name: catName(c.categoryId), value: c.totalSeconds, id: c.categoryId }));
    const outer = stats.categories.flatMap((m) =>
      m.children.map((s) => ({ name: catName(s.categoryId), value: s.totalSeconds, id: s.categoryId })),
    );
    const colorOf = (id: string) => byId.get(id)?.color;
    chart.setOption({
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}：${formatDuration(p.value)}（${p.percent}%）` },
      legend: { bottom: 0, textStyle: { fontSize: 10 }, type: 'scroll' },
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
        if (e.deletedAt || e.learningDate < range.from || e.learningDate > range.to) return false;
        return e.activityId === id || childIds.has(e.activityId)
          || (() => {
            const activity = byId.get(e.activityId);
            const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
            return subject?.parentId === id;
          })();
      });
      setDrill({ title: `${catName(id)} 的记录（${range.from} 至 ${range.to}）`, entries: hits });
    });
  }, [stats.categories, categories, entries, range.from, range.to]);

  // 科目排行（具体科目横向条形）
  const ranking = useMemo(() => {
    const list: { name: string; color: string; seconds: number }[] = [];
    for (const m of stats.categories) {
      for (const s of m.children) {
        list.push({ name: catName(s.categoryId), color: byId.get(s.categoryId)?.color ?? '#888', seconds: s.totalSeconds });
      }
    }
    return list.sort((a, b) => b.seconds - a.seconds).slice(0, 10);
  }, [stats.categories, categories]);

  const rankRef = useChart((chart) => {
    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => formatDuration(Number(v)) },
      grid: { left: 90, right: 52, top: 8, bottom: 8 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: ranking.map((r) => r.name), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar', barWidth: 12, borderRadius: 6,
        data: ranking.map((r) => ({ value: r.seconds, itemStyle: { color: r.color } })),
        label: { show: true, position: 'right', fontSize: 10, formatter: (p: { value: number }) => `${(p.value / 3600).toFixed(1)}h` },
      }],
    });
  }, [ranking]);

  // 单次时长分布
  const durationDist = useMemo(() => {
    const buckets = [
      { label: '<30 分钟', min: 0, max: 1800, count: 0 },
      { label: '30–60 分钟', min: 1800, max: 3600, count: 0 },
      { label: '1–2 小时', min: 3600, max: 7200, count: 0 },
      { label: '2 小时以上', min: 7200, max: Infinity, count: 0 },
    ];
    for (const e of entries ?? []) {
      if (e.deletedAt || e.learningDate < range.from || e.learningDate > range.to) continue;
      const b = buckets.find((x) => e.durationSeconds >= x.min && e.durationSeconds < x.max);
      if (b) b.count += 1;
    }
    return buckets;
  }, [entries, range.from, range.to]);

  const distRef = useChart((chart) => {
    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 40, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: durationDist.map((b) => b.label), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 3 },
      series: [{ type: 'bar', barWidth: 26, borderRadius: [6, 6, 0, 0], data: durationDist.map((b) => b.count), itemStyle: { color: '#2f5cff' } }],
    });
  }, [durationDist]);

  const hourRef = useChart((chart) => {
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatDuration(Number(v)) },
      grid: { left: 44, right: 12, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: stats.byHour.map((h) => `${h.hour}`), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', splitNumber: 3, axisLabel: { formatter: (v: number) => `${Math.round(v / 3600)}h` } },
      series: [{ type: 'bar', barWidth: '70%', borderRadius: [4, 4, 0, 0], data: stats.byHour.map((h) => h.seconds), itemStyle: { color: '#2f5cff' } }],
    });
  }, [stats.byHour]);

  const heatRef = useChart((chart) => {
    const yearStart = `${todayKey().slice(0, 4)}-01-01`;
    const data = stats.byDay.map((d) => [d.date, d.seconds]);
    chart.setOption({
      tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0]}: ${formatDuration(p.value[1])}` },
      visualMap: { min: 0, max: Math.max(4 * 3600, ...stats.byDay.map((d) => d.seconds)), show: false },
      calendar: {
        range: [yearStart, todayKey()],
        cellSize: ['auto', 14],
        left: 48, top: 24,
        itemStyle: { color: 'rgba(128,128,128,0.12)' },
        yearLabel: { show: false },
      },
      series: [{
        type: 'heatmap', coordinateSystem: 'calendar', data,
        itemStyle: { borderRadius: 3 },
        onClick: (params: { value: [string, number] }) => {
          const day = params.value[0];
          setDrill({ title: `${day} 的记录`, entries: (entries ?? []).filter((e) => e.learningDate === day && !e.deletedAt) });
        },
      }],
    });
  }, [stats.byDay, entries]);

  const deltaPct = prevStats.totalSeconds > 0
    ? Math.round(((stats.totalSeconds - prevStats.totalSeconds) / prevStats.totalSeconds) * 100)
    : null;
  const bestDay = [...stats.byDay].sort((a, b) => b.seconds - a.seconds)[0];
  const topSubject = stats.categories.flatMap((m) => m.children).sort((a, b) => b.totalSeconds - a.totalSeconds)[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl">统计</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(['day', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
            <button key={p} className={preset === p ? 'btn-primary px-3.5 py-1.5 text-xs' : 'btn-ghost px-3.5 py-1.5 text-xs'} onClick={() => setPreset(p)}>
              {{ day: '今日', week: '本周', month: '本月', year: '今年', custom: '自定义' }[p]}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="flex items-center gap-2">
              <input type="date" className="input w-auto py-1.5 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-xs opacity-50">至</span>
              <input type="date" className="input w-auto py-1.5 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </span>
          )}
          <select className="input py-1.5 text-xs" style={{ width: 132 }} value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} aria-label="趋势粒度">
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
        <div ref={trendRef} className="h-64" />
      </section>

      {/* 扇形图 + 排行 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><BarChart3 size={17} /> 科目分布</h2>
          <p className="chart-title mb-2">内环大科目 · 外环具体科目 · 点击任意扇区查看原始记录</p>
          <div ref={pieRef} className="h-72" />
          {topSubject && (
            <p className="chart-title text-center">
              投入最多：{catName(topSubject.categoryId)} · {formatDuration(topSubject.totalSeconds)}（{Math.round(topSubject.share * 100)}%）
            </p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><BarChart3 size={17} /> 具体科目排行</h2>
          <p className="chart-title mb-2">所选范围内 Top 10</p>
          <div ref={rankRef} className="h-72" />
        </section>
      </div>

      {/* 小时分布 + 单次时长分布 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><Clock3 size={17} /> 小时分布</h2>
          <p className="chart-title mb-2">
            仅真实时间段记录（覆盖率 {Math.round(stats.rangeCoverage * 100)}%）· 未指定时段 {formatDuration(stats.unspecifiedSeconds)} 不随机分配
          </p>
          <div ref={hourRef} className="h-52" />
        </section>
        <section className="card p-5">
          <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> 单次时长分布</h2>
          <p className="chart-title mb-2">一次记录的长短习惯（条数）</p>
          <div ref={distRef} className="h-52" />
        </section>
      </div>

      {/* 活动明细表 */}
      <section className="card p-5">
        <h2 className="display mb-1 flex items-center gap-2 text-lg"><ListChecks size={17} /> 活动明细</h2>
        <p className="chart-title mb-3">活动级汇总，点击行查看原始记录</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-125 text-sm">
            <thead>
              <tr className="border-b text-left hairline">
                <th className="py-2 pr-4 font-medium">活动</th>
                <th className="py-2 pr-4 text-right font-medium">次数</th>
                <th className="py-2 pr-4 text-right font-medium">时长</th>
                <th className="py-2 pr-4 text-right font-medium">占比</th>
                <th className="py-2 font-medium">分布</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const activityAgg = new Map<string, { seconds: number; count: number }>();
                for (const e of entries ?? []) {
                  if (e.deletedAt || e.learningDate < range.from || e.learningDate > range.to) continue;
                  const a = activityAgg.get(e.activityId) ?? { seconds: 0, count: 0 };
                  a.seconds += e.durationSeconds; a.count += 1;
                  activityAgg.set(e.activityId, a);
                }
                const rows = [...activityAgg.entries()]
                  .map(([id, v]) => ({ id, ...v, name: catName(id) }))
                  .sort((a, b) => b.seconds - a.seconds);
                const max = Math.max(1, ...rows.map((r) => r.seconds));
                return rows.map((r) => {
                  const a = byId.get(r.id);
                  const s = a?.parentId ? byId.get(a.parentId) : undefined;
                  const mj = s?.parentId ? byId.get(s.parentId) : undefined;
                  return (
                    <tr key={r.id} className="cursor-pointer border-b hairline hover:opacity-80" onClick={() => {
                      setDrill({ title: `${r.name} 的记录（${range.from} 至 ${range.to}）`, entries: (entries ?? []).filter((e) => e.activityId === r.id && !e.deletedAt && e.learningDate >= range.from && e.learningDate <= range.to) });
                    }}>
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
        <h2 className="display mb-1 text-lg">学习热力图</h2>
        <p className="chart-title mb-2">本年度按日展示 · 点击某天查看明细</p>
        <div ref={heatRef} className="h-40" />
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
