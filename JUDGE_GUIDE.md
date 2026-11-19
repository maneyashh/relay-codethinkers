# Relay — The Judge's 90-Second Guide

> **Read this first.** Relay is a handover intelligence platform that turns
> contradictory engineering evidence into a **role-appropriate, tamper-evident
> decision record**. The interface is deliberately dense — this guide tells you
> exactly what to click, what to look for, and how to verify every claim without
> trusting us.

---

## 1. What Relay does (one paragraph)

When a team hands over a system, the truth is scattered across Slack threads,
Jira tickets, GitHub commits, and Notion runbooks — and those sources disagree.
Relay ingests the real evidence, deterministically surfaces the contradictions,
lets a human decide with a cited rationale, gates execution by role, and seals
the entire decision record in an append-only SHA-256 hash chain that exports as
`.relay.sig`. A judge can re-run every proof over HTTP.

---

## 2. The three judged improvements — promise vs. proof

| # | Round 2 promise | Round 3 implementation | API route | 20-second live proof |
| --- | --- | --- | --- | --- |
| **D1** | Replace static `seed.json` with live GitHub ingestion and secure webhooks. | `apps/web/lib/github-fetch.ts` calls the unauthenticated GitHub REST API; `apps/web/lib/github-analyzer.ts` derives deterministic drift findings from real files, commits and diffs; `apps/web/db/github.ts` persists them per signed session. `app/api/github/webhook/route.ts` verifies HMAC-SHA256 before appending. | `POST /api/github/ingest`<br>`POST /api/github/webhook` | Open **Ingest** → pick the gold **★ maneyashh/relay-codethinkers** preset → real repo name, SHA, files scanned and findings appear on the board. Fire a signed `push` and watch one more contradiction land. |
| **D2** | Make the PR / Notion buttons real and enforce least privilege. | `apps/web/lib/integrations.ts` builds the artifact server-side from the signed role's board; `apps/web/db/security.ts` enforces the `v_evidence_manager` / `v_evidence_junior` boundary. The browser never supplies the content. | `POST /api/integrations/github-pr`<br>`POST /api/integrations/notion-sync` | Switch to **Manager** → dispatch PR → hard **403**, zero artifact in the body. Switch to **Junior** → dispatch PR → **200** with signed branch, artifact SHA-256 and unified diff; Notion sync returns the role-filtered ledger preview. |
| **D3** | Fix cognitive overload and add the missing post-export security proof. | `apps/web/lib/crypto-ledger.ts` maintains `SHA-256(prevHash + seq + kind + doubtId + canonicalPayload + createdAt)` signed with HMAC-SHA256. Focus vs. War-Room mode lives in `components/triage/TriageBoard.tsx`; the judge HUD is `components/triage/JudgeWalkthrough.tsx`. | `GET /api/security/receipt`<br>`POST /api/security/receipt` | Open **Receipt** → export the green chain → run the rogue **tamper attack** → the verifier names the broken sequence and rejects the forged link while the live chain stays intact. |
| **All** | The whole loop is verifiable in one command. | `apps/web/scripts/verify-security.mjs` talks to the real route handlers over HTTP. | `/api/health`, `/api/security/*`, `/api/integrations/*`, `/api/github/*` | `cd apps/web && npm run verify:security` → **72/72 checks passed**. |

---

## 3. The 30-second opening (say this before you click)

> "Every handover fails the same way: the person leaving knows things that never
> made it into the docs, and the first person to find out is a customer. Relay
> turns contradictory Slack, Jira, GitHub and Notion evidence into a decision
> record — role-appropriate and cryptographically tamper-evident. I'll scan the
> repo you're judging right now, prove a manager can't see engineering detail,
> and then break our own receipt chain on purpose."

Then click **★ Round 3 Judge Experience** in the header and **Auto-Run All 3
Round 3 Proofs**.

---

## 4. The 90-second demo route (exact clicks)

| Time | Click | What the judge sees |
| --- | --- | --- |
| 0:00 | **★ Round 3 Judge Experience** | The HUD opens on the architecture briefing (Stage 1) with the three judged improvements listed as D1 / D2 / D3. |
| 0:05 | **Auto-Run All 3 Round 3 Proofs** | A live ticker moves through: signed session → self-scan → signed webhook → manager 403 → junior PR → Notion → receipt chain → tamper attack. Each deliverable flips to ✅. |
| 0:10 | Wait for the scorecard | `3/3 Deliverables Verified`, elapsed milliseconds, and `72/72 Security Gates Passed`. |
| 0:20 | **Stage 2 · Live GitHub proof** (left rail) | Real repository, head SHA, files scanned, deterministic findings. Point at the self-scan preset: *"this is the repo you are judging."* |
| 0:40 | **Stage 3 · Least-privilege execution** | Run the manager probe live: **403**, no artifact. Then the junior dispatch: **200**, signed branch + diff. |
| 1:00 | **Stage 4 · Receipt + tamper attack** | Show the green chain, export `.relay.sig`, run the tamper attack, point at the broken sequence. |
| 1:20 | **Stage 5 · Scorecard** | Close on the three deliverables and the one-command suite. Offer the CLI copy button for a technical evaluator. |

If you only have 30 seconds: **Auto-Run → scorecard → tamper attack.** That is
the whole story.

---

## 5. Interface map — every surface, in plain language

| Surface | Where | What it proves | Judge action |
| --- | --- | --- | --- |
| **Landing** | `/` | The problem, the three deliverables, and the guided tour entry point. | Click **Start the 60-second judge walkthrough**. |
| **Judge Guide** | `?` anywhere, or the **Guide** button | A three-tab explanation: proofs, product tour, keyboard. Every tab has jump buttons. | Read D1/D2/D3, then press **Prove in HUD**. |
| **Ingest Studio** | **Ingest** in the top bar | Live GitHub REST ingestion and the ★ self-scan preset, with a clearly labelled offline fallback. | Scan `maneyashh/relay-codethinkers`. |
| **Triage Board** | After ingest | Focus mode = one contradiction at a time. War-Room = the full surface. Same server-authoritative data. | Toggle **Focus / War-room** in the control row. |
| **Ask Relay** | `⌘K` / **Ask Relay** | Grounded answers with citations. No uncited model claims. | Ask *"What blocks the launch?"* |
| **Security Proof** | **Security** chip / receipts | Manager vs. developer SQL views, raw payload inspection, live signal boundary, audit trail. | Open **Developer payload** and **Receipt**. |
| **Integrations** | Inside the board / HUD Stage 2 | Manager 403, junior 200, signed artifact, Notion role filter. | Run both dispatches. |
| **Receipt Verifier** | **Receipt** in the top bar | SHA-256 chain, `.relay.sig` export, tamper simulation. | Export, then tamper. |
| **Handover Artifact** | **Handover** when readiness = 100% | The final decision record: rationale, owner, sign-off, verification. | Auto-triage, then open the artifact. |

---

## 6. Verify without trusting the demo

```bash
cd apps/web
npm install
npm run dev                 # http://localhost:3000
npm run verify:security     # 72/72 checks passed
```

The suite never imports the database. It talks to the real HTTP route handlers,
so it proves exactly what a browser can and cannot receive. To verify a single
claim manually:

```bash
# 1. Create a signed session and keep the cookie
curl -i -X POST http://localhost:3000/api/session \
  -H 'content-type: application/json' -d '{}'

# 2. Scan the live hackathon repo
curl -X POST http://localhost:3000/api/github/ingest \
  -H 'content-type: application/json' \
  -H 'cookie: relay_session=<token>' \
  -d '{"repo":"maneyashh/relay-codethinkers"}'

# 3. Manager least-privilege probe — expect 403
curl -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:3000/api/integrations/github-pr \
  -H 'content-type: application/json' \
  -H 'cookie: relay_session=<token>' -d '{}'

# 4. Export the receipt chain
curl http://localhost:3000/api/security/receipt \
  -H 'cookie: relay_session=<token>'
```

The **Copy Judge CLI / cURL Proof** button in HUD Stage 5 copies a ready-to-run
version of this suite.

---

## 7. Tough questions — short, honest answers

**"Is the GitHub data actually live?"**
Yes. The unauthenticated GitHub REST API is called server-side. The response
shows `mode: live`, the real owner/repo, head SHA, files scanned and commit
count. If an anonymous judge IP is rate-limited, Relay replays a fixture and
labels it `mode: fallback` with the reason — it never pretends to be live.

**"Is the webhook a real external delivery, or a simulation?"**
Both modes are supported by the same route. A real GitHub delivery is accepted
with the standard `x-github-event`, `x-github-delivery` and
`x-hub-signature-256` headers and verified before any finding is written. The
demo's signed `push` / `pull_request` buttons generate the payload server-side,
sign it with the configured secret, and pass it through that exact verification
path — so the cryptographic check is real even in an offline room. Set
`GITHUB_WEBHOOK_SECRET` and point a repository webhook at
`/api/github/webhook` to receive live deliveries.

**"Did the PR / Notion buttons actually write to GitHub / Notion?"**
Without an external token, Relay returns a **cryptographically signed sandbox
dispatch** — never a fake success. The artifact, branch name, patch and signature
are built on the server from the signed role's board. With `GITHUB_TOKEN` /
`NOTION_TOKEN` configured, the same code path performs the live write. The point
of the demo is the least-privilege boundary, which is real either way.

**"Isn't '72/72 of your own checks pass' circular?"**
The suite is not a unit test of our claims; it is an HTTP client that proves what
a browser receives. It checks the manager projection for leaked paths/SHAs, the
403, the tamper rejection, and the session isolation. You can run it yourself, or
execute the cURL suite above.

**"Why should I believe the receipt chain?"**
Export it and mutate one byte. `POST /api/security/receipt` with `tamper: true`
recomputes the chain and reports the exact broken sequence; the live chain is
unchanged. The chain formula is visible in
`apps/web/lib/crypto-ledger.ts`.

**"What stops a manager from just switching the role?"**
The role is signed into an HttpOnly HMAC cookie and re-verified server-side. The
SQL views are role-scoped, so a manager never receives developer evidence — even
in the raw response. The 403 is enforced in the route handler, not in the UI.

**"What happens on a cold start / different serverless instance?"**
The session cookie is HMAC-signed and can resurrect a missing session row. The
database uses a path ladder (`RELAY_DB_PATH` → repo `.data` → tmp → memory) so
the app degrades gracefully. For a multi-instance deployment, use a persistent
volume or a managed database; the integrity logic is storage-agnostic.

**"Is this just another AI dashboard?"**
No model call is used for the findings. The analyzer is deterministic: same
snapshot, same findings, same confidence, same ids. AI is used only for grounded
answers with citations, never for the decision or the proof.

**"Where is the business value?"**
Handovers are expensive because decisions are re-litigated and evidence is
unverifiable. Relay compresses the evidence, records the decision with an owner
and sign-off, and makes the record portable and tamper-evident. The buyer is the
engineering org that cannot afford a bad handover.

---

## 8. Failure playbook (if the demo misbehaves)

| Symptom | Recovery |
| --- | --- |
| GitHub rate limit / no network | Ingest still succeeds via the labelled `fallback` fixture. Say: *"the analyzer is deterministic; the fallback is labelled, not disguised."* |
| Auto-run stalls on a slow network | Wait for the ticker; the server fetch is bounded. If it errors, run the three stages manually — they are the same real routes. |
| Receipt missing after a reload on a multi-instance host | Re-run the auto-pilot; it re-ingests and rebuilds the session chain. For the judged demo, run locally or on a single persistent instance. |
| Board looks empty | Click **Ingest** and scan the self-scan preset, or run the auto-pilot. |
| A judge asks for proof without the UI | Use **Copy Judge CLI / cURL Proof** or `npm run verify:security`. |

---

## 9. Scoring cheat sheet — what to look for

- **Depth over breadth:** the three judged improvements each have a route, a
  database boundary, and a live proof.
- **Least privilege is visible:** the manager/developer projections are not a
  UI trick; they are different SQL views.
- **The proof is portable:** a receipt you can export, mutate, and reject.
- **The demo is hostile-environment tolerant:** no API keys, labelled fallback,
  session revival, one-command verification.
- **The UI addresses the actual complaint:** Focus mode is the answer to
  cognitive overload, not a cosmetic toggle.

---

**One-line close:**

> "You don't have to trust the demo. Export the receipt, verify it yourself, or
> run the 72-check suite. That's the point: the handover is provable, not
> promised."
