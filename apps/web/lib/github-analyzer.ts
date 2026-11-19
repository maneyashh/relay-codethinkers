import { createHash } from 'node:crypto';

import type {
  DoubtImpact,
  DoubtKind,
  Resolution,
  Severity,
} from './triage-types';
import type {
  GithubEvidenceDraft,
  GithubFinding,
  GithubSnapshot,
} from './github-types';

/**
 * Deterministic GitHub drift analyzer.
 *
 * There is no model call and no randomness. The same snapshot always produces
 * the same finding ids, ordering, confidence and evidence. Every finding is
 * built from real file lines, real commit SHAs and real raw.githubusercontent
 * content. Manager projections are written separately and never inherit the
 * technical quote, file path, commit SHA, URL or diff.
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const MAX_FINDINGS = 8;
const MAX_QUOTE = 260;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function shortDigest(value: string, length = 12): string {
  return digest(value).slice(0, length);
}

function clean(value: string, max = MAX_QUOTE): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function lineWith(
  content: string,
  pattern: RegExp,
): { line: string; index: number } | null {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      return { line: lines[index], index };
    }
  }
  return null;
}

function firstFile(
  snapshot: GithubSnapshot,
  pattern: RegExp,
): { path: string; content: string } | null {
  for (const path of Object.keys(snapshot.files)) {
    if (pattern.test(path)) {
      return { path, content: snapshot.files[path] };
    }
  }
  return null;
}

function hasPath(snapshot: GithubSnapshot, pattern: RegExp): boolean {
  return snapshot.paths.some((path) => pattern.test(path));
}

function blobUrl(snapshot: GithubSnapshot, path: string): string {
  return `${snapshot.htmlUrl}/blob/${snapshot.headSha}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function evidenceBase(snapshot: GithubSnapshot): {
  author: string;
  timestamp: string;
  commit: string;
} {
  return {
    author: snapshot.commits[0]?.author ?? `${snapshot.owner} maintainers`,
    timestamp: snapshot.headCommittedAt,
    commit: snapshot.headSha,
  };
}

type EvidenceDraftInput = Omit<
  GithubEvidenceDraft,
  'id' | 'author' | 'timestamp' | 'commit'
> & {
  author?: string;
  timestamp?: string;
  commit?: string;
};

function evidence(
  snapshot: GithubSnapshot,
  findingId: string,
  index: number,
  input: EvidenceDraftInput,
): GithubEvidenceDraft {
  const base = evidenceBase(snapshot);
  return {
    id: `ev-${findingId}-${index + 1}`,
    author: input.author ?? base.author,
    timestamp: input.timestamp ?? base.timestamp,
    commit: input.commit ?? base.commit,
    quote: clean(input.quote),
    managerQuote: clean(input.managerQuote),
    filePath: input.filePath,
    url: input.url,
    diff: input.diff,
    polarity: input.polarity,
    relevance: input.relevance,
  };
}

interface ResolutionPair {
  resolutions: Resolution[];
  managerResolutions: Resolution[];
  recommended: Resolution['id'];
}

function resolutionsFor(
  kind: DoubtKind,
  technical: string,
  commercial: string,
): ResolutionPair {
  if (kind === 'missing_info') {
    return {
      resolutions: [
        {
          id: 1,
          label: 'Create the missing artifact',
          description: `Land ${technical} with an owner and a verification command before launch.`,
        },
        {
          id: 2,
          label: 'Assign a time-boxed owner',
          description:
            'Name one accountable person and attach a date. No shared ownership.',
        },
        {
          id: 3,
          label: 'Accept the gap with a waiver',
          description:
            'Record the residual risk and who signed it off. Relay keeps the waiver in the receipt.',
        },
      ],
      managerResolutions: [
        {
          id: 1,
          label: 'Fund the missing control',
          description: `Approve ${commercial} before the handover date.`,
        },
        {
          id: 2,
          label: 'Name one accountable owner',
          description:
            'Assign a single executive owner and a deadline for the gap.',
        },
        {
          id: 3,
          label: 'Accept and document the risk',
          description:
            'Sign a time-boxed waiver so the decision survives the handover.',
        },
      ],
      recommended: 1,
    };
  }

  return {
    resolutions: [
      {
        id: 1,
        label: 'Make the code canonical',
        description: `Resolve the contradiction by aligning the docs and CI to the shipped behaviour. ${technical}`,
      },
      {
        id: 2,
        label: 'Escalate to the owning team',
        description:
          'Freeze the affected surface and hand the contradiction to the team that owns it.',
      },
      {
        id: 3,
        label: 'Accept the risk explicitly',
        description: `Ship anyway with a named sign-off and a rollback path. ${technical}`,
      },
    ],
    managerResolutions: [
      {
        id: 1,
        label: 'Ratify the shipped behaviour',
        description: `Approve the canonical path and retire the conflicting instruction. ${commercial}`,
      },
      {
        id: 2,
        label: 'Escalate before launch',
        description:
          'Hold the launch gate until the owning team resolves the contradiction.',
      },
      {
        id: 3,
        label: 'Accept with a named sign-off',
        description: `Accept the exposure with a written owner. ${commercial}`,
      },
    ],
    recommended: 1,
  };
}

interface FindingInput {
  slug: string;
  kind: DoubtKind;
  severity: Severity;
  area: string;
  title: string;
  claim: string;
  managerClaim: string;
  confidence: number;
  engineHint: string;
  managerEngineHint: string;
  impact: DoubtImpact;
  evidence: EvidenceDraftInput[];
  files: string[];
  technicalResolution: string;
  commercialResolution: string;
}

function buildFinding(
  snapshot: GithubSnapshot,
  input: FindingInput,
): GithubFinding {
  const id = `live-gh-${shortDigest(
    `${snapshot.fullName}@${snapshot.headSha}:${input.slug}`,
  )}`;
  const resolution = resolutionsFor(
    input.kind,
    input.technicalResolution,
    input.commercialResolution,
  );

  return {
    id,
    slug: input.slug,
    origin: 'github',
    kind: input.kind,
    severity: input.severity,
    area: input.area,
    title: input.title,
    claim: input.claim,
    managerClaim: input.managerClaim,
    confidence: input.confidence,
    engineHint: input.engineHint,
    managerEngineHint: input.managerEngineHint,
    evidence: input.evidence.map((item, index) =>
      evidence(snapshot, id, index, item),
    ),
    resolutions: resolution.resolutions,
    managerResolutions: resolution.managerResolutions,
    recommended: resolution.recommended,
    impact: input.impact,
    files: input.files,
    repo: snapshot.fullName,
    ref: snapshot.defaultBranch,
    headSha: snapshot.headSha,
    sourceUrl: snapshot.htmlUrl,
  };
}

function parseNodeVersion(value: string): number | null {
  const match = value.match(/(\d{1,2})/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 10 && parsed <= 40 ? parsed : null;
}

function nodeRuntimeFinding(
  snapshot: GithubSnapshot,
): GithubFinding | null {
  const declarations: {
    path: string;
    major: number;
    line: string;
    label: string;
  }[] = [];

  const packageJson = snapshot.files['package.json'];
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        engines?: { node?: string };
      };
      const declared = parsed.engines?.node;
      const major = declared ? parseNodeVersion(declared) : null;
      if (declared && major) {
        declarations.push({
          path: 'package.json',
          major,
          line: lineWith(packageJson, /"node"/)?.line ?? `"node": "${declared}"`,
          label: `package.json engines.node ${declared}`,
        });
      }
    } catch {
      // Ignore a malformed manifest. Another check may still surface it.
    }
  }

  for (const path of ['.nvmrc', '.node-version']) {
    const content = snapshot.files[path];
    if (!content) continue;
    const major = parseNodeVersion(content);
    if (major) {
      declarations.push({
        path,
        major,
        line: content.split(/\r?\n/)[0] ?? content,
        label: `${path} pins Node ${major}`,
      });
    }
  }

  for (const path of Object.keys(snapshot.files)) {
    if (!/(^|\/)(Dockerfile|dockerfile)(\.|$)/.test(path)) continue;
    const content = snapshot.files[path];
    const match = lineWith(content, /FROM\s+node:/i);
    if (!match) continue;
    const major = parseNodeVersion(match.line.split('node:')[1] ?? '');
    if (major) {
      declarations.push({
        path,
        major,
        line: match.line,
        label: `${path} builds on Node ${major}`,
      });
    }
  }

  for (const path of Object.keys(snapshot.files)) {
    if (!/^\.github\/workflows\/.+\.ya?ml$/.test(path)) continue;
    const content = snapshot.files[path];
    const match = lineWith(content, /node-version\s*:/i);
    if (!match) continue;
    const major = parseNodeVersion(match.line.split(':').slice(1).join(':'));
    if (major) {
      declarations.push({
        path,
        major,
        line: match.line,
        label: `${path} runs Node ${major}`,
      });
    }
  }

  const unique = [...new Set(declarations.map((item) => item.major))];
  if (unique.length < 2) return null;

  const first = declarations[0];
  const second = declarations.find((item) => item.major !== first.major);
  if (!second) return null;

  const versions = unique.sort((a, b) => a - b).join(' / ');
  const diff = `--- a/${first.path}
+++ b/${first.path}
@@ -1,1 +1,1 @@
-${first.line.trim()}
+${first.line.trim().replace(String(first.major), String(second.major))}`;

  return buildFinding(snapshot, {
    slug: 'node-runtime-drift',
    kind: 'hard_contradiction',
    severity: Math.abs(first.major - second.major) >= 2 ? 'high' : 'medium',
    area: 'runtime',
    title: `Node runtime drift: ${versions}`,
    claim: `The repository declares Node ${versions} in different places. ${first.label}; ${second.label}.`,
    managerClaim: `The documentation, CI and deployment path disagree on the supported Node runtime (${versions}). Builds may fail or deploy to a runtime nobody signed off.`,
    confidence: 0.93,
    engineHint:
      'Relay parsed engines.node, version files, Dockerfiles and every CI workflow. It found more than one major runtime declaration.',
    managerEngineHint:
      'Deterministic cross-reference of runtime declarations across documentation, CI and deployment config.',
    impact: {
      budget: 'Low direct cost · failed builds and release slips',
      timeline: '1–2 days to align, plus one release cycle',
      risk: 'A cold-starting successor cannot tell which runtime is supported',
    },
    evidence: declarations.slice(0, 4).map((item, index) => ({
      quote: item.line,
      managerQuote: `Runtime declaration ${index + 1}: Node ${item.major}.`,
      filePath: item.path,
      url: blobUrl(snapshot, item.path),
      polarity: 'contradicts',
      relevance: index === 0 || item === second ? 0.95 : 0.78,
      diff: index === 0 ? diff : undefined,
    })),
    files: declarations.map((item) => item.path),
    technicalResolution: `Pin Node ${second.major} in package.json, .nvmrc, the Dockerfile and every workflow in one PR.`,
    commercialResolution: `Approve Node ${second.major} as the single supported runtime and fund the CI guard.`,
  });
}

function datastoreFinding(snapshot: GithubSnapshot): GithubFinding | null {
  const providers = {
    firebase: [] as { path: string; line: string }[],
    supabase: [] as { path: string; line: string }[],
  };

  for (const [path, content] of Object.entries(snapshot.files)) {
    if (/\.(md|json|lock|svg|png|jpg|gif)$/i.test(path)) continue;
    const firebase = lineWith(
      content,
      /(from\s+['"]firebase|firebase-admin|firestore\s*\(|FIREBASE_)/i,
    );
    if (firebase) providers.firebase.push({ path, line: firebase.line });
    const supabase = lineWith(
      content,
      /(from\s+['"]@supabase|createClient\s*\(|SUPABASE_)/i,
    );
    if (supabase) providers.supabase.push({ path, line: supabase.line });
  }

  const firebaseFiles = new Set(providers.firebase.map((item) => item.path));
  const supabaseFiles = new Set(providers.supabase.map((item) => item.path));
  const distinctFiles = new Set([...firebaseFiles, ...supabaseFiles]);

  if (
    firebaseFiles.size === 0 ||
    supabaseFiles.size === 0 ||
    distinctFiles.size < 2
  ) {
    return null;
  }

  const firebase = providers.firebase[0];
  const supabase = providers.supabase[0];
  const diff = `--- a/${firebase.path}
+++ b/${firebase.path}
@@ -1,1 +1,1 @@
-${firebase.line.trim()}
+${firebase.line.trim()} // ADR: one canonical datastore only`;

  return buildFinding(snapshot, {
    slug: 'datastore-contradiction',
    kind: 'hard_contradiction',
    severity: 'critical',
    area: 'data-layer',
    title: 'Two datastore providers are live',
    claim: `Different modules configure different datastores (${firebase.path} and ${supabase.path}). The source of truth is ambiguous.`,
    managerClaim:
      'Two datastore providers are configured in different modules. The team cannot prove which system holds the authoritative record.',
    confidence: 0.96,
    engineHint:
      'Relay found live client initialisation for more than one datastore provider in different files.',
    managerEngineHint:
      'Deterministic import and client-initialisation scan across the repository.',
    impact: {
      budget: 'High · duplicate storage and migration cost',
      timeline: '1–2 weeks to consolidate',
      risk: 'Data loss or compliance exposure if the wrong store is decommissioned',
    },
    evidence: [
      {
        quote: firebase.line,
        managerQuote: 'One module initialises a first datastore provider.',
        filePath: firebase.path,
        url: blobUrl(snapshot, firebase.path),
        polarity: 'context',
        relevance: 0.87,
        diff,
      },
      {
        quote: supabase.line,
        managerQuote: 'A different module initialises a second datastore provider.',
        filePath: supabase.path,
        url: blobUrl(snapshot, supabase.path),
        polarity: 'contradicts',
        relevance: 0.97,
      },
    ],
    files: [...distinctFiles],
    technicalResolution:
      'Choose one provider, remove the other client, and add an ADR that makes the canonical store impossible to misread.',
    commercialResolution:
      'Ratify one canonical datastore and retire the duplicate spend line.',
  });
}

function secretFinding(snapshot: GithubSnapshot): GithubFinding | null {
  const secretPattern =
    /\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]{8,})["'`]/i;
  const ignore =
    /(process\.env|import\.meta\.env|os\.environ|getenv\(|example|placeholder|changeme|your[_-]|x{4,}|\*{3,}|<[^>]+>)/i;

  for (const [path, content] of Object.entries(snapshot.files)) {
    if (/\.(md|lock|json|svg|png|jpg|gif)$/i.test(path)) continue;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (ignore.test(line)) continue;
      const match = line.match(secretPattern);
      if (!match) continue;
      const value = match[2];
      const masked = `${value.slice(0, 2)}${'•'.repeat(
        Math.min(8, Math.max(4, value.length - 4)),
      )}${value.slice(-2)}`;
      return buildFinding(snapshot, {
        slug: 'committed-credential',
        kind: 'hard_contradiction',
        severity: 'critical',
        area: 'secrets',
        title: 'A credential literal is committed',
        claim: `A credential-shaped literal is assigned in ${path}:${index + 1}. It must come from a secret manager, not source control.`,
        managerClaim:
          'A credential-shaped literal is committed in source control. This is a potential security incident until rotation is proven.',
        confidence: 0.98,
        engineHint:
          'Relay matched a credential assignment with a literal value and rejected environment lookups and placeholders.',
        managerEngineHint:
          'Deterministic secret-pattern scan with environment and placeholder exclusions.',
        impact: {
          budget: 'Incident response and credential rotation',
          timeline: 'Rotate within 24–48 hours',
          risk: 'Production access may already be exposed in git history',
        },
        evidence: [
          {
            quote: line.replace(value, masked),
            managerQuote:
              'A committed literal matches the shape of a database credential or API key.',
            filePath: path,
            url: blobUrl(snapshot, path),
            polarity: 'contradicts',
            relevance: 0.99,
            diff: `--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
-${line.trim().replace(value, masked)}
+${match[1].toUpperCase().replace(/[^A-Z0-9]/g, '_')} = getSecret('relay/prod/${match[1]}')`,
          },
        ],
        files: [path],
        technicalResolution:
          'Rotate the credential first, move it to KMS/secret manager, and purge the value from git history.',
        commercialResolution:
          'Open a security incident and fund the rotation and history rewrite.',
      });
    }
  }
  return null;
}

function retryFinding(snapshot: GithubSnapshot): GithubFinding | null {
  const code = firstFile(snapshot, /(webhook|retry|billing).+\.(ts|js|py|go|rb)$/i);
  if (!code) return null;
  const codeLine = lineWith(code.content, /MAX_RETRIES\s*[:=]\s*(\d+)/i);
  if (!codeLine) return null;
  const codeMatch = codeLine.line.match(/MAX_RETRIES\s*[:=]\s*(\d+)/i);
  const codeValue = codeMatch ? Number(codeMatch[1]) : null;
  if (!codeValue) return null;

  const doc = firstFile(snapshot, /(runbook|billing|retry|webhook|docs\/).+\.md$/i);
  if (!doc) return null;

  const docLines = doc.content.split(/\r?\n/);
  for (const line of docLines) {
    if (!/retr/i.test(line)) continue;
    const numbers = line.match(/\b(\d{1,2})\b/g)?.map(Number) ?? [];
    const documented = numbers.find((value) => value >= 2 && value <= 10);
    if (!documented || documented === codeValue) continue;

    return buildFinding(snapshot, {
      slug: 'retry-policy-drift',
      kind: 'hard_contradiction',
      severity: 'high',
      area: 'billing',
      title: `Retry policy drift: ${codeValue} vs ${documented}`,
      claim: `${code.path} retries ${codeValue} times; ${doc.path} documents ${documented}. Silent exhaustion is the failure mode.`,
      managerClaim: `The billing retry implementation and the written runbook disagree (${codeValue} vs ${documented} attempts). Revenue recovery may stop earlier than promised.`,
      confidence: 0.91,
      engineHint:
        'Relay compared MAX_RETRIES in the handler with the retry count in the runbook.',
      managerEngineHint:
        'Deterministic code-to-document comparison for the billing retry contract.',
      impact: {
        budget: 'Revenue leak on failed renewals',
        timeline: 'Same release cycle',
        risk: 'Customers go dark after the final silent retry',
      },
      evidence: [
        {
          quote: codeLine.line,
          managerQuote: `The implementation retries ${codeValue} times.`,
          filePath: code.path,
          url: blobUrl(snapshot, code.path),
          polarity: 'context',
          relevance: 0.9,
          diff: `--- a/${code.path}
+++ b/${code.path}
@@ -1,1 +1,1 @@
-${codeLine.line.trim()}
+const MAX_RETRIES = ${documented}; // alignment with ${doc.path}`,
        },
        {
          quote: line,
          managerQuote: `The runbook promises ${documented} attempts.`,
          filePath: doc.path,
          url: blobUrl(snapshot, doc.path),
          polarity: 'contradicts',
          relevance: 0.96,
        },
      ],
      files: [code.path, doc.path],
      technicalResolution: `Set MAX_RETRIES to ${documented} and add a test that fails when code and runbook drift.`,
      commercialResolution:
        'Sign off the corrected retry policy with finance and track failed-renewal recovery.',
    });
  }
  return null;
}

function commitChurnFinding(snapshot: GithubSnapshot): GithubFinding | null {
  const risky = snapshot.commits.filter((commit) =>
    /\b(revert|hotfix|rollback|disable|temporar|quick fix|workaround)\b/i.test(
      commit.message,
    ),
  );
  if (risky.length === 0) return null;

  return buildFinding(snapshot, {
    slug: 'commit-churn',
    kind: 'hard_contradiction',
    severity: 'high',
    area: 'release',
    title: 'Recent commits signal rollback churn',
    claim: `${risky.length} of the last ${snapshot.commits.length} commits describe a revert, hotfix, disable or temporary workaround.`,
    managerClaim:
      'Recent history contains reverts or emergency patches. The shipped behaviour is moving faster than the written contract.',
    confidence: 0.86,
    engineHint:
      'Relay classified the real commit messages returned by the GitHub API.',
    managerEngineHint:
      'Deterministic classification of the latest commit messages.',
    impact: {
      budget: 'Unplanned release work',
      timeline: 'Immediate · before the handover',
      risk: 'A cold successor inherits an undocumented workaround',
    },
    evidence: risky.slice(0, 3).map((commit, index) => ({
      quote: `${commit.sha.slice(0, 7)} · ${commit.message}`,
      managerQuote: `Emergency-style change ${index + 1} in the latest history.`,
      author: commit.author,
      timestamp: commit.date,
      commit: commit.sha,
      url: `${snapshot.htmlUrl}/commit/${commit.sha}`,
      polarity: 'context',
      relevance: index === 0 ? 0.88 : 0.74,
    })),
    files: [],
    technicalResolution:
      'Document each revert or workaround in the handover record and add a regression test before the next deploy.',
    commercialResolution:
      'Freeze the release gate until the emergency changes are explained and owned.',
  });
}

function missingTestsFinding(snapshot: GithubSnapshot): GithubFinding | null {
  const packageJson = snapshot.files['package.json'];
  if (!packageJson) return null;
  let testScript: string | null = null;
  try {
    const parsed = JSON.parse(packageJson) as {
      scripts?: Record<string, string>;
    };
    testScript = parsed.scripts?.test ?? null;
  } catch {
    return null;
  }
  if (!testScript) return null;

  const hasTests = hasPath(
    snapshot,
    /(^|\/)(__tests__|test|tests|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/i,
  );
  if (hasTests) return null;

  const line =
    lineWith(packageJson, /"test"\s*:/)?.line ?? `"test": "${testScript}"`;
  return buildFinding(snapshot, {
    slug: 'missing-tests',
    kind: 'missing_info',
    severity: 'medium',
    area: 'quality',
    title: 'A test command exists, but no tests do',
    claim: `package.json declares \`${testScript}\`, yet the tree contains no test or spec files.`,
    managerClaim:
      'The project advertises an automated test command but ships no automated tests. Quality evidence is missing for the handover.',
    confidence: 0.9,
    engineHint:
      'Relay compared the package test script with the recursive tree for test and spec paths.',
    managerEngineHint:
      'Deterministic manifest-to-tree comparison for automated quality evidence.',
    impact: {
      budget: 'Quality debt carried into the new team',
      timeline: 'Add a smoke suite in the first sprint',
      risk: 'Regressions land silently after the handover',
    },
    evidence: [
      {
        quote: line,
        managerQuote: 'The manifest declares an automated test command.',
        filePath: 'package.json',
        url: blobUrl(snapshot, 'package.json'),
        polarity: 'contradicts',
        relevance: 0.9,
        diff: `--- /dev/null
+++ b/tests/smoke.test.ts
@@ -0,0 +1,5 @@
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+
+test('handover smoke', () => assert.equal(1, 1));`,
      },
    ],
    files: ['package.json'],
    technicalResolution: 'a smoke test suite',
    commercialResolution: 'automated quality evidence',
  });
}

function missingArtifactFinding(
  snapshot: GithubSnapshot,
  input: {
    slug: string;
    title: string;
    claim: string;
    managerClaim: string;
    area: string;
    severity?: Severity;
    missingPath: string;
    technicalResolution: string;
    commercialResolution: string;
    suggestedContent: string;
  },
): GithubFinding {
  return buildFinding(snapshot, {
    slug: input.slug,
    kind: 'missing_info',
    severity: input.severity ?? 'medium',
    area: input.area,
    title: input.title,
    claim: input.claim,
    managerClaim: input.managerClaim,
    confidence: 0.84,
    engineHint:
      'Relay searched the complete recursive tree for this handover artifact and found none.',
    managerEngineHint:
      'Deterministic tree check for a required handover artifact.',
    impact: {
      budget: 'Small to create · expensive to reconstruct after a departure',
      timeline: 'Before the handover date',
      risk: 'The successor has to rediscover the process under pressure',
    },
    evidence: [
      {
        quote: `No ${input.missingPath} exists at ${snapshot.headSha.slice(0, 7)}.`,
        managerQuote: `No ${input.missingPath} exists in the repository.`,
        filePath: input.missingPath,
        url: blobUrl(snapshot, ''),
        polarity: 'context',
        relevance: 0.82,
        diff: `--- /dev/null
+++ b/${input.missingPath}
@@ -0,0 +1,4 @@
${input.suggestedContent
  .split('\n')
  .map((line) => `+${line}`)
  .join('\n')}`,
      },
    ],
    files: [input.missingPath],
    technicalResolution: input.technicalResolution,
    commercialResolution: input.commercialResolution,
  });
}

/**
 * Run every deterministic check against one snapshot. Findings are capped,
 * sorted and stable for a given repository SHA.
 */
export function analyzeGithubSnapshot(
  snapshot: GithubSnapshot,
): GithubFinding[] {
  const findings: GithubFinding[] = [];

  const push = (finding: GithubFinding | null) => {
    if (finding) findings.push(finding);
  };

  push(nodeRuntimeFinding(snapshot));
  push(datastoreFinding(snapshot));
  push(secretFinding(snapshot));
  push(retryFinding(snapshot));
  push(commitChurnFinding(snapshot));

  const hasCi = hasPath(snapshot, /^\.github\/workflows\/.+\.ya?ml$/);
  if (!hasCi) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'missing-ci',
        title: 'No CI workflow ships with the repository',
        claim: 'There is no .github/workflows pipeline, so verification is manual.',
        managerClaim:
          'No automated build or test pipeline is present. Quality evidence depends on a person remembering to run it.',
        area: 'ci',
        missingPath: '.github/workflows/ci.yml',
        technicalResolution: 'a CI workflow',
        commercialResolution: 'a required CI gate',
        suggestedContent: `name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test`,
      }),
    );
  }

  push(missingTestsFinding(snapshot));

  if (!hasPath(snapshot, /(^|\/)SECURITY\.md$/i)) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'missing-security-policy',
        title: 'No security policy or disclosure path',
        claim: 'SECURITY.md is absent, so a successor has no disclosure route.',
        managerClaim:
          'No security disclosure policy is present. Incident ownership is undefined after the handover.',
        area: 'security',
        missingPath: 'SECURITY.md',
        technicalResolution: 'a security disclosure policy',
        commercialResolution: 'an owned security disclosure path',
        suggestedContent: `# Security policy

Report vulnerabilities to security@example.com.
Do not open a public issue.`,
      }),
    );
  }

  if (!hasPath(snapshot, /(^|\/)CODEOWNERS$/i)) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'missing-codeowners',
        title: 'No CODEOWNERS file',
        claim:
          'The tree has no CODEOWNERS mapping, so reviews have no accountable owner.',
        managerClaim:
          'No durable review ownership is recorded. Changes can land without a named accountable team.',
        area: 'ownership',
        missingPath: '.github/CODEOWNERS',
        technicalResolution: 'a CODEOWNERS map',
        commercialResolution: 'a named review owner',
        suggestedContent: `* @example/platform-team`,
      }),
    );
  }

  const hasRollback =
    hasPath(snapshot, /(rollback|runbook|release|incident)/i) ||
    Object.values(snapshot.files).some((content) =>
      /(rollback|runbook|release process|incident response)/i.test(content),
    );
  if (!hasRollback) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'missing-rollback',
        title: 'No rollback or incident runbook',
        claim:
          'Relay found no rollback, runbook or incident document in the tree.',
        managerClaim:
          'No tested rollback path is documented. Incident recovery depends on memory.',
        area: 'operations',
        severity: 'high',
        missingPath: 'docs/runbooks/rollback.md',
        technicalResolution: 'a tested rollback runbook',
        commercialResolution: 'a tested incident recovery path',
        suggestedContent: `# Rollback

1. Freeze deploys.
2. Shift traffic to the previous release.
3. Verify health and billing.
4. Page the release owner.`,
      }),
    );
  }

  if (!snapshot.license) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'missing-license',
        title: 'No license detected',
        claim: 'GitHub reports no license for this repository.',
        managerClaim:
          'No license is declared. Reuse and distribution rights are unclear for the successor.',
        area: 'legal',
        missingPath: 'LICENSE',
        technicalResolution: 'a license file',
        commercialResolution: 'a ratified license',
        suggestedContent: `MIT License`,
      }),
    );
  }

  const lockfiles = snapshot.paths.filter((path) =>
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/i.test(
      path,
    ),
  );
  if (new Set(lockfiles.map((path) => path.split('/').pop())).size > 1) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'duplicate-lockfiles',
        title: 'Multiple package managers are committed',
        claim: `The tree contains ${lockfiles
          .map((path) => path.split('/').pop())
          .join(', ')}. The install contract is ambiguous.`,
        managerClaim:
          'More than one package-manager lockfile is committed. Reproducible installs are not guaranteed.',
        area: 'build',
        missingPath: 'package-lock.json',
        technicalResolution: 'one lockfile',
        commercialResolution: 'one reproducible install contract',
        suggestedContent: `# Keep exactly one lockfile`,
      }),
    );
  }

  const markers = Object.entries(snapshot.files).reduce(
    (sum, [, content]) => sum + (content.match(/\b(TODO|FIXME|HACK)\b/g)?.length ?? 0),
    0,
  );
  if (markers >= 8) {
    push(
      missingArtifactFinding(snapshot, {
        slug: 'unresolved-markers',
        title: `${markers} unresolved TODO/FIXME markers`,
        claim: `The fetched files contain ${markers} unresolved engineering markers.`,
        managerClaim:
          'The codebase carries a material number of unresolved work markers. The handover is not a finished state.',
        area: 'maintenance',
        missingPath: 'docs/handover/follow-up.md',
        technicalResolution: 'a prioritised follow-up list',
        commercialResolution: 'a funded follow-up plan',
        suggestedContent: `# Follow-up

- Assign each TODO an owner.
- Close or fund the top three before launch.`,
      }),
    );
  }

  if (findings.length === 0) {
    push(
      buildFinding(snapshot, {
        slug: 'no-verifiable-contract',
        kind: 'missing_info',
        severity: 'medium',
        area: 'handover',
        title: 'No machine-verifiable handover contract',
        claim:
          'Relay found no explicit runtime, quality or rollback contract to verify.',
        managerClaim:
          'The repository does not state a verifiable handover contract. The successor cannot prove what “done” means.',
        confidence: 0.72,
        engineHint:
          'Every deterministic drift check completed with no evidence and no contract artifact.',
        managerEngineHint:
          'Deterministic scan completed with no verifiable handover artifact.',
        impact: {
          budget: 'Unbounded onboarding cost',
          timeline: 'Before the handover date',
          risk: 'Completion is a matter of opinion',
        },
        evidence: [
          {
            quote: snapshot.description
              ? clean(snapshot.description)
              : `${snapshot.fullName} has no declared handover contract.`,
            managerQuote:
              'The repository has no declared handover contract or verification artifact.',
            filePath: 'README.md',
            url: snapshot.htmlUrl,
            polarity: 'context',
            relevance: 0.7,
          },
        ],
        files: [],
        technicalResolution: 'a documented runtime, quality and rollback contract',
        commercialResolution: 'a signed handover definition of done',
      }),
    );
  }

  return findings
    .sort((a, b) => {
      const severity =
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severity !== 0) return severity;
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, MAX_FINDINGS);
}

/** Build a webhook finding from a signed, realistic GitHub event. */
export function findingFromPush(
  snapshot: GithubSnapshot,
  input: {
    deliveryId: string;
    ref: string;
    commits: { id: string; message: string; timestamp: string; author: string }[];
  },
): GithubFinding {
  const risky =
    input.commits.find((commit) =>
      /\b(revert|hotfix|rollback|disable|temporar|secret|password)\b/i.test(
        commit.message,
      ),
    ) ?? input.commits[0];

  const id = `live-wh-${shortDigest(
    `${snapshot.fullName}:${input.deliveryId}:${risky?.id ?? input.ref}`,
  )}`;
  const resolution = resolutionsFor(
    'hard_contradiction',
    'Inspect the pushed commit, prove the rollback path and attach the decision.',
    'Hold the release gate until the pushed change has an owner.',
  );
  const base = evidenceBase(snapshot);

  return {
    id,
    slug: 'webhook-push',
    origin: 'webhook',
    kind: 'hard_contradiction',
    severity: risky && /revert|hotfix|secret|password/i.test(risky.message)
      ? 'critical'
      : 'high',
    area: 'release',
    title: 'A new commit landed after sign-off',
    claim: `Push to ${input.ref}: ${risky?.message ?? 'new commit'}`,
    managerClaim:
      'A new change landed after the handover was signed. The decision record is now ahead of the code.',
    confidence: 0.89,
    engineHint:
      'Relay verified the GitHub HMAC signature, parsed the push payload and compared the commit message with the signed decision record.',
    managerEngineHint:
      'Signed webhook event verified server-side, then classified deterministically.',
    evidence: input.commits.slice(0, 3).map((commit, index) => ({
      id: `ev-${id}-${index + 1}`,
      author: commit.author || base.author,
      timestamp: commit.timestamp || base.timestamp,
      commit: commit.id,
      quote: `${commit.id.slice(0, 7)} · ${commit.message}`,
      managerQuote: `Signed push event ${index + 1} contains a post-sign-off change.`,
      url: `${snapshot.htmlUrl}/commit/${commit.id}`,
      polarity: 'contradicts',
      relevance: index === 0 ? 0.94 : 0.72,
    })),
    resolutions: resolution.resolutions,
    managerResolutions: resolution.managerResolutions,
    recommended: 1,
    impact: {
      budget: 'Release risk with no owner',
      timeline: 'Immediate',
      risk: 'The written handover no longer matches production',
    },
    files: [],
    repo: snapshot.fullName,
    ref: input.ref,
    headSha: risky?.id ?? snapshot.headSha,
    sourceUrl: `${snapshot.htmlUrl}/commit/${risky?.id ?? snapshot.headSha}`,
  };
}

export function findingFromPullRequest(
  snapshot: GithubSnapshot,
  input: {
    deliveryId: string;
    number: number;
    title: string;
    author: string;
    branch: string;
    headSha: string;
    url: string;
    action: string;
  },
): GithubFinding {
  const id = `live-wh-${shortDigest(
    `${snapshot.fullName}:pr:${input.number}:${input.headSha}`,
  )}`;
  const resolution = resolutionsFor(
    'missing_info',
    'a reviewed PR with a named owner',
    'a reviewed change with a named owner',
  );

  return {
    id,
    slug: 'webhook-pull-request',
    origin: 'webhook',
    kind: 'missing_info',
    severity: input.action === 'opened' ? 'high' : 'medium',
    area: 'review',
    title: `PR #${input.number} arrived after the handover`,
    claim: `${input.action}: “${input.title}” by ${input.author} on ${input.branch}.`,
    managerClaim:
      'A pull request arrived after sign-off. The handover decision record needs an owner for this change.',
    confidence: 0.87,
    engineHint:
      'Relay verified the GitHub HMAC signature and parsed the pull_request payload.',
    managerEngineHint:
      'Signed pull_request event verified server-side before creating a doubt.',
    evidence: [
      {
        id: `ev-${id}-1`,
        author: input.author,
        timestamp: snapshot.fetchedAt,
        commit: input.headSha,
        quote: `PR #${input.number} · ${input.title}`,
        managerQuote: `Post-handover pull request #${input.number} has no recorded owner.`,
        url: input.url,
        polarity: 'context',
        relevance: 0.9,
        diff: `--- /dev/null
+++ b/docs/handover/pr-${input.number}.md
@@ -0,0 +1,3 @@
+# PR #${input.number}
+Owner: ${input.author}
+Decision: pending`,
      },
    ],
    resolutions: resolution.resolutions,
    managerResolutions: resolution.managerResolutions,
    recommended: 1,
    impact: {
      budget: 'Small review cost · unknown scope',
      timeline: 'Before merge',
      risk: 'An unreviewed change becomes the new source of truth',
    },
    files: [],
    repo: snapshot.fullName,
    ref: input.branch,
    headSha: input.headSha,
    sourceUrl: input.url,
  };
}

