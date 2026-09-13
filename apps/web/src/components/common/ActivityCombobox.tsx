import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useActivities, labelOf, type ActivityOption } from './useActivities';

export interface ActivityComboboxProps {
  value: string;
  onChange: (activityId: string) => void;
  placeholder?: string;
  /** accessible name */
  ariaLabel?: string;
  /** set when a visible <label htmlFor> should name the input */
  inputId?: string;
  className?: string;
}

/**
 * 搜索式活动选择器：输入即过滤（大科目 / 具体科目 / 活动名任意片段匹配），
 * 方向键 + 回车选择，Esc 关闭，类似浏览器搜索框的联想列表。
 */
export function ActivityCombobox({ value, onChange, placeholder, ariaLabel, inputId, className }: ActivityComboboxProps) {
  const activities = useActivities();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = activities.find((a) => a.activity.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activities.slice(0, 50);
    return activities.filter((o) =>
      `${o.major.name}${o.subject.name}${o.activity.name}`.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [activities, query]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (opt: ActivityOption) => {
    onChange(opt.activity.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-activedescendant={open && matches.length > 0 ? `${listId}-opt-${active}` : undefined}
          className="input pl-9 pr-8"
          placeholder={selected ? `${labelOf(selected)} · ${selected.activity.name}` : (placeholder ?? '搜索学习活动…')}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const m = matches[active]; if (m) pick(m); }
            else if (e.key === 'Escape') {
              // 先只收起联想列表；列表已收起时才让事件冒泡去关闭外层对话框
              if (open) e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {(selected || query) && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-40 hover:opacity-90"
            aria-label="清除"
            onClick={() => { setQuery(''); onChange(''); setOpen(false); }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && matches.length > 0 && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="glass-emphasis pop-in absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl p-1.5"
        >
          {matches.map((o, i) => {
            const label = `${o.major.name} / ${o.subject.name} / ${o.activity.name}`;
            return (
              <li
                key={o.activity.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={value === o.activity.id}
                data-active={i === active}
              >
                <button
                  type="button"
                  className="menu-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm"
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.subject.color }} />
                  <span className="min-w-0 flex-1 truncate">
                    {highlight(label, query)}
                  </span>
                  {value === o.activity.id && <span className="mono shrink-0 text-[9px]" style={{ color: 'var(--accent)' }}>当前</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="glass-emphasis pop-in absolute z-30 mt-1.5 w-full rounded-2xl p-4 text-sm opacity-80">
          没有匹配“{query}”的活动，可到设置页添加分类。
        </div>
      )}
    </div>
  );
}

function highlight(label: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return label;
  const idx = label.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return label;
  return (
    <>
      {label.slice(0, idx)}
      <span className="font-bold" style={{ color: 'var(--accent)' }}>{label.slice(idx, idx + q.length)}</span>
      {label.slice(idx + q.length)}
    </>
  );
}
