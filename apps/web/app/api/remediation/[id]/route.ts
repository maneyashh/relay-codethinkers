import type { NextRequest } from 'next/server';

import { getDb } from '@/db/client';
import { buildRemediationPackage } from '@/lib/remediation';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/** GET /api/remediation/:id — one role-scoped remediation package. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const { id } = await context.params;
  const row = getDb()
    .prepare(
      'SELECT id, title, area, severity FROM doubts WHERE id = ?',
    )
    .get(id) as
    | { id: string; title: string; area: string; severity: string }
    | undefined;

  if (!row) {
    return jsonNoStore({ error: 'doubt_not_found' }, { status: 404 });
  }

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    role: session.role,
    packages: [
      buildRemediationPackage(
        row.id,
        row.title,
        row.area,
        row.severity,
        session.role,
      ),
    ],
  });
}
