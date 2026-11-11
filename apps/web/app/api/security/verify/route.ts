import type { NextRequest } from 'next/server';

import { buildSecurityReport } from '@/db/security';
import { parseRole } from '@/db/session';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';


/**
 * GET /api/security/verify
 *
 * Runs both SQL projections and returns assertion results and counts only — no
 * evidence text, paths, commits or secret values are included. A `?role=` value
 * is deliberately read and ignored to prove that the session cookie wins.
 */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const spoofedRole = parseRole(
    new URL(request.url).searchParams.get('role'),
  );

  return jsonNoStore(buildSecurityReport(session, spoofedRole));
}
