import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { addPathItems, addQuantity, addTodo, createPath, deletePath, deleteTodo, setItemDone, toggleTodo, setGoal } from '../../services/commands';
import { chapterProgress, quantityProgress, formatDuration } from '@learntrack/domain';
import { todayKey } from '../../utils';
import type { Category, LearningPath } from '@learntrack/domain';

function CreatePathForm({ onClose }: { onClose: () => void }) {
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const subjects = (categories ?? []).filter((c) => c.level === 'subject' && !c.deletedAt && !c.archived);
  const majors = new Map((categories ?? []).filter((c) => c.level === 'major').map((c) => [c.id, c]));
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<'chapters' | 'quantity'>('chapters');
  const [total, setTotal] = useState(100);
  const [unit, setUnit] = useState('题');
  const [initial, setInitial] = useState(0);
  const [itemsText, setItemsText] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('请填写路线名称');
    if (!subjectId) return setError('请选择所属具体科目');
    const path = await createPath({
      subjectId, name: name.trim(), mode,
      totalQuantity: mode === 'quantity' ? Math.max(1, total) : null,
      unit: mode === 'quantity' ? unit.trim() || '个' : null,
      initialCompleted: initial,
    });
    if (mode === 'chapters' && itemsText.trim()) {
      const titles = itemsText.split('\n').map((s) => s.trim()).filter(Boolean);
      if (titles.length) await addPathItems(path.id, titles);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5 card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="mb-4 text-lg font-semibold">新建学习路线</h2>
        <div className="mb-3">
          <label className="label">路线名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：高数基础课程 / 1000 题" />
        </div>
        <div className="mb-3">
          <label className="label">所属具体科目</label>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">请选择</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{majors.get(s.parentId ?? '')?.name} / {s.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-3 flex gap-2">
          <button type="button" className={mode === 'chapters' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('chapters')}>章节清单</button>
          <button type="button" className={mode === 'quantity' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('quantity')}>数量目标</button>
        </div>
        {mode === 'quantity' ? (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div><label className="label">总量</label><input type="number" min={1} className="input" value={total} onChange={(e) => setTotal(Number(e.target.value))} /></div>
            <div><label className="label">单位</label><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div><label className="label">已完成</label><input type="number" min={0} className="input" value={initial} onChange={(e) => setInitial(Number(e.target.value))} /></div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="label">章节清单（每行一项，可批量粘贴）</label>
            <textarea className="input h-32" value={itemsText} onChange={(e) => setItemsText(e.target.value)} placeholder={'第1章 函数与极限\n第2章 导数与微分'} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">创建后可在路线中添加小节（最多两层）。</p>
          </div>
        )}
        {error && <div className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary">创建</button>
        </div>
      </form>
    </div>
  );
}

function PathCard({ path }: { path: LearningPath }) {
  const items = useLiveQuery(() => db.pathItems.where('pathId').equals(path.id).filter((i) => !i.deletedAt).toArray(), [path.id], []);
  const [addItem, setAddItem] = useState('');
  const [addDelta, setAddDelta] = useState<number | ''>('');

  const progress: { done: number; total: number; ratio: number; exceedsTarget: boolean } = path.mode === 'quantity'
    ? quantityProgress(path)
    : { ...chapterProgress(path, items ?? []), exceedsTarget: false };

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{path.name}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {path.mode === 'quantity' ? `数量目标 · ${progress.done}/${progress.total} ${path.unit ?? ''}` : `章节清单 · ${progress.done}/${progress.total} 章节`}
            {' '}(完成 {Math.round(progress.ratio * 100)}%)
          </span>
        </div>
        <button className="btn-danger px-2 py-1 text-xs" onClick={() => { if (confirm('删除该路线？统计时间不受影响。')) void deletePath(path.id); }}>删除</button>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${progress.ratio * 100}%`, background: 'var(--accent)' }} />
      </div>
      {path.mode === 'quantity' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <input type="number" className="input" placeholder={`+${path.unit ?? ''}`} value={addDelta} onChange={(e) => setAddDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <button className="btn-ghost" onClick={() => {
            if (addDelta === '' || addDelta === 0) return;
            const next = (path.completedQuantity ?? 0) + (addDelta as number);
            if (path.totalQuantity && next > path.totalQuantity && !confirm('完成量将超过总量，确认保留？')) return;
            void addQuantity(path.id, addDelta as number);
            setAddDelta('');
          }}>更新数量</button>
          {progress.exceedsTarget && <span className="text-xs text-amber-600 dark:text-amber-400">已完成数超过总量，可调整总量或核对。</span>}
        </div>
      ) : (
        <>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
            {(items ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={i.done} onChange={() => void setItemDone(i, !i.done)} />
                <span className={i.done ? 'text-slate-400 line-through' : ''}>{i.title}</span>
                {i.parentId && <span className="text-xs text-slate-400">小节</span>}
              </li>
            ))}
            {(items ?? []).length === 0 && <li className="text-sm text-slate-500">还没有章节，添加后开始打卡。</li>}
          </ul>
          <div className="flex gap-2">
            <input className="input" placeholder="添加章节，回车确认" value={addItem} onChange={(e) => setAddItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addItem.trim()) {
                  void addPathItems(path.id, [addItem.trim()]);
                  setAddItem('');
                }
              }} />
          </div>
        </>
      )}
    </div>
  );
}

function TodoSection() {
  const todos = useLiveQuery(() => db.todos.filter((t) => !t.deletedAt).toArray(), [], []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [due, setDue] = useState('');
  const sorted = (todos ?? []).sort((a, b) => (a.done === b.done ? (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') : a.done ? 1 : -1));

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">待办</h2>
      <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void addTodo({ title: title.trim(), subjectId: null, scheduledDate: date, dueDate: due || null });
        setTitle(''); setDue('');
      }}>
        <input className="input" placeholder="待办内容" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className="input sm:w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="date" className="input sm:w-36" value={due} onChange={(e) => setDue(e.target.value)} aria-label="截止日期（可选）" />
        <button className="btn-primary" type="submit">添加</button>
      </form>
      <ul className="space-y-1 text-sm">
        {sorted.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <input type="checkbox" checked={t.done} onChange={() => void toggleTodo(t)} />
            <span className={t.done ? 'flex-1 text-slate-400 line-through' : 'flex-1'}>{t.title}</span>
            {t.scheduledDate && <span className="text-xs text-slate-400">{t.scheduledDate}</span>}
            {t.dueDate && <span className={`text-xs ${!t.done && t.dueDate < todayKey() ? 'font-semibold text-red-600' : 'text-slate-400'}`}>截止 {t.dueDate}</span>}
            <button className="text-xs text-slate-400 hover:text-red-500" onClick={() => void deleteTodo(t.id)}>删除</button>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-slate-500 dark:text-slate-400">没有待办。</li>}
      </ul>
    </div>
  );
}

function GoalSection() {
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [], []);
  const [dailyHours, setDailyHours] = useState(4);
  const [weeklyHours, setWeeklyHours] = useState(25);
  const fmt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} 小时${s % 3600 ? ` ${Math.round((s % 3600) / 60)} 分` : ''}` : `${Math.round(s / 60)} 分钟`);

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">时长目标</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-24">
          <label className="label">每日（小时）</label>
          <input type="number" min={0} step={0.5} className="input" value={dailyHours} onChange={(e) => setDailyHours(Number(e.target.value))} />
        </div>
        <button className="btn-ghost" onClick={() => void setGoal({ scope: 'all', subjectId: null, period: 'daily', targetSeconds: Math.round(dailyHours * 3600) })}>设置每日目标</button>
        <div className="w-24">
          <label className="label">每周（小时）</label>
          <input type="number" min={0} step={0.5} className="input" value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
        </div>
        <button className="btn-ghost" onClick={() => void setGoal({ scope: 'all', subjectId: null, period: 'weekly', targetSeconds: Math.round(weeklyHours * 3600) })}>设置每周目标</button>
      </div>
      <ul className="space-y-1 text-sm">
        {(goals ?? []).map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">
            <span>{g.period === 'daily' ? '每日' : '每周'}目标 · {fmt(g.targetSeconds)}</span>
            <button className="text-xs text-slate-400 hover:text-red-500" onClick={() => void setGoal({ scope: g.scope, subjectId: g.subjectId, period: g.period, targetSeconds: 0 })}>移除</button>
          </li>
        ))}
        {(goals ?? []).length === 0 && <li className="text-slate-500 dark:text-slate-400">未设置目标（可选）。所有来源的正式记录都会计入目标。</li>}
      </ul>
      <p className="mt-2 text-xs text-slate-400">完成待办不会自动增加学习时长；超过 100% 时显示真实完成量。</p>
    </div>
  );
}

export default function Learning() {
  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="display text-xl">学习</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> 新建路线</button>
      </div>

      {(paths ?? []).length === 0 && (
        <div className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          还没有学习路线。新建“章节清单”（如课程目录、Hot100 题单）或“数量目标”（如 1000 题）后，
          总览页会展示对应进度；未添加目录的科目只显示时间，不显示空进度条。
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(paths ?? []).map((p) => <PathCard key={p.id} path={p} />)}
      </div>

      <TodoSection />
      <GoalSection />

      {creating && <CreatePathForm onClose={() => setCreating(false)} />}
    </div>
  );
}
