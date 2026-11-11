'use client';

import { ExternalLink, Hash, Lock, Network, Terminal } from 'lucide-react';

import type { Evidence, Role } from '@/stores/triage';

const SOURCE_LABEL: Record<Evidence['source'], string> = {
  slack: 'Slack',
  github: 'GitHub',
  notion: 'Notion',
  jira: 'Jira',
  code: 'Code',
  email: 'Email',
};

const DATE_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
});

export function EvidenceQuote({
  e,
  tint,
  compact = false,
  role,
  selected = false,
  onSelect,
}: {
  e: Evidence;
  tint?: string;
  compact?: boolean;
  role?: Role;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const accent = tint ?? '#a1a1aa';
  const date = new Date(e.timestamp);
  const validDate = !Number.isNaN(date.getTime());
  const stamp = validDate
    ? `${DATE_FMT.format(date)} · ${TIME_FMT.format(date)}`
    : e.timestamp;

  return (
    <figure
      className={[
        'group rounded-xl border bg-zinc-900/30 p-4 transition-all duration-200 sm:p-5',
        selected
          ? 'border-zinc-600 bg-zinc-900/70 ring-1 ring-zinc-500/20'
          : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/50',
      ].join(' ')}
    >
      <figcaption className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-zinc-400">
        <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300">
          {SOURCE_LABEL[e.source]}
        </span>
        <span className="truncate font-medium text-zinc-200">{e.author}</span>
        <span className="shrink-0 text-zinc-500">{stamp}</span>

        {role === 'junior' && e.filePath && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
            <Terminal className="size-3 shrink-0 text-zinc-500" aria-hidden />
            <span className="truncate">{e.filePath}</span>
          </span>
        )}
        {role === 'junior' && e.commit && (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
            <Hash className="size-3 text-zinc-500" aria-hidden />
            {e.commit}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {e.redacted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              <Lock className="size-3" aria-hidden />
              redacted
            </span>
          )}
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(selected ? null : e.id)}
              aria-pressed={selected}
              className={[
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors',
                selected
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
              ].join(' ')}
            >
              <Network className="size-3" aria-hidden />
              {selected ? 'Tracing' : 'Trace'}
            </button>
          )}
          {e.url && (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open original ${SOURCE_LABEL[e.source]} source`}
              className="text-zinc-500 transition hover:text-zinc-200"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </span>
      </figcaption>

      <blockquote
        className={`mt-3 text-[14px] leading-7 text-zinc-300 ${compact ? 'line-clamp-3' : ''}`}
      >
        <span className="border-l-2 pl-3" style={{ borderColor: accent }}>
          {e.quote}
        </span>
        {e.redacted && (
          <span
            className="ml-1 inline-flex select-none items-center rounded-sm bg-zinc-800 px-1 align-baseline text-transparent"
            title="Sensitive value hidden"
          >
            {e.redacted}
          </span>
        )}
      </blockquote>
    </figure>
  );
}
