import { useEffect, useState } from 'react';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../../db/database';

const ACCENT_PRESETS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];

export function useTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT_SETTINGS.theme);
  const [accent, setAccentState] = useState<string>(DEFAULT_SETTINGS.accentColor);

  useEffect(() => {
    void getSetting('theme', DEFAULT_SETTINGS.theme).then(setThemeState);
    void getSetting('accentColor', DEFAULT_SETTINGS.accentColor).then(setAccentState);
  }, []);

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  const setTheme = (t: string) => {
    setThemeState(t);
    void setSetting('theme', t);
  };
  const setAccent = (c: string) => {
    setAccentState(c);
    void setSetting('accentColor', c);
  };

  return { theme, setTheme, accent, setAccent, ACCENT_PRESETS };
}
