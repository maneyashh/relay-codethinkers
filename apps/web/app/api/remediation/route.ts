import type { NextRequest } from 'next/server';

import { getDb } from '@/db/client';
import { buildRemediationPackage } from '@/lib/remediation';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * GET /api/remediation
 *
 * Role-scoped remediation and Day-1 plan for the whole project. The developer
 * lens receives diffs, commands and runbook steps; the manager lens receives a
 * commercial checklist with no implementation targets at all.
 */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const rows = getDb()
    .prepare(
      'SELECT id, title, area, severity FROM doubts ORDER BY position',
    )
    .all() as {
    id: string;
    title: string;
    area: string;
    severity: string;
  }[];

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    role: session.role,
    packages: rows.map((row) =>
      buildRemediationPackage(
        row.id,
        row.title,
        row.area,
        row.severity,
        session.role,
      ),
    ),
  });
}
