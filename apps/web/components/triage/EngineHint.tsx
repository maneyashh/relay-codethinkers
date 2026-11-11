'use client';

import { Sparkles } from 'lucide-react';

import type { Role } from '@/stores/triage';

export function EngineHint({
  hint,
  confidence,
  role,
}: {
  hint?: string;
  confidence?: number;
  role?: Role;
}) {
  if (!hint && confidence == null) return null;

  const pct =
    confidence == null
      ? null
      : Math.round(Math.max(0, Math.min(1, confidence)) * 100);

  const label =
    role === 'manager' ? "Relay's executive read" : "Relay's technical read";

  return (
    <aside className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-800/80 text-zinc-400">
          <Sparkles className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-zinc-200">{label}</p>
            {pct != null && (
              <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                <span className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
                  <span
                    className="block h-full rounded-full bg-emerald-500/80"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-zinc-400">{pct}%</span>
              </span>
            )}
          </div>

          {hint && (
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{hint}</p>
          )}
        </div>
      </div>
    </aside>
  );
}
