import { useState } from 'react';
import { deleteEntry } from '../../services/commands';
import { Modal } from '../../components/common/Modal';
import { useI18n } from '../../i18n';
import type { EntryRecord } from '@learntrack/domain';

/** Deletion keeps linked progress by default; undoing only reverts this entry's own progress events. */
export function DeleteEntryDialog({ entry, onClose }: { entry: EntryRecord; onClose: () => void }) {
  const { t } = useI18n();
  const [undoProgress, setUndoProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');
  const linked = entry.linkedPathId != null;

  const confirm = async () => {
    setBusy(true);
    try {
      const code = await deleteEntry(entry.id, undoProgress);
      if (code) {
        // 撤销进度没有可回退的变更：提示后由用户关闭
        setWarning(t(code as 'warn.noProgressToUndo'));
        setBusy(false);
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy="delete-entry-title" onClose={onClose} panelClassName="modal-panel glass-emphasis w-full max-w-sm rounded-2xl p-5">
      <h2 id="delete-entry-title" className="mb-2 text-lg font-semibold">{t('delete.title')}</h2>
      {linked ? (
        <label className="mb-4 block text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mr-2 h-4 w-4 accent-[var(--accent)]" checked={undoProgress} onChange={(e) => setUndoProgress(e.target.checked)} />
          {t('delete.undoLabel')}
        </label>
      ) : (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('delete.noLinked')}</p>
      )}
      {warning && <p role="status" className="mb-4 text-sm text-amber-600 dark:text-amber-400">{warning}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-danger" disabled={busy} onClick={confirm}>{t('common.delete')}</button>
      </div>
    </Modal>
  );
}
