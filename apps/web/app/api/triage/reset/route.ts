import type { NextRequest } from 'next/server';

import { resetSessionProgress } from '@/db/board';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/** POST /api/triage/reset — clear this session's triage progress. */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  return jsonNoStore({ board: resetSessionProgress(session) });
}
