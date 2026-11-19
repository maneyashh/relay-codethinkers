import type {
  DoubtImpact,
  DoubtKind,
  EvidencePolarity,
  Resolution,
  Severity,
} from './triage-types';

/** A repository snapshot fetched from the real, unauthenticated GitHub API. */
export interface GithubSnapshot {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  license: string | null;
  headSha: string;
  headCommittedAt: string;
  fetchedAt: string;
  /** Every path in the recursive tree. */
  paths: string[];
  /** A bounded set of files fetched from raw.githubusercontent.com. */
  files: Record<string, string>;
  commits: SnapshotCommit[];
  truncated: boolean;
  /** Set only when the live API was unreachable and the fixture was replayed. */
  fallbackReason?: string;
}

export interface SnapshotCommit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export interface GithubEvidenceDraft {
  id: string;
  author: string;
  timestamp: string;
  /** Full technical quote for the developer projection. */
  quote: string;
  /** Commercial paraphrase that never contains paths, SHAs or URLs. */
  managerQuote: string;
  filePath?: string;
  commit?: string;
  url?: string;
  diff?: string;
  polarity: EvidencePolarity;
  relevance: number;
}

export interface GithubFinding {
  id: string;
  slug: string;
  origin: 'github' | 'webhook';
  kind: DoubtKind;
  severity: Severity;
  area: string;
  title: string;
  /** Technical statement for the developer projection. */
  claim: string;
  /** Commercial statement for the manager projection. */
  managerClaim: string;
  confidence: number;
  engineHint: string;
  managerEngineHint: string;
  evidence: GithubEvidenceDraft[];
  resolutions: Resolution[];
  managerResolutions: Resolution[];
  recommended: Resolution['id'];
  impact: DoubtImpact;
  files: string[];
  repo: string;
  ref: string;
  headSha: string;
  sourceUrl: string;
}

export interface GithubPreset {
  id: string;
  repo: string;
  label: string;
  detail: string;
  /** Championship preset: rendered with a gold self-scan badge. */
  tagline?: string;
  featured?: boolean;
}

/** The live hackathon repository, promoted as the #1 featured preset. */
export const SELF_SCAN_REPO = 'maneyashh/relay-codethinkers';
export const SELF_SCAN_PRESET_ID = 'relay';

export const GITHUB_PRESETS: GithubPreset[] = [
  {
    id: SELF_SCAN_PRESET_ID,
    repo: SELF_SCAN_REPO,
    label: '★ maneyashh/relay-codethinkers',
    detail: 'self-scan handover surface',
    tagline: 'Our Live Hackathon Repo · Self-Scan Handover & Drift Surface',
    featured: true,
  },
  {
    id: 'express',
    repo: 'expressjs/express',
    label: 'Express',
    detail: 'runtime + release drift',
  },
  {
    id: 'hono',
    repo: 'honojs/hono',
    label: 'Hono',
    detail: 'multi-runtime contract',
  },
  {
    id: 'koa',
    repo: 'koajs/koa',
    label: 'Koa',
    detail: 'security + CI evidence',
  },
  {
    id: 'chalk',
    repo: 'chalk/chalk',
    label: 'Chalk',
    detail: 'release ownership',
  },
  {
    id: 'is',
    repo: 'sindresorhus/is',
    label: 'is',
    detail: 'small surface, fast scan',
  },
  {
    id: 'fastify',
    repo: 'fastify/fastify',
    label: 'Fastify',
    detail: 'large handover surface',
  },
];
