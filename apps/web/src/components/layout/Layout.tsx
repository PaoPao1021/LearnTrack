import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { startSyncLoop } from '../../services/sync';
import { ensureSeeded, ensureDeviceId } from '../../db/seed';
import { useThemeBootstrap } from '../../features/settings/useTheme';
import { Suspense, useEffect, useState } from 'react';
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

let initializationPromise: Promise<void> | null = null;
function initializeLocalData(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await ensureSeeded();
      await ensureDeviceId();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

export default function Layout() {
  const navigate = useNavigate();
  useThemeBootstrap();
  const [time, setTime] = useState('');
  useEffect(() => {
    let disposed = false;
    let stopSync = () => {};
    void initializeLocalData().then(() => {
      if (!disposed) stopSync = startSyncLoop();
    }).catch((error) => console.error('本地数据初始化失败', error));
    const clock = window.setInterval(() => {
      setTime(new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    }, 1000);
    return () => { disposed = true; stopSync(); window.clearInterval(clock); };
  }, []);

  const timer = useTimer();
  useEffect(() => {
    const t = window.setInterval(() => useTimer.getState().tick(), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;

  return (
    <div className="relative flex min-h-full">
      {/* Desktop rail：控制层 · 常规玻璃 */}
      <aside className="glass-regular sticky top-0 z-10 hidden h-screen w-60 shrink-0 flex-col justify-between border-y-0 border-l-0 p-6 md:flex">
        <div>
          <div className="rise flex items-baseline gap-0.5">
            <span className="display text-2xl">Learn</span>
            <span className="display text-2xl" style={{ color: 'var(--accent)' }}>Track</span>
          </div>
          <div className="mono mt-1.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>TIME · LEDGER</div>
        </div>

        <nav className="flex flex-col gap-1" aria-label="主导航">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-full px-4 py-2.5 transition-colors duration-200 ${isActive ? '' : 'opacity-70 hover:opacity-100'}`}
              style={({ isActive }) => (isActive
                ? {
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                    boxShadow: 'inset 0 1px 0 var(--edge-highlight-soft), var(--shadow-near), 0 0 0 0.5px var(--border-soft)',
                  }
                : undefined)}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
                      style={{ background: 'var(--accent)' }}
                      aria-hidden
                    />
                  )}
                  <n.icon size={18} strokeWidth={isActive ? 2.1 : 1.8} />
                  <span className="text-sm font-semibold">{n.label}</span>
                  <span className="mono ml-auto text-[9px]" style={{ color: 'var(--text-tertiary)' }}>0{i + 1}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-4">
          <div className="tick-text text-xs" style={{ color: 'var(--text-tertiary)' }} suppressHydrationWarning>{time} CST</div>
          <button className="btn-ghost w-full" onClick={() => navigate('/settings')}>
            <Settings2 size={16} strokeWidth={1.8} /> 设置
          </button>
        </div>
      </aside>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar：控制层 · 常规玻璃 */}
        <header className="glass-regular sticky top-0 z-10 flex items-center justify-between border-x-0 border-t-0 px-5 py-3 md:hidden">
          <div className="display text-lg">Learn<span style={{ color: 'var(--accent)' }}>Track</span></div>
          <div className="flex items-center gap-3">
            {timer.status !== 'idle' && (
              <span className="tick-text flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                <Timer size={14} /> {formatClock(elapsed)}
              </span>
            )}
            <button className="btn-ghost p-2.5" onClick={() => navigate('/settings')} aria-label="设置">
              <Settings2 size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-8 md:px-8 md:pb-14">
          <Suspense fallback={<div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>加载中…</div>}>
            <Outlet />
          </Suspense>
        </main>

        {/* Mobile bottom nav：控制层 · 常规玻璃 */}
        <nav
          aria-label="底部导航"
          className="glass-regular fixed inset-x-0 bottom-0 z-10 flex border-x-0 border-b-0 md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
