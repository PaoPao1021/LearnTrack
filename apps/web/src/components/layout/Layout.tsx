import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { startSyncLoop } from '../../services/sync';
import { ensureSeeded, ensureDeviceId } from '../../db/seed';
import { useEffect, useState } from 'react';
import { useTimer, elapsedSeconds } from '../../stores/timer';
import { formatClock } from '../../utils';
import {
  LayoutDashboard, ScrollText, ChartSpline, Compass, Settings2, Timer,
} from 'lucide-react';

const NAV = [
  { to: '/', label: '总览', en: 'OVERVIEW', icon: LayoutDashboard },
  { to: '/entries', label: '记录', en: 'LOG', icon: ScrollText },
  { to: '/analytics', label: '统计', en: 'STATS', icon: ChartSpline },
  { to: '/learning', label: '学习', en: 'LEARN', icon: Compass },
];

export default function Layout() {
  const navigate = useNavigate();
  const [time, setTime] = useState('');
  useEffect(() => {
    void ensureSeeded();
    void ensureDeviceId();
    const stop = startSyncLoop();
    const clock = window.setInterval(() => {
      setTime(new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    }, 1000);
    return () => { stop(); window.clearInterval(clock); };
  }, []);

  const timer = useTimer();
  useEffect(() => {
    const t = window.setInterval(() => useTimer.getState().tick(), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;

  return (
    <div className="relative flex min-h-full">
      {/* Desktop rail */}
      <aside className="sticky top-0 z-10 hidden h-screen w-60 shrink-0 flex-col justify-between border-r p-6 hairline backdrop-blur-2xl md:flex" style={{ background: 'var(--glass)', WebkitBackdropFilter: 'blur(28px)' }}>
        <div>
          <div className="rise flex items-baseline gap-1">
            <span className="display text-2xl">Learn</span>
            <span className="display text-2xl" style={{ color: 'var(--accent)' }}>Track</span>
          </div>
          <div className="mono mt-1 text-[10px] opacity-50">TIME · LEDGER · 001</div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${isActive ? 'bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]' : 'opacity-60 hover:opacity-100'}`}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                  <n.icon size={18} strokeWidth={1.8} style={isActive ? { color: 'var(--accent)' } : undefined} />
                  <span className="text-sm font-semibold">{n.label}</span>
                  <span className="mono ml-auto text-[9px] opacity-40">0{i + 1}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-4">
          <div className="tick-text text-xs opacity-50" suppressHydrationWarning>{time} CST</div>
          <button className="btn-ghost w-full" onClick={() => navigate('/settings')}>
            <Settings2 size={16} strokeWidth={1.8} /> 设置
          </button>
        </div>
      </aside>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3 backdrop-blur-xl hairline md:hidden" style={{ background: 'var(--glass)' }}>
          <div className="display text-lg">Learn<span style={{ color: 'var(--accent)' }}>Track</span></div>
          <div className="flex items-center gap-3">
            {timer.status !== 'idle' && (
              <span className={`tick-text flex items-center gap-1.5 text-sm font-medium ${timer.status === 'running' ? 'pulse-ring rounded-full px-2 py-0.5' : ''}`} style={{ color: 'var(--accent)' }}>
                <Timer size={14} /> {formatClock(elapsed)}
              </span>
            )}
            <button className="btn-ghost px-3 py-2" onClick={() => navigate('/settings')} aria-label="设置">
              <Settings2 size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-8 md:px-10 md:pb-14">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-10 flex border-t backdrop-blur-xl hairline md:hidden"
          style={{ background: 'color-mix(in srgb, var(--paper) 88%, transparent)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-3 text-[11px] transition-colors ${isActive ? 'font-semibold' : 'opacity-50'}`}
              style={({ isActive }) => (isActive ? { color: 'var(--accent)' } : undefined)}
            >
              {({ isActive }) => (
                <>
                  <n.icon size={19} strokeWidth={isActive ? 2.2 : 1.6} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
