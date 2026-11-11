/**
 * Relay SQLite schema.
 *
 * The security model lives here as well as in the API:
 *   - `v_evidence_manager` is a row + column security view. It excludes every
 *     `audience = 'junior'` row and never projects `file_path`, `commit_ref`,
 *     `redacted` or `url`.
 *   - `v_evidence_junior` excludes `audience = 'manager'` rows.
 *   - `v_signal_manager` / `v_signal_junior` apply the same row + column policy
 *     to judge-injected live signals.
 *
 * The API chooses a view from the *signed session role*, never from a query
 * string or request body. That is what makes the role toggle a permission
 * boundary instead of a CSS filter.
 *
 * `CREATE ... IF NOT EXISTS` keeps cold starts cheap and avoids concurrent
 * DDL churn on serverless filesystems. Set `PRAGMA user_version` when a
 * breaking schema change needs an explicit migration.
 */
export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
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
  created_at  TEXT NOT NULL
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

-- ---------------------------------------------------------------------------
-- Role-scoped security views (the database half of the permission boundary)
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_evidence_manager AS
SELECT
  id, doubt_id, position, source, author, authored_at, quote,
  audience, polarity, relevance, channel
FROM evidence
WHERE audience IN ('all', 'manager');

CREATE VIEW IF NOT EXISTS v_evidence_junior AS
SELECT
  id, doubt_id, position, source, author, authored_at, quote, redacted,
  audience, polarity, relevance, channel, file_path, commit_ref, url
FROM evidence
WHERE audience IN ('all', 'junior');

CREATE VIEW IF NOT EXISTS v_signal_manager AS
SELECT
  id, session_id, doubt_id, source, author, quote, audience, polarity,
  relevance, channel, created_at
FROM session_signals
WHERE audience IN ('all', 'manager');

CREATE VIEW IF NOT EXISTS v_signal_junior AS
SELECT
  id, session_id, doubt_id, source, author, quote, audience, polarity,
  relevance, channel, file_path, commit_ref, created_at
FROM session_signals
WHERE audience IN ('all', 'junior');

CREATE INDEX IF NOT EXISTS idx_evidence_doubt ON evidence(doubt_id, position);
CREATE INDEX IF NOT EXISTS idx_evidence_audience ON evidence(audience);
CREATE INDEX IF NOT EXISTS idx_resolutions_doubt ON resolutions(doubt_id);
CREATE INDEX IF NOT EXISTS idx_session_doubts_session ON session_doubts(session_id);
CREATE INDEX IF NOT EXISTS idx_session_decisions_session ON session_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_signals_session ON session_signals(session_id, doubt_id);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id, created_at);

PRAGMA user_version = ${SCHEMA_VERSION};
`;
