'use client';

import {
  ClipboardList,
  Code2,
  FileText,
  GitBranch,
  Hash,
  Mail,
  MessageSquare,
  Network,
  Plus,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { formatDelta } from '@/lib/synthesis';
import type {
  Doubt,
  Evidence,
  EvidencePolarity,
  Role,
  Severity,
} from '@/stores/triage';
import { evidenceForRole } from '@/stores/triage';
import { useConsole } from '@/stores/console';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const POLARITY_META: Record<
  EvidencePolarity,
  { label: string; color: string }
> = {
  supports: { label: 'Supports', color: '#10b981' },
  contradicts: { label: 'Contradicts', color: '#ef4444' },
  context: { label: 'Context', color: '#a1a1aa' },
};

const SOURCE_META: Record<
  Evidence['source'],
  { label: string; icon: LucideIcon; color: string }
> = {
  slack: { label: 'Slack', icon: MessageSquare, color: '#a78bfa' },
  github: { label: 'GitHub', icon: GitBranch, color: '#e4e4e7' },
  notion: { label: 'Notion', icon: FileText, color: '#d4d4d8' },
  jira: { label: 'Jira', icon: ClipboardList, color: '#60a5fa' },
  code: { label: 'Code', icon: Code2, color: '#34d399' },
  email: { label: 'Email', icon: Mail, color: '#fbbf24' },
};

const DATE_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function edgePath(x: number, y: number) {
  const mx = (50 + x) / 2;
  const my = (50 + y) / 2;
  const dx = x - 50;
  const dy = y - 50;
  const cx = mx - dy * 0.18;
  const cy = my + dx * 0.18;
  return `M 50 50 Q ${cx} ${cy} ${x} ${y}`;
}

export function BlastRadius({
  doubt,
  role,
  selectedId,
  onSelect,
}: {
  doubt: Doubt;
  role: Role;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const visible = evidenceForRole(doubt.evidence, role);
  const hiddenCount =
    doubt.lockedEvidence ?? doubt.evidence.length - visible.length;
  const selected = visible.find((e) => e.id === selectedId) ?? null;
  const accent = SEVERITY_COLOR[doubt.severity];
  const setChaosOpen = useConsole((s) => s.setChaosOpen);
  const injectedCount = visible.filter((e) => e.injected).length;

  // The decisive source is the strongest contradiction behind the doubt.
  const decisive =
    [...visible].sort((a, b) => {
      const aContra = a.polarity === 'contradicts' ? 1 : 0;
      const bContra = b.polarity === 'contradicts' ? 1 : 0;
      if (aContra !== bContra) return bContra - aContra;
      return (b.relevance ?? 0) - (a.relevance ?? 0);
    })[0] ?? null;

  const nodes = visible.map((e, i) => {
    const radiusX = visible.length === 2 ? 34 : 36;
    const angle =
      visible.length === 2
        ? i === 0
          ? Math.PI
          : 0
        : (Math.PI * 2 * i) / Math.max(visible.length, 1) - Math.PI / 2;

    return {
      e,
      x: 50 + Math.cos(angle) * radiusX,
      y: 50 + Math.sin(angle) * 33,
    };
  });

  return (
    <section
      aria-label="Blast radius evidence graph"
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-zinc-500" aria-hidden />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Blast radius
            </p>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
            How Relay connected {visible.length}{' '}
            {visible.length === 1 ? 'source' : 'sources'} to this claim.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {injectedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
              <Zap className="size-2.5" aria-hidden />
              {injectedCount} live
            </span>
          )}
          <span className="rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {role === 'manager' ? 'Executive' : 'Technical'}
          </span>
          <button
            type="button"
            onClick={() => setChaosOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-500 transition hover:border-amber-500/40 hover:text-amber-300"
            title="Inject a live signal into this doubt"
          >
            <Plus className="size-2.5" aria-hidden />
            inject
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
        {(Object.keys(POLARITY_META) as EvidencePolarity[]).map((key) => {
          const meta = POLARITY_META[key];
          return (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              {meta.label}
            </span>
          );
        })}
        <span className="ml-auto font-mono text-zinc-600">
          {hiddenCount > 0
            ? `${hiddenCount} ${hiddenCount === 1 ? 'source' : 'sources'} withheld by API`
            : 'all sources visible'}
        </span>
      </div>

      <div className="relative mt-4 h-[360px] overflow-hidden rounded-lg border border-zinc-800/60 bg-[radial-gradient(circle_at_center,rgba(63,63,70,0.18),transparent_68%)] sm:h-[400px]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="18"
            fill="none"
            stroke="#27272a"
            strokeWidth="0.25"
            strokeDasharray="1 2"
          />
          <circle
            cx="50"
            cy="50"
            r="30"
            fill="none"
            stroke="#27272a"
            strokeWidth="0.25"
            strokeDasharray="1 3"
          />

          {nodes.map(({ e, x, y }) => {
            const polarity = e.polarity ?? 'context';
            const meta = POLARITY_META[polarity];
            const isSelected = selectedId === e.id;

            return (
              <path
                key={e.id}
                d={edgePath(x, y)}
                fill="none"
                stroke={meta.color}
                strokeWidth={isSelected ? 1.4 : 0.7}
                strokeOpacity={
                  isSelected ? 0.95 : 0.25 + (e.relevance ?? 0.5) * 0.35
                }
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

        {/* Central claim node: click to trace the decisive contradiction. */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={() =>
              decisive &&
              onSelect(selectedId === decisive.id ? null : decisive.id)
            }
            disabled={!decisive}
            aria-pressed={decisive ? selectedId === decisive.id : false}
            aria-label="Trace the decisive source behind this claim"
            title={
              decisive
                ? `Trace decisive source · ${decisive.author}`
                : 'No sources visible in this lens'
            }
            className="group relative flex size-24 flex-col items-center justify-center rounded-full border bg-zinc-950 text-center shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-colors duration-300 hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40 disabled:cursor-default sm:size-32"
            style={{ borderColor: `${accent}66` }}
          >
            <span
              className="blast-ring-pulse pointer-events-none absolute -inset-2 rounded-full border"
              style={{ borderColor: `${accent}33` }}
              aria-hidden
            />
            <Sparkles
              className="size-4 transition-transform duration-300 group-hover:scale-110"
              style={{ color: accent }}
              aria-hidden
            />
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              Claim
            </span>
            <span
              className="mt-0.5 text-[11px] font-medium capitalize"
              style={{ color: accent }}
            >
              {doubt.severity}
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              {Math.round(doubt.confidence * 100)}% confidence
            </span>
            {doubt.synthesis &&
              Math.abs(doubt.synthesis.delta) > 0.0005 && (
                <span
                  className={[
                    'mt-0.5 rounded border px-1 py-0.5 font-mono text-[7.5px]',
                    doubt.synthesis.delta >= 0
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300',
                  ].join(' ')}
                >
                  {formatDelta(doubt.synthesis.delta)} pts
                </span>
              )}
            <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-600 transition-colors group-hover:text-zinc-400">
              trace
            </span>
          </button>
        </div>

        {/* Evidence nodes */}
        {nodes.map(({ e, x, y }) => {
          const meta = SOURCE_META[e.source];
          const Icon = meta.icon;
          const polarity = POLARITY_META[e.polarity ?? 'context'];
          const isSelected = selectedId === e.id;
          const relevance = Math.round((e.relevance ?? 0.5) * 100);

          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : e.id)}
              aria-pressed={isSelected}
              title={e.quote}
              className={[
                'absolute z-10 flex w-[84px] -translate-x-1/2 -translate-y-1/2 animate-in flex-col gap-1 rounded-lg border p-2 text-left fade-in transition-all duration-500 sm:w-[116px]',
                e.injected ? 'signal-in' : '',
                isSelected
                  ? e.injected
                    ? 'border-amber-500/50 bg-amber-500/[0.06] shadow-lg ring-1 ring-amber-400/20'
                    : 'border-zinc-500 bg-zinc-900 shadow-lg ring-1 ring-zinc-400/20'
                  : e.injected
                    ? 'border-amber-500/30 bg-amber-500/[0.035] hover:border-amber-500/50 hover:bg-amber-500/[0.07]'
                    : 'border-zinc-800/80 bg-zinc-950/90 hover:border-zinc-700 hover:bg-zinc-900/90',
              ].join(' ')}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="flex w-full items-center gap-1.5">
                <Icon
                  className="size-3 shrink-0"
                  style={{ color: meta.color }}
                  aria-hidden
                />
                <span className="truncate font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  {meta.label}
                </span>
                {e.injected && (
                  <Zap
                    className="size-2.5 shrink-0 text-amber-300"
                    aria-label="Live injected signal"
                  />
                )}
                <span
                  className="ml-auto size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: polarity.color }}
                  aria-hidden
                />
              </span>
              <span className="line-clamp-2 text-[10.5px] leading-snug text-zinc-300">
                {e.author}
              </span>
              <span className="truncate font-mono text-[8.5px] text-zinc-600">
                {e.channel ?? meta.label}
              </span>
              <span className="mt-0.5 flex w-full items-center gap-1">
                <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${relevance}%`,
                      backgroundColor: meta.color,
                    }}
                  />
                </span>
                <span className="font-mono text-[8px] text-zinc-600">
                  {relevance}
                </span>
              </span>
            </button>
          );
        })}

        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              No sources visible in this lens
            </p>
          </div>
        )}
      </div>

      {selected ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300">
              {SOURCE_META[selected.source].label}
            </span>
            {selected.injected && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                <Zap className="size-2.5" aria-hidden />
                live signal
              </span>
            )}
            <span className="text-[11px] font-medium text-zinc-200">
              {selected.author}
            </span>
            <span className="text-[10px] text-zinc-500">
              {DATE_FMT.format(new Date(selected.timestamp))}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1.5 text-[10px]"
              style={{
                color: POLARITY_META[selected.polarity ?? 'context'].color,
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor:
                    POLARITY_META[selected.polarity ?? 'context'].color,
                }}
                aria-hidden
              />
              {POLARITY_META[selected.polarity ?? 'context'].label}
            </span>
          </div>

          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-300">
            {selected.quote}
          </p>

          {role === 'junior' && (selected.filePath || selected.commit) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.filePath && (
                <code className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[9.5px] text-zinc-400">
                  <Terminal className="size-3 text-zinc-500" aria-hidden />
                  {selected.filePath}
                </code>
              )}
              {selected.commit && (
                <code className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[9.5px] text-zinc-400">
                  <Hash className="size-3 text-zinc-500" aria-hidden />
                  {selected.commit}
                </code>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.round((selected.relevance ?? 0.5) * 100)}%`,
                  backgroundColor:
                    POLARITY_META[selected.polarity ?? 'context'].color,
                }}
              />
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              {Math.round((selected.relevance ?? 0.5) * 100)}% relevance
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-800/80 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          Select a node to trace the evidence
        </p>
      )}
    </section>
  );
}
