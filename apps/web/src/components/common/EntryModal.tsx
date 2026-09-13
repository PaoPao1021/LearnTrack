import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { Segmented } from './Segmented';
import { useActivities } from './useActivities';
import { ActivityCombobox } from './ActivityCombobox';
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

  const paths = useLiveQuery(() => db.paths.filter((p) => !p.deletedAt).toArray(), [], []);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!activityId) {
      setError('请选择学习活动');
      return;
    }
    let startedAt: number | null = null;
    let endedAt: number | null = null;
    let durationSeconds = 0;
    if (mode === 'duration') {
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setError('请填写大于 0 的时长');
        return;
      }
      durationSeconds = minutes * 60;
    } else {
      startedAt = fromLocalInputValue(`${date}T${start}`);
      const endDayOffset = end < start ? 1 : 0; // cross-midnight
      endedAt = fromLocalInputValue(`${date}T${end}`) + endDayOffset * 86_400_000;
      if (endedAt <= startedAt) {
        setError('结束时间必须晚于开始时间');
        return;
      }
      durationSeconds = Math.round((endedAt - startedAt) / 1000);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('请选择有效的学习日期');
      return;
    }
    if (quantityDelta !== '' && !Number.isFinite(quantityDelta)) {
      setError('进度增量必须是有效数字');
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
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    }
  };

  const selectedPath = (paths ?? []).find((p) => p.id === linkPathId);

  return (
    <Modal
      labelledBy="entry-modal-title"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4"
      panelClassName="modal-panel glass-emphasis max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 md:rounded-2xl"
    >
      <form
        onSubmit={submit}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="label">New Entry</div>
            <h2 id="entry-modal-title" className="display text-2xl">添加学习记录</h2>
          </div>
          <button type="button" className="btn-ghost px-2.5 py-2" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3">
          <Segmented
            ariaLabel="记录方式"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'duration', label: '只填时长' },
              { value: 'range', label: '填写时间段' },
            ] as const}
          />
        </div>

        <div className="mb-3">
          <label className="label" htmlFor="entry-activity">学习活动（支持搜索）</label>
          <ActivityCombobox inputId="entry-activity" value={activityId} onChange={setActivityId} placeholder="搜索大科目 / 科目 / 活动…" />
        </div>

        <div className="mb-3">
          <label className="label" htmlFor="entry-date">学习日期</label>
          <input id="entry-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {mode === 'duration' ? (
          <div className="mb-3">
            <label className="label" htmlFor="entry-minutes">时长（分钟）</label>
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
              <label className="label" htmlFor="entry-start">开始时间</label>
              <input id="entry-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="entry-end">结束时间（可跨午夜）</label>
              <input id="entry-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        )}

        <button type="button" className="mb-3 text-sm text-slate-500 underline dark:text-slate-400" aria-expanded={showExtra} onClick={() => setShowExtra(!showExtra)}>
          {showExtra ? '收起可选信息' : '展开可选信息（状态评分 / 打断 / 备注 / 进度）'}
        </button>

        {showExtra && (
          <div className="mb-3 space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <div>
              <label className="label" htmlFor="entry-mood">自评状态（1–5，可不打）</label>
              <select id="entry-mood" className="input" value={mood} onChange={(e) => setMood(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">未评分</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="entry-interruption">打断原因（可不打）</label>
              <input id="entry-interruption" className="input" value={interruption} onChange={(e) => setInterruption(e.target.value)} placeholder="例如：手机、休息、被人打扰" />
            </div>
            <div>
              <label className="label" htmlFor="entry-note">备注</label>
              <input id="entry-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="entry-link-path">关联路线（可选）</label>
                <select id="entry-link-path" className="input" value={linkPathId} onChange={(e) => { setLinkPathId(e.target.value); setQuantityDelta(''); }}>
                  <option value="">不关联</option>
                  {(paths ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {selectedPath?.mode === 'quantity' && (
                <div>
                  <label className="label" htmlFor="entry-quantity">同时增加{selectedPath.unit ?? '数量'}（可负）</label>
                  <input id="entry-quantity" type="number" className="input" value={quantityDelta} onChange={(e) => setQuantityDelta(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              )}
              {selectedPath?.mode === 'chapters' && (
                <div className="self-end text-xs text-slate-500 dark:text-slate-400">章节模式请在“学习”页勾选完成</div>
              )}
            </div>
          </div>
        )}

        {overlapWarn && (
          <div role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            该时间段与 {overlapWarn.count} 条已有记录重叠。确认保存后，两条记录都会完整计入统计（记录时长口径，不是去重的客观时长）。
            再次点击保存即可确认保留。
          </div>
        )}
        {error && <div role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn-primary">{overlapWarn ? '确认保留并保存' : '保存'}</button>
        </div>
        <div className="mt-2 text-right text-xs text-slate-400">约 {hoursFromSeconds(minutes * 60)} 小时</div>
      </form>
    </Modal>
  );
}

export { toLocalInputValue, fromLocalInputValue };
