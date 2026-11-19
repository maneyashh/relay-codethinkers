import type { NextRequest } from 'next/server';

import { listIntegrations } from '@/lib/integrations';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/** GET /api/integrations — session-scoped dispatches for the signed role. */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  return jsonNoStore(listIntegrations(session));
}
