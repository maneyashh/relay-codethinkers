export type DoubtKind = 'hard_contradiction' | 'missing_info';
export type Severity = 'critical' | 'high' | 'medium';
export type DoubtStatus = 'open' | 'resolved' | 'skipped';
export type EvidenceSource =
  | 'slack'
  | 'github'
  | 'notion'
  | 'jira'
  | 'code'
  | 'email';
export type Role = 'manager' | 'junior';
export type EvidencePolarity = 'supports' | 'contradicts' | 'context';
export type AppView = 'landing' | 'ingesting' | 'triage' | 'complete';

/**
 * How a human closed a doubt. `standard` is the keyboard 1/2/3 path;
 * `auto` is the explicitly-labelled judge accelerator.
 */
export type DecisionType =
  | 'standard'
  | 'confirm_blocker'
  | 'accept_risk'
  | 'escalate'
  | 'verify'
  | 'auto';

export type VerificationState = 'pending' | 'verified' | 'waived';

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  junior: 'Junior Dev',
};

export interface Evidence {
  id: string;
  source: EvidenceSource;
  author: string;
  timestamp: string; // ISO 8601
  quote: string;
  redacted?: string; // sensitive span, only ever delivered to the developer lens
  url?: string;
  /** Which lens is allowed to inspect this source. Defaults to everyone. */
  audience?: Role | 'all';
  /** How this source relates to the doubt's main assertion. */
  polarity?: EvidencePolarity;
  /** 0..1 confidence in this source's relevance to the claim. */
  relevance?: number;
  /** Technical targets, only shown in the developer lens. */
  filePath?: string;
  commit?: string;
  channel?: string;
  /** True when a judge injected this signal during the live demo. */
  injected?: boolean;
  /** Session-scoped signal id when `injected` is true. */
  signalId?: string;
}

export interface Resolution {
  id: 1 | 2 | 3;
  label: string;
  description: string;
}

export interface DoubtImplementation {
  owner: string;
  repo: string;
  branch: string;
  pr: string;
  files: string[];
}

export interface DoubtImpact {
  budget: string;
  timeline: string;
  risk: string;
}

export interface DoubtDecision {
  type: DecisionType;
  rationale?: string;
  owner?: string;
  signedOff: boolean;
  signoffName?: string;
  verification: VerificationState;
  updatedAt: string;
}

export interface DoubtSynthesis {
  baseConfidence: number;
  confidence: number;
  delta: number;
  injectedCount: number;
  /** Human-readable deterministic derivation shown in the UI. */
  formula: string;
}

export interface Doubt {
  id: string;
  kind: DoubtKind;
  severity: Severity;
  title: string;
  claim: string;
  area: string; // e.g. "auth-service"
  confidence: number; // 0..1, engine confidence that this is a real doubt
  engineHint: string;
  evidence: Evidence[];
  resolutions: Resolution[];
  status: DoubtStatus;
  resolvedWith?: Resolution['id'];
  /**
   * Manager lens: why this matters commercially. The API omits this object
   * entirely for the developer role.
   */
  impact?: DoubtImpact;
  /**
   * Developer lens: where the work actually lands. The API omits this object
   * entirely for the manager role, so repo/branch/PR/file targets never reach
   * a manager browser session.
   */
  implementation?: DoubtImplementation;
  /** Rows that exist in the DB but were withheld from this lens by SQL. */
  lockedEvidence?: number;
  /** The human decision attached to this doubt, if one was made. */
  decision?: DoubtDecision;
  /** Deterministic confidence synthesis, including live injected signals. */
  synthesis?: DoubtSynthesis;
}

export interface Reward {
  key: number;
  amount: number;
}
