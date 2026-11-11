import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { Role } from '@/lib/triage-types';
import { getDb } from './client';

export const SESSION_COOKIE = 'relay_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const SESSION_SECRET =
  process.env.RELAY_SESSION_SECRET ??
  'relay-demo-2026-local-hmac-secret-do-not-use-in-production';

export interface SessionRecord {
  id: string;
  role: Role;
  xp: number;
  streak: number;
  created_at: string;
  updated_at: string;
}

export interface DecodedSessionToken {
  id: string;
  /**
   * The role is signed into the token *only* so a cold-started serverless
   * instance can resurrect a missing session row. When the row exists, the
   * database role is always authoritative.
   */
  role: Role | null;
}

export function isRole(value: unknown): value is Role {
  return value === 'manager' || value === 'junior';
}

export function parseRole(value: unknown): Role | null {
  return isRole(value) ? value : null;
}

function signature(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Create the value stored in the HttpOnly cookie.
 *
 * Modern tokens are `<uuid>.<role>.<hmac>`; legacy `<uuid>.<hmac>` tokens are
 * still accepted so an in-flight demo never breaks across a deploy.
 */
export function createSessionToken(
  sessionId: string,
  role?: Role,
): string {
  const payload = role ? `${sessionId}.${role}` : sessionId;
  return `${payload}.${signature(payload)}`;
}

export function decodeSessionToken(
  token: string | undefined | null,
): DecodedSessionToken | null {
  if (!token) return null;
  const parts = token.split('.');

  if (parts.length === 2) {
    const [id, provided] = parts;
    if (!id || !provided) return null;
    if (!safeEqual(provided, signature(id))) return null;
    return { id, role: null };
  }

  if (parts.length === 3) {
    const [id, role, provided] = parts;
    if (!id || !role || !provided) return null;
    if (!isRole(role)) return null;
    if (!safeEqual(provided, signature(`${id}.${role}`))) return null;
    return { id, role };
  }

  return null;
}

/** Verify the HMAC. A tampered cookie returns null, never a session. */
export function verifySessionToken(
  token: string | undefined | null,
): string | null {
  return decodeSessionToken(token)?.id ?? null;
}

export function getSessionById(sessionId: string): SessionRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, role, xp, streak, created_at, updated_at FROM sessions WHERE id = ?',
    )
    .get(sessionId) as SessionRecord | undefined;
  return row ?? null;
}

/**
 * Recreate a session row after a cold start or an ephemeral `/tmp` reset.
 * The role comes from the signed cookie, so an attacker cannot choose it.
 */
function restoreSession(sessionId: string, role: Role): SessionRecord | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, role, xp, streak, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`,
  ).run(sessionId, role, now, now);

  const restored = getSessionById(sessionId);
  if (restored) {
    appendAudit(
      restored.id,
      restored.role,
      'session.revive',
      null,
      'signed token restored an ephemeral session row',
    );
  }
  return restored;
}

export function getSessionFromToken(
  token: string | undefined | null,
): SessionRecord | null {
  const decoded = decodeSessionToken(token);
  if (!decoded) return null;

  const existing = getSessionById(decoded.id);
  if (existing) return existing;

  // The database was recreated (serverless cold start / in-memory fallback).
  // The signed role lets the same browser keep working instead of receiving
  // a 401 or a 404 in the middle of a judge's demo.
  if (decoded.role) return restoreSession(decoded.id, decoded.role);
  return null;
}

export function createSession(role: Role): SessionRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: randomUUID(),
    role,
    xp: 0,
    streak: 0,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO sessions (id, role, xp, streak, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.role,
    session.xp,
    session.streak,
    session.created_at,
    session.updated_at,
  );

  appendAudit(session.id, role, 'session.create', null, `initial role: ${role}`);
  return session;
}

export function updateSessionRole(
  sessionId: string,
  role: Role,
): SessionRecord | null {
  const current = getSessionById(sessionId);
  if (!current) return null;
  if (current.role === role) return current;

  const now = new Date().toISOString();
  getDb()
    .prepare('UPDATE sessions SET role = ?, updated_at = ? WHERE id = ?')
    .run(role, now, sessionId);

  appendAudit(
    sessionId,
    role,
    'session.role_switch',
    null,
    `${current.role} -> ${role}`,
  );

  return getSessionById(sessionId);
}

export function appendAudit(
  sessionId: string,
  role: string,
  action: string,
  doubtId: string | null,
  detail: string | null,
) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (session_id, role, action, doubt_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, role, action, doubtId, detail, new Date().toISOString());
}

export function countAuditEvents(sessionId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM audit_log WHERE session_id = ?')
    .get(sessionId) as { n: number | bigint } | undefined;
  return row ? Number(row.n) : 0;
}
