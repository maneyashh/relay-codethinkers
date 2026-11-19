/**
 * Relay SQLite schema.
 *
 * The security model lives here as well as in the API:
 *   - `v_evidence_manager` is a row + column security view. It excludes every
 *     `audience = 'junior'` row and never projects `file_path`, `commit_ref`,
 *     `diff`, `redacted` or `url`.
 *   - `v_evidence_junior` excludes `audience = 'manager'` rows.
 *   - `v_signal_manager` / `v_signal_junior` apply the same row + column policy
 *     to judge-injected live signals.
 *   - `v_live_manager` never selects repo, ref, SHA, source URL or the
 *     developer JSON payload. `v_live_junior` is the engineering projection.
 *   - `v_integration_manager` never selects the dispatched artifact.
 *
 * The API chooses a view from the *signed session role*, never from a query
 * string or request body. That is what makes the role toggle a permission
 * boundary instead of a CSS filter.
 *
 * `CREATE ... IF NOT EXISTS` keeps cold starts cheap and avoids concurrent
 * DDL churn on serverless filesystems. `PRAGMA user_version` tracks breaking
 * schema changes; `db/client.ts` performs additive migrations before the views
 * are recreated.
 */
export const SCHEMA_VERSION = 3;

export const BASE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  handover_date  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ingesting'
);

CREATE TABLE IF NOT EXISTS doubts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('hard_contradiction', 'missing_info')),
  severity         TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
  area             TEXT NOT NULL,
  title            TEXT NOT NULL,
  claim            TEXT NOT NULL,
  confidence       REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  engine_hint      TEXT NOT NULL,
  impact_budget    TEXT NOT NULL,
  impact_timeline  TEXT NOT NULL,
  impact_risk      TEXT NOT NULL,
  impl_owner       TEXT NOT NULL,
  impl_repo        TEXT NOT NULL,
  impl_branch      TEXT NOT NULL,
  impl_pr          TEXT NOT NULL,
  UNIQUE (project_id, position)
);

CREATE TABLE IF NOT EXISTS doubt_files (
  doubt_id  TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  path      TEXT NOT NULL,
  PRIMARY KEY (doubt_id, position)
);

CREATE TABLE IF NOT EXISTS resolutions (
  doubt_id       TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  resolution_id  INTEGER NOT NULL CHECK (resolution_id IN (1, 2, 3)),
  label          TEXT NOT NULL,
  description    TEXT NOT NULL,
  PRIMARY KEY (doubt_id, resolution_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id           TEXT PRIMARY KEY,
  doubt_id     TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('slack', 'github', 'notion', 'jira', 'code', 'email')),
  author       TEXT NOT NULL,
  authored_at  TEXT NOT NULL,
  quote        TEXT NOT NULL,
  redacted     TEXT,
  audience     TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'manager', 'junior')),
  polarity     TEXT NOT NULL DEFAULT 'context' CHECK (polarity IN ('supports', 'contradicts', 'context')),
  relevance    REAL NOT NULL DEFAULT 0.5 CHECK (relevance >= 0 AND relevance <= 1),
  channel      TEXT,
  file_path    TEXT,
  commit_ref   TEXT,
  diff         TEXT,
  url          TEXT,
  UNIQUE (doubt_id, position)
);

-- Per-session triage progress. A fresh browser session gets its own board.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'junior')),
  xp          INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_doubts (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  doubt_id      TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'skipped')),
  resolved_with INTEGER CHECK (resolved_with IN (1, 2, 3)),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (session_id, doubt_id)
);

-- Rich human-in-the-loop decision metadata. Kept separate from status so the
-- audit trail survives reopen / re-resolve cycles.
CREATE TABLE IF NOT EXISTS session_decisions (
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  doubt_id       TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  decision_type  TEXT NOT NULL DEFAULT 'standard'
                 CHECK (decision_type IN ('standard', 'confirm_blocker', 'accept_risk', 'escalate', 'verify', 'auto')),
  rationale      TEXT,
  owner          TEXT,
  signed_off     INTEGER NOT NULL DEFAULT 0 CHECK (signed_off IN (0, 1)),
  signoff_name   TEXT,
  verification   TEXT NOT NULL DEFAULT 'pending'
                 CHECK (verification IN ('pending', 'verified', 'waived')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (session_id, doubt_id)
);

-- Judge-injected live signals. Session-scoped and audience-scoped, so one
-- visitor can never widen another visitor's board or the seeded dataset.
CREATE TABLE IF NOT EXISTS session_signals (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  doubt_id    TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('slack', 'github', 'notion', 'jira', 'code', 'email')),
  author      TEXT NOT NULL,
  quote       TEXT NOT NULL,
  audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'manager', 'junior')),
  polarity    TEXT NOT NULL DEFAULT 'context' CHECK (polarity IN ('supports', 'contradicts', 'context')),
  relevance   REAL NOT NULL DEFAULT 0.5 CHECK (relevance >= 0 AND relevance <= 1),
  channel     TEXT,
  file_path   TEXT,
  commit_ref  TEXT,
  diff        TEXT,
  created_at  TEXT NOT NULL
);

-- Round 3 · live GitHub ingestion. One active ingestion per session; a new
-- ingest replaces the previous live doubts for that browser only.
CREATE TABLE IF NOT EXISTS session_ingestions (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  repo             TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  ref              TEXT NOT NULL,
  head_sha         TEXT,
  mode             TEXT NOT NULL CHECK (mode IN ('live', 'fallback')),
  source           TEXT NOT NULL CHECK (source IN ('preset', 'custom')),
  files_scanned    INTEGER NOT NULL DEFAULT 0,
  commits_read     INTEGER NOT NULL DEFAULT 0,
  findings         INTEGER NOT NULL DEFAULT 0,
  fallback_reason  TEXT,
  created_at       TEXT NOT NULL
);

-- GitHub findings become session-scoped doubts. The role payloads are stored
-- as JSON so the manager projection never has a column that could carry a
-- diff, commit SHA, URL or implementation object.
CREATE TABLE IF NOT EXISTS session_live_doubts (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id         TEXT NOT NULL,
  position           INTEGER NOT NULL,
  origin             TEXT NOT NULL CHECK (origin IN ('github', 'webhook')),
  repo               TEXT NOT NULL,
  ref                TEXT,
  head_sha           TEXT,
  source_url         TEXT,
  kind               TEXT NOT NULL CHECK (kind IN ('hard_contradiction', 'missing_info')),
  severity           TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
  area               TEXT NOT NULL,
  title              TEXT NOT NULL,
  claim              TEXT NOT NULL,
  confidence         REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  engine_hint_manager TEXT NOT NULL,
  engine_hint_junior  TEXT NOT NULL,
  manager_payload    TEXT NOT NULL,
  junior_payload     TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'skipped')),
  resolved_with      INTEGER CHECK (resolved_with IN (1, 2, 3)),
  decision_json      TEXT,
  created_at         TEXT NOT NULL,
  UNIQUE (session_id, position)
);

-- Round 3 · one-click dispatches. The artifact column is deliberately excluded
-- from the manager SQL view, even for a Notion page the manager themself triggered.
CREATE TABLE IF NOT EXISTS session_integrations (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  target           TEXT NOT NULL CHECK (target IN ('github', 'notion')),
  mode             TEXT NOT NULL CHECK (mode IN ('live', 'sandbox')),
  status           TEXT NOT NULL CHECK (status IN ('dispatched', 'failed')),
  reference        TEXT NOT NULL,
  url              TEXT,
  signature        TEXT NOT NULL,
  artifact_sha256  TEXT NOT NULL,
  artifact         TEXT NOT NULL,
  payload_json     TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

-- Round 3 · append-only SHA-256 hash chain. Every human decision, verification,
-- ingestion, webhook and dispatch adds one entry. The chain is per session.
CREATE TABLE IF NOT EXISTS ledger_entries (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  id            TEXT NOT NULL PRIMARY KEY,
  kind          TEXT NOT NULL,
  doubt_id      TEXT,
  payload_json  TEXT NOT NULL,
  prev_hash     TEXT NOT NULL,
  hash          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS session_receipts (
  session_id    TEXT NOT NULL PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  entry_count   INTEGER NOT NULL,
  root_hash     TEXT NOT NULL,
  signature     TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL,
  action      TEXT NOT NULL,
  doubt_id    TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_doubt ON evidence(doubt_id, position);
CREATE INDEX IF NOT EXISTS idx_evidence_audience ON evidence(audience);
CREATE INDEX IF NOT EXISTS idx_resolutions_doubt ON resolutions(doubt_id);
CREATE INDEX IF NOT EXISTS idx_session_doubts_session ON session_doubts(session_id);
CREATE INDEX IF NOT EXISTS idx_session_decisions_session ON session_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_signals_session ON session_signals(session_id, doubt_id);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ingestions_session ON session_ingestions(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_live_session ON session_live_doubts(session_id, position);
CREATE INDEX IF NOT EXISTS idx_integrations_session ON session_integrations(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger_entries(session_id, seq);
`;

export const VIEWS_SQL = `
DROP VIEW IF EXISTS v_evidence_manager;
DROP VIEW IF EXISTS v_evidence_junior;
DROP VIEW IF EXISTS v_signal_manager;
DROP VIEW IF EXISTS v_signal_junior;
DROP VIEW IF EXISTS v_live_manager;
DROP VIEW IF EXISTS v_live_junior;
DROP VIEW IF EXISTS v_integration_manager;
DROP VIEW IF EXISTS v_integration_junior;

CREATE VIEW v_evidence_manager AS
SELECT
  id, doubt_id, position, source, author, authored_at, quote,
  audience, polarity, relevance, channel
FROM evidence
WHERE audience IN ('all', 'manager');

CREATE VIEW v_evidence_junior AS
SELECT
  id, doubt_id, position, source, author, authored_at, quote, redacted,
  audience, polarity, relevance, channel, file_path, commit_ref, diff, url
FROM evidence
WHERE audience IN ('all', 'junior');

CREATE VIEW v_signal_manager AS
SELECT
  id, session_id, doubt_id, source, author, quote, audience, polarity,
  relevance, channel, created_at
FROM session_signals
WHERE audience IN ('all', 'manager');

CREATE VIEW v_signal_junior AS
SELECT
  id, session_id, doubt_id, source, author, quote, audience, polarity,
  relevance, channel, file_path, commit_ref, diff, created_at
FROM session_signals
WHERE audience IN ('all', 'junior');

CREATE VIEW v_live_manager AS
SELECT
  id, session_id, project_id, position, origin, kind, severity, area,
  title, claim, confidence, engine_hint_manager AS engine_hint,
  manager_payload AS payload, status, resolved_with, decision_json, created_at
FROM session_live_doubts;

CREATE VIEW v_live_junior AS
SELECT
  id, session_id, project_id, position, origin, kind, severity, area,
  title, claim, confidence, engine_hint_junior AS engine_hint,
  junior_payload AS payload, status, resolved_with, decision_json,
  repo, ref, head_sha, source_url, created_at
FROM session_live_doubts;

CREATE VIEW v_integration_manager AS
SELECT
  id, session_id, target, mode, status, reference, url, signature,
  artifact_sha256, created_at
FROM session_integrations;

CREATE VIEW v_integration_junior AS
SELECT
  id, session_id, target, mode, status, reference, url, signature,
  artifact_sha256, artifact, payload_json, created_at
FROM session_integrations;
`;

export const SCHEMA_SQL = `${BASE_SCHEMA_SQL}\n${VIEWS_SQL}`;
