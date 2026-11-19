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
  const relevance = Math.round((e.relevance ?? 0) * 100);

  return (
    <figure
      className={[
        'group relative flex h-full flex-col rounded-2xl p-4 transition duration-200 sm:p-5',
        selected
          ? 'bg-white/[0.06] ring-1 ring-white/[0.16]'
          : 'bg-white/[0.022] ring-1 ring-white/[0.06] hover:bg-white/[0.035] hover:ring-white/[0.1]',
      ].join(' ')}
    >
      <figcaption className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-300">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          {SOURCE_LABEL[e.source]}
        </span>
        <span className="truncate text-[11px] font-medium text-zinc-300">
          {e.author}
        </span>
        <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-600">
          {stamp}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {e.redacted && (
            <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-500">
              <Lock className="size-2.5" aria-hidden />
              masked
            </span>
          )}
          {e.url && (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open original ${SOURCE_LABEL[e.source]} source`}
              className="text-zinc-600 transition hover:text-zinc-200"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </span>
      </figcaption>

      <blockquote
        className={[
          'mt-3 flex-1 text-[13px] leading-[1.65] text-zinc-300',
          compact ? 'line-clamp-4' : '',
        ].join(' ')}
      >
        <span className="border-l-2 pl-3" style={{ borderColor: accent }}>
          {e.quote}
        </span>
        {e.redacted && (
          <span
            className="ml-1 inline-flex select-none items-center rounded-[3px] bg-zinc-800 px-1 align-baseline text-transparent"
            title="Sensitive value hidden from this lens"
          >
            {e.redacted}
          </span>
        )}
      </blockquote>

      {e.channel && (
        <p className="mt-2.5 truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-zinc-600">
          {e.channel}
        </p>
      )}

      {role === 'junior' && (e.filePath || e.commit) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {e.filePath && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[8.5px] text-zinc-500 ring-1 ring-white/[0.05]">
              <Terminal className="size-2.5 shrink-0" aria-hidden />
              <span className="truncate">{e.filePath}</span>
            </span>
          )}
          {e.commit && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[8.5px] text-zinc-500 ring-1 ring-white/[0.05]">
              <Hash className="size-2.5" aria-hidden />
              {e.commit}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-2.5">
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
          relevance
        </span>
        <span className="font-mono text-[9px] tabular-nums text-zinc-400">
          {relevance}%
        </span>
        <span className="ml-auto h-0.5 w-14 overflow-hidden rounded-full bg-white/[0.07]">
          <span
            className="block h-full rounded-full"
            style={{ width: `${relevance}%`, backgroundColor: accent }}
          />
        </span>
        {onSelect && (
          <button
            type="button"
            onClick={() => onSelect(selected ? null : e.id)}
            aria-pressed={selected}
            className={[
              'ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] transition',
              selected
                ? 'bg-white/[0.1] text-zinc-200'
                : 'text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300',
            ].join(' ')}
          >
            <Network className="size-2.5" aria-hidden />
            {selected ? 'tracing' : 'trace'}
          </button>
        )}
      </div>
    </figure>
  );
}
