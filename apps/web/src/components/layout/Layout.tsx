import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { startSyncLoop } from '../../services/sync';
import { ensureSeeded, ensureDeviceId } from '../../db/seed';
import { useThemeBootstrap, useTheme } from '../../features/settings/useTheme';
import { useI18n } from '../../i18n';
import { Suspense, useEffect, useState } from 'react';
import { useTimer, elapsedSeconds } from '../../stores/timer';
import { formatClock } from '../../utils';
import {
  LayoutDashboard, ScrollText, ChartSpline, Compass, Settings2, Timer, Languages, Keyboard,
  PanelLeftClose, PanelLeftOpen, Sun, Moon,
} from 'lucide-react';
import { ToastContainer } from '../common/Toast';
import { KeyboardShortcutsModal } from '../common/KeyboardShortcutsModal';
import { BrandLogoMark } from '../common/BrandLogoMark';
import { soundscape } from '../../services/soundscape';

const NAV_KEYS = [
  { to: '/', key: 'nav.overview', icon: LayoutDashboard },
  { to: '/entries', key: 'nav.entries', icon: ScrollText },
  { to: '/analytics', key: 'nav.analytics', icon: ChartSpline },
  { to: '/learning', key: 'nav.learning', icon: Compass },
] as const;

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
  const { t, locale, lang, setLang } = useI18n();
  useThemeBootstrap();
  const { isDarkEffective, toggleTheme } = useTheme();
  const [time, setTime] = useState('');
  useEffect(() => {
    let disposed = false;
    let stopSync = () => {};
    void initializeLocalData().then(() => {
      if (!disposed) stopSync = startSyncLoop();
    }).catch((error) => console.error('local data init failed', error));
    const clock = window.setInterval(() => {
      setTime(new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    }, 1000);
    return () => { disposed = true; stopSync(); window.clearInterval(clock); };
  }, [locale]);

  const timer = useTimer();
  useEffect(() => {
    const t = window.setInterval(() => useTimer.getState().tick(), 1000);
    return () => window.clearInterval(t);
  }, []);

  // 全局卡片鼠标聚光微光跟随（Spotlight Cursor Follow，使用 RAF 节流保证 120Hz 极致顺滑）
  useEffect(() => {
    let rafId: number | null = null;
    const onMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const target = e.target as HTMLElement;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const card = target?.closest?.('.card') as HTMLElement | null;
        if (card) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--mouse-x', `${clientX - rect.left}px`);
          card.style.setProperty('--mouse-y', `${clientY - rect.top}px`);
        }
      });
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('learntrack_sidebar_collapsed') === 'true' : false;
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('learntrack_sidebar_collapsed', String(next));
      soundscape.playTick();
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        soundscape.playTick();
        return;
      }

      if (e.key === '1') { e.preventDefault(); navigate('/'); soundscape.playTick(); }
      if (e.key === '2') { e.preventDefault(); navigate('/entries'); soundscape.playTick(); }
      if (e.key === '3') { e.preventDefault(); navigate('/analytics'); soundscape.playTick(); }
      if (e.key === '4') { e.preventDefault(); navigate('/learning'); soundscape.playTick(); }

      if (e.code === 'Space') {
        const timerState = useTimer.getState();
        if (timerState.status === 'running') {
          e.preventDefault();
          timerState.pause();
          soundscape.playTick();
        } else if (timerState.status === 'paused') {
          e.preventDefault();
          timerState.resume();
          soundscape.playTick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const elapsed = timer.status !== 'idle' ? elapsedSeconds(timer) : 0;

  return (
    <div className="relative flex min-h-full">
      {/* 颗粒纹理：内容层之下，正文不受噪点影响 */}
      <div aria-hidden className="bg-grain" />
      {/* 侧边栏折叠后的悬浮展开浮钮 */}
      {sidebarCollapsed && (
        <div className="fixed top-5 left-5 z-30 hidden md:flex items-center gap-1.5 rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-elevated)]/90 p-1.5 shadow-xl backdrop-blur-xl">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
            title="展开侧边栏 (Cmd+B)"
          >
            <PanelLeftOpen size={16} className="text-[var(--accent)]" />
            <span>展开导航</span>
          </button>
          <div className="h-4 w-[1px] bg-[var(--border-soft)]" />
          <button
            type="button"
            onClick={() => {
              soundscape.playPop();
              toggleTheme();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
            title={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
            aria-label={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
          >
            {isDarkEffective ? (
              <Sun size={15} strokeWidth={1.8} className="text-amber-400" />
            ) : (
              <Moon size={15} strokeWidth={1.8} className="text-indigo-500" />
            )}
          </button>
        </div>
      )}

      {/* Desktop rail：控制层 · 常规玻璃 */}
      <aside
        className={`glass-regular sticky top-0 z-20 hidden h-screen shrink-0 flex-col justify-between border-y-0 border-l-0 transition-all duration-300 ease-in-out md:flex ${
          sidebarCollapsed
            ? 'w-0 p-0 border-r-0 opacity-0 overflow-hidden pointer-events-none'
            : 'w-64 p-6 opacity-100'
        }`}
      >
        <div className="space-y-7">
          <div className="rise flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogoMark size={40} />
              <div>
                <div className="flex items-baseline gap-0.5 leading-none">
                  <span className="display text-xl font-bold tracking-tight">Learn</span>
                  <span className="display text-xl font-extrabold text-gradient-accent">Track</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                  <span className="mono text-[9px] tracking-widest text-[var(--text-tertiary)]">TIME · LEDGER</span>
                </div>
              </div>
            </div>

            {/* 收起侧边栏按钮 */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-xl p-1.5 text-[var(--text-tertiary)] hover:bg-black/5 hover:text-[var(--ink)] dark:hover:bg-white/10 transition-colors shrink-0"
              title="收起侧边栏 (Cmd+B)"
              aria-label="收起侧边栏"
            >
              <PanelLeftClose size={17} strokeWidth={1.8} />
            </button>
          </div>

          <nav className="flex flex-col gap-1.5" aria-label={t('a11y.mainNav')}>
            {NAV_KEYS.map((n, i) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-all duration-200 ${
                    isActive
                      ? 'text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--ink)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`
                }
                style={({ isActive }) => (isActive
                  ? {
                      background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--surface-elevated)), color-mix(in srgb, var(--accent) 5%, transparent))',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 2px 12px -2px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent)',
                    }
                  : undefined)}
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${
                        isActive
                          ? 'bg-[var(--accent)] text-white shadow-md'
                          : 'bg-black/[0.04] text-[var(--text-secondary)] group-hover:bg-black/[0.07] dark:bg-white/[0.06] dark:group-hover:bg-white/[0.1]'
                      }`}
                      style={isActive ? { boxShadow: '0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent)' } : undefined}
                    >
                      <n.icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                    </div>
                    <span className="text-sm">{t(n.key)}</span>
                    <span
                      className={`nav-badge-pill ml-auto ${
                        isActive
                          ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold'
                          : 'bg-black/[0.04] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] dark:bg-white/[0.06]'
                      }`}
                    >
                      0{i + 1}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-soft)] bg-white/40 px-3 py-2 backdrop-blur-sm dark:bg-white/[0.04]">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
              <span className="mono text-[10px] text-[var(--text-tertiary)]">SYS · CLOCK</span>
            </div>
            <span className="tick-text text-xs font-semibold text-[var(--ink)]" suppressHydrationWarning>{t('common.time', { time })}</span>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="btn-ghost w-full justify-start px-3 py-2 text-xs font-semibold"
              onClick={() => navigate('/settings')}
            >
              <Settings2 size={16} strokeWidth={1.8} className="text-[var(--accent)] shrink-0" />
              <span>{t('nav.settings')}</span>
            </button>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className="btn-ghost w-full justify-center px-1.5 py-2 text-xs"
                onClick={() => {
                  soundscape.playPop();
                  toggleTheme();
                }}
                aria-label={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
                title={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
              >
                {isDarkEffective ? (
                  <Sun size={15} strokeWidth={1.8} className="shrink-0 text-amber-400" />
                ) : (
                  <Moon size={15} strokeWidth={1.8} className="shrink-0 text-indigo-500" />
                )}
              </button>

              <button
                type="button"
                className="btn-ghost w-full justify-center px-1.5 py-2 text-xs font-bold"
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                aria-label={lang === 'zh' ? '切换为 English' : '切换为简体中文'}
                title={lang === 'zh' ? 'Switch to English' : '切换为简体中文'}
              >
                <Languages size={14} strokeWidth={1.8} className="shrink-0 mr-1" />
                <span className="text-[11px]">{lang === 'zh' ? '中' : 'EN'}</span>
              </button>

              <button
                type="button"
                className="btn-ghost w-full justify-center px-1.5 py-2 text-xs"
                onClick={() => {
                  setShortcutsOpen(true);
                  soundscape.playTick();
                }}
                aria-label="键盘快捷键 (?)"
                title="快捷键帮助 (?)"
              >
                <Keyboard size={15} strokeWidth={1.8} className="shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar：控制层 · 常规玻璃 */}
        <header className="glass-regular sticky top-0 z-10 flex items-center justify-between border-x-0 border-t-0 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <BrandLogoMark size={28} />
            <div className="display text-base font-bold tracking-tight">
              Learn<span className="text-gradient-accent font-extrabold">Track</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {timer.status !== 'idle' && (
              <span className="tick-text flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                <Timer size={13} className="animate-spin" style={{ animationDuration: '4s' }} /> {formatClock(elapsed)}
              </span>
            )}
            <button
              className="btn-ghost p-2"
              onClick={() => {
                soundscape.playPop();
                toggleTheme();
              }}
              aria-label={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
              title={isDarkEffective ? '切换为浅色模式' : '切换为深色模式'}
            >
              {isDarkEffective ? (
                <Sun size={15} strokeWidth={1.8} className="text-amber-400" />
              ) : (
                <Moon size={15} strokeWidth={1.8} className="text-indigo-500" />
              )}
            </button>
            <button
              className="btn-ghost px-2 py-1.5"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              aria-label={lang === 'zh' ? '切换为 English' : '切换为简体中文'}
              title={lang === 'zh' ? 'Switch to English' : '切换为简体中文'}
            >
              <div className="flex items-center text-xs font-semibold gap-0.5 select-none">
                <span style={{ color: lang === 'zh' ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: lang === 'zh' ? 700 : 500 }}>中</span>
                <span className="opacity-30">/</span>
                <span style={{ color: lang === 'en' ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: lang === 'en' ? 700 : 500 }}>EN</span>
              </div>
            </button>
            <button className="btn-ghost p-2" onClick={() => navigate('/settings')} aria-label={t('nav.settings')}>
              <Settings2 size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-8 md:px-8 md:pb-14">
          <Suspense fallback={<div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>}>
            <div className="page-enter">
              <Outlet />
            </div>
          </Suspense>
        </main>

        {/* Mobile bottom nav：控制层 · 常规玻璃 */}
        <nav
          aria-label={t('a11y.bottomNav')}
          className="glass-regular fixed inset-x-0 bottom-0 z-10 flex border-x-0 border-b-0 backdrop-blur-xl md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV_KEYS.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-all ${
                  isActive ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)] opacity-70 hover:opacity-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-xl transition-all ${
                      isActive ? 'bg-[var(--accent)] text-white shadow-xs' : ''
                    }`}
                  >
                    <n.icon size={17} strokeWidth={isActive ? 2.2 : 1.7} />
                  </div>
                  <span>{t(n.key)}</span>
                  {isActive && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--accent)] shadow-[0_0_4px_var(--accent)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <ToastContainer />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
