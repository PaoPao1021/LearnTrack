import React, { useEffect, useRef } from 'react';
import { Sparkles, Trophy, Check, ArrowRight } from 'lucide-react';
import { formatClock } from '../../utils';

export interface CelebrationModalProps {
  open: boolean;
  activityName: string;
  activityColor?: string;
  durationSeconds: number;
  todayTotalSeconds: number;
  onClose: () => void;
}

export const CelebrationModal: React.FC<CelebrationModalProps> = ({
  open,
  activityName,
  activityColor = 'var(--accent)',
  durationSeconds,
  todayTotalSeconds,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // 生成微星尘粒子
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
    }[] = [];

    const colors = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#06b6d4', '#ffffff'];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.5;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)] ?? '#f59e0b',
        alpha: 1,
        decay: Math.random() * 0.015 + 0.01,
      });
    }

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // subtle gravity
        p.alpha -= p.decay;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      if (alive) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 粒子画布 */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-10" />

      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* 结算卡片 */}
      <div
        role="dialog"
        aria-modal="true"
        className="pop-in relative z-20 w-full max-w-sm overflow-hidden rounded-3xl p-6 text-center shadow-2xl"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          backgroundImage: 'var(--card-sheen)',
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-overlay), 0 20px 60px -15px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* 顶部徽标与光晕 */}
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-md"
             style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)' }}>
          <Trophy size={28} className="text-white drop-shadow-sm" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-xs">
            <Sparkles size={11} />
          </span>
        </div>

        <div className="mono text-[10px] font-bold tracking-widest text-[var(--accent)]">
          SESSION COMPLETED
        </div>
        <h3 className="display mt-1 text-xl font-bold tracking-tight text-[var(--ink)]">
          专注达成 · 成果入账
        </h3>

        {/* 学习活动胶囊 */}
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white/50 px-3.5 py-1 text-xs font-medium dark:bg-white/[0.05]">
          <span className="h-2 w-2 rounded-full" style={{ background: activityColor }} />
          <span className="text-[var(--ink)]">{activityName}</span>
        </div>

        {/* 时长高光展示 */}
        <div className="my-5 rounded-2xl border border-[var(--border-soft)] bg-black/[0.02] py-4 dark:bg-white/[0.03]">
          <div className="tick-text text-4xl font-extrabold tracking-tight text-gradient-accent">
            {formatClock(durationSeconds)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-tertiary)]">本次有效专注时长</div>
        </div>

        {/* 今日累计提示 */}
        <div className="mb-6 flex items-center justify-between rounded-xl bg-white/40 px-3.5 py-2.5 text-xs text-[var(--text-secondary)] dark:bg-white/[0.04]">
          <span>今日累计专注</span>
          <span className="tick-text font-bold text-[var(--ink)]">{formatClock(todayTotalSeconds)}</span>
        </div>

        {/* 确认关闭按钮 */}
        <button
          type="button"
          className="btn-primary w-full shadow-lg"
          onClick={onClose}
        >
          <Check size={16} /> 收下成果，继续前行
        </button>
      </div>
    </div>
  );
};
