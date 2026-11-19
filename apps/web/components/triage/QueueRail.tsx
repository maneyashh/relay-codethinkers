'use client';

import { Check, SkipForward } from 'lucide-react';

import type { Doubt, Severity } from '@/stores/triage';

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
  hard_contradiction: 'Conflict',
  missing_info: 'Missing info',
};

/**
 * War-Room's 30% rail. Hairline rows, one status dot, one severity tag — the
 * same information density as a Linear inbox, nothing louder.
 */
export function QueueRail({
  doubts,
  selectedId,
  onSelect,
}: {
  doubts: Doubt[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const resolved = doubts.filter((d) => d.status === 'resolved').length;
  const open = doubts.filter((d) => d.status === 'open').length;
  const total = doubts.length || 1;

  return (
    <nav aria-label="Triage queue" className="flex h-full flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-zinc-500">
            Queue
          </span>
          <span className="font-mono text-[8.5px] tabular-nums text-zinc-500">
            {resolved}/{doubts.length} resolved
            {open > 0 && <span className="text-zinc-600"> · {open} open</span>}
          </span>
        </div>
        <div
          className="mt-2.5 h-px w-full overflow-hidden bg-white/[0.07]"
          role="img"
          aria-label={`${resolved} of ${doubts.length} contradictions resolved`}
        >
          <div
            className="h-full bg-emerald-400/70 transition-[width] duration-500 ease-out"
            style={{ width: `${(resolved / total) * 100}%` }}
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {doubts.map((d) => {
          const selected = d.id === selectedId;
          const accent = SEVERITY_COLOR[d.severity];

          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                aria-current={selected ? 'true' : undefined}
                className={[
                  'group relative flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2.5 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                  selected
                    ? 'bg-white/[0.055]'
                    : 'hover:bg-white/[0.028]',
                ].join(' ')}
              >
                {selected && (
                  <span
                    className="absolute bottom-2.5 left-0 top-2.5 w-[2px] rounded-full bg-zinc-100"
                    aria-hidden
                  />
                )}

                <span className="flex items-center gap-2">
                  <span
                    className={[
                      'grid size-3.5 shrink-0 place-items-center rounded-full',
                      d.status === 'resolved'
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : d.status === 'skipped'
                          ? 'bg-white/[0.06] text-zinc-500'
                          : 'bg-white/[0.05]',
                    ].join(' ')}
                    aria-hidden
                  >
                    {d.status === 'resolved' ? (
                      <Check className="size-2.5" />
                    ) : d.status === 'skipped' ? (
                      <SkipForward className="size-2" />
                    ) : (
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                  </span>
                  <span className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                    {d.area}
                  </span>
                  <span
                    className="ml-auto shrink-0 font-mono text-[7.5px] uppercase tracking-[0.12em]"
                    style={{ color: accent, opacity: selected ? 1 : 0.75 }}
                  >
                    {SEVERITY_LABEL[d.severity]}
                  </span>
                </span>

                <span
                  className={[
                    'line-clamp-2 text-[12px] leading-[1.4] tracking-[-0.005em] transition-colors',
                    selected
                      ? 'text-zinc-100'
                      : d.status === 'open'
                        ? 'text-zinc-400 group-hover:text-zinc-200'
                        : 'text-zinc-500 group-hover:text-zinc-300',
                  ].join(' ')}
                >
                  {d.title}
                </span>

                <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
                  {KIND_LABEL[d.kind]}
                  <span className="size-[2px] rounded-full bg-zinc-700" aria-hidden />
                  <span className="tabular-nums">
                    {Math.round(d.confidence * 100)}%
                  </span>
                  {d.status !== 'open' && (
                    <span className="ml-auto text-zinc-500">{d.status}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
