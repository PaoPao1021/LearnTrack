import React from 'react';

export interface ChronoRingProps {
  size?: number;
  strokeWidth?: number;
  progressRatio?: number; // 0 to 1
  isCountdown?: boolean;
  isRunning?: boolean;
  isPaused?: boolean;
  isOvertime?: boolean;
  accentColor?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 环形液态精密表盘 (ChronoRing)
 * 拟物微光 SVG 环形进度仪，支持倒计时光斑引航与正计时星轨微弧
 */
export const ChronoRing: React.FC<ChronoRingProps> = ({
  size = 160,
  strokeWidth = 7,
  progressRatio = 0,
  isCountdown = false,
  isRunning = false,
  isPaused = false,
  isOvertime = false,
  accentColor = 'var(--accent)',
  className = '',
  children,
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // 倒计时进度计算
  const clampedProgress = Math.max(0, Math.min(1, progressRatio));
  const strokeDashoffset = circumference * (1 - clampedProgress);

  // 状态颜色决定
  const activeColor = isPaused
    ? 'var(--warning, #f59e0b)'
    : isOvertime
    ? '#f59e0b'
    : accentColor;

  // 倒计时弧线末端光斑坐标 (从 12 点钟方向 -90deg 开始)
  const angleRad = (clampedProgress * 360 - 90) * (Math.PI / 180);
  const tipX = center + radius * Math.cos(angleRad);
  const tipY = center + radius * Math.sin(angleRad);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="pointer-events-none absolute inset-0 -rotate-90 overflow-visible"
      >
        <defs>
          {/* 进度光条渐变 */}
          <linearGradient id="chrono-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={activeColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="1" />
          </linearGradient>

          {/* 呼吸光晕滤镜 */}
          <filter id="chrono-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 底层轨道环 */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-black/[0.06] dark:text-white/[0.08]"
        />

        {/* 倒计时模式：液态填充弧 */}
        {isCountdown && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="url(#chrono-gradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            filter="url(#chrono-glow)"
            style={{
              transition: isRunning ? 'stroke-dashoffset 0.4s ease-out' : 'none',
            }}
          />
        )}

        {/* 倒计时模式光斑引航头 (Glow Tip) */}
        {isCountdown && isRunning && clampedProgress > 0 && clampedProgress < 1 && (
          <circle
            cx={tipX}
            cy={tipY}
            r={strokeWidth * 0.75}
            fill="#ffffff"
            filter="drop-shadow(0 0 4px var(--accent))"
          />
        )}

        {/* 正向计时模式：旋转星轨微光环 */}
        {!isCountdown && isRunning && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="url(#chrono-gradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            strokeLinecap="round"
            filter="url(#chrono-glow)"
            className={isPaused ? '' : 'animate-spin'}
            style={{ animationDuration: '4s', transformOrigin: `${center}px ${center}px` }}
          />
        )}
      </svg>

      {/* 中心内容容器（数字表盘、状态说明等） */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
};
