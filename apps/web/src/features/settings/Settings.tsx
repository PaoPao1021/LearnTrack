import { FormEvent, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useTheme } from './useTheme';
import { Segmented } from '../../components/common/Segmented';
import { useI18n, translateError } from '../../i18n';
import { addCategory, archiveCategory, renameCategory } from '../../services/commands';
import { exportFullBackup, restoreBackup, inspectBackup, exportCsv, downloadBlob, type RestoreSummary } from '../../services/backup';
import { login, logout, readSyncState, setServerUrl, syncNow, healthCheck, getServerUrl, checkSession } from '../../services/sync';
import type { Category } from '@learntrack/domain';
import { ConflictSection } from './ConflictSection';

function ThemeSection() {
  const { t } = useI18n();
  const { theme, setTheme, accent, setAccent, ACCENT_PRESETS } = useTheme();
  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('theme.cardTitle')}</h2>
      <div className="mb-3">
        <Segmented
          ariaLabel={t('theme.cardTitle')}
          value={theme as 'light' | 'dark' | 'system'}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('theme.light') },
            { value: 'dark', label: t('theme.dark') },
            { value: 'system', label: t('theme.system') },
          ] as const}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('theme.accentLabel')}</span>
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            className={`h-7 w-7 rounded-full ring-2 ring-offset-2 dark:ring-offset-slate-900 ${accent === c ? 'ring-slate-400' : 'ring-transparent'}`}
            style={{ background: c }}
            onClick={() => setAccent(c)}
            aria-label={t('theme.accentAria', { color: c })}
          />
        ))}
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-10 cursor-pointer rounded" aria-label={t('theme.customAria')} />
      </div>
      <p className="mt-2 text-xs text-slate-400">{t('theme.customHint')}</p>
    </div>
  );
}

function LanguageSection() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('lang.cardTitle')}</h2>
      <Segmented
        ariaLabel={t('lang.switchAria')}
        value={lang}
        onChange={setLang}
        options={[
          { value: 'zh', label: t('lang.zh') },
          { value: 'en', label: t('lang.en') },
        ] as const}
      />
    </div>
  );
}

function CategorySection() {
  const { t } = useI18n();
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const [newName, setNewName] = useState('');
  const [parentOf, setParentOf] = useState('');
  const majors = (categories ?? []).filter((c) => c.level === 'major' && !c.deletedAt);
  const subjects = (categories ?? []).filter((c) => c.level === 'subject' && !c.deletedAt);
  const activities = (categories ?? []).filter((c) => c.level === 'activity' && !c.deletedAt);
  const majorsMap = new Map(majors.map((m) => [m.id, m]));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (parentOf === '') {
      await addCategory('major', null, newName.trim(), '#64748b');
    } else if (parentOf.startsWith('major:')) {
      await addCategory('subject', parentOf.slice(6), newName.trim(), '#64748b');
    } else {
      await addCategory('activity', parentOf.slice(8), newName.trim(), '#64748b');
    }
    setNewName('');
  };

  const renderRow = (c: Category, parentName?: string) => (
    <li key={c.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${c.archived ? 'text-slate-400' : ''}`}>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
        {parentName ? `${parentName} / ` : ''}{c.name}
        {c.archived && <span className="text-xs">{t('cat.archived')}</span>}
      </span>
      <span className="flex gap-2">
        <button className="btn-ghost min-h-9 px-3 py-1 text-xs" onClick={() => {
          const name = prompt(t('cat.renamePrompt'), c.name);
          if (name && name.trim()) void renameCategory(c.id, name.trim());
        }}>{t('cat.rename')}</button>
        {!c.archived && (
          <button className="btn-ghost min-h-9 px-3 py-1 text-xs" onClick={() => void archiveCategory(c.id)}>{t('cat.archive')}</button>
        )}
      </span>
    </li>
  );

  return (
    <div className="card p-4">
      <h2 className="display mb-2 text-xl">{t('cat.cardTitle')}</h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('cat.hint')}</p>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={add}>
        <label className="sr-only" htmlFor="category-name">{t('cat.nameLabel')}</label>
        <input id="category-name" className="input max-w-48" placeholder={t('cat.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <label className="sr-only" htmlFor="category-parent">{t('cat.parentLabel')}</label>
        <select id="category-parent" className="input max-w-52" value={parentOf} onChange={(e) => setParentOf(e.target.value)}>
          <option value="">{t('cat.asMajor')}</option>
          <optgroup label={t('cat.underMajor')}>
            {majors.map((m) => <option key={m.id} value={`major:${m.id}`}>{m.name}</option>)}
          </optgroup>
          <optgroup label={t('cat.underSubject')}>
            {subjects.map((s) => <option key={s.id} value={`subject:${s.id}`}>{majorsMap.get(s.parentId ?? '')?.name} / {s.name}</option>)}
          </optgroup>
        </select>
        <button className="btn-primary" type="submit">{t('common.add')}</button>
      </form>
      <ul className="space-y-0.5">
        {majors.map((m) => (
          <li key={m.id}>
            {renderRow(m)}
            <ul className="ml-4">
              {subjects.filter((s) => s.parentId === m.id).map((s) => (
                <li key={s.id}>
                  {renderRow(s)}
                  <ul className="ml-4">{activities.filter((a) => a.parentId === s.id).map((a) => renderRow(a))}</ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SyncSection() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<Awaited<ReturnType<typeof readSyncState>> | null>(null);
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setState(await readSyncState());
    setServer(await getServerUrl());
  };
  useEffect(() => { void refresh(); }, []);

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('sync.cardTitle')}</h2>
      <div className="mb-3">
        <label className="label" htmlFor="sync-server">{t('sync.serverLabel')}</label>
        <div className="flex gap-2">
          <input id="sync-server" className="input" placeholder={t('sync.serverPlaceholder')} value={server} onChange={(e) => setServer(e.target.value)} />
          <button className="btn-ghost" onClick={async () => { await setServerUrl(server); setMessage(t('sync.saved')); void refresh(); }}>{t('common.save')}</button>
        </div>
      </div>
      {state?.loggedIn ? (
        <div className="mb-3 flex gap-2">
          <button className="btn-ghost" onClick={async () => { const s = await syncNow(); setState(s); setMessage(s.lastError ? t('sync.failed', { error: translateError(s.lastError, t) }) : t('sync.done')); }}>{t('sync.now')}</button>
          <button className="btn-danger" onClick={async () => { await logout(); void refresh(); }}>{t('sync.logout')}</button>
        </div>
      ) : (
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await login(username, password);
            setMessage(t('sync.loginOk'));
          } catch (err) {
            setMessage(translateError(err, t));
          }
          void refresh();
        }}>
          <label className="sr-only" htmlFor="sync-username">{t('sync.username')}</label>
          <input id="sync-username" className="input max-w-40" placeholder={t('sync.username')} value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className="sr-only" htmlFor="sync-password">{t('sync.password')}</label>
          <input id="sync-password" className="input max-w-40" type="password" placeholder={t('sync.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-primary" type="submit">{t('sync.login')}</button>
        </form>
      )}
      <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <li>{t('sync.pending', { count: state?.pendingCount ?? 0 })}</li>
        <li>{t('sync.lastPush', { time: state?.lastPushAt ? new Date(state.lastPushAt).toLocaleString(locale) : '—' })}</li>
        <li>{t('sync.lastPull', { time: state?.lastPullAt ? new Date(state.lastPullAt).toLocaleString(locale) : '—' })}</li>
        {state?.lastError && <li className="text-red-500">{t('sync.lastError', { error: translateError(state.lastError, t) })}</li>}
      </ul>
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
      <p className="mt-2 text-xs text-slate-400">{t('sync.offlineHint')}</p>
    </div>
  );
}

function BackupSection() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<{ text: string; info: RestoreSummary } | null>(null);
  const [message, setMessage] = useState('');

  const onPick = async (file: File) => {
    const text = await file.text();
    try {
      const info = await inspectBackup(text);
      setSummary({ text, info });
      setMessage(t('backup.validated'));
    } catch (err) {
      setMessage(translateError(err, t));
      setSummary(null);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">{t('backup.cardTitle')}</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={async () => {
          const { blob, manifest } = await exportFullBackup();
          downloadBlob(blob, `learntrack-backup-${manifest.generatedAt.slice(0, 10)}.json`);
        }}>{t('backup.exportFull')}</button>
        <button className="btn-ghost" onClick={async () => {
          downloadBlob(await exportCsv(), `learntrack-entries-${new Date().toISOString().slice(0, 10)}.csv`);
        }}>{t('backup.exportCsv')}</button>
        <label className="btn-ghost cursor-pointer">
          {t('backup.pickValidate')}
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onPick(e.target.files[0])} />
        </label>
        <label className="btn-ghost cursor-pointer">
          {t('backup.restore')}
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onPick(e.target.files[0])} />
        </label>
      </div>
      {summary && (
        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <p className="mb-1 font-medium">{t('backup.summaryTitle')}</p>
          <p>{t('backup.summaryLines', { entries: summary.info.counts.entries ?? 0, categories: summary.info.counts.categories ?? 0, paths: summary.info.counts.paths ?? 0 })}</p>
          {summary.info.dateRange && <p>{t('backup.dateRange', { from: summary.info.dateRange[0], to: summary.info.dateRange[1] })}</p>}
          <button className="btn-danger mt-2" onClick={async () => {
            await restoreBackup(summary.text);
            setMessage(t('backup.restored'));
            setSummary(null);
          }}>{t('backup.confirmRestore')}</button>
        </div>
      )}
      {message && <p role="status" className="text-sm">{message}</p>}
      <p className="mt-2 text-xs text-slate-400">{t('backup.hint')}</p>
    </div>
  );
}

function ServerStatus() {
  const { t } = useI18n();
  const [health, setHealth] = useState<string>('');
  useEffect(() => {
    void (async () => {
      const loggedIn = await checkSession();
      const h = await healthCheck();
      setHealth(h.ok ? t('health.ok', { version: h.version ?? '?', login: loggedIn ? t('health.loggedIn') : t('health.loggedOut') }) : t('health.down'));
    })();
  }, [t]);
  return <p role="status" className="text-xs text-slate-400">{health}</p>;
}

export default function Settings() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="display text-xl">{t('settings.title')}</h1>
      <ConflictSection />
      <ThemeSection />
      <LanguageSection />
      <CategorySection />
      <SyncSection />
      <BackupSection />
      <ServerStatus />
    </div>
  );
}
