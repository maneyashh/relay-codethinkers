import type { NextRequest } from 'next/server';

import type {
  ReceiptResponse,
  RelayReceipt,
} from '@/lib/api-types';
import {
  ledgerSummary,
  simulateTamper,
  verifyExternalReceipt,
  verifySessionLedger,
} from '@/lib/crypto-ledger';
import {
  jsonNoStore,
  requestSession,
  unauthorized,
} from '@/server/http';

/**
 * GET /api/security/receipt
 *
 * Export the session's SHA-256 hash chain plus a full verification and a
 * *read-only* tamper simulation. The simulator mutates a copy in memory and
 * never touches the stored ledger, so the next GET is clean again.
 */
export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  const { receipt, verification } = verifySessionLedger(session.id);
  const payload: ReceiptResponse = {
    receipt,
    verification,
    tamper: simulateTamper(receipt),
    ledger: ledgerSummary(session.id),
  };
  return jsonNoStore(payload);
}

/**
 * POST /api/security/receipt
 *
 * Verify a receipt that arrived over the wire (for example an exported
 * `.relay.sig` file). The API recomputes every link and the HMAC signature.
 * Body: `{ receipt: RelayReceipt, tamper?: boolean }`.
 */
export async function POST(request: NextRequest) {
  const session = requestSession(request);
  if (!session) return unauthorized();

  let body: { receipt?: RelayReceipt; tamper?: boolean } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') {
      body = parsed as { receipt?: RelayReceipt; tamper?: boolean };
    }
  } catch {
    return jsonNoStore({ error: 'invalid_json' }, { status: 400 });
  }

  const receipt = body.receipt;
  if (
    !receipt ||
    receipt.artifact !== 'relay-handover-receipt' ||
    !Array.isArray(receipt.entries) ||
    typeof receipt.genesisHash !== 'string' ||
    typeof receipt.sessionRef !== 'string' ||
    typeof receipt.signature !== 'string'
  ) {
    return jsonNoStore(
      {
        error: 'invalid_receipt',
        hint: 'Send { receipt: RelayReceipt } exported from GET /api/security/receipt',
      },
      { status: 400 },
    );
  }

  const verification = verifyExternalReceipt(receipt);

  return jsonNoStore({
    ok: verification.ok,
    verification,
    tamper: body.tamper ? simulateTamper(receipt) : null,
  });
}
