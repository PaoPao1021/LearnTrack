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
import { SyncPushRequest, LoginRequest } from '@learntrack/contracts';
import { makeBackup } from './backups.js';

export function buildServer(db: InstanceType<typeof DatabaseSync>) {
  const app = Fastify({ logger: { level: process.env.LT_LOG_LEVEL ?? 'info' } });
  void app.register(cookie);
  // Serve the built web app from the same origin (single-site deployment)
  void app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, '../../../web/dist'),
    prefix: '/',
    index: 'index.html',
  });

  // SPA history fallback: serve index.html for client-side routes
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return void reply.type('text/html').send(fs.readFileSync(
        path.resolve(import.meta.dirname, '../../../web/dist/index.html'),
      ));
    }
    return void reply.code(404).send({ error: 'Not Found' });
  });

  // ---- auth guard for everything except health/login
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    // only API endpoints require a session; static app shell is public
    if (!url.startsWith('/api/')) return;
    if (url.startsWith('/api/v1/health') || url.startsWith('/api/v1/auth/login')) return;
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
    const { deviceId, ops } = parsed.data;
    const appliedOpIds: string[] = [];
    const conflicts: { opId: string; entity: string; entityId: string; serverVersion: number; serverPayload: unknown }[] = [];

    const insertOp = db.prepare(
      `INSERT OR IGNORE INTO sync_ops (op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const getVersion = db.prepare('SELECT version, deleted FROM entity_versions WHERE entity = ? AND entity_id = ?');
    const upsertVersion = db.prepare(
      `INSERT INTO entity_versions (entity, entity_id, version, deleted) VALUES (?, ?, ?, ?)
       ON CONFLICT(entity, entity_id) DO UPDATE SET version = excluded.version, deleted = excluded.deleted`,
    );

    db.exec('BEGIN');
    try {
      for (const op of ops) {
        const payloadStr = op.payload == null ? null : JSON.stringify(op.payload);
        const deleted = payloadStr == null || ((op.payload as { deletedAt?: string | null } | null)?.deletedAt != null);
        const existingOp = db.prepare('SELECT seq FROM sync_ops WHERE op_id = ?').get(op.opId);
        if (existingOp) {
          // idempotent replay: same op already applied once
          appliedOpIds.push(op.opId);
          continue;
        }
        const ver = getVersion.get(op.entity, op.entityId) as { version: number; deleted: number } | undefined;
        const serverVersion = ver?.version ?? 0;
        // baseVersion 缺失视为未读过服务端版本，同样进入冲突，不允许静默覆盖
        if (serverVersion > 0 && (op.baseVersion == null || op.baseVersion < serverVersion)) {
          const serverRow = db.prepare(
            'SELECT payload FROM sync_ops WHERE entity = ? AND entity_id = ? ORDER BY seq DESC LIMIT 1',
          ).get(op.entity, op.entityId) as { payload: string | null } | undefined;
          conflicts.push({
            opId: op.opId, entity: op.entity, entityId: op.entityId,
            serverVersion,
            serverPayload: serverRow?.payload ? JSON.parse(serverRow.payload) : null,
          });
          continue;
        }
        insertOp.run(
          op.opId, deviceId, op.entity, op.entityId, op.baseVersion,
          payloadStr, op.opGroupId, op.clientTimestamp, new Date().toISOString(),
        );
        const nextVersion = Math.max(serverVersion, op.baseVersion ?? 0) + 1;
        upsertVersion.run(op.entity, op.entityId, nextVersion, deleted ? 1 : 0);
        appliedOpIds.push(op.opId);
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
    const rows = db.prepare(
      'SELECT seq, op_id, device_id, entity, entity_id, base_version, payload, op_group_id, client_timestamp, server_timestamp FROM sync_ops WHERE seq > ? ORDER BY seq LIMIT 2000',
    ).all(cursor) as Record<string, unknown>[];
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
    const fs = await import('node:fs');
    const path = await import('node:path');
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
