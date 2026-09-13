import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { Segmented } from './Segmented';
import { ActivityCombobox } from './ActivityCombobox';
import { useActivities } from './useActivities';
import { useI18n, translateError } from '../../i18n';
import { saveEntryWithProgress, findOverlaps } from '../../services/commands';
import { todayKey, TZ } from '../../utils';
import { db } from '../../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { hoursFromSeconds } from '@learntrack/domain';

const QUICK_DURATIONS = [15, 25, 30, 45, 60, 90, 120];

function toLocalInputValue(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(' ', 'T');
}

function fromLocalInputValue(v: string): number {
  // wall time in TZ; Asia/Shanghai has no DST so fixed +08:00 is correct
  return new Date(`${v}:00+08:00`).getTime();
}

export interface EntryModalProps {
  open: boolean;
  onClose: () => void;
  initialActivityId?: string | null;
  initialDate?: string;
}

export default function EntryModal({ open, onClose, initialActivityId, initialDate }: EntryModalProps) {
  const { t } = useI18n();
  const activities = useActivities();
  const [mode, setMode] = useState<'duration' | 'range'>('duration');
  const [activityId, setActivityId] = useState<string>(initialActivityId ?? '');
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [minutes, setMinutes] = useState(30);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [note, setNote] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [mood, setMood] = useState<number | ''>('');
  const [interruption, setInterruption] = useState('');
  const [linkPathId, setLinkPathId] = useState('');
  const [quantityDelta, setQuantityDelta] = useState<number | ''>('');
  const [overlapWarn, setOverlapWarn] = useState<{ count: number; rangeKey: string } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (!activityId) {
      setError(t('entry.errPickActivity'));
      return;
    }
    let startedAt: number | null = null;
    let endedAt: number | null = null;
    let durationSeconds = 0;
    if (mode === 'duration') {
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setError(t('entry.errDuration'));
        return;
      }
      durationSeconds = minutes * 60;
    } else {
      startedAt = fromLocalInputValue(`${date}T${start}`);
      const endDayOffset = end < start ? 1 : 0; // cross-midnight
      endedAt = fromLocalInputValue(`${date}T${end}`) + endDayOffset * 86_400_000;
      if (endedAt <= startedAt) {
        setError(t('entry.errEndBeforeStart'));
        return;
      }
      durationSeconds = Math.round((endedAt - startedAt) / 1000);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(t('entry.errInvalidDate'));
      return;
    }
    if (quantityDelta !== '' && !Number.isFinite(quantityDelta)) {
      setError(t('entry.errQuantity'));
      return;
    }
    // 重叠检测先于落库：未确认时不保存，避免双写
    const overlapCount = startedAt != null && endedAt != null
      ? (await findOverlaps(startedAt, endedAt)).length
      : 0;
    const rangeKey = `${startedAt ?? ''}:${endedAt ?? ''}`;
    if (overlapCount > 0 && overlapWarn?.rangeKey !== rangeKey) {
      setOverlapWarn({ count: overlapCount, rangeKey });
      return;
    }
    if (overlapCount === 0) setOverlapWarn(null);
    setSubmitting(true);
    try {
      await saveEntryWithProgress({
        activityId,
        method: mode === 'duration' ? 'duration' : 'range',
        learningDate: date,
        startedAt,
        endedAt,
        durationSeconds,
        note: note || null,
        moodScore: mood === '' ? null : Number(mood),
        interruptionReason: interruption || null,
        linkedPathId: linkPathId || null,
        quantityDelta: quantityDelta === '' ? null : Number(quantityDelta),
      });
      onClose();
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPath = (paths ?? []).find((p) => p.id === linkPathId);

  return (
    <Modal
      labelledBy="entry-modal-title"
      onClose={onClose}
      overlayClassName="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
      panelClassName="modal-panel glass-emphasis max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 md:rounded-2xl"
    >
      <form
        onSubmit={submit}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="label">New Entry</div>
            <h2 id="entry-modal-title" className="display text-2xl">{t('entry.title')}</h2>
          </div>
          <button type="button" className="btn-ghost p-2.5" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="mb-3">
          <Segmented
            ariaLabel={t('entry.modeDuration') + ' / ' + t('entry.modeRange')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'duration', label: t('entry.modeDuration') },
              { value: 'range', label: t('entry.modeRange') },
            ] as const}
          />
        </div>

        <div className="mb-3">
          <label className="label" htmlFor="entry-activity">{t('entry.activity')}</label>
          <ActivityCombobox inputId="entry-activity" value={activityId} onChange={setActivityId} placeholder={t('entry.activityPlaceholder')} />
        </div>

        <div className="mb-3">
          <label className="label" htmlFor="entry-date">{t('entry.date')}</label>
          <input id="entry-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {mode === 'duration' ? (
          <div className="mb-3">
            <label className="label" htmlFor="entry-minutes">{t('entry.minutes')}</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} className={minutes === m ? 'btn-primary px-3 py-1' : 'btn-ghost px-3 py-1'} onClick={() => setMinutes(m)}>{m}</button>
              ))}
            </div>
            <input id="entry-minutes" type="number" min={1} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </div>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entry-start">{t('entry.start')}</label>
              <input id="entry-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="entry-end">{t('entry.end')}</label>
              <input id="entry-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        )}

        <button type="button" className="mb-3 text-sm underline" style={{ color: 'var(--text-secondary)' }} aria-expanded={showExtra} onClick={() => setShowExtra(!showExtra)}>
          {showExtra ? t('entry.moreHide') : t('entry.moreShow')}
        </button>

        {showExtra && (
          <div className="mb-3 space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <div>
              <label className="label" htmlFor="entry-mood">{t('entry.mood')}</label>
              <select id="entry-mood" className="input" value={mood} onChange={(e) => setMood(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">{t('entry.moodNone')}</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="entry-interruption">{t('entry.interruption')}</label>
              <input id="entry-interruption" className="input" value={interruption} onChange={(e) => setInterruption(e.target.value)} placeholder={t('entry.interruptionPlaceholder')} />
            </div>
            <div>
              <label className="label" htmlFor="entry-note">{t('entry.note')}</label>
              <input id="entry-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="entry-link-path">{t('entry.linkPath')}</label>
                <select id="entry-link-path" className="input" value={linkPathId} onChange={(e) => { setLinkPathId(e.target.value); setQuantityDelta(''); }}>
                  <option value="">{t('entry.linkNone')}</option>
                  {(paths ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {selectedPath?.mode === 'quantity' && (
                <div>
                  <label className="label" htmlFor="entry-quantity">{t('entry.quantity', { unit: selectedPath.unit ?? t('entry.quantityUnit') })}</label>
                  <input id="entry-quantity" type="number" className="input" value={quantityDelta} onChange={(e) => setQuantityDelta(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              )}
              {selectedPath?.mode === 'chapters' && (
                <div className="self-end text-xs text-slate-500 dark:text-slate-400">{t('entry.chaptersHint')}</div>
              )}
            </div>
          </div>
        )}

        {overlapWarn && (
          <div role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {t('entry.overlap', { count: overlapWarn.count })}
          </div>
        )}
        {error && <div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={submitting}>{overlapWarn ? t('entry.confirmSave') : t('common.save')}</button>
        </div>
        <div className="mt-2 text-right text-xs text-slate-400">{t('entry.approxHours', { hours: hoursFromSeconds(minutes * 60) })}</div>
      </form>
    </Modal>
  );
}

export { toLocalInputValue, fromLocalInputValue };
