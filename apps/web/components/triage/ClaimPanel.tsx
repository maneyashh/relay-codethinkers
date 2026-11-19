'use client';

import {
  Briefcase,
  CalendarClock,
  CircleDot,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  ShieldAlert,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { Doubt, Role, Severity } from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
};

const KIND_LABEL: Record<Doubt['kind'], string> = {
  hard_contradiction: 'Contradiction',
  missing_info: 'Missing information',
};

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-zinc-500">{icon}</span>
      <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </span>
      <span className="truncate text-[11.5px] text-zinc-300">{value}</span>
    </span>
  );
}

/**
 * Part 1 of the reading flow: what is wrong, in one breath. The headline is the
 * contradiction itself — never a label like "The claim".
 */
export function ClaimPanel({ doubt, role }: { doubt: Doubt; role: Role }) {
  const accent = SEVERITY_COLOR[doubt.severity];
  const confidence = Math.round(doubt.confidence * 100);

  return (
    <section
      aria-label="The contradiction"
      data-guide="claim"
      className="flex flex-col"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.14em]"
          style={{ color: accent, backgroundColor: `${accent}18` }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          {SEVERITY_LABEL[doubt.severity]}
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-500">
          {KIND_LABEL[doubt.kind]}
        </span>
        <span className="size-1 rounded-full bg-zinc-700" aria-hidden />
        <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-500">
          {doubt.area}
        </span>
        {doubt.origin && doubt.origin !== 'seed' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/[0.09] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-sky-300 ring-1 ring-sky-400/20">
            <GitBranch className="size-2.5" aria-hidden />
            {doubt.origin}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
          <span className="text-zinc-600">confidence</span>
          <span className="tabular-nums text-zinc-300">{confidence}%</span>
        </span>
      </div>

      <h1 className="mt-4 text-balance text-[27px] font-semibold leading-[1.12] tracking-[-0.035em] text-zinc-50 sm:text-[34px]">
        {doubt.title}
      </h1>

      <p className="mt-4 max-w-2xl text-[14.5px] leading-7 text-zinc-400">
        {doubt.claim}
      </p>

      {role === 'manager' ? (
        <div className="mt-7 grid gap-2 sm:grid-cols-3">
          <ImpactCard
            icon={<Briefcase className="size-3" aria-hidden />}
            label="Budget"
            value={doubt.impact?.budget ?? 'Restricted'}
          />
          <ImpactCard
            icon={<CalendarClock className="size-3" aria-hidden />}
            label="Timeline"
            value={doubt.impact?.timeline ?? 'Restricted'}
          />
          <ImpactCard
            icon={<ShieldAlert className="size-3" aria-hidden />}
            label="Risk"
            value={doubt.impact?.risk ?? 'Restricted'}
          />
        </div>
      ) : doubt.implementation ? (
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4">
          <MetaItem
            icon={<UserRound className="size-3" aria-hidden />}
            label="owner"
            value={doubt.implementation.owner}
          />
          <MetaItem
            icon={<FolderGit2 className="size-3" aria-hidden />}
            label="repo"
            value={doubt.implementation.repo}
          />
          <MetaItem
            icon={<GitPullRequest className="size-3" aria-hidden />}
            label="pr"
            value={doubt.implementation.pr}
          />
          <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
            <CircleDot className="size-2.5" aria-hidden />
            {doubt.implementation.files.length} files in scope
          </span>
        </div>
      ) : (
        <p className="mt-7 border-t border-white/[0.06] pt-4 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
          implementation targets withheld from this lens
        </p>
      )}

      {doubt.synthesis &&
        (doubt.synthesis.injectedCount > 0 ||
          Math.abs(doubt.synthesis.delta) > 0.0005) && (
          <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl bg-amber-400/[0.05] px-3.5 py-2.5 ring-1 ring-amber-400/15">
            <Sparkles className="size-3 text-amber-300" aria-hidden />
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200/90">
              live signal
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {doubt.synthesis.injectedCount} injected
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
              <span className="text-zinc-500">
                {Math.round(doubt.synthesis.baseConfidence * 100)}%
              </span>
              <span className="text-zinc-600">→</span>
              <span className="text-amber-200">
                {Math.round(doubt.synthesis.confidence * 100)}%
              </span>
            </span>
          </div>
        )}
    </section>
  );
}

function ImpactCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="font-mono text-[8px] uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-zinc-300">{value}</p>
    </div>
  );
}
