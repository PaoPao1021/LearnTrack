import { useState } from 'react';
import { deleteEntry } from '../../services/commands';
import { Modal } from '../../components/common/Modal';
import type { EntryRecord } from '@learntrack/domain';

/** Deletion keeps linked progress by default; undoing only reverts this entry's own progress events. */
export function DeleteEntryDialog({ entry, onClose }: { entry: EntryRecord; onClose: () => void }) {
  const [undoProgress, setUndoProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const linked = entry.linkedPathId != null;

  const confirm = async () => {
    setBusy(true);
    await deleteEntry(entry.id, undoProgress);
    setBusy(false);
    onClose();
  };

  return (
    <Modal labelledBy="delete-entry-title" onClose={onClose} panelClassName="modal-panel glass-emphasis w-full max-w-sm rounded-2xl p-5">
      <h2 id="delete-entry-title" className="mb-2 text-lg font-semibold">删除这条记录？</h2>
      {linked ? (
        <label className="mb-4 block text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mr-2 h-4 w-4 accent-[var(--accent)]" checked={undoProgress} onChange={(e) => setUndoProgress(e.target.checked)} />
          同时撤销与该记录关联的进度变更（默认保留进度）
        </label>
      ) : (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">删除后统计会立即重算。</p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-danger" disabled={busy} onClick={confirm}>删除</button>
      </div>
    </Modal>
  );
}
