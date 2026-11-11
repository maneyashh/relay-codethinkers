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
        ['row', 'column', 'session', 'synthesis'].includes(item.category),
    ),
    `${report.checks.length} assertions`,
  );
  check(
    'Health endpoint proves the read-only-safe schema ladder',
    healthJson.schemaVersion === 2 &&
      healthJson.resilience?.readOnlySafe === true &&
      healthJson.resilience?.signedSessionRevival === true &&
      typeof healthJson.counts?.signals === 'number' &&
      typeof healthJson.counts?.decisions === 'number',
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

  // 14. Every protected endpoint rejects an anonymous browser.
  const protectedRoutes = [
    ['GET', '/api/triage'],
    ['GET', '/api/security/verify'],
    ['GET', '/api/security/audit'],
    ['GET', '/api/remediation/d-001'],
    ['POST', '/api/signals'],
    ['POST', '/api/triage/fast-forward'],
    ['POST', '/api/triage/reset'],
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
