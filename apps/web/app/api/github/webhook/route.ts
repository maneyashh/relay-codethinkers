import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import type { NextRequest } from 'next/server';

import { buildBoard } from '@/db/board';
import { countLiveDoubts, insertLiveDoubts } from '@/db/github';
import { appendAudit } from '@/db/session';
import type { WebhookResponse } from '@/lib/api-types';
import { appendLedgerEntry } from '@/lib/crypto-ledger';
import {
  findingFromPullRequest,
  findingFromPush,
} from '@/lib/github-analyzer';
import {
  fetchSnapshotWithFallback,
  normalizeRepo,
  presetById,
} from '@/lib/github-fetch';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

const SIGNATURE_HEADER = 'x-hub-signature-256';

function webhookSecret(): string {
  return (
    process.env.GITHUB_WEBHOOK_SECRET ??
    process.env.RELAY_RECEIPT_SECRET ??
    process.env.RELAY_SESSION_SECRET ??
    'relay-demo-2026-local-webhook-secret'
  );
}

function sign(raw: string): string {
  return `sha256=${createHmac('sha256', webhookSecret())
    .update(raw)
    .digest('hex')}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sha40(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 40);
}

function simulatedPush(repo: string, deliveryId: string) {
  const base = Date.now();
  const messages = [
    'hotfix: bypass the retry guard for checkout',
    'revert "pin runtime to node 18"',
    'chore: update release notes',
  ];
  return {
    ref: 'refs/heads/main',
    before: sha40(`${repo}:before:${deliveryId}`),
    after: sha40(`${repo}:after:${deliveryId}`),
    repository: { full_name: repo },
    pusher: { name: 'release-bot' },
    commits: messages.map((message, index) => ({
      id: sha40(`${repo}:${deliveryId}:${index}`),
      message,
      timestamp: new Date(base - index * 60_000).toISOString(),
      author: index === 0 ? 'release-bot' : 'maintainer',
    })),
  };
}

function simulatedPullRequest(repo: string, deliveryId: string) {
  const seed = Number.parseInt(
    createHash('sha256').update(`${repo}:${deliveryId}`).digest('hex').slice(0, 6),
    16,
  );
  const number = 100 + (seed % 8_000);
  return {
    action: 'opened',
    number,
    repository: { full_name: repo },
    pull_request: {
      number,
      title: 'Post-handover change without a recorded owner',
      user: { login: 'contractor-ops' },
      head: {
        ref: `relay/change-${number}`,
        sha: sha40(`${repo}:pr:${number}:${deliveryId}`),
      },
      html_url: `https://github.com/${repo}/pull/${number}`,
    },
  };
}

/**
 * POST /api/github/webhook
 *
 * Two supported modes, both session-scoped and both HMAC-verified:
 *
 *   - `{ event: 'push' | 'pull_request', repo, presetId? }` — Relay builds a
 *     realistic GitHub payload, signs it with the configured webhook secret
 *     and verifies it through the same code path a real delivery uses.
 *   - A real GitHub delivery with `x-hub-signature-256` and `x-github-event`.
 *
 * The signed Relay session cookie is required in both modes. Findings are
 * appended incrementally and are idempotent by finding id / delivery id.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const raw = await request.text();
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === 'object') {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    return jsonNoStore({ error: 'invalid_json' }, { status: 400 });
  }

  const headerEvent = request.headers.get('x-github-event');
  const headerSignature = request.headers.get(SIGNATURE_HEADER);
  const headerDelivery = request.headers.get('x-github-delivery');
  const simulation =
    !headerEvent && (parsed.event === 'push' || parsed.event === 'pull_request');

  if (!simulation && !headerEvent) {
    return jsonNoStore(
      {
        error: 'event_required',
        hint: 'Send { event: "push" | "pull_request" } or a signed GitHub delivery',
      },
      { status: 400 },
    );
  }

  const event = (headerEvent ??
    (parsed.event as string)) as 'push' | 'pull_request';
  if (event !== 'push' && event !== 'pull_request') {
    return jsonNoStore(
      { error: 'unsupported_event', allowed: ['push', 'pull_request'] },
      { status: 400 },
    );
  }

  const preset = presetById(
    typeof parsed.presetId === 'string' ? parsed.presetId : undefined,
  );
  const requestedRepo = preset?.repo ?? (parsed.repo as string | undefined);

  let signature: string;
  let deliveryId: string;
  let payload: Record<string, unknown>;
  let action: string;

  if (simulation) {
    deliveryId =
      typeof parsed.presetId === 'string'
        ? `sim-${parsed.presetId}-${Date.now()}`
        : `sim-${Date.now()}-${sha40(raw).slice(0, 8)}`;
    const repoForPayload = normalizeRepo(requestedRepo ?? 'expressjs/express');
    payload =
      event === 'push'
        ? simulatedPush(repoForPayload, deliveryId)
        : simulatedPullRequest(repoForPayload, deliveryId);
    signature = sign(JSON.stringify(payload));
    action = event === 'push' ? 'push' : 'opened';
  } else {
    signature = headerSignature ?? '';
    deliveryId = headerDelivery ?? `delivery-${sha40(raw).slice(0, 12)}`;
    payload = parsed;
    action =
      event === 'push'
        ? 'push'
        : String((parsed.action as string | undefined) ?? 'opened');
  }

  if (!headerSignature && !simulation) {
    return jsonNoStore(
      { error: 'signature_required', header: SIGNATURE_HEADER },
      { status: 401 },
    );
  }

  const rawForVerification = simulation ? JSON.stringify(payload) : raw;
  if (!safeEqual(signature, sign(rawForVerification))) {
    return jsonNoStore(
      { error: 'invalid_signature', verified: false },
      { status: 401 },
    );
  }

  const repository = payload.repository as
    | { full_name?: string }
    | undefined;
  const repoInput = requestedRepo ?? repository?.full_name;
  if (!repoInput) {
    return jsonNoStore({ error: 'repo_required' }, { status: 400 });
  }

  let repo: string;
  try {
    repo = normalizeRepo(repoInput);
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'invalid_repo' },
      { status: 400 },
    );
  }

  const { snapshot } = await fetchSnapshotWithFallback(repo);

  const finding =
    event === 'push'
      ? findingFromPush(snapshot, {
          deliveryId,
          ref: String(payload.ref ?? snapshot.defaultBranch),
          commits: (
            (payload.commits as
              | { id?: string; message?: string; timestamp?: string; author?: string }[]
              | undefined) ?? []
          ).map((commit, index) => ({
            id: commit.id ?? sha40(`${deliveryId}:${index}`),
            message: commit.message ?? 'new commit',
            timestamp: commit.timestamp ?? snapshot.headCommittedAt,
            author:
              commit.author ??
              snapshot.commits[0]?.author ??
              snapshot.owner,
          })),
        })
      : findingFromPullRequest(snapshot, {
          deliveryId,
          number: Number(
            (payload.pull_request as { number?: number } | undefined)?.number ??
              payload.number ??
              0,
          ),
          title: String(
            (payload.pull_request as { title?: string } | undefined)?.title ??
              'Post-handover pull request',
          ),
          author: String(
            (
              payload.pull_request as
                | { user?: { login?: string } }
                | undefined
            )?.user?.login ?? 'unknown',
          ),
          branch: String(
            (
              payload.pull_request as
                | { head?: { ref?: string } }
                | undefined
            )?.head?.ref ?? snapshot.defaultBranch,
          ),
          headSha: String(
            (
              payload.pull_request as
                | { head?: { sha?: string } }
                | undefined
            )?.head?.sha ?? snapshot.headSha,
          ),
          url: String(
            (payload.pull_request as { html_url?: string } | undefined)
              ?.html_url ?? snapshot.htmlUrl,
          ),
          action,
        });

  const inserted = insertLiveDoubts(session.id, [finding], 'webhook');

  appendAudit(
    session.id,
    session.role,
    'github.webhook',
    finding.id,
    `event=${event} delivery=${deliveryId} verified=true created=${inserted.created} duplicate=${inserted.duplicate}`,
  );
  appendLedgerEntry(session.id, 'github.webhook', finding.id, {
    event,
    deliveryId,
    repo: snapshot.fullName,
    verified: true,
    created: inserted.created,
    duplicate: inserted.duplicate,
  });

  const payloadOut: WebhookResponse = {
    board: buildBoard(session),
    verified: true,
    event,
    signature,
    deliveryId,
    action,
    doubtsCreated: inserted.created,
    duplicate: inserted.duplicate,
    liveDoubts: countLiveDoubts(session.id),
  };
  return jsonNoStore(payloadOut);
}
