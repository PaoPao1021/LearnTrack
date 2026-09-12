import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import EntryModal from '../../components/common/EntryModal';
import { deleteEntry, updateEntry } from '../../services/commands';
import { formatDuration, localDateKey } from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import type { Category, EntryRecord } from '@learntrack/domain';
import { DeleteEntryDialog } from './DeleteEntryDialog';

const METHOD_LABEL: Record<string, string> = { duration: '时长', range: '时间段', timer: '计时' };

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

function EntryRow({ entry, activity, subject, major, onEdit }: {
  entry: EntryRecord; activity?: Category; subject?: Category; major?: Category; onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: activity?.color ?? '#999' }} />
          <span className="font-medium">
            {major ? `${major.name} / ` : ''}{subject?.name ?? ''} / {activity?.name ?? '未知活动'}
          </span>
          <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {METHOD_LABEL[entry.method]}
          </span>
          {entry.moodScore != null && <span className="text-xs text-slate-500">状态 {entry.moodScore}/5</span>}
          {entry.interruptionReason && <span className="text-xs text-slate-500">打断：{entry.interruptionReason}</span>}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {entry.startedAt != null && entry.endedAt != null
            ? `${fmtTime(entry.startedAt)} – ${localDateKey(new Date(entry.endedAt), TZ) !== entry.learningDate ? '次日 ' : ''}${fmtTime(entry.endedAt)}`
            : '未指定时段'}
          {entry.pauseIntervals && entry.pauseIntervals.length > 0 && ` · 暂停 ${entry.pauseIntervals.length} 次`}
          {entry.note ? ` · ${entry.note}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold">{formatDuration(entry.durationSeconds)}</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onEdit}>编辑</button>
        <button className="btn-danger px-2 py-1 text-xs" onClick={() => setConfirmDelete(true)}>删除</button>
      </div>
      {confirmDelete && (
        <DeleteEntryDialog
          entry={entry}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </li>
  );
}

export default function Entries() {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EntryRecord | null>(null);
  const [filterActivity, setFilterActivity] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 14;

  const entries = useLiveQuery(() => db.entries.toArray(), [], [] as EntryRecord[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? [])
      .filter((e) => !e.deletedAt)
      .filter((e) => {
        if (!filterActivity) return true;
        const activity = byId.get(e.activityId);
        if (!activity) return false;
        if (activity.id === filterActivity) return true;
        const subject = activity.parentId ? byId.get(activity.parentId) : undefined;
        if (subject?.id === filterActivity) return true;
        const major = subject?.parentId ? byId.get(subject.parentId) : undefined;
        return major?.id === filterActivity;
      })
      .filter((e) => {
        if (!q) return true;
        const activity = byId.get(e.activityId);
        const names = [activity?.name, e.note ?? ''].join(' ').toLowerCase();
        return names.includes(q);
      })
      .sort((a, b) => (a.learningDate === b.learningDate
        ? (b.startedAt ?? 0) - (a.startedAt ?? 0)
        : a.learningDate < b.learningDate ? 1 : -1));
  }, [entries, filterActivity, search, byId]);

  const grouped = useMemo(() => {
    const map = new Map<string, EntryRecord[]>();
    for (const e of filtered.slice(page * PAGE, page * PAGE + PAGE)) {
      if (!map.has(e.learningDate)) map.set(e.learningDate, []);
      map.get(e.learningDate)!.push(e);
    }
    return [...map.entries()];
  }, [filtered, page]);

  const majors = (categories ?? []).filter((c) => c.level === 'major' && !c.deletedAt);
  const subjects = (categories ?? []).filter((c) => c.level === 'subject' && !c.deletedAt);
  const activities = (categories ?? []).filter((c) => c.level === 'activity' && !c.deletedAt);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-xl">学习记录</h1>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> 添加记录</button>
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input max-w-48" placeholder="搜索备注/活动" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select className="input max-w-40" value={filterActivity} onChange={(e) => { setFilterActivity(e.target.value); setPage(0); }}>
          <option value="">全部分类</option>
          <optgroup label="大科目">{majors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          <optgroup label="具体科目">{subjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          <optgroup label="活动">{activities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        </select>
        <span className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400">共 {filtered.length} 条</span>
      </div>

      {grouped.length === 0 && (
        <div className="card p-8 text-center text-slate-500 dark:text-slate-400">
          还没有记录。点击“添加记录”开始，或先在总览页开始计时。
        </div>
      )}

      {grouped.map(([date, list]) => (
        <div key={date} className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              {date}
              {date === todayKey() && <span className="ml-2 text-xs font-normal text-slate-400">今天</span>}
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {formatDuration(list.reduce((s, e) => s + e.durationSeconds, 0))}
            </span>
          </div>
          <ul className="space-y-2">
            {list.map((e) => {
              const activity = byId.get(e.activityId);
              const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
              const major = subject?.parentId ? byId.get(subject.parentId) : undefined;
              return <EntryRow key={e.id} entry={e} activity={activity} subject={subject} major={major} onEdit={() => setEditing(e)} />;
            })}
          </ul>
        </div>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span className="text-sm text-slate-500">{page + 1} / {totalPages}</span>
          <button className="btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      )}

      <EntryModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditEntryModal entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditEntryModal({ entry, onClose }: { entry: EntryRecord | null; onClose: () => void }) {
  const [minutes, setMinutes] = useState(0);
  const [note, setNote] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (!entry) return null;
  if (loadedId !== entry.id) {
    setLoadedId(entry.id);
    setMinutes(Math.round(entry.durationSeconds / 60));
    setNote(entry.note ?? '');
  }

  const save = async () => {
    await updateEntry(entry.id, {
      durationSeconds: minutes * 60,
      note: note || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 card" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">编辑记录</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          修改时长不会自动修改关联进度。删除该记录时可以选择是否撤销关联进度。
        </p>
        <div className="mb-3">
          <label className="label">日期</label>
          <input type="date" className="input" defaultValue={entry.learningDate} onChange={(e) => {
            const date = e.target.value;
            if (date) void updateEntry(entry.id, { learningDate: date });
          }} />
        </div>
        <div className="mb-3">
          <label className="label">时长（分钟）</label>
          <input type="number" min={1} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </div>
        <div className="mb-4">
          <label className="label">备注</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
