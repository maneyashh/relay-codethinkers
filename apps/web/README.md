# Relay — web app

Relay turns scattered, contradictory handover evidence into a traceable decision
record. Scattered sources become doubts, doubts become human decisions, and
decisions become a verified handover artifact.

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
2. **Ingest** — watch 24 real sources from Slack, GitHub, Notion, Jira, code and
   email collapse into six contradictions.
3. **Triage** — open a doubt, read the conflicting quotes, and record a decision
   with type, rationale, owner and sign-off.
4. **Inject a live signal** — press `C` (or **Inject** in the top bar) and watch
   confidence move deterministically, with the formula shown.
5. **Ask Relay** — press `⌘K` and interrogate a doubt with citations back to the
   exact evidence row.
6. **Security inspector** — open **API-secured** and inspect the boundary,
   payload diff, live signal isolation and audit trail.
7. **Switch lens** — change to Manager and watch implementation paths, patches
   and developer-only signals disappear from the payload.
8. **Handover** — verify decisions, review the Day-1 plan, and export JSON,
   Markdown or the remediation patch.

Press `?` anywhere on the board for the keyboard map, **Fast-forward** to apply
the curated accelerator, and **Reset** to return to a clean board.

## Prove the security boundary

With the app running:

```bash
npm run verify:security
```

The script talks to the real route handlers over HTTP and never imports the
database. It runs 46 checks, including:

- the manager payload contains no file paths, commits, implementation objects,
  redacted values or the staging secret;
- SQL withholds 8 of 24 evidence rows from the manager;
- `?role=junior` is ignored and a forged HMAC cookie returns 401;
- a role switch returns the inverse projection;
- a developer-only live signal never appears in the manager payload;
- manager remediation withholds patches, commands and file paths;
- the audit trail records actions without echoing evidence text;
- fast-forward resolves all six doubts as `auto` decisions and reset clears them;
- every protected endpoint rejects an anonymous browser.

In the app, the **API-secured** badge in the triage top bar opens the same probe
as a counts-only report with a payload diff, live-signal boundary and sanitized
audit trail.

## API

| Method | Path                      | Purpose                                         |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/api/health`             | Live DB, seed counts, schema and resilience     |
| POST   | `/api/session`            | Create session / switch role, return board      |
| GET    | `/api/triage`             | Role-filtered board for the signed session      |
| PATCH  | `/api/doubts/:id`         | Resolve, skip, reopen or verify a decision      |
| POST   | `/api/signals`            | Inject a session-scoped, audience-scoped signal  |
| POST   | `/api/triage/fast-forward`| Resolve every doubt as an audited `auto` decision|
| POST   | `/api/triage/reset`       | Clear this session's progress and signals       |
| GET    | `/api/remediation`        | Role-scoped remediation packages                |
| GET    | `/api/remediation/:id`    | One remediation package for the session role    |
| GET    | `/api/security/verify`    | Counts-only permission proof                    |
| GET    | `/api/security/audit`     | Sanitized, session-scoped audit trail           |

All responses are `Cache-Control: no-store`. Errors are JSON with a stable
`error` code.

## Scripts

```bash
npm run dev             # development server
npm run build           # production build (also runs TypeScript)
npm start               # serve the production build
npm run db:reset        # delete the SQLite file; reseeds next request
npm run verify:security # end-to-end permission test against a running server
```

## Environment

| Variable                 | Default              | Purpose                              |
| ------------------------ | -------------------- | ------------------------------------ |
| `RELAY_DB_PATH`          | `.data/relay.db`     | SQLite file location                 |
| `RELAY_SESSION_SECRET`   | built-in demo secret | Set a strong value in production     |
| `RELAY_INSECURE_COOKIES` | unset                | `1` omits `Secure` in production     |

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

- `db/schema.ts` — tables, constraints and role-scoped SQL views.
- `db/board.ts` — role projections, decisions, signals, fast-forward and reset.
- `db/session.ts` — HMAC cookie tokens, role recovery and session records.
- `db/security.ts` — projection comparison and sanitized audit reports.
- `lib/synthesis.ts` — the shared deterministic confidence formula.
- `lib/remediation.ts` — server-only patches, verification, rollback and Day-1.
- `stores/triage.ts` — Zustand store; all data comes from the API.
- `components/triage/` — board, blast radius, security inspector, remediation.
- `components/flow/` — landing, ingestion and handover artifact.
- `scripts/verify-security.mjs` — raw-payload proof.
