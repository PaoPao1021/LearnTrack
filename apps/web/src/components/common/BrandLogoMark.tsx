import React from 'react';

interface BrandLogoMarkProps {
  size?: number;
  className?: string;
}

export function BrandLogoMark({ size = 42, className = '' }: BrandLogoMarkProps) {
  return (
    <div
      className={`group relative flex shrink-0 items-center justify-center select-none cursor-pointer ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 动态全息呼吸光晕底衬 */}
      <div
        className="brand-aura pointer-events-none absolute inset-[-3px] rounded-[18px] opacity-75 blur-md transition-all duration-500 group-hover:opacity-100 group-hover:blur-lg"
        style={{
          background: 'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 80%, #a855f7) 0%, #38bdf8 60%, transparent 80%)',
        }}
      />

      {/* 晶体镜面圆角外壳 (Squircle Shell) */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] border border-white/30 shadow-md backdrop-blur-md transition-transform duration-300 group-hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, #6366f1) 0%, #4338ca 100%)',
          boxShadow: 'inset 0 1px 1.5px rgba(255, 255, 255, 0.55), 0 4px 16px -2px color-mix(in srgb, var(--accent) 50%, transparent)',
        }}
      >
        {/* 动态流光斜掠层 */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* 核心精密时计 SVG */}
        <svg
          viewBox="0 0 36 36"
          className="relative h-[78%] w-[78%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 外圈：天体星座 12 刻度星齿（顺时针匀速旋转） */}
          <g className="chrono-gear origin-center">
            <circle
              cx="18"
              cy="18"
              r="14.5"
              stroke="white"
              strokeWidth="1.2"
              strokeDasharray="2 5.59"
              opacity="0.65"
              strokeLinecap="round"
            />
          </g>

          {/* 中圈：精密测速计刻度轨道（逆时针缓慢旋转） */}
          <g className="chrono-track origin-center">
            <circle
              cx="18"
              cy="18"
              r="10.5"
              stroke="white"
              strokeWidth="1"
              strokeDasharray="1.5 2.5"
              opacity="0.45"
            />
          </g>

          {/* 精密机械联动时针（顺畅旋转，较粗厚实，36秒一圈） */}
          <g className="chrono-hour origin-center">
            <line
              x1="18"
              y1="18"
              x2="18"
              y2="10.5"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              opacity="0.95"
            />
            <circle
              cx="18"
              cy="10.5"
              r="1.1"
              fill="#ffffff"
            />
          </g>

          {/* 实时恒速滑扫分针（6秒一圈，与时针成联动机械差速） */}
          <g className="chrono-sweep origin-center">
            <line
              x1="18"
              y1="18"
              x2="18"
              y2="5.5"
              stroke="#38bdf8"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle
              cx="18"
              cy="5.5"
              r="1.8"
              fill="#ffffff"
              filter="drop-shadow(0 0 3px #38bdf8)"
            />
          </g>

          {/* 中央微型折射轴心红宝石/晶体 */}
          <circle
            cx="18"
            cy="18"
            r="2.5"
            fill="#ffffff"
            className="chrono-gem origin-center"
          />
          <circle
            cx="18"
            cy="18"
            r="1.2"
            fill="var(--accent)"
          />
        </svg>
      </div>
    </div>
  );
}
