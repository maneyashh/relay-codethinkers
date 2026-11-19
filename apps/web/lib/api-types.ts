import type {
  DecisionType,
  Doubt,
  Resolution,
  Role,
  VerificationState,
} from './triage-types';

export interface BoardProject {
  id: string;
  name: string;
  slug: string;
  handoverDate: string;
  status: string;
}

export interface BoardSession {
  id: string;
  role: Role;
  xp: number;
  streak: number;
  readiness: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface BoardMeta {
  generatedAt: string;
  doubts: number;
  sources: number;
  evidenceTotal: number;
  evidenceVisible: number;
  evidenceLocked: number;
  meanConfidence: number;
  readyForHandover: boolean;
  serverFiltered: true;
  storage: 'sqlite' | 'memory';
  sourceBreakdown: SourceBreakdown[];
  /** Live signals injected by this browser session. */
  injectedSignals: number;
  /** Signals that exist for this session but were withheld from this lens. */
  injectedSignalsLocked: number;
  /** Live GitHub findings attached to this session. */
  liveDoubts: number;
  /** Last live ingestion for this session, role-safe. */
  ingestion: IngestionSummary | null;
  /** Hash-chain receipt state for this session. */
  ledger: {
    entries: number;
    rootHash: string;
    signature: string;
    verified: boolean;
  };
  /** Session-scoped dispatches, including sandbox fallbacks. */
  integrations: {
    total: number;
    github: number;
    notion: number;
    lastMode: 'live' | 'sandbox' | null;
  };
  /** Verbatim provenance of the role filter in SQL. */
  projection: {
    role: Role;
    view: string;
    signalView: string;
    liveView: string;
    integrationView: string;
  };
}

/* ------------------------------------------------------------------ */
/* Round 3 · GitHub ingestion, integrations and receipts               */
/* ------------------------------------------------------------------ */

export type IngestionMode = 'live' | 'fallback';
export type IngestionSource = 'preset' | 'custom';
export type IntegrationTarget = 'github' | 'notion';
export type IntegrationMode = 'live' | 'sandbox';

export interface IngestionSummary {
  id: string;
  repo: string;
  fullName: string;
  ref: string;
  /** Omitted from the manager projection. */
  headSha?: string;
  mode: IngestionMode;
  source: IngestionSource;
  filesScanned: number;
  commitsRead: number;
  findings: number;
  createdAt: string;
  fallbackReason?: string;
}

export interface FindingPreview {
  id: string;
  title: string;
  claim: string;
  severity: string;
  kind: string;
  area: string;
  confidence: number;
}

export interface GitHubPreset {
  id: string;
  repo: string;
  label: string;
  detail: string;
}

export interface GitHubIngestRequest {
  repo?: string;
  presetId?: string;
  mode?: 'live';
}

export interface GitHubIngestResponse extends BoardResponse {
  ingestion: IngestionSummary;
  findings: FindingPreview[];
  liveDoubts: number;
}

export interface WebhookSimulationRequest {
  event: 'push' | 'pull_request';
  repo?: string;
  presetId?: string;
}

export interface WebhookResponse extends BoardResponse {
  verified: true;
  event: string;
  signature: string;
  deliveryId: string;
  action: string;
  doubtsCreated: number;
  duplicate: boolean;
  liveDoubts: number;
}

export interface IntegrationRecord {
  id: string;
  target: IntegrationTarget;
  mode: IntegrationMode;
  status: 'dispatched' | 'failed';
  reference: string;
  url?: string;
  signature: string;
  artifactSha256: string;
  createdAt: string;
  detail?: string;
}

export interface IntegrationArtifactPreview {
  title: string;
  markdown: string;
  bytes: number;
  patchBytes: number;
}

export interface IntegrationDispatchResponse {
  ok: true;
  integration: IntegrationRecord;
  artifact: IntegrationArtifactPreview | null;
  ledger: {
    entries: number;
    rootHash: string;
    signature: string;
  };
}

export interface IntegrationListResponse {
  generatedAt: string;
  role: Role;
  integrations: IntegrationRecord[];
  counts: {
    total: number;
    github: number;
    notion: number;
    live: number;
    sandbox: number;
  };
  capabilities: {
    githubDispatchRole: 'junior';
    managerGithubForbidden: true;
    notionRoles: Role[];
    liveGithub: boolean;
    liveNotion: boolean;
  };
}

export interface LedgerEntryView {
  seq: number;
  kind: string;
  doubtId: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface RelayReceipt {
  artifact: 'relay-handover-receipt';
  version: 1;
  algorithm: 'SHA-256';
  chainFormula: string;
  sessionRef: string;
  entryCount: number;
  genesisHash: string;
  rootHash: string;
  signature: string;
  signatureAlgorithm: 'HMAC-SHA256';
  generatedAt: string;
  entries: LedgerEntryView[];
}

export interface ReceiptVerification {
  ok: boolean;
  entryCount: number;
  rootHash: string;
  genesisHash: string;
  checkedHashes: number;
  invalidHashes: number;
  brokenAt: number | null;
  signatureValid: boolean;
  signature: string;
  detail: string;
}

export interface ReceiptTamperReport {
  tamperAt: number | null;
  field: string | null;
  verification: ReceiptVerification;
  expectedRootHash: string;
  tamperedRootHash: string;
}

export interface ReceiptResponse {
  receipt: RelayReceipt;
  verification: ReceiptVerification;
  tamper: ReceiptTamperReport | null;
  ledger: {
    entries: number;
    rootHash: string;
    signature: string;
    verified: boolean;
  };
}

export interface TriageBoard {
  project: BoardProject;
  session: BoardSession;
  meta: BoardMeta;
  doubts: Doubt[];
}

export interface BoardResponse {
  board: TriageBoard;
  reward?: { key: number; amount: number } | null;
}

export interface SynthesisResult {
  doubtId: string;
  baseConfidence: number;
  confidence: number;
  delta: number;
  injectedCount: number;
  formula: string;
  visibleToRole: boolean;
}

export interface SignalInput {
  doubtId: string;
  source: string;
  author: string;
  quote: string;
  audience: 'all' | 'manager' | 'junior';
  polarity: 'supports' | 'contradicts' | 'context';
  relevance: number;
  channel?: string;
  filePath?: string;
  commit?: string;
}

export interface SignalResponse extends BoardResponse {
  synthesis: SynthesisResult;
  signal: {
    id: string;
    doubtId: string;
    audience: 'all' | 'manager' | 'junior';
    createdAt: string;
  };
  signalsUsed: number;
  signalsRemaining: number;
}

export interface DecisionInput {
  decisionType?: DecisionType;
  rationale?: string;
  owner?: string;
  signoffName?: string;
  signedOff?: boolean;
}

export interface SecurityProjection {
  role: Role;
  evidenceDelivered: number;
  evidenceWithheld: number;
  filePathKeys: number;
  commitKeys: number;
  implementationObjects: number;
  impactObjects: number;
  redactedKeys: number;
  restrictedValueLeaked: boolean;
  payloadBytes: number;
}

export type SecurityCategory =
  | 'row'
  | 'column'
  | 'session'
  | 'synthesis'
  | 'chain'
  | 'integration';

export interface SecurityCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  category: SecurityCategory;
}

export interface SignalBoundary {
  total: number;
  managerVisible: number;
  juniorVisible: number;
  managerLeaked: number;
  juniorLeaked: number;
}

export interface SecurityReport {
  ok: boolean;
  generatedAt: string;
  effectiveRole: Role;
  roleSource: string;
  signedCookie: boolean;
  spoofAttempted: boolean;
  spoofIgnored: boolean;
  forgedCookieRejected: boolean;
  auditEvents: number;
  manager: SecurityProjection;
  junior: SecurityProjection;
  checks: SecurityCheck[];
  signals: SignalBoundary;
  /** Live GitHub findings obey the same signed-role boundary. */
  live: {
    total: number;
    managerVisible: number;
    juniorVisible: number;
    managerLeaked: number;
    juniorLeaked: number;
    technicalKeyLeaks: number;
  };
  /** SHA-256 hash-chain and signed receipt state. */
  chain: {
    entries: number;
    rootHash: string;
    signature: string;
    verified: boolean;
    invalidHashes: number;
    brokenAt: number | null;
    signatureValid: boolean;
    tamperDetected: boolean;
  };
  /** Dispatch role gate and sandbox signing state. */
  integrations: {
    total: number;
    github: number;
    notion: number;
    live: number;
    sandbox: number;
    managerGithubStatus: number;
    sandboxSigned: boolean;
    artifactBoundaryPass: boolean;
  };
  /** Human-readable facts that make the boundary inspectable on screen. */
  receipt: {
    sqlView: string;
    signalView: string;
    liveView: string;
    integrationView: string;
    hmac: 'HMAC-SHA256';
    cacheControl: 'no-store';
    storage: 'sqlite' | 'memory';
    evidenceRowsInDatabase: number;
    evidenceRowsWithheldBySql: number;
    payloadBytesSaved: number;
  };
}

export interface AuditEvent {
  id: number;
  action: string;
  doubtId: string | null;
  detail: string | null;
  createdAt: string;
  role: string;
}

export interface AuditResponse {
  role: Role;
  generatedAt: string;
  events: AuditEvent[];
  counts: {
    total: number;
    resolves: number;
    skips: number;
    reopens: number;
    signals: number;
    decisions: number;
  };
}

export interface PatchPreview {
  file: string;
  language: string;
  diff: string;
}

export interface RemediationStep {
  id: string;
  title: string;
  detail: string;
}

export interface RemediationPackage {
  doubtId: string;
  title: string;
  area: string;
  severity: string;
  role: Role;
  allowed: boolean;
  reason?: string;
  patch?: PatchPreview;
  verification?: {
    command: string;
    expect: string;
    note: string;
  };
  rollback?: string[];
  day1?: RemediationStep[];
  managerChecklist?: string[];
}

export interface RemediationResponse {
  generatedAt: string;
  role: Role;
  packages: RemediationPackage[];
}

export interface FastForwardResponse extends BoardResponse {
  fastForwarded: number;
  resolutionMap: { doubtId: string; resolutionId: Resolution['id'] }[];
}

export type { DecisionType, VerificationState };
