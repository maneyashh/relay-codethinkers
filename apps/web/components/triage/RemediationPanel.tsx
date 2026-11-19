'use client';

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  GitPullRequest,
  Loader2,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  IntegrationDispatchResponse,
  RemediationPackage,
  RemediationResponse,
} from '@/lib/api-types';
import type { Doubt, IntegrationTarget, Role } from '@/stores/triage';
import { useTriage } from '@/stores/triage';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function fetchPackage(
  doubtId: string,
): Promise<RemediationPackage | null> {
  const send = () =>
    fetch(`/api/remediation/${encodeURIComponent(doubtId)}`, {
      cache: 'no-store',
      headers: JSON_HEADERS,
    });

  let response = await send();
  if (response.status === 401 || response.status === 404) {
    // A cold serverless instance can forget the session row. Re-establish it
    // from the signed cookie, then retry once.
    const revived = await fetch('/api/session', {
      method: 'POST',
      cache: 'no-store',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    if (revived.ok) response = await send();
  }

  if (!response.ok) throw new Error(`Remediation API ${response.status}`);
  const data = (await response.json()) as RemediationResponse;
  return data.packages[0] ?? null;
}

function DiffBlock({
  file,
  language,
  diff,
}: {
  file: string;
  language: string;
  diff: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => diff.split('\n'), [diff]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      data-guide="remediation-diff"
      className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/70"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800/70 px-2.5 py-1.5">
        <Code2 className="size-3 shrink-0 text-emerald-400/80" aria-hidden />
        <code className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-zinc-300">
          {file}
        </code>
        <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono text-[7.5px] uppercase tracking-wider text-zinc-500">
          {language}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          aria-label="Copy patch"
        >
          {copied ? (
            <Check className="size-2.5 text-emerald-400" aria-hidden />
          ) : (
            <Copy className="size-2.5" aria-hidden />
          )}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="max-h-56 overflow-auto px-2.5 py-2 font-mono text-[9.5px] leading-[1.55] text-zinc-400">
        {lines.map((line, index) => {
          const added = line.startsWith('+');
          const removed = line.startsWith('-');
          const header = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
          return (
            <span
              key={`${index}-${line.slice(0, 12)}`}
              className={[
                'block whitespace-pre',
                added
                  ? 'bg-emerald-500/[0.09] text-emerald-300'
                  : removed
                    ? 'bg-red-500/[0.08] text-red-300'
                    : header
                      ? 'text-sky-300/80'
                      : '',
              ].join(' ')}
            >
              {line || ' '}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

export function RemediationPanel({
  doubt,
  role,
  hideDispatch = false,
}: {
  doubt: Doubt;
  role: Role;
  /** The resolved banner already owns dispatch; avoid a second toolbar. */
  hideDispatch?: boolean;
}) {
  const verifyDoubt = useTriage((s) => s.verifyDoubt);
  const pendingAction = useTriage((s) => s.pendingAction);
  const dispatchIntegration = useTriage((s) => s.dispatchIntegration);
  const clearError = useTriage((s) => s.clearError);

  const [pkg, setPkg] = useState<RemediationPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatch, setDispatch] = useState<IntegrationDispatchResponse | null>(
    null,
  );
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<IntegrationTarget | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPkg(await fetchPackage(doubt.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load remediation',
      );
    } finally {
      setLoading(false);
    }
  }, [doubt.id]);

  useEffect(() => {
    // Kick the fetch on the next frame; `load` flips loading state, and React
    // 19 linting correctly forbids doing that synchronously inside an effect.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const verifying = pendingAction === `verify:${doubt.id}`;
  const canVerify =
    role === 'junior' &&
    doubt.status === 'resolved' &&
    doubt.decision?.verification !== 'verified';
  const verified = doubt.decision?.verification === 'verified';
  const dispatchBusy = pendingAction?.startsWith('dispatch:') ?? false;

  async function runDispatch(target: IntegrationTarget) {
    if (pendingAction) return;
    setDispatchTarget(target);
    setDispatchError(null);
    const result = await dispatchIntegration(target);
    if (!result) {
      const message = useTriage.getState().error ?? 'Dispatch failed';
      const forbidden = /403|developer|forbidden/i.test(message);
      setDispatchError(
        forbidden
          ? '403 · least-privilege gate: the manager lens may not open a GitHub PR. The API rejected the request before it built any branch or diff.'
          : message,
      );
      // The inline notice above owns the error for this action; keep the
      // board-level banner from duplicating it.
      clearError();
    } else {
      setDispatch(result);
    }
    setDispatchTarget(null);
  }

  return (
    <section
      aria-label="Remediation path"
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="size-4 shrink-0 text-emerald-400/80" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Remediation path
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-zinc-500">
          {role === 'junior' ? 'developer lens' : 'manager lens'}
        </span>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
          <Loader2 className="size-3.5 animate-spin text-emerald-400" aria-hidden />
          assembling role-scoped package…
        </div>
      )}

      {error && !loading && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-2.5 py-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] leading-snug text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-red-300 underline-offset-2 hover:underline"
            >
              retry package
            </button>
          </div>
        </div>
      )}

      {pkg && !loading && (
        <div className="mt-3 flex flex-col gap-3">
          {!pkg.allowed ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-2.5 py-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden />
                <p className="text-[10.5px] leading-snug text-amber-200/90">
                  {pkg.reason ??
                    'Implementation targets are withheld from this lens.'}
                </p>
              </div>
              {pkg.managerChecklist && pkg.managerChecklist.length > 0 && (
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
                    executive checklist
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {pkg.managerChecklist.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/40 px-2.5 py-2 text-[10.5px] leading-snug text-zinc-300"
                      >
                        <ClipboardCheck
                          className="mt-0.5 size-3 shrink-0 text-amber-300/80"
                          aria-hidden
                        />
                        <span className="min-w-0">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              {pkg.patch && (
                <DiffBlock
                  file={pkg.patch.file}
                  language={pkg.patch.language}
                  diff={pkg.patch.diff}
                />
              )}

              {pkg.verification && (
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <Play className="size-3 text-emerald-400/80" aria-hidden />
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
                      verification · expect {pkg.verification.expect}
                    </p>
                  </div>
                  <code className="mt-1.5 block overflow-x-auto whitespace-pre rounded border border-zinc-800/70 bg-zinc-900/60 px-2 py-1.5 font-mono text-[9.5px] text-emerald-200/90">
                    {pkg.verification.command}
                  </code>
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
                    {pkg.verification.note}
                  </p>
                </div>
              )}

              {pkg.rollback && pkg.rollback.length > 0 && (
                <details className="group rounded-lg border border-zinc-800/80 bg-zinc-950/40">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300">
                    <Undo2 className="size-3" aria-hidden />
                    rollback path
                    <ChevronDown
                      className="ml-auto size-3 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <ol className="flex flex-col gap-1.5 px-2.5 pb-2.5">
                    {pkg.rollback.map((step, index) => (
                      <li
                        key={step}
                        className="flex items-start gap-2 text-[10.5px] leading-snug text-zinc-400"
                      >
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-zinc-700 font-mono text-[7.5px] text-zinc-500">
                          {index + 1}
                        </span>
                        <span className="min-w-0">{step}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {pkg.day1 && pkg.day1.length > 0 && (
                <details open className="group rounded-lg border border-zinc-800/80 bg-zinc-950/40">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300">
                    <ShieldAlert className="size-3" aria-hidden />
                    day-1 survival plan
                    <ChevronDown
                      className="ml-auto size-3 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <ol className="flex flex-col gap-2 px-2.5 pb-2.5">
                    {pkg.day1.map((step, index) => (
                      <li key={step.id} className="flex items-start gap-2">
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 font-mono text-[7.5px] text-emerald-300">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10.5px] font-medium text-zinc-200">
                            {step.title}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                            {step.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/70 pt-2.5">
            <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
              <Lock className="size-2.5" aria-hidden />
              generated server-side · {pkg.doubtId}
            </span>
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-300">
                <Check className="size-2.5" aria-hidden />
                verified
              </span>
            ) : canVerify ? (
              <button
                type="button"
                onClick={() => void verifyDoubt(doubt.id)}
                disabled={verifying}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/15 disabled:cursor-wait disabled:opacity-50"
              >
                {verifying ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  <ClipboardCheck className="size-3" aria-hidden />
                )}
                {verifying ? 'recording…' : 'mark verified'}
              </button>
            ) : (
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
                {doubt.status === 'resolved'
                  ? 'verification recorded'
                  : 'resolve this doubt to verify'}
              </span>
            )}
          </div>
        </div>
      )}

      {!hideDispatch && (
        <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5">
        <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
          ship this remediation
        </p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void runDispatch('github')}
            disabled={dispatchBusy}
            className={[
              'inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.12em] transition disabled:cursor-wait disabled:opacity-50',
              role === 'manager'
                ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200 hover:bg-amber-500/10'
                : 'border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/70',
            ].join(' ')}
            title={
              role === 'manager'
                ? 'The API returns 403 for manager GitHub PR dispatch'
                : 'Open a GitHub PR from the server-built handover artifact'
            }
          >
            {dispatchTarget === 'github' && dispatchBusy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <GitPullRequest className="size-3" aria-hidden />
            )}
            Open Remediation PR
          </button>
          <button
            type="button"
            onClick={() => void runDispatch('notion')}
            disabled={dispatchBusy}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800/70 disabled:cursor-wait disabled:opacity-50"
            title="Sync the signed handover artifact to Notion"
          >
            {dispatchTarget === 'notion' && dispatchBusy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <FileText className="size-3" aria-hidden />
            )}
            Sync to Notion
          </button>
        </div>

        {role === 'manager' && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-2.5 py-2">
            <Lock className="mt-0.5 size-3 shrink-0 text-amber-300" aria-hidden />
            <p className="text-[10px] leading-snug text-amber-200/90">
              <span className="font-mono text-[8.5px] uppercase tracking-wider">
                403 · least privilege
              </span>
              <br />
              GitHub PR dispatch is developer-only. Managers may still sync the
              role-filtered summary to Notion.
            </p>
          </div>
        )}

        {dispatchError && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-2.5 py-2">
            <ShieldAlert className="mt-0.5 size-3 shrink-0 text-red-400" aria-hidden />
            <p className="text-[10px] leading-snug text-red-200">{dispatchError}</p>
          </div>
        )}

        {dispatch && (
          <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2">
            <p className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-300">
              <ShieldCheck className="size-3" aria-hidden />
              {dispatch.integration.target === 'github'
                ? 'PR dispatch signed'
                : 'Notion sync signed'}{' '}
              · {dispatch.integration.mode}
            </p>
            <p className="mt-1 break-all font-mono text-[9px] text-zinc-300">
              {dispatch.integration.reference}
            </p>
            <p className="mt-0.5 break-all font-mono text-[8px] text-zinc-600">
              artifact sha256 · {dispatch.integration.artifactSha256.slice(0, 24)}…
            </p>
            {dispatch.integration.url && (
              <a
                href={dispatch.integration.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-wider text-sky-300 underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-2.5" aria-hidden />
                open external record
              </a>
            )}
            {dispatch.artifact ? (
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-zinc-800/70 bg-zinc-950/60 px-2 py-1.5 font-mono text-[8.5px] leading-relaxed text-zinc-500">
                {dispatch.artifact.markdown.slice(0, 900)}
              </pre>
            ) : (
              <p className="mt-1.5 font-mono text-[8px] uppercase tracking-wider text-amber-300/70">
                manager lens · no artifact payload by design
              </p>
            )}
          </div>
        )}
      </div>
      )}
    </section>
  );
}
