import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    to?: string;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`card flex flex-col items-center justify-center p-8 text-center transition-all ${className}`}
      style={{ minHeight: '140px' }}
    >
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          background: 'color-mix(in srgb, var(--accent) 8%, var(--surface-elevated))',
          boxShadow: 'inset 0 1px 0 var(--edge-highlight-soft), var(--shadow-near)',
          color: 'var(--accent)',
        }}
      >
        {icon ?? <Inbox size={22} strokeWidth={1.75} className="opacity-80" />}
      </div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action.to ? (
            <Link to={action.to} className="btn-ghost text-xs">
              {action.label}
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className="btn-ghost text-xs">
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
