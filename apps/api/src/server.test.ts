import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learntrack-api-test-'));
process.env.LT_PASSWORD = 'test-password';
process.env.LT_PASSWORD_SALT = 'test-password-salt';
process.env.LT_SESSION_SECRET = 'test-session-secret-at-least-32-chars';
process.env.LT_DATA_DIR = path.join(runtimeDir, 'data');
process.env.LT_BACKUP_DIR = path.join(runtimeDir, 'backups');
process.env.LT_LOG_LEVEL = 'silent';

const { config, openDb } = await import('./db/config.js');
const { buildServer } = await import('./app/server.js');
const database = openDb(config);
const app = buildServer(database);

async function loginCookie(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: config.username, password: 'test-password' },
  });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return header!.split(';', 1)[0]!;
}

describe('LearnTrack API', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    database.close();
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  it('protects authenticated endpoints and accepts a valid session cookie', async () => {
    const rejected = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    expect(rejected.statusCode).toBe(401);

    const cookie = await loginCookie();
    const accepted = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ ok: true });
  });

  it('applies a sync operation once and reports stale writes as conflicts', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const firstOpId = crypto.randomUUID();
    const first = {
      deviceId: 'device-1',
      lastCursor: 0,
      ops: [{
        opId: firstOpId,
        deviceId: 'device-1',
        entity: 'entry',
        entityId,
        baseVersion: null,
        payload: { id: entityId, version: 1 },
        opGroupId: null,
        clientTimestamp: new Date().toISOString(),
      }],
    };

    const applied = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { cookie }, payload: first });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().appliedOpIds).toEqual([firstOpId]);

    const replay = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { cookie }, payload: first });
    expect(replay.json().appliedOpIds).toEqual([firstOpId]);
    expect((database.prepare('SELECT COUNT(*) AS count FROM sync_ops').get() as { count: number }).count).toBe(1);

    const staleOpId = crypto.randomUUID();
    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { cookie },
      payload: {
        ...first,
        ops: [{ ...first.ops[0], opId: staleOpId, payload: { id: entityId, version: 2 } }],
      },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.json().appliedOpIds).toEqual([]);
    expect(stale.json().conflicts).toEqual([
      expect.objectContaining({ opId: staleOpId, entityId, serverVersion: 1 }),
    ]);

    const futureOpId = crypto.randomUUID();
    const future = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { cookie },
      payload: {
        ...first,
        ops: [{ ...first.ops[0], opId: futureOpId, baseVersion: 42, payload: { id: entityId, version: 43 } }],
      },
    });
    expect(future.statusCode).toBe(200);
    expect(future.json().appliedOpIds).toEqual([]);
    expect(future.json().conflicts).toEqual([
      expect.objectContaining({ opId: futureOpId, entityId, serverVersion: 1 }),
    ]);
    expect((database.prepare('SELECT COUNT(*) AS count FROM sync_ops').get() as { count: number }).count).toBe(1);
  });

  it('rejects operations whose envelope and payload identities disagree', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { cookie },
      payload: {
        deviceId: 'device-1',
        lastCursor: 0,
        ops: [{
          opId: crypto.randomUUID(),
          deviceId: 'device-1',
          entity: 'entry',
          entityId,
          baseVersion: null,
          payload: { id: crypto.randomUUID(), version: 1 },
          opGroupId: null,
          clientTimestamp: new Date().toISOString(),
        }],
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
