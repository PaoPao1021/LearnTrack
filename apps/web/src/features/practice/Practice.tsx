import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Square, Plus, Download, Upload } from 'lucide-react';
import { db } from '../../db/database';
import { practiceStats, STUDY_SOURCES, topicsFor, type StudySource, type PracticeAttempt } from '@learntrack/domain';
import { todayKey, formatClock } from '../../utils';
import { saveAttempt, deleteAttempt, importPracticeJson } from '../../services/study';
import { downloadBlob } from '../../services/backup';
import { LectureList } from './LectureList';
import { Contributions } from './Contributions';

const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const resultLabels = { correct: '正确', incorrect: '错误', skipped: '未作答' };

export default function Practice() {
  const [source, setSource] = useState<StudySource>('zhangyu-2027-math1-1000'), [tab, setTab] = useState<'records' | 'review' | 'courses' | 'activity'>('records');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const attempts = useLiveQuery(() => db.practiceAttempts.filter((r) => !r.deletedAt).toArray(), [], []);
  const sourceRows = attempts.filter((r) => r.source === source);
  const rows = sourceRows.filter((r) => (!from || r.learningDate >= from) && (!to || r.learningDate <= to));
  const stats = practiceStats(rows), reviews = practiceStats(sourceRows).review;
  const selected = STUDY_SOURCES.find((s) => s.id === source)!;
  const history = [...rows].filter((r) => !search.trim() || `${r.questionKey} ${r.note}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => b.learningDate.localeCompare(a.learningDate) || b.createdAt.localeCompare(a.createdAt));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(history.length / 20) - 1));
  const pageRows = history.slice(currentPage * 20, (currentPage + 1) * 20);
  const topicLabels = new Map<string, string>(topicsFor(source));
  for (const row of rows) if (!topicLabels.has(row.chapterKey)) topicLabels.set(row.chapterKey, row.chapterKey);
  const [repeat, setRepeat] = useState<PracticeAttempt | null>(null);
  useEffect(() => { setPage(0); }, [source, from, to, search]);
  return <div className="space-y-6">
    <header className="page-heading"><div><h1>练习与复习</h1><p>记录每道题的结果和用时，回看错题与章节表现。</p></div></header>
    <nav className="work-tabs" aria-label="练习页面"><button aria-current={tab === 'records' ? 'page' : undefined} onClick={() => setTab('records')}>练习记录</button><button aria-current={tab === 'review' ? 'page' : undefined} onClick={() => setTab('review')}>待复习 {reviews.length > 0 ? reviews.length : ''}</button><button aria-current={tab === 'courses' ? 'page' : undefined} onClick={() => setTab('courses')}>30 讲进度</button><button aria-current={tab === 'activity' ? 'page' : undefined} onClick={() => setTab('activity')}>编程活动</button></nav>
    {tab === 'courses' ? <LectureList/> : tab === 'activity' ? <Contributions/> : <>
      <div className="practice-filters"><label className="field">练习资料<select className="input" value={source} onChange={(e) => { setSource(e.target.value as StudySource); setRepeat(null); }}>{STUDY_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>{tab === 'records' && <><label className="field">开始日期<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)}/></label><label className="field">结束日期<input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)}/></label><button className="btn-ghost" onClick={() => { setFrom(''); setTo(''); }}>全部日期</button></>}</div>
      <p className="muted text-sm">{selected.description} 原书题号请包含册别／章节（如：高数·极限·A01），同题重做使用同一题号。</p>
      {tab === 'review' ? <section className="work-section"><h2>待复习题目</h2><p className="muted text-sm my-2">按每道题最近一次结果列出错误与未作答题，答对后自动移出。默认在三天后提醒。</p>
        {reviews.length === 0 && <p className="empty-copy">当前没有待复习题目。记录错误或未作答题后，会出现在这里。</p>}
        <ul className="task-list">{[...reviews].sort((a, b) => (a.reviewDate ?? '').localeCompare(b.reviewDate ?? '')).map((r) => <li className="task-row" key={r.id}><div className="flex-1 min-w-0"><strong>{r.questionKey}</strong><p className="muted text-sm mt-1">{topicsFor(source).find(([key]) => key === r.chapterKey)?.[1] ?? r.chapterKey} · {resultLabels[r.result]} · {r.reviewDate && r.reviewDate <= todayKey() ? '今天可复习' : `${r.reviewDate ?? '随时'} 复习`}</p>{r.note && <p className="text-sm mt-1 whitespace-pre-wrap">{r.note}</p>}</div><button className="btn-ghost" onClick={() => { setRepeat(r); setTab('records'); }}>再练一次</button></li>)}</ul>
      </section> : <>
        <dl className="study-metrics"><div><dt>作答正确率</dt><dd>{percent(stats.accuracy)}</dd><small>{stats.correct} / {stats.answered} 次作答</small></div><div><dt>首次正确率</dt><dd>{percent(stats.firstAccuracy)}</dd><small>当前筛选范围内的首次作答</small></div><div><dt>已练习题目</dt><dd>{stats.uniqueQuestions}</dd><small>{stats.attempts} 次记录，含重做</small></div><div><dt>练习用时</dt><dd>{Math.round(stats.totalSeconds / 60)}<span>分钟</span></dd><small>平均 {stats.averageSeconds === null ? '—' : formatClock(stats.averageSeconds)} / 次</small></div></dl>
        <AttemptForm key={`${source}:${repeat?.id ?? ''}`} source={source} repeat={repeat} onSaved={() => setRepeat(null)} />
        <section className="work-section"><div className="section-heading"><h2>知识点统计</h2><span className="muted text-xs">未作答不计入正确率，重做单独计次</span></div><div className="table-scroll"><table className="study-table"><thead><tr><th>知识点</th><th>作答</th><th>正确率</th><th>首次正确率</th><th>总用时</th><th>平均用时</th></tr></thead><tbody>{[...topicLabels].map(([key, title]) => { const s = practiceStats(rows.filter((r) => r.chapterKey === key)); return s.attempts ? <tr key={key}><td>{title}</td><td>{s.answered}</td><td>{percent(s.accuracy)}</td><td>{percent(s.firstAccuracy)}</td><td>{Math.round(s.totalSeconds / 60)} 分</td><td>{s.averageSeconds === null ? '—' : formatClock(s.averageSeconds)}</td></tr> : null; })}</tbody></table></div>{stats.attempts === 0 && <p className="empty-copy">有练习记录后，显示对应知识点的正确率和用时。</p>}</section>
        <section className="work-section"><div className="section-heading"><h2>记录明细</h2><div className="flex gap-2 flex-wrap"><button className="btn-ghost" onClick={() => downloadBlob(new Blob([JSON.stringify(sourceRows, null, 2)], { type: 'application/json' }), `learntrack-practice-${source}-${todayKey()}.json`)}><Download size={15}/>导出</button><button className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={15}/>导入</button></div></div>
          <input className="hidden" ref={fileRef} type="file" accept=".json,application/json" aria-label="导入练习 JSON" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 5 * 1024 * 1024) return setError('文件超过 5 MB，请拆分导入'); try { const count = await importPracticeJson(await file.text()); setError(`已导入 ${count} 条，已有记录自动跳过。`); } catch { setError('导入失败。请使用本应用导出的 JSON 格式，每次不超过 10,000 条。'); } }}/>
          <label className="field my-3">搜索记录<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="按题号或备注搜索"/></label>{error && <p role="status" className="text-sm muted">{error}</p>}
          <ul className="task-list">{pageRows.map((r) => <li className="task-row" key={r.id}><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><strong>{r.questionKey}</strong><span className={`result-text ${r.result}`}>{resultLabels[r.result]}</span></div><p className="muted text-xs mt-1">{r.learningDate} · {formatClock(r.durationSeconds)} · {topicsFor(source).find(([key]) => key === r.chapterKey)?.[1] ?? r.chapterKey}</p>{r.note && <p className="text-sm mt-1 whitespace-pre-wrap">{r.note}</p>}</div><button className="btn-ghost" aria-label={`重做 ${r.questionKey}`} onClick={() => setRepeat(r)}>重做</button><button className="btn-ghost" aria-label={`删除记录 ${r.questionKey}`} onClick={async () => { if (confirm(`删除 ${r.questionKey} 的这次练习记录？`)) { try { await deleteAttempt(r.id); } catch { setError('删除失败，请重试'); } } }}>删除</button></li>)}</ul>
          {history.length === 0 && <p className="empty-copy">没有符合条件的练习记录。</p>}{history.length > 20 && <div className="flex justify-between items-center mt-4"><button className="btn-ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span className="text-sm muted">{currentPage + 1} / {Math.ceil(history.length / 20)}</span><button className="btn-ghost" disabled={(currentPage + 1) * 20 >= history.length} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
        </section>
      </>}
    </>}
  </div>;
}

function AttemptForm({ source, repeat, onSaved }: { source: StudySource; repeat: PracticeAttempt | null; onSaved: () => void }) {
  const [question, setQuestion] = useState(repeat?.questionKey ?? ''), [chapter, setChapter] = useState(repeat?.chapterKey ?? 'unassigned'), [date, setDate] = useState(todayKey());
  const [result, setResult] = useState<PracticeAttempt['result']>('correct'), [seconds, setSeconds] = useState(0), [note, setNote] = useState(''), [running, setRunning] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const startedAt = useRef(0), accumulated = useRef(0);
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setSeconds(Math.min(86400, accumulated.current + Math.floor((Date.now() - startedAt.current) / 1000))), 250); return () => window.clearInterval(id); }, [running]);
  const stop = () => { const duration = Math.min(86400, accumulated.current + Math.floor((Date.now() - startedAt.current) / 1000)); accumulated.current = duration; setSeconds(duration); setRunning(false); return duration; };
  const submit = async (e: FormEvent) => { e.preventDefault(); if (busy) return; setError(''); setBusy(true); const duration = running ? stop() : seconds; try { await saveAttempt({ source, chapterKey: chapter.trim(), questionKey: question.trim(), result, durationSeconds: duration, learningDate: date, note }); setQuestion(''); setNote(''); setSeconds(0); accumulated.current = 0; onSaved(); } catch { setError('保存失败，请检查题号、日期和用时后重试'); } finally { setBusy(false); } };
  return <section className="work-section"><h2>{repeat ? `重做：${repeat.questionKey}` : '记一道题'}</h2><form onSubmit={submit} className="space-y-4 mt-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="field">原书题号 / 力扣题号<input className="input" required maxLength={120} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={source === 'leetcode' ? '如：1 两数之和' : '如：高数·极限·A01'}/></label><label className="field">知识点<select className="input" value={topicsFor(source).some(([key]) => key === chapter) ? chapter : "__custom"} onChange={(e) => setChapter(e.target.value === "__custom" ? "" : e.target.value)}>{topicsFor(source).map(([key, label]) => <option value={key} key={key}>{label}</option>)}<option value="__custom">自定义知识点…</option></select></label><label className="field">练习日期<input className="input" required type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label></div>
    {!topicsFor(source).some(([key]) => key === chapter) && <label className="field">自定义知识点<input className="input" required maxLength={100} value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="填写知识点名称"/></label>}
    <div className="flex flex-wrap items-end gap-3"><fieldset className="flex-1 min-w-52"><legend className="field-label mb-2">结果</legend><div className="work-tabs !m-0">{(['correct', 'incorrect', 'skipped'] as const).map((r) => <button key={r} type="button" aria-pressed={result === r} className={result === r ? 'selected' : ''} onClick={() => setResult(r)}>{resultLabels[r]}</button>)}</div></fieldset><label className="field w-32">用时（秒）<input className="input" type="number" required min={0} max={86400} disabled={running} value={seconds} onChange={(e) => { const val = Number(e.target.value); setSeconds(val); accumulated.current = val; }}/></label><button className="btn-ghost" type="button" aria-pressed={running} onClick={() => { if (running) stop(); else { startedAt.current = Date.now(); setRunning(true); } }}>{running ? <Square size={14}/> : <Play size={14}/>} {running ? `停止 ${formatClock(seconds)}` : '计时'}</button></div>
    <label className="field">备注 / 错因<input className="input" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：漏掉端点条件，三天后重做"/></label>
    <div className="flex flex-wrap gap-3 justify-between items-center"><p className="text-xs muted">练习用时单独统计，不叠加到学习时间账本。</p><button className="btn-primary" disabled={!question.trim() || busy}><Plus size={15}/>{busy ? '保存中…' : '保存练习'}</button></div>{error && <p role="alert" className="form-error">{error}</p>}
  </form></section>;
}
