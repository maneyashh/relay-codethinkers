import type { GithubSnapshot } from './github-types';
import { SELF_SCAN_REPO } from './github-types';

/**
 * Deterministic last-resort snapshot.
 *
 * The ingestion studio always tries the real, unauthenticated GitHub REST API
 * first. If the network is blocked or the hourly unauthenticated limit is
 * exhausted, Relay replays this clearly-labelled fixture so a judge in an
 * offline room still sees the full deterministic pipeline. The result carries
 * `mode: 'fallback'` and the reason; it never claims to be live.
 */
const HEAD_SHA = '9f3c41a7d2b84e6f1c05a9d7b3e28f4a6c1d0b52';
const HEAD_DATE = '2026-11-14T02:14:00.000Z';

/** Fallback for the live hackathon repo, used when an anonymous judge IP is rate-limited. */
const RELAY_HEAD_SHA = '6c2f9a1d4b7e8c3f5a0d2e9b6c4f1a8d3e7b5c02';
const RELAY_HEAD_DATE = '2026-11-16T21:42:00.000Z';

const RELAY_FILES: Record<string, string> = {
  'package.json': `{
  "name": "relay-web",
  "version": "3.0.0",
  "private": true,
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "node --test",
    "verify:security": "node scripts/verify-security.mjs"
  },
  "dependencies": {
    "next": "16.4.5",
    "react": "19.3.0",
    "zustand": "^5.1.0"
  }
}`,
  '.nvmrc': '26\n',
  '.github/workflows/security.yml': `name: security
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run verify:security`,
  'apps/web/lib/crypto-ledger.ts': `import { createHash, createHmac } from 'node:crypto';

export const CHAIN_FORMULA =
  'sha256(prevHash + "|" + seq + "|" + kind + "|" + doubtId + "|" + payloadJson + "|" + createdAt)';

// TODO: move the receipt secret into a managed KMS key before GA.
export function genesisHash(sessionId: string): string {
  return createHash('sha256')
    .update(\`relay-ledger-genesis-v1|\${sessionId}\`)
    .digest('hex');
}

export function signReceipt(rootHash: string, secret: string): string {
  return createHmac('sha256', secret).update(rootHash).digest('base64url');
}

// FIXME: the exported receipt still carries every payload verbatim.`,
  'apps/web/lib/integrations.ts': `// One-click Round 3 dispatch: GitHub PR + Notion sync.
// TODO: rate-limit dispatch attempts per session before the final round.
export const DISPATCH_FORMULA =
  'HMAC-SHA256(sessionRef|target|reference|artifactSha256|createdAt)';

export function canDispatchGithub(role: 'manager' | 'junior'): boolean {
  return role === 'junior';
}

// HACK: sandbox mode rewrites the reference when no token is present.`,
  'apps/web/lib/github-webhook.ts': `const MAX_RETRIES = 2;

// TODO: restore exponential backoff before the handover demo.
export async function deliverWebhook(event: unknown) {
  return { delivered: true, event };
}

// FIXME: failed deliveries are dropped after the second attempt.`,
  'docs/runbooks/webhook.md': `# Webhook delivery runbook

GitHub retries the delivery five times with exponential backoff.

If every attempt fails, replay the delivery from the dashboard and page the
release owner. The three dark renewals from the final round are still open.

TODO: publish the retry dashboard.
TODO: record the replay owner.`,
  '.env.example': `RELAY_SESSION_SECRET=replace-with-32-byte-secret
RELAY_RECEIPT_SECRET=replace-with-32-byte-secret
RELAY_DB_PATH=.data/relay.db
GITHUB_TOKEN=
NOTION_TOKEN=`,
  'README.md': `# Relay — Round 3 finalist build

Deterministic handover intelligence: live GitHub ingestion, signed webhooks,
least-privilege dispatch and a SHA-256 receipt chain.

Run \`npm run verify:security\` for the full HTTP proof.

TODO: link the finalist scorecard.
TODO: document the self-scan preset.
FIXME: keep the offline fallback clearly labelled.`,
  'SECURITY-NOTES.md': `The .relay.sig receipt is signed with HMAC-SHA256.

TODO: fold this file into a real SECURITY.md.
TODO: publish the disclosure mailbox.`,
};

function buildRelayFallbackSnapshot(reason: string): GithubSnapshot {
  return {
    owner: 'maneyashh',
    name: 'relay-codethinkers',
    fullName: SELF_SCAN_REPO,
    defaultBranch: 'main',
    htmlUrl: `https://github.com/${SELF_SCAN_REPO}`,
    description:
      'Relay — Round 3 finalist build · deterministic handover intelligence.',
    language: 'TypeScript',
    stars: 0,
    license: 'MIT',
    headSha: RELAY_HEAD_SHA,
    headCommittedAt: RELAY_HEAD_DATE,
    fetchedAt: new Date().toISOString(),
    paths: [
      ...Object.keys(RELAY_FILES),
      'package-lock.json',
      'yarn.lock',
      'apps/web/scripts/verify-security.mjs',
      'apps/web/stores/triage.ts',
      'apps/web/components/triage/JudgeWalkthrough.tsx',
      'ARCHITECTURE.md',
    ],
    files: RELAY_FILES,
    commits: [
      {
        sha: RELAY_HEAD_SHA,
        message: 'hotfix(webhook): bypass the retry guard for the demo build',
        date: RELAY_HEAD_DATE,
        author: 'maneyashh',
      },
      {
        sha: '3b7d1f9a2c6e8b0d4f5a7c9e1b3d5f7a9c0e2b41',
        message: 'revert: restore Node 24 in the security workflow',
        date: '2026-11-16T19:05:00.000Z',
        author: 'relay-ci',
      },
      {
        sha: '8e4c2a0f6d9b7e5c3a1f8d6b4e2c0a9f7d5b3e18',
        message: 'feat: signed GitHub PR + Notion dispatch',
        date: '2026-11-16T16:48:00.000Z',
        author: 'maneyashh',
      },
      {
        sha: '1a9f7e5d3c2b0a8f6e4d2c1b9a7f5e3d0c8b6a42',
        message: 'docs: finalist scorecard is still hand-written',
        date: '2026-11-16T11:12:00.000Z',
        author: 'CodePuneThinkers',
      },
    ],
    truncated: false,
    fallbackReason: reason,
  };
}

const FILES: Record<string, string> = {
  'package.json': `{
  "name": "relay-handover-fixture",
  "version": "2.0.0",
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc -p .",
    "test": "node --test"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "firebase-admin": "^12.6.0",
    "express": "^4.21.0"
  }
}`,
  '.nvmrc': '22\n',
  Dockerfile: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["node", "dist/server.js"]`,
  '.github/workflows/ci.yml': `name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm test`,
  'services/api/db.ts': `import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

// TODO: remove the legacy Supabase client after the migration.
const firestore = getFirestore();
const legacySupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

export const datastore = firestore;
export const legacy = legacySupabase;`,
  'services/api/config.ts': `export const REGION = 'us-east-1';

// FIXME: this should be a secret manager lookup before launch.
const DB_USER = 'relay_app';
const DB_PASSWORD = "relay-staging-2024!";

export const database = {
  user: DB_USER,
  password: DB_PASSWORD,
};`,
  'services/billing/webhook.ts': `const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60_000; // simplified, backoff dropped for now

export async function handleStripeWebhook(event: unknown) {
  // TODO: replay the three dark renewals before the next release.
  return event;
}`,
  'docs/runbooks/billing.md': `# Billing webhook runbook

Stripe retries the webhook five attempts with exponential backoff.

If the final attempt fails, page the billing owner and replay the event from
the Stripe dashboard. The three dark renewals from October are still open.

TODO: add a retry-count dashboard.
TODO: record the replay owner.`,
  'SECURITY-NOTES.md': `The staging database password rotation is tracked outside this repository.

TODO: publish a real SECURITY.md before the handover.`,
  'README.md': `# Relay handover fixture

A small service used to demonstrate deterministic GitHub drift analysis.

CI runs on Node 18. The onboarding guide asks for Node 22.
Deploys use the Dockerfile. Testing is "someone runs npm test".

FIXME: replace the Supabase client with the canonical datastore.
FIXME: remove the committed staging password.
HACK: the billing retry schedule is shortened during flash sales.
`,
};

export function buildFallbackSnapshot(
  repo: string,
  reason: string,
): GithubSnapshot {
  if (repo.trim().toLowerCase() === SELF_SCAN_REPO) {
    return buildRelayFallbackSnapshot(reason);
  }

  const [owner, name] = repo.split('/');
  const paths = [
    ...Object.keys(FILES),
    'package-lock.json',
    'yarn.lock',
    'CHANGELOG.md',
    'docs/architecture.md',
    'src/server.ts',
    'test/.gitkeep',
  ];

  return {
    owner: owner ?? 'relay-labs',
    name: name ?? 'handover-fixture',
    fullName: `${owner ?? 'relay-labs'}/${name ?? 'handover-fixture'}`,
    defaultBranch: 'main',
    htmlUrl: `https://github.com/${owner ?? 'relay-labs'}/${
      name ?? 'handover-fixture'
    }`,
    description:
      'Deterministic offline replay for the Relay GitHub ingestion studio.',
    language: 'TypeScript',
    stars: 0,
    license: null,
    headSha: HEAD_SHA,
    headCommittedAt: HEAD_DATE,
    fetchedAt: new Date().toISOString(),
    paths,
    files: FILES,
    commits: [
      {
        sha: HEAD_SHA,
        message: 'hotfix(billing): shorten retry schedule during flash sale',
        date: HEAD_DATE,
        author: 'Sam Ortiz',
      },
      {
        sha: '4b2c8f1d9e7a6c5b3a0f8e2d1c9b7a5f3e1d0c84',
        message: 'revert: restore the Firebase client behind FIREBASE=0',
        date: '2026-11-13T23:48:00.000Z',
        author: 'Marcus Webb',
      },
      {
        sha: '2a8f7d6c5b4e3a2f1d0c9b8a7f6e5d4c3b2a1908',
        message: 'chore: drop CI cache to unblock the release',
        date: '2026-11-13T18:12:00.000Z',
        author: 'CI Bot',
      },
      {
        sha: '7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c87',
        message: 'docs: onboarding still says Node 22',
        date: '2026-11-12T15:05:00.000Z',
        author: 'Priya Raman',
      },
    ],
    truncated: false,
    fallbackReason: reason,
  };
}
