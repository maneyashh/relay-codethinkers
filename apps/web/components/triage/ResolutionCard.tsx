'use client';

import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Command,
  CornerDownLeft,
  Loader2,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { HandoffActions } from '@/components/triage/HandoffActions';
import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';
import type { DecisionType, Doubt, Role } from '@/stores/triage';

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

function lensCopy(role: Role) {
  return role === 'manager'
    ? {
        title: 'Decide what to escalate.',
        detail:
          'The executive lens decides the commercial call. Implementation stays with the developer lens.',
      }
    : {
        title: 'Choose the implementation path.',
        detail:
          'Your choice is written to the audit trail with a signed decision record.',
      };
}

/**
 * Part 3: the answer. Never sticky, never overlaying the question — it simply
 * follows the evidence in the same scroll narrative.
 */
export function ResolutionCard({ doubt, role }: { doubt: Doubt; role: Role }) {
  const resolve = useTriage((s) => s.resolve);
  const skip = useTriage((s) => s.skip);
  const reopen = useTriage((s) => s.reopen);
  const pendingAction = useTriage((s) => s.pendingAction);
  const setAskOpen = useConsole((s) => s.setAskOpen);
  const setChaosOpen = useConsole((s) => s.setChaosOpen);

  const copy = lensCopy(role);
  const [decisionType, setDecisionType] = useState<DecisionType>(
    role === 'manager' ? 'confirm_blocker' : 'standard',
  );
  const [rationale, setRationale] = useState('');
  const [owner, setOwner] = useState(doubt.implementation?.owner ?? '');
  const [signoffName, setSignoffName] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);

  const busy = pendingAction !== null;
  const resolving = pendingAction === `resolve:${doubt.id}`;
  const resolved = doubt.status === 'resolved';
  const chosen = doubt.resolutions.find((r) => r.id === doubt.resolvedWith);

  const decisionInput = {
    decisionType,
    rationale: rationale.trim() || undefined,
    owner: owner.trim() || undefined,
    signoffName: signoffName.trim() || undefined,
    signedOff: Boolean(signoffName.trim()),
  };

  return (
    <section
      aria-label="Resolve this contradiction"
      data-guide="resolution"
      className="rounded-[26px] bg-white/[0.028] p-5 ring-1 ring-white/[0.06] shadow-[0_40px_120px_-70px_rgba(0,0,0,1)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-zinc-500">
            {resolved ? 'Decision recorded' : 'Resolve this contradiction'}
          </p>
          <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-zinc-100 sm:text-[19px]">
            {resolved && chosen ? chosen.label : copy.title}
          </h2>
          <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-zinc-500">
            {resolved && chosen ? chosen.description : copy.detail}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.13em] text-zinc-400 ring-1 ring-white/[0.06]">
          {role === 'manager' ? 'Executive lens' : 'Developer lens'}
        </span>
      </div>

      {resolved && chosen && (
        <div className="mt-5 rounded-2xl bg-emerald-400/[0.06] p-4 ring-1 ring-emerald-400/20 animate-in fade-in duration-300" data-guide="resolved">
          <div className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
              <Check className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500">
                <span>
                  decision ·{' '}
                  {doubt.decision
                    ? DECISION_LABEL[doubt.decision.type]
                    : 'standard'}
                </span>
                <span className="size-1 rounded-full bg-zinc-700" aria-hidden />
                <span>
                  verification · {doubt.decision?.verification ?? 'pending'}
                </span>
                {doubt.decision?.signedOff && (
                  <>
                    <span
                      className="size-1 rounded-full bg-zinc-700"
                      aria-hidden
                    />
                    <span className="text-emerald-300/90">
                      signed off ·{' '}
                      {doubt.decision.signoffName ??
                        doubt.decision.owner ??
                        'session'}
                    </span>
                  </>
                )}
              </div>
              {doubt.decision?.rationale && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-300">
                  “{doubt.decision.rationale}”
                </p>
              )}

              <div className="mt-4 border-t border-emerald-400/15 pt-4">
                <p className="mb-2.5 font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-300/80">
                  Next actions · dispatch the decision
                </p>
                <HandoffActions role={role} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reopen(doubt.id)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-wait disabled:opacity-40"
              title="Reopen this decision"
            >
              <RotateCcw className="size-2.5" aria-hidden />
              reopen
            </button>
          </div>
        </div>
      )}

      {doubt.status === 'skipped' && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/[0.03] px-3 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-500 ring-1 ring-white/[0.05]">
          skipped · still open for the next reviewer
        </p>
      )}

      {!resolved && (
        <div
          className="mt-4 flex flex-col gap-2"
          role="radiogroup"
          aria-label="Resolution options"
        >
        {doubt.resolutions.map((resolution) => {
          const isChosen = doubt.resolvedWith === resolution.id;
          const isChoosing = choosing === resolution.id && resolving;
          const locked = resolved || busy;

          return (
            <button
              key={resolution.id}
              type="button"
              role="radio"
              aria-checked={isChosen}
              onClick={() => {
                if (locked) return;
                setChoosing(resolution.id);
                void resolve(resolution.id, doubt.id, decisionInput);
              }}
              disabled={locked}
              className={[
                'group relative flex w-full items-start gap-4 rounded-2xl px-4 py-3.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
                isChosen
                  ? 'bg-emerald-400/[0.07] ring-1 ring-emerald-400/25'
                  : resolved
                    ? 'bg-white/[0.012] ring-1 ring-white/[0.04] opacity-45'
                    : 'bg-white/[0.022] ring-1 ring-white/[0.05] hover:bg-white/[0.045] hover:ring-white/[0.1] active:scale-[0.995]',
                locked && !isChosen ? 'cursor-default' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-mono text-[11px] transition-colors',
                  isChosen || isChoosing
                    ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                    : 'bg-white/[0.05] text-zinc-400 ring-1 ring-white/[0.06] group-hover:text-zinc-200',
                ].join(' ')}
              >
                {isChoosing ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : isChosen ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  resolution.id
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium tracking-[-0.01em] text-zinc-100">
                  {resolution.label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500">
                  {resolution.description}
                </span>
              </span>

              <CornerDownLeft
                className={[
                  'mt-1.5 size-3.5 shrink-0 transition-opacity',
                  isChosen
                    ? 'text-emerald-300/70 opacity-100'
                    : 'text-zinc-600 opacity-0 group-hover:opacity-100',
                ].join(' ')}
                aria-hidden
              />
            </button>
          );
        })}
        </div>
      )}

      <div className="mt-3 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setComposerOpen((value) => !value)}
          aria-expanded={composerOpen}
          className="flex w-full items-center gap-2 py-2.5 text-left"
        >
          <ClipboardCheck className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
            decision record
          </span>
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-400">
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
              'ml-auto size-3.5 shrink-0 text-zinc-500 transition-transform duration-200',
              composerOpen ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          />
        </button>

        {composerOpen && (
          <div className="grid gap-2.5 pb-3.5 animate-in fade-in duration-150">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                  decision type
                </span>
                <select
                  value={decisionType}
                  onChange={(event) =>
                    setDecisionType(event.target.value as DecisionType)
                  }
                  className="w-full rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[10.5px] text-zinc-200 outline-none ring-1 ring-white/[0.06] transition focus:bg-white/[0.06] focus:ring-white/20"
                >
                  {DECISION_OPTIONS.map((option) => (
                    <option key={option} value={option} className="bg-zinc-950">
                      {DECISION_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                  accountable owner
                </span>
                <input
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  maxLength={80}
                  placeholder="name or team"
                  className="w-full rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[10.5px] text-zinc-200 outline-none ring-1 ring-white/[0.06] transition placeholder:text-zinc-600 focus:bg-white/[0.06] focus:ring-white/20"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                rationale · why this call
              </span>
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Attach the sentence your successor will need in six months."
                className="w-full resize-y rounded-xl bg-white/[0.04] px-3 py-2 text-[11.5px] leading-relaxed text-zinc-200 outline-none ring-1 ring-white/[0.06] transition placeholder:text-zinc-600 focus:bg-white/[0.06] focus:ring-white/20"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
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
                className="w-full rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[10.5px] text-zinc-200 outline-none ring-1 ring-white/[0.06] transition placeholder:text-zinc-600 focus:bg-white/[0.06] focus:ring-white/20"
              />
            </label>

            <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
              saved with the next resolution · mirrored to the audit trail
            </p>
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={() => void skip()}
          disabled={doubt.status !== 'open' || busy}
          className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40"
        >
          <kbd className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-400">
            S
          </kbd>
          Skip for now
        </button>

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <Command className="size-3" aria-hidden />
            Ask Relay
          </button>
          <button
            type="button"
            onClick={() => setChaosOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500 transition hover:bg-amber-400/[0.08] hover:text-amber-200"
          >
            <Zap className="size-3" aria-hidden />
            Inject signal
          </button>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
            <Sparkles className="size-3" aria-hidden />1-3 resolve
          </span>
        </span>
      </div>
    </section>
  );
}
