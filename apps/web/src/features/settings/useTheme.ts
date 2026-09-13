import { useEffect, useState } from 'react';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../../db/database';

const ACCENT_PRESETS = ['#007aff', '#5856d6', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f'];

/** 设置页修改主题后广播，Layout 级的 useThemeBootstrap 收到后重新应用 DOM */
export const THEME_CHANGE_EVENT = 'learntrack:theme-changed';

/** 把主题落到 DOM：dark 类、color-scheme、状态栏 theme-color、强调色 */
export function applyThemeToDocument(theme: string, accent?: string) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#0b0e14' : '#f5f7fb';
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

/**
 * Layout 级主题同步：启动时应用持久化主题；监听设置页修改与系统深浅色切换。
 * 必须挂在常驻组件上，不能只在设置页生效。
 */
export function useThemeBootstrap() {
  useEffect(() => {
    const apply = async () => {
      const [theme, accent] = await Promise.all([
        getSetting('theme', DEFAULT_SETTINGS.theme),
        getSetting('accentColor', DEFAULT_SETTINGS.accentColor),
      ]);
      applyThemeToDocument(theme, accent);
    };
    void apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => { void apply(); };
    const onCustomChange = () => { void apply(); };
    mq.addEventListener('change', onSystemChange);
    window.addEventListener(THEME_CHANGE_EVENT, onCustomChange);
    return () => {
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener(THEME_CHANGE_EVENT, onCustomChange);
    };
  }, []);
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT_SETTINGS.theme);
  const [accent, setAccentState] = useState<string>(DEFAULT_SETTINGS.accentColor);

  useEffect(() => {
    void getSetting('theme', DEFAULT_SETTINGS.theme).then(setThemeState);
    void getSetting('accentColor', DEFAULT_SETTINGS.accentColor).then(setAccentState);
  }, []);

  const setTheme = (t: string) => {
    setThemeState(t);
    void setSetting('theme', t).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };
  const setAccent = (c: string) => {
    setAccentState(c);
    void setSetting('accentColor', c).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  return { theme, setTheme, accent, setAccent, ACCENT_PRESETS };
}
