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

- **Chaos in:** session-scoped live signal injection from Slack, GitHub, Notion,
  Jira, code or email, with deterministic confidence synthesis.
- **Human decisions:** decision type, rationale, owner, named sign-off and a
  separate verification state are persisted per doubt.
- **Evidence-grounded interrogation:** asking about a doubt returns its
  conflicting citations, not an ungrounded answer.
- **Role-scoped remediation:** patches, verification commands and Day-1 plans
  exist only for the developer lens; the manager receives a checklist and a
  reason, never a path or a diff.
- **Verified handover:** decision ledger, Day-1 plan, JSON, Markdown and patch
  exports, plus a judge accelerator that is explicitly audited as `auto`.
- **Inspectable security:** a four-tab proof surface (boundary, payload diff,
  live signals, audit trail) backed by the same server probe the CLI runs.

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
    api/remediation/        role-scoped remediation corpus
    api/security/verify/    counts-only proof of the boundary
    api/security/audit/     sanitized session audit trail
    api/health/             live database + resilience check
  db/
    schema.ts               tables, constraints, role-scoped SQL views
    client.ts               lazy DB open + resilience ladder + idempotent seed
    seed.json               the narrative dataset
    board.ts                projections, decisions, signals, fast-forward, reset
    session.ts              HMAC tokens, signed-role revival, session records
    security.ts             projection comparison + sanitized audit report
  lib/
    synthesis.ts            shared deterministic confidence formula
    remediation.ts          server-only patches, verification, rollback, Day-1
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
```

Live signals are written to `session_signals`, never to the seeded `evidence`
table. They are read back through `v_signal_manager` / `v_signal_junior`, so a
developer-only signal is absent from the manager payload rather than filtered in
the browser. Confidence is recomputed from fixed weights
(`contradicts +0.10`, `context +0.03`, `supports −0.06`, scaled by relevance and
clamped to `0.45..0.995`), and the formula is rendered beside the result.

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
- `audit_log` records session creation, role switches, resolves, verifies, skips,
  reopens, signal injections, fast-forwards and resets. It is append-only from
  the application's point of view and its details never contain evidence text.

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

The script currently runs 46 assertions, including:

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
- every protected endpoint returns `401` without a session.

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
