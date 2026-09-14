import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Sparkles, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warn';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const TOAST_EVENT = 'learntrack-toast-event';

/** 触发全局悬浮微气泡 Toast */
export function showToast(message: string, type: ToastType = 'success') {
  if (typeof window === 'undefined') return;
  const evt = new CustomEvent(TOAST_EVENT, { detail: { message, type, id: Math.random().toString(36).slice(2) } });
  window.dispatchEvent(evt);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastItem>).detail;
      setToasts((prev) => [...prev, detail]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 3000);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 inset-x-0 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-elevated)]/85 px-4 py-2.5 text-xs font-medium text-[var(--ink)] shadow-xl backdrop-blur-xl transition-all duration-300 animate-[panel-in_0.28s_var(--ease-spring)_both]"
          style={{
            boxShadow: '0 8px 30px -4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {t.type === 'success' && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
          {t.type === 'info' && <Sparkles size={15} className="text-[var(--accent)] shrink-0" />}
          {t.type === 'warn' && <AlertCircle size={15} className="text-amber-500 shrink-0" />}
          <span>{t.message}</span>
          <button
            type="button"
            className="ml-1 opacity-40 hover:opacity-100 transition-opacity"
            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
