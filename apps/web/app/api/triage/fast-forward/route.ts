import type { NextRequest } from 'next/server';

import { fastForwardSession } from '@/db/board';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * POST /api/triage/fast-forward
 *
 * Explicitly-labelled judge accelerator. Applies Relay's curated recommended
 * resolution to every open doubt and audits each decision as `auto`. It never
 * pretends a human made the call.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const result = fastForwardSession(session);

  return jsonNoStore({
    board: result.board,
    fastForwarded: result.fastForwarded,
    resolutionMap: result.resolutionMap,
    reward: null,
  });
}
