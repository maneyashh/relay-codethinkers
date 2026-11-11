import type { NextRequest } from 'next/server';

import { buildBoard } from '@/db/board';
import {
  createSession,
  getSessionFromToken,
  parseRole,
  SESSION_COOKIE,
  updateSessionRole,
} from '@/db/session';
import {
  jsonNoStore,
  setSessionCookie,
} from '@/server/http';


/**
 * POST /api/session
 *
 * Upserts a browser session and returns the role-filtered board in one round
 * trip. The returned board is always derived from the role stored in SQLite,
 * never from a client-supplied filter.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  const requestedRole = parseRole(body.role);
  if (body.role !== undefined && requestedRole === null) {
    return jsonNoStore({ error: 'invalid_role' }, { status: 400 });
  }

  let session = getSessionFromToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (session) {
    if (requestedRole && requestedRole !== session.role) {
      session = updateSessionRole(session.id, requestedRole);
    }
  } else {
    session = createSession(requestedRole ?? 'junior');
  }

  if (!session) {
    return jsonNoStore({ error: 'session_not_found' }, { status: 500 });
  }

  const response = jsonNoStore({ board: buildBoard(session) });
  return setSessionCookie(response, session.id, session.role);
}
