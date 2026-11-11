import type { RemediationPackage } from '@/lib/api-types';
import type { Role } from '@/lib/triage-types';

interface RemediationSource {
  patch: {
    file: string;
    language: string;
    diff: string;
  };
  verification: {
    command: string;
    expect: string;
    note: string;
  };
  rollback: string[];
  day1: { id: string; title: string; detail: string }[];
  managerChecklist: string[];
}

/**
 * Server-only remediation corpus. Nothing in this file is imported by a client
 * component: the manager browser fetches a redacted package from the API, so
 * file paths, diffs and shell commands never reach that lens.
 */
const REMEDIATION: Record<string, RemediationSource> = {
  'd-001': {
    patch: {
      file: 'services/api/db.ts',
      language: 'ts',
      diff: `--- a/services/api/db.ts
+++ b/services/api/db.ts
@@ -14,9 +14,11 @@ import { getFirestore } from 'firebase-admin/firestore';
-const db = getFirestore(app); // Supabase migration deferred until Q4
+// ADR-044: Firestore is the canonical v2 datastore.
+// Supabase is explicitly deferred and removed from the launch scope.
+import { getFirestore } from 'firebase-admin/firestore';
+const db = getFirestore(app);
+
+export const datastore = {
+  provider: 'firestore',
+  adr: 'docs/adr/044-firestore-canonical.md',
+};`,
    },
    verification: {
      command: `rg "from ['"]@supabase" services/api --glob "!*.md"`,
      expect: '0 matches',
      note: 'No Supabase client imports remain in the API service.',
    },
    rollback: [
      'Freeze writes and enable Firestore read-only maintenance mode.',
      'Re-point the API image to the last green tag: relay-api@v2.0.0-rc3.',
      'Restore Supabase connection strings from KMS, not from git history.',
      'Replay the last 24h of write-ahead events through the dual-write shim.',
    ],
    day1: [
      {
        id: 'd1-001-a',
        title: 'Read ADR-044 before touching the data layer',
        detail:
          'Firestore is canonical. The Supabase mandate in REL-201 is historical and must not be reintroduced.',
      },
      {
        id: 'd1-001-b',
        title: 'Never add a second datastore',
        detail:
          'Any new service must use the exported `datastore` client so the provider stays swappable.',
      },
      {
        id: 'd1-001-c',
        title: 'Run the datastore smoke test',
        detail:
          '`npm run test:datastore` must pass against the staging project before your first deploy.',
      },
    ],
    managerChecklist: [
      'Ratify Firestore as canonical and supersede REL-201 in the architecture record.',
      'Re-baseline the SOC 2 data-flow diagram; Firebase is now in scope.',
      'Close the $48k Supabase rework line item or re-scope it to Q4.',
    ],
  },
  'd-002': {
    patch: {
      file: 'ops/cron/relay-export',
      language: 'bash',
      diff: `--- a/ops/cron/relay-export
+++ b/ops/cron/relay-export
@@ -1,3 +1,5 @@
-0 2 * * * /opt/relay/bin/export_customers.sh --bucket s3://tklein-personal-exports
+0 2 * * * /opt/relay/bin/export_customers.sh \\
+  --bucket s3://relay-prod-exports \\
+  --owner data-platform \\
+  --alert pagerduty:data-platform
+# owner: data-platform@relay-labs.example
+# runbook: runbooks/data-export.md`,
    },
    verification: {
      command:
        'terraform plan -target=aws_s3_bucket.export | rg "bucket.*relay-prod-exports"',
      expect: 'relay-prod-exports',
      note: 'The cron target and IaC bucket agree, and alerting is attached.',
    },
    rollback: [
      'Disable the cron entry: `sudo mv /etc/cron.d/relay-export /etc/cron.d/relay-export.disabled`.',
      'Revoke the personal bucket credential immediately.',
      'Preserve the bucket objects under legal hold; do not delete evidence.',
      'Hand the incident to security with the audit window from CloudTrail.',
    ],
    day1: [
      {
        id: 'd1-002-a',
        title: 'Confirm the export is still needed',
        detail:
          'Check consumers in `runbooks/data-export.md`. If none, decommission instead of re-owning.',
      },
      {
        id: 'd1-002-b',
        title: 'Rotate the personal bucket credential',
        detail:
          'Treat `tklein-personal-exports` as exposed. Rotate the key and record the rotation in the incident log.',
      },
      {
        id: 'd1-002-c',
        title: 'Watch the 2am run for three nights',
        detail:
          'The failure was silent for three nights. Confirm a PagerDuty heartbeat exists before you trust it.',
      },
    ],
    managerChecklist: [
      'Open a potential data-exfiltration incident and notify legal/privacy.',
      'Assign the Data Platform team as the durable owner with an on-call rotation.',
      'Confirm whether customer PII left the VPC; budget for notification if it did.',
    ],
  },
  'd-003': {
    patch: {
      file: 'services/api/config.ts',
      language: 'ts',
      diff: `--- a/services/api/config.ts
+++ b/services/api/config.ts
@@ -38,4 +38,8 @@
-const DB_PASSWORD = "relay-staging-2024!";
+import { getSecret } from './secrets';
+
+// SEC-88: staging credentials are resolved from AWS KMS at boot.
+const DB_PASSWORD = getSecret('relay/staging/db-password');
+const DB_USER = getSecret('relay/staging/db-user');`,
    },
    verification: {
      command: 'git grep -n "relay-staging-2024" -- . \':!*.md\'',
      expect: '0 matches',
      note: 'The literal is gone from the working tree and from history.',
    },
    rollback: [
      'Rotate the staging password in KMS before reverting any code.',
      'If the KMS read fails, fail closed; never fall back to a literal.',
      'Restore the previous task definition only after the secret ARN is confirmed.',
    ],
    day1: [
      {
        id: 'd1-003-a',
        title: 'Rotate first, patch second',
        detail:
          'Assume the committed value is compromised. Rotate the staging credential before you touch config.ts.',
      },
      {
        id: 'd1-003-b',
        title: 'Purge git history, not just the tip',
        detail:
          'Use `git filter-repo --path services/api/config.ts --invert-paths` in a coordinated maintenance window.',
      },
      {
        id: 'd1-003-c',
        title: 'Reopen SEC-88 with evidence',
        detail:
          'A ticket marked Done without a linked PR is not remediation. Attach the KMS ARN and the rotation timestamp.',
      },
    ],
    managerChecklist: [
      'Treat the staging credential as a security incident until rotation is proven.',
      'Sign off the 48-hour security review and freeze the release if rotation slips.',
      'Budget for a repo-history rewrite and developer credential re-issue.',
    ],
  },
  'd-004': {
    patch: {
      file: 'services/billing/webhook.ts',
      language: 'ts',
      diff: `--- a/services/billing/webhook.ts
+++ b/services/billing/webhook.ts
@@ -7,5 +7,10 @@
-const MAX_RETRIES = 3;
-const RETRY_DELAY_MS = 60_000; // simplified, backoff dropped for now
+// BILL-77: restore the documented five-attempt exponential backoff.
+export const RETRY_DELAYS_MS = [
+  60_000, 300_000, 1_800_000, 7_200_000, 43_200_000,
+] as const;
+export const MAX_RETRIES = RETRY_DELAYS_MS.length;
+export const nextDelay = (attempt: number) =>
+  RETRY_DELAYS_MS[Math.min(attempt, MAX_RETRIES - 1)];`,
    },
    verification: {
      command: 'npm test -- billing/retry --runInBand',
      expect: '5 retries · exponential backoff ok',
      note: 'The handler now matches the runbook, not the other way around.',
    },
    rollback: [
      'Pause the Stripe webhook subscription to stop retry storms.',
      'Deploy the previous handler tag if error rates exceed the SLO.',
      'Replay missed events from the Stripe event log after the fix is live.',
    ],
    day1: [
      {
        id: 'd1-004-a',
        title: 'Replay the three dark renewals',
        detail:
          'Finance identified three accounts that went dark after the Stripe outage. Replay their events first.',
      },
      {
        id: 'd1-004-b',
        title: 'Keep the runbook and code in lockstep',
        detail:
          'Any future retry change must update `docs/runbooks/billing.md` in the same PR.',
      },
      {
        id: 'd1-004-c',
        title: 'Add a retry-count dashboard',
        detail:
          'Alert if retry attempts hit 4 or 5; silent exhaustion is what caused the revenue leak.',
      },
    ],
    managerChecklist: [
      'Approve the revenue-recovery replay for the three affected accounts.',
      'Sign off the corrected retry policy with finance.',
      'Track failed-renewal recovery as a weekly metric until it is flat.',
    ],
  },
  'd-005': {
    patch: {
      file: '.github/workflows/ci.yml',
      language: 'yaml',
      diff: `--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -12,7 +12,7 @@ jobs:
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/setup-node@v4
-        with:
-          node-version: 18.x
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22.x
+          cache: npm
--- a/package.json
+++ b/package.json
@@ -4,3 +4,3 @@
-  "engines": { "node": ">=20" },
+  "engines": { "node": ">=22" },`,
    },
    verification: {
      command: `node -p "require('./package.json').engines.node" && rg "node-version" .github/workflows/ci.yml`,
      expect: '>=22 and node-version: 22.x',
      note: 'CI, engines and onboarding now agree on Node 22.',
    },
    rollback: [
      'Pin the runtime back to 20 only if a native dependency fails on 22.',
      'Document the exception in `docs/onboarding.md` in the same commit.',
    ],
    day1: [
      {
        id: 'd1-005-a',
        title: 'Install Node 22 before your first build',
        detail:
          'The onboarding guide is the source of truth. CI is being aligned to it, not the reverse.',
      },
      {
        id: 'd1-005-b',
        title: 'Delete the version folklore',
        detail:
          'If you find another version reference, update it in the same PR rather than adding a fourth answer.',
      },
      {
        id: 'd1-005-c',
        title: 'Verify with `npm ci`, not `npm install`',
        detail:
          'A clean `npm ci` is the fastest way to prove engines and lockfile agree.',
      },
    ],
    managerChecklist: [
      'Approve Node 22 as the single supported runtime.',
      'Re-baseline the 6 eng-hours/week build-drift cost after the change.',
      'Ask platform to add a CI guard that fails on version drift.',
    ],
  },
  'd-006': {
    patch: {
      file: 'scripts/release/rollback.sh',
      language: 'bash',
      diff: `--- /dev/null
+++ b/scripts/release/rollback.sh
@@ -0,0 +1,14 @@
+#!/usr/bin/env bash
+set -euo pipefail
+
+# REL-260: tested rollback path for the v2 launch.
+echo "1/4 freeze deploys"
+kubectl annotate deploy/relay-api rollout/relay.io-frozen=true --overwrite
+echo "2/4 shift traffic to the previous ReplicaSet"
+kubectl rollout undo deploy/relay-api
+echo "3/4 verify health + billing webhooks"
+curl -fsS https://relay.example/health | jq -e '.ok == true'
+echo "4/4 page the release owner"
+relay page release-owner --reason "v2 rollback"`,
    },
    verification: {
      command: 'bash scripts/release/rollback.sh --dry-run',
      expect: 'DRY RUN OK · 4 steps',
      note: 'The rollback path is executable before launch, not after the incident.',
    },
    rollback: [
      'This doubt is the rollback plan; if it fails, fall back to the maintenance page.',
      'Scale the previous deployment to 100% and freeze all deploys.',
      'Communicate via the status page within five minutes.',
    ],
    day1: [
      {
        id: 'd1-006-a',
        title: 'Read the rollback script end to end',
        detail:
          'Know the four steps before you need them: freeze, undo, verify, page.',
      },
      {
        id: 'd1-006-b',
        title: 'Run the dry-run in staging',
        detail:
          '`bash scripts/release/rollback.sh --dry-run` must print all four steps without side effects.',
      },
      {
        id: 'd1-006-c',
        title: 'Own the release checklist',
        detail:
          'REL-260 is no longer unassigned. Attach your name and the tested timestamp.',
      },
    ],
    managerChecklist: [
      'Approve the launch gate: no v2 deploy until the rollback dry-run passes.',
      'Name the release owner and the incident commander for launch day.',
      'Insure the $30k+ incident exposure with a tested recovery path.',
    ],
  },
};

const FALLBACK: RemediationSource = {
  patch: {
    file: 'docs/handover/follow-up.md',
    language: 'md',
    diff: `--- /dev/null
+++ b/docs/handover/follow-up.md
@@ -0,0 +1,4 @@
+# Follow-up required
+
+- Relay could not find a deterministic patch for this doubt.
+- Assign an owner and attach a verification command before launch.`,
  },
  verification: {
    command: 'echo "assign a verification command"',
    expect: 'verification command present',
    note: 'A human must supply the verification step for this doubt.',
  },
  rollback: ['No deterministic rollback is known. Escalate to the owning team.'],
  day1: [
    {
      id: 'fallback-a',
      title: 'Assign an owner',
      detail: 'This doubt has no curated remediation. Assign an owner now.',
    },
  ],
  managerChecklist: [
    'Assign an accountable owner.',
    'Require a verification artifact before launch.',
  ],
};

export function buildRemediationPackage(
  doubtId: string,
  title: string,
  area: string,
  severity: string,
  role: Role,
): RemediationPackage {
  const source = REMEDIATION[doubtId] ?? FALLBACK;

  if (role === 'manager') {
    return {
      doubtId,
      title,
      area,
      severity,
      role,
      allowed: false,
      reason:
        'Implementation targets, patches and shell commands are withheld by the manager projection.',
      managerChecklist: source.managerChecklist,
    };
  }

  return {
    doubtId,
    title,
    area,
    severity,
    role,
    allowed: true,
    patch: source.patch,
    verification: source.verification,
    rollback: source.rollback,
    day1: source.day1,
    managerChecklist: source.managerChecklist,
  };
}
