import type { NextRequest } from 'next/server';

import { ledgerSummary } from '@/lib/crypto-ledger';
import {
  canDispatchGithub,
  dispatchIntegration,
} from '@/lib/integrations';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * POST /api/integrations/github-pr
 *
 * Developer-only. The manager role receives a hard 403 before any dispatch
 * work happens, and therefore never receives a diff or artifact. With
 * `GITHUB_TOKEN` + `GITHUB_PR_REPO` the server opens a real PR; otherwise it
 * returns a cryptographically signed sandbox receipt — never a fake success.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  if (!canDispatchGithub(session.role)) {
    return jsonNoStore(
      {
        error: 'forbidden',
        reason: 'github_pr_dispatch_requires_developer',
        detail:
          'Only the developer lens may dispatch a GitHub PR. The manager lens is forbidden by design.',
        status: 403,
      },
      { status: 403 },
    );
  }

  const { integration, artifact } = await dispatchIntegration(
    session,
    'github',
  );

  return jsonNoStore({
    ok: true,
    integration,
    artifact,
    ledger: ledgerSummary(session.id),
  });
}
