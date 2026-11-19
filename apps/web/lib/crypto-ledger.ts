import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type {
  LedgerEntryView,
  ReceiptTamperReport,
  ReceiptVerification,
  RelayReceipt,
} from '@/lib/api-types';
import { getDb } from '@/db/client';

/**
 * Relay's receipt ledger is a per-session SHA-256 hash chain.
 *
 * This module is server-only. It is never imported by a client component; the
 * browser receives an exportable receipt, never the signing secret.
 *
 *   genesis  = SHA-256("relay-ledger-genesis-v1|<sessionId>")
 *   entry    = SHA-256(prevHash|seq|kind|doubtId|payloadJson|createdAt)
 *   root     = hash of the last entry (or genesis when the chain is empty)
 *   signature= HMAC-SHA256(sessionRef|entryCount|rootHash)
 */

const GENESIS_PREFIX = 'relay-ledger-genesis-v1';
const RECEIPT_PREFIX = 'relay-handover-receipt-v1';

export const CHAIN_FORMULA =
  'sha256(prevHash + "|" + seq + "|" + kind + "|" + doubtId + "|" + payloadJson + "|" + createdAt)';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function receiptSecret(): string {
  return (
    process.env.RELAY_RECEIPT_SECRET ??
    process.env.RELAY_SESSION_SECRET ??
    'relay-demo-2026-local-hmac-secret-do-not-use-in-production'
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Deterministic JSON: object keys are sorted at every depth. */
export function canonicalJson(value: unknown): string {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.keys(node as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = walk((node as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return node;
  };
  return JSON.stringify(walk(value));
}

export function sessionRefFor(sessionId: string): string {
  return `relay-${sha256Hex(`${RECEIPT_PREFIX}|session|${sessionId}`).slice(0, 20)}`;
}

export function genesisHashFor(sessionId: string): string {
  return sha256Hex(`${GENESIS_PREFIX}|${sessionId}`);
}

export function entryHash(input: {
  prevHash: string;
  seq: number;
  kind: string;
  doubtId: string | null;
  payloadJson: string;
  createdAt: string;
}): string {
  return sha256Hex(
    [
      input.prevHash,
      input.seq,
      input.kind,
      input.doubtId ?? '',
      input.payloadJson,
      input.createdAt,
    ].join('|'),
  );
}

export function signReceipt(
  sessionRef: string,
  entryCount: number,
  rootHash: string,
): string {
  return createHmac('sha256', receiptSecret())
    .update(`${sessionRef}|${entryCount}|${rootHash}`)
    .digest('base64url');
}

interface LedgerRow {
  seq: number | bigint;
  id: string;
  kind: string;
  doubt_id: string | null;
  payload_json: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

function rowsFor(sessionId: string): LedgerRow[] {
  return getDb()
    .prepare(
      `SELECT seq, id, kind, doubt_id, payload_json, prev_hash, hash, created_at
       FROM ledger_entries WHERE session_id = ? ORDER BY seq`,
    )
    .all(sessionId) as unknown as LedgerRow[];
}

export function appendLedgerEntry(
  sessionId: string,
  kind: string,
  doubtId: string | null,
  payload: Record<string, unknown>,
): LedgerEntryView {
  const db = getDb();
  const last = db
    .prepare(
      `SELECT seq, hash FROM ledger_entries
       WHERE session_id = ? ORDER BY seq DESC LIMIT 1`,
    )
    .get(sessionId) as { seq: number | bigint; hash: string } | undefined;

  const seq = last ? Number(last.seq) + 1 : 1;
  const prevHash = last?.hash ?? genesisHashFor(sessionId);
  const payloadJson = canonicalJson(payload);
  const createdAt = new Date().toISOString();
  const hash = entryHash({
    prevHash,
    seq,
    kind,
    doubtId,
    payloadJson,
    createdAt,
  });

  db.prepare(
    `INSERT INTO ledger_entries (
       session_id, seq, id, kind, doubt_id, payload_json, prev_hash, hash, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    seq,
    `ledger-${randomUUID()}`,
    kind,
    doubtId,
    payloadJson,
    prevHash,
    hash,
    createdAt,
  );

  persistReceiptSnapshot(sessionId);

  return {
    seq,
    kind,
    doubtId,
    payload: JSON.parse(payloadJson) as Record<string, unknown>,
    prevHash,
    hash,
    createdAt,
  };
}

function persistReceiptSnapshot(sessionId: string): void {
  const rows = rowsFor(sessionId);
  const rootHash = rows.length
    ? rows[rows.length - 1].hash
    : genesisHashFor(sessionId);
  const sessionRef = sessionRefFor(sessionId);
  const signature = signReceipt(sessionRef, rows.length, rootHash);

  getDb()
    .prepare(
      `INSERT INTO session_receipts (
         session_id, entry_count, root_hash, signature, created_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         entry_count = excluded.entry_count,
         root_hash = excluded.root_hash,
         signature = excluded.signature,
         created_at = excluded.created_at`,
    )
    .run(
      sessionId,
      rows.length,
      rootHash,
      signature,
      new Date().toISOString(),
    );
}

function toView(row: LedgerRow): LedgerEntryView {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = { unparsable: true };
  }
  return {
    seq: Number(row.seq),
    kind: row.kind,
    doubtId: row.doubt_id,
    payload,
    prevHash: row.prev_hash,
    hash: row.hash,
    createdAt: row.created_at,
  };
}

export function buildReceipt(sessionId: string): RelayReceipt {
  const entries = rowsFor(sessionId).map(toView);
  const entryCount = entries.length;
  const genesisHash = genesisHashFor(sessionId);
  const rootHash = entryCount ? entries[entryCount - 1].hash : genesisHash;
  const sessionRef = sessionRefFor(sessionId);

  return {
    artifact: 'relay-handover-receipt',
    version: 1,
    algorithm: 'SHA-256',
    chainFormula: CHAIN_FORMULA,
    sessionRef,
    entryCount,
    genesisHash,
    rootHash,
    signature: signReceipt(sessionRef, entryCount, rootHash),
    signatureAlgorithm: 'HMAC-SHA256',
    generatedAt: new Date().toISOString(),
    entries,
  };
}

/**
 * Recompute every hash and the chain links from the stored fields. A receipt
 * mutated in transit fails on both the first changed hash and the root
 * signature.
 */
export function verifyEntries(
  entries: LedgerEntryView[],
  genesisHash: string,
  sessionRef: string,
  signature: string,
): ReceiptVerification {
  let prevHash = genesisHash;
  let brokenAt: number | null = null;
  let invalidHashes = 0;
  let checkedHashes = 0;

  for (const entry of entries) {
    checkedHashes += 1;
    const payloadJson = canonicalJson(entry.payload);
    const expected = entryHash({
      prevHash,
      seq: entry.seq,
      kind: entry.kind,
      doubtId: entry.doubtId,
      payloadJson,
      createdAt: entry.createdAt,
    });

    if (entry.prevHash !== prevHash || entry.hash !== expected) {
      invalidHashes += 1;
      if (brokenAt === null) brokenAt = entry.seq;
    }
    prevHash = expected;
  }

  const rootHash = entries.length ? prevHash : genesisHash;
  const signatureValid = safeEqual(
    signature,
    signReceipt(sessionRef, entries.length, rootHash),
  );

  const ok = invalidHashes === 0 && signatureValid;
  return {
    ok,
    entryCount: entries.length,
    rootHash,
    genesisHash,
    checkedHashes,
    invalidHashes,
    brokenAt,
    signatureValid,
    signature,
    detail: ok
      ? `${entries.length} SHA-256 links verified · HMAC signature valid`
      : brokenAt === null
        ? 'HMAC signature does not match the receipt root'
        : `Chain broken at sequence ${brokenAt} · ${invalidHashes} invalid hash${
            invalidHashes === 1 ? '' : 'es'
          }`,
  };
}

export function verifySessionLedger(
  sessionId: string,
): { receipt: RelayReceipt; verification: ReceiptVerification } {
  const receipt = buildReceipt(sessionId);
  const verification = verifyEntries(
    receipt.entries,
    receipt.genesisHash,
    receipt.sessionRef,
    receipt.signature,
  );
  return { receipt, verification };
}

/**
 * Verify a receipt that arrived over the wire (POST /api/security/receipt).
 * Signature comparison uses a constant-time check inside `verifyEntries`.
 */
export function verifyExternalReceipt(
  receipt: RelayReceipt,
): ReceiptVerification {
  return verifyEntries(
    receipt.entries,
    receipt.genesisHash,
    receipt.sessionRef,
    receipt.signature,
  );
}

/**
 * Mutate a middle entry *in memory only*. The stored hash and prevHash are left
 * untouched, which is exactly how a tampered export breaks. The live ledger is
 * never changed by the simulator.
 */
export function simulateTamper(receipt: RelayReceipt): ReceiptTamperReport {
  if (receipt.entries.length === 0) {
    return {
      tamperAt: null,
      field: null,
      verification: verifyExternalReceipt(receipt),
      expectedRootHash: receipt.rootHash,
      tamperedRootHash: receipt.rootHash,
    };
  }

  const index = Math.max(0, Math.floor((receipt.entries.length - 1) / 2));
  const entries = receipt.entries.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    return {
      ...entry,
      payload: {
        ...entry.payload,
        relayTamperSimulation: 'decision changed after sign-off',
      },
    };
  });

  const tampered: RelayReceipt = {
    ...receipt,
    entries,
    generatedAt: new Date().toISOString(),
  };
  const verification = verifyExternalReceipt(tampered);

  return {
    tamperAt: entries[index].seq,
    field: 'payload.relayTamperSimulation',
    verification,
    expectedRootHash: receipt.rootHash,
    tamperedRootHash: verification.rootHash,
  };
}

export function ledgerSummary(sessionId: string): {
  entries: number;
  rootHash: string;
  signature: string;
  verified: boolean;
} {
  const { receipt, verification } = verifySessionLedger(sessionId);
  return {
    entries: receipt.entryCount,
    rootHash: receipt.rootHash,
    signature: receipt.signature,
    verified: verification.ok,
  };
}
