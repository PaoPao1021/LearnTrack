import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/database';
import { practiceStats, computeStats } from '@learntrack/domain';
import { todayKey, shiftDateKey } from '../../utils';
import { requestAgent } from '../../services/extensions';
import { importAgentTasks } from '../../services/study';
import { agentWeakTopics, listAgentNotes, saveAgentNote, deleteAgentNote } from '../../services/agentNotes';
import { downloadBlob } from '../../services/backup';

type Task = 'review' | 'plan' | 'guide';
const taskLabels = { review: '学习复盘', plan: '起草计划', guide: '学习指导' };
export function AgentPanel({ library = false, initialTask = 'review' }: { library?: boolean; initialTask?: Task }) {
  const [task, setTask] = useState<Task>(initialTask), [prompt, setPrompt] = useState(''), [consent, setConsent] = useState(false);
  const [days, setDays] = useState(7), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof requestAgent>> | null>(null), [saved, setSaved] = useState(false);
  const [resultPrompt, setResultPrompt] = useState(''), [archived, setArchived] = useState(false);
  const [noteTitle, setNoteTitle] = useState(''), [noteContent, setNoteContent] = useState(''), [noteBusy, setNoteBusy] = useState(false);
  const notes = useLiveQuery(listAgentNotes, [], []);
  const attached = notes.filter(note => selected.includes(note.id));
  const data = useLiveQuery(async () => {
    const from = shiftDateKey(todayKey(), 1 - days), to = todayKey();
    const [entries, categories, attempts, todos] = await Promise.all([db.entries.toArray(), db.categories.toArray(), db.practiceAttempts.filter((r) => !r.deletedAt && r.learningDate >= from && r.learningDate <= to).toArray(), db.todos.filter((t) => !t.deletedAt && !t.done).count()]);
    const stats = practiceStats(attempts);
    return { from, to, studyMinutes: Math.round(computeStats(entries, categories, from, to, { timeZone: 'Asia/Shanghai' }).totalSeconds / 60), attempted: stats.answered, correct: stats.correct, pendingTasks: todos, weakTopics: agentWeakTopics(attempts) };
  }, [days]);
  const attachmentText = JSON.stringify(attached.map(({ title, content }) => ({ title, content })));
  const summaryText = JSON.stringify(data);
  useEffect(() => { setConsent(false); }, [task, prompt, attachmentText, summaryText]);
  const act = async (action: () => Promise<void>) => { setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); } };
  const toggleNote = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current);
  return <div className="space-y-6">
    <section className="work-section" aria-labelledby="study-assistant-title">
      <div className="section-heading"><h2 id="study-assistant-title">{library ? '带着学习记录提问' : '学习助手'}</h2><Link className="text-sm" to={library ? '/settings#agent-connection' : '/assistant'}>{library ? 'DeepSeek 接入设置' : '打开助手与总结库'}</Link></div>
      <p className="muted text-sm mt-2">选择学习范围，附上需要参考的总结，再说明你想解决的问题。</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="field">用途<select className="input" value={task} disabled={busy} onChange={(e) => setTask(e.target.value as Task)}>{Object.entries(taskLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field">学习数据范围<select className="input" value={days} disabled={busy} onChange={e => setDays(Number(e.target.value))}><option value={1}>今天</option><option value={7}>近 7 天</option><option value={30}>近 30 天</option></select></label>
      </div>
      <label className="field mt-4">你的要求<textarea className="input" rows={4} maxLength={4000} disabled={busy} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={task === 'guide' ? '例如：结合我的积分错因，解释换元时如何选择变量，并给出练习顺序。' : '例如：结合最近的总结，为下周安排每天 90 分钟的数学复习。'}/></label>
      {notes.length > 0 && <fieldset className="mt-4"><legend className="field-label mb-2">附带学习总结（最多 3 篇，只有勾选内容会发送）</legend><div className="agent-note-choices">{notes.map(note => <label key={note.id} className="agent-note-choice"><input type="checkbox" checked={selected.includes(note.id)} disabled={busy || (!selected.includes(note.id) && attached.length >= 3)} onChange={() => toggleNote(note.id)}/><span>{note.title}</span></label>)}</div></fieldset>}
      {data && <div className="agent-context mt-4"><p className="text-sm">将发送：{data.from} 至 {data.to}，学习 {data.studyMinutes} 分钟，练习 {data.attempted} 次，答对 {data.correct} 次，待办 {data.pendingTasks} 项。</p><p className="text-xs muted mt-2">薄弱知识点：{data.weakTopics.join('、') || '暂无足够数据'}。原始学习备注不会自动发送。</p>{attached.map(note => <details key={note.id} className="mt-2 text-sm"><summary>查看附带总结：{note.title}</summary><p className="whitespace-pre-wrap mt-2">{note.content}</p></details>)}</div>}
      <label className="flex gap-2 items-start text-sm my-4"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)}/>同意将上述汇总、本次要求和已选总结发送到服务器配置的 AI 服务</label>
      <button className="btn-primary" disabled={!consent || !prompt.trim() || !data || busy} onClick={async () => {
        if (!data) return;
        setBusy(true); setError(''); setResult(null); setSaved(false); setArchived(false); setResultPrompt(prompt);
        try { setResult(await requestAgent({ task, prompt, context: data, notes: attached.map(({ title, content }) => ({ title, content })) })); }
        catch (e) { setError(e instanceof Error ? e.message : '助手请求失败'); }
        finally { setBusy(false); }
      }}>{busy ? '处理中…' : '生成建议'}</button>
      {error && <p className="form-error mt-3" role="alert">{error}</p>}
      {result && <div className="mt-5 border-t border-[var(--border-soft)] pt-4" aria-live="polite"><h3 className="font-semibold mb-3">{taskLabels[result.task]}</h3><p className="whitespace-pre-wrap leading-relaxed agent-answer">{result.summary}</p><button className="btn-ghost mt-4" disabled={busy || archived} onClick={async () => { setBusy(true); await act(async () => { await saveAgentNote({ id: result.runId, title: `${todayKey()} ${taskLabels[result.task]} · ${resultPrompt}`.slice(0, 120), content: result.summary, createdAt: new Date().toISOString(), origin: 'assistant', model: result.model }); setArchived(true); }); setBusy(false); }}>{archived ? '已保存到总结库' : '保存到总结库'}</button>{result.tasks.length > 0 && <><ul className="task-list mt-3">{result.tasks.map((item, index) => <li className="task-row" key={index}><span className="text-sm muted shrink-0">{item.scheduledDate}</span><span className="flex-1">{item.title}</span><span className="text-sm muted">{item.estimatedMinutes} 分钟</span></li>)}</ul><button className="btn-primary mt-4" disabled={busy || saved} onClick={async () => { setBusy(true); await act(async () => { await importAgentTasks(result, result.runId); setSaved(true); }); setBusy(false); }}>{saved ? '已加入待办' : '确认将以上任务加入待办'}</button></>}<p className="text-xs muted mt-3">模型：{result.model}。保存总结与确认待办是两个独立操作，建议不会自动改动学习记录。</p></div>}
    </section>
    {library && <section className="work-section" aria-labelledby="agent-library-title"><div className="section-heading"><h2 id="agent-library-title">学习总结库</h2><span className="text-sm muted">{notes.length} 篇</span></div><p className="text-sm muted mt-2">保存自己的总结或助手回答。保存在当前浏览器，包含在完整备份中，暂不跨设备同步。</p>
      <form className="space-y-3 mt-4" onSubmit={async e => { e.preventDefault(); if (noteBusy) return; setNoteBusy(true); await act(async () => { await saveAgentNote({ id: crypto.randomUUID(), title: noteTitle, content: noteContent, createdAt: new Date().toISOString(), origin: 'self' }); setNoteTitle(''); setNoteContent(''); }); setNoteBusy(false); }}>
        <label className="field">总结标题<input className="input" required maxLength={120} value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="例如：本周积分练习复盘"/></label>
        <label className="field">总结内容<textarea className="input" required maxLength={6000} rows={4} value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="记录学会的内容、错因、还没想明白的问题，或粘贴已有总结。"/></label>
        <button className="btn-primary" disabled={noteBusy || !noteTitle.trim() || !noteContent.trim()}>{noteBusy ? '保存中…' : '保存我的总结'}</button>
      </form>
      {notes.length === 0 && <p className="empty-copy">还没有总结。保存后，可在上方勾选并带入下一次提问。</p>}
      <div className="divide-y divide-[var(--border-soft)]">{notes.map(note => <article key={note.id} className="py-4"><details><summary className="font-semibold cursor-pointer">{note.title}</summary><p className="mt-3 whitespace-pre-wrap leading-relaxed agent-answer">{note.content}</p></details><p className="text-xs muted mt-2">{new Date(note.createdAt).toLocaleString('zh-CN')} · {note.origin === 'self' ? '自己的总结' : `AI 回答 · ${note.model}`}</p><div className="flex flex-wrap gap-2 mt-3"><button className="btn-ghost" disabled={busy || (!selected.includes(note.id) && attached.length >= 3)} onClick={() => toggleNote(note.id)}>{selected.includes(note.id) ? '从本次提问移除' : '加入本次提问'}</button><button className="btn-ghost" onClick={() => downloadBlob(new Blob([`# ${note.title}\n\n${note.content}\n`], { type: 'text/markdown;charset=utf-8' }), `学习总结-${note.createdAt.slice(0, 10)}.md`)}>导出</button><button className="btn-ghost" disabled={busy} onClick={() => { if (confirm(`删除总结“${note.title}”？`)) void act(async () => { await deleteAgentNote(note.id); setSelected(current => current.filter(id => id !== note.id)); }); }}>删除</button></div></article>)}</div>
    </section>}
  </div>;
}
