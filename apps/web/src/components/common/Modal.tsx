import { KeyboardEvent, ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isHidden(el: HTMLElement): boolean {
  return el.offsetWidth <= 0 && el.offsetHeight <= 0;
}

export interface ModalProps {
  /** id of the visible heading element that names this dialog */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /** classes for the dialog panel (sizing, padding, card look) */
  panelClassName?: string;
  /** classes for the fixed overlay; defaults to a centered dialog */
  overlayClassName?: string;
  /** close when the dimmed backdrop is clicked (default true) */
  dismissOnBackdrop?: boolean;
}

/**
 * 无障碍对话框：dialog 语义、焦点陷阱、初始焦点、Escape 关闭、
 * 关闭后焦点返回触发元素，并锁定背景滚动。
 */
export function Modal({
  labelledBy,
  onClose,
  children,
  panelClassName = 'modal-panel glass-emphasis w-full max-w-md rounded-2xl p-5',
  overlayClassName = 'modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4',
  dismissOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel) panel.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !isHidden(el));
    if (focusables.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const current = document.activeElement;
    if (e.shiftKey && (current === first || current === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={overlayClassName}
      onClick={dismissOnBackdrop ? onClose : undefined}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
