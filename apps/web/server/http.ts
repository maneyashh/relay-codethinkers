import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  createSessionToken,
  getSessionFromToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionRecord,
} from '@/db/session';
import type { Role } from '@/lib/triage-types';

export function requestSession(request: NextRequest): SessionRecord | null {
  return getSessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function jsonNoStore(
  data: unknown,
  init?: ResponseInit,
): NextResponse {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export function setSessionCookie(
  response: NextResponse,
  sessionId: string,
  role?: Role,
): NextResponse {
  response.cookies.set(SESSION_COOKIE, createSessionToken(sessionId, role), {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.RELAY_INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export function unauthorized(): NextResponse {
  return jsonNoStore(
    { error: 'unauthenticated', hint: 'Call POST /api/session first' },
    { status: 401 },
  );
}
