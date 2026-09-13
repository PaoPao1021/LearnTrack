import { ReactNode, useLayoutEffect, useRef, useState } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * 分段选择器：连续浅玻璃轨道，选中底座平滑移动到底项（而非仅变色）。
 * 底座用 transform 过渡，文字与图标保持清晰。
 */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedProps<T>) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pedestal, setPedestal] = useState<{ x: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const index = options.findIndex((o) => o.value === value);
    const el = itemRefs.current[index];
    if (el) setPedestal({ x: el.offsetLeft, width: el.offsetWidth });
  }, [value, options]);

  return (
    <div role="group" aria-label={ariaLabel} className={`segmented glass-regular ${className ?? ''}`}>
      <span
        className="segmented-pedestal"
        aria-hidden
        style={pedestal ? { transform: `translateX(${pedestal.x}px)`, width: pedestal.width } : { opacity: 0 }}
      />
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => { itemRefs.current[i] = el; }}
          type="button"
          className={option.value === value ? 'segmented-item is-active' : 'segmented-item'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
