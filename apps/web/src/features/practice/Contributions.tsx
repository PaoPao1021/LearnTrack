import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { ContributionData } from '@learntrack/contracts';
import { getSetting, setSetting } from '../../db/database';
import { loadContributions } from '../../services/extensions';

type Contribution = z.infer<typeof ContributionData>;
export function Contributions() {
  const [provider, setProvider] = useState<Contribution['provider']>('github'), [username, setUsername] = useState(''), [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<Contribution | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let cancelled = false; void getSetting<unknown>('contributionsCache', null).then((value) => { const parsed = ContributionData.safeParse(value); if (parsed.success && !cancelled) { setData(parsed.data); setProvider(parsed.data.provider); setUsername(parsed.data.username); setYear(parsed.data.year); } }); return () => { cancelled = true; }; }, []);
  const dates = Array.from({ length: Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000) }, (_, i) => new Date(Date.UTC(year, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const matching = data && data.provider === provider && data.username === username.trim() && data.year === year ? data : null;
  const counts = new Map(matching?.days.map((d) => [d.date, d.count]) ?? []);
  const offset = (new Date(`${year}-01-01T00:00:00Z`).getUTCDay() + 6) % 7;
  return <section className="work-section"><h2>GitHub / 力扣活动日历</h2><p className="muted text-sm mt-2">查看平台的贡献或提交次数，不换算为学习时长。力扣日历包含失败提交，不代表已解题数量。</p>
    <form className="contribution-filters mt-5" onSubmit={async (e) => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const value = await loadContributions(provider, username.trim(), year); setData(value); await setSetting('contributionsCache', value); } catch (e) { setError(e instanceof Error ? e.message : '日历加载失败'); } finally { setBusy(false); } }}>
      <label className="field flex-1 min-w-40">平台<select className="input" disabled={busy} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}><option value="github">GitHub</option><option value="leetcode-cn">力扣中国</option><option value="leetcode">LeetCode 国际</option></select></label>
      <label className="field flex-1 min-w-40">用户名<input className="input" required maxLength={39} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" disabled={busy} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="平台用户名，不是昵称"/></label>
      <label className="field w-28">年份<input className="input" required type="number" min={2008} max={2100} disabled={busy} value={year} onChange={(e) => setYear(Math.min(2100, Math.max(2008, Number(e.target.value))))}/></label><button className="btn-primary" disabled={busy || !username.trim()}>{busy ? '加载中…' : '读取日历'}</button>
    </form>
    {error && <p role="alert" className="form-error mt-3">{error} <Link to="/settings">打开设置</Link></p>}
    {matching ? <div className="mt-6"><p className="text-sm mb-4">{matching.username} · {matching.year} 年 · 共 {matching.days.reduce((sum, d) => sum + d.count, 0)} 次{provider === 'github' ? '贡献' : '提交'}</p>
      <div className="table-scroll"><div className="contribution-grid" role="img" aria-label={`${year}年按日贡献图，详细数据可展开下方表格`}>{Array.from({ length: offset }, (_, i) => <span aria-hidden key={`pad-${i}`}/>)}{dates.map((date) => { const count = counts.get(date) ?? 0; const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4; return <span key={date} className={`heat-cell heat-${level}`} title={`${date}：${count} 次`} aria-hidden/>; })}</div></div>
      <div className="flex justify-between gap-4 flex-wrap mt-3 text-xs muted"><span>更新于 {new Date(matching.fetchedAt).toLocaleString('zh-CN')} · 缓存最多 15 分钟</span><span className="flex gap-1 items-center">少{[0, 1, 2, 3, 4].map((n) => <span key={n} className={`heat-cell heat-${n}`}/>)}多</span></div>
      <details className="mt-4"><summary className="text-sm cursor-pointer">查看每日数据（表格）</summary><div className="table-scroll max-h-72 mt-3"><table className="study-table"><thead><tr><th>日期</th><th>次数</th></tr></thead><tbody>{matching.days.filter((d) => d.count > 0).map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody></table></div></details>
    </div> : <p className="empty-copy">填写用户名后读取真实活动。GitHub 需服务器配置 Token，力扣使用公开日历；平台限制访问时会显示错误。</p>}
  </section>;
}
