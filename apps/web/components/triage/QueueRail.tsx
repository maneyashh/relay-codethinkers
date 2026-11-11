'use client';

import { Check, CircleDot, SkipForward } from 'lucide-react';

import type { Doubt, Severity } from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const KIND_LABEL: Record<Doubt['kind'], string> = {
  hard_contradiction: 'Conflict',
  missing_info: 'Missing info',
};

export function QueueRail({
  doubts,
  selectedId,
  onSelect,
}: {
  doubts: Doubt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const open = doubts.filter((d) => d.status === 'open').length;

  return (
    <nav aria-label="Triage queue" className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          Queue
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          {open} open / {doubts.length}
        </span>
      </div>

      <ul className="flex flex-col gap-1 p-3">
        {doubts.map((d) => {
          const selected = d.id === selectedId;
          const resolved = d.status === 'resolved';
          const skipped = d.status === 'skipped';

          return (
            <li key={d.id}>
              <button
                onClick={() => onSelect(d.id)}
                aria-current={selected ? 'true' : undefined}
                className={[
                  'group relative flex w-full flex-col gap-1.5 rounded-lg border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40 active:scale-[0.99]',
                  selected
                    ? 'border-zinc-800 bg-zinc-900'
                    : 'border-transparent hover:border-zinc-800/60 hover:bg-zinc-900/50',
                  d.status !== 'open' ? 'opacity-60' : '',
                ].join(' ')}
              >
                <span
                  className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLOR[d.severity] }}
                  aria-hidden
                />

                <span className="flex items-center gap-2">
                  <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                    {d.area}
                  </span>
                  <span
                    className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wider"
                    style={{ color: SEVERITY_COLOR[d.severity] }}
                  >
                    {d.severity}
                  </span>
                </span>

                <span className="line-clamp-2 text-[12.5px] leading-snug text-zinc-300 transition-colors group-hover:text-zinc-100">
                  {d.title}
                </span>

                <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  {resolved ? (
                    <Check className="size-3 text-emerald-500" aria-hidden />
                  ) : skipped ? (
                    <SkipForward className="size-3" aria-hidden />
                  ) : (
                    <CircleDot className="size-3 text-zinc-600" aria-hidden />
                  )}
                  {resolved ? 'Resolved' : skipped ? 'Skipped' : KIND_LABEL[d.kind]}
                  <span className="ml-auto font-mono text-zinc-600">
                    {Math.round(d.confidence * 100)}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
