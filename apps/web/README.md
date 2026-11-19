> **Start here → the judge guide.** The live UI has a three-tab **Judge Guide**
> (`?` anywhere, or the **Guide** button), and the repository has
> [`JUDGE_GUIDE.md`](../JUDGE_GUIDE.md) with the 90-second route, cURL proofs,
> and Q&A.

> **Round 3 Promise vs. Proof Scorecard.** Every Round 2 commitment is mapped
> to the Round 3 implementation, the API route that proves it, and the one
> command that re-verifies it.

| Round 2 promise | Round 3 implementation | API route | Live proof |
| --- | --- | --- | --- |
| "Real repository ingestion is coming." | `lib/github-fetch.ts` + `lib/github-analyzer.ts` + `db/github.ts` | `POST /api/github/ingest` | Self-scan preset **`maneyashh/relay-codethinkers`** (id `relay`) is the #1 featured preset; Judge HUD Stage 2 scans it live. |
| "Webhooks will be verified, not mocked." | HMAC-SHA256 delivery verification in `app/api/github/webhook/route.ts` | `POST /api/github/webhook` | Signed `push` delivery shows the signature and appends one contradiction to the signed session. |
| "One-click PR and Notion buttons will execute." | `lib/integrations.ts` + `db/security.ts` role views | `POST /api/integrations/github-pr`, `POST /api/integrations/notion-sync` | Manager **403** with zero diff leakage; junior signed branch, artifact SHA-256 and unified diff. Judge HUD Stage 3. |
| "Progressive disclosure will ship." | `components/triage/JudgeWalkthrough.tsx` + Guided Focus in `components/triage/TriageBoard.tsx` | Signed session via `POST /api/session` | Judge HUD Stage 1 flips the real board between Guided Focus and Full War-Room. |
| "Every decision will be tamper-evident." | `lib/crypto-ledger.ts` SHA-256 chain + HMAC root signature | `GET /api/security/receipt`, `POST /api/security/receipt` | Judge HUD Stage 4 runs a rogue tamper attack and shows `Expected vs. Tampered` with `HMAC: REJECTED`. |
| "The whole loop will be verifiable in one command." | `scripts/verify-security.mjs` against the real route handlers | `/api/health`, `/api/security/*`, `/api/integrations/*`, `/api/github/*` | `npm run verify:security` → **72/72 checks passed**. |

---

# Relay — web app

Relay turns scattered, contradictory handover evidence into a traceable decision
record. Scattered sources become doubts, doubts become human decisions, and
decisions become a verified handover artifact.

Round 3 makes that loop live end to end:

- **Real GitHub ingestion** — one click fetches a public repository through the
  unauthenticated GitHub REST API, runs a deterministic drift analyzer, and
  attaches findings as session-scoped doubts with real file paths, SHAs and
  diffs.
- **Signed webhooks** — realistic `push` and `pull_request` deliveries are
  HMAC-signed, verified server-side, and appended incrementally.
- **One-click dispatch** — GitHub PR and Notion sync are built on the server
  from the signed role's board. No token means a cryptographically signed
  sandbox dispatch, never a fake success.
- **SHA-256 receipt chain** — every decision, ingestion, webhook and dispatch
  extends an append-only hash chain that exports as `.relay.sig` and verifies
  over HTTP.

The stack is Next.js 16 Route Handlers, SQLite through Node's built-in
`node:sqlite`, and HMAC-signed sessions that enforce the manager /
junior-developer boundary on the server. See
[`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for the full design.

## Run it

Requires Node 24+ (tested on Node 26).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The database is created and seeded lazily at `apps/web/.data/relay.db` on the
first API request. No external service or API key is needed. On read-only
serverless filesystems Relay falls back to `<tmpdir>/relay.db` and finally to a
seeded in-memory database, so a cold start never crashes a judge's session.

## The 90-second judge route

1. **Landing** — set the project context and enter the handover.
2. **Ingest a real repo** — open **Ingest** and pick the #1 featured preset
   **`maneyashh/relay-codethinkers`** (self-scan), or Express, Hono, Koa, Chalk,
   `is`, Fastify, or type `owner/name`. Relay calls the public GitHub API, reads
   real files and commits, and turns the deterministic findings into live
   doubts. If the API is unreachable the fixture is clearly labelled `fallback`,
   never presented as live.
3. **Triage in Guided focus** — the default lens shows one contradiction at a
   time, steps through the board, and keeps the decision composer in front of
   you. Blast Radius, Remediation, Evidence and Security open only when asked.
4. **Switch to War-room** — the toggle restores the full two-column board when
   you want everything visible at once.
5. **Inject a live signal** — press `C` (or **Inject** in the top bar) and watch
   confidence move deterministically, with the formula shown.
6. **Ask Relay** — press `⌘K` and interrogate a doubt with citations back to the
   exact evidence row.
7. **Fire a signed webhook** — in the Ingest studio, simulate a `push` or
   `pull_request`. Relay generates the GitHub payload, signs it with the
   webhook secret, verifies it through the same code path a real delivery uses,
   and appends one incremental doubt.
8. **Security inspector** — open **API-secured** and inspect five tabs:
   boundary, payload diff, live signals, receipt and audit trail. Simulate a
   tamper to see the copied chain break in red, then export `.relay.sig`.
9. **Switch lens** — change to Manager and watch implementation paths, patches,
   diffs, SHAs, URLs and developer-only signals disappear from the payload.
10. **Handover** — verify decisions, review the Day-1 plan, and dispatch the
    artifact. The developer lens can open a GitHub PR; both lenses can sync
    Notion. Without tokens each dispatch is a signed sandbox record with an
    inspectable signature. Export JSON, Markdown, the patch or the receipt.

Press `?` anywhere on the board for the keyboard map, **Fast-forward** to apply
the curated accelerator, and **Reset** to return to a clean board and a fresh
genesis receipt.

## Round 3 Deliverables Implemented

1. **Live GitHub ingestion and signed webhooks.** `POST /api/github/ingest`
   fetches a real public repository and attaches deterministic findings to the
   active signed session. `POST /api/github/webhook` verifies an HMAC-SHA256
   `push` or `pull_request` delivery and appends one finding idempotently. Live
   findings never cross session boundaries, and the manager projection omits
   file paths, commits, diffs, SHAs, source URLs and implementation payloads.
2. **One-click remediation dispatch.** `POST /api/integrations/github-pr`
   returns a signed server-built PR bundle for the developer lens and a hard
   `403` for managers before any diff is built.
   `POST /api/integrations/notion-sync` creates or sandbox-signs a role-filtered
   Notion handover page; only the developer projection receives the artifact.
3. **Tamper-evident `.relay.sig` receipt.** `GET /api/security/receipt` exports
   a verified SHA-256 hash chain signed with HMAC-SHA256.
   `POST /api/security/receipt` re-verifies an exported receipt and, with
   `{ tamper: true }` or a mutated link, reports the first broken hash while the
   live ledger remains untouched.

`npm run verify:security` runs **72** HTTP-level checks across these flows,
including cross-session isolation, dispatch signatures, the manager `403`
boundary, receipt verification and tamper detection.

## Prove the security boundary

With the app running:

```bash
npm run verify:security
```

The script talks to the real route handlers over HTTP and never imports the
database. It runs 72 checks, including:

- the manager payload contains no file paths, commits, diffs, implementation
  objects, redacted values or the staging secret;
- SQL withholds 8 of 24 evidence rows from the manager;
- `?role=junior` is ignored and a forged HMAC cookie returns 401;
- a role switch returns the inverse projection;
- a developer-only live signal never appears in the manager payload;
- manager remediation withholds patches, commands and file paths;
- the audit trail records actions without echoing evidence text;
- fast-forward resolves all six doubts as `auto` decisions and reset clears them;
- real GitHub ingestion attaches live doubts with 40-character SHAs and file
  evidence, and the manager projection contains no `filePath`, `commit`, `diff`,
  `headSha`, `sourceUrl`, implementation object or raw 40-character SHA;
- a simulated push and pull_request are HMAC-verified and append incrementally;
- a manager GitHub PR dispatch returns a hard 403 with no artifact, while a
  manager Notion dispatch records the signature but withholds the artifact;
- a developer dispatch returns a signed server-built bundle with a 64-character
  artifact hash;
- the receipt chain is contiguous, genesis-anchored and HMAC-signed; a tampered
  copy fails verification and a mutated exported receipt is rejected, while the
  live ledger stays clean;
- every protected endpoint, including all Round 3 routes, rejects an anonymous
  browser.

In the app, the **API-secured** badge in the triage top bar opens the same probe
as a counts-only report with a payload diff, live-signal boundary, integration
dispatch ledger, receipt chain and sanitized audit trail.

## API

| Method    | Path                          | Purpose                                          |
| --------- | ----------------------------- | ------------------------------------------------ |
| GET       | `/api/health`                 | Live DB, seed counts, schema and resilience      |
| POST      | `/api/session`                | Create session / switch role, return board       |
| GET       | `/api/triage`                 | Role-filtered board for the signed session       |
| PATCH     | `/api/doubts/:id`             | Resolve, skip, reopen or verify a decision       |
| POST      | `/api/signals`                | Inject a session-scoped, audience-scoped signal  |
| POST      | `/api/triage/fast-forward`    | Resolve every doubt as an audited `auto` decision|
| POST      | `/api/triage/reset`           | Clear this session's progress, signals and chain |
| GET       | `/api/remediation`            | Role-scoped remediation packages                 |
| GET       | `/api/remediation/:id`        | One remediation package for the session role     |
| POST      | `/api/github/ingest`          | Fetch a real repo; attach deterministic findings |
| POST      | `/api/github/webhook`         | Verify a signed `push` / `pull_request` event    |
| GET       | `/api/integrations`           | Session-scoped dispatch list and capabilities    |
| POST      | `/api/integrations/github-pr` | Developer-only signed GitHub PR dispatch         |
| POST      | `/api/integrations/notion-sync`| Signed Notion handover sync (both lenses)       |
| GET       | `/api/security/verify`        | Counts-only permission proof                     |
| GET       | `/api/security/audit`         | Sanitized, session-scoped audit trail            |
| GET       | `/api/security/receipt`       | Export chain, verification and tamper simulation |
| POST      | `/api/security/receipt`       | Verify a `.relay.sig` receipt over the wire      |

All responses are `Cache-Control: no-store`. Errors are JSON with a stable
`error` code. `/api/github/ingest` accepts `{ presetId }` or `{ repo }`.
`/api/github/webhook` accepts either `{ event: "push" | "pull_request", presetId?,
repo? }` (Relay signs the simulation server-side) or a real GitHub delivery with
`x-github-event` and `x-hub-signature-256`. A signed Relay session cookie is
required in both modes.

## Live ingestion, dispatch and receipts

### Ingestion

`lib/github-fetch.ts` reads `GET /repos/:owner/:name`, the latest commits and
the recursive tree, then fetches a bounded set of real files from
`raw.githubusercontent.com` (18 files, 24 KB each). No token is needed. A
`GITHUB_TOKEN` raises the rate limit but never changes the analyzer.

`lib/github-analyzer.ts` is deterministic and model-free. It looks for runtime
drift (`engines.node`, `.nvmrc`, Dockerfiles, CI), competing datastore clients,
committed credential literals, code-vs-runbook retry drift, rollback churn in
commit messages, and missing CI, tests, `SECURITY.md`, `CODEOWNERS`, rollback
docs, license or a single lockfile. Findings are capped at 8, sorted stably and
identified by a SHA-256 digest of the repo SHA and finding slug.

Findings live in `session_live_doubts`, not in the seeded `evidence` table. Each
finding stores a manager payload and a developer payload separately, and
`v_live_manager` never selects the repo, ref, head SHA, source URL or developer
JSON. A new ingestion replaces that session's previous live findings; a webhook
appends one finding and is idempotent by delivery id.

### Dispatch

`lib/integrations.ts` builds the Markdown artifact and patch bundle on the
server from the signed session's board. The browser supplies no content, target
or role. The dispatch signature is:

```
HMAC-SHA256(sessionRef | target | reference | artifactSha256 | createdAt)
```

With `GITHUB_TOKEN` + `GITHUB_PR_REPO`, Relay opens a real PR that adds
`.relay/handover.md` and `.relay/handover.patch`. With `NOTION_TOKEN` +
`NOTION_PARENT_PAGE_ID`, it creates a real Notion page. Without tokens it returns
a signed **sandbox** dispatch (`relay://sandbox/...`). Every dispatch is stored
in `session_integrations`, appended to the receipt chain, and audited. The
manager view never projects the `artifact` column; the manager GitHub PR route
returns `403` before any work happens.

### Receipt chain

`lib/crypto-ledger.ts` maintains a per-session, append-only SHA-256 chain:

```
genesis   = SHA-256("relay-ledger-genesis-v1|<sessionId>")
entry     = SHA-256(prevHash|seq|kind|doubtId|payloadJson|createdAt)
root      = hash of the last entry (or genesis when empty)
signature = HMAC-SHA256(sessionRef|entryCount|rootHash)
```

Every session creation, resolve, verify, skip, reopen, fast-forward, ingestion,
webhook and dispatch appends an entry. Reset discards the chain and starts a new
genesis. `GET /api/security/receipt` exports the full receipt, verifies every
link, and simulates a tamper **on a copy in memory**. The live ledger is never
mutated. `POST /api/security/receipt` re-verifies an exported `.relay.sig`, so a
mutated decision is rejected with `brokenAt` pointing at the first bad link.

## Scripts

```bash
npm run dev             # development server
npm run build           # production build (also runs TypeScript)
npm start               # serve the production build
npm run db:reset        # delete the SQLite file; reseeds next request
npm run verify:security # end-to-end permission test against a running server
```

## Environment

Everything is optional. The demo is zero-config: public GitHub ingestion works
unauthenticated, webhooks are signed with a built-in demo secret, and dispatch
falls back to a signed sandbox record.

| Variable                   | Default              | Purpose                                      |
| -------------------------- | -------------------- | -------------------------------------------- |
| `RELAY_DB_PATH`            | `.data/relay.db`     | SQLite file location                         |
| `RELAY_SESSION_SECRET`     | built-in demo secret | Set a strong value in production             |
| `RELAY_RECEIPT_SECRET`     | session secret       | HMAC secret for receipts and dispatches      |
| `RELAY_INSECURE_COOKIES`   | unset                | `1` omits `Secure` in production             |
| `GITHUB_TOKEN`             | unset                | Raises GitHub API limits; enables live PRs   |
| `GITHUB_WEBHOOK_SECRET`    | demo secret          | Verifies real `x-hub-signature-256` delivery |
| `GITHUB_PR_REPO`           | unset                | Target repo for a live handover PR           |
| `GITHUB_PR_BASE`           | repo default branch  | Base branch for the handover PR              |
| `NOTION_TOKEN`             | unset                | Creates a real Notion handover page          |
| `NOTION_PARENT_PAGE_ID`    | unset                | Parent page for the Notion sync              |

## Cloud resilience

- **Storage ladder:** `RELAY_DB_PATH` → `<cwd>/.data/relay.db` →
  `<tmpdir>/relay.db` → `:memory:`. A read-only filesystem degrades instead of
  throwing `SQLITE_READONLY`.
- **Signed session revival:** tokens are `<uuid>.<role>.<hmac>`. If a serverless
  cold start loses the session row, the signed role recreates it so a judge
  never receives a surprise 401/404 mid-demo. When the row exists, the database
  role is authoritative.
- **Per-browser isolation:** progress, decisions and live signals are scoped to
  the signed session id, so one visitor can never widen another visitor's board.
- **Deterministic synthesis:** the same fixed-weight formula runs on the server
  and in the browser preview; there is no model call and no randomness.

## Where things live

- `db/schema.ts` — tables, constraints and role-scoped SQL views (schema v3).
- `db/board.ts` — role projections, decisions, signals, fast-forward and reset.
- `db/github.ts` — live ingestion and live-doubt persistence.
- `db/session.ts` — HMAC cookie tokens, role recovery and session records.
- `db/security.ts` — projection comparison, live/integration boundaries and audit.
- `lib/synthesis.ts` — the shared deterministic confidence formula.
- `lib/remediation.ts` — server-only patches, verification, rollback and Day-1.
- `lib/github-fetch.ts` — real GitHub REST fetch with a labelled offline fallback.
- `lib/github-analyzer.ts` — deterministic drift findings and webhook findings.
- `lib/integrations.ts` — server-built artifacts, dispatch signing and live writes.
- `lib/crypto-ledger.ts` — SHA-256 hash chain, receipt signing and tamper checks.
- `stores/triage.ts` — Zustand store; all data comes from the API.
- `components/triage/` — board, Guided focus, drawers, ingest studio, security proof.
- `components/flow/` — landing, ingestion, handover artifact and dispatch inspector.
- `scripts/verify-security.mjs` — raw-payload 72-check proof.
