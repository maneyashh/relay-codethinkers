import { randomUUID } from 'node:crypto';

import type { IngestionSummary } from '@/lib/api-types';
import type {
  GithubFinding,
  GithubSnapshot,
} from '@/lib/github-types';
import type {
  Doubt,
  DoubtDecision,
  DoubtImpact,
  Resolution,
  Role,
} from '@/lib/triage-types';
import { getDb, PROJECT_ID } from './client';

interface LivePayloadBase {
  evidence: import('@/lib/triage-types').Evidence[];
  resolutions: Resolution[];
  recommended: Resolution['id'];
  engineHint: string;
}

interface ManagerPayload extends LivePayloadBase {
  impact: DoubtImpact;
}

interface JuniorPayload extends LivePayloadBase {
  implementation: {
    owner: string;
    repo: string;
    branch: string;
    pr: string;
    files: string[];
  };
}

function managerPayload(finding: GithubFinding): ManagerPayload {
  return {
    engineHint: finding.managerEngineHint,
    resolutions: finding.managerResolutions,
    recommended: finding.recommended,
    impact: finding.impact,
    evidence: finding.evidence.map((item) => ({
      id: item.id,
      source: 'github',
      author: item.author,
      timestamp: item.timestamp,
      quote: item.managerQuote,
      polarity: item.polarity,
      relevance: item.relevance,
      channel: 'github · signed event',
      audience: 'all',
    })),
  };
}

function juniorPayload(finding: GithubFinding): JuniorPayload {
  return {
    engineHint: finding.engineHint,
    resolutions: finding.resolutions,
    recommended: finding.recommended,
    implementation: {
      owner: finding.repo.split('/')[0],
      repo: finding.repo,
      branch: `relay/handover-${finding.headSha.slice(0, 7)}`,
      pr: `#${finding.headSha.slice(0, 7)}`,
      files: finding.files,
    },
    evidence: finding.evidence.map((item) => ({
      id: item.id,
      source: 'github',
      author: item.author,
      timestamp: item.timestamp,
      quote: item.quote,
      polarity: item.polarity,
      relevance: item.relevance,
      channel: finding.area,
      filePath: item.filePath,
      commit: item.commit,
      diff: item.diff,
      url: item.url,
    })),
  };
}

function projectId(): string {
  return PROJECT_ID;
}

/**
 * Finding ids are deterministic per repository + head SHA, which means two
 * judges scanning the same repo land on the same id. The table primary key is
 * global, so the stored row id is namespaced with the signed session id while
 * the public API keeps returning the stable finding id. Legacy rows written
 * before the namespace fix still resolve through the raw id fallback.
 */
function liveRowId(sessionId: string, doubtId: string): string {
  const prefix = `${sessionId}:`;
  return doubtId.startsWith(prefix) ? doubtId : `${prefix}${doubtId}`;
}

function publicLiveId(sessionId: string, rowId: string): string {
  const prefix = `${sessionId}:`;
  return rowId.startsWith(prefix) ? rowId.slice(prefix.length) : rowId;
}

/** Strip the per-session storage namespace from a live doubt row id. */
export function publicLiveDoubtId(sessionId: string, rowId: string): string {
  return publicLiveId(sessionId, rowId);
}

export function nextLivePosition(sessionId: string): number {
  const db = getDb();
  const seeded = db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) AS n FROM doubts WHERE project_id = ?',
    )
    .get(projectId()) as { n: number | bigint };
  const live = db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) AS n FROM session_live_doubts WHERE session_id = ?',
    )
    .get(sessionId) as { n: number | bigint };
  return Math.max(Number(seeded.n), Number(live.n)) + 1;
}

/** Replace the session's previous live findings (new ingestion wins). */
export function replaceLiveDoubts(
  sessionId: string,
  findings: GithubFinding[],
  origin: 'github' | 'webhook',
): { created: number; duplicate: boolean } {
  const db = getDb();
  db.prepare('DELETE FROM session_live_doubts WHERE session_id = ?').run(
    sessionId,
  );
  return insertLiveDoubts(sessionId, findings, origin);
}

/** Add findings incrementally. Webhook delivery ids make this idempotent. */
export function insertLiveDoubts(
  sessionId: string,
  findings: GithubFinding[],
  origin: 'github' | 'webhook',
): { created: number; duplicate: boolean } {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO session_live_doubts (
       id, session_id, project_id, position, origin, repo, ref, head_sha,
       source_url, kind, severity, area, title, claim, confidence,
       engine_hint_manager, engine_hint_junior, manager_payload,
       junior_payload, status, resolved_with, decision_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?)`,
  );

  let created = 0;
  let duplicate = false;
  const now = new Date().toISOString();
  let position = nextLivePosition(sessionId);

  db.exec('BEGIN');
  try {
    for (const finding of findings) {
      const rowId = liveRowId(sessionId, finding.id);
      const existing = db
        .prepare(
          'SELECT 1 AS ok FROM session_live_doubts WHERE session_id = ? AND id = ?',
        )
        .get(sessionId, rowId);
      if (existing) {
        duplicate = true;
        continue;
      }
      const result = insert.run(
        rowId,
        sessionId,
        projectId(),
        position,
        origin,
        finding.repo,
        finding.ref,
        finding.headSha,
        finding.sourceUrl,
        finding.kind,
        finding.severity,
        finding.area,
        finding.title,
        finding.claim,
        finding.confidence,
        finding.managerEngineHint,
        finding.engineHint,
        JSON.stringify(managerPayload(finding)),
        JSON.stringify(juniorPayload(finding)),
        now,
      );
      if (Number(result.changes) > 0) {
        created += 1;
        position += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { created, duplicate };
}

interface IngestionRow {
  id: string;
  repo: string;
  full_name: string;
  ref: string;
  head_sha: string | null;
  mode: 'live' | 'fallback';
  source: 'preset' | 'custom';
  files_scanned: number | bigint;
  commits_read: number | bigint;
  findings: number | bigint;
  fallback_reason: string | null;
  created_at: string;
}

function toIngestion(row: IngestionRow, role: Role): IngestionSummary {
  const summary: IngestionSummary = {
    id: row.id,
    repo: row.repo,
    fullName: row.full_name,
    ref: row.ref,
    mode: row.mode,
    source: row.source,
    filesScanned: Number(row.files_scanned),
    commitsRead: Number(row.commits_read),
    findings: Number(row.findings),
    createdAt: row.created_at,
  };
  if (role === 'junior' && row.head_sha) summary.headSha = row.head_sha;
  if (row.fallback_reason) summary.fallbackReason = row.fallback_reason;
  return summary;
}

export function saveIngestion(
  sessionId: string,
  snapshot: GithubSnapshot,
  input: {
    mode: 'live' | 'fallback';
    source: 'preset' | 'custom';
    findings: number;
    fallbackReason?: string;
  },
  role: Role,
): IngestionSummary {
  const db = getDb();
  const id = `ing-${randomUUID()}`;
  const createdAt = new Date().toISOString();

  db.prepare('DELETE FROM session_ingestions WHERE session_id = ?').run(
    sessionId,
  );
  db.prepare(
    `INSERT INTO session_ingestions (
       id, session_id, repo, full_name, ref, head_sha, mode, source,
       files_scanned, commits_read, findings, fallback_reason, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    snapshot.name,
    snapshot.fullName,
    snapshot.defaultBranch,
    snapshot.headSha,
    input.mode,
    input.source,
    snapshot.paths.length,
    snapshot.commits.length,
    input.findings,
    input.fallbackReason ?? null,
    createdAt,
  );

  return toIngestion(
    {
      id,
      repo: snapshot.name,
      full_name: snapshot.fullName,
      ref: snapshot.defaultBranch,
      head_sha: snapshot.headSha,
      mode: input.mode,
      source: input.source,
      files_scanned: snapshot.paths.length,
      commits_read: snapshot.commits.length,
      findings: input.findings,
      fallback_reason: input.fallbackReason ?? null,
      created_at: createdAt,
    },
    role,
  );
}

export function getLastIngestion(
  sessionId: string,
  role: Role,
): IngestionSummary | null {
  const row = getDb()
    .prepare(
      `SELECT id, repo, full_name, ref, head_sha, mode, source, files_scanned,
              commits_read, findings, fallback_reason, created_at
       FROM session_ingestions WHERE session_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId) as IngestionRow | undefined;
  return row ? toIngestion(row, role) : null;
}

interface LiveRow {
  id: string;
  kind: Doubt['kind'];
  severity: Doubt['severity'];
  area: string;
  title: string;
  claim: string;
  confidence: number;
  engine_hint: string;
  payload: string;
  status: Doubt['status'];
  resolved_with: number | null;
  decision_json: string | null;
  origin: 'github' | 'webhook';
  repo?: string | null;
  ref?: string | null;
  head_sha?: string | null;
  source_url?: string | null;
}

function liveViewFor(role: Role): string {
  return role === 'manager' ? 'v_live_manager' : 'v_live_junior';
}

export function liveDoubtsFor(sessionId: string, role: Role): Doubt[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM ${liveViewFor(role)}
       WHERE session_id = ? ORDER BY position`,
    )
    .all(sessionId) as unknown as LiveRow[];

  return rows.map((row) => {
    let payload: ManagerPayload | JuniorPayload;
    try {
      payload = JSON.parse(row.payload) as ManagerPayload | JuniorPayload;
    } catch {
      payload = {
        evidence: [],
        resolutions: [],
        recommended: 1,
        engineHint: row.engine_hint,
        impact: {
          budget: 'Unknown',
          timeline: 'Unknown',
          risk: 'Live payload could not be parsed',
        },
      } satisfies ManagerPayload;
    }

    let decision: DoubtDecision | undefined;
    if (row.decision_json) {
      try {
        const parsed = JSON.parse(row.decision_json) as DoubtDecision;
        decision = parsed;
      } catch {
        decision = undefined;
      }
    }

    const doubt: Doubt = {
      id: publicLiveId(sessionId, row.id),
      kind: row.kind,
      severity: row.severity,
      area: row.area,
      title: row.title,
      claim: row.claim,
      confidence: row.confidence,
      engineHint: payload.engineHint || row.engine_hint,
      evidence: payload.evidence,
      resolutions: payload.resolutions,
      status: row.status,
      origin: row.origin,
      synthesis: {
        baseConfidence: row.confidence,
        confidence: row.confidence,
        delta: 0,
        injectedCount: 0,
        formula: `live confidence ${(row.confidence * 100).toFixed(
          0,
        )}% · deterministic GitHub analysis`,
      },
    };

    if (row.resolved_with != null) {
      doubt.resolvedWith = row.resolved_with as Resolution['id'];
    }
    if (decision) doubt.decision = decision;

    if (role === 'manager') {
      doubt.impact = (payload as ManagerPayload).impact;
    } else {
      const junior = payload as JuniorPayload;
      doubt.implementation = junior.implementation;
      if (row.repo) doubt.repo = row.repo;
      if (row.head_sha) doubt.headSha = row.head_sha;
      if (row.source_url) doubt.sourceUrl = row.source_url;
    }

    return doubt;
  });
}

export function getLiveDoubtRow(
  sessionId: string,
  doubtId: string,
): {
  id: string;
  status: Doubt['status'];
  severity: Doubt['severity'];
  resolved_with: number | null;
  payload: string;
  decision_json: string | null;
} | null {
  const row = getDb()
    .prepare(
      'SELECT id, status, severity, resolved_with, junior_payload AS payload, decision_json FROM session_live_doubts WHERE session_id = ? AND (id = ? OR id = ?)',
    )
    .get(sessionId, liveRowId(sessionId, doubtId), doubtId) as
    | {
        id: string;
        status: Doubt['status'];
        severity: Doubt['severity'];
        resolved_with: number | null;
        payload: string;
        decision_json: string | null;
      }
    | undefined;
  return row ?? null;
}

export function liveResolutionExists(
  sessionId: string,
  doubtId: string,
  resolutionId: number,
): boolean {
  const row = getDb()
    .prepare(
      'SELECT junior_payload AS payload FROM session_live_doubts WHERE session_id = ? AND (id = ? OR id = ?)',
    )
    .get(sessionId, liveRowId(sessionId, doubtId), doubtId) as
    | { payload: string }
    | undefined;
  if (!row) return false;
  try {
    const payload = JSON.parse(row.payload) as JuniorPayload;
    return payload.resolutions.some((item) => item.id === resolutionId);
  } catch {
    return false;
  }
}

export function updateLiveDoubt(
  sessionId: string,
  doubtId: string,
  input: {
    status: Doubt['status'];
    resolvedWith: number | null;
    decision: DoubtDecision | null;
  },
): void {
  getDb()
    .prepare(
      `UPDATE session_live_doubts
       SET status = ?, resolved_with = ?, decision_json = ?
       WHERE session_id = ? AND (id = ? OR id = ?)`,
    )
    .run(
      input.status,
      input.resolvedWith,
      input.decision ? JSON.stringify(input.decision) : null,
      sessionId,
      liveRowId(sessionId, doubtId),
      doubtId,
    );
}

export function clearLiveState(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM session_live_doubts WHERE session_id = ?').run(
    sessionId,
  );
  db.prepare('DELETE FROM session_ingestions WHERE session_id = ?').run(
    sessionId,
  );
}

export function countLiveDoubts(sessionId: string): number {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM session_live_doubts WHERE session_id = ?',
    )
    .get(sessionId) as { n: number | bigint } | undefined;
  return row ? Number(row.n) : 0;
}
