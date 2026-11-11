'use client';

import {
  Briefcase,
  Command,
  Flame,
  Loader2,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { SecurityProof } from '@/components/triage/SecurityProof';
import { useConsole } from '@/stores/console';
import { levelFromXp, ROLE_LABEL, useTriage } from '@/stores/triage';

function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-1.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-800/70 text-zinc-400">
        {icon}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </span>
        <span className="block font-mono text-[12px] font-medium text-zinc-200">
          {value}
          {detail && (
            <span className="ml-1.5 hidden font-normal text-zinc-500 sm:inline">
              {detail}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

export function TopBar() {
  const xp = useTriage((s) => s.xp);
  const readiness = useTriage((s) => s.readiness);
  const streak = useTriage((s) => s.streak);
  const doubts = useTriage((s) => s.doubts);
  const role = useTriage((s) => s.role);
  const setRole = useTriage((s) => s.setRole);
  const setView = useTriage((s) => s.setView);
  const switchingRole = useTriage((s) => s.switchingRole);
  const setAskOpen = useConsole((s) => s.setAskOpen);
  const setChaosOpen = useConsole((s) => s.setChaosOpen);

  const level = levelFromXp(xp);
  const resolved = doubts.filter((d) => d.status === 'resolved').length;
  const open = doubts.filter((d) => d.status === 'open').length;
  const xpToNext = 250 - (xp % 250);
  const levelProgress = ((xp % 250) / 250) * 100;

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800/80 bg-zinc-950/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 font-mono text-[12px] font-bold text-zinc-950">
          R
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-zinc-100">
            Relay
          </div>
          <div className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500 sm:block">
            relay-labs · v2 handover · T-5d
          </div>
        </div>
      </div>

      {/* Live role toggle: the whole board reacts to this state. */}
      <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600 xl:inline">
        View as
      </span>
      <div
        className="relative ml-1 grid shrink-0 grid-cols-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-0.5 xl:ml-0"
        role="group"
        aria-label="View board as"
      >
        <span
          className={[
            'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-zinc-800 shadow-sm transition-transform duration-300 ease-out',
            role === 'junior' ? 'translate-x-full' : 'translate-x-0',
          ].join(' ')}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => void setRole('manager')}
          disabled={switchingRole}
          aria-pressed={role === 'manager'}
          className={[
            'relative z-10 flex h-6 items-center justify-center gap-1.5 rounded-md px-2.5 text-[10px] font-medium transition-colors disabled:cursor-wait',
            role === 'manager' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          <Briefcase className="size-3" aria-hidden />
          <span className="hidden sm:inline">{ROLE_LABEL.manager}</span>
          <span className="sm:hidden">Mgr</span>
        </button>
        <button
          type="button"
          onClick={() => void setRole('junior')}
          disabled={switchingRole}
          aria-pressed={role === 'junior'}
          className={[
            'relative z-10 flex h-6 items-center justify-center gap-1.5 rounded-md px-2.5 text-[10px] font-medium transition-colors disabled:cursor-wait',
            role === 'junior' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          <Terminal className="size-3" aria-hidden />
          <span className="hidden sm:inline">{ROLE_LABEL.junior}</span>
          <span className="sm:hidden">Dev</span>
        </button>
      </div>

      {switchingRole ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-zinc-500"
          aria-label="Re-verifying permissions"
        />
      ) : (
        <SecurityProof />
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
          title="Ask the handover graph (⌘K / Ctrl K)"
          aria-label="Ask Relay"
        >
          <Command className="size-3 text-emerald-400/80" aria-hidden />
          <span className="hidden lg:inline">Ask Relay</span>
          <kbd className="hidden rounded border border-zinc-700 bg-zinc-950/60 px-1 py-0.5 text-[7.5px] text-zinc-500 2xl:inline">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setChaosOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-amber-300 transition hover:border-amber-500/40 hover:bg-amber-500/10"
          title="Inject a live signal (C)"
          aria-label="Inject a live signal"
        >
          <Zap className="size-3" aria-hidden />
          <span className="hidden lg:inline">Inject</span>
        </button>
      </div>

      {readiness === 100 && (
        <button
          type="button"
          onClick={() => setView('complete')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/15"
        >
          <Sparkles className="size-3" aria-hidden />
          <span className="hidden sm:inline">Handover</span>
        </button>
      )}

      <div className="ml-auto flex items-center gap-2 overflow-hidden">
        <div className="hidden sm:block">
          <Stat
            icon={<Zap className="size-3.5" aria-hidden />}
            label="XP"
            value={xp}
            detail={`Lv ${level} · ${xpToNext} to next`}
          />
        </div>
        <div className="hidden sm:block">
          <Stat
            icon={<Flame className="size-3.5" aria-hidden />}
            label="Streak"
            value={`${streak}×`}
            detail={streak > 0 ? 'keep going' : 'start one'}
          />
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-1.5">
          <div
            className="relative grid size-8 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#10b981 ${readiness}%, #27272a ${readiness}% 100%)`,
            }}
            role="img"
            aria-label={`Handover readiness ${readiness}%`}
          >
            <div className="grid size-6 place-items-center rounded-full bg-zinc-950 font-mono text-[9px] font-semibold text-zinc-200">
              {readiness}
            </div>
          </div>
          <span className="hidden leading-tight sm:block">
            <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
              Readiness
            </span>
            <span className="block font-mono text-[12px] font-medium text-zinc-200">
              {readiness}%
            </span>
          </span>
        </div>

        <div className="hidden items-center gap-2 border-l border-zinc-800/80 pl-3 md:flex">
          <span className="font-mono text-[10px] text-zinc-500">
            {resolved} resolved
          </span>
          <span className="size-1 rounded-full bg-zinc-700" aria-hidden />
          <span className="font-mono text-[10px] text-zinc-500">{open} open</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-800/80">
        <div
          className="h-full bg-emerald-500/60 transition-[width] duration-300"
          style={{ width: `${levelProgress}%` }}
        />
      </div>
    </header>
  );
}
