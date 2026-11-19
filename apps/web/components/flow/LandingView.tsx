'use client';

import {
  ArrowRight,
  BadgeCheck,
  Check,
  ClipboardList,
  FileText,
  GitBranch,
  HelpCircle,
  MessageSquare,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { RelayLogo, RelayMark } from '@/components/brand/RelayLogo';
import { GitHubIngestStudio } from '@/components/triage/GitHubIngestStudio';
import { JudgeWalkthroughTrigger } from '@/components/triage/JudgeWalkthrough';
import { Shortcuts } from '@/components/triage/Shortcuts';
import { useConsole } from '@/stores/console';

const SOURCES: {
  label: string;
  detail: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { label: 'Slack', detail: '18 channels', icon: MessageSquare, color: '#a78bfa' },
  { label: 'Jira', detail: '42 tickets', icon: ClipboardList, color: '#60a5fa' },
  { label: 'GitHub', detail: '6 repos', icon: GitBranch, color: '#e4e4e7' },
  { label: 'Notion', detail: '31 docs', icon: FileText, color: '#d4d4d8' },
];

const STATS = [
  { value: '06', label: 'contradictions surfaced' },
  { value: '24', label: 'primary sources traced' },
  { value: '100%', label: 'decisions verified' },
  { value: '<4m', label: 'to a cold-start handover' },
];

function SourceChip({
  icon: Icon,
  label,
  detail,
  color,
  className,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={[
        'absolute z-10 flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/90 px-2.5 py-2 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.95)] backdrop-blur',
        className ?? '',
      ].join(' ')}
    >
      <span
        className="grid size-6 shrink-0 place-items-center rounded-md border border-zinc-800 bg-zinc-900"
        style={{ color }}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </span>
        <span className="block text-[10.5px] font-medium text-zinc-200">
          {detail}
        </span>
      </span>
    </div>
  );
}

function OrbitVisual() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[440px] select-none"
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.14),transparent_62%)]" />

      <div className="absolute inset-[5%] rounded-full border border-zinc-800/60" />
      <div className="absolute inset-[17%] rounded-full border border-dashed border-zinc-800/70" />
      <div className="absolute inset-[29%] rounded-full border border-zinc-800/60" />

      {/* orbiting signal dots */}
      <div className="orbit-spin absolute inset-[5%] rounded-full">
        <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_20px_#10b981]" />
      </div>
      <div className="orbit-spin-reverse absolute inset-[17%] rounded-full">
        <span className="absolute left-0 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_14px_#38bdf8]" />
        <span className="absolute right-0 top-1/2 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_14px_#a78bfa]" />
      </div>

      {/* center core */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative grid place-items-center">
          <span
            className="blast-ring-pulse absolute -inset-6 rounded-full border border-emerald-500/20"
            aria-hidden
          />
          <span
            className="absolute -inset-10 rounded-full bg-emerald-500/[0.12] blur-2xl"
            aria-hidden
          />
          <RelayMark size={88} className="relative" />
        </div>
        <p className="mt-4 text-center font-mono text-[8px] uppercase tracking-[0.24em] text-zinc-500">
          relay engine
        </p>
      </div>

      <SourceChip
        icon={MessageSquare}
        label="Slack"
        detail="#ops-urgent"
        color="#a78bfa"
        className="float-slow left-[0%] top-[17%]"
      />
      <SourceChip
        icon={GitBranch}
        label="GitHub"
        detail="PR #402"
        color="#e4e4e7"
        className="float-slower right-[0%] top-[17%]"
      />
      <SourceChip
        icon={ClipboardList}
        label="Jira"
        detail="REL-201"
        color="#60a5fa"
        className="float-slower bottom-[25%] left-[3%]"
      />
      <SourceChip
        icon={FileText}
        label="Notion"
        detail="KMS policy"
        color="#d4d4d8"
        className="float-slow bottom-[25%] right-[3%]"
      />

      <div className="absolute bottom-[1%] left-1/2 w-[228px] -translate-x-1/2 rounded-xl border border-red-500/20 bg-red-500/[0.045] p-3 backdrop-blur sm:w-[248px]">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-red-400 shadow-[0_0_10px_#ef4444]" />
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-red-300/90">
            contradiction detected
          </span>
          <span className="ml-auto font-mono text-[8px] text-zinc-500">97%</span>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-zinc-300">
          Jira mandates Supabase. Production runs on Firebase.
        </p>
      </div>
    </div>
  );
}

export function LandingView() {
  const setHelpOpen = useConsole((s) => s.setHelpOpen);
  const setIngestOpen = useConsole((s) => s.setIngestOpen);

  /**
   * One action, one intent: open the repository picker. The judge chooses any
   * public repository (or the starred hackathon repo); only then does Relay
   * start the live scan, so nothing is scanned without an explicit choice.
   */
  const openRepoPicker = useCallback(() => {
    setIngestOpen(true);
  }, [setIngestOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const element = event.target as HTMLElement | null;
      if (
        element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'BUTTON' ||
          element.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      openRepoPicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openRepoPicker]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#07080C] text-zinc-100 antialiased selection:bg-zinc-700/60">
      {/* ambient background */}
      <div className="relay-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -top-48 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-emerald-500/[0.09] blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-56 -right-24 size-[520px] rounded-full bg-indigo-500/[0.08] blur-[130px]" />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center px-5 py-6 sm:px-8">
        <RelayLogo size="lg" />
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-8 lg:pb-10">
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.2em] text-zinc-400">
            <Sparkles className="size-3 text-emerald-400" aria-hidden />
            v2 handover · T-5 days
          </p>

          <h1 className="mt-5 text-balance text-[42px] font-semibold leading-[1.02] tracking-[-0.05em] text-zinc-50 sm:text-[62px] lg:text-[64px]">
            Your team left.
            <br />
            <span className="bg-linear-to-r from-zinc-100 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
              Their context didn&apos;t.
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-7 text-zinc-400 sm:text-[15.5px]">
            Your team leaves Friday. Relay reads the Slack threads, Jira
            tickets, and GitHub commits they left behind—then surfaces every
            contradiction, gates every action by role, and seals every decision
            in a tamper-evident receipt you can verify yourself.
          </p>

          <div className="mt-7 max-w-lg">
            <div className="rounded-3xl bg-white/[0.028] p-4 ring-1 ring-white/[0.06] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] font-mono text-[9px] text-zinc-300">
                    RL
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-zinc-100">
                      relay-labs
                    </p>
                    <p className="truncate font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
                      <span className="sm:hidden">6 repos · 18 channels</span>
                      <span className="hidden sm:inline">
                        6 repos · 18 channels · 42 tickets
                      </span>
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-300/80">
                  <Check className="size-3" aria-hidden />
                  ready
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {SOURCES.map(({ label, icon: Icon, color }) => (
                  <span key={label} className="flex min-w-0 items-center gap-1.5">
                    <Icon
                      className="size-3.5 shrink-0"
                      style={{ color }}
                      aria-hidden
                    />
                    <span className="truncate text-[10.5px] text-zinc-400">
                      {label}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={openRepoPicker}
              className="group mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-5 py-4 text-left transition hover:bg-white active:scale-[0.995]"
            >
              <span className="inline-flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.01em] text-zinc-950">
                <ScanLine className="size-4" aria-hidden />
                Connect workspace &amp; scan
              </span>
              <ArrowRight
                className="size-4 text-zinc-950 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>

            <p className="mt-2.5 truncate px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
              any public repository · live github api · read-only
            </p>
          </div>

          <div className="mt-2">
            <JudgeWalkthroughTrigger variant="hero" />
          </div>

          <div className="mt-2 overflow-hidden rounded-xl border border-amber-500/15 bg-amber-400/[0.02]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 font-mono text-[8.5px] text-zinc-500">
              <Sparkles className="size-3 text-amber-300/80" aria-hidden />
              <span className="uppercase tracking-[0.14em] text-amber-200/80">
                90-second judge route
              </span>
              <span className="text-zinc-500">
                <span className="text-emerald-400/80">D1</span> self-scan →{' '}
                <span className="text-sky-400/80">D2</span> manager 403 →{' '}
                <span className="text-violet-400/80">D3</span> tamper attack →
                scorecard
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-amber-500/10 px-3 py-1.5 font-mono text-[8.5px]">
              <span className="inline-flex items-center gap-1.5 text-emerald-300/80">
                <ShieldCheck className="size-3" aria-hidden />
                72/72 gates passed
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-200/80">
                <BadgeCheck className="size-3" aria-hidden />
                3/3 deliverables live
              </span>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 uppercase tracking-[0.12em] text-zinc-500 transition hover:text-amber-100"
              >
                <HelpCircle className="size-3" aria-hidden />
                Judge guide
                <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[8px] text-zinc-400">
                  ?
                </kbd>
              </button>
            </div>
          </div>
        </div>

        <div className="animate-in fade-in zoom-in-95 duration-1000">
          <OrbitVisual />
        </div>
      </main>

      <footer className="relative z-10 border-t border-zinc-800/60 bg-zinc-950/70">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 py-5 sm:grid-cols-4 sm:px-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="px-1 py-1">
              <p className="font-mono text-[20px] font-medium tracking-tight text-zinc-100">
                {stat.value}
              </p>
              <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-zinc-800/60 px-5 py-3 sm:px-8">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
            Relay · built for the 2026 handover
          </p>
          <span className="inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
            read-only by design
          </span>
        </div>
      </footer>

      <GitHubIngestStudio />
      <Shortcuts />
    </div>
  );
}
