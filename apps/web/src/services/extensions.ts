import { AgentProposal, AgentRunRequest, AgentTask, ContributionData } from '@learntrack/contracts';
import { z } from 'zod';
import { getServerUrl } from './sync';

export async function extensionApi(path: string, init?: RequestInit) {
  const base = await getServerUrl();
  if (!base) throw new Error('请先在设置中配置同步服务器并登录，再使用在线功能');
  const response = await fetch(`${base === '/' ? '' : base}/api/v1${path}`, { credentials: 'include', ...init, signal: AbortSignal.timeout(path === '/agent/run' ? 90_000 : 45_000) });
  if (response.status === 401) throw new Error('服务器登录已过期，请到设置中重新登录');
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string().max(500) }).safeParse(data);
    throw new Error(parsed.success ? parsed.data.error : '服务暂时不可用，请稍后再试');
  }
  return data;
}

export async function requestAgent(value: z.infer<typeof AgentRunRequest>) {
  const input = AgentRunRequest.parse(value);
  return AgentProposal.extend({ runId: z.string().uuid(), task: AgentTask, model: z.string() }).parse(await extensionApi('/agent/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
}

export async function loadAgentCapabilities() {
  return z.object({ version: z.number(), configured: z.boolean(), provider: z.string().optional(), model: z.string().optional(), tasks: z.array(z.string()) }).parse(await extensionApi('/agent/capabilities'));
}

export async function loadContributions(provider: 'github' | 'leetcode-cn' | 'leetcode', username: string, year: number) {
  const data = ContributionData.parse(await extensionApi(`/integrations/contributions?${new URLSearchParams({ provider, username, year: String(year) })}`));
  if (data.provider !== provider || data.username !== username || data.year !== year) throw new Error('活动日历与当前账号不匹配，请重新加载');
  return data;
}
