import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { resolveConflict } from '../../services/conflicts';
import { useI18n, translateError } from '../../i18n';
import { AlertTriangle } from 'lucide-react';



/**
 * 冲突处理：两台设备并发修改同一对象时，双方候选都保留在这里。
 * 用户选择后应用其中一个版本，不存在静默覆盖。
 */
export function ConflictSection() {
  const { t, locale } = useI18n();
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), [], []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if ((conflicts ?? []).length === 0) return null;

  const apply = async (id: number | undefined, pick: 'local' | 'server') => {
    if (id == null) return;
    setBusy(String(id));
    setError('');
    try {
      await resolveConflict(id, pick);
    } catch (err) {
      setError(translateError(err, t));
    } finally {
      setBusy(null);
    }
  };

  const describe = (payload: unknown): string => {
    if (payload == null) return t('conflict.deleted');
    const p = payload as Record<string, unknown>;
    if (typeof p.durationSeconds === 'number') return t('conflict.duration', { minutes: Math.round(p.durationSeconds / 60) });
    if (typeof p.completedQuantity === 'number') return t('conflict.quantity', { count: p.completedQuantity });
    if (typeof p.name === 'string') return p.name;
    if (typeof p.title === 'string') return p.title;
    return t('conflict.generic');
  };

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-500" />
        <h2 className="display text-xl">{t('conflicts.title')}</h2>
      </div>
      <p className="mb-4 text-xs opacity-60">
        {t('conflicts.hint')}
      </p>
      {error && <p role="alert" className="mb-3 text-sm">{error}</p>}
      <ul className="space-y-3">
        {(conflicts ?? []).map((c) => (
          <li key={c.id} className="rounded-xl border p-3 text-sm hairline">
            <div className="mb-2 text-xs opacity-60">
              {c.entity} · {new Date(c.createdAt).toLocaleString(locale)}
              {c.opGroupId && <span> · {t('conflicts.group')}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => void apply(c.id, 'local')}>
                {t('conflicts.keepLocal', { desc: describe(c.localPayload) })}
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => void apply(c.id, 'server')}>
                {t('conflicts.useServer', { desc: describe(c.serverPayload) })}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
