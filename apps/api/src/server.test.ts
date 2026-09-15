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

function entryPayload(id: string, version = 1, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    deviceId: 'entry-device',
    activityId: crypto.randomUUID(),
    method: 'duration',
    learningDate: '2026-09-15',
    startedAt: null,
    endedAt: null,
    timeZone: 'Asia/Shanghai',
    durationSeconds: 60,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version,
    ...overrides,
  };
}

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
        payload: entryPayload(entityId),
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

    const alteredReplay = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
      payload: { ...first, ops: [{ ...first.ops[0], deviceId: 'forged-device' }] },
    });
    expect(alteredReplay.statusCode).toBe(400);

    const staleOpId = crypto.randomUUID();
    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { cookie },
      payload: {
        ...first,
        ops: [{ ...first.ops[0], opId: staleOpId, payload: entryPayload(entityId, 2) }],
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
        ops: [{ ...first.ops[0], opId: futureOpId, baseVersion: 42, payload: entryPayload(entityId, 43) }],
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
          payload: entryPayload(crypto.randomUUID()),
          opGroupId: null,
          clientTimestamp: new Date().toISOString(),
        }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects incomplete entity payloads before they enter the sync log', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
      payload: {
        deviceId: 'device-1', lastCursor: 0,
        ops: [{
          opId: crypto.randomUUID(), deviceId: 'device-1', entity: 'entry', entityId,
          baseVersion: null, payload: { id: entityId, version: 1 }, opGroupId: null,
          clientTimestamp: new Date().toISOString(),
        }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('accepts an exact retry after normalizing a client supplied entity version', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const operation = {
      opId: crypto.randomUUID(), deviceId: 'device-1', entity: 'entry', entityId,
      baseVersion: null, payload: entryPayload(entityId, 99), opGroupId: null,
      clientTimestamp: new Date().toISOString(),
    };
    const request = { deviceId: 'device-1', lastCursor: 0, ops: [operation] };
    const first = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { cookie }, payload: request });
    const replay = await app.inject({ method: 'POST', url: '/api/v1/sync/push', headers: { cookie }, payload: request });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appliedOpIds).toEqual([operation.opId]);
  });

  it('rejects duplicate operation IDs in one request before changing versions', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const opId = crypto.randomUUID();
    const operation = {
      opId, deviceId: 'device-1', entity: 'entry', entityId, baseVersion: null,
      payload: entryPayload(entityId), opGroupId: null, clientTimestamp: new Date().toISOString(),
    };
    const before = (database.prepare('SELECT COUNT(*) AS count FROM sync_ops').get() as { count: number }).count;
    const response = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
      payload: { deviceId: 'device-1', lastCursor: 0, ops: [operation, operation] },
    });
    expect(response.statusCode).toBe(400);
    expect((database.prepare('SELECT COUNT(*) AS count FROM sync_ops').get() as { count: number }).count).toBe(before);
  });

  it('keeps a restored operation\'s original device provenance', async () => {
    const cookie = await loginCookie();
    const entityId = crypto.randomUUID();
    const opId = crypto.randomUUID();
    const pushed = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
      payload: {
        deviceId: 'restored-on-new-device', lastCursor: 0,
        ops: [{
          opId, deviceId: 'original-device', entity: 'entry', entityId, baseVersion: null,
          payload: entryPayload(entityId, 1, { deviceId: 'original-device' }), opGroupId: null,
          clientTimestamp: new Date().toISOString(),
        }],
      },
    });
    expect(pushed.json().appliedOpIds).toEqual([opId]);
    expect((database.prepare('SELECT device_id FROM sync_ops WHERE op_id = ?').get(opId) as { device_id: string }).device_id)
      .toBe('original-device');
  });

  it('rolls back an entire conflicting op group and reports every pending member', async () => {
    const cookie = await loginCookie();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const makeCreate = (entityId: string) => ({
      opId: crypto.randomUUID(), deviceId: 'device-1', entity: 'entry', entityId,
      baseVersion: null, payload: entryPayload(entityId), opGroupId: null,
      clientTimestamp: new Date().toISOString(),
    });
    for (const entityId of [firstId, secondId]) {
      const created = await app.inject({
        method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
        payload: { deviceId: 'device-1', lastCursor: 0, ops: [makeCreate(entityId)] },
      });
      expect(created.statusCode).toBe(200);
    }
    const groupId = crypto.randomUUID();
    const firstOpId = crypto.randomUUID();
    const secondOpId = crypto.randomUUID();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: { cookie },
      payload: {
        deviceId: 'device-1', lastCursor: 0,
        ops: [
          { opId: firstOpId, deviceId: 'device-1', entity: 'entry', entityId: firstId, baseVersion: 1, payload: entryPayload(firstId, 2), opGroupId: groupId, clientTimestamp: new Date().toISOString() },
          { opId: secondOpId, deviceId: 'device-1', entity: 'entry', entityId: secondId, baseVersion: null, payload: entryPayload(secondId, 2), opGroupId: groupId, clientTimestamp: new Date().toISOString() },
        ],
      },
    });
    expect(response.json().appliedOpIds).toEqual([]);
    expect(response.json().conflicts).toEqual([
      expect.objectContaining({ opId: firstOpId, entityId: firstId, serverVersion: 1 }),
      expect.objectContaining({ opId: secondOpId, entityId: secondId, serverVersion: 1 }),
    ]);
    expect((database.prepare('SELECT version FROM entity_versions WHERE entity = ? AND entity_id = ?').get('entry', firstId) as { version: number }).version)
      .toBe(1);
  });

  it('does not split a group at the pull page boundary', async () => {
    const cookie = await loginCookie();
    const start = (database.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_ops').get() as { seq: number }).seq;
    const insert = database.prepare(
      `INSERT INTO sync_ops (op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp)
       VALUES (?, ?, 'settings', ?, NULL, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    for (let index = 0; index < 1999; index += 1) {
      insert.run(crypto.randomUUID(), 'seed', `page-${start}-${index}`, JSON.stringify({ key: `page-${start}-${index}`, value: index }), null, now, now);
    }
    const groupId = crypto.randomUUID();
    for (let index = 0; index < 2; index += 1) {
      insert.run(crypto.randomUUID(), 'seed', `group-${start}-${index}`, JSON.stringify({ key: `group-${start}-${index}`, value: index }), groupId, now, now);
    }
    const pulled = await app.inject({ method: 'GET', url: `/api/v1/sync/pull?cursor=${start}`, headers: { cookie } });
    expect(pulled.statusCode).toBe(200);
    expect(pulled.json().ops).toHaveLength(2001);
    expect(pulled.json().ops.slice(-2).map((op: { opGroupId: string }) => op.opGroupId)).toEqual([groupId, groupId]);
  });

  it('does not let forged forwarded IPs bypass login rate limiting by default', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        headers: { 'x-forwarded-for': `198.51.100.${index}` },
        payload: { username: config.username, password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.99' },
      payload: { username: config.username, password: 'wrong-password' },
    });
    expect(limited.statusCode).toBe(429);
  });
});
