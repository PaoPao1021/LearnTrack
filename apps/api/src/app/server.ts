import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../db/config.js';
import {
  sessionValid, createSession, destroySession, checkRateLimit, recordFailedLogin, timingSafeEqual,
} from '../middleware/session.js';
import { SyncPushRequest, LoginRequest, validateEntityPayload } from '@learntrack/contracts';
import { makeBackup } from './backups.js';

/** Parse the only proxy configurations that keep the forwarding boundary explicit. */
export function trustProxyFromEnv(value = process.env.LT_TRUST_PROXY): false | string[] | ((address: string, hop: number) => boolean) {
  if (value == null || value.trim() === '') return false;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return Number.isSafeInteger(hops) && hops > 0 ? (_address, hop) => hop < hops : false;
  }
  if (value.trim().toLowerCase() === 'true') {
    throw new Error('LT_TRUST_PROXY 不能为 true；请设置代理跳数或地址列表');
  }
  const addresses = value.split(',').map((address) => address.trim()).filter(Boolean);
  return addresses.length === 0 ? false : addresses;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Match the version rewrite performed when an operation is first accepted. */
function payloadForReplayComparison(entity: string, baseVersion: number | null, payload: unknown): unknown {
  if (payload === null || entity === 'settings') return payload;
  return { ...(payload as Record<string, unknown>), version: (baseVersion ?? 0) + 1 };
}

export function buildServer(db: InstanceType<typeof DatabaseSync>) {
  const app = Fastify({
    logger: { level: process.env.LT_LOG_LEVEL ?? 'info' },
    trustProxy: trustProxyFromEnv(),
  });
  void app.register(cookie);
  // Serve the built web app from the same origin (single-site deployment)
  const webDistIndex = path.resolve(import.meta.dirname, '../../../web/dist/index.html');
  void app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, '../../../web/dist'),
    prefix: '/',
    index: 'index.html',
  });

  // SPA history fallback: serve index.html for client-side routes
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      if (fs.existsSync(webDistIndex)) {
        return void reply.type('text/html').send(fs.readFileSync(webDistIndex));
      }
    }
    return void reply.code(404).send({ error: 'Not Found' });
  });

  // ---- auth guard for everything except health/login
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?', 1)[0]!;
    // only API endpoints require a session; static app shell is public
    if (!url.startsWith('/api/')) return;
    if (url === '/api/v1/health' || url === '/api/v1/auth/login') return;
    if (!sessionValid(db, config, request)) {
      void reply.code(401).send({ error: '会话无效或已过期，请重新登录。离线设备可继续本地记账。' });
    }
  });

  // ---- health
  app.get('/api/v1/health', async () => {
    let dbOk = false;
    try {
      dbOk = db.prepare('SELECT 1 AS ok').get() != null;
    } catch {
      dbOk = false;
    }
    return { ok: dbOk, db: dbOk, version: config.version };
  });

  // ---- auth
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = LoginRequest.safeParse(request.body);
    if (!parsed.success) return void reply.code(400).send({ error: '请求格式不正确' });
    const ip = request.ip;
    if (!checkRateLimit(db, ip)) return void reply.code(429).send({ error: '尝试次数过多，请 15 分钟后再试。' });
    if (timingSafeEqual(parsed.data.username, config.username) && verifyPassword(parsed.data.password)) {
      createSession(db, config, reply);
      return { ok: true };
    }
    recordFailedLogin(db, ip);
    return void reply.code(401).send({ error: '用户名或密码不正确' });
  });

  function verifyPassword(password: string): boolean {
    const salt = process.env.LT_PASSWORD_SALT ?? 'learntrack-static-salt';
    const candidate = crypto.scryptSync(password, salt, 32).toString('hex');
    return timingSafeEqual(candidate, config.passwordHash);
  }

  app.post('/api/v1/auth/logout', async (request, reply) => {
    destroySession(db, config, request, reply);
    return { ok: true };
  });

  app.get('/api/v1/auth/session', async () => ({ ok: true }));

  // ---- sync push: idempotent by op_id; version conflicts returned for user resolution
  app.post('/api/v1/sync/push', async (request, reply) => {
    const parsed = SyncPushRequest.safeParse(request.body);
    if (!parsed.success) return void reply.code(400).send({ error: '同步请求格式不正确', detail: parsed.error.flatten() });
    const { ops } = parsed.data;
    const malformedOp = ops.find((op) => {
      return !validateEntityPayload(op.entity, op.entityId, op.payload);
    });
    if (malformedOp) {
      return void reply.code(400).send({ error: '同步操作的实体负载无效或实体标识不一致' });
    }
    const opIds = new Set<string>();
    if (ops.some((op) => opIds.has(op.opId) || !opIds.add(op.opId))) {
      return void reply.code(400).send({ error: '一次同步请求中不能包含重复的 opId' });
    }
    const closedGroupIds = new Set<string>();
    let activeGroupId: string | null = null;
    for (const op of ops) {
      if (op.opGroupId === null) {
        if (activeGroupId !== null) closedGroupIds.add(activeGroupId);
        activeGroupId = null;
      } else if (op.opGroupId !== activeGroupId) {
        if (activeGroupId !== null) closedGroupIds.add(activeGroupId);
        if (closedGroupIds.has(op.opGroupId)) {
          return void reply.code(400).send({ error: '同一 opGroupId 必须在请求中连续出现' });
        }
        activeGroupId = op.opGroupId;
      }
    }
    const appliedOpIds: string[] = [];
    const conflicts: { opId: string; entity: string; entityId: string; serverVersion: number; serverPayload: unknown }[] = [];

    const insertOp = db.prepare(
      `INSERT OR IGNORE INTO sync_ops (op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const getExistingOp = db.prepare(
      'SELECT seq, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp FROM sync_ops WHERE op_id = ?',
    );
    const hasPersistedGroup = db.prepare('SELECT 1 AS found FROM sync_ops WHERE op_group_id = ? LIMIT 1');
    const getVersion = db.prepare('SELECT version, deleted FROM entity_versions WHERE entity = ? AND entity_id = ?');
    const getPayload = db.prepare(
      'SELECT payload FROM sync_ops WHERE entity = ? AND entity_id = ? ORDER BY seq DESC LIMIT 1',
    );
    const upsertVersion = db.prepare(
      `INSERT INTO entity_versions (entity, entity_id, version, deleted) VALUES (?, ?, ?, ?)
       ON CONFLICT(entity, entity_id) DO UPDATE SET version = excluded.version, deleted = excluded.deleted`,
    );

    for (const op of ops) {
      const existing = getExistingOp.get(op.opId) as {
        device_id: string; entity: string; entity_id: string; base_version: number | null;
        payload: string | null; op_group_id: string | null; client_timestamp: string;
      } | undefined;
      if (existing) {
        const replayPayload = payloadForReplayComparison(op.entity, op.baseVersion, op.payload);
        const payloadMatches = existing.payload === null
          ? replayPayload === null
          : replayPayload !== null && canonicalJson(JSON.parse(existing.payload)) === canonicalJson(replayPayload);
        if (
          existing.device_id !== op.deviceId || existing.entity !== op.entity || existing.entity_id !== op.entityId
          || existing.base_version !== op.baseVersion || existing.op_group_id !== op.opGroupId
          || existing.client_timestamp !== op.clientTimestamp || !payloadMatches
        ) {
          return void reply.code(400).send({ error: '重放的 opId 与已存操作内容不一致' });
        }
        continue;
      }
      // An all-existing replay is safe. A new op cannot be appended to an old
      // group because it would make that group non-contiguous in the log.
      if (op.opGroupId !== null && hasPersistedGroup.get(op.opGroupId)) {
        return void reply.code(400).send({ error: 'opGroupId 已被使用，不能追加新的操作' });
      }
    }
    const groups: (typeof ops)[] = [];
    for (let index = 0; index < ops.length;) {
      const first = ops[index]!;
      if (first.opGroupId === null) {
        groups.push([first]);
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < ops.length && ops[end]!.opGroupId === first.opGroupId) end += 1;
      groups.push(ops.slice(index, end));
      index = end;
    }
    const conflictFor = (op: (typeof ops)[number]) => {
      const ver = getVersion.get(op.entity, op.entityId) as { version: number } | undefined;
      const serverRow = getPayload.get(op.entity, op.entityId) as { payload: string | null } | undefined;
      return {
        opId: op.opId,
        entity: op.entity,
        entityId: op.entityId,
        serverVersion: ver?.version ?? 0,
        serverPayload: serverRow?.payload ? JSON.parse(serverRow.payload) : null,
      };
    };

    db.exec('BEGIN');
    try {
      for (const [groupIndex, group] of groups.entries()) {
        const savepoint = `sync_group_${groupIndex}`;
        db.exec(`SAVEPOINT ${savepoint}`);
        const pending = group.filter((op) => !getExistingOp.get(op.opId));
        if (pending.length === 0) {
          appliedOpIds.push(...group.map((op) => op.opId));
          db.exec(`RELEASE ${savepoint}`);
          continue;
        }
        const stagedVersions = new Map<string, number>();
        let hasConflict = false;
        for (const op of pending) {
          const key = `${op.entity}\u0000${op.entityId}`;
          const serverVersion = stagedVersions.get(key)
            ?? ((getVersion.get(op.entity, op.entityId) as { version: number } | undefined)?.version ?? 0);
          if (op.baseVersion !== (serverVersion === 0 ? null : serverVersion)) hasConflict = true;
          stagedVersions.set(key, serverVersion + 1);
        }
        if (hasConflict) {
          db.exec(`ROLLBACK TO ${savepoint}`);
          db.exec(`RELEASE ${savepoint}`);
          conflicts.push(...pending.map(conflictFor));
          continue;
        }
        for (const op of pending) {
          const ver = getVersion.get(op.entity, op.entityId) as { version: number } | undefined;
          const nextVersion = (ver?.version ?? 0) + 1;
          const deleted = op.payload == null || ((op.payload as { deletedAt?: string | null })?.deletedAt != null);
          const authoritativePayload = op.payload != null && op.entity !== 'settings'
            ? { ...(op.payload as Record<string, unknown>), version: nextVersion }
            : op.payload;
          insertOp.run(
            op.opId, op.deviceId, op.entity, op.entityId, op.baseVersion,
            authoritativePayload == null ? null : JSON.stringify(authoritativePayload),
            op.opGroupId, op.clientTimestamp, new Date().toISOString(),
          );
          upsertVersion.run(op.entity, op.entityId, nextVersion, deleted ? 1 : 0);
          appliedOpIds.push(op.opId);
        }
        db.exec(`RELEASE ${savepoint}`);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const cursorRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS c FROM sync_ops').get() as { c: number };
    return reply.send({ appliedOpIds, conflicts, cursor: cursorRow.c });
  });

  // ---- sync pull: incremental ops and tombstones after cursor
  app.get('/api/v1/sync/pull', async (request, reply) => {
    const q = request.query as { cursor?: string };
    const requestedCursor = Number(q.cursor ?? 0);
    const cursor = Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : 0;
    let rows = db.prepare(
      'SELECT seq, op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp FROM sync_ops WHERE seq > ? ORDER BY seq LIMIT 2000',
    ).all(cursor) as Record<string, unknown>[];
    const last = rows[rows.length - 1];
    if (rows.length === 2000 && last?.op_group_id != null) {
      const tail = db.prepare(
        `SELECT seq, op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp
         FROM sync_ops WHERE seq > ? AND op_group_id = ? ORDER BY seq`,
      ).all(last['seq'] as number, last['op_group_id'] as string) as Record<string, unknown>[];
      rows = rows.concat(tail);
    }
    // 游标取本批最后一条的 seq：积压超过一页时客户端可继续拉取，不跳数据
    const batchCursor = rows.length ? Number(rows[rows.length - 1]!['seq']) : cursor;
    return reply.send({
      cursor: batchCursor,
      ops: rows.map((r) => ({
        opId: r.op_id,
        deviceId: r.device_id,
        entity: r.entity,
        entityId: r.entity_id,
        baseVersion: r.base_version,
        payload: r.payload == null ? null : JSON.parse(r.payload as string),
        opGroupId: r.op_group_id,
        clientTimestamp: r.client_timestamp,
        serverTimestamp: r.server_timestamp,
      })),
    });
  });

  // ---- backups: consistent snapshot -> zip with manifest/data
  app.get('/api/v1/backups', async (_request, reply) => {
    const { fileName, checksum, counts } = await makeBackup(db, config);
    return reply.send({ ok: true, fileName, checksum, counts, downloadUrl: `/api/v1/backups/${fileName}` });
  });

  app.get('/api/v1/backups/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!/^learntrack-backup-[\w.-]+\.zip$/.test(name)) return void reply.code(400).send({ error: '非法备份文件名' });
    const file = path.join(config.backupDir, name);
    if (!fs.existsSync(file)) return void reply.code(404).send({ error: '备份不存在' });
    return reply.type('application/zip').send(fs.createReadStream(file));
  });

  return app;
}

// ---- entry point
export async function main(): Promise<void> {
  const { openDb } = await import('../db/config.js');
  const database = openDb(config);
  const app = buildServer(database);
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`LearnTrack API listening on ${config.host}:${config.port}`);
}

// Run directly: `node dist/app/server.js`
const invoked = process.argv[1]?.endsWith('server.js');
if (invoked) {
  void main().catch((err) => {
    console.error('服务启动失败：', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
