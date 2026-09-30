import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ChevronLeft, ChevronRight, Check, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../../db/database';
import { createStudyPlan, updateStudyPlan, deleteStudyPlan, setPlanStatus } from '../../services/study';
import type { StudyPlan } from '@learntrack/domain';
import { addTodo, toggleTodo, deleteTodo } from '../../services/commands';
import { todayKey, shiftDateKey } from '../../utils';
import { Modal } from '../../components/common/Modal';
import { showToast } from '../../components/common/Toast';
import { AgentPanel } from './AgentPanel';

export default function Plans() {
  const plans = useLiveQuery(() => db.studyPlans.filter((p) => !p.deletedAt).toArray(), [], []);
  const todos = useLiveQuery(() => db.todos.filter((t) => !t.deletedAt).toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.filter((c) => c.level === 'subject' && !c.deletedAt && !c.archived).toArray(), [], []);
  const [date, setDate] = useState(todayKey()), [open, setOpen] = useState(false), [title, setTitle] = useState('');
  const [editing, setEditing] = useState<StudyPlan | null>(null);
  const [taskBusy, setTaskBusy] = useState(false), [error, setError] = useState('');
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const todayTasks = todos.filter((t) => t.scheduledDate === date);
  const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < date && (!t.planId || planMap.get(t.planId)?.status === 'active'));
  const doAction = async (action: () => Promise<unknown>) => { try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); } };

  return <div className="space-y-7">
    <header className="page-heading"><div><h1>学习计划</h1><p>把目标拆到每天，完成后勾选。学习时长和练习结果由记录统计。</p></div><button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />新建计划</button></header>
    <section aria-labelledby="daily-plans-title" className="work-section">
      <div className="section-heading"><h2 id="daily-plans-title">每日安排</h2><div className="flex items-center gap-2">
        <button className="btn-ghost icon-control" aria-label="前一天" onClick={() => setDate(shiftDateKey(date, -1))}><ChevronLeft size={17}/></button>
        <input className="input date-control" type="date" aria-label="查看日期" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn-ghost icon-control" aria-label="后一天" onClick={() => setDate(shiftDateKey(date, 1))}><ChevronRight size={17}/></button>
      </div></div>
      <form className="flex gap-2 my-4" onSubmit={async (e) => { e.preventDefault(); if (!title.trim() || taskBusy) return; setTaskBusy(true); setError(''); try { await addTodo({ title: title.trim(), subjectId: null, scheduledDate: date, dueDate: date }); setTitle(''); } catch { setError('任务保存失败，请重试'); } finally { setTaskBusy(false); } }}>
        <label className="sr-only" htmlFor="plan-quick-task">添加任务</label><input id="plan-quick-task" className="input" maxLength={200} placeholder="例如：复习极限错题 5 道" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!title.trim() || taskBusy}>{taskBusy ? '保存中…' : '添加'}</button>
      </form>
      {error && <p role="alert" className="form-error">{error}</p>}
      {todayTasks.length === 0 && <p className="empty-copy">这一天还没有任务。可以直接添加，或通过学习计划安排。</p>}
      <ul className="task-list">{todayTasks.map((task) => <li key={task.id} className="task-row">
        <button className={`task-check ${task.done ? 'is-done' : ''}`} aria-label={`${task.done ? '取消完成' : '完成'}：${task.title}`} aria-pressed={task.done} onClick={() => void doAction(() => toggleTodo(task))}>{task.done && <Check size={16}/>}</button>
        <div className="min-w-0 flex-1"><div className={task.done ? 'line-through muted' : ''}>{task.title}</div><div className="text-xs muted mt-1">{task.estimatedMinutes ? `${task.estimatedMinutes} 分钟 · ` : ''}{task.planId ? `${planMap.get(task.planId)?.title ?? '关联计划'}${planMap.get(task.planId)?.status === 'paused' ? '（已暂停）' : ''}` : '单次任务'}</div></div>
        <button className="btn-ghost text-sm" onClick={() => void doAction(() => deleteTodo(task.id))}>移除</button>
      </li>)}</ul>
      {overdue.length > 0 && <p className="text-sm mt-4 muted">此前还有 {overdue.length} 项未完成。<Link to="/">回到今日查看</Link></p>}
    </section>
    <section className="work-section" aria-labelledby="ongoing-plans-title"><div className="section-heading"><h2 id="ongoing-plans-title">阶段计划</h2><span className="muted text-sm">{plans.filter((p) => p.status === 'active').length} 个进行中</span></div>
      {plans.length === 0 && <div className="empty-copy"><CalendarDays size={24}/><p>先设一个可以完成的目标，例如“一周复习积分”。</p></div>}
      <div className="divide-y divide-[var(--border-soft)]">{plans.map((plan) => {
        const tasks = todos.filter((t) => t.planId === plan.id), done = tasks.filter((t) => t.done).length;
        return <article className="py-5" key={plan.id}><div className="flex flex-wrap gap-3 items-start justify-between"><div><h3 className="font-semibold">{plan.title}</h3><p className="muted text-sm mt-1">{plan.startDate} 至 {plan.endDate} · 每天 {plan.dailyMinutes} 分钟 / {plan.dailyQuestions} 题</p></div>
          <select className="input !w-auto" value={plan.status} aria-label={`${plan.title}状态`} onChange={(e) => void doAction(() => setPlanStatus(plan.id, e.target.value as typeof plan.status))}><option value="active">进行中</option><option value="paused">暂停</option><option value="completed">已结束</option></select></div>
          {plan.note && <p className="text-sm mt-3 whitespace-pre-wrap">{plan.note}</p>}
          <div className="flex gap-2 mt-2"><button className="btn-ghost" aria-label={`编辑计划 ${plan.title}`} onClick={() => { setEditing(plan); setOpen(true); }}>编辑</button><button className="btn-ghost" aria-label={`移除计划 ${plan.title}`} onClick={() => { if (confirm('移除计划及其未完成待办？已完成任务和学习记录会保留。')) void doAction(() => deleteStudyPlan(plan.id)); }}>移除计划</button></div>
          {tasks.length > 0 && <div className="mt-4"><progress className="w-full h-2" max={tasks.length} value={done} aria-label={`${plan.title}任务完成进度`}/><p className="muted text-xs mt-1">{done} / {tasks.length} 项任务完成，任务勾选不替代学习记录。</p></div>}
        </article>;
      })}</div>
    </section>
    <AgentPanel />
    {open && <PlanForm initial={editing} onClose={() => { setOpen(false); setEditing(null); }} categories={categories} />}
  </div>;
}

function PlanForm({ onClose, categories, initial }: { onClose: () => void; categories: { id: string; name: string }[]; initial: StudyPlan | null }) {
  const [title, setTitle] = useState(initial?.title ?? ''), [startDate, setStartDate] = useState(initial?.startDate ?? todayKey()), [endDate, setEndDate] = useState(initial?.endDate ?? shiftDateKey(todayKey(), 6));
  const [minutes, setMinutes] = useState(initial?.dailyMinutes ?? 60), [questions, setQuestions] = useState(initial?.dailyQuestions ?? 10), [subject, setSubject] = useState(initial?.subjectId ?? ''), [note, setNote] = useState(initial?.note ?? ''), [tasks, setTasks] = useState(!initial);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const input = { title: title.trim(), startDate, endDate, dailyMinutes: minutes, dailyQuestions: questions, subjectId: subject || null, note }; if (initial) await updateStudyPlan(initial.id, input, tasks); else await createStudyPlan(input, tasks); showToast('计划已保存', 'success'); onClose(); } catch { setError('保存失败，请检查科目和日期范围（最多 366 天）后重试。'); } finally { setBusy(false); } };
  return <Modal labelledBy="create-study-plan-title" onClose={() => !busy && onClose()}><form className="space-y-4" onSubmit={submit}><h2 id="create-study-plan-title" className="text-xl font-semibold">{initial ? '编辑学习计划' : '新建学习计划'}</h2>
    <label className="field">计划名称<input autoFocus className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一周复习积分"/></label>
    <div className="grid grid-cols-2 gap-3"><label className="field">开始日期<input className="input" required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}/></label><label className="field">结束日期<input className="input" required min={startDate} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}/></label></div>
    <div className="grid grid-cols-2 gap-3"><label className="field">每天分钟数<input className="input" required type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}/></label><label className="field">每天题量<input className="input" required type="number" min={0} max={1000} value={questions} onChange={(e) => setQuestions(Number(e.target.value))}/></label></div>
    <label className="field">关联科目<select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">全部学习</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">学习范围与安排<textarea className="input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="先复习不定积分，再做对应章节习题"/></label>
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)}/>{initial ? '补齐日期范围内缺少的每日待办' : '为每一天生成待办任务'}</label>
    {initial && <p className="text-xs muted">已有未完成任务会更新为当前安排，移出日期范围的未完成任务会删除。已完成任务会保留。</p>}
    {error && <p role="alert" className="form-error">{error}</p>}<div className="flex justify-end gap-2"><button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>取消</button><button className="btn-primary" disabled={busy}>{busy ? '保存中…' : '保存计划'}</button></div>
  </form></Modal>;
}
