import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { enqueueOp } from '../../services/queue';
import { ensureDeviceId } from '../../db/seed';
import { nowIso } from '../../utils';
import { AlertTriangle } from 'lucide-react';


const TABLES = {
  category: () => db.categories,
  entry: () => db.entries,
  path: () => db.paths,
  pathItem: () => db.pathItems,
  progressEvent: () => db.progressEvents,
  todo: () => db.todos,
  goal: () => db.goals,
  quickAction: () => db.quickActions,
  settings: () => db.settings,
} as const;

/**
 * 冲突处理：两台设备并发修改同一对象时，双方候选都保留在这里。
 * 用户选择后应用其中一个版本，不存在静默覆盖。
 */
export function ConflictSection() {
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), [], []);
  const [busy, setBusy] = useState<string | null>(null);

  if ((conflicts ?? []).length === 0) return null;

  const apply = async (id: number | undefined, pick: 'local' | 'server') => {
    if (id == null) return;
    const row = await db.conflicts.get(id);
    if (!row) return;
    setBusy(String(id));
    const table = TABLES[row.entity as keyof typeof TABLES]?.();
    if (!table) {
      setBusy(null);
      return;
    }
    const selected = (pick === 'local' ? row.localPayload : row.serverPayload) as Record<string, unknown> | null;
    const payload = pick === 'local' && selected && typeof selected.version === 'number'
      ? { ...selected, version: row.serverVersion + 1, updatedAt: nowIso() }
      : selected;
    const deviceId = await ensureDeviceId();
    await db.transaction('rw', [table, db.conflicts, db.pendingOps], async () => {
      if (payload) {
        await table.put(payload as never);
      } else {
        await table.delete(row.entityId as never);
      }
      // 保留本机候选时，以服务端当前版本为基线重新入队；删除候选也必须同步。
      if (pick === 'local') {
        await enqueueOp(row.entity, row.entityId, payload, row.serverVersion, null, deviceId);
      }
      await db.conflicts.delete(id);
    });
    setBusy(null);
  };

  const describe = (payload: unknown): string => {
    if (payload == null) return '已删除';
    const p = payload as Record<string, unknown>;
    if (typeof p.durationSeconds === 'number') return `时长 ${Math.round(p.durationSeconds / 60)} 分钟`;
    if (typeof p.completedQuantity === 'number') return `完成量 ${p.completedQuantity}`;
    if (typeof p.name === 'string') return p.name;
    if (typeof p.title === 'string') return p.title;
    return '版本内容不同';
  };

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-500" />
        <h2 className="display text-xl">待处理冲突</h2>
      </div>
      <p className="mb-4 text-xs opacity-60">
        两台设备同时修改了同一对象。选择要保留的版本；未被选中的版本会被丢弃。
      </p>
      <ul className="space-y-3">
        {(conflicts ?? []).map((c) => (
          <li key={c.id} className="rounded-xl border p-3 text-sm hairline">
            <div className="mb-2 text-xs opacity-60">
              {c.entity} · {new Date(c.createdAt).toLocaleString('zh-CN')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === String(c.id)} onClick={() => void apply(c.id, 'local')}>
                保留本机（{describe(c.localPayload)}）
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === String(c.id)} onClick={() => void apply(c.id, 'server')}>
                使用服务器（{describe(c.serverPayload)}）
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
