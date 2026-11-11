import type { NextRequest } from 'next/server';

import {
  applyDoubtAction,
  type DoubtAction,
} from '@/db/board';
import type { DecisionInput } from '@/lib/api-types';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * PATCH /api/doubts/:id
 * body: {
 *   action: 'resolve' | 'skip' | 'reopen' | 'verify',
 *   resolutionId?: 1 | 2 | 3,
 *   decisionType?: 'standard' | 'confirm_blocker' | 'accept_risk' |
 *                   'escalate' | 'verify' | 'auto',
 *   rationale?: string,
 *   owner?: string,
 *   signoffName?: string,
 *   signedOff?: boolean
 * }
 *
 * XP, streak, readiness, decision metadata and verification state are all
 * computed on the server. The response is the refreshed board for the
 * session's role.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const { id } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  const action = body.action;
  if (
    action !== 'resolve' &&
    action !== 'skip' &&
    action !== 'reopen' &&
    action !== 'verify'
  ) {
    return jsonNoStore(
      {
        error: 'invalid_action',
        allowed: ['resolve', 'skip', 'reopen', 'verify'],
      },
      { status: 400 },
    );
  }

  const resolutionId =
    typeof body.resolutionId === 'number' ? body.resolutionId : undefined;

  const decision: DecisionInput = {
    decisionType:
      typeof body.decisionType === 'string'
        ? (body.decisionType as DecisionInput['decisionType'])
        : undefined,
    rationale: typeof body.rationale === 'string' ? body.rationale : undefined,
    owner: typeof body.owner === 'string' ? body.owner : undefined,
    signoffName:
      typeof body.signoffName === 'string' ? body.signoffName : undefined,
    signedOff: typeof body.signedOff === 'boolean' ? body.signedOff : undefined,
  };

  const result = applyDoubtAction(
    session,
    id,
    action as DoubtAction,
    resolutionId,
    decision,
  );

  if (!result.ok) {
    return jsonNoStore({ error: result.error }, { status: result.status });
  }

  return jsonNoStore({
    board: result.board,
    reward: result.reward,
  });
}
