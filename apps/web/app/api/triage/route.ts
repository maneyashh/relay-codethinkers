import type { NextRequest } from 'next/server';

import { buildBoard } from '@/db/board';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';


/** GET /api/triage — the board for the signed-in session's role. */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  return jsonNoStore({ board: buildBoard(session) });
}
