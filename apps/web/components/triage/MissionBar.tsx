'use client';

import {
  ArrowRight,
  Check,
  Circle,
  FastForward,
  HelpCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

function Step({
  index,
  label,
  detail,
  state,
  onClick,
  disabled,
}: {
  index: string;
  label: string;
  detail: string;
  state: 'done' | 'active' | 'todo';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const accent =
    state === 'done'
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : state === 'active'
        ? 'text-zinc-100 border-zinc-600 bg-zinc-800/60'
        : 'text-zinc-500 border-zinc-800 bg-zinc-900/30';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={[
        'group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition',
        accent,
        onClick && !disabled ? 'hover:border-zinc-500' : '',
        disabled ? 'cursor-default' : '',
      ].join(' ')}
      title={detail}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-md border border-current/20 font-mono text-[8px]">
        {state === 'done' ? <Check className="size-3" aria-hidden /> : index}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[10.5px] font-medium">{label}</span>
        <span className="hidden truncate font-mono text-[8px] uppercase tracking-[0.12em] opacity-70 sm:block">
          {detail}
        </span>
      </span>
    </button>
  );
}

export function MissionBar() {
  const doubts = useTriage((s) => s.doubts);
  const readiness = useTriage((s) => s.readiness);
  const pendingAction = useTriage((s) => s.pendingAction);
  const fastForward = useTriage((s) => s.fastForward);
  const reset = useTriage((s) => s.reset);
  const setView = useTriage((s) => s.setView);
  const setSecurityOpen = useConsole((s) => s.setSecurityOpen);
  const setHelpOpen = useConsole((s) => s.setHelpOpen);

  const resolved = doubts.filter((doubt) => doubt.status === 'resolved').length;
  const open = doubts.filter((doubt) => doubt.status === 'open').length;
  const total = doubts.length;
  const busy = pendingAction !== null;
  const artifactReady = readiness === 100;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800/80 bg-zinc-950/95 px-3 py-2 sm:px-4">
      <span className="mr-1 hidden font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-600 md:inline">
        judge route
      </span>

      <Step
        index="01"
        label="Ingest"
        detail="24 raw sources"
        state="done"
      />
      <Step
        index="02"
        label="Triage"
        detail={`${resolved}/${total} decided`}
        state={resolved > 0 ? (open === 0 ? 'done' : 'active') : 'active'}
      />
      <Step
        index="03"
        label="Boundary"
        detail="live API proof"
        state="todo"
        onClick={() => setSecurityOpen(true)}
      />
      <Step
        index="04"
        label="Artifact"
        detail={artifactReady ? 'ready to export' : `${readiness}% ready`}
        state={artifactReady ? 'active' : 'todo'}
        onClick={() => setView('complete')}
        disabled={!artifactReady}
      />

      <div className="ml-auto flex items-center gap-1.5">
        {open > 0 && (
          <button
            type="button"
            onClick={() => void fastForward()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50"
            title="Demo accelerator: applies Relay's recommended remediation to every remaining doubt and audits each as auto"
          >
            <FastForward className="size-3" aria-hidden />
            <span className="hidden sm:inline">Auto-triage</span> {open}
          </button>
        )}

        {artifactReady && (
          <button
            type="button"
            onClick={() => setView('complete')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/15"
          >
            <Sparkles className="size-3" aria-hidden />
            <span className="hidden sm:inline">Handover</span>
            <ArrowRight className="size-3" aria-hidden />
          </button>
        )}

        <button
          type="button"
          onClick={() => void reset()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-50"
          title="Reset this browser session to T-5 days"
        >
          <RotateCcw className="size-3" aria-hidden />
          <span className="hidden md:inline">Reset T-5</span>
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="grid size-7 place-items-center rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
          aria-label="Open keyboard shortcuts and judge route"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </div>

      {pendingAction === 'fast-forward' && (
        <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-amber-300">
          <Circle className="size-2 animate-pulse fill-amber-300" aria-hidden />
          synthesising plan
        </span>
      )}
      <span className="hidden items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600 2xl:inline-flex">
        <ShieldCheck className="size-3 text-emerald-400/70" aria-hidden />
        server-authoritative
      </span>
    </div>
  );
}
