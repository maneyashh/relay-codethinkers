'use client';

import type { Evidence } from '@/stores/triage';

const DATE_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
});

const LONG_DATE_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function TimelineAxis({ evidence }: { evidence: Evidence[] }) {
  const dated = evidence
    .map((e) => ({ e, t: new Date(e.timestamp).getTime() }))
    .filter((x) => Number.isFinite(x.t));

  if (dated.length === 0) return null;

  const min = Math.min(...dated.map((x) => x.t));
  const max = Math.max(...dated.map((x) => x.t));
  const span = Math.max(max - min, 1);
  const days = Math.max(1, Math.round((max - min) / 86_400_000));

  const pos =
    dated.length === 1
      ? () => 50
      : (t: number) => 4 + ((t - min) / span) * 92;

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Timeline
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          {dated.length} {dated.length === 1 ? 'point' : 'points'} · {days}d span
        </span>
      </div>

      <div className="relative h-[64px]" role="img" aria-label="Timeline of evidence">
        <div className="absolute left-0 right-0 top-[20px] h-px bg-zinc-800" />

        {dated.map(({ e, t }) => (
          <div
            key={e.id}
            className="absolute top-0 -translate-x-1/2 text-center"
            style={{ left: `${pos(t)}%` }}
            title={`${e.source} · ${e.author} · ${LONG_DATE_FMT.format(new Date(t))}`}
          >
            <div className="mx-auto mt-[14px] size-2.5 rounded-full border-2 border-zinc-950 bg-zinc-300 shadow-[0_0_0_1px_rgba(63,63,70,0.8)]" />
            <div className="mt-2 whitespace-nowrap font-mono text-[9.5px] text-zinc-500">
              {DATE_FMT.format(new Date(t))}
            </div>
            <div className="mx-auto max-w-[72px] truncate font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              {e.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
