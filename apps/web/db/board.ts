import { randomUUID } from 'node:crypto';

import type {
  BoardMeta,
  DecisionInput,
  SignalInput,
  SynthesisResult,
  TriageBoard,
} from '@/lib/api-types';
import {
  MAX_SIGNALS_PER_SESSION,
  projectConfidence,
  synthesisFormula,
} from '@/lib/synthesis';
import type {
  DecisionType,
  Doubt,
  DoubtKind,
  DoubtStatus,
  Evidence,
  EvidencePolarity,
  EvidenceSource,
  Resolution,
  Role,
  Severity,
  VerificationState,
} from '@/lib/triage-types';
import { getDb, getStorageMode, PROJECT_ID } from './client';
import {
  appendAudit,
  getSessionById,
  type SessionRecord,
} from './session';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
};

const BASE_XP: Record<Severity, number> = {
  critical: 100,
  high: 60,
  medium: 30,
};

const DECISION_BONUS: Record<DecisionType, number> = {
  standard: 0,
  confirm_blocker: 25,
  accept_risk: 20,
  escalate: 15,
  verify: 10,
  auto: 0,
};

const DECISION_TYPES: DecisionType[] = [
  'standard',
  'confirm_blocker',
  'accept_risk',
  'escalate',
  'verify',
  'auto',
];

const SOURCES: EvidenceSource[] = [
  'slack',
  'github',
  'notion',
  'jira',
  'code',
  'email',
];

const POLARITIES: EvidencePolarity[] = ['supports', 'contradicts', 'context'];

const RECOMMENDED: Record<string, Resolution['id']> = {
  'd-001': 1,
  'd-002': 3,
  'd-003': 1,
  'd-004': 1,
  'd-005': 1,
  'd-006': 1,
};

type DoubtRow = {
  id: string;
  kind: DoubtKind;
  severity: Severity;
  area: string;
  title: string;
  claim: string;
  confidence: number;
  engine_hint: string;
  impact_budget: string;
  impact_timeline: string;
  impact_risk: string;
  impl_owner: string;
  impl_repo: string;
  impl_branch: string;
  impl_pr: string;
  session_status: DoubtStatus;
  session_resolved_with: number | null;
  decision_type: DecisionType | null;
  decision_rationale: string | null;
  decision_owner: string | null;
  decision_signed_off: number | bigint | null;
  decision_signoff_name: string | null;
  decision_verification: VerificationState | null;
  decision_updated_at: string | null;
};

type EvidenceRow = {
  id: string;
  source: EvidenceSource;
  author: string;
  authored_at: string;
  quote: string;
  redacted?: string | null;
  audience?: Role | 'all';
  polarity: EvidencePolarity;
  relevance: number;
  channel?: string | null;
  file_path?: string | null;
  commit_ref?: string | null;
  url?: string | null;
};

type SignalRow = {
  id: string;
  source: EvidenceSource;
  author: string;
  quote: string;
  audience: Role | 'all';
  polarity: EvidencePolarity;
  relevance: number;
  channel?: string | null;
  created_at: string;
  file_path?: string | null;
  commit_ref?: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  handover_date: string;
  status: string;
};

type CountRow = { n: number | bigint };

function readinessFor(doubts: Doubt[]): number {
  const total = doubts.reduce(
    (sum, doubt) => sum + SEVERITY_WEIGHT[doubt.severity],
    0,
  );
  if (total === 0) return 100;
  const done = doubts
    .filter((doubt) => doubt.status === 'resolved')
    .reduce((sum, doubt) => sum + SEVERITY_WEIGHT[doubt.severity], 0);
  return Math.round((done / total) * 100);
}

function toEvidence(row: EvidenceRow): Evidence {
  const evidence: Evidence = {
    id: row.id,
    source: row.source,
    author: row.author,
    timestamp: row.authored_at,
    quote: row.quote,
    polarity: row.polarity,
    relevance: row.relevance,
    channel: row.channel ?? undefined,
  };

  // These columns only exist in v_evidence_junior. If they are absent the
  // property is never created, so it cannot appear in the JSON payload.
  if (row.redacted) evidence.redacted = row.redacted;
  if (row.file_path) evidence.filePath = row.file_path;
  if (row.commit_ref) evidence.commit = row.commit_ref;
  if (row.url) evidence.url = row.url;
  if (row.audience) evidence.audience = row.audience;

  return evidence;
}

function toSignalEvidence(row: SignalRow): Evidence {
  const evidence: Evidence = {
    id: row.id,
    source: row.source,
    author: row.author,
    timestamp: row.created_at,
    quote: row.quote,
    polarity: row.polarity,
    relevance: row.relevance,
    channel: row.channel ?? undefined,
    audience: row.audience,
    injected: true,
    signalId: row.id,
  };

  // v_signal_manager never selects these columns, so the manager payload
  // cannot accidentally carry them.
  if (row.file_path) evidence.filePath = row.file_path;
  if (row.commit_ref) evidence.commit = row.commit_ref;

  return evidence;
}

function evidenceViewFor(role: Role): string {
  return role === 'manager' ? 'v_evidence_manager' : 'v_evidence_junior';
}

function signalViewFor(role: Role): string {
  return role === 'manager' ? 'v_signal_manager' : 'v_signal_junior';
}

/**
 * Build a role-filtered board. This is the single read path used by every API
 * route. The role comes from the caller's session record, never from user input.
 */
export function buildBoard(session: SessionRecord): TriageBoard {
  const db = getDb();
  const role = session.role;

  const project = db
    .prepare(
      'SELECT id, name, slug, handover_date, status FROM projects WHERE id = ?',
    )
    .get(PROJECT_ID) as ProjectRow | undefined;

  if (!project) {
    throw new Error('Relay database is not seeded');
  }

  const evidenceView = evidenceViewFor(role);
  const signalView = signalViewFor(role);
  const hiddenAudience: Role = role === 'manager' ? 'junior' : 'manager';

  const rows = db
    .prepare(
      `SELECT
         d.id, d.kind, d.severity, d.area, d.title, d.claim, d.confidence,
         d.engine_hint, d.impact_budget, d.impact_timeline, d.impact_risk,
         d.impl_owner, d.impl_repo, d.impl_branch, d.impl_pr,
         COALESCE(sd.status, 'open') AS session_status,
         sd.resolved_with AS session_resolved_with,
         dec.decision_type, dec.rationale AS decision_rationale,
         dec.owner AS decision_owner, dec.signed_off AS decision_signed_off,
         dec.signoff_name AS decision_signoff_name,
         dec.verification AS decision_verification,
         dec.updated_at AS decision_updated_at
       FROM doubts d
       LEFT JOIN session_doubts sd
         ON sd.doubt_id = d.id AND sd.session_id = ?
       LEFT JOIN session_decisions dec
         ON dec.doubt_id = d.id AND dec.session_id = ?
       WHERE d.project_id = ?
       ORDER BY d.position`,
    )
    .all(session.id, session.id, PROJECT_ID) as DoubtRow[];

  const evidenceStmt = db.prepare(
    `SELECT * FROM ${evidenceView} WHERE doubt_id = ? ORDER BY position`,
  );
  const signalStmt = db.prepare(
    `SELECT * FROM ${signalView}
     WHERE session_id = ? AND doubt_id = ?
     ORDER BY created_at`,
  );
  const lockedStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM evidence WHERE doubt_id = ? AND audience = ?',
  );
  const lockedSignalStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM session_signals
     WHERE session_id = ? AND doubt_id = ? AND audience = ?`,
  );
  const resolutionStmt = db.prepare(
    `SELECT resolution_id, label, description
     FROM resolutions WHERE doubt_id = ? ORDER BY resolution_id`,
  );
  const filesStmt = db.prepare(
    'SELECT path FROM doubt_files WHERE doubt_id = ? ORDER BY position',
  );

  const doubts: Doubt[] = rows.map((row) => {
    const baseEvidence = (evidenceStmt.all(row.id) as EvidenceRow[]).map(
      toEvidence,
    );
    const signals = (
      signalStmt.all(session.id, row.id) as SignalRow[]
    ).map(toSignalEvidence);

    const lockedRow = lockedStmt.get(row.id, hiddenAudience) as
      | CountRow
      | undefined;
    const lockedSignalRow = lockedSignalStmt.get(
      session.id,
      row.id,
      hiddenAudience,
    ) as CountRow | undefined;

    const resolutions = (
      resolutionStmt.all(row.id) as {
        resolution_id: 1 | 2 | 3;
        label: string;
        description: string;
      }[]
    ).map(
      (item): Resolution => ({
        id: item.resolution_id,
        label: item.label,
        description: item.description,
      }),
    );

    const confidence = projectConfidence(
      row.confidence,
      signals.map((signal) => ({
        polarity: signal.polarity ?? 'context',
        relevance: signal.relevance,
        injected: true,
      })),
    );
    const delta = confidence - row.confidence;

    const doubt: Doubt = {
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      area: row.area,
      title: row.title,
      claim: row.claim,
      confidence,
      engineHint: row.engine_hint,
      evidence: [...baseEvidence, ...signals],
      resolutions,
      status: row.session_status,
      lockedEvidence:
        (lockedRow ? Number(lockedRow.n) : 0) +
        (lockedSignalRow ? Number(lockedSignalRow.n) : 0),
      synthesis: {
        baseConfidence: row.confidence,
        confidence,
        delta,
        injectedCount: signals.length,
        formula: synthesisFormula(
          row.confidence,
          signals.map((signal) => ({
            polarity: signal.polarity ?? 'context',
            relevance: signal.relevance,
            injected: true,
          })),
        ),
      },
    };

    if (row.session_resolved_with != null) {
      doubt.resolvedWith = row.session_resolved_with as Resolution['id'];
    }

    if (row.decision_type) {
      doubt.decision = {
        type: row.decision_type,
        rationale: row.decision_rationale ?? undefined,
        owner: row.decision_owner ?? undefined,
        signedOff: Boolean(Number(row.decision_signed_off ?? 0)),
        signoffName: row.decision_signoff_name ?? undefined,
        verification: row.decision_verification ?? 'pending',
        updatedAt: row.decision_updated_at ?? new Date().toISOString(),
      };
    }

    if (role === 'manager') {
      // Commercial lens only. No implementation object is constructed.
      doubt.impact = {
        budget: row.impact_budget,
        timeline: row.impact_timeline,
        risk: row.impact_risk,
      };
    } else {
      // Engineering lens only. Budget/timeline/risk are not constructed.
      doubt.implementation = {
        owner: row.impl_owner,
        repo: row.impl_repo,
        branch: row.impl_branch,
        pr: row.impl_pr,
        files: (filesStmt.all(row.id) as { path: string }[]).map(
          (file) => file.path,
        ),
      };
    }

    return doubt;
  });

  const totalRow = db
    .prepare('SELECT COUNT(*) AS n FROM evidence')
    .get() as CountRow | undefined;
  const sourceRows = db
    .prepare(
      'SELECT source, COUNT(*) AS n FROM evidence GROUP BY source ORDER BY source',
    )
    .all() as { source: string; n: number | bigint }[];

  const allSignalRow = db
    .prepare('SELECT COUNT(*) AS n FROM session_signals WHERE session_id = ?')
    .get(session.id) as CountRow | undefined;
  const visibleSignalRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ${signalView} WHERE session_id = ?`,
    )
    .get(session.id) as CountRow | undefined;

  const evidenceVisible = doubts.reduce(
    (sum, doubt) => sum + doubt.evidence.length,
    0,
  );
  const evidenceLocked = doubts.reduce(
    (sum, doubt) => sum + (doubt.lockedEvidence ?? 0),
    0,
  );
  const readiness = readinessFor(doubts);
  const injectedSignals = visibleSignalRow ? Number(visibleSignalRow.n) : 0;
  const injectedSignalsLocked = allSignalRow
    ? Number(allSignalRow.n) - injectedSignals
    : 0;

  const meta: BoardMeta = {
    generatedAt: new Date().toISOString(),
    doubts: doubts.length,
    sources: totalRow ? Number(totalRow.n) : 0,
    evidenceTotal: totalRow ? Number(totalRow.n) : 0,
    evidenceVisible,
    evidenceLocked,
    meanConfidence: doubts.length
      ? Math.round(
          (doubts.reduce((sum, doubt) => sum + doubt.confidence, 0) /
            doubts.length) *
            100,
        )
      : 0,
    readyForHandover: readiness === 100,
    serverFiltered: true,
    storage: getStorageMode(),
    sourceBreakdown: sourceRows.map((row) => ({
      source: row.source,
      count: Number(row.n),
    })),
    injectedSignals,
    injectedSignalsLocked,
    projection: {
      role,
      view: evidenceView,
      signalView,
    },
  };

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      handoverDate: project.handover_date,
      status: project.status,
    },
    session: {
      id: session.id,
      role,
      xp: session.xp,
      streak: session.streak,
      readiness,
    },
    meta,
    doubts,
  };
}

/**
 * Build a throwaway board for one role. Used by the security probe to compare
 * projections without exposing either payload to the client.
 */
export function buildBoardForRole(role: Role): TriageBoard {
  const now = new Date().toISOString();
  return buildBoard({
    id: `__security_probe_${role}__`,
    role,
    xp: 0,
    streak: 0,
    created_at: now,
    updated_at: now,
  });
}

/** Build a board for a real session id but a chosen lens (server-side only). */
export function buildBoardForSessionRole(
  session: SessionRecord,
  role: Role,
): TriageBoard {
  return buildBoard({ ...session, role });
}

export type DoubtAction =
  | 'resolve'
  | 'skip'
  | 'reopen'
  | 'verify';

export type ActionResult =
  | {
      ok: true;
      board: TriageBoard;
      reward: { key: number; amount: number } | null;
    }
  | { ok: false; status: number; error: string };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isDecisionType(value: unknown): value is DecisionType {
  return (
    typeof value === 'string' &&
    (DECISION_TYPES as string[]).includes(value)
  );
}

function decisionFromInput(
  session: SessionRecord,
  input: DecisionInput | undefined,
  doubt: { severity: Severity; impl_owner: string },
): {
  type: DecisionType;
  rationale: string | null;
  owner: string | null;
  signedOff: boolean;
  signoffName: string | null;
} {
  const type =
    input && isDecisionType(input.decisionType)
      ? input.decisionType
      : 'standard';
  const rationale = cleanText(input?.rationale, 400);
  const owner =
    cleanText(input?.owner, 80) ??
    (type === 'auto' ? doubt.impl_owner : null);
  const wantsSignoff =
    type === 'accept_risk' || type === 'confirm_blocker' || Boolean(input?.signedOff);
  const signoffName = wantsSignoff
    ? (cleanText(input?.signoffName, 80) ??
      owner ??
      (session.role === 'manager' ? 'Manager (session)' : 'Developer (session)'))
    : null;

  return {
    type,
    rationale,
    owner,
    signedOff: Boolean(signoffName),
    signoffName,
  };
}

function upsertDecision(
  sessionId: string,
  doubtId: string,
  decision: ReturnType<typeof decisionFromInput>,
  verification: VerificationState,
  now: string,
) {
  getDb()
    .prepare(
      `INSERT INTO session_decisions (
         session_id, doubt_id, decision_type, rationale, owner, signed_off,
         signoff_name, verification, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, doubt_id) DO UPDATE SET
         decision_type = excluded.decision_type,
         rationale = excluded.rationale,
         owner = excluded.owner,
         signed_off = excluded.signed_off,
         signoff_name = excluded.signoff_name,
         verification = excluded.verification,
         updated_at = excluded.updated_at`,
    )
    .run(
      sessionId,
      doubtId,
      decision.type,
      decision.rationale,
      decision.owner,
      decision.signedOff ? 1 : 0,
      decision.signoffName,
      verification,
      now,
      now,
    );
}

export function applyDoubtAction(
  session: SessionRecord,
  doubtId: string,
  action: DoubtAction,
  resolutionId?: number,
  decisionInput?: DecisionInput,
): ActionResult {
  const db = getDb();
  const doubt = db
    .prepare(
      'SELECT id, severity, impl_owner FROM doubts WHERE id = ?',
    )
    .get(doubtId) as
    | { id: string; severity: Severity; impl_owner: string }
    | undefined;

  if (!doubt) {
    return { ok: false, status: 404, error: 'doubt_not_found' };
  }

  const current = db
    .prepare(
      'SELECT status FROM session_doubts WHERE session_id = ? AND doubt_id = ?',
    )
    .get(session.id, doubtId) as { status: DoubtStatus } | undefined;
  const status = current?.status ?? 'open';
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO session_doubts (session_id, doubt_id, status, resolved_with, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, doubt_id) DO UPDATE SET
      status = excluded.status,
      resolved_with = excluded.resolved_with,
      updated_at = excluded.updated_at
  `);
  const clearDecision = db.prepare(
    'DELETE FROM session_decisions WHERE session_id = ? AND doubt_id = ?',
  );

  let reward: { key: number; amount: number } | null = null;

  if (action === 'resolve') {
    if (status === 'resolved') {
      return {
        ok: true,
        board: buildBoard(session),
        reward: null,
      };
    }

    const resolvedWith = Number(resolutionId);
    if (![1, 2, 3].includes(resolvedWith)) {
      return { ok: false, status: 400, error: 'invalid_resolution' };
    }

    const exists = db
      .prepare(
        'SELECT 1 AS ok FROM resolutions WHERE doubt_id = ? AND resolution_id = ?',
      )
      .get(doubtId, resolvedWith);
    if (!exists) {
      return { ok: false, status: 400, error: 'resolution_not_found' };
    }

    const decision = decisionFromInput(session, decisionInput, doubt);
    const amount =
      Math.round(
        BASE_XP[doubt.severity] * (1 + Math.min(session.streak, 5) * 0.1),
      ) + DECISION_BONUS[decision.type];

    upsert.run(session.id, doubtId, 'resolved', resolvedWith, now);
    upsertDecision(session.id, doubtId, decision, 'pending', now);
    db.prepare(
      'UPDATE sessions SET xp = xp + ?, streak = streak + 1, updated_at = ? WHERE id = ?',
    ).run(amount, now, session.id);

    appendAudit(
      session.id,
      session.role,
      'doubt.resolve',
      doubtId,
      `resolution=${resolvedWith} decision=${decision.type} signed_off=${decision.signedOff} xp=${amount}`,
    );
    reward = { key: Date.now(), amount };
  } else if (action === 'verify') {
    if (status !== 'resolved') {
      return { ok: false, status: 400, error: 'doubt_not_resolved' };
    }

    const existing = db
      .prepare(
        `SELECT decision_type, rationale, owner, signed_off, signoff_name
         FROM session_decisions WHERE session_id = ? AND doubt_id = ?`,
      )
      .get(session.id, doubtId) as
      | {
          decision_type: DecisionType;
          rationale: string | null;
          owner: string | null;
          signed_off: number | bigint;
          signoff_name: string | null;
        }
      | undefined;

    const decision = existing
      ? {
          type: existing.decision_type,
          rationale: existing.rationale,
          owner: existing.owner,
          signedOff: Boolean(Number(existing.signed_off)),
          signoffName: existing.signoff_name,
        }
      : decisionFromInput(session, { decisionType: 'verify' }, doubt);

    upsertDecision(session.id, doubtId, decision, 'verified', now);
    db.prepare(
      'UPDATE sessions SET xp = xp + ?, updated_at = ? WHERE id = ?',
    ).run(DECISION_BONUS.verify, now, session.id);

    appendAudit(
      session.id,
      session.role,
      'doubt.verify',
      doubtId,
      'verification passed · decision marked verified',
    );
    reward = { key: Date.now(), amount: DECISION_BONUS.verify };
  } else if (action === 'skip') {
    if (status !== 'open') {
      return { ok: true, board: buildBoard(session), reward: null };
    }

    upsert.run(session.id, doubtId, 'skipped', null, now);
    clearDecision.run(session.id, doubtId);
    db.prepare(
      'UPDATE sessions SET streak = 0, updated_at = ? WHERE id = ?',
    ).run(now, session.id);

    appendAudit(session.id, session.role, 'doubt.skip', doubtId, null);
  } else {
    upsert.run(session.id, doubtId, 'open', null, now);
    clearDecision.run(session.id, doubtId);
    db.prepare(
      'UPDATE sessions SET streak = 0, updated_at = ? WHERE id = ?',
    ).run(now, session.id);

    appendAudit(session.id, session.role, 'doubt.reopen', doubtId, null);
  }

  const fresh = getSessionById(session.id) ?? session;
  return { ok: true, board: buildBoard(fresh), reward };
}

/**
 * Resolve every open doubt with a curated recommended remediation. This is the
 * explicitly-labelled judge accelerator: it is audited as `decision=auto` and
 * never pretends to be a human decision.
 */
export function fastForwardSession(session: SessionRecord): {
  board: TriageBoard;
  fastForwarded: number;
  resolutionMap: { doubtId: string; resolutionId: Resolution['id'] }[];
} {
  const db = getDb();
  const now = new Date().toISOString();
  const open = db
    .prepare(
      `SELECT d.id, d.severity, d.impl_owner
       FROM doubts d
       LEFT JOIN session_doubts sd
         ON sd.doubt_id = d.id AND sd.session_id = ?
       WHERE COALESCE(sd.status, 'open') = 'open'
       ORDER BY d.position`,
    )
    .all(session.id) as {
    id: string;
    severity: Severity;
    impl_owner: string;
  }[];

  let xp = 0;
  const resolutionMap: { doubtId: string; resolutionId: Resolution['id'] }[] =
    [];

  const upsert = db.prepare(`
    INSERT INTO session_doubts (session_id, doubt_id, status, resolved_with, updated_at)
    VALUES (?, ?, 'resolved', ?, ?)
    ON CONFLICT(session_id, doubt_id) DO UPDATE SET
      status = 'resolved',
      resolved_with = excluded.resolved_with,
      updated_at = excluded.updated_at
  `);

  for (const doubt of open) {
    const resolutionId = RECOMMENDED[doubt.id] ?? 1;
    const decision = decisionFromInput(
      session,
      {
        decisionType: 'auto',
        rationale:
          'Judge accelerator: Relay applied the curated recommended remediation.',
        owner: doubt.impl_owner,
      },
      doubt,
    );
    upsert.run(session.id, doubt.id, resolutionId, now);
    upsertDecision(session.id, doubt.id, decision, 'pending', now);
    xp += Math.round(BASE_XP[doubt.severity] * 0.5);
    resolutionMap.push({ doubtId: doubt.id, resolutionId });
    appendAudit(
      session.id,
      session.role,
      'doubt.fast_forward',
      doubt.id,
      `resolution=${resolutionId} decision=auto`,
    );
  }

  if (open.length > 0) {
    db.prepare(
      'UPDATE sessions SET xp = xp + ?, updated_at = ? WHERE id = ?',
    ).run(xp, now, session.id);
  }

  const fresh = getSessionById(session.id) ?? session;
  return {
    board: buildBoard(fresh),
    fastForwarded: open.length,
    resolutionMap,
  };
}

/* ------------------------------------------------------------------ */
/* Live signal injection                                               */
/* ------------------------------------------------------------------ */

export type InjectResult =
  | {
      ok: true;
      board: TriageBoard;
      signal: {
        id: string;
        doubtId: string;
        audience: 'all' | 'manager' | 'junior';
        createdAt: string;
      };
      synthesis: SynthesisResult;
      signalsUsed: number;
      signalsRemaining: number;
    }
  | { ok: false; status: number; error: string };

export function injectSignal(
  session: SessionRecord,
  input: Partial<SignalInput>,
): InjectResult {
  const db = getDb();

  const doubt = db
    .prepare('SELECT id, confidence FROM doubts WHERE id = ?')
    .get(typeof input.doubtId === 'string' ? input.doubtId : '') as
    | { id: string; confidence: number }
    | undefined;
  if (!doubt) {
    return { ok: false, status: 404, error: 'doubt_not_found' };
  }

  const usedRow = db
    .prepare(
      'SELECT COUNT(*) AS n FROM session_signals WHERE session_id = ?',
    )
    .get(session.id) as CountRow;
  const used = Number(usedRow.n);
  if (used >= MAX_SIGNALS_PER_SESSION) {
    return { ok: false, status: 429, error: 'signal_limit_reached' };
  }

  const quote = cleanText(input.quote, 600);
  if (!quote) {
    return { ok: false, status: 400, error: 'quote_required' };
  }

  const source = SOURCES.includes(input.source as EvidenceSource)
    ? (input.source as EvidenceSource)
    : 'slack';
  const audience =
    input.audience === 'manager' || input.audience === 'junior'
      ? input.audience
      : 'all';
  const polarity = POLARITIES.includes(input.polarity as EvidencePolarity)
    ? (input.polarity as EvidencePolarity)
    : 'contradicts';
  const relevance = Math.min(
    1,
    Math.max(0.1, Number(input.relevance) || 0.85),
  );

  const id = `sig-${randomUUID()}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO session_signals (
       id, session_id, doubt_id, source, author, quote, audience, polarity,
       relevance, channel, file_path, commit_ref, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    session.id,
    doubt.id,
    source,
    cleanText(input.author, 80) ?? 'Anonymous operator',
    quote,
    audience,
    polarity,
    relevance,
    cleanText(input.channel, 80) ?? 'live injection',
    cleanText(input.filePath, 200),
    cleanText(input.commit, 200),
    now,
  );

  appendAudit(
    session.id,
    session.role,
    'signal.inject',
    doubt.id,
    `source=${source} audience=${audience} polarity=${polarity} relevance=${relevance.toFixed(2)}`,
  );

  const visible =
    audience === 'all' || audience === session.role
      ? [
          ...(
            db
              .prepare(
                `SELECT * FROM ${signalViewFor(session.role)}
                 WHERE session_id = ? AND doubt_id = ?
                 ORDER BY created_at`,
              )
              .all(session.id, doubt.id) as SignalRow[]
          ),
        ]
      : [];

  const confidence = projectConfidence(
    doubt.confidence,
    visible.map((row) => ({
      polarity: row.polarity,
      relevance: row.relevance,
      injected: true,
    })),
  );

  return {
    ok: true,
    board: buildBoard(session),
    signal: { id, doubtId: doubt.id, audience, createdAt: now },
    synthesis: {
      doubtId: doubt.id,
      baseConfidence: doubt.confidence,
      confidence,
      delta: confidence - doubt.confidence,
      injectedCount: visible.length,
      formula: synthesisFormula(
        doubt.confidence,
        visible.map((row) => ({
          polarity: row.polarity,
          relevance: row.relevance,
          injected: true,
        })),
      ),
      visibleToRole: audience === 'all' || audience === session.role,
    },
    signalsUsed: used + 1,
    signalsRemaining: Math.max(0, MAX_SIGNALS_PER_SESSION - used - 1),
  };
}

export function resetSessionProgress(session: SessionRecord): TriageBoard {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM session_doubts WHERE session_id = ?').run(session.id);
  db.prepare('DELETE FROM session_decisions WHERE session_id = ?').run(
    session.id,
  );
  db.prepare('DELETE FROM session_signals WHERE session_id = ?').run(session.id);
  db.prepare(
    'UPDATE sessions SET xp = 0, streak = 0, updated_at = ? WHERE id = ?',
  ).run(now, session.id);

  appendAudit(
    session.id,
    session.role,
    'session.reset',
    null,
    'progress, decisions and injected signals cleared',
  );

  return buildBoard(getSessionById(session.id) ?? session);
}
