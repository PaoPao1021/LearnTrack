import { useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, ChevronsUpDown, Calendar, FilterX } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { EmptyState } from '../../components/common/EmptyState';
import EntryModal from '../../components/common/EntryModal';
import { Modal } from '../../components/common/Modal';
import { updateEntry } from '../../services/commands';
import { localDateKey } from '@learntrack/domain';
import { todayKey, TZ } from '../../utils';
import { useI18n, translateError } from '../../i18n';
import type { Category, EntryRecord } from '@learntrack/domain';
import { DeleteEntryDialog } from './DeleteEntryDialog';
import { soundscape } from '../../services/soundscape';
import { showToast } from '../../components/common/Toast';

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

function EntryRow({ entry, activity, subject, major, onEdit }: {
  entry: EntryRecord; activity?: Category; subject?: Category; major?: Category; onEdit: () => void;
}) {
  const { t, fmtDuration } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const color = activity?.color ?? 'var(--accent)';

  return (
    <li className="group relative flex items-start justify-between gap-3 overflow-hidden rounded-2xl border border-[var(--border-soft)]/60 bg-white/50 p-3.5 pl-4 backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--border-glass)] dark:bg-white/[0.03]">
      {/* 左侧科目专属彩色指示条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-200 group-hover:w-1.5"
        style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm text-[var(--ink)]">
            {major ? `${major.name} / ` : ''}{subject?.name ?? ''} / {activity?.name ?? '—'}
          </span>
          <span className="rounded-md border border-[var(--border-soft)]/60 bg-black/[0.03] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] dark:bg-white/[0.05]">
            {t(`method.${entry.method}` as 'method.duration' | 'method.range' | 'method.timer')}
          </span>
          {entry.moodScore != null && <span className="text-xs text-[var(--text-tertiary)]">{t('entries.mood', { score: entry.moodScore })}</span>}
          {entry.interruptionReason && <span className="text-xs text-[var(--text-tertiary)]">{t('entries.interruption', { reason: entry.interruptionReason })}</span>}
        </div>
        <div className="mt-1 text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-1.5">
          <span>
            {entry.startedAt != null && entry.endedAt != null
              ? `${fmtTime(entry.startedAt)} – ${localDateKey(new Date(entry.endedAt), TZ) !== entry.learningDate ? t('entries.nextDay') : ''}${fmtTime(entry.endedAt)}`
              : t('entries.noTime')}
          </span>
          {entry.pauseIntervals && entry.pauseIntervals.length > 0 && (
            <span className="text-[var(--text-tertiary)]">· {t('entries.pauseCount', { count: entry.pauseIntervals.length })}</span>
          )}
          {entry.note && <span className="text-[var(--text-tertiary)] italic">· “{entry.note}”</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tick-text font-bold text-sm text-[var(--ink)]">{fmtDuration(entry.durationSeconds)}</span>
        <button
          className="btn-ghost px-2.5 py-1 text-xs opacity-75 group-hover:opacity-100 transition-opacity"
          onClick={() => {
            soundscape.playTick();
            onEdit();
          }}
        >
          {t('entries.edit')}
        </button>
        <button
          className="btn-danger px-2.5 py-1 text-xs opacity-75 group-hover:opacity-100 transition-opacity"
          onClick={() => {
            soundscape.playTick();
            setConfirmDelete(true);
          }}
        >
          {t('common.delete')}
        </button>
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
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

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

  const allCollapsed = grouped.length > 0 && grouped.every(([d]) => collapsedDates.has(d));

  const toggleCollapseAll = () => {
    if (allCollapsed) {
      setCollapsedDates((prev) => {
        const next = new Set(prev);
        for (const [d] of grouped) next.delete(d);
        return next;
      });
    } else {
      setCollapsedDates((prev) => {
        const next = new Set(prev);
        for (const [d] of grouped) next.add(d);
        return next;
      });
    }
  };

  const toggleDate = (date: string) => {
    soundscape.playTick();
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const majors = (categories ?? []).filter((c) => c.level === 'major' && !c.deletedAt);
  const subjects = (categories ?? []).filter((c) => c.level === 'subject' && !c.deletedAt);
  const activities = (categories ?? []).filter((c) => c.level === 'activity' && !c.deletedAt);

  const isFiltered = Boolean(search.trim() || filterActivity);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-xl">{t('entries.title')}</h1>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> {t('entries.add')}</button>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
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

        <div className="ml-auto flex items-center gap-3">
          {grouped.length > 1 && (
            <button
              type="button"
              className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-xs"
              onClick={toggleCollapseAll}
              title={allCollapsed ? t('entries.expandAll') : t('entries.collapseAll')}
            >
              <ChevronsUpDown size={13} />
              <span>{allCollapsed ? t('entries.expandAll') : t('entries.collapseAll')}</span>
            </button>
          )}
          <span className="self-center text-xs text-slate-500 dark:text-slate-400">{t('entries.count', { count: filtered.length })}</span>
        </div>
      </div>

      {grouped.length === 0 && (
        isFiltered ? (
          <EmptyState
            icon={<FilterX size={20} />}
            title={t('empty.noFilterResults')}
            description={t('empty.clearFilter')}
            action={{
              label: t('empty.clearFilter'),
              onClick: () => updateParams({ q: null, filter: null, page: null }),
            }}
          />
        ) : (
          <EmptyState
            icon={<Calendar size={20} />}
            title={t('empty.noRecords')}
            description={t('entries.empty')}
            action={{
              label: t('entries.add'),
              onClick: () => setAddOpen(true),
            }}
          />
        )
      )}

      {grouped.map(([date, list]) => {
        const isCollapsed = collapsedDates.has(date);
        return (
          <div key={date} className="card p-4 transition-all">
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDate(date); } }}
              onClick={() => toggleDate(date)}
              className="flex cursor-pointer select-none items-center justify-between rounded-lg p-1 -m-1 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight size={16} className="text-slate-400 transition-transform" />
                ) : (
                  <ChevronDown size={16} className="text-slate-400 transition-transform" />
                )}
                <h2 className="text-sm font-semibold">
                  {date}
                  {date === todayKey() && <span className="ml-2 text-xs font-normal text-slate-400">{t('entries.today')}</span>}
                </h2>
                <span className="tick-text text-xs text-slate-400">
                  ({list.length})
                </span>
              </div>
              <span className="tick-text text-sm text-slate-500 dark:text-slate-400">
                {fmtDuration(list.reduce((s, e) => s + e.durationSeconds, 0))}
              </span>
            </div>
            {!isCollapsed && (
              <ul className="mt-3 space-y-2">
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
            )}
          </div>
        );
      })}

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
