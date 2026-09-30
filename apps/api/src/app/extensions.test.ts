import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunRequest, ContributionRequest } from '@learntrack/contracts';
import { getContributions, runAgent } from './extensions.js';
const envKeys = ['LT_AI_API_KEY', 'LT_AI_BASE_URL', 'LT_AI_MODEL', 'LT_GITHUB_TOKEN'] as const;
const original = new Map(envKeys.map((key) => [key, process.env[key]]));
afterEach(() => { vi.unstubAllGlobals(); for (const key of envKeys) { const val = original.get(key); if (val === undefined) delete process.env[key]; else process.env[key] = val; } });
const context = { from: '2026-09-24', to: '2026-09-30', studyMinutes: 180, attempted: 5, correct: 3, pendingTasks: 2, weakTopics: ['积分'] };
describe('agent extension', () => {
  it('returns a useful disabled state without exposing credentials', async () => { delete process.env.LT_AI_API_KEY; await expect(runAgent({ task: 'review', prompt: '复盘', context })).rejects.toThrow('尚未配置'); });
  it('calls the configured provider with an aggregate context and validates structured proposals', async () => {
    process.env.LT_AI_API_KEY = 'test-secret'; process.env.LT_AI_BASE_URL = 'https://model.example/v1'; process.env.LT_AI_MODEL = 'test-model';
    const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: '先复习积分', tasks: [] }) } }] })); vi.stubGlobal('fetch', fetch);
    const value = await runAgent({ task: 'review', prompt: '复盘', context });
    expect(value.summary).toBe('先复习积分'); expect(JSON.stringify(value)).not.toContain('test-secret');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://model.example/v1/chat/completions');
  });
  it('rejects malformed task output and unsafe provider protocols', async () => {
    process.env.LT_AI_API_KEY = 'test'; process.env.LT_AI_BASE_URL = 'https://model.example/v1'; process.env.LT_AI_MODEL = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: '{"summary":"plan","tasks":[{"title":"bad"}]}' } }] })));
    await expect(runAgent({ task: 'plan', prompt: '安排', context })).rejects.toThrow();
    process.env.LT_AI_BASE_URL = 'http://remote.example/v1'; await expect(runAgent({ task: 'plan', prompt: '安排', context })).rejects.toThrow('HTTPS');
  });
  it('rejects unknown tasks and overlong payloads at the shared contract', () => { expect(AgentRunRequest.safeParse({ task: 'execute', prompt: 'x', context }).success).toBe(false); expect(AgentRunRequest.safeParse({ task: 'review', prompt: 'x'.repeat(4001), context }).success).toBe(false); });
});
describe('contribution adapters', () => {
  it('rejects usernames that could change a provider URL', () => { expect(ContributionRequest.safeParse({ provider: 'github', username: '../other', year: 2026 }).success).toBe(false); });
  it('requires server credentials for GitHub', async () => { delete process.env.LT_GITHUB_TOKEN; await expect(getContributions({ provider: 'github', username: 'missing-token-user', year: 2026 })).rejects.toThrow('LT_GITHUB_TOKEN'); });
  it('normalizes GitHub days and removes adjacent-year cells', async () => {
    process.env.LT_GITHUB_TOKEN = 'test'; vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: '2028-02-29', contributionCount: 4 }, { date: '2027-12-31', contributionCount: 2 }] }] } } } } })));
    const data = await getContributions({ provider: 'github', username: 'test-leap-user', year: 2028 }); expect(data.days).toEqual([{ date: '2028-02-29', count: 4 }]);
  });
  it('normalizes real LeetCode timestamp calendars and errors for unavailable accounts', async () => {
    const stamp = Date.parse('2026-09-30T00:00:00Z') / 1000;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { matchedUser: { userCalendar: { submissionCalendar: JSON.stringify({ [stamp]: 3 }) } } } })));
    expect((await getContributions({ provider: 'leetcode', username: 'calendar-test-user', year: 2026 })).days).toEqual([{ date: '2026-09-30', count: 3 }]);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { matchedUser: null } })));
    await expect(getContributions({ provider: 'leetcode', username: 'not-found-user', year: 2026 })).rejects.toThrow('无法读取');
  });
  it('uses the distinct China endpoint and root-level userCalendar response', async () => {
    const stamp = Date.parse('2026-09-30T00:00:00Z') / 1000;
    const fetch = vi.fn(async () => Response.json({ data: { userCalendar: { submissionCalendar: JSON.stringify({ [stamp]: 2 }) } } }));
    vi.stubGlobal('fetch', fetch);
    expect((await getContributions({ provider: 'leetcode-cn', username: 'china-calendar-test', year: 2026 })).days).toEqual([{ date: '2026-09-30', count: 2 }]);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://leetcode.cn/graphql/noj-go/');
  });
});
