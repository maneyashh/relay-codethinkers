'use client';

import {
  ArrowUpRight,
  Check,
  GitPullRequest,
  Loader2,
  Lock,
  Send,
} from 'lucide-react';
import { useState } from 'react';

import { useTriage } from '@/stores/triage';
import type {
  IntegrationRecord,
  IntegrationTarget,
  Role,
} from '@/stores/triage';

/**
 * The two handoff actions a resolved contradiction earns. Kept here rather than
 * buried in the remediation drawer so the judge sees the outcome and the exit
 * from the decision in one place.
 */
export function HandoffActions({ role }: { role: Role }) {
  const dispatch = useTriage((s) => s.dispatchIntegration);
  const pendingAction = useTriage((s) => s.pendingAction);
  const clearError = useTriage((s) => s.clearError);

  const [results, setResults] = useState<
    Partial<Record<IntegrationTarget, IntegrationRecord>>
  >({});
  const [error, setError] = useState<string | null>(null);

  const active: IntegrationTarget | null = pendingAction?.startsWith('dispatch:')
    ? (pendingAction.slice('dispatch:'.length) as IntegrationTarget)
    : null;
  const busy = pendingAction !== null;

  async function run(target: IntegrationTarget) {
    if (busy) return;
    setError(null);
    const data = await dispatch(target);
    if (!data) {
      const message = useTriage.getState().error ?? 'Dispatch failed';
      const forbidden = /403|forbidden|developer/i.test(message);
      setError(
        forbidden
          ? '403 · least privilege. The manager lens cannot open a PR — the API rejected it before a branch or diff was built.'
          : message,
      );
      // The inline notice owns this action's error.
      clearError();
      return;
    }
    setResults((current) => ({ ...current, [target]: data.integration }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run('github')}
          disabled={busy}
          data-guide="pr"
          className="group inline-flex h-9 items-center gap-2 rounded-full bg-zinc-50 px-4 text-[12px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
          title={
            role === 'manager'
              ? 'Manager lens · the API answers 403 by design'
              : 'Open a PR from the server-built handover artifact'
          }
        >
          {active === 'github' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : role === 'manager' ? (
            <Lock className="size-3.5 text-zinc-600" aria-hidden />
          ) : (
            <GitPullRequest className="size-3.5" aria-hidden />
          )}
          Open remediation PR
          <ArrowUpRight
            className="size-3.5 text-zinc-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>

        <button
          type="button"
          onClick={() => void run('notion')}
          disabled={busy}
          data-guide="notion"
          className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium text-zinc-300 ring-1 ring-white/[0.1] transition hover:bg-white/[0.06] hover:text-zinc-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {active === 'notion' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="size-3.5 text-zinc-500" aria-hidden />
          )}
          Sync to Notion
        </button>

        {role === 'manager' && (
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
            PR dispatch · developer lens only
          </span>
        )}
      </div>

      {(results.github || results.notion) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.12em]">
          {results.github && (
            <span
              className="inline-flex flex-wrap items-center gap-1.5 text-emerald-300"
              data-guide="pr-result"
              title={`artifact sha256 ${results.github.artifactSha256}`}
            >
              <Check className="size-3" aria-hidden />
              {results.github.reference} · {results.github.mode}
              <span className="text-emerald-200/55">
                · sha256 {results.github.artifactSha256.slice(0, 12)}…
              </span>
            </span>
          )}
          {results.notion && (
            <span className="inline-flex items-center gap-1.5 text-sky-300" data-guide="notion-result">
              <Check className="size-3" aria-hidden />
              {results.notion.reference} · {results.notion.mode}
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="max-w-xl text-[11px] leading-snug text-amber-200/90" data-guide="manager-403">
          {error}
        </p>
      )}
    </div>
  );
}
