# Relay — Full-Stack MVP Architecture

Relay turns a team's contradictory handover evidence into a traceable decision
record and a verified handover artifact. The original prototype was
frontend-only: every doubt, quote, file path and secret came from a static
TypeScript module and the role toggle only changed CSS.

This version moves the narrative dataset into a real database and makes the role
a **server-enforced permission boundary**. The browser cannot request a role and
the manager JSON payload never contains developer evidence, implementation
targets, patches or developer-only live signals.

The active application is [`apps/web`](apps/web). The older `next-app/`,
`services/api/` and `supabase/` directories are unrelated prior scaffolding and
are not part of this MVP.

Beyond the read-only boundary, the app now covers the full handover loop:

- **Live chaos in:** session-scoped live signal injection from Slack, GitHub,
  Notion, Jira, code or email, plus one-click ingestion of a real public GitHub
  repository through the unauthenticated REST API.
- **Deterministic drift analysis:** runtime, datastore, credential, retry,
  release and missing-artifact checks run in TypeScript with no model call and
  no randomness. Every finding cites a real file, SHA and diff.
- **Signed webhooks:** realistic `push` and `pull_request` deliveries are
  HMAC-SHA256 signed, verified server-side, and appended incrementally and
  idempotently.
- **Human decisions:** decision type, rationale, owner, named sign-off and a
  separate verification state are persisted per doubt.
- **Evidence-grounded interrogation:** asking about a doubt returns its
  conflicting citations, not an ungrounded answer.
- **Role-scoped remediation:** patches, verification commands and Day-1 plans
  exist only for the developer lens; the manager receives a checklist and a
  reason, never a path or a diff.
- **Server-built dispatch:** GitHub PR and Notion sync artifacts are assembled
  from the signed session's board. A missing token yields a cryptographically
  signed sandbox dispatch, never a fake external write.
- **Verified handover:** decision ledger, Day-1 plan, JSON, Markdown and patch
  exports, plus a judge accelerator that is explicitly audited as `auto`.
- **Tamper-evident receipts:** every action extends a per-session SHA-256 hash
  chain, exported as `.relay.sig` and verified over HTTP.
- **Inspectable security:** a five-tab proof surface (boundary, payload diff,
  live signals, receipt, audit trail) backed by the same server probe the CLI
  runs.
- **Guided focus:** the board defaults to one contradiction at a time with
  on-demand Blast Radius, Remediation, Evidence and Security drawers; a
  War-room toggle restores the full two-column layout.

## Stack

| Layer     | Choice                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Framework | Next.js 16.4.5 App Router, React 19, TypeScript                       |
| API       | Next.js Route Handlers (Node.js runtime)                               |
| Database  | SQLite via Node's built-in `node:sqlite` (`DatabaseSync`)              |
| Sessions  | HMAC-SHA256 signed, `HttpOnly`, `SameSite=Lax` cookie                  |
| State     | Zustand store that only ever holds server-returned boards              |
| Styling   | Tailwind CSS 4 + the existing Relay visual system                      |

There is no external service, ORM, container or API key. `npm install` plus
`npm run dev` is the whole setup. `node:sqlite` is built into Node 24+; this repo
was built and tested on Node 26.13.

## Repository layout

```
apps/web/
  app/                      Next.js routes and screens
    api/session/            create / switch the signed session
    api/triage/             role-filtered board
    api/triage/fast-forward/ audited judge accelerator
    api/triage/reset/       clear one session's progress and signals
    api/doubts/[id]/        resolve / skip / reopen / verify one doubt
    api/signals/            inject a session-scoped live signal
    api/github/ingest/      fetch a real repo, attach deterministic findings
    api/github/webhook/     verify a signed push / pull_request delivery
    api/integrations/       list, GitHub PR and Notion dispatch
    api/remediation/        role-scoped remediation corpus
    api/security/verify/    counts-only proof of the boundary
    api/security/audit/     sanitized session audit trail
    api/security/receipt/   export / verify the SHA-256 receipt chain
    api/health/             live database + resilience check
  db/
    schema.ts               tables, constraints, role-scoped SQL views (v3)
    client.ts               lazy DB open + resilience ladder + idempotent seed
    seed.json               the narrative dataset
    board.ts                projections, decisions, signals, fast-forward, reset
    github.ts               live ingestion + live-doubt persistence
    session.ts              HMAC tokens, signed-role revival, session records
    security.ts             projection comparison, live/integration boundaries
  lib/
    synthesis.ts            shared deterministic confidence formula
    remediation.ts          server-only patches, verification, rollback, Day-1
    github-fetch.ts         real GitHub REST fetch + labelled fallback
    github-analyzer.ts      deterministic drift findings + webhook findings
    integrations.ts         server-built artifacts, dispatch signing, live writes
    crypto-ledger.ts        SHA-256 hash chain, receipt signing, tamper checks
  server/http.ts            cookie helpers, no-store JSON, 401 helper
  stores/triage.ts          API-driven Zustand store
  components/               landing, ingestion, triage, handover UI
  scripts/verify-security.mjs
  scripts/reset-db.mjs
```

## Request flow

```
Browser
  │  POST /api/session  { role?: "manager" | "junior" }
  ▼
Route Handler ──► verify HMAC cookie ──► sessions row (role lives here)
  │
  ├─► buildBoard(session) ──► v_evidence_manager   (no junior rows, no code columns)
  │                       └─► v_evidence_junior     (no manager rows)
  │
  └─► NextResponse.json + Set-Cookie (HttpOnly)

Browser ──► GET /api/triage ──► same role from the signed session
Browser ──► PATCH /api/doubts/:id ──► status/XP/decision metadata computed server-side
Browser ──► POST /api/signals ──► session row + audience-scoped signal view
                                └─► deterministic confidence recompute
Browser ──► GET /api/remediation/:id ──► patch (junior) or checklist (manager)
Browser ──► GET /api/security/audit ──► sanitized, session-scoped events
Browser ──► POST /api/github/ingest ──► unauthenticated GitHub REST fetch
                                    └─► deterministic analyzer ──► v_live_* views
Browser ──► POST /api/github/webhook ──► verify HMAC ──► incremental live doubt
Browser ──► POST /api/integrations/:target ──► server-built artifact + signature
Browser ──► GET /api/security/receipt ──► recompute every link + HMAC signature
```

Live signals are written to `session_signals`, never to the seeded `evidence`
table. They are read back through `v_signal_manager` / `v_signal_junior`, so a
developer-only signal is absent from the manager payload rather than filtered in
the browser. Confidence is recomputed from fixed weights
(`contradicts +0.10`, `context +0.03`, `supports −0.06`, scaled by relevance and
clamped to `0.45..0.995`), and the formula is rendered beside the result.

Live GitHub findings follow the same rule. `POST /api/github/ingest` fetches the
repository (`GET /repos/:owner/:name`, latest commits, recursive tree) and a
bounded set of raw files, runs `lib/github-analyzer.ts`, and writes one row per
finding to `session_live_doubts`. The row stores separate `manager_payload` and
`junior_payload` JSON documents. `v_live_manager` never selects `repo`, `ref`,
`head_sha`, `source_url` or the developer payload, so a manager query cannot
read a diff, path or SHA even if a handler forgot a check. A new ingestion
replaces that session's previous live findings; a webhook appends one finding
and is idempotent by delivery id.

One-click dispatch never trusts the browser for content. The route rebuilds the
artifact from the signed session's board, hashes it, signs it, persists it in
`session_integrations`, appends to the receipt chain and writes an audit event.
The manager SQL view omits the `artifact` column entirely. Only the developer
role may dispatch a GitHub PR; the manager receives `403` before any dispatch
work occurs. Both roles may dispatch Notion, but the manager response never
contains the artifact.

The receipt chain is computed at read time from `ledger_entries`: each entry
hashes `prevHash|seq|kind|doubtId|payloadJson|createdAt`, with a genesis hash
derived from the session id. The receipt signature is
`HMAC-SHA256(sessionRef|entryCount|rootHash)`. `GET /api/security/receipt`
recomputes every link, checks the signature and simulates a tamper on an
in-memory copy. `POST /api/security/receipt` verifies an exported `.relay.sig`
without ever mutating the live ledger.

The ingestion screen starts `POST /api/session` in parallel with its animation.
It only advances when **both** the animation and the real API response are done.
If the API fails it shows an error overlay with a retry button; it never falls
back to static data.

## Data model

`projects → doubts → evidence`, plus `doubts → resolutions` and
`doubts → doubt_files`.

Per-browser progress is isolated in `sessions` and `session_doubts`:

- `sessions.role` is the only role the API trusts.
- `session_doubts` stores `open | resolved | skipped` and the chosen resolution.
- `session_decisions` stores the human record: `decision_type`, `rationale`,
  `owner`, `signed_off`, `signoff_name` and `verification`
  (`pending | verified | waived`).
- `session_signals` stores judge-injected live signals with their audience and
  deterministic inputs (`polarity`, `relevance`).
- `session_ingestions` records each live GitHub fetch for a session: repo, ref,
  head SHA, `live | fallback` mode, files scanned, commits read and finding
  count.
- `session_live_doubts` stores ingested and webhook findings as session-scoped
  doubts. Manager and developer payloads are separate JSON columns, consumed
  through `v_live_manager` / `v_live_junior`.
- `session_integrations` stores each GitHub PR or Notion dispatch: target, mode
  (`live | sandbox`), reference, URL, HMAC signature and artifact SHA-256. The
  manager view excludes the artifact body.
- `ledger_entries` is the append-only SHA-256 chain, and `session_receipts`
  caches the latest entry count, root hash and HMAC signature.
- `audit_log` records session creation, role switches, resolves, verifies, skips,
  reopens, signal injections, fast-forwards, resets, GitHub ingestions, verified
  webhooks and integration dispatches. It is append-only from the application's
  point of view and its details never contain evidence text, source URLs or raw
  SHAs.

The seed is applied lazily on the first request and is idempotent. Deleting
`.data/relay.db` (or running `npm run db:reset`) recreates the original board.
Progress, decisions and signals are session-scoped, so the seeded 24-source
dataset and a fresh judge's security counts are never mutated by another demo.

## Security model

### 1. The role is not client input

The role lives in a `sessions` row. The browser holds only
`<uuid>.<role>.<hmac-sha256>` in an `HttpOnly` cookie. Every API route:

1. reads the cookie,
2. verifies the HMAC with `timingSafeEqual`,
3. loads the session row,
4. uses `session.role` to choose a projection.

`?role=junior` is read by the security probe but deliberately ignored. A tampered
signature returns `401`. There is no client-writable role anywhere in a query
string, body or local state that the server consults.

### 2. Row and column security is enforced in SQL

```sql
CREATE VIEW v_evidence_manager AS
SELECT id, doubt_id, position, source, author, authored_at, quote,
       audience, polarity, relevance, channel
FROM evidence
WHERE audience IN ('all', 'manager');
```

`v_evidence_manager` removes every `audience = 'junior'` row and never selects
`file_path`, `commit_ref`, `redacted` or `url`. `v_evidence_junior` does the
inverse. Even if a future handler forgot a field check, the sensitive columns are
not available to the manager query at all.

### 3. Two-way least privilege

| Data                         | Manager | Junior developer |
| ---------------------------- | ------- | ---------------- |
| Commercial `impact` object   | yes     | **no**           |
| `implementation` object      | **no**  | yes              |
| Code file paths / commits    | **no**  | yes              |
| Redacted secret values       | **no**  | yes              |
| Junior-only evidence rows    | **no**  | yes              |
| Manager-only evidence rows   | yes     | **no**           |

The projection functions do not build the object the role may not read, so keys
are absent from the JSON rather than empty or hidden by CSS.

### 4. Mutations are server-authoritative

The client sends only `{ action, resolutionId, decisionType, rationale, owner,
signoffName, signedOff }`. The server validates the doubt and resolution against
SQLite, writes `session_doubts` and `session_decisions`, and computes XP, streak
and readiness. It then returns a freshly projected board for the session's role.
A client cannot award itself XP, forge a sign-off or mark a doubt resolved by
editing local state.

`PATCH { action: "verify" }` is a separate transition: it requires an already
resolved doubt, promotes `verification` to `verified`, awards a small XP bonus
and writes `doubt.verify` to the audit log.

### 5. Live signals, remediation and audit obey the same boundary

- `POST /api/signals` validates the payload, caps the session at 12 signals, and
  writes the signal with an `audience` of `all | manager | junior`. The manager
  payload reads `v_signal_manager`; the developer payload reads
  `v_signal_junior`. A developer-only signal therefore never enters the manager
  JSON, and `meta.injectedSignalsLocked` makes the withholding visible.
- `GET /api/remediation/:id` returns a full patch, verification command, rollback
  plan and Day-1 steps only to the developer lens. The manager lens receives
  `allowed: false`, a reason and a manager checklist — no path, diff or shell
  command is ever serialized.
- `GET /api/security/audit` returns at most 60 session events with details capped
  at 160 characters. It records that a signal was injected without echoing the
  signal text, so the audit trail cannot become an exfiltration path.
- `POST /api/triage/fast-forward` resolves every open doubt with the curated
  recommendation and records each one as `decision=auto`. It is a judge
  accelerator, never a fake human decision, and `POST /api/triage/reset` clears
  progress, decisions and signals while retaining the audit history.

### 6. Signed sessions survive a cold start

The cookie value is `<uuid>.<role>.<hmac-sha256>` (legacy `<uuid>.<hmac>` tokens
are still accepted). The role is signed into the token only so an ephemeral
serverless instance can recreate a missing `sessions` row. When the row exists,
the database role is authoritative; a client cannot choose a role by editing the
token. This removes the mid-demo 401/404 failure mode without weakening the HMAC.

### 7. Proof, not presentation

`GET /api/security/verify` builds both projections on the server and returns
assertions and counts only — no quotes, paths, commits or secrets. The UI modal
shows those counts. The CLI proof goes further and inspects the **raw HTTP
payload**:

```bash
cd apps/web
npm run dev            # in one terminal
npm run verify:security
```

The script currently runs 72 assertions, including:

- the manager payload contains no `"filePath"`, `"commit"`, `"implementation"`,
  redacted keys or `relay-staging-2024!`;
- the manager receives 16 of 24 evidence rows (8 withheld by SQL);
- `?role=junior` does not widen a manager session;
- a forged HMAC cookie returns `401`;
- switching role returns the inverse projection;
- resolving a doubt persists status, decision type, rationale and named sign-off;
- `verify` persists `verification: verified` and awards server-side XP;
- a developer-only live signal never appears in the manager payload, and the
  security report counts zero cross-lens leaks;
- manager remediation omits `patch`, `verification`, `day1`, `rollback`, paths
  and the staging secret;
- the audit trail records `signal.inject` without echoing the injected quote;
- a fresh session starts clean, fast-forward resolves six doubts as `auto`, and
  reset returns readiness to zero;
- live GitHub ingestion attaches real SHA/file evidence, stays isolated to its
  signed session, and is fully redacted in the manager projection;
- simulated `push` and `pull_request` webhooks are HMAC-verified and append
  incrementally;
- developer GitHub PR dispatch is signed, while the manager receives a hard
  `403` with no diff; Notion sync respects the same role projection;
- the receipt chain verifies, and a POSTed tamper or mutated export reports the
  broken link while the live ledger stays clean;
- every protected endpoint returns `401` without a session.

## Round 3 Deliverables Implemented

1. **Real GitHub ingestion and signed webhooks.** `/api/github/ingest` turns a
   live public repository into session-scoped findings with real file paths,
   SHAs and diffs. `/api/github/webhook` verifies HMAC-SHA256 `push` and
   `pull_request` deliveries and appends idempotently. A second session never
   sees another session's live rows, and the manager SQL view omits all
   technical keys.
2. **One-click remediation dispatch.** `/api/integrations/github-pr` returns a
   signed server-built PR bundle for the developer lens and a hard `403` before
   any artifact work for managers. `/api/integrations/notion-sync` creates or
   sandbox-signs a role-filtered Notion page, withholding the artifact from the
   manager projection.
3. **Tamper-evident `.relay.sig` receipt.** `/api/security/receipt` exports a
   contiguous SHA-256 hash chain signed with HMAC-SHA256. POST verification
   accepts an exported receipt and `{ tamper: true }`, reports the first broken
   link and rejected signature, and never mutates the live ledger.

The verification suite now covers all three deliverables as **72** live HTTP
assertions.

## API

| Method | Path                       | Auth   | Purpose                                         |
| ------ | -------------------------- | ------ | ----------------------------------------------- |
| GET    | `/api/health`              | public | Live DB, seed counts, schema, resilience ladder |
| POST   | `/api/session`             | cookie | Create session or switch role; returns board    |
| GET    | `/api/triage`              | cookie | Role-filtered board                             |
| PATCH  | `/api/doubts/:id`          | cookie | `resolve`, `skip`, `reopen`, `verify`           |
| POST   | `/api/signals`             | cookie | Inject an audience-scoped live signal           |
| POST   | `/api/triage/fast-forward` | cookie | Resolve all doubts as audited `auto` decisions  |
| POST   | `/api/triage/reset`        | cookie | Clear this session's progress and signals       |
| GET    | `/api/remediation`         | cookie | All role-scoped remediation packages            |
| GET    | `/api/remediation/:id`     | cookie | One remediation package for the session role    |
| GET    | `/api/security/verify`     | cookie | Counts-only permission proof + signal boundary  |
| GET    | `/api/security/audit`      | cookie | Sanitized session audit trail                   |

All responses are `Cache-Control: no-store`. Errors are JSON:
`401 { "error": "unauthenticated" }`, `400 { "error": "invalid_action" }`, etc.

## Local development

```bash
cd apps/web
npm install
npm run dev            # http://localhost:3000
```

Useful commands:

```bash
npm run db:reset       # delete .data/relay.db; reseeds on next request
npm run verify:security
npm run build
npm start
```

Environment variables (all optional for the demo):

| Variable                 | Default                              | Notes                                  |
| ------------------------ | ------------------------------------ | -------------------------------------- |
| `RELAY_DB_PATH`          | `apps/web/.data/relay.db`            | Where the SQLite file lives            |
| `RELAY_SESSION_SECRET`   | built-in demo secret                 | **Set a strong value in production**   |
| `RELAY_INSECURE_COOKIES` | unset                                | Set to `1` to omit `Secure` in prod    |

## Production notes

This is a single-instance MVP, but it is deliberately resilient on hosted
preview platforms. The SQLite open path is a ladder:
`RELAY_DB_PATH` → `<cwd>/.data/relay.db` → `<tmpdir>/relay.db` → `:memory:`.
If every filesystem is read-only, the app still boots with a seeded in-memory
database instead of throwing `SQLITE_READONLY`. Because session ids remain
HMAC-signed, isolation survives that fallback, and the signed role in the token
can recreate a lost session row after a cold start.

SQLite and the in-process session secret are a deliberate fit for a hackathon
demo, not a multi-region deployment. Before shipping to real users:

1. Set `RELAY_SESSION_SECRET` to a long random value and rotate it.
2. Serve over HTTPS so the `Secure` cookie is always sent.
3. Move to a shared database (e.g. Postgres) if running more than one instance.
4. Drive identity from an SSO provider and map its groups to Relay roles instead
   of the demo role toggle.
5. Extend `audit_log` retention and monitoring.
