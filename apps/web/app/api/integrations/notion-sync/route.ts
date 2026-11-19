import type { NextRequest } from 'next/server';

import { ledgerSummary } from '@/lib/crypto-ledger';
import { dispatchIntegration } from '@/lib/integrations';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * POST /api/integrations/notion-sync
 *
 * Both lenses may trigger a Notion handover sync. The artifact is built on the
 * server from the signed session's board; the browser supplies no content and
 * no target.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const { integration, artifact } = await dispatchIntegration(
    session,
    'notion',
  );

  return jsonNoStore({
    ok: true,
    integration,
    artifact,
    ledger: ledgerSummary(session.id),
  });
}
