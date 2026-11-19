import type { NextRequest } from 'next/server';

import { buildBoard } from '@/db/board';
import { replaceLiveDoubts, saveIngestion } from '@/db/github';
import { appendAudit } from '@/db/session';
import type {
  FindingPreview,
  GitHubIngestRequest,
  GitHubIngestResponse,
} from '@/lib/api-types';
import { appendLedgerEntry } from '@/lib/crypto-ledger';
import { analyzeGithubSnapshot } from '@/lib/github-analyzer';
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

/**
 * POST /api/github/ingest
 *
 * Fetch a real, unauthenticated GitHub repository snapshot, run the
 * deterministic drift analyzer, and attach the findings to *this* signed
 * session as role-specific doubts. A new ingestion replaces the session's
 * previous live findings; the seeded T-5 narrative is never mutated.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  let body: GitHubIngestRequest = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as GitHubIngestRequest;
    }
  } catch {
    body = {};
  }

  const preset = presetById(body.presetId);
  const repoInput = preset?.repo ?? body.repo ?? '';

  if (!repoInput) {
    return jsonNoStore(
      { error: 'repo_required', hint: 'Send { repo: "owner/name" } or { presetId }' },
      { status: 400 },
    );
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

  const { snapshot, mode, fallbackReason } =
    await fetchSnapshotWithFallback(repo);
  const findings = analyzeGithubSnapshot(snapshot);
  const inserted = replaceLiveDoubts(session.id, findings, 'github');
  const ingestion = saveIngestion(
    session.id,
    snapshot,
    {
      mode,
      source: preset ? 'preset' : 'custom',
      findings: findings.length,
      fallbackReason,
    },
    session.role,
  );

  appendAudit(
    session.id,
    session.role,
    'github.ingest',
    null,
    `repo=${snapshot.fullName} mode=${mode} files=${snapshot.paths.length} findings=${findings.length}`,
  );
  appendLedgerEntry(session.id, 'github.ingest', null, {
    repo: snapshot.fullName,
    mode,
    filesScanned: snapshot.paths.length,
    commitsRead: snapshot.commits.length,
    findings: findings.length,
  });

  const previews: FindingPreview[] = findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    claim: session.role === 'manager' ? finding.managerClaim : finding.claim,
    severity: finding.severity,
    kind: finding.kind,
    area: finding.area,
    confidence: finding.confidence,
  }));

  const payload: GitHubIngestResponse = {
    board: buildBoard(session),
    ingestion,
    findings: previews,
    liveDoubts: inserted.created,
  };
  return jsonNoStore(payload);
}
