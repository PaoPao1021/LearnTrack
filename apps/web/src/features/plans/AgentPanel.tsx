import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/database';
import { practiceStats, computeStats, MATH_TOPICS } from '@learntrack/domain';
import { todayKey, shiftDateKey } from '../../utils';
import { requestAgent } from '../../services/extensions';
import { importAgentTasks } from '../../services/study';

export function AgentPanel() {
  const [task, setTask] = useState<'review' | 'plan'>('review'), [prompt, setPrompt] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<Awaited<ReturnType<typeof requestAgent>> | null>(null), [saved, setSaved] = useState(false);
  const data = useLiveQuery(async () => {
    const from = shiftDateKey(todayKey(), -6), to = todayKey();
    const [entries, categories, attempts, todos] = await Promise.all([db.entries.toArray(), db.categories.toArray(), db.practiceAttempts.filter((r) => !r.deletedAt && r.learningDate >= from && r.learningDate <= to).toArray(), db.todos.filter((t) => !t.deletedAt && !t.done).count()]);
    const stats = practiceStats(attempts);
    const weakTopics = MATH_TOPICS.filter(([key]) => { const s = practiceStats(attempts.filter((a) => a.chapterKey === key)); return s.answered >= 3 && (s.accuracy ?? 1) < 0.6; }).map(([, label]) => label);
    return { from, to, studyMinutes: Math.round(computeStats(entries, categories, from, to, { timeZone: 'Asia/Shanghai' }).totalSeconds / 60), attempted: stats.answered, correct: stats.correct, pendingTasks: todos, weakTopics };
  }, []);
  return <section className="work-section" aria-labelledby="study-assistant-title"><div className="section-heading"><h2 id="study-assistant-title">学习助手</h2><span className="text-xs muted">在线功能</span></div>
    <p className="muted text-sm mt-2">根据近 7 天的汇总做复盘或起草计划。建议需要你确认后才会加入待办。<Link to="/settings">配置与登录</Link></p>
    <div className="grid sm:grid-cols-[150px_1fr] gap-3 mt-4"><label className="field">用途<select className="input" value={task} disabled={busy} onChange={(e) => { setTask(e.target.value as typeof task); setResult(null); }}><option value="review">学习复盘</option><option value="plan">起草计划</option></select></label><label className="field">你的要求<textarea className="input" rows={2} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：每天只有 90 分钟，先安排极限与积分复习"/></label></div>
    {data && <p className="text-sm muted my-3">将发送：{data.from} 至 {data.to}，学习 {data.studyMinutes} 分钟，练习 {data.attempted} 次，答对 {data.correct} 次，待办 {data.pendingTasks} 项，薄弱知识点 {data.weakTopics.join('、') || '暂无足够数据'}。</p>}
    <label className="flex gap-2 items-start text-sm my-3"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}/>同意将上述汇总和本次要求发送到服务器配置的 AI 服务</label>
    <button className="btn-primary" disabled={!consent || !prompt.trim() || !data || busy} onClick={async () => { if (!data) return; setBusy(true); setError(''); setResult(null); setSaved(false); try { setResult(await requestAgent({ task, prompt, context: data })); } catch (e) { setError(e instanceof Error ? e.message : '助手请求失败'); } finally { setBusy(false); } }}>{busy ? '处理中…' : '生成建议'}</button>
    {error && <p className="form-error mt-3" role="alert">{error}</p>}
    {result && <div className="mt-5 border-t border-[var(--border-soft)] pt-4"><p className="whitespace-pre-wrap leading-relaxed">{result.summary}</p>{result.tasks.length > 0 && <><ul className="task-list mt-3">{result.tasks.map((item, index) => <li className="task-row" key={index}><span className="text-sm muted shrink-0">{item.scheduledDate}</span><span className="flex-1">{item.title}</span><span className="text-sm muted">{item.estimatedMinutes} 分钟</span></li>)}</ul><button className="btn-primary mt-4" disabled={busy || saved} onClick={async () => { setBusy(true); try { await importAgentTasks(result, result.runId); setSaved(true); } catch { setError('任务保存失败，请重试'); } finally { setBusy(false); } }}>{saved ? '已加入待办' : '确认将以上任务加入待办'}</button></>}<p className="text-xs muted mt-3">模型：{result.model}。建议不等于学习记录，确认后也可在计划中移除任务。</p></div>}
  </section>;
}
