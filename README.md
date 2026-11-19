# Relay — Round 3 Finalist Build

> **Start here → [`JUDGE_GUIDE.md`](JUDGE_GUIDE.md).** A 90-second route through
> the three judged improvements, with the exact clicks, cURL proofs, and tough
> questions answered.

> **Round 3 Promise vs. Proof Scorecard.** Every Round 2 commitment is mapped
> to the Round 3 implementation, the API route that proves it, and the
> one-command verification suite.

| Round 2 promise | Round 3 implementation | API route | Live proof |
| --- | --- | --- | --- |
| "Real repository ingestion is coming." | `apps/web/lib/github-fetch.ts` fetches the public GitHub REST API; `apps/web/lib/github-analyzer.ts` derives deterministic drift findings; `apps/web/db/github.ts` persists them per signed session. | `POST /api/github/ingest` | Self-scan preset **`maneyashh/relay-codethinkers`** (id `relay`) is the #1 featured preset in the Ingest studio and Judge HUD Stage 2. |
| "Webhooks will be verified, not mocked." | HMAC-SHA256 delivery verification in `apps/web/app/api/github/webhook/route.ts`, idempotent by delivery id, with live findings appended incrementally. | `POST /api/github/webhook` | Judge HUD Stage 2 fires a signed `push` and shows the delivery signature + injected contradiction. |
| "One-click PR and Notion buttons will execute." | `apps/web/lib/integrations.ts` builds the artifact, patch and dispatch signature server-side; `apps/web/db/security.ts` enforces the `v_evidence_manager` / `v_evidence_junior` boundary. | `POST /api/integrations/github-pr`, `POST /api/integrations/notion-sync` | Manager dispatch returns a hard **403** with zero diff leakage; junior dispatch returns a signed branch, artifact SHA-256, unified diff and Notion block preview. Judge HUD Stage 3. |
| "Progressive disclosure will ship, not just be described." | `apps/web/components/triage/JudgeWalkthrough.tsx` drives Guided Focus vs. Full War-Room mode and inspects the live HMAC session projection. | Signed session via `POST /api/session` | Judge HUD Stage 1 flips the real board behind the overlay. |
| "Every decision will be tamper-evident." | `apps/web/lib/crypto-ledger.ts` maintains the append-only `SHA-256(prevHash + seq + kind + doubtId + canonicalPayload + createdAt)` chain signed with HMAC-SHA256. | `GET /api/security/receipt`, `POST /api/security/receipt` | Judge HUD Stage 4 fetches the green chain, runs a rogue tamper attack, and shows `Expected vs. Tampered` root hash with `HMAC: REJECTED`. |
| "The whole loop will be verifiable in one command." | `apps/web/scripts/verify-security.mjs` exercises the real route handlers over HTTP. | `/api/health`, `/api/security/*`, `/api/integrations/*`, `/api/github/*` | `npm run verify:security` → **72/72 checks passed**. |

**Run the proof**

```bash
cd apps/web
npm install
npm run dev            # http://localhost:3000
npm run verify:security  # 72/72 checks passed
```

The full design and judge route live in [`apps/web/README.md`](apps/web/README.md)
and [`ARCHITECTURE.md`](ARCHITECTURE.md). No external service or API key is
required; live GitHub ingestion works unauthenticated, and every dispatch falls
back to a cryptographically signed sandbox record.
