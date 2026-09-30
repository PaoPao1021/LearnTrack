import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';
import { LECTURES, type CourseProgress } from '@learntrack/domain';
import { db } from '../../db/database';
import { saveLecture } from '../../services/study';

export function LectureList() {
  const rows = useLiveQuery(() => db.courseProgress.filter((r) => !r.deletedAt).toArray(), [], []);
  const [error, setError] = useState('');
  const completed = rows.filter((r) => r.done).length;
  return <section className="work-section"><div className="section-heading"><h2>张宇基础 30 讲 · 2027 数一</h2><span className="text-sm muted">{completed} / 30 讲</span></div>
    <p className="muted text-sm mt-2">这是讲次编号模板，标题可按手头教材填写。教材正文与原题不随应用分发；知识点分组也不等同于原书目录。</p>
    <div className="my-5"><progress className="w-full h-2" max={30} value={completed} aria-label="30讲完成进度"/><p className="muted text-xs mt-2">累计登记 {rows.reduce((sum, r) => sum + r.minutes, 0)} 分钟。用时独立于学习账本。</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="lecture-list">{LECTURES.map((lecture) => <LectureRow key={`${lecture.key}:${rows.find((r) => r.chapterKey === lecture.key)?.version ?? 0}`} lecture={lecture} value={rows.find((r) => r.chapterKey === lecture.key)} onError={setError}/>)}</div>
  </section>;
}
function LectureRow({ lecture, value, onError }: { lecture: { key: string; title: string }; value?: CourseProgress; onError: (text: string) => void }) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(value?.title ?? lecture.title), [minutes, setMinutes] = useState(value?.minutes ?? 0), [note, setNote] = useState(value?.note ?? ''), [busy, setBusy] = useState(false);
  const save = async (done = value?.done ?? false) => { setBusy(true); try { await saveLecture({ chapterKey: lecture.key, title: title.trim(), minutes, note, done }); setEditing(false); onError(''); } catch { onError('讲次保存失败，请核对标题和用时后重试'); } finally { setBusy(false); } };
  return <div className="lecture-row"><div className="task-row"><button disabled={busy} className={`task-check ${value?.done ? 'is-done' : ''}`} aria-label={`${value?.done ? '取消完成' : '完成'} ${title}`} aria-pressed={Boolean(value?.done)} onClick={() => void save(!value?.done)}>{value?.done && <Check size={16}/>}</button><div className="min-w-0 flex-1"><span>{title}</span>{value?.minutes ? <span className="muted text-xs ml-3">{value.minutes} 分钟</span> : null}</div><button className="btn-ghost" onClick={() => setEditing(!editing)} aria-expanded={editing}>编辑</button></div>
    {editing && <form className="space-y-3 pb-4" onSubmit={(e) => { e.preventDefault(); void save(); }}><div className="grid sm:grid-cols-[1fr_120px] gap-3"><label className="field">教材标题<input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}/></label><label className="field">累计分钟<input className="input" required type="number" min={0} max={100000} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}/></label></div><label className="field">学习备注<textarea className="input" maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)}/></label><button className="btn-primary" disabled={busy}>{busy ? '保存中…' : '保存讲次'}</button></form>}
  </div>;
}
