'use client';

import {
  ArrowRight,
  Briefcase,
  KeyRound,
  Loader2,
  ScanLine,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

import { RelayLogo, RelayMark } from '@/components/brand/RelayLogo';
import { JudgeWalkthroughTrigger } from '@/components/triage/JudgeWalkthrough';
import { BoardMenu } from '@/components/triage/MissionBar';
import { SecurityProof } from '@/components/triage/SecurityProof';
import { useConsole } from '@/stores/console';
import { ROLE_LABEL, useTriage } from '@/stores/triage';

/**
 * The board's only horizontal chrome: identity, progress, lens, mode, actions.
 * Everything else lives inside the canvas so the header never grows a second row.
 */
export function TopBar() {
  const readiness = useTriage((s) => s.readiness);
  const doubts = useTriage((s) => s.doubts);
  const role = useTriage((s) => s.role);
  const setRole = useTriage((s) => s.setRole);
  const setView = useTriage((s) => s.setView);
  const switchingRole = useTriage((s) => s.switchingRole);
  const focusMode = useTriage((s) => s.focusMode);
  const setFocusMode = useTriage((s) => s.setFocusMode);
  const setIngestOpen = useConsole((s) => s.setIngestOpen);
  const openSecurityTab = useConsole((s) => s.openSecurityTab);

  const resolved = doubts.filter((d) => d.status === 'resolved').length;
  const total = doubts.length;
  const complete = readiness === 100 && total > 0;

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#07080C]/80 px-3 backdrop-blur-2xl sm:gap-3 sm:px-5">
      {/* identity */}
      <span className="hidden sm:inline-flex">
        <RelayLogo size="sm" />
      </span>
      <RelayMark size={28} className="sm:hidden" />

      <Divider />

      {/* progress */}
      {complete ? (
        <button
          type="button"
          onClick={() => setView('complete')}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-400/[0.08] py-1 pl-2 pr-2.5 ring-1 ring-emerald-400/25 transition hover:bg-emerald-400/[0.14]"
          title="Open the handover artifact"
        >
          <span className="grid size-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
            <ShieldCheck className="size-3" aria-hidden />
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-emerald-200">
            handover ready
          </span>
          <ArrowRight
            className="size-3 text-emerald-300/70 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      ) : (
        <div
          className="hidden shrink-0 items-center gap-2.5 rounded-full bg-white/[0.03] py-1 pl-1.5 pr-3 ring-1 ring-white/[0.06] xl:flex"
          aria-label={`${resolved} of ${total} contradictions resolved · ${readiness}% handover readiness`}
        >
          <ReadinessRing value={readiness} />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums text-zinc-400">
            {resolved}/{total} resolved
          </span>
          <span className="size-1 rounded-full bg-zinc-700" aria-hidden />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] tabular-nums text-zinc-200">
            {readiness}% ready
          </span>
        </div>
      )}

      <Divider />

      {/* lens */}
      <div
        className="relative grid shrink-0 grid-cols-2 rounded-full bg-black/40 p-0.5 ring-1 ring-white/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.55)]"
        role="group"
        aria-label="Board lens"
        data-guide="lens"
      >
        <span
          className={[
            'pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-zinc-100 shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            role === 'junior' ? 'translate-x-full' : 'translate-x-0',
          ].join(' ')}
          aria-hidden
        />
        {(
          [
            {
              id: 'manager' as const,
              icon: Briefcase,
              label: ROLE_LABEL.manager,
              short: 'Mgr',
            },
            {
              id: 'junior' as const,
              icon: Terminal,
              label: ROLE_LABEL.junior,
              short: 'Dev',
            },
          ] as const
        ).map(({ id, icon: Icon, label, short }) => {
          const active = role === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => void setRole(id)}
              disabled={switchingRole}
              aria-pressed={active}
              title={`View the board as ${label}`}
              className={[
                'relative z-10 flex h-6 items-center justify-center gap-1.5 rounded-full px-1.5 transition-colors duration-200 disabled:cursor-wait sm:px-2.5',
                active
                  ? 'text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100',
              ].join(' ')}
            >
              <Icon className="size-3 shrink-0" aria-hidden />
              <span className="hidden text-[10.5px] font-medium tracking-[-0.01em] xl:inline">
                {label}
              </span>
              <span className="hidden text-[10.5px] font-medium tracking-[-0.01em] sm:inline xl:hidden">
                {short}
              </span>
            </button>
          );
        })}
      </div>

      {switchingRole ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-zinc-500"
          aria-label="Re-verifying permissions"
        />
      ) : (
        <SecurityProof />
      )}

      {/* mode */}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <div
          className={[
            'grid grid-cols-2 rounded-full p-0.5 ring-1 transition-colors duration-300',
            focusMode === 'war'
              ? 'bg-amber-400/[0.06] ring-amber-400/25 shadow-[0_0_22px_-8px_rgba(251,191,36,0.5)]'
              : 'bg-black/40 ring-white/[0.07]',
          ].join(' ')}
          role="group"
          aria-label="Board mode"
          data-guide="mode"
        >
          {(
            [
              {
                id: 'guided' as const,
                glyph: '◎',
                label: 'Focus',
                hint: 'One contradiction at a time',
              },
              {
                id: 'war' as const,
                glyph: '⌘',
                label: 'War-Room',
                hint: 'Queue and telemetry expanded',
              },
            ] as const
          ).map(({ id, glyph, label, hint }) => {
            const active = focusMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFocusMode(id)}
                aria-pressed={active}
                title={hint}
                className={[
                  'relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors duration-200',
                  active
                    ? 'bg-zinc-100 text-zinc-950 shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                    : 'text-zinc-400 hover:text-zinc-100',
                ].join(' ')}
              >
                <span
                  className="text-[12px] leading-none"
                  aria-hidden
                >
                  {glyph}
                </span>
                <span className="hidden text-[10.5px] font-medium tracking-[-0.01em] lg:inline">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <Divider />

        <button
          type="button"
          onClick={() => setIngestOpen(true)}
          className="hidden h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 sm:inline-flex"
          title="Ingest a live GitHub repository"
        >
          <ScanLine className="size-3.5" aria-hidden />
          <span className="hidden 2xl:inline">GitHub Scan</span>
        </button>
        <button
          type="button"
          onClick={() => openSecurityTab('receipt')}
          className="hidden h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 sm:inline-flex"
          title="SHA-256 receipt chain · export .relay.sig"
        >
          <KeyRound className="size-3.5" aria-hidden />
          <span className="hidden 2xl:inline">Receipt (.sig)</span>
        </button>

        <JudgeWalkthroughTrigger compact />
        <BoardMenu />      </div>
    </header>
  );
}

function Divider() {
  return (
    <span
      className="hidden h-5 w-px shrink-0 bg-white/[0.07] md:block"
      aria-hidden
    />
  );
}

function ReadinessRing({ value }: { value: number }) {
  return (
    <span
      className="relative grid size-6 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#34d399 ${value}%, rgba(255,255,255,0.09) ${value}% 100%)`,
      }}
      role="img"
      aria-label={`Handover readiness ${value} percent`}
    >
      <span className="grid size-[18px] place-items-center rounded-full bg-[#0b0c10] font-mono text-[7.5px] font-semibold tabular-nums text-zinc-300">
        {value}
      </span>
    </span>
  );
}
