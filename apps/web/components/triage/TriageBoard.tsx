'use client';

import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AskRelay } from '@/components/triage/AskRelay';
import { BlastRadius } from '@/components/triage/BlastRadius';
import { ChaosConsole } from '@/components/triage/ChaosConsole';
import { ClaimPanel } from '@/components/triage/ClaimPanel';
import { EngineHint } from '@/components/triage/EngineHint';
import { EvidenceQuote } from '@/components/triage/EvidenceQuote';
import { MissionBar } from '@/components/triage/MissionBar';
import { QueueRail } from '@/components/triage/QueueRail';
import { RemediationPanel } from '@/components/triage/RemediationPanel';
import { Shortcuts } from '@/components/triage/Shortcuts';
import { TimelineAxis } from '@/components/triage/TimelineAxis';
import { TopBar } from '@/components/triage/TopBar';

import { formatDelta } from '@/lib/synthesis';
import {
  type DecisionType,
  type Severity,
  evidenceForRole,
  selectCurrent,
  useTriage,
  useTriageHotkeys,
} from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const DECISION_LABEL: Record<DecisionType, string> = {
  standard: 'Fix now',
  confirm_blocker: 'Confirm blocker',
  accept_risk: 'Accept risk',
  escalate: 'Escalate',
  verify: 'Verified',
  auto: 'Auto-triage',
};

const DECISION_OPTIONS: DecisionType[] = [
  'standard',
  'confirm_blocker',
  'accept_risk',
  'escalate',
];

export function TriageBoard() {
  useTriageHotkeys();

  const doubts = useTriage((s) => s.doubts);
  const current = useTriage(selectCurrent);
  const role = useTriage((s) => s.role);
  const readiness = useTriage((s) => s.readiness);
  const lastReward = useTriage((s) => s.lastReward);
  const select = useTriage((s) => s.select);
  const resolve = useTriage((s) => s.resolve);
  const skip = useTriage((s) => s.skip);
  const reopen = useTriage((s) => s.reopen);
  const reset = useTriage((s) => s.reset);
  const pendingAction = useTriage((s) => s.pendingAction);
  const error = useTriage((s) => s.error);
  const clearError = useTriage((s) => s.clearError);
  const focusEvidenceId = useTriage((s) => s.focusEvidenceId);

  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    null,
  );
  const [decisionType, setDecisionType] = useState<DecisionType>(
    role === 'manager' ? 'confirm_blocker' : 'standard',
  );
  const [rationale, setRationale] = useState('');
  const [owner, setOwner] = useState('');
  const [signoffName, setSignoffName] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const visibleEvidence = useMemo(
    () => (current ? evidenceForRole(current.evidence, role) : []),
    [current, role],
  );
  // A server projection can remove the previously selected evidence row. Only
  // treat the selection as active while it is still in the current payload.
  const selectedEvidence =
    visibleEvidence.find((item) => item.id === selectedEvidenceId) ?? null;
  // `lockedEvidence` is computed by SQL. It lets the UI say "these rows exist
  // but your role cannot receive them" without ever shipping their content.
  const hiddenEvidenceCount = current
    ? (current.lockedEvidence ??
      current.evidence.length - visibleEvidence.length)
    : 0;
  const busy = pendingAction !== null;

  // Clear the floating "+XP" toast after a moment.
  useEffect(() => {
    if (!lastReward) return;
    const t = setTimeout(() => useTriage.setState({ lastReward: null }), 1400);
    return () => clearTimeout(t);
  }, [lastReward]);

  // Moving to a different doubt resets the decision composer. The owner is
  // pre-filled from the developer projection when the lens provides one.
  useEffect(() => {
    const state = useTriage.getState();
    const doubt = state.doubts.find((item) => item.id === state.selectedId);
    const frame = requestAnimationFrame(() => {
      setRationale('');
      setSignoffName('');
      setOwner(doubt?.implementation?.owner ?? '');
      setDecisionType(
        state.role === 'manager' ? 'confirm_blocker' : 'standard',
      );
      setComposerOpen(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [current?.id, role]);

  // Ask Relay and the handover citation chips trade an evidence id for a real
  // scroll position. We clear it afterwards so the same citation can retrigger.
  useEffect(() => {
    if (!focusEvidenceId) return;
    const frame = requestAnimationFrame(() => {
      setSelectedEvidenceId(focusEvidenceId);
      document
        .getElementById(`evidence-${focusEvidenceId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = window.setTimeout(() => {
      if (useTriage.getState().focusEvidenceId === focusEvidenceId) {
        useTriage.setState({ focusEvidenceId: null });
      }
    }, 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusEvidenceId, current?.id]);

  const decisionInput = {
    decisionType,
    rationale: rationale.trim() || undefined,
    owner: owner.trim() || undefined,
    signoffName: signoffName.trim() || undefined,
    signedOff: Boolean(signoffName.trim()),
  };

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-zinc-700/60 animate-in fade-in duration-500">
      <TopBar />
      <MissionBar />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-56 shrink-0 overflow-y-auto border-b border-zinc-800/80 bg-zinc-950 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r xl:w-80">
          <QueueRail
            doubts={doubts}
            selectedId={current?.id ?? null}
            onSelect={select}
          />
        </aside>

        {current ? (
          <main className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:overflow-hidden">
            {/* DECISION FLOW: claim -> engine read -> resolutions */}
            <section className="flex min-h-0 flex-col gap-6 border-zinc-800/80 p-5 sm:p-8 xl:overflow-y-auto xl:border-r">
              <ClaimPanel doubt={current} role={role} />

              {current.synthesis &&
                (current.synthesis.injectedCount > 0 ||
                  Math.abs(current.synthesis.delta) > 0.0005) && (
                  <div className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Sparkles
                        className="size-3.5 text-amber-300"
                        aria-hidden
                      />
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-amber-300">
                        live signal synthesis
                      </p>
                      <span className="ml-auto rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-200/90">
                        {current.synthesis.injectedCount} injected
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                      <span className="font-mono text-[20px] font-medium text-zinc-400">
                        {Math.round(
                          current.synthesis.baseConfidence * 100,
                        )}
                        %
                      </span>
                      <ArrowUpRight
                        className="mb-1 size-3.5 text-zinc-600"
                        aria-hidden
                      />
                      <span className="font-mono text-[20px] font-medium text-amber-300">
                        {Math.round(current.synthesis.confidence * 100)}%
                      </span>
                      <span
                        className={[
                          'mb-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px]',
                          current.synthesis.delta >= 0
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-300',
                        ].join(' ')}
                      >
                        {formatDelta(current.synthesis.delta)} pts
                      </span>
                    </div>
                    <p className="mt-1.5 truncate font-mono text-[9px] text-zinc-500">
                      {current.synthesis.formula}
                    </p>
                  </div>
                )}

              <EngineHint
                hint={current.engineHint}
                confidence={current.confidence}
                role={role}
              />

              <div className="sticky bottom-0 z-20 rounded-xl border border-zinc-800/80 bg-zinc-900/80 p-2 shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md">
                <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Resolve
                    </p>
                    <p className="mt-1 text-[13px] text-zinc-400">
                      {role === 'manager'
                        ? 'Choose the outcome to escalate.'
                        : 'Choose the implementation path.'}
                    </p>
                  </div>
                  {current.status !== 'open' && (
                    <button
                      onClick={() => void reopen(current.id)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-400 transition hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-wait disabled:opacity-50"
                    >
                      {current.status} · reopen
                    </button>
                  )}
                </div>

                {current.decision && (
                  <div className="mx-3 mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-400">
                        decision
                      </span>
                      <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                        {DECISION_LABEL[current.decision.type]}
                      </span>
                      {current.decision.signedOff && (
                        <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-zinc-400">
                          <Check className="size-2.5 text-emerald-400" aria-hidden />
                          signed off ·{' '}
                          {current.decision.signoffName ??
                            current.decision.owner ??
                            'session'}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[8px] uppercase tracking-wider text-zinc-500">
                        verification · {current.decision.verification}
                      </span>
                    </div>
                    {current.decision.rationale && (
                      <p className="mt-1.5 text-[10.5px] leading-snug text-zinc-300">
                        “{current.decision.rationale}”
                      </p>
                    )}
                    {current.decision.owner && (
                      <p className="mt-1 font-mono text-[8.5px] text-zinc-600">
                        owner · {current.decision.owner}
                      </p>
                    )}
                  </div>
                )}

                <div className="mx-3 mb-2 rounded-lg border border-zinc-800/70 bg-zinc-950/40">
                  <button
                    type="button"
                    onClick={() => setComposerOpen((value) => !value)}
                    aria-expanded={composerOpen}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                  >
                    <ClipboardCheck
                      className="size-3 shrink-0 text-zinc-500"
                      aria-hidden
                    />
                    <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                      decision record
                    </span>
                    <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-300">
                      {DECISION_LABEL[decisionType]}
                    </span>
                    {(rationale || signoffName || owner) && (
                      <span
                        className="size-1.5 rounded-full bg-emerald-400"
                        aria-label="Decision details attached"
                      />
                    )}
                    <ChevronDown
                      className={[
                        'ml-auto size-3 shrink-0 text-zinc-500 transition-transform',
                        composerOpen ? 'rotate-180' : '',
                      ].join(' ')}
                      aria-hidden
                    />
                  </button>

                  {composerOpen && (
                    <div className="grid gap-2 border-t border-zinc-800/70 p-2.5 animate-in fade-in duration-150">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-zinc-500">
                            decision type
                          </span>
                          <select
                            value={decisionType}
                            onChange={(event) =>
                              setDecisionType(
                                event.target.value as DecisionType,
                              )
                            }
                            className="w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] text-zinc-200 outline-none transition focus:border-zinc-600"
                          >
                            {DECISION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {DECISION_LABEL[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-zinc-500">
                            accountable owner
                          </span>
                          <input
                            value={owner}
                            onChange={(event) => setOwner(event.target.value)}
                            maxLength={80}
                            placeholder="name or team"
                            className="w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
                          />
                        </label>
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-zinc-500">
                          rationale · why this call
                        </span>
                        <textarea
                          value={rationale}
                          onChange={(event) => setRationale(event.target.value)}
                          rows={2}
                          maxLength={400}
                          placeholder="Attach the sentence your successor will need in six months."
                          className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-[10.5px] leading-snug text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-zinc-500">
                          sign-off name · optional
                        </span>
                        <input
                          value={signoffName}
                          onChange={(event) => setSignoffName(event.target.value)}
                          maxLength={80}
                          placeholder={
                            decisionType === 'accept_risk'
                              ? 'Who accepts the residual risk?'
                              : 'Who can defend this decision later?'
                          }
                          className="w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-zinc-600"
                        />
                      </label>

                      <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-zinc-600">
                        saved with the next resolution · mirrored to the audit
                        trail
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  {current.resolutions.map((r) => {
                    const chosen = current.resolvedWith === r.id;

                    return (
                      <button
                        key={r.id}
                        onClick={() =>
                          void resolve(r.id, current.id, decisionInput)
                        }
                        disabled={current.status === 'resolved' || busy}
                        className={[
                          'group flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40 active:scale-[0.995]',
                          chosen
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-transparent hover:border-zinc-700/80 hover:bg-zinc-800/60',
                          'disabled:cursor-default disabled:opacity-60 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:active:scale-100',
                        ].join(' ')}
                      >
                        <kbd
                          className={[
                            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] transition-colors',
                            chosen
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-400 group-hover:border-zinc-500 group-hover:text-zinc-200',
                          ].join(' ')}
                        >
                          {r.id}
                        </kbd>

                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium text-zinc-100">
                            {r.label}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-400">
                            {r.description}
                          </span>
                        </span>

                        <Check
                          className={[
                            'mt-1 size-4 shrink-0 transition-opacity',
                            chosen
                              ? 'text-emerald-400 opacity-100'
                              : 'text-zinc-500 opacity-0 group-hover:opacity-100',
                          ].join(' ')}
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-zinc-800/80 px-4 pb-2 pt-3">
                  <button
                    onClick={() => void skip()}
                    disabled={current.status !== 'open' || busy}
                    className="flex items-center gap-2 text-[12px] text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40"
                  >
                    <kbd className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      S
                    </kbd>
                    Skip for now
                  </button>
                  <span className="hidden font-mono text-[10px] text-zinc-600 sm:block">
                    ⌘K ask · C inject · ? help
                  </span>
                </div>
              </div>
            </section>

            {/* DEEP DIVE: timeline + evidence */}
            <section className="flex min-h-0 flex-col gap-6 bg-zinc-950 p-5 sm:p-8 xl:overflow-y-auto">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Evidence
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Read the sources in context.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                  {visibleEvidence.length} visible
                  {hiddenEvidenceCount > 0 && ` · ${hiddenEvidenceCount} hidden`}
                </span>
              </div>

              <BlastRadius
                doubt={current}
                role={role}
                selectedId={selectedEvidence?.id ?? null}
                onSelect={setSelectedEvidenceId}
              />

              <RemediationPanel key={current.id} doubt={current} role={role} />

              <TimelineAxis evidence={visibleEvidence} />

              <ul className="flex flex-col gap-4" aria-label="Evidence deep dive">
                {visibleEvidence.map((e) => (
                  <li
                    key={e.id}
                    id={`evidence-${e.id}`}
                    className="scroll-mt-24"
                  >
                    <EvidenceQuote
                      e={e}
                      tint={SEVERITY_COLOR[current.severity]}
                      role={role}
                      selected={selectedEvidence?.id === e.id}
                      onSelect={setSelectedEvidenceId}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </main>
        ) : (
          <main className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-sm rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-8 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-mono text-lg text-emerald-400">
                ✓
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Queue cleared</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Every doubt has been resolved or skipped. Handover readiness is{' '}
                <span className="font-mono text-zinc-200">{readiness}%</span>.
              </p>
              <button
                onClick={() => void reset()}
                disabled={busy}
                className="mt-5 rounded-lg border border-zinc-700 px-3.5 py-2 text-xs text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-wait disabled:opacity-50"
              >
                Reset demo data
              </button>
            </div>
          </main>
        )}
      </div>

      {/* XP toast */}
      {lastReward && (
        <div
          key={lastReward.key}
          className="pointer-events-none fixed right-6 top-16 animate-in fade-in slide-in-from-top-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-sm text-emerald-300 shadow-lg backdrop-blur"
        >
          +{lastReward.amount} XP
        </div>
      )}

      <ChaosConsole />
      <AskRelay />
      <Shortcuts />

      {error && (
        <div className="fixed bottom-5 left-5 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-3 py-2.5 text-[11px] leading-snug text-red-200 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-red-400/70 transition hover:text-red-200"
            aria-label="Dismiss error"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
