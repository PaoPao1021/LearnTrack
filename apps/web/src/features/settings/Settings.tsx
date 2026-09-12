import { FormEvent, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useTheme } from './useTheme';
import { addCategory, archiveCategory, renameCategory } from '../../services/commands';
import { exportFullBackup, restoreBackup, inspectBackup, exportCsv, downloadBlob, type RestoreSummary } from '../../services/backup';
import { login, logout, readSyncState, setServerUrl, syncNow, healthCheck, getServerUrl, checkSession } from '../../services/sync';
import type { Category } from '@learntrack/domain';
import { ConflictSection } from './ConflictSection';

function ThemeSection() {
  const { theme, setTheme, accent, setAccent, ACCENT_PRESETS } = useTheme();
  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">外观</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['light', 'dark', 'system'] as const).map((t) => (
          <button key={t} className={theme === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTheme(t)}>
            {{ light: '浅色', dark: '深色', system: '跟随系统' }[t]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">主题色</span>
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            className={`h-7 w-7 rounded-full ring-2 ring-offset-2 dark:ring-offset-slate-900 ${accent === c ? 'ring-slate-400' : 'ring-transparent'}`}
            style={{ background: c }}
            onClick={() => setAccent(c)}
            aria-label={`主题色 ${c}`}
          />
        ))}
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-10 cursor-pointer rounded" aria-label="自定义主题色" />
      </div>
      <p className="mt-2 text-xs text-slate-400">自定义背景图将在后续版本加入；背景导入会压缩到 2MB 内并保证正文可读。</p>
    </div>
  );
}

function CategorySection() {
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
        {c.archived && <span className="text-xs">（已归档）</span>}
      </span>
      <span className="flex gap-2">
        <button className="text-xs text-slate-400 hover:text-blue-500" onClick={() => {
          const name = prompt('新名称', c.name);
          if (name && name.trim()) void renameCategory(c.id, name.trim());
        }}>改名</button>
        {!c.archived && (
          <button className="text-xs text-slate-400 hover:text-amber-500" onClick={() => void archiveCategory(c.id)}>归档</button>
        )}
      </span>
    </li>
  );

  return (
    <div className="card p-4">
      <h2 className="display mb-2 text-xl">科目分类</h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        已有记录的分类只能归档、不能删除，历史统计不会丢失；改名不影响历史记录。
      </p>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={add}>
        <input className="input max-w-48" placeholder="新分类名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select className="input max-w-52" value={parentOf} onChange={(e) => setParentOf(e.target.value)}>
          <option value="">作为新的大科目</option>
          <optgroup label="大科目下（具体科目）">
            {majors.map((m) => <option key={m.id} value={`major:${m.id}`}>{m.name}</option>)}
          </optgroup>
          <optgroup label="具体科目下（活动）">
            {subjects.map((s) => <option key={s.id} value={`subject:${s.id}`}>{majorsMap.get(s.parentId ?? '')?.name} / {s.name}</option>)}
          </optgroup>
        </select>
        <button className="btn-primary" type="submit">添加</button>
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
      <h2 className="display mb-3 text-xl">同步与账号</h2>
      <div className="mb-3">
        <label className="label">同步服务器地址（本机或 ECS，可选）</label>
        <div className="flex gap-2">
          <input className="input" placeholder="https://your-domain.example" value={server} onChange={(e) => setServer(e.target.value)} />
          <button className="btn-ghost" onClick={async () => { await setServerUrl(server); setMessage('已保存服务器地址'); void refresh(); }}>保存</button>
        </div>
      </div>
      {state?.loggedIn ? (
        <div className="mb-3 flex gap-2">
          <button className="btn-ghost" onClick={async () => { const s = await syncNow(); setState(s); setMessage(s.lastError ? `同步出错：${s.lastError}` : '同步完成'); }}>立即同步</button>
          <button className="btn-danger" onClick={async () => { await logout(); void refresh(); }}>登出</button>
        </div>
      ) : (
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await login(username, password);
            setMessage('登录成功，开始同步');
          } catch (err) {
            setMessage(err instanceof Error ? err.message : String(err));
          }
          void refresh();
        }}>
          <input className="input max-w-40" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input max-w-40" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-primary" type="submit">登录</button>
        </form>
      )}
      <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <li>待同步操作：{state?.pendingCount ?? 0} 条（离线也可正常记账，联网后自动推送）</li>
        <li>最近推送：{state?.lastPushAt ? new Date(state.lastPushAt).toLocaleString('zh-CN') : '—'}</li>
        <li>最近拉取：{state?.lastPullAt ? new Date(state.lastPullAt).toLocaleString('zh-CN') : '—'}</li>
        {state?.lastError && <li className="text-red-500">最近错误：{state.lastError}</li>}
      </ul>
      {message && <p className="mt-2 text-sm">{message}</p>}
      <p className="mt-2 text-xs text-slate-400">
        没有服务器也能一直使用：数据保存在本机浏览器，可随时导出完整备份。
      </p>
    </div>
  );
}

function BackupSection() {
  const [summary, setSummary] = useState<{ text: string; info: RestoreSummary } | null>(null);
  const [message, setMessage] = useState('');

  const onPick = async (file: File, mode: 'inspect' | 'restore') => {
    const text = await file.text();
    try {
      if (mode === 'inspect') {
        const info = await inspectBackup(text);
        setSummary({ text, info });
        setMessage('校验通过，请确认摘要后点击恢复。');
      } else {
        await restoreBackup(text);
        setMessage('恢复完成，页面数据已刷新。');
        setSummary(null);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setSummary(null);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="display mb-3 text-xl">备份与导出</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={async () => {
          const { blob, manifest } = await exportFullBackup();
          downloadBlob(blob, `learntrack-backup-${manifest.generatedAt.slice(0, 10)}.json`);
        }}>导出完整备份</button>
        <button className="btn-ghost" onClick={async () => {
          downloadBlob(await exportCsv(), `learntrack-entries-${new Date().toISOString().slice(0, 10)}.csv`);
        }}>导出 CSV 时间明细</button>
        <label className="btn-ghost cursor-pointer">
          选择备份文件校验
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onPick(e.target.files[0], 'inspect')} />
        </label>
        <label className="btn-ghost cursor-pointer">
          从备份恢复
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onPick(e.target.files[0], 'restore')} />
        </label>
      </div>
      {summary && (
        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <p className="mb-1 font-medium">备份摘要（校验通过）</p>
          <p>记录 {summary.info.counts.entries ?? 0} 条 · 分类 {summary.info.counts.categories ?? 0} 个 · 路线 {summary.info.counts.paths ?? 0} 条</p>
          {summary.info.dateRange && <p>时间范围：{summary.info.dateRange[0]} ~ {summary.info.dateRange[1]}</p>}
          <button className="btn-danger mt-2" onClick={async () => {
            await restoreBackup(summary.text);
            setMessage('恢复完成。');
            setSummary(null);
          }}>确认恢复（覆盖当前数据）</button>
        </div>
      )}
      {message && <p className="text-sm">{message}</p>}
      <p className="mt-2 text-xs text-slate-400">
        完整备份包含未同步修改；CSV 仅用于分析，不作为恢复格式。服务器端每日备份与电脑自动拉取见部署文档。
      </p>
    </div>
  );
}

function ServerStatus() {
  const [health, setHealth] = useState<string>('');
  useEffect(() => {
    void (async () => {
      const loggedIn = await checkSession();
      const h = await healthCheck();
      setHealth(h.ok ? `服务正常（v${h.version ?? '?'}）${loggedIn ? '，已登录' : '，未登录'}` : '同步服务不可达（离线模式）');
    })();
  }, []);
  return <p className="text-xs text-slate-400">{health}</p>;
}

export default function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="display text-xl">设置</h1>
      <ConflictSection />
      <ThemeSection />
      <CategorySection />
      <SyncSection />
      <BackupSection />
      <ServerStatus />
    </div>
  );
}
