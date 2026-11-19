#!/usr/bin/env node
/**
 * End-to-end proof of the Relay permission boundary.
 *
 * Run the app first:  npm run dev
 * Then:               npm run verify:security
 *
 * The script talks to the real Next.js route handlers over HTTP. It never
 * imports the database directly, so it proves what a browser can and cannot
 * receive.
 */
import assert from 'node:assert/strict';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
let passed = 0;

function pass(label, detail = '') {
  passed += 1;
  console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
}

function fail(label, detail) {
  console.error(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  ${detail}` : ''}`);
  process.exitCode = 1;
  throw new assert.AssertionError({ message: label });
}

function check(label, condition, detail = '') {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

function cookieFrom(response) {
  const raw =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()[0]
      : response.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Some error paths are plain text.
  }
  return {
    status: response.status,
    text,
    json,
    cookie: cookieFrom(response),
    headers: response.headers,
  };
}

function assertJson(response, label) {
  if (response.json == null) {
    fail(label, `expected JSON, got HTTP ${response.status}: ${response.text.slice(0, 120)}`);
  }
  return response.json;
}

async function main() {
  console.log('\nRelay security verification');
  console.log(`target: ${BASE}\n`);

  const health = await call('/api/health');
  const healthJson = assertJson(health, 'health endpoint responds');
  check(
    'SQLite database is live and seeded',
    health.status === 200 && healthJson.ok && healthJson.counts.doubts === 6,
    `${healthJson.counts?.doubts} doubts · ${healthJson.counts?.evidence} evidence rows`,
  );

  // 1. Authenticate as the manager.
  const managerSession = await call('/api/session', {
    method: 'POST',
    body: { role: 'manager' },
  });
  const managerJson = assertJson(managerSession, 'manager session');
  const managerCookie = managerSession.cookie;
  check(
    'Manager session is created with a signed cookie',
    managerSession.status === 200 &&
      Boolean(managerCookie) &&
      managerJson.board.session.role === 'manager',
  );
  check(
    'Session cookie is HttpOnly',
    /httponly/i.test(await rawSetCookie(managerSession)),
  );

  // 2. Inspect the server-side comparison report.
  const reportResponse = await call('/api/security/verify', {
    cookie: managerCookie,
  });
  const report = assertJson(reportResponse, 'security report');
  check(
    'Security probe passes every assertion',
    report.ok === true,
    `${report.checks.filter((c) => c.pass).length}/${report.checks.length} checks`,
  );
  check(
    'Manager projection has zero filePath keys',
    report.manager.filePathKeys === 0,
    `${report.manager.evidenceDelivered} evidence rows delivered`,
  );
  check(
    'Manager projection has zero commit keys',
    report.manager.commitKeys === 0,
  );
  check(
    'Manager projection has zero implementation objects',
    report.manager.implementationObjects === 0,
  );
  check(
    'Manager projection leaks no restricted value',
    report.manager.restrictedValueLeaked === false,
  );
  check(
    'SQL withheld developer evidence from the manager',
    report.manager.evidenceWithheld > 0,
    `${report.manager.evidenceWithheld} rows withheld`,
  );
  check(
    'Developer projection receives implementation targets',
    report.junior.implementationObjects > 0,
  );
  check(
    'Developer projection withholds commercial impact',
    report.junior.impactObjects === 0,
  );
  check(
    'Security report carries an inspectable server receipt',
    report.receipt?.sqlView === 'v_evidence_manager' &&
      report.receipt?.signalView === 'v_signal_manager' &&
      report.receipt?.cacheControl === 'no-store' &&
      typeof report.receipt?.storage === 'string',
    `${report.receipt?.sqlView} · ${report.receipt?.hmac}`,
  );
  check(
    'Every security assertion is categorized',
    report.checks.every(
      (item) =>
        typeof item.category === 'string' &&
        ['row', 'column', 'session', 'synthesis', 'chain', 'integration'].includes(
          item.category,
        ),
    ),
    `${report.checks.length} assertions`,
  );
  check(
    'Health endpoint proves the read-only-safe schema ladder',
    healthJson.schemaVersion === 3 &&
      healthJson.resilience?.readOnlySafe === true &&
      healthJson.resilience?.signedSessionRevival === true &&
      typeof healthJson.counts?.signals === 'number' &&
      typeof healthJson.counts?.decisions === 'number',
  );
  check(
    'Health endpoint exposes live ingestion, integrations and receipt tables',
    typeof healthJson.counts?.ingestions === 'number' &&
      typeof healthJson.counts?.liveDoubts === 'number' &&
      typeof healthJson.counts?.integrations === 'number' &&
      typeof healthJson.counts?.ledgerEntries === 'number' &&
      healthJson.security?.webhooks ===
        'GitHub HMAC-SHA256 signature verified server-side' &&
      healthJson.ingestion?.liveGitHub === true,
    `${healthJson.counts?.ledgerEntries} ledger links · ${healthJson.counts?.liveDoubts} live doubts`,
  );

  // 3. Inspect the raw manager board the browser actually receives.
  const managerBoardResponse = await call('/api/triage', {
    cookie: managerCookie,
  });
  const managerBoard = assertJson(managerBoardResponse, 'manager board');
  const rawManager = managerBoardResponse.text;
  check(
    'Raw manager payload contains no "filePath" key',
    !rawManager.includes('"filePath"'),
  );
  check(
    'Raw manager payload contains no "commit" key',
    !rawManager.includes('"commit"'),
  );
  check(
    'Raw manager payload contains no "implementation" key',
    !rawManager.includes('"implementation"'),
  );
  check(
    'Raw manager payload contains no staging secret',
    !rawManager.includes('relay-staging-2024!'),
  );
  check(
    'Manager board has evidence but fewer rows than the developer board',
    managerBoard.board.meta.evidenceVisible === 16 &&
      managerBoard.board.meta.evidenceLocked === 8,
    `${managerBoard.board.meta.evidenceVisible} visible · ${managerBoard.board.meta.evidenceLocked} locked`,
  );

  // 4. A query-string role must not widen the signed session.
  const spoof = await call('/api/triage?role=junior', {
    cookie: managerCookie,
  });
  const spoofJson = assertJson(spoof, 'spoofed board');
  check(
    '?role=junior is ignored while the session is manager',
    spoofJson.board.session.role === 'manager' &&
      !spoof.text.includes('"filePath"'),
  );

  // 5. A tampered cookie is rejected.
  const [sessionId, signature] = managerCookie.split('=')[1].split('.');
  const tampered = `${sessionId}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
  const forged = await call('/api/triage', {
    cookie: `relay_session=${tampered}`,
  });
  check(
    'A forged HMAC cookie returns 401',
    forged.status === 401,
    `HTTP ${forged.status}`,
  );

  // 6. Switch to the developer lens and verify the inverse projection.
  const juniorSession = await call('/api/session', {
    method: 'POST',
    body: { role: 'junior' },
    cookie: managerCookie,
  });
  const juniorJson = assertJson(juniorSession, 'junior session');
  const juniorCookie = juniorSession.cookie ?? managerCookie;
  const rawJunior = juniorSession.text;
  const juniorBoard = juniorJson.board;
  check(
    'Role switch is server-authoritative',
    juniorBoard.session.role === 'junior',
  );
  check(
    'Developer payload contains implementation targets',
    rawJunior.includes('"implementation"') &&
      juniorBoard.doubts.every((doubt) => doubt.implementation),
  );
  check(
    'Developer payload withholds commercial impact',
    !rawJunior.includes('"impact"'),
  );
  check(
    'Developer payload contains code file paths',
    rawJunior.includes('"filePath"'),
  );
  check(
    'Developer board receives all 24 evidence rows',
    juniorBoard.meta.evidenceVisible === 24 &&
      juniorBoard.meta.evidenceLocked === 0,
  );

  // 7. Mutations are server-authoritative and reflected in the response.
  const firstOpen = juniorBoard.doubts.find((doubt) => doubt.status === 'open');
  const resolve = await call(`/api/doubts/${firstOpen.id}`, {
    method: 'PATCH',
    body: { action: 'resolve', resolutionId: 1 },
    cookie: juniorCookie,
  });
  const resolveJson = assertJson(resolve, 'resolve mutation');
  const resolved = resolveJson.board.doubts.find(
    (doubt) => doubt.id === firstOpen.id,
  );
  check(
    'Resolving a doubt persists on the server',
    resolved.status === 'resolved' &&
      resolved.resolvedWith === 1 &&
      resolveJson.board.session.xp > 0,
    `xp=${resolveJson.board.session.xp} · reward=${resolveJson.reward?.amount ?? 0}`,
  );

  // 8. Decision metadata and verification are authored on the server.
  const secondOpen = resolveJson.board.doubts.find(
    (doubt) => doubt.status === 'open',
  );
  check(
    'A second open doubt is available for decision metadata',
    Boolean(secondOpen),
  );
  const decisionResolutionId = secondOpen.resolutions[1]?.id ?? 1;
  const decisionResolve = await call(`/api/doubts/${secondOpen.id}`, {
    method: 'PATCH',
    body: {
      action: 'resolve',
      resolutionId: decisionResolutionId,
      decisionType: 'accept_risk',
      rationale: 'Accept the risk until post-launch hardening lands.',
      owner: 'Priya Raman',
      signedOff: true,
      signoffName: 'Priya Raman',
    },
    cookie: juniorCookie,
  });
  const decisionJson = assertJson(decisionResolve, 'decision resolve');
  const decisionDoubt = decisionJson.board.doubts.find(
    (doubt) => doubt.id === secondOpen.id,
  );
  check(
    'Decision metadata is persisted with a named sign-off',
    decisionDoubt.status === 'resolved' &&
      decisionDoubt.resolvedWith === decisionResolutionId &&
      decisionDoubt.decision?.type === 'accept_risk' &&
      decisionDoubt.decision?.signedOff === true &&
      decisionDoubt.decision?.signoffName === 'Priya Raman' &&
      decisionDoubt.decision?.owner === 'Priya Raman' &&
      decisionDoubt.decision?.verification === 'pending',
    `${decisionDoubt.decision?.type} · signed off by ${decisionDoubt.decision?.signoffName}`,
  );

  const verifyResolve = await call(`/api/doubts/${secondOpen.id}`, {
    method: 'PATCH',
    body: { action: 'verify' },
    cookie: juniorCookie,
  });
  const verifyJson = assertJson(verifyResolve, 'verify mutation');
  const verifiedDoubt = verifyJson.board.doubts.find(
    (doubt) => doubt.id === secondOpen.id,
  );
  check(
    'Verification is persisted and rewarded',
    verifiedDoubt.decision?.verification === 'verified' &&
      verifyJson.reward?.amount === 10,
    `verification=${verifiedDoubt.decision?.verification} · +${verifyJson.reward?.amount ?? 0} XP`,
  );

  // 9. A developer-only live signal must never reach the manager lens.
  const signalQuote =
    'REL-TEST-9f3c: staging deploy was silently reverted overnight.';
  const signalDoubt =
    verifyJson.board.doubts.find((doubt) => doubt.status === 'open') ??
    verifyJson.board.doubts[0];
  const inject = await call('/api/signals', {
    method: 'POST',
    body: {
      doubtId: signalDoubt.id,
      source: 'slack',
      author: 'Night Ops',
      quote: signalQuote,
      audience: 'junior',
      polarity: 'contradicts',
      relevance: 0.9,
    },
    cookie: juniorCookie,
  });
  const injectJson = assertJson(inject, 'signal injection');
  const injectedDoubt = injectJson.board.doubts.find(
    (doubt) => doubt.id === signalDoubt.id,
  );
  check(
    'Developer injection is visible to the developer lens',
    inject.status === 200 &&
      injectJson.signal.audience === 'junior' &&
      injectedDoubt.evidence.some(
        (row) => row.quote === signalQuote && row.injected === true,
      ) &&
      injectJson.board.meta.injectedSignals === 1,
    `${injectJson.signalsUsed} used · ${injectJson.signalsRemaining} left`,
  );
  check(
    'Injected signal moves confidence deterministically',
    injectJson.synthesis.delta > 0 &&
      injectJson.synthesis.formula.includes('+9.0') &&
      injectedDoubt.synthesis.injectedCount === 1,
    injectJson.synthesis.formula,
  );

  const asManager = await call('/api/session', {
    method: 'POST',
    body: { role: 'manager' },
    cookie: juniorCookie,
  });
  const asManagerJson = assertJson(asManager, 'manager signal switch');
  const managerCookie2 = asManager.cookie ?? juniorCookie;
  const managerSignalResponse = await call('/api/triage', {
    cookie: managerCookie2,
  });
  const managerSignalBoard = assertJson(
    managerSignalResponse,
    'manager signal board',
  );
  check(
    'Manager lens cannot see a developer-only signal',
    asManagerJson.board.session.role === 'manager' &&
      !managerSignalResponse.text.includes(signalQuote) &&
      managerSignalBoard.board.meta.injectedSignals === 0 &&
      managerSignalBoard.board.meta.injectedSignalsLocked === 1,
    `${managerSignalBoard.board.meta.injectedSignals} visible · ${managerSignalBoard.board.meta.injectedSignalsLocked} locked`,
  );

  const backToJunior = await call('/api/session', {
    method: 'POST',
    body: { role: 'junior' },
    cookie: managerCookie2,
  });
  const backToJuniorJson = assertJson(backToJunior, 'junior signal switch');
  const juniorCookie2 = backToJunior.cookie ?? managerCookie2;
  const juniorSignalResponse = await call('/api/triage', {
    cookie: juniorCookie2,
  });
  const juniorSignalBoard = assertJson(
    juniorSignalResponse,
    'junior signal board',
  );
  check(
    'Role switch restores the developer signal',
    backToJuniorJson.board.session.role === 'junior' &&
      juniorSignalResponse.text.includes(signalQuote) &&
      juniorSignalBoard.board.meta.injectedSignals === 1 &&
      juniorSignalBoard.board.meta.injectedSignalsLocked === 0,
  );

  const signalReportResponse = await call('/api/security/verify', {
    cookie: juniorCookie2,
  });
  const signalReport = assertJson(signalReportResponse, 'signal report');
  check(
    'Security probe audits the live signal boundary',
    signalReport.signals.total === 1 &&
      signalReport.signals.managerVisible === 0 &&
      signalReport.signals.juniorVisible === 1 &&
      signalReport.signals.managerLeaked === 0 &&
      signalReport.signals.juniorLeaked === 0 &&
      signalReport.checks.find(
        (item) => item.id === 'signal-audience-isolation',
      )?.pass === true,
    `${signalReport.signals.total} signal · ${signalReport.signals.managerLeaked + signalReport.signals.juniorLeaked} cross-lens leaks`,
  );

  // 10. Remediation is role-scoped at the API boundary.
  const juniorRemediationResponse = await call('/api/remediation/d-003', {
    cookie: juniorCookie2,
  });
  const juniorRemediation = assertJson(
    juniorRemediationResponse,
    'junior remediation',
  );
  const juniorPackage = juniorRemediation.packages[0];
  check(
    'Developer remediation exposes patch, verification and Day-1 plan',
    juniorPackage.allowed === true &&
      juniorPackage.role === 'junior' &&
      juniorPackage.patch?.file === 'services/api/config.ts' &&
      typeof juniorPackage.verification?.command === 'string' &&
      juniorPackage.day1?.length >= 3 &&
      juniorPackage.rollback?.length > 0,
    `${juniorPackage.patch?.file} · ${juniorPackage.day1?.length} Day-1 steps`,
  );

  // Use a dedicated manager session: role switches mutate the session row, so
  // the earlier cookie is no longer manager-authoritative at this point.
  const remediationManagerSession = await call('/api/session', {
    method: 'POST',
    body: { role: 'manager' },
  });
  const remediationManagerCookie =
    remediationManagerSession.cookie ?? managerCookie2;
  const managerRemediationResponse = await call('/api/remediation/d-003', {
    cookie: remediationManagerCookie,
  });
  const managerRemediation = assertJson(
    managerRemediationResponse,
    'manager remediation',
  );
  const managerPackage = managerRemediation.packages[0];
  check(
    'Manager remediation withholds patches, commands and paths',
    managerPackage.allowed === false &&
      managerPackage.role === 'manager' &&
      managerPackage.patch === undefined &&
      managerPackage.verification === undefined &&
      managerPackage.day1 === undefined &&
      managerPackage.rollback === undefined &&
      managerPackage.managerChecklist.length > 0 &&
      !managerRemediationResponse.text.includes('config.ts') &&
      !managerRemediationResponse.text.includes('relay-staging-2024!'),
    `${managerPackage.managerChecklist.length} checklist items · no implementation payload`,
  );

  // 11. The audit trail records actions without becoming an exfiltration path.
  const auditResponse = await call('/api/security/audit', {
    cookie: juniorCookie2,
  });
  const audit = assertJson(auditResponse, 'audit report');
  check(
    'Audit trail records the signal without echoing its text',
    audit.counts.signals >= 1 &&
      audit.events.some(
        (event) =>
          event.action === 'signal.inject' && event.doubtId === signalDoubt.id,
      ) &&
      !auditResponse.text.includes(signalQuote),
    `${audit.counts.signals} signal events · quote absent`,
  );
  check(
    'Audit trail records decisions, verification and role switches',
    audit.counts.resolves >= 2 &&
      audit.events.some((event) => event.action === 'doubt.verify') &&
      audit.events.some(
        (event) =>
          event.action === 'doubt.resolve' &&
          /decision=accept_risk/.test(event.detail ?? ''),
      ) &&
      audit.events.some((event) => event.action === 'session.role_switch'),
    `${audit.counts.resolves} resolves · ${audit.counts.total} total events`,
  );
  check(
    'Sensitive responses are marked no-store',
    /no-store/.test(
      managerSignalResponse.headers.get('cache-control') ?? '',
    ) && /no-store/.test(auditResponse.headers.get('cache-control') ?? ''),
  );

  // 12. A brand-new browser starts from a clean, isolated baseline.
  const freshSession = await call('/api/session', {
    method: 'POST',
    body: {},
  });
  const freshJson = assertJson(freshSession, 'fresh session');
  const freshCookie = freshSession.cookie;
  check(
    'A new browser gets a clean isolation baseline',
    freshSession.status === 200 &&
      Boolean(freshCookie) &&
      freshJson.board.session.role === 'junior' &&
      freshJson.board.session.xp === 0 &&
      freshJson.board.session.readiness === 0 &&
      freshJson.board.meta.injectedSignals === 0 &&
      freshJson.board.doubts.every((doubt) => doubt.status === 'open'),
    `${freshJson.board.doubts.length} open · readiness ${freshJson.board.session.readiness}%`,
  );

  const freshReportResponse = await call('/api/security/verify', {
    cookie: freshCookie,
  });
  const freshReport = assertJson(freshReportResponse, 'fresh report');
  check(
    'A fresh session shows zero live signals and a passing probe',
    freshReport.ok === true &&
      freshReport.signals.total === 0 &&
      freshReport.signals.managerLeaked === 0 &&
      freshReport.signals.juniorLeaked === 0,
  );

  // 13. The judge accelerator is explicit, audited and reversible.
  const fastForwardResponse = await call('/api/triage/fast-forward', {
    method: 'POST',
    cookie: freshCookie,
  });
  const fastForwardJson = assertJson(
    fastForwardResponse,
    'fast-forward accelerator',
  );
  check(
    'Fast-forward resolves every doubt as an auto decision',
    fastForwardJson.fastForwarded === 6 &&
      fastForwardJson.resolutionMap.length === 6 &&
      fastForwardJson.board.session.readiness === 100 &&
      fastForwardJson.board.meta.readyForHandover === true &&
      fastForwardJson.board.doubts.every(
        (doubt) =>
          doubt.status === 'resolved' && doubt.decision?.type === 'auto',
      ),
    `${fastForwardJson.fastForwarded} resolved · readiness ${fastForwardJson.board.session.readiness}%`,
  );

  const resetResponse = await call('/api/triage/reset', {
    method: 'POST',
    cookie: freshCookie,
  });
  const resetJson = assertJson(resetResponse, 'reset');
  check(
    'Reset clears progress, decisions and signals for the next judge',
    resetJson.board.session.readiness === 0 &&
      resetJson.board.session.xp === 0 &&
      resetJson.board.meta.readyForHandover === false &&
      resetJson.board.meta.injectedSignals === 0 &&
      resetJson.board.doubts.every(
        (doubt) => doubt.status === 'open' && doubt.decision === undefined,
      ),
    `readiness ${resetJson.board.session.readiness}% · xp ${resetJson.board.session.xp}`,
  );

  const resetAudit = assertJson(
    await call('/api/security/audit', { cookie: freshCookie }),
    'reset audit',
  );
  check(
    'Fast-forward is audited as an accelerator, not a human decision',
    resetAudit.events.some(
      (event) =>
        event.action === 'doubt.fast_forward' &&
        /decision=auto/.test(event.detail ?? ''),
    ) && resetAudit.events.some((event) => event.action === 'session.reset'),
  );

  // 14. Round 3: live GitHub ingestion, signed webhooks, one-click dispatch
  // and the SHA-256 receipt chain. This uses a dedicated session so the
  // assertions above keep their clean baseline.
  const liveSession = await call('/api/session', {
    method: 'POST',
    body: { role: 'junior' },
  });
  const liveJson = assertJson(liveSession, 'live ingestion session');
  let liveCookie = liveSession.cookie;
  check(
    'A fresh session opens a genesis receipt chain',
    liveSession.status === 200 &&
      liveJson.board.meta.ledger.entries >= 1 &&
      liveJson.board.meta.ledger.verified === true &&
      liveJson.board.meta.liveDoubts === 0 &&
      liveJson.board.meta.ingestion === null,
    `${liveJson.board.meta.ledger.entries} genesis link`,
  );

  const ingestResponse = await call('/api/github/ingest', {
    method: 'POST',
    body: { presetId: 'hono' },
    cookie: liveCookie,
  });
  const ingest = assertJson(ingestResponse, 'github ingest');
  const liveDoubts = ingest.board.doubts.filter(
    (doubt) => doubt.origin === 'github',
  );
  check(
    'Live GitHub ingest returns a real repository snapshot',
    ingestResponse.status === 200 &&
      ingest.ingestion.fullName === 'honojs/hono' &&
      ['live', 'fallback'].includes(ingest.ingestion.mode) &&
      ingest.ingestion.filesScanned > 0 &&
      ingest.ingestion.commitsRead > 0 &&
      ingest.findings.length > 0 &&
      ingest.ingestion.findings === ingest.findings.length,
    `${ingest.ingestion.mode} · ${ingest.ingestion.filesScanned} files · ${ingest.findings.length} findings`,
  );
  check(
    'Ingested findings are attached to the signed session as live doubts',
    ingest.liveDoubts === ingest.findings.length &&
      liveDoubts.length === ingest.findings.length &&
      ingest.board.meta.liveDoubts === ingest.findings.length,
    `${liveDoubts.length} live doubts on the board`,
  );
  check(
    'Every ingested finding carries real SHA and file evidence',
    liveDoubts.length > 0 &&
      liveDoubts.every(
        (doubt) =>
          doubt.evidence.length > 0 &&
          doubt.evidence.every(
            (evidence) =>
              /^[0-9a-f]{40}$/i.test(evidence.commit ?? '') &&
              Boolean(evidence.filePath) &&
              Boolean(evidence.url),
          ),
      ),
    `${liveDoubts.reduce((n, doubt) => n + doubt.evidence.length, 0)} evidence rows`,
  );
  check(
    'The live ingest is written into the receipt chain',
    ingest.board.meta.ledger.entries > liveJson.board.meta.ledger.entries &&
      ingest.board.meta.ingestion?.mode === ingest.ingestion.mode,
    `${ingest.board.meta.ledger.entries} chain links`,
  );

  const pushResponse = await call('/api/github/webhook', {
    method: 'POST',
    body: { event: 'push', presetId: 'hono' },
    cookie: liveCookie,
  });
  const push = assertJson(pushResponse, 'push webhook');
  check(
    'A simulated push is HMAC-signed and verified server-side',
    pushResponse.status === 200 &&
      push.verified === true &&
      /^sha256=[0-9a-f]{64}$/.test(push.signature) &&
      push.doubtsCreated === 1 &&
      push.liveDoubts === ingest.findings.length + 1,
    `${push.deliveryId} · ${push.doubtsCreated} finding`,
  );

  const prResponse = await call('/api/github/webhook', {
    method: 'POST',
    body: { event: 'pull_request', presetId: 'hono' },
    cookie: liveCookie,
  });
  const prHook = assertJson(prResponse, 'pull_request webhook');
  check(
    'A simulated pull_request is signature-verified and incremental',
    prResponse.status === 200 &&
      prHook.verified === true &&
      prHook.event === 'pull_request' &&
      prHook.doubtsCreated === 1 &&
      prHook.liveDoubts === push.liveDoubts + 1,
    `${prHook.action} · ${prHook.liveDoubts} live findings`,
  );

  // A second signed session must never inherit another session's live findings.
  const isolatedSession = await call('/api/session', {
    method: 'POST',
    body: { role: 'junior' },
  });
  const isolatedBoard = assertJson(
    await call('/api/triage', { cookie: isolatedSession.cookie }),
    'isolated session board',
  );
  check(
    'Live findings stay isolated to the active signed session',
    isolatedSession.status === 200 &&
      isolatedBoard.board.session.id !== liveJson.board.session.id &&
      isolatedBoard.board.meta.liveDoubts === 0 &&
      isolatedBoard.board.meta.ingestion === null &&
      isolatedBoard.board.doubts.every(
        (doubt) => doubt.origin !== 'github' && doubt.origin !== 'webhook',
      ),
    `second session · ${isolatedBoard.board.meta.liveDoubts} live rows`,
  );

  const liveJuniorReport = assertJson(
    await call('/api/security/verify', { cookie: liveCookie }),
    'live junior report',
  );
  check(
    'Security probe audits the live GitHub boundary without leaks',
    liveJuniorReport.ok === true &&
      liveJuniorReport.live.total >= ingest.findings.length &&
      liveJuniorReport.live.juniorVisible >= ingest.findings.length &&
      liveJuniorReport.live.technicalKeyLeaks === 0 &&
      liveJuniorReport.live.managerLeaked === 0 &&
      liveJuniorReport.live.juniorLeaked === 0 &&
      liveJuniorReport.checks.find(
        (item) => item.id === 'live-boundary-isolation',
      )?.pass === true,
    `${liveJuniorReport.live.total} live rows · 0 technical leaks`,
  );

  // Switch the same signed session to the manager lens. The manager must see a
  // commercially shaped projection, never a path, SHA, URL, diff or target.
  const managerLiveSwitch = await call('/api/session', {
    method: 'POST',
    body: { role: 'manager' },
    cookie: liveCookie,
  });
  const managerLiveJson = assertJson(managerLiveSwitch, 'manager live switch');
  liveCookie = managerLiveSwitch.cookie ?? liveCookie;
  const managerLiveBoard = await call('/api/triage', { cookie: liveCookie });
  const managerLiveRaw = managerLiveBoard.text;
  const managerLiveDoubts = managerLiveJson.board.doubts.filter(
    (doubt) => doubt.origin === 'github' || doubt.origin === 'webhook',
  );
  check(
    'Manager live projection contains no technical keys or raw SHAs',
    managerLiveDoubts.length >= ingest.findings.length &&
      !managerLiveRaw.includes('"filePath"') &&
      !managerLiveRaw.includes('"commit"') &&
      !managerLiveRaw.includes('"diff"') &&
      !managerLiveRaw.includes('"headSha"') &&
      !managerLiveRaw.includes('"sourceUrl"') &&
      !managerLiveRaw.includes('"implementation"') &&
      !/\b[0-9a-f]{40}\b/i.test(managerLiveRaw),
    `${managerLiveDoubts.length} live doubts · technical keys absent`,
  );
  const managerLiveReport = assertJson(
    await call('/api/security/verify', { cookie: liveCookie }),
    'manager live report',
  );
  check(
    'Manager security probe still passes with live findings attached',
    managerLiveReport.ok === true &&
      managerLiveReport.live.managerVisible === managerLiveDoubts.length &&
      managerLiveReport.live.technicalKeyLeaks === 0 &&
      managerLiveReport.checks.find(
        (item) => item.id === 'live-manager-no-technical-keys',
      )?.pass === true,
  );

  const managerPr = await call('/api/integrations/github-pr', {
    method: 'POST',
    body: {},
    cookie: liveCookie,
  });
  const managerPrJson = assertJson(managerPr, 'manager github dispatch');
  check(
    'Manager GitHub PR dispatch is rejected with a hard 403',
    managerPr.status === 403 &&
      managerPrJson.reason === 'github_pr_dispatch_requires_developer' &&
      !/diff|artifactSha256|handover\.md/i.test(managerPr.text),
    `HTTP ${managerPr.status} · no artifact in body`,
  );

  const managerNotion = await call('/api/integrations/notion-sync', {
    method: 'POST',
    body: {},
    cookie: liveCookie,
  });
  const managerNotionJson = assertJson(managerNotion, 'manager notion dispatch');
  check(
    'Manager may dispatch Notion, but never receives the artifact',
    managerNotion.status === 200 &&
      managerNotionJson.integration.target === 'notion' &&
      managerNotionJson.artifact === null &&
      Boolean(managerNotionJson.integration.signature) &&
      Boolean(managerNotionJson.integration.artifactSha256),
    `${managerNotionJson.integration.mode} · artifact withheld`,
  );

  const juniorLiveSwitch = await call('/api/session', {
    method: 'POST',
    body: { role: 'junior' },
    cookie: liveCookie,
  });
  const juniorLiveJson = assertJson(juniorLiveSwitch, 'junior live switch');
  liveCookie = juniorLiveSwitch.cookie ?? liveCookie;
  const juniorPr = await call('/api/integrations/github-pr', {
    method: 'POST',
    body: {},
    cookie: liveCookie,
  });
  const juniorPrJson = assertJson(juniorPr, 'junior github dispatch');
  check(
    'Developer GitHub PR dispatch returns a signed server-built bundle',
    juniorLiveJson.board.session.role === 'junior' &&
      juniorPr.status === 200 &&
      juniorPrJson.integration.target === 'github' &&
      ['live', 'sandbox'].includes(juniorPrJson.integration.mode) &&
      juniorPrJson.integration.signature.length > 20 &&
      juniorPrJson.integration.artifactSha256.length === 64 &&
      Boolean(juniorPrJson.artifact?.markdown.includes('Relay handover')) &&
      juniorPrJson.ledger.entries > 0,
    `${juniorPrJson.integration.mode} · ${juniorPrJson.integration.reference}`,
  );

  const juniorNotion = await call('/api/integrations/notion-sync', {
    method: 'POST',
    body: {},
    cookie: liveCookie,
  });
  const juniorNotionJson = assertJson(
    juniorNotion,
    'junior notion dispatch',
  );
  check(
    'Developer Notion dispatch persists a second signed integration',
    juniorNotion.status === 200 &&
      juniorNotionJson.integration.target === 'notion' &&
      ['live', 'sandbox'].includes(juniorNotionJson.integration.mode) &&
      juniorNotionJson.artifact !== null &&
      juniorNotionJson.integration.signature.length > 20,
    `${juniorNotionJson.integration.reference} · artifact ${juniorNotionJson.artifact ? 'delivered' : 'missing'}`,
  );

  const integrationsList = assertJson(
    await call('/api/integrations', { cookie: liveCookie }),
    'integration list',
  );
  check(
    'Integration list is session-scoped and counts every dispatch',
    integrationsList.role === 'junior' &&
      integrationsList.counts.github >= 1 &&
      integrationsList.counts.notion >= 2 &&
      integrationsList.integrations.every(
        (item) =>
          item.signature.length > 20 &&
          item.artifactSha256.length === 64 &&
          item.status === 'dispatched',
      ) &&
      integrationsList.capabilities.githubDispatchRole === 'junior' &&
      integrationsList.capabilities.managerGithubForbidden === true,
    `${integrationsList.counts.total} dispatches · ${integrationsList.counts.sandbox} sandbox`,
  );

  const receiptResponse = await call('/api/security/receipt', {
    cookie: liveCookie,
  });
  const receiptJson = assertJson(receiptResponse, 'receipt export');
  const receipt = receiptJson.receipt;
  check(
    'Receipt export is a SHA-256 hash chain signed with HMAC',
    receiptResponse.status === 200 &&
      receipt.artifact === 'relay-handover-receipt' &&
      receipt.algorithm === 'SHA-256' &&
      receipt.signatureAlgorithm === 'HMAC-SHA256' &&
      receipt.entryCount >= 6 &&
      receipt.chainFormula.includes('sha256(prevHash') &&
      receiptJson.verification.ok === true &&
      receiptJson.verification.signatureValid === true &&
      receiptJson.verification.invalidHashes === 0,
    `${receipt.entryCount} links · root ${receipt.rootHash.slice(0, 14)}…`,
  );
  check(
    'Receipt link order is contiguous and genesis-anchored',
    receipt.entries.every(
      (entry, index) =>
        entry.seq === index + 1 &&
        (index === 0
          ? entry.prevHash === receipt.genesisHash
          : entry.prevHash === receipt.entries[index - 1].hash) &&
        /^[0-9a-f]{64}$/.test(entry.hash),
    ) &&
      receipt.rootHash === receipt.entries[receipt.entries.length - 1].hash,
  );
  check(
    'Tamper simulation breaks the copied chain but not the live ledger',
    receiptJson.tamper?.tamperAt !== null &&
      receiptJson.tamper?.verification.ok === false &&
      receiptJson.tamper?.verification.invalidHashes >= 1 &&
      receiptJson.tamper?.verification.signatureValid === false &&
      receiptJson.ledger.verified === true,
    `broken at seq ${receiptJson.tamper?.tamperAt}`,
  );

  const exportedVerify = assertJson(
    await call('/api/security/receipt', {
      method: 'POST',
      body: { receipt },
      cookie: liveCookie,
    }),
    'exported receipt verifier',
  );
  check(
    'The exported .relay.sig verifies over the wire',
    exportedVerify.ok === true &&
      exportedVerify.verification.signatureValid === true &&
      exportedVerify.verification.checkedHashes === receipt.entryCount,
  );

  const postTamper = assertJson(
    await call('/api/security/receipt', {
      method: 'POST',
      body: { receipt, tamper: true },
      cookie: liveCookie,
    }),
    'posted tamper simulation',
  );
  check(
    'POST tamper=true reports the broken SHA-256 link',
    postTamper.verification?.ok === true &&
      postTamper.tamper?.verification.ok === false &&
      postTamper.tamper?.verification.brokenAt !== null &&
      postTamper.tamper?.verification.invalidHashes >= 1 &&
      postTamper.tamper?.verification.signatureValid === false,
    `broken at seq ${postTamper.tamper?.verification.brokenAt}`,
  );

  const forgedReceipt = structuredClone(receipt);
  forgedReceipt.entries[0].payload.injectedAfterSignoff = true;
  const forgedReceiptResponse = assertJson(
    await call('/api/security/receipt', {
      method: 'POST',
      body: { receipt: forgedReceipt },
      cookie: liveCookie,
    }),
    'forged receipt verifier',
  );
  check(
    'A mutated exported receipt is rejected by the verifier',
    forgedReceiptResponse.ok === false &&
      forgedReceiptResponse.verification.ok === false &&
      forgedReceiptResponse.verification.brokenAt === 1 &&
      forgedReceiptResponse.verification.signatureValid === false,
    `${forgedReceiptResponse.verification.invalidHashes} invalid hashes`,
  );

  const cleanReceipt = assertJson(
    await call('/api/security/receipt', { cookie: liveCookie }),
    'clean receipt',
  );
  check(
    'The live chain is unchanged after tamper simulations',
    cleanReceipt.verification.ok === true &&
      cleanReceipt.receipt.rootHash === receipt.rootHash,
  );

  const liveAudit = assertJson(
    await call('/api/security/audit', { cookie: liveCookie }),
    'live audit',
  );
  check(
    'Ingest, webhook and dispatch are audited without leaking content',
    liveAudit.events.some((event) => event.action === 'github.ingest') &&
      liveAudit.events.some((event) => event.action === 'github.webhook') &&
      liveAudit.events.filter((event) => event.action === 'integration.dispatch')
        .length >= 3 &&
      !liveAudit.events.some((event) =>
        /honojs\/hono\/blob|[0-9a-f]{40}/i.test(event.detail ?? ''),
      ),
    `${liveAudit.counts.total} audit events`,
  );

  const liveReportAfter = assertJson(
    await call('/api/security/verify', { cookie: liveCookie }),
    'live report after dispatch',
  );
  check(
    'Security probe verifies the receipt chain and dispatch signatures',
    liveReportAfter.chain.entries === cleanReceipt.receipt.entryCount &&
      liveReportAfter.chain.verified === true &&
      liveReportAfter.chain.tamperDetected === true &&
      liveReportAfter.integrations.total >= 3 &&
      liveReportAfter.integrations.managerGithubStatus === 403 &&
      liveReportAfter.integrations.sandboxSigned === true &&
      liveReportAfter.integrations.artifactBoundaryPass === true &&
      liveReportAfter.checks.find(
        (item) => item.id === 'ledger-chain-verified',
      )?.pass === true &&
      liveReportAfter.checks.find(
        (item) => item.id === 'integration-sandbox-signed',
      )?.pass === true,
    `${liveReportAfter.chain.entries} chain links · ${liveReportAfter.integrations.total} dispatches`,
  );

  // 15. Every protected endpoint rejects an anonymous browser.
  const protectedRoutes = [
    ['GET', '/api/triage'],
    ['GET', '/api/security/verify'],
    ['GET', '/api/security/audit'],
    ['GET', '/api/remediation/d-001'],
    ['POST', '/api/signals'],
    ['POST', '/api/triage/fast-forward'],
    ['POST', '/api/triage/reset'],
    ['POST', '/api/github/ingest'],
    ['POST', '/api/github/webhook'],
    ['GET', '/api/integrations'],
    ['POST', '/api/integrations/github-pr'],
    ['POST', '/api/integrations/notion-sync'],
    ['GET', '/api/security/receipt'],
  ];
  const anonymous = await Promise.all(
    protectedRoutes.map(([method, path]) =>
      call(path, { method, body: method === 'POST' ? {} : undefined }),
    ),
  );
  check(
    'Every protected endpoint returns 401 without a session',
    anonymous.every((response) => response.status === 401),
    anonymous.map((response) => response.status).join(' · '),
  );

  console.log(
    `\n\x1b[32m${passed} checks passed.\x1b[0m The manager browser never received developer evidence, patches or live developer signals.\n`,
  );
}

async function rawSetCookie(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().join('; ');
  }
  return response.headers.get('set-cookie') ?? '';
}

main().catch((error) => {
  if (!(error instanceof assert.AssertionError)) {
    console.error(error);
    process.exitCode = 1;
  }
});
