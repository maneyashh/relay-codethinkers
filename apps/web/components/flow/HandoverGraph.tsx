'use client';

import { Check, ShieldCheck } from 'lucide-react';

import type { Doubt, Severity } from '@/stores/triage';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

function edgePath(x: number, y: number) {
  const mx = (50 + x) / 2;
  const my = (50 + y) / 2;
  const dx = x - 50;
  const dy = y - 50;
  const cx = mx - dy * 0.14;
  const cy = my + dx * 0.14;
  return `M 50 50 Q ${cx} ${cy} ${x} ${y}`;
}

export function HandoverGraph({
  doubts,
  selectedId,
  onSelect,
}: {
  doubts: Doubt[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const nodes = doubts.map((d, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(doubts.length, 1) - Math.PI / 2;
    return {
      d,
      x: 50 + Math.cos(angle) * 35,
      y: 50 + Math.sin(angle) * 34,
    };
  });

  const selected = doubts.find((d) => d.id === selectedId) ?? null;
  const selectedResolution = selected?.resolutions.find(
    (r) => r.id === selected.resolvedWith,
  );

  return (
    <section
      aria-label="Handover verification graph"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-emerald-400/80" aria-hidden />
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            verification graph
          </p>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
          {doubts.length} claims
        </span>
      </div>

      <div className="relative mt-3 h-[266px] overflow-hidden rounded-xl border border-zinc-800/60 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.07),transparent_68%)]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="20"
            fill="none"
            stroke="#27272a"
            strokeWidth="0.25"
            strokeDasharray="1 2"
          />
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="none"
            stroke="#27272a"
            strokeWidth="0.25"
            strokeDasharray="1 3"
          />

          {nodes.map(({ d, x, y }) => {
            const color = SEVERITY_COLOR[d.severity];
            const isSelected = selectedId === d.id;
            return (
              <path
                key={d.id}
                d={edgePath(x, y)}
                fill="none"
                stroke={color}
                strokeWidth={isSelected ? 1.3 : 0.6}
                strokeOpacity={isSelected ? 0.9 : 0.28}
                strokeDasharray={isSelected ? '3 2' : undefined}
                vectorEffect="non-scaling-stroke"
                className={isSelected ? 'blast-edge-active' : undefined}
                style={{
                  transition:
                    'stroke-opacity 300ms ease, stroke-width 300ms ease',
                }}
              />
            );
          })}
        </svg>

        {/* central artifact node */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Clear selection"
            className="group relative grid size-[78px] place-items-center rounded-full border border-emerald-500/30 bg-zinc-950 text-center shadow-[0_0_50px_rgba(16,185,129,0.16)] transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40"
          >
            <span
              className="blast-ring-pulse pointer-events-none absolute -inset-2 rounded-full border border-emerald-500/20"
              aria-hidden
            />
            <span className="font-mono text-[13px] font-bold tracking-tight text-zinc-100">
              SSOT
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.14em] text-emerald-400">
              <Check className="size-2.5" aria-hidden />
              verified
            </span>
          </button>
        </div>

        {nodes.map(({ d, x, y }) => {
          const accent = SEVERITY_COLOR[d.severity];
          const isSelected = selectedId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : d.id)}
              aria-pressed={isSelected}
              title={d.title}
              className={[
                'absolute z-10 flex w-[80px] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-lg border p-1.5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40',
                isSelected
                  ? 'border-zinc-500 bg-zinc-900 shadow-lg ring-1 ring-zinc-400/20'
                  : 'border-zinc-800/80 bg-zinc-950/90 hover:border-zinc-600 hover:bg-zinc-900/90',
              ].join(' ')}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="flex w-full items-center gap-1">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
                <span className="truncate font-mono text-[7.5px] uppercase tracking-wider text-zinc-500">
                  {d.area}
                </span>
                <Check
                  className="ml-auto size-2.5 shrink-0 text-emerald-400"
                  aria-hidden
                />
              </span>
              <span className="line-clamp-2 text-[9px] leading-snug text-zinc-300">
                {d.title}
              </span>
            </button>
          );
        })}
      </div>

      {selected && selectedResolution ? (
        <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
          <div className="flex items-center gap-2">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: SEVERITY_COLOR[selected.severity] }}
              aria-hidden
            />
            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
              {selected.area} · {selected.severity}
            </span>
            <span className="ml-auto font-mono text-[8px] text-zinc-600">
              {Math.round(selected.confidence * 100)}% confidence
            </span>
          </div>
          <p className="mt-1.5 text-[12px] font-medium text-zinc-200">
            {selectedResolution.label}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {selectedResolution.description}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-800/80 px-3 py-2 text-center font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
          click a claim to inspect its decision
        </p>
      )}
    </section>
  );
}
