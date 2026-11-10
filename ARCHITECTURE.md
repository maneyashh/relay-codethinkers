# Relay — Full-Stack MVP Architecture

Relay turns a team's contradictory handover evidence into a triage queue. The
original prototype was frontend-only: every doubt, quote, file path and secret
came from a static TypeScript module and the role toggle only changed CSS.

This version moves the narrative dataset into a real database and makes the role
a **server-enforced permission boundary**. The browser cannot request a role and
the manager JSON payload never contains developer evidence.

The active application is [`apps/web`](apps/web). The older `next-app/`,
`services/api/` and `supabase/` directories are unrelated prior scaffolding and
are not part of this MVP.

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
    api/triage/reset/       clear one session's progress
    api/doubts/[id]/        resolve / skip / reopen one doubt
    api/security/verify/    counts-only proof of the boundary
    api/health/             live database + seed check
  db/
    schema.ts               tables, constraints, role-scoped SQL views
    client.ts               lazy DB open + idempotent seed
    seed.json               the narrative dataset
    board.ts                projections + server-authoritative mutations
    session.ts              HMAC tokens and session records
    security.ts             projection comparison report
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
Browser ──► PATCH /api/doubts/:id ──► status/XP/streak/readiness computed server-side
```

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
- `audit_log` records session creation, role switches, resolves, skips, reopens
  and resets. It is append-only from the application's point of view.

The seed is applied lazily on the first request and is idempotent. Deleting
`.data/relay.db` (or running `npm run db:reset`) recreates the original board.

## Security model

### 1. The role is not client input

The role lives in a `sessions` row. The browser holds only
`<uuid>.<hmac-sha256>` in an `HttpOnly` cookie. Every API route:

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

The client sends only `{ action, resolutionId }`. The server validates the doubt
and resolution against SQLite, writes `session_doubts`, and computes XP, streak
and readiness. It then returns a freshly projected board for the session's role.
A client cannot award itself XP or mark a doubt resolved by editing local state.

### 5. Proof, not presentation

`GET /api/security/verify` builds both projections on the server and returns
assertions and counts only — no quotes, paths, commits or secrets. The UI modal
shows those counts. The CLI proof goes further and inspects the **raw HTTP
payload**:

```bash
cd apps/web
npm run dev            # in one terminal
npm run verify:security
```

The script asserts, among other things:

- the manager payload contains no `"filePath"`, `"commit"`, `"implementation"`,
  redacted keys or `relay-staging-2024!`;
- the manager receives 16 of 24 evidence rows (8 withheld by SQL);
- `?role=junior` does not widen a manager session;
- a forged HMAC cookie returns `401`;
- switching role returns the inverse projection;
- resolving a doubt persists and increases server-side XP.

## API

| Method | Path                   | Auth   | Purpose                                      |
| ------ | ---------------------- | ------ | -------------------------------------------- |
| GET    | `/api/health`          | public | Live DB, seed counts, storage                |
| POST   | `/api/session`         | cookie | Create session or switch role; returns board |
| GET    | `/api/triage`          | cookie | Role-filtered board                          |
| PATCH  | `/api/doubts/:id`      | cookie | `resolve`, `skip`, `reopen`; returns board   |
| POST   | `/api/triage/reset`    | cookie | Clear this session's progress                |
| GET    | `/api/security/verify` | cookie | Counts-only permission proof                 |

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

This is a single-instance MVP. SQLite and the in-process session secret are a
deliberate fit for a hackathon demo, not a multi-region deployment. Before
shipping to real users:

1. Set `RELAY_SESSION_SECRET` to a long random value and rotate it.
2. Serve over HTTPS so the `Secure` cookie is always sent.
3. Move to a shared database (e.g. Postgres) if running more than one instance.
4. Drive identity from an SSO provider and map its groups to Relay roles instead
   of the demo role toggle.
5. Extend `audit_log` retention and monitoring.
