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
  /** Verbatim provenance of the role filter in SQL. */
  projection: {
    role: Role;
    view: string;
    signalView: string;
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

export interface SecurityCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  category: 'row' | 'column' | 'session' | 'synthesis';
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
  /** Human-readable facts that make the boundary inspectable on screen. */
  receipt: {
    sqlView: string;
    signalView: string;
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
