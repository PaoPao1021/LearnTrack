import React from 'react';
import { Modal } from './Modal';
import { Keyboard, Sparkles, X } from 'lucide-react';

interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: '专注与计时',
    items: [
      { key: 'Space', description: '开始 / 暂停计时器' },
      { key: 'Z', description: '开启 / 退出全屏禅模式' },
      { key: 'N', description: '快速打开补录 / 填时间段' },
    ],
  },
  {
    category: '导航切换',
    items: [
      { key: '1', description: '跳转到 总览仪表盘' },
      { key: '2', description: '跳转到 学习记录' },
      { key: '3', description: '跳转到 统计分析' },
      { key: '4', description: '跳转到 学习路线' },
    ],
  },
  {
    category: '通用操作',
    items: [
      { key: '?', description: '打开 / 关闭本快捷键帮助' },
      { key: 'Esc', description: '关闭任意弹窗与浮层' },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Modal
      labelledBy="shortcuts-title"
      onClose={onClose}
      panelClassName="modal-panel glass-emphasis w-full max-w-md rounded-3xl p-6 shadow-2xl border border-[var(--border-glass)]"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Keyboard size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 id="shortcuts-title" className="display text-base font-bold tracking-tight">快捷键速查表</h2>
            <p className="text-[11px] text-[var(--text-tertiary)]">键盘效率达人的专属操作台</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-[var(--text-tertiary)] hover:bg-black/5 hover:text-[var(--ink)] dark:hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4">
        {SHORTCUTS.map((group) => (
          <div key={group.category}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              {group.category}
            </div>
            <div className="space-y-1.5 rounded-2xl border border-[var(--border-soft)]/60 bg-white/40 p-2.5 dark:bg-white/[0.02]">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between text-xs py-1 px-1.5">
                  <span className="text-[var(--text-secondary)]">{item.description}</span>
                  <kbd className="tick-text min-w-6 rounded-md border border-[var(--border-soft)] bg-white/80 px-2 py-0.5 text-center text-[11px] font-semibold text-[var(--ink)] shadow-xs dark:bg-slate-800">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--border-soft)]/60 pt-3 text-[11px] text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <Sparkles size={11} className="text-amber-500" />
          任意页面按 <kbd className="px-1 font-mono">?</kbd> 唤出
        </span>
        <button
          type="button"
          className="btn-ghost px-3 py-1 text-xs"
          onClick={onClose}
        >
          我知道了
        </button>
      </div>
    </Modal>
  );
}
