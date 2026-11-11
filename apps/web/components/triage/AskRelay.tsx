'use client';

import {
  ArrowUpRight,
  BadgeCheck,
  Command,
  CornerDownLeft,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { interrogate, type IntelAnswer } from '@/lib/relay-intel';
import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

const SUGGESTIONS = [
  'What blocks the launch?',
  'Simulate the production launch',
  'Who owns the staging secret?',
  'Show me the decision ledger',
  'Build a Day-1 survival plan',
  'Where did the export bucket evidence come from?',
];

const VERDICT_STYLE = {
  GO: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'NO-GO': 'border-red-500/30 bg-red-500/10 text-red-300',
  CONDITIONAL: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
} as const;

export function AskRelay() {
  const askOpen = useConsole((s) => s.askOpen);
  const setAskOpen = useConsole((s) => s.setAskOpen);
  const reveal = useConsole((s) => s.reveal);

  const doubts = useTriage((s) => s.doubts);
  const role = useTriage((s) => s.role);
  const readiness = useTriage((s) => s.readiness);

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<IntelAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setAskOpen(!useConsole.getState().askOpen);
      }
      if (event.key === 'Escape' && useConsole.getState().askOpen) {
        setAskOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setAskOpen]);

  useEffect(() => {
    if (askOpen) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    // Reset on the next frame so the effect never cascades a synchronous state
    // update while React is committing the overlay close.
    const frame = requestAnimationFrame(() => {
      setQuery('');
      setAnswer(null);
      setThinking(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [askOpen]);

  function run(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setThinking(true);
    // A tiny deterministic delay makes the synthesis legible without implying
    // a network model call. The answer itself is computed locally and instantly.
    window.setTimeout(() => {
      setAnswer(interrogate(trimmed, doubts, role, readiness));
      setThinking(false);
    }, 220);
  }

  if (!askOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-zinc-950/80 p-3 pt-[6vh] backdrop-blur-sm animate-in fade-in duration-150 sm:p-6 sm:pt-[9vh]"
      onClick={() => setAskOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask Relay"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_50px_140px_-30px_rgba(0,0,0,1)] animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2.5 sm:px-4">
          <Search className="size-4 shrink-0 text-emerald-400/80" aria-hidden />
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(query);
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask the handover graph — every answer cites a source"
              aria-label="Ask Relay a grounded question"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              {thinking ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <CornerDownLeft className="size-3" aria-hidden />
              )}
              ask
            </button>
          </form>
          <span className="hidden items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-1 font-mono text-[8px] text-zinc-600 sm:inline-flex">
            <Command className="size-2.5" aria-hidden />K
          </span>
          <button
            type="button"
            onClick={() => setAskOpen(false)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
            aria-label="Close Ask Relay"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800/60 px-3 py-2 sm:px-4">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-emerald-400">
            <BadgeCheck className="size-2.5" aria-hidden />
            deterministic · zero model call
          </span>
          {SUGGESTIONS.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => run(suggestion)}
              className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2 py-0.5 font-mono text-[8px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="max-h-[58vh] overflow-y-auto px-4 py-4 sm:px-5">
          {!answer && !thinking && (
            <div className="rounded-xl border border-dashed border-zinc-800/80 p-5 text-center">
              <Sparkles className="mx-auto size-5 text-emerald-400/70" aria-hidden />
              <p className="mt-2 text-[13px] font-medium text-zinc-200">
                Interrogate the board, not the internet.
              </p>
              <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-zinc-500">
                Ask about a blocker, an owner, a source, or the launch. Relay
                assembles the answer from this session&apos;s role-scoped board and
                attaches clickable citations that trace back to the exact
                evidence node.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => run(suggestion)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-[10px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thinking && (
            <div className="flex items-center justify-center gap-2 py-10 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">
              <Loader2 className="size-4 animate-spin text-emerald-400" aria-hidden />
              traversing evidence graph…
            </div>
          )}

          {answer && !thinking && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-zinc-500">
                  grounded answer
                </p>
                {answer.verdict && (
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${VERDICT_STYLE[answer.verdict]}`}
                  >
                    {answer.verdict}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[8.5px] text-zinc-500">
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className="block h-full rounded-full bg-emerald-500/80"
                      style={{ width: `${answer.confidence}%` }}
                    />
                  </span>
                  {answer.confidence}% confidence
                </span>
              </div>

              <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-zinc-100">
                {answer.title}
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
                {answer.body}
              </p>

              {answer.bullets.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {answer.bullets.map((bullet, index) => (
                    <li
                      key={`${answer.id}-${index}`}
                      className="flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-2.5 py-2 text-[11.5px] leading-relaxed text-zinc-300"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400/80" aria-hidden />
                      <span className="min-w-0">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
                  citations · click to trace on the board
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {answer.citations.map((citation) => (
                    <button
                      key={`${citation.doubtId}-${citation.evidenceId ?? 'doubt'}`}
                      type="button"
                      onClick={() => reveal(citation.doubtId, citation.evidenceId)}
                      className="group inline-flex items-center gap-1 rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2 py-1 font-mono text-[9px] text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-200"
                      title="Trace this citation to the exact evidence node"
                    >
                      <GitBranch className="size-2.5 text-zinc-500 group-hover:text-emerald-400" aria-hidden />
                      {citation.label}
                      <ArrowUpRight className="size-2.5 text-zinc-600 group-hover:text-emerald-300" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
                assembled from {doubts.length} doubts · role={role} · no claim
                without a citation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
