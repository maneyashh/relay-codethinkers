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
      : (t: number) => 2 + ((t - min) / span) * 96;

  return (
    <div className="rounded-[22px] bg-white/[0.018] px-4 py-3.5 ring-1 ring-white/[0.05]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
          Timeline
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
          {dated.length} {dated.length === 1 ? 'point' : 'points'} · {days}d span
        </span>
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500">
          {DATE_FMT.format(new Date(min))} → {LONG_DATE_FMT.format(new Date(max))}
        </span>
      </div>

      <div className="relative mt-3 h-6" role="img" aria-label="Timeline of evidence">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" />
        {dated.map(({ e, t }) => (
          <span
            key={e.id}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-300 ring-2 ring-[#0a0b10] transition hover:scale-125 hover:bg-white"
            style={{ left: `${pos(t)}%` }}
            title={`${e.source} · ${e.author} · ${LONG_DATE_FMT.format(new Date(t))}`}
          />
        ))}
      </div>
    </div>
  );
}
