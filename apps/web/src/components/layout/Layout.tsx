import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { LayoutDashboard, ScrollText, ChartSpline, Compass, Settings2, Timer, CalendarDays, BookOpenCheck, Sun, Moon, Keyboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ensureSeeded, ensureDeviceId } from '../../db/seed';
import { useThemeBootstrap, useTheme } from '../../features/settings/useTheme';
import { useI18n } from '../../i18n';
import { useTimer, elapsedSeconds } from '../../stores/timer';
import { formatClock } from '../../utils';
import { ToastContainer } from '../common/Toast';
import { KeyboardShortcutsModal } from '../common/KeyboardShortcutsModal';
import { BrandLogoMark } from '../common/BrandLogoMark';
import { useCardLight } from '../common/useSurfaceMotion';

const NAV = [
  { to: '/', key: 'nav.overview', icon: LayoutDashboard },
  { to: '/plans', key: 'nav.plans', icon: CalendarDays },
  { to: '/practice', key: 'nav.practice', icon: BookOpenCheck },
  { to: '/analytics', key: 'nav.analytics', icon: ChartSpline },
  { to: '/learning', key: 'nav.learning', icon: Compass },
] as const;
let initialization: Promise<void> | null = null;
function initialize() {
  return initialization ??= (async () => { await ensureSeeded(); await ensureDeviceId(); })().catch((error) => { initialization = null; throw error; });
}

export default function Layout() {
  const navigate = useNavigate(), { t, lang, setLang } = useI18n();
  useThemeBootstrap();
  useCardLight();
  const { isDarkEffective, toggleTheme } = useTheme();
  const [shortcuts, setShortcuts] = useState(false), [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('learntrack_sidebar_collapsed') === 'true'; } catch { return false; } });
  const [initError, setInitError] = useState(false);
  const timer = useTimer();
  const toggleSidebar = () => setCollapsed((previous) => { const next = !previous; try { localStorage.setItem('learntrack_sidebar_collapsed', String(next)); } catch { /* optional preference */ } return next; });
  useEffect(() => { let active = true; void initialize().catch(() => { if (active) setInitError(true); }); const id = window.setInterval(() => useTimer.getState().tick(), 1000); return () => { active = false; window.clearInterval(id); }; }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.matches('input, textarea, select') || el?.isContentEditable || el?.closest('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); return; }
      if (event.key === '?') { event.preventDefault(); setShortcuts((v) => !v); return; }
      if (!event.ctrlKey && !event.metaKey && /^[1-5]$/.test(event.key)) { event.preventDefault(); navigate(NAV[Number(event.key) - 1]!.to); }
      if (event.code === 'Space' && !el?.matches('button, a')) { const state = useTimer.getState(); if (state.status !== 'idle') { event.preventDefault(); state.status === 'running' ? state.pause() : state.resume(); } }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  const themeLabel = isDarkEffective ? '切换浅色' : '切换深色';
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳转到内容</a>
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="flex items-center justify-between mb-8"><Link to="/" className="brand-name"><BrandLogoMark size={28}/>LearnTrack</Link><button className="btn-ghost icon-control" aria-label="收起导航" onClick={toggleSidebar}><PanelLeftClose size={17}/></button></div>
      <nav aria-label={t('a11y.mainNav')} className="space-y-1">{NAV.map((item) => <NavLink key={item.to} end={item.to === '/'} to={item.to} className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}><item.icon size={18}/><span>{t(item.key)}</span></NavLink>)}<NavLink to="/entries" className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}><ScrollText size={18}/>{t('nav.entries')}</NavLink></nav>
      <div className="mt-auto pt-6 border-t border-[var(--border-soft)] space-y-3"><NavLink to="/settings" className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}><Settings2 size={18}/>{t('nav.settings')}</NavLink><div className="flex gap-2"><button className="btn-ghost icon-control" aria-label={themeLabel} onClick={toggleTheme}>{isDarkEffective ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="btn-ghost" aria-label={lang === 'zh' ? 'Switch to English' : '切换中文'} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? '中 / EN' : 'EN / 中'}</button><button className="btn-ghost icon-control" aria-label="快捷键" onClick={() => setShortcuts(true)}><Keyboard size={17}/></button></div><p className="text-xs muted">数据保存在当前浏览器</p></div>
    </aside>
    {collapsed && <button className="desktop-expand btn-ghost icon-control" onClick={toggleSidebar} aria-label="展开导航"><PanelLeftOpen size={18}/></button>}
    <div className="min-w-0 flex-1"><header className="app-mobile-header"><Link to="/" className="brand-name"><BrandLogoMark size={28}/>LearnTrack</Link><div className="flex items-center gap-1"><Link className="btn-ghost icon-control" to="/entries" aria-label="学习记录"><ScrollText size={17}/></Link><button className="btn-ghost icon-control" onClick={toggleTheme} aria-label={themeLabel}>{isDarkEffective ? <Sun size={17}/> : <Moon size={17}/>}</button><Link className="btn-ghost icon-control" to="/settings" aria-label={t('nav.settings')}><Settings2 size={17}/></Link></div></header>
      {timer.status !== 'idle' && <Link to="/" className="active-timer-strip"><Timer size={15}/> {timer.status === 'running' ? '计时中' : '已暂停'} · {formatClock(elapsedSeconds(timer))}<span className="ml-auto">返回计时</span></Link>}
      <main id="main-content" tabIndex={-1} className="workspace-main">
        {initError && <p role="alert" className="form-error mb-4">本地数据库初始化失败，请关闭其他 LearnTrack 标签页后刷新；请先保留浏览器数据。</p>}
        <Suspense fallback={<p role="status" className="muted py-6">{t('common.loading')}</p>}><Outlet/></Suspense>
      </main>
    </div>
    <nav className="app-bottom-nav" aria-label={t('a11y.bottomNav')}>{NAV.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={19}/><span>{t(item.key)}</span></NavLink>)}</nav>
    <ToastContainer/><KeyboardShortcutsModal open={shortcuts} onClose={() => setShortcuts(false)}/>
  </div>;
}
