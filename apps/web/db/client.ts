import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import seed from './seed.json';
import { SCHEMA_SQL } from './schema';

export const PROJECT_ID = 'relay-labs-v2';

export type StorageMode = 'sqlite' | 'memory';

const TMP_DB_PATH = join(tmpdir(), 'relay.db');

function preferredPath(): string {
  if (process.env.RELAY_DB_PATH) return process.env.RELAY_DB_PATH;

  // Serverless platforms mount the deployment directory read-only. Try the
  // project-local file first (great for local dev), then fall back to /tmp.
  const local = join(process.cwd(), '.data', 'relay.db');
  try {
    mkdirSync(dirname(local), { recursive: true });
    return local;
  } catch {
    return TMP_DB_PATH;
  }
}

type SeededEvidence = {
  id: string;
  source: string;
  author: string;
  timestamp: string;
  quote: string;
  redacted?: string;
  audience?: 'all' | 'manager' | 'junior';
  polarity?: 'supports' | 'contradicts' | 'context';
  relevance?: number;
  channel?: string;
  filePath?: string;
  commit?: string;
  url?: string;
};

type SeededDoubt = {
  id: string;
  kind: 'hard_contradiction' | 'missing_info';
  severity: 'critical' | 'high' | 'medium';
  area: string;
  title: string;
  claim: string;
  confidence: number;
  engineHint: string;
  evidence: SeededEvidence[];
  resolutions: { id: 1 | 2 | 3; label: string; description: string }[];
  impact: { budget: string; timeline: string; risk: string };
  implementation: {
    owner: string;
    repo: string;
    branch: string;
    pr: string;
    files: string[];
  };
};

const SEED = seed as unknown as SeededDoubt[];

type RelayGlobal = typeof globalThis & {
  __relayDb?: DatabaseSync;
  __relayStorageMode?: StorageMode;
  __relayDbPath?: string;
};

const globalForDb = globalThis as RelayGlobal;

/**
 * Lazily open the database on the first API request. Keeping this out of module
 * scope means `next build` can analyse route handlers without creating files.
 *
 * Resilience ladder:
 *   1. `RELAY_DB_PATH` (explicit operator choice)
 *   2. `<cwd>/.data/relay.db` (local / persistent VM)
 *   3. `<tmpdir>/relay.db` (Vercel, Lambda, read-only deployments)
 *   4. `:memory:` (last resort; the app still boots and seeds itself)
 */
function openAt(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA_SQL);
  seedIfEmpty(db);
  return db;
}

function openDatabase(): { db: DatabaseSync; path: string; mode: StorageMode } {
  const primary = preferredPath();
  const candidates = primary === TMP_DB_PATH ? [primary] : [primary, TMP_DB_PATH];

  for (const candidate of candidates) {
    try {
      const db = openAt(candidate);
      return { db, path: candidate, mode: 'sqlite' };
    } catch (error) {
      console.warn(
        `[relay] could not open SQLite at ${candidate}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Never crash a judge's session because a serverless filesystem is
  // read-only. The in-memory database seeds instantly and every session remains
  // isolated because session ids are still HMAC-signed.
  const db = openAt(':memory:');
  return { db, path: ':memory:', mode: 'memory' };
}

export function getDb(): DatabaseSync {
  if (globalForDb.__relayDb) return globalForDb.__relayDb;

  const { db, path, mode } = openDatabase();
  globalForDb.__relayDb = db;
  globalForDb.__relayDbPath = path;
  globalForDb.__relayStorageMode = mode;
  return db;
}

export function getDatabasePath(): string {
  return globalForDb.__relayDbPath ?? preferredPath();
}

export function getStorageMode(): StorageMode {
  if (!globalForDb.__relayDb) getDb();
  return globalForDb.__relayStorageMode ?? 'sqlite';
}

function seedIfEmpty(db: DatabaseSync) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM doubts').get() as
    | { n: number | bigint }
    | undefined;
  if (row && Number(row.n) > 0) return;

  const now = new Date().toISOString();

  const insertProject = db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, slug, handover_date, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertDoubt = db.prepare(`
    INSERT OR IGNORE INTO doubts (
      id, project_id, position, kind, severity, area, title, claim,
      confidence, engine_hint, impact_budget, impact_timeline, impact_risk,
      impl_owner, impl_repo, impl_branch, impl_pr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvidence = db.prepare(`
    INSERT OR IGNORE INTO evidence (
      id, doubt_id, position, source, author, authored_at, quote, redacted,
      audience, polarity, relevance, channel, file_path, commit_ref, url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertResolution = db.prepare(`
    INSERT OR IGNORE INTO resolutions (doubt_id, resolution_id, label, description)
    VALUES (?, ?, ?, ?)
  `);
  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO doubt_files (doubt_id, position, path) VALUES (?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    insertProject.run(
      PROJECT_ID,
      'relay-labs · v2 handover',
      'relay-labs',
      '2026-11-20',
      'ingesting',
    );

    SEED.forEach((doubt, doubtIndex) => {
      insertDoubt.run(
        doubt.id,
        PROJECT_ID,
        doubtIndex,
        doubt.kind,
        doubt.severity,
        doubt.area,
        doubt.title,
        doubt.claim,
        doubt.confidence,
        doubt.engineHint,
        doubt.impact.budget,
        doubt.impact.timeline,
        doubt.impact.risk,
        doubt.implementation.owner,
        doubt.implementation.repo,
        doubt.implementation.branch,
        doubt.implementation.pr,
      );

      doubt.evidence.forEach((item, evidenceIndex) => {
        insertEvidence.run(
          item.id,
          doubt.id,
          evidenceIndex,
          item.source,
          item.author,
          item.timestamp,
          item.quote,
          item.redacted ?? null,
          item.audience ?? 'all',
          item.polarity ?? 'context',
          item.relevance ?? 0.5,
          item.channel ?? null,
          item.filePath ?? null,
          item.commit ?? null,
          item.url ?? null,
        );
      });

      doubt.resolutions.forEach((resolution) => {
        insertResolution.run(
          doubt.id,
          resolution.id,
          resolution.label,
          resolution.description,
        );
      });

      doubt.implementation.files.forEach((path, fileIndex) => {
        insertFile.run(doubt.id, fileIndex, path);
      });
    });

    db.prepare(
      `INSERT INTO audit_log (session_id, role, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('system', 'system', 'db.seed', `${SEED.length} doubts loaded`, now);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
