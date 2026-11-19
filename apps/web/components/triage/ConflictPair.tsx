'use client';

import { Lock, ShieldCheck } from 'lucide-react';

import { EvidenceQuote } from '@/components/triage/EvidenceQuote';
import type { Doubt, Evidence, Role, Severity } from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const SOURCE_LABEL: Record<Evidence['source'], string> = {
  slack: 'Slack',
  github: 'GitHub',
  notion: 'Notion',
  jira: 'Jira',
  code: 'Code',
  email: 'Email',
};

const POLARITY_LABEL: Record<
  NonNullable<Evidence['polarity']>,
  { label: string; color: string }
> = {
  supports: { label: 'supports', color: '#60a5fa' },
  contradicts: { label: 'contradicts', color: '#f87171' },
  context: { label: 'context', color: '#71717a' },
};

const FRAMING: Record<
  Doubt['kind'],
  { left: string; right: string; leftDetail: string; rightDetail: string }
> = {
  hard_contradiction: {
    left: 'The written rule',
    right: 'What actually shipped',
    leftDetail: 'documented intent',
    rightDetail: 'production evidence',
  },
  missing_info: {
    left: 'What the record claims',
    right: 'What the record cannot show',
    leftDetail: 'asserted in writing',
    rightDetail: 'absent in practice',
  },
};

function strongest(evidence: Evidence[], polarity: Evidence['polarity']) {
  return (
    [...evidence]
      .filter((item) => (item.polarity ?? 'context') === polarity)
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))[0] ?? null
  );
}

function Column({
  label,
  detail,
  color,
  evidence,
  accent,
  role,
  hidden,
}: {
  label: string;
  detail: string;
  color: string;
  evidence: Evidence | null;
  accent: string;
  role: Role;
  hidden: number;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2" title={detail}>
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-300">
          {label}
        </span>
      </div>

      {evidence ? (
        <div id={`evidence-${evidence.id}`} className="scroll-mt-28 flex-1">
          <EvidenceQuote e={evidence} tint={accent} role={role} />
        </div>
      ) : (
        <div className="flex min-h-[168px] flex-1 flex-col justify-center rounded-2xl bg-white/[0.012] px-4 py-6 text-center ring-1 ring-dashed ring-white/[0.09]">
          <Lock className="mx-auto size-3.5 text-zinc-500" aria-hidden />
          <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
            {hidden > 0 ? `${hidden} source withheld` : 'no source returned'}
          </p>
          <p className="mx-auto mt-1.5 max-w-[22ch] text-[10.5px] leading-snug text-zinc-600">
            {hidden > 0
              ? 'SQL removed this row before the response left the server.'
              : 'This lens received nothing for this side of the claim.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Part 2: the two sources that disagree, side by side, plus the rest of the
 * record. Every visible row is always in the DOM so Ask Relay citations and
 * handover references can scroll to a real anchor.
 */
export function ConflictPair({
  doubt,
  role,
  evidence,
  hiddenCount,
}: {
  doubt: Doubt;
  role: Role;
  evidence: Evidence[];
  hiddenCount: number;
}) {
  const framing = FRAMING[doubt.kind];
  const accent = SEVERITY_COLOR[doubt.severity];

  const supported = strongest(evidence, 'supports');
  const contradicted = strongest(evidence, 'contradicts');
  const extras = evidence.filter(
    (item) => item.id !== supported?.id && item.id !== contradicted?.id,
  );

  return (
    <section
      aria-label="Conflicting evidence"
      data-guide="conflict"
      className="flex flex-col"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-zinc-200">
          Where the sources disagree
        </h2>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
          {evidence.length} visible
          {hiddenCount > 0 && ` · ${hiddenCount} withheld`}
        </span>
        {hiddenCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-400/[0.07] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-amber-200/90 ring-1 ring-amber-400/15">
            <ShieldCheck className="size-2.5" aria-hidden />
            {role === 'manager' ? 'manager lens · SQL-scoped' : 'SQL-scoped'}
          </span>
        )}
      </div>

      <div className="relative mt-5 grid items-stretch gap-x-4 gap-y-4 md:grid-cols-2">
        <Column
          label={framing.left}
          detail={framing.leftDetail}
          color="#60a5fa"
          evidence={supported}
          accent={accent}
          role={role}
          hidden={hiddenCount}
        />
        <Column
          label={framing.right}
          detail={framing.rightDetail}
          color={accent}
          evidence={contradicted}
          accent={accent}
          role={role}
          hidden={hiddenCount}
        />
        <span
          className="pointer-events-none absolute left-1/2 top-[78px] hidden size-7 -translate-x-1/2 place-items-center rounded-full bg-[#0b0c10] font-mono text-[7.5px] uppercase tracking-[0.08em] text-zinc-500 ring-1 ring-white/[0.1] md:grid"
          aria-hidden
        >
          vs
        </span>
      </div>

      {hiddenCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl bg-amber-400/[0.04] px-3.5 py-2.5 ring-1 ring-dashed ring-amber-400/20">
          <Lock className="size-3 shrink-0 text-amber-300/80" aria-hidden />
          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber-200/90">
            {hiddenCount} {hiddenCount === 1 ? 'source' : 'sources'} withheld
            from this lens
          </span>
          <span className="ml-auto hidden font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600 sm:inline">
            filePath · commit · diff never leave the server
          </span>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-600">
              the rest of the record
            </span>
            <span className="font-mono text-[8px] tabular-nums text-zinc-700">
              {extras.length} {extras.length === 1 ? 'source' : 'sources'}
            </span>
          </div>

          <ul className="mt-1 flex flex-col divide-y divide-white/[0.05]">
            {extras.map((item) => {
              const polarity = item.polarity ?? 'context';
              const meta = POLARITY_LABEL[polarity];
              return (
                <li
                  key={item.id}
                  id={`evidence-${item.id}`}
                  className="scroll-mt-28 py-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden
                      />
                      {SOURCE_LABEL[item.source]}
                    </span>
                    <span
                      className="font-mono text-[8px] uppercase tracking-[0.1em]"
                      style={{ color: meta.color, opacity: 0.8 }}
                    >
                      {meta.label}
                    </span>
                    <span className="truncate text-[10.5px] text-zinc-500">
                      {item.author}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[8.5px] tabular-nums text-zinc-600">
                      {Math.round((item.relevance ?? 0) * 100)}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                    {item.quote}
                  </p>
                  {role === 'junior' && (item.filePath || item.commit) && (
                    <p className="mt-1 truncate font-mono text-[8.5px] text-zinc-600">
                      {[item.filePath, item.commit].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
