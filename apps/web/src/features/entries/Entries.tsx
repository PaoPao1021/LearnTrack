import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import EntryModal from '../../components/common/EntryModal';
import { Modal } from '../../components/common/Modal';
import { updateEntry } from '../../services/commands';
import { localDateKey } from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import { useI18n, translateError } from '../../i18n';
import type { Category, EntryRecord } from '@learntrack/domain';
import { DeleteEntryDialog } from './DeleteEntryDialog';

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

function EntryRow({ entry, activity, subject, major, onEdit }: {
  entry: EntryRecord; activity?: Category; subject?: Category; major?: Category; onEdit: () => void;
}) {
  const { t, fmtDuration } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: activity?.color ?? '#999' }} />
          <span className="font-medium">
            {major ? `${major.name} / ` : ''}{subject?.name ?? ''} / {activity?.name ?? '—'}
          </span>
          <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {t(`method.${entry.method}` as 'method.duration' | 'method.range' | 'method.timer')}
          </span>
          {entry.moodScore != null && <span className="text-xs text-slate-500">{t('entries.mood', { score: entry.moodScore })}</span>}
          {entry.interruptionReason && <span className="text-xs text-slate-500">{t('entries.interruption', { reason: entry.interruptionReason })}</span>}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {entry.startedAt != null && entry.endedAt != null
            ? `${fmtTime(entry.startedAt)} – ${localDateKey(new Date(entry.endedAt), TZ) !== entry.learningDate ? t('entries.nextDay') : ''}${fmtTime(entry.endedAt)}`
            : t('entries.noTime')}
          {entry.pauseIntervals && entry.pauseIntervals.length > 0 && t('entries.pauseCount', { count: entry.pauseIntervals.length })}
          {entry.note ? ` · ${entry.note}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold">{fmtDuration(entry.durationSeconds)}</span>
        <button className="btn-ghost px-3 py-2 text-xs" onClick={onEdit}>{t('entries.edit')}</button>
        <button className="btn-danger px-3 py-2 text-xs" onClick={() => setConfirmDelete(true)}>{t('common.delete')}</button>
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
  const { t, fmtDuration } = useI18n();
  // 筛选、搜索与页码保存在 URL：刷新、返回、分享链接都能还原上下文
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const filterActivity = searchParams.get('filter') ?? '';
  const rawPage = Number(searchParams.get('page') ?? '0');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 0;
  const PAGE = 14;

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EntryRecord | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, totalPages - 1);

  const grouped = useMemo(() => {
    const map = new Map<string, EntryRecord[]>();
    for (const e of filtered.slice(current * PAGE, current * PAGE + PAGE)) {
      if (!map.has(e.learningDate)) map.set(e.learningDate, []);
      map.get(e.learningDate)!.push(e);
    }
    return [...map.entries()];
  }, [filtered, current]);

  const majors = (categories ?? []).filter((c) => c.level === 'major' && !c.deletedAt);
  const subjects = (categories ?? []).filter((c) => c.level === 'subject' && !c.deletedAt);
  const activities = (categories ?? []).filter((c) => c.level === 'activity' && !c.deletedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-xl">{t('entries.title')}</h1>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> {t('entries.add')}</button>
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input max-w-48" placeholder={t('entries.searchPlaceholder')} aria-label={t('entries.searchLabel')} value={search} onChange={(e) => updateParams({ q: e.target.value, page: null })} />
        <select className="input max-w-40" aria-label={t('entries.filterLabel')} value={filterActivity} onChange={(e) => updateParams({ filter: e.target.value, page: null })}>
          <option value="">{t('entries.filterAll')}</option>
          <optgroup label={t('optgroup.majors')}>
            {majors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label={t('optgroup.subjects')}>
            {subjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label={t('optgroup.activities')}>
            {activities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        </select>
        <span className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400">{t('entries.count', { count: filtered.length })}</span>
      </div>

      {grouped.length === 0 && (
        <div className="card p-8 text-center text-slate-500 dark:text-slate-400">
          {t('entries.empty')}
        </div>
      )}

      {grouped.map(([date, list]) => (
        <div key={date} className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              {date}
              {date === todayKey() && <span className="ml-2 text-xs font-normal text-slate-400">{t('entries.today')}</span>}
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {fmtDuration(list.reduce((s, e) => s + e.durationSeconds, 0))}
            </span>
          </div>
          <ul className="space-y-2">
            {list.map((e) => {
              const activity = byId.get(e.activityId);
              const subject = activity?.parentId ? byId.get(activity.parentId) : undefined;
              const major = subject?.parentId ? byId.get(subject.parentId) : undefined;
              return (
                <EntryRow
                  key={e.id}
                  entry={e}
                  activity={activity}
                  subject={subject}
                  major={major}
                  onEdit={() => setEditing(e)}
                />
              );
            })}
          </ul>
        </div>
      ))}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label={t('entries.pageNav')}>
          <button className="btn-ghost" disabled={current === 0} onClick={() => updateParams({ page: String(current - 1) })}>{t('entries.prevPage')}</button>
          <span className="text-sm text-slate-500">{current + 1} / {totalPages}</span>
          <button className="btn-ghost" disabled={current >= totalPages - 1} onClick={() => updateParams({ page: String(current + 1) })}>{t('entries.nextPage')}</button>
        </nav>
      )}

      <EntryModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditEntryModal entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditEntryModal({ entry, onClose }: { entry: EntryRecord | null; onClose: () => void }) {
  if (!entry) return null;
  return <EditEntryForm key={entry.id} entry={entry} onClose={onClose} />;
}

function EditEntryForm({ entry, onClose }: { entry: EntryRecord; onClose: () => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(entry.learningDate);
  const [minutes, setMinutes] = useState(Math.round(entry.durationSeconds / 60));
  const [note, setNote] = useState(entry.note ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(t('entry.errInvalidDate'));
    if (!Number.isFinite(minutes) || minutes <= 0) return setError(t('entry.errDuration'));
    const patch: Partial<EntryRecord> = { learningDate: date, durationSeconds: Math.round(minutes * 60), note: note || null };
    if (entry.startedAt != null && entry.endedAt != null) {
      const originalDay = Date.parse(`${entry.learningDate}T00:00:00Z`);
      const nextDay = Date.parse(`${date}T00:00:00Z`);
      const shift = nextDay - originalDay;
      const shiftedStart = entry.startedAt + shift;
      const shiftedPauses = (entry.pauseIntervals ?? []).map((p) => ({ startAt: p.startAt + shift, endAt: p.endAt + shift }));
      const pausedMs = shiftedPauses.reduce((sum, p) => sum + Math.max(0, p.endAt - p.startAt), 0);
      patch.startedAt = shiftedStart;
      patch.endedAt = shiftedStart + Math.round(minutes * 60_000) + pausedMs;
      patch.pauseIntervals = shiftedPauses;
    }
    try {
      await updateEntry(entry.id, patch);
      onClose();
    } catch (err) {
      setError(translateError(err, t));
    }
  };

  return (
    <Modal labelledBy="edit-entry-title" onClose={onClose} panelClassName="modal-panel glass-emphasis w-full max-w-md rounded-2xl p-5">
      <h2 id="edit-entry-title" className="mb-4 text-lg font-semibold">{t('edit.title')}</h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('edit.hint')}</p>
      <div className="mb-3">
        <label className="label" htmlFor="edit-date">{t('edit.date')}</label>
        <input id="edit-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="label" htmlFor="edit-minutes">{t('edit.minutes')}</label>
        <input id="edit-minutes" type="number" min={1} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="edit-note">{t('edit.note')}</label>
        <input id="edit-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={save}>{t('common.save')}</button>
      </div>
    </Modal>
  );
}
