'use client';

import { ArrowUpRight, Lock, ShieldCheck } from 'lucide-react';

import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';
import type { Role } from '@/stores/triage';

/**
 * The visible receipt of the server-side role boundary. Used both as a Part 4
 * tab and as the closing panel of the War-Room column, so it must read well at
 * two very different widths.
 */
export function BoundaryPanel({
  role,
  visible,
  hidden,
  compact = false,
}: {
  role: Role;
  visible: number;
  hidden: number;
  compact?: boolean;
}) {
  const meta = useTriage((s) => s.meta);
  const openSecurityTab = useConsole((s) => s.openSecurityTab);

  const ledger = meta?.ledger.entries ?? 0;
  const verified = meta?.ledger.verified ?? false;
  const view = meta?.projection.view ?? 'role_evidence';

  const stats = [
    { label: 'role', value: role === 'manager' ? 'manager' : 'developer' },
    { label: 'visible sources', value: String(visible) },
    { label: 'withheld by SQL', value: String(hidden) },
    { label: 'ledger entries', value: String(ledger) },
  ];

  return (
    <section
      aria-label="Security boundary"
      className={[
        'flex flex-col rounded-[26px] bg-white/[0.02] ring-1 ring-white/[0.06]',
        compact ? 'p-4' : 'p-5 sm:p-6',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-400/[0.09] text-emerald-300 ring-1 ring-emerald-400/15">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-emerald-300/90">
            server-authoritative boundary
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
            The lens comes from the signed HttpOnly cookie. SQL re-projects the
            board before the payload leaves the server.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.06]">
        {stats.map((item) => (
          <div key={item.label} className="bg-[#0a0b10] px-3.5 py-3">
            <dd className="font-mono text-[17px] font-medium tabular-nums leading-none text-zinc-100">
              {item.value}
            </dd>
            <dt className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
              {item.label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500">
        <span
          className={[
            'size-1.5 rounded-full',
            verified ? 'bg-emerald-400' : 'bg-amber-400',
          ].join(' ')}
          aria-hidden
        />
        {verified ? 'chain verified' : 'chain pending'}
        <span className="size-[2px] rounded-full bg-zinc-700" aria-hidden />
        <span className="truncate normal-case tracking-normal text-zinc-600">
          {view}
        </span>
      </div>

      {hidden > 0 && (
        <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-amber-400/[0.05] px-3 py-2 text-[10.5px] leading-snug text-amber-200/80 ring-1 ring-amber-400/12">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          {hidden} {hidden === 1 ? 'source exists' : 'sources exist'} in the
          database but were never shipped to this lens.
        </p>
      )}

      <button
        type="button"
        onClick={() => openSecurityTab('boundary')}
        className="group mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-zinc-100 text-[11.5px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.99]"
      >
        <ShieldCheck className="size-3.5" aria-hidden />
        Open live security proof
        <ArrowUpRight
          className="size-3.5 text-zinc-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>

      <p className="mt-3 font-mono text-[8px] leading-relaxed tracking-[0.04em] text-zinc-600">
        Manager payloads never contain filePath, commit, diff, implementation,
        headSha or sourceUrl. Both projections are recomputed live on request.
      </p>
    </section>
  );
}
