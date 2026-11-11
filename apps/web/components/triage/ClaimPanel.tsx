'use client';

import {
  Briefcase,
  CalendarClock,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  ShieldAlert,
  Terminal,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { Doubt, Role, Severity } from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const KIND_LABEL: Record<Doubt['kind'], string> = {
  hard_contradiction: 'Conflict',
  missing_info: 'Missing info',
};

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
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-zinc-300">{value}</p>
    </div>
  );
}

export function ClaimPanel({ doubt, role }: { doubt: Doubt; role: Role }) {
  const accent = SEVERITY_COLOR[doubt.severity];

  return (
    <section
      aria-label="Claim under review"
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-5 sm:p-6"
      style={{ borderTopColor: accent, borderTopWidth: 2 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        >
          {doubt.severity}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {KIND_LABEL[doubt.kind]}
        </span>
        <span className="text-zinc-700" aria-hidden>
          ·
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {doubt.area}
        </span>
        <span className="ml-auto rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          {role === 'manager' ? 'Executive lens' : 'Developer lens'}
        </span>
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
        The claim
      </p>
      <h1 className="mt-2.5 text-balance text-[21px] font-medium leading-[1.4] tracking-[-0.02em] text-zinc-100 sm:text-[25px]">
        {doubt.claim}
      </h1>

      {role === 'manager' ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
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
        <div className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3 text-zinc-500" aria-hidden />
              {doubt.implementation.owner}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2 className="size-3 text-zinc-500" aria-hidden />
              <code className="font-mono text-[10px] text-zinc-400">
                {doubt.implementation.repo}
              </code>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3 text-zinc-500" aria-hidden />
              <code className="font-mono text-[10px] text-zinc-400">
                {doubt.implementation.branch}
              </code>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitPullRequest className="size-3 text-zinc-500" aria-hidden />
              <code className="font-mono text-[10px] text-zinc-400">
                {doubt.implementation.pr}
              </code>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {doubt.implementation.files.map((file) => (
              <code
                key={file}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-300"
              >
                <Terminal className="size-3 text-zinc-500" aria-hidden />
                {file}
              </code>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          implementation targets withheld by API
        </p>
      )}
    </section>
  );
}
