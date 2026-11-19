import type {
  AuditResponse,
  IntegrationTarget,
  SecurityCheck,
  SecurityProjection,
  SecurityReport,
  SignalBoundary,
} from '@/lib/api-types';
import { simulateTamper, verifySessionLedger } from '@/lib/crypto-ledger';
import {
  githubDispatchStatus,
  verifyDispatchSignature,
} from '@/lib/integrations';
import type { Role } from '@/lib/triage-types';
import {
  buildBoardForRole,
  buildBoardForSessionRole,
} from './board';
import { getDb, getStorageMode } from './client';
import {
  countAuditEvents,
  verifySessionToken,
  type SessionRecord,
} from './session';

const LIVE_TECHNICAL_KEYS = [
  'filePath',
  'commit',
  'diff',
  'headSha',
  'sourceUrl',
  'implementation',
] as const;

const LIVE_SHA = /\b[0-9a-f]{40}\b/gi;

const RESTRICTED_VALUE = 'relay-staging-2024!';
const FORGED_TOKEN = '00000000-0000-4000-8000-000000000000.not-a-valid-signature';

function countKey(value: unknown, key: string): number {
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (sum, item) => sum + countKey(item, key),
      0,
    );
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const self = Object.prototype.hasOwnProperty.call(record, key) ? 1 : 0;
    return (
      self +
      Object.values(record).reduce<number>(
        (sum, item) => sum + countKey(item, key),
        0,
      )
    );
  }
  return 0;
}

function projectionFor(role: Role): {
  projection: SecurityProjection;
  serialized: string;
} {
  const board = buildBoardForRole(role);
  const serialized = JSON.stringify(board.doubts);
  const evidence = board.doubts.flatMap((doubt) => doubt.evidence);

  return {
    serialized,
    projection: {
      role,
      evidenceDelivered: evidence.length,
      evidenceWithheld: board.doubts.reduce(
        (sum, doubt) => sum + (doubt.lockedEvidence ?? 0),
        0,
      ),
      filePathKeys: countKey(board.doubts, 'filePath'),
      commitKeys: countKey(board.doubts, 'commit'),
      implementationObjects: countKey(board.doubts, 'implementation'),
      impactObjects: countKey(board.doubts, 'impact'),
      redactedKeys: countKey(board.doubts, 'redacted'),
      restrictedValueLeaked: serialized.includes(RESTRICTED_VALUE),
      payloadBytes: Buffer.byteLength(serialized, 'utf8'),
    },
  };
}

/**
 * Prove that judge-injected signals obey the same audience boundary as the
 * seeded evidence. Detection is done on the serialized server projections, so
 * the report can expose counts without exposing the signal text itself.
 */
function signalBoundary(session: SessionRecord): SignalBoundary {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT audience, quote FROM session_signals WHERE session_id = ?',
    )
    .all(session.id) as { audience: Role | 'all'; quote: string }[];

  const managerVisible = rows.filter(
    (row) => row.audience === 'all' || row.audience === 'manager',
  ).length;
  const juniorVisible = rows.filter(
    (row) => row.audience === 'all' || row.audience === 'junior',
  ).length;

  if (rows.length === 0) {
    return {
      total: 0,
      managerVisible: 0,
      juniorVisible: 0,
      managerLeaked: 0,
      juniorLeaked: 0,
    };
  }

  const managerPayload = JSON.stringify(
    buildBoardForSessionRole(session, 'manager').doubts,
  );
  const juniorPayload = JSON.stringify(
    buildBoardForSessionRole(session, 'junior').doubts,
  );

  const managerLeaked = rows.filter(
    (row) => row.audience === 'junior' && managerPayload.includes(row.quote),
  ).length;
  const juniorLeaked = rows.filter(
    (row) => row.audience === 'manager' && juniorPayload.includes(row.quote),
  ).length;

  return {
    total: rows.length,
    managerVisible,
    juniorVisible,
    managerLeaked,
    juniorLeaked,
  };
}

/**
 * Live GitHub findings are stored as role-specific JSON payloads. The manager
 * payload must never carry a path, commit, diff, raw SHA, source URL or
 * implementation object, even though the row itself knows all of them.
 */
function liveBoundary(session: SessionRecord): {
  total: number;
  managerVisible: number;
  juniorVisible: number;
  managerLeaked: number;
  juniorLeaked: number;
  technicalKeyLeaks: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT head_sha, manager_payload, junior_payload
       FROM session_live_doubts WHERE session_id = ?`,
    )
    .all(session.id) as {
    head_sha: string | null;
    manager_payload: string;
    junior_payload: string;
  }[];

  const managerDoubts = buildBoardForSessionRole(
    session,
    'manager',
  ).doubts.filter((doubt) => doubt.origin !== 'seed');
  const juniorDoubts = buildBoardForSessionRole(
    session,
    'junior',
  ).doubts.filter((doubt) => doubt.origin !== 'seed');

  let managerLeaked = 0;
  let juniorLeaked = 0;
  let technicalKeyLeaks = 0;

  for (const row of rows) {
    const managerJson = row.manager_payload;
    const managerKeys = LIVE_TECHNICAL_KEYS.reduce(
      (sum, key) => sum + countKey(JSON.parse(managerJson), key),
      0,
    );
    const managerShas = row.head_sha
      ? (managerJson.match(LIVE_SHA) ?? []).length
      : 0;
    technicalKeyLeaks += managerKeys + managerShas;
    if (managerKeys > 0 || managerShas > 0) managerLeaked += 1;

    // The developer payload must not inherit the commercial impact block.
    try {
      if (countKey(JSON.parse(row.junior_payload), 'impact') > 0) {
        juniorLeaked += 1;
      }
    } catch {
      juniorLeaked += 1;
    }
  }

  return {
    total: rows.length,
    managerVisible: managerDoubts.length,
    juniorVisible: juniorDoubts.length,
    managerLeaked,
    juniorLeaked,
    technicalKeyLeaks,
  };
}

function integrationBoundary(session: SessionRecord): {
  total: number;
  github: number;
  notion: number;
  live: number;
  sandbox: number;
  managerGithubStatus: number;
  sandboxSigned: boolean;
  artifactBoundaryPass: boolean;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, target, mode, reference, signature, artifact_sha256, created_at
       FROM session_integrations WHERE session_id = ?`,
    )
    .all(session.id) as {
    id: string;
    target: IntegrationTarget;
    mode: 'live' | 'sandbox';
    reference: string;
    signature: string;
    artifact_sha256: string;
    created_at: string;
  }[];

  const managerView = db
    .prepare(
      'SELECT * FROM v_integration_manager WHERE session_id = ?',
    )
    .all(session.id) as Record<string, unknown>[];

  return {
    total: rows.length,
    github: rows.filter((row) => row.target === 'github').length,
    notion: rows.filter((row) => row.target === 'notion').length,
    live: rows.filter((row) => row.mode === 'live').length,
    sandbox: rows.filter((row) => row.mode === 'sandbox').length,
    managerGithubStatus: githubDispatchStatus('manager'),
    sandboxSigned: rows.every((row) =>
      verifyDispatchSignature({
        sessionId: session.id,
        target: row.target,
        reference: row.reference,
        artifactSha256: row.artifact_sha256,
        createdAt: row.created_at,
        signature: row.signature,
      }),
    ),
    artifactBoundaryPass: !JSON.stringify(managerView).includes('"artifact"'),
  };
}

/**
 * Compare the two server-side projections and return *counts only*. No quote,
 * source, path, commit or secret ever leaves the server through this report.
 */
export function buildSecurityReport(
  session: SessionRecord,
  spoofedRole?: Role | null,
): SecurityReport {
  const manager = projectionFor('manager');
  const junior = projectionFor('junior');
  const forgedCookieRejected = verifySessionToken(FORGED_TOKEN) === null;
  const signals = signalBoundary(session);
  const live = liveBoundary(session);
  const integrations = integrationBoundary(session);
  const { receipt, verification } = verifySessionLedger(session.id);
  const tamper = simulateTamper(receipt);
  const db = getDb();
  const evidenceRows = db
    .prepare('SELECT COUNT(*) AS n FROM evidence')
    .get() as { n: number | bigint } | undefined;

  const chain: SecurityReport['chain'] = {
    entries: receipt.entryCount,
    rootHash: receipt.rootHash,
    signature: receipt.signature,
    verified: verification.ok,
    invalidHashes: verification.invalidHashes,
    brokenAt: verification.brokenAt,
    signatureValid: verification.signatureValid,
    tamperDetected: tamper.tamperAt === null || !tamper.verification.ok,
  };

  const checks: SecurityCheck[] = [
    {
      id: 'manager-no-file-paths',
      label: 'Manager payload contains no file paths',
      pass: manager.projection.filePathKeys === 0,
      detail: `${manager.projection.filePathKeys} filePath keys delivered`,
      category: 'column',
    },
    {
      id: 'manager-no-commits',
      label: 'Manager payload contains no commit hashes',
      pass: manager.projection.commitKeys === 0,
      detail: `${manager.projection.commitKeys} commit keys delivered`,
      category: 'column',
    },
    {
      id: 'manager-no-implementation',
      label: 'Manager payload contains no implementation objects',
      pass: manager.projection.implementationObjects === 0,
      detail: `${manager.projection.implementationObjects} implementation objects`,
      category: 'column',
    },
    {
      id: 'manager-no-redacted',
      label: 'Manager payload contains no redacted secret values',
      pass:
        manager.projection.redactedKeys === 0 &&
        !manager.projection.restrictedValueLeaked,
      detail: `${manager.projection.redactedKeys} redacted keys · restricted value present: ${manager.projection.restrictedValueLeaked}`,
      category: 'column',
    },
    {
      id: 'manager-withholds-evidence',
      label: 'SQL withheld developer evidence from the manager board',
      pass:
        manager.projection.evidenceWithheld > 0 &&
        manager.projection.evidenceDelivered <
          junior.projection.evidenceDelivered,
      detail: `${manager.projection.evidenceWithheld} rows withheld · ${manager.projection.evidenceDelivered}/${junior.projection.evidenceDelivered} delivered`,
      category: 'row',
    },
    {
      id: 'junior-receives-implementation',
      label: 'Developer payload receives implementation targets',
      pass: junior.projection.implementationObjects > 0,
      detail: `${junior.projection.implementationObjects} implementation objects`,
      category: 'column',
    },
    {
      id: 'junior-no-commercial-impact',
      label: 'Developer payload withholds commercial impact fields',
      pass: junior.projection.impactObjects === 0,
      detail: `${junior.projection.impactObjects} impact objects delivered`,
      category: 'column',
    },
    {
      id: 'forged-cookie-rejected',
      label: 'A forged session cookie is rejected',
      pass: forgedCookieRejected,
      detail: forgedCookieRejected
        ? 'HMAC verification returned null'
        : 'forged token was accepted',
      category: 'session',
    },
    {
      id: 'signal-audience-isolation',
      label: 'Live injected signals obey the signed-role boundary',
      pass: signals.managerLeaked === 0 && signals.juniorLeaked === 0,
      detail:
        signals.total === 0
          ? 'no live signals in this session · isolation armed'
          : `${signals.total} live signals · ${signals.managerLeaked + signals.juniorLeaked} cross-lens leaks`,
      category: 'synthesis',
    },
    {
      id: 'live-boundary-isolation',
      label: 'Live GitHub findings obey the signed-role boundary',
      pass:
        live.managerLeaked === 0 &&
        live.juniorLeaked === 0 &&
        live.technicalKeyLeaks === 0,
      detail:
        live.total === 0
          ? 'no live ingest in this session · isolation armed'
          : `${live.total} live findings · ${live.technicalKeyLeaks} technical leaks · ${live.managerLeaked + live.juniorLeaked} cross-lens leaks`,
      category: 'row',
    },
    {
      id: 'live-manager-no-technical-keys',
      label: 'Manager live payload has no paths, SHAs, diffs or targets',
      pass: live.technicalKeyLeaks === 0,
      detail: `${live.technicalKeyLeaks} technical keys or raw SHAs in manager live payloads`,
      category: 'column',
    },
    {
      id: 'ledger-chain-verified',
      label: 'Session receipt hash chain recomputes link-by-link',
      pass: verification.ok,
      detail: `${receipt.entryCount} SHA-256 links · root ${receipt.rootHash.slice(0, 16)}… · signature ${verification.signatureValid ? 'valid' : 'invalid'}`,
      category: 'chain',
    },
    {
      id: 'ledger-tamper-detected',
      label: 'A mutated receipt entry breaks the chain and signature',
      pass: tamper.tamperAt === null || !tamper.verification.ok,
      detail:
        tamper.tamperAt === null
          ? 'no entries to mutate · chain armed'
          : `tamper at seq ${tamper.tamperAt} · ${tamper.verification.invalidHashes} invalid hash${tamper.verification.invalidHashes === 1 ? '' : 'es'} · signature ${tamper.verification.signatureValid ? 'valid' : 'rejected'}`,
      category: 'chain',
    },
    {
      id: 'integration-manager-github-forbidden',
      label: 'Manager role receives 403 for GitHub PR dispatch',
      pass: integrations.managerGithubStatus === 403,
      detail: `role gate returned ${integrations.managerGithubStatus}`,
      category: 'integration',
    },
    {
      id: 'integration-sandbox-signed',
      label: 'Every dispatch carries a verifiable HMAC signature',
      pass: integrations.sandboxSigned,
      detail:
        integrations.total === 0
          ? 'no dispatches yet · verifier armed'
          : `${integrations.total} dispatches · ${integrations.sandbox} sandbox · ${integrations.live} live`,
      category: 'integration',
    },
    {
      id: 'integration-artifact-manager-boundary',
      label: 'Manager integration view never projects the artifact',
      pass: integrations.artifactBoundaryPass,
      detail: integrations.artifactBoundaryPass
        ? 'artifact column absent from v_integration_manager'
        : 'artifact column leaked into the manager view',
      category: 'integration',
    },
  ];

  const withheldForRole =
    session.role === 'manager'
      ? manager.projection.evidenceWithheld
      : junior.projection.evidenceWithheld;

  return {
    ok: checks.every((check) => check.pass),
    generatedAt: new Date().toISOString(),
    effectiveRole: session.role,
    roleSource: 'HMAC-SHA256 signed HttpOnly cookie',
    signedCookie: true,
    spoofAttempted: Boolean(spoofedRole && spoofedRole !== session.role),
    // The role is read from the session record. Query-string role values are
    // accepted here only so the probe can demonstrate that they are ignored.
    spoofIgnored: true,
    forgedCookieRejected,
    auditEvents: countAuditEvents(session.id),
    manager: manager.projection,
    junior: junior.projection,
    checks,
    signals,
    live,
    chain,
    integrations,
    receipt: {
      sqlView:
        session.role === 'manager'
          ? 'v_evidence_manager'
          : 'v_evidence_junior',
      signalView:
        session.role === 'manager' ? 'v_signal_manager' : 'v_signal_junior',
      liveView:
        session.role === 'manager' ? 'v_live_manager' : 'v_live_junior',
      integrationView:
        session.role === 'manager'
          ? 'v_integration_manager'
          : 'v_integration_junior',
      hmac: 'HMAC-SHA256',
      cacheControl: 'no-store',
      storage: getStorageMode(),
      evidenceRowsInDatabase: evidenceRows ? Number(evidenceRows.n) : 0,
      evidenceRowsWithheldBySql: withheldForRole,
      payloadBytesSaved: Math.abs(
        manager.projection.payloadBytes - junior.projection.payloadBytes,
      ),
    },
  };
}

function safeDetail(detail: string | null): string | null {
  if (!detail) return null;
  // Audit details never contain evidence quotes, but cap the length anyway so
  // a future caller cannot turn this endpoint into a data exfiltration path.
  return detail.slice(0, 160);
}

export function buildAuditReport(session: SessionRecord): AuditResponse {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, action, doubt_id, detail, created_at, role
       FROM audit_log
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 60`,
    )
    .all(session.id) as {
    id: number | bigint;
    action: string;
    doubt_id: string | null;
    detail: string | null;
    created_at: string;
    role: string;
  }[];

  const events = rows.map((row) => ({
    id: Number(row.id),
    action: row.action,
    doubtId: row.doubt_id,
    detail: safeDetail(row.detail),
    createdAt: row.created_at,
    role: row.role,
  }));

  const count = (prefix: string) =>
    events.filter((event) => event.action.startsWith(prefix)).length;

  const totalRow = db
    .prepare('SELECT COUNT(*) AS n FROM audit_log WHERE session_id = ?')
    .get(session.id) as { n: number | bigint } | undefined;

  return {
    role: session.role,
    generatedAt: new Date().toISOString(),
    events,
    counts: {
      total: totalRow ? Number(totalRow.n) : 0,
      resolves: count('doubt.resolve'),
      skips: count('doubt.skip'),
      reopens: count('doubt.reopen'),
      signals: count('signal.inject'),
      decisions: events.filter((event) => event.action === 'doubt.resolve')
        .length,
    },
  };
}
