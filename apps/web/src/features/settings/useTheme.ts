import { useEffect, useState } from 'react';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../../db/database';

export const ACCENT_PRESETS = ['#007aff', '#5856d6', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f'];

/** 设置页修改主题后广播，Layout 级的 useThemeBootstrap 收到后重新应用 DOM */
export const THEME_CHANGE_EVENT = 'learntrack:theme-changed';

/** 判断当前时间是否落在指定的时间段 [start, end) 内（支持跨夜时段，如 19:00 至 07:00） */
export function isTimeInSchedule(start: string, end: string, now = new Date()): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh = 19, sm = 0] = start.split(':').map(Number);
  const [eh = 7, em = 0] = end.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/** 把主题落到 DOM：dark 类、color-scheme、状态栏 theme-color、强调色 */
export function applyThemeToDocument(
  theme: string,
  accent?: string,
  scheduleEnabled = false,
  scheduleStart = '19:00',
  scheduleEnd = '07:00',
) {
  let effectiveDark: boolean;
  if (scheduleEnabled) {
    effectiveDark = isTimeInSchedule(scheduleStart, scheduleEnd);
  } else if (theme === 'dark') {
    effectiveDark = true;
  } else if (theme === 'system') {
    effectiveDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    effectiveDark = false;
  }

  document.documentElement.classList.toggle('dark', effectiveDark);
  document.documentElement.style.colorScheme = effectiveDark ? 'dark' : 'light';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = effectiveDark ? '#0b0e14' : '#f5f7fb';
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

/**
 * Layout 级主题同步：启动时应用持久化主题；监听设置页修改与系统深浅色切换及定时自动切换。
 */
export function useThemeBootstrap() {
  useEffect(() => {
    const apply = async () => {
      const [theme, accent, scheduleEnabled, scheduleStart, scheduleEnd] = await Promise.all([
        getSetting('theme', DEFAULT_SETTINGS.theme),
        getSetting('accentColor', DEFAULT_SETTINGS.accentColor),
        getSetting('themeScheduleEnabled', false),
        getSetting('themeScheduleStart', '19:00'),
        getSetting('themeScheduleEnd', '07:00'),
      ]);
      applyThemeToDocument(theme, accent, scheduleEnabled, scheduleStart, scheduleEnd);
    };
    void apply();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => { void apply(); };
    const onCustomChange = () => { void apply(); };
    mq.addEventListener('change', onSystemChange);
    window.addEventListener(THEME_CHANGE_EVENT, onCustomChange);

    // 每 30 秒轮询一次，确保到了定时点自动平滑切入深色/浅色模式
    const interval = window.setInterval(() => {
      void apply();
    }, 30000);

    return () => {
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener(THEME_CHANGE_EVENT, onCustomChange);
      window.clearInterval(interval);
    };
  }, []);
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT_SETTINGS.theme);
  const [accent, setAccentState] = useState<string>(DEFAULT_SETTINGS.accentColor);
  const [scheduleEnabled, setScheduleEnabledState] = useState<boolean>(false);
  const [scheduleStart, setScheduleStartState] = useState<string>('19:00');
  const [scheduleEnd, setScheduleEndState] = useState<string>('07:00');

  useEffect(() => {
    void getSetting('theme', DEFAULT_SETTINGS.theme).then(setThemeState);
    void getSetting('accentColor', DEFAULT_SETTINGS.accentColor).then(setAccentState);
    void getSetting('themeScheduleEnabled', false).then(setScheduleEnabledState);
    void getSetting('themeScheduleStart', '19:00').then(setScheduleStartState);
    void getSetting('themeScheduleEnd', '07:00').then(setScheduleEndState);
  }, []);

  const setTheme = (t: string) => {
    setThemeState(t);
    applyThemeToDocument(t, accent, scheduleEnabled, scheduleStart, scheduleEnd);
    void setSetting('theme', t).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const setAccent = (c: string) => {
    setAccentState(c);
    applyThemeToDocument(theme, c, scheduleEnabled, scheduleStart, scheduleEnd);
    void setSetting('accentColor', c).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const setScheduleEnabled = (enabled: boolean) => {
    setScheduleEnabledState(enabled);
    applyThemeToDocument(theme, accent, enabled, scheduleStart, scheduleEnd);
    void setSetting('themeScheduleEnabled', enabled).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const setScheduleStart = (time: string) => {
    setScheduleStartState(time);
    applyThemeToDocument(theme, accent, scheduleEnabled, time, scheduleEnd);
    void setSetting('themeScheduleStart', time).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const setScheduleEnd = (time: string) => {
    setScheduleEndState(time);
    applyThemeToDocument(theme, accent, scheduleEnabled, scheduleStart, time);
    void setSetting('themeScheduleEnd', time).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const isDarkEffective = scheduleEnabled
    ? isTimeInSchedule(scheduleStart, scheduleEnd)
    : theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleTheme = () => {
    const nextTheme = isDarkEffective ? 'light' : 'dark';
    if (scheduleEnabled) {
      setScheduleEnabledState(false);
      void setSetting('themeScheduleEnabled', false);
    }
    setThemeState(nextTheme);
    applyThemeToDocument(nextTheme, accent, false, scheduleStart, scheduleEnd);
    void setSetting('theme', nextTheme).then(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  return {
    theme,
    setTheme,
    accent,
    setAccent,
    ACCENT_PRESETS,
    scheduleEnabled,
    setScheduleEnabled,
    scheduleStart,
    setScheduleStart,
    scheduleEnd,
    setScheduleEnd,
    isDarkEffective,
    toggleTheme,
  };
}
