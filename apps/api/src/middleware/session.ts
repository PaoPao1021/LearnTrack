import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../db/config.js';
import { DatabaseSync } from 'node:sqlite';

const COOKIE = 'lt_session';

function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function createSession(db: InstanceType<typeof DatabaseSync>, config: Config, reply: FastifyReply): void {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token, config.sessionSecret), new Date().toISOString(), expiresAt);
  void reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.LT_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: config.sessionTtlHours * 3600,
  });
}

export function destroySession(db: InstanceType<typeof DatabaseSync>, config: Config, request: FastifyRequest, reply: FastifyReply): void {
  const token = request.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token, config.sessionSecret));
  void reply.clearCookie(COOKIE, { path: '/' });
}

export function sessionValid(db: InstanceType<typeof DatabaseSync>, config: Config, request: FastifyRequest): boolean {
  const token = request.cookies[COOKIE];
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
    .get(hashToken(token, config.sessionSecret)) as { expires_at: string } | undefined;
  return !!row && row.expires_at > new Date().toISOString();
}

/** Login rate limit: max 5 failures per IP per 15 minutes. */
export function checkRateLimit(db: InstanceType<typeof DatabaseSync>, ip: string): boolean {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = db.prepare('SELECT count, window_started_at FROM login_attempts WHERE ip = ?').get(ip) as
    | { count: number; window_started_at: string } | undefined;
  if (!row || row.window_started_at < windowStart) return true;
  return row.count < 5;
}

export function recordFailedLogin(db: InstanceType<typeof DatabaseSync>, ip: string): void {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = db.prepare('SELECT count, window_started_at FROM login_attempts WHERE ip = ?').get(ip) as
    | { count: number; window_started_at: string } | undefined;
  if (!row || row.window_started_at < windowStart) {
    db.prepare(`INSERT INTO login_attempts (ip, count, window_started_at) VALUES (?, 1, ?)
      ON CONFLICT(ip) DO UPDATE SET count = 1, window_started_at = excluded.window_started_at`).run(ip, new Date().toISOString());
  } else {
    db.prepare('UPDATE login_attempts SET count = count + 1 WHERE ip = ?').run(ip);
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
