import type { NextRequest } from 'next/server';

import { buildAuditReport } from '@/db/security';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * GET /api/security/audit
 *
 * Sanitized, session-scoped audit trail for the Security & Telemetry
 * Inspector. Details are capped and never include evidence text.
 */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  return jsonNoStore(buildAuditReport(session));
}
