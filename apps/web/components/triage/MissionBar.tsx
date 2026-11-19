'use client';

import {
  Circle,
  FastForward,
  HelpCircle,
  KeyRound,
  MoreHorizontal,
  RotateCcw,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

/**
 * The old mission bar, distilled into a single quiet menu. Nothing here is
 * needed to read the board, so it never takes horizontal chrome away from the
 * contradiction and its decision.
 */
export function BoardMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const doubts = useTriage((s) => s.doubts);
  const readiness = useTriage((s) => s.readiness);
  const pendingAction = useTriage((s) => s.pendingAction);
  const fastForward = useTriage((s) => s.fastForward);
  const reset = useTriage((s) => s.reset);
  const setView = useTriage((s) => s.setView);
  const setHelpOpen = useConsole((s) => s.setHelpOpen);
  const setIngestOpen = useConsole((s) => s.setIngestOpen);
  const openSecurityTab = useConsole((s) => s.openSecurityTab);

  const openCount = doubts.filter((d) => d.status === 'open').length;
  const busy = pendingAction !== null;
  const artifactReady = readiness === 100 && doubts.length > 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Board actions"
        title="Board actions"
        className={[
          'grid size-8 place-items-center rounded-full transition',
          open
            ? 'bg-white/[0.08] text-zinc-100'
            : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200',
        ].join(' ')}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-64 overflow-hidden rounded-2xl bg-[#0a0b10]/95 p-1.5 shadow-[0_40px_100px_-30px_rgba(0,0,0,1)] ring-1 ring-white/[0.08] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          {openCount > 0 && (
            <MenuItem
              icon={FastForward}
              label="Auto-triage remainder"
              meta={`${openCount} open`}
              tone="amber"
              disabled={busy}
              onClick={() => run(() => void fastForward())}
            />
          )}
          <MenuItem
            icon={Sparkles}
            label="Handover artifact"
            meta={artifactReady ? 'ready' : `${readiness}% ready`}
            tone={artifactReady ? 'emerald' : 'muted'}
            disabled={!artifactReady || busy}
            onClick={() => run(() => setView('complete'))}
          />
          <MenuItem
            icon={HelpCircle}
            label="Keyboard & judge guide"
            meta="?"
            onClick={() => run(() => setHelpOpen(true))}
          />
          <MenuItem
            icon={ScanLine}
            label="GitHub scan"
            meta="live ingest"
            onClick={() => run(() => setIngestOpen(true))}
          />
          <MenuItem
            icon={KeyRound}
            label="Receipt (.sig)"
            meta="export chain"
            onClick={() => run(() => openSecurityTab('receipt'))}
          />
          <div className="mx-1 my-1 h-px bg-white/[0.06]" />
          <MenuItem
            icon={RotateCcw}
            label="Reset session to T-5"
            tone="muted"
            disabled={busy}
            onClick={() => run(() => void reset())}
          />

          {pendingAction === 'fast-forward' && (
            <p className="inline-flex items-center gap-1.5 px-2.5 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-amber-300">
              <Circle className="size-2 animate-pulse fill-amber-300" aria-hidden />
              synthesising plan
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  meta,
  tone = 'default',
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  meta?: string;
  tone?: 'default' | 'amber' | 'emerald' | 'muted';
  disabled?: boolean;
  onClick: () => void;
}) {
  const iconTone =
    tone === 'amber'
      ? 'text-amber-300'
      : tone === 'emerald'
        ? 'text-emerald-300'
        : 'text-zinc-500';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className={`size-3.5 shrink-0 ${iconTone}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-200">
        {label}
      </span>
      {meta && (
        <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-500">
          {meta}
        </span>
      )}
    </button>
  );
}
