import type { NextRequest } from 'next/server';

import { injectSignal } from '@/db/board';
import type { SignalInput } from '@/lib/api-types';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * POST /api/signals
 *
 * Inject a live, session-scoped signal into an existing doubt. The server
 * validates the payload, writes it with an audience, recomputes confidence
 * deterministically and returns the refreshed role-filtered board.
 *
 * The signal is never written to the seeded `evidence` table, so one session
 * can never widen another session's board or change the 24-source dataset.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  let body: Partial<SignalInput> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as Partial<SignalInput>;
    }
  } catch {
    body = {};
  }

  const result = injectSignal(session, body);
  if (!result.ok) {
    return jsonNoStore({ error: result.error }, { status: result.status });
  }

  return jsonNoStore({
    board: result.board,
    synthesis: result.synthesis,
    signal: result.signal,
    signalsUsed: result.signalsUsed,
    signalsRemaining: result.signalsRemaining,
  });
}
