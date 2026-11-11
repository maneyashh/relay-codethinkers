import { basename } from 'node:path';

import { connection } from 'next/server';

import { getDatabasePath, getDb, getStorageMode } from '@/db/client';
import { SCHEMA_VERSION } from '@/db/schema';
import { jsonNoStore } from '@/server/http';

/**
 * GET /api/health — quick proof that the database, seed and storage
 * resilience ladder are live.
 *
 * `connection()` keeps this handler out of prerendering. `node:sqlite` is a
 * synchronous driver, so without it Next.js would snapshot the counts at build
 * time instead of reading the live database.
 */
export async function GET() {
  await connection();

  const db = getDb();
  const count = (table: string) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
      | { n: number | bigint }
      | undefined;
    return row ? Number(row.n) : 0;
  };

  return jsonNoStore({
    ok: true,
    service: 'relay-api',
    storage: `${getStorageMode()} (${getStorageMode() === 'sqlite' ? 'node:sqlite' : 'safe in-memory fallback'})`,
    database: basename(getDatabasePath()),
    schemaVersion: SCHEMA_VERSION,
    resilience: {
      pathLadder: [
        'RELAY_DB_PATH',
        '<cwd>/.data/relay.db',
        '<tmpdir>/relay.db',
        ':memory:',
      ],
      readOnlySafe: true,
      signedSessionRevival: true,
      sessionIsolation: 'per-browser HMAC-signed session id',
      judgeSessionsDoNotShareProgress: true,
    },
    security: {
      sessions: 'HMAC-SHA256 signed HttpOnly cookie',
      rowFiltering: 'role-scoped SQL views',
      signalFiltering: 'role-scoped session signal views',
      serverAuthoritative: [
        'status',
        'xp',
        'streak',
        'readiness',
        'decision metadata',
        'confidence synthesis',
      ],
    },
    counts: {
      doubts: count('doubts'),
      evidence: count('evidence'),
      resolutions: count('resolutions'),
      sessions: count('sessions'),
      signals: count('session_signals'),
      decisions: count('session_decisions'),
      auditEvents: count('audit_log'),
    },
  });
}
