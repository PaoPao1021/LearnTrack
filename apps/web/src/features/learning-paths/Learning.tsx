import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { Modal } from '../../components/common/Modal';
import { Segmented } from '../../components/common/Segmented';
import { useI18n, translateError } from '../../i18n';
import { addPathItems, addQuantity, addTodo, createPath, deletePath, deleteTodo, setItemDone, toggleTodo, setGoal } from '../../services/commands';
import { chapterProgress, quantityProgress, formatDuration } from '@learntrack/domain';
import { todayKey } from '../../utils';
import type { Category, LearningPath } from '@learntrack/domain';

function CreatePathForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
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
    if (!name.trim()) return setError(t('err.pathNameRequired'));
    if (!subjectId) return setError(t('err.pathSubjectRequired'));
    if (mode === 'quantity') {
      if (!Number.isInteger(total) || total < 1) return setError(t('err.pathTotal'));
      if (!Number.isInteger(initial) || initial < 0) return setError(t('err.pathInitial'));
      if (initial > total && !confirm(t('path.initialExceedConfirm'))) return;
    }
    const path = await createPath({
      subjectId, name: name.trim(), mode,
      totalQuantity: mode === 'quantity' ? Math.max(1, total) : null,
      unit: mode === 'quantity' ? unit.trim() || t('entry.quantityUnit') : null,
      initialCompleted: initial,
    });
    if (mode === 'chapters' && itemsText.trim()) {
      const titles = itemsText.split('\n').map((s) => s.trim()).filter(Boolean);
      if (titles.length) await addPathItems(path.id, titles);
    }
    onClose();
  };

  return (
    <Modal labelledBy="create-path-title" onClose={onClose} panelClassName="modal-panel glass-emphasis max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5">
      <form onSubmit={submit}>
        <h2 id="create-path-title" className="mb-4 text-lg font-semibold">{t('path.createTitle')}</h2>
        <div className="mb-3">
          <label className="label" htmlFor="path-name">{t('path.name')}</label>
          <input id="path-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('path.namePlaceholder')} />
        </div>
        <div className="mb-3">
          <label className="label" htmlFor="path-subject">{t('path.subject')}</label>
          <select id="path-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{t('path.pick')}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{majors.get(s.parentId ?? '')?.name} / {s.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <Segmented
            ariaLabel={t('path.modeChapters') + ' / ' + t('path.modeQuantity')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'chapters', label: t('path.modeChapters') },
              { value: 'quantity', label: t('path.modeQuantity') },
            ] as const}
          />
        </div>
        {mode === 'quantity' ? (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div><label className="label" htmlFor="path-total">{t('path.total')}</label><input id="path-total" type="number" min={1} className="input" value={total} onChange={(e) => setTotal(Number(e.target.value))} /></div>
            <div><label className="label" htmlFor="path-unit">{t('path.unit')}</label><input id="path-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div><label className="label" htmlFor="path-initial">{t('path.initial')}</label><input id="path-initial" type="number" min={0} className="input" value={initial} onChange={(e) => setInitial(Number(e.target.value))} /></div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="label" htmlFor="path-items">{t('path.itemsLabel')}</label>
            <textarea id="path-items" className="input h-32" value={itemsText} onChange={(e) => setItemsText(e.target.value)} placeholder={t('path.itemsPlaceholder')} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('path.itemsHint')}</p>
          </div>
        )}
        {error && <div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary">{t('path.create')}</button>
        </div>
      </form>
    </Modal>
  );
}

function PathCard({ path }: { path: LearningPath }) {
  const { t } = useI18n();
  const items = useLiveQuery(() => db.pathItems.where('pathId').equals(path.id).filter((i) => !i.deletedAt).toArray(), [path.id], []);
  const [addItem, setAddItem] = useState('');
  const [addDelta, setAddDelta] = useState<number | ''>('');

  const progress: { done: number; total: number; ratio: number; exceedsTarget: boolean } = path.mode === 'quantity'
    ? quantityProgress(path)
    : { ...chapterProgress(path, items ?? []), exceedsTarget: false };

  const unitFallback = t('entry.quantityUnit');
  const label = path.mode === 'quantity'
    ? t('path.quantityLabel', { done: progress.done, total: progress.total, unit: path.unit ?? unitFallback })
    : t('path.chaptersLabel', { done: progress.done, total: progress.total });

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{path.name}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {label}{t('path.donePct', { pct: Math.round(progress.ratio * 100) })}
          </span>
        </div>
        <button className="btn-danger px-3 py-2 text-xs" onClick={() => { if (confirm(t('path.deleteConfirm'))) void deletePath(path.id); }}>{t('common.delete')}</button>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${progress.ratio * 100}%`, background: 'var(--accent)' }} />
      </div>
      {path.mode === 'quantity' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <label className="sr-only" htmlFor={`path-delta-${path.id}`}>{t('path.deltaLabel', { unit: path.unit ?? unitFallback })}</label>
            <input id={`path-delta-${path.id}`} type="number" className="input" placeholder={`+${path.unit ?? ''}`} value={addDelta} onChange={(e) => setAddDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <button className="btn-ghost" onClick={() => {
            if (addDelta === '' || addDelta === 0 || !Number.isInteger(addDelta)) return;
            const next = (path.completedQuantity ?? 0) + (addDelta as number);
            if (path.totalQuantity && next > path.totalQuantity && !confirm(t('path.exceedConfirm'))) return;
            void addQuantity(path.id, addDelta as number);
            setAddDelta('');
          }}>{t('path.update')}</button>
          {progress.exceedsTarget && <span className="text-xs text-amber-600 dark:text-amber-400">{t('path.exceeds')}</span>}
        </div>
      ) : (
        <>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
            {(items ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={i.done}
                  onChange={() => void setItemDone(i, !i.done)}
                  aria-label={i.done ? t('path.itemUndone', { title: i.title }) : t('path.itemDone', { title: i.title })}
                />
                <span className={i.done ? 'text-slate-400 line-through' : ''}>{i.title}</span>
                {i.parentId && <span className="text-xs text-slate-400">{t('path.subsection')}</span>}
              </li>
            ))}
            {(items ?? []).length === 0 && <li className="text-sm text-slate-500">{t('path.noChapters')}</li>}
          </ul>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`path-add-item-${path.id}`}>{t('path.addChapterLabel')}</label>
            <input id={`path-add-item-${path.id}`} className="input" placeholder={t('path.addChapter')} value={addItem} onChange={(e) => setAddItem(e.target.value)}
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
  const { t } = useI18n();
  const todos = useLiveQuery(() => db.todos.filter((td) => !td.deletedAt).toArray(), [], []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [due, setDue] = useState('');
  const sorted = (todos ?? []).sort((a, b) => (a.done === b.done ? (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') : a.done ? 1 : -1));

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('todo.cardTitle')}</h2>
      <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void addTodo({ title: title.trim(), subjectId: null, scheduledDate: date, dueDate: due || null });
        setTitle(''); setDue('');
      }}>
        <label className="sr-only" htmlFor="todo-title">{t('todo.contentLabel')}</label>
        <input id="todo-title" className="input" placeholder={t('todo.contentPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="sr-only" htmlFor="todo-date">{t('todo.dateLabel')}</label>
        <input id="todo-date" type="date" className="input sm:w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="sr-only" htmlFor="todo-due">{t('todo.dueLabel')}</label>
        <input id="todo-due" type="date" className="input sm:w-36" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn-primary" type="submit">{t('todo.add')}</button>
      </form>
      <ul className="space-y-1 text-sm">
        {sorted.map((td) => (
          <li key={td.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={td.done}
              onChange={() => void toggleTodo(td)}
              aria-label={td.done ? t('todo.undoneAria', { title: td.title }) : t('todo.doneAria', { title: td.title })}
            />
            <span className={td.done ? 'flex-1 text-slate-400 line-through' : 'flex-1'}>{td.title}</span>
            {td.scheduledDate && <span className="text-xs text-slate-400">{td.scheduledDate}</span>}
            {td.dueDate && <span className={`text-xs ${!td.done && td.dueDate < todayKey() ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{t('todo.duePrefix', { date: td.dueDate })}</span>}
            <button className="btn-ghost min-h-9 px-3 py-1.5 text-xs" onClick={() => void deleteTodo(td.id)}>{t('common.delete')}</button>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-slate-500 dark:text-slate-400">{t('todo.none')}</li>}
      </ul>
    </div>
  );
}

function GoalSection() {
  const { t, fmtDuration } = useI18n();
  const goals = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).toArray(), [], []);
  const [dailyHours, setDailyHours] = useState(4);
  const [weeklyHours, setWeeklyHours] = useState(25);
  const fmt = (s: number) => fmtDuration(s);
  const validHours = (value: number) => Number.isFinite(value) && value >= 0;

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('goal.cardTitle')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-24">
          <label className="label" htmlFor="goal-daily">{t('goal.daily')}</label>
          <input id="goal-daily" type="number" min={0} step={0.5} className="input" value={dailyHours} onChange={(e) => setDailyHours(Number(e.target.value))} />
        </div>
        <button className="btn-ghost" disabled={!validHours(dailyHours)} onClick={() => void setGoal({ scope: 'all', subjectId: null, period: 'daily', targetSeconds: Math.round(dailyHours * 3600) })}>{t('goal.setDaily')}</button>
        <div className="w-24">
          <label className="label" htmlFor="goal-weekly">{t('goal.weekly')}</label>
          <input id="goal-weekly" type="number" min={0} step={0.5} className="input" value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
        </div>
        <button className="btn-ghost" disabled={!validHours(weeklyHours)} onClick={() => void setGoal({ scope: 'all', subjectId: null, period: 'weekly', targetSeconds: Math.round(weeklyHours * 3600) })}>{t('goal.setWeekly')}</button>
      </div>
      <ul className="space-y-1 text-sm">
        {(goals ?? []).map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">
            <span>{t('goal.summary', { period: g.period === 'daily' ? t('goals.daily') : t('goals.weekly'), time: fmt(g.targetSeconds) })}</span>
            <button className="btn-ghost min-h-9 px-3 py-1.5 text-xs" onClick={() => void setGoal({ scope: g.scope, subjectId: g.subjectId, period: g.period, targetSeconds: 0 })}>{t('goal.remove')}</button>
          </li>
        ))}
        {(goals ?? []).length === 0 && <li className="text-slate-500 dark:text-slate-400">{t('goal.none')}</li>}
      </ul>
      <p className="mt-2 text-xs text-slate-400">{t('goal.hint')}</p>
    </div>
  );
}

export default function Learning() {
  const { t } = useI18n();
  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="display text-xl">{t('learn.title')}</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> {t('learn.new')}</button>
      </div>

      {(paths ?? []).length === 0 && (
        <div className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('learn.empty')}
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
