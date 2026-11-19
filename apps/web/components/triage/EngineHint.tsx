'use client';

import { Sparkles } from 'lucide-react';

import type { Role } from '@/stores/triage';

/**
 * One quiet paragraph from the engine: why these sources disagree. It sits
 * under the contradiction summary and never competes with the decision.
 */
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
    <aside
      aria-label="Relay's read"
      className="mt-6 flex gap-3 border-l border-white/[0.09] pl-4"
    >
      <Sparkles
        className="mt-0.5 size-3.5 shrink-0 text-amber-300/70"
        aria-hidden
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
            {label}
          </p>
          {pct != null && (
            <span className="font-mono text-[8px] tabular-nums text-zinc-600">
              {pct}% engine confidence
            </span>
          )}
        </div>
        {hint && (
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-zinc-400">
            {hint}
          </p>
        )}
      </div>
    </aside>
  );
}
