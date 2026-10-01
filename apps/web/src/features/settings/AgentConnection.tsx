import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAgentCapabilities } from '../../services/extensions';
export function AgentConnection() {
  useEffect(() => { if (window.location.hash === '#agent-connection') document.getElementById('agent-connection')?.scrollIntoView(); }, []);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof loadAgentCapabilities>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <section className="work-section scroll-mt-6" id="agent-connection"><div className="section-heading"><h2>DeepSeek / 学习助手</h2><Link to="/assistant">打开学习助手</Link></div><p className="text-sm muted mt-2">起草计划、学习指导与复盘共用服务器上的 AI 接口。可以保存自己的总结或 AI 回答，并选择带入下次提问。</p>
    <div className="flex items-center flex-wrap gap-3 mt-4"><button className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); setError(''); setStatus(null); try { setStatus(await loadAgentCapabilities()); } catch (e) { setError(e instanceof Error ? e.message : '读取失败'); } finally { setBusy(false); } }}>{busy ? '读取中…' : '读取服务器 AI 配置'}</button>{status && <p className="text-sm" role="status">{status.configured ? `${status.provider ?? 'AI 服务'} 已配置 · ${status.model ?? '服务器模型'}` : '服务器尚未配置 AI 密钥'}{status.version < 2 && ' · 请更新服务器以使用学习指导与附带总结'}</p>}</div>
    {error && <p role="alert" className="form-error mt-3">{error}</p>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">DeepSeek 接入步骤</summary><ol className="list-decimal pl-5 mt-3 space-y-2 text-sm"><li>在 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">DeepSeek 控制台</a>创建 API Key。</li><li>将以下配置填入 ECS 项目的 .env.production，然后沿用原 Compose 命令重新创建应用容器。</li><li>在上方配置服务器地址并登录，读取 AI 配置后，到学习助手发送一次提问。</li></ol><pre className="agent-config mt-3">{'LT_AI_BASE_URL=https://api.deepseek.com\nLT_AI_MODEL=deepseek-flash\nLT_AI_API_KEY=你的密钥'}</pre><p className="text-xs muted mt-3">密钥只保留在服务器，不填写到前端代码或 VITE_* 环境变量。配置状态不代表已完成接口调用；实际请求仍取决于账户余额和服务可用性。可通过 LT_AI_MODEL 更换模型。</p></details>
  </section>;
}
