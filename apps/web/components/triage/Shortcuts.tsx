'use client';

import {
  ArrowRight,
  Command,
  FastForward,
  HelpCircle,
  Keyboard,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';

import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['1', '2', '3'], label: 'Resolve with that option' },
  { keys: ['S'], label: 'Skip this doubt for now' },
  { keys: ['J', '↓'], label: 'Next doubt' },
  { keys: ['K', '↑'], label: 'Previous doubt' },
  { keys: ['⌘K', 'Ctrl K'], label: 'Ask Relay (grounded, cited)' },
  { keys: ['C'], label: 'Inject a live signal' },
  { keys: ['?'], label: 'This shortcut map' },
  { keys: ['Esc'], label: 'Close any overlay' },
];

const ROUTE: { step: string; title: string; detail: string }[] = [
  {
    step: '01',
    title: 'Read the claim',
    detail: 'Open d-003. One committed secret, one KMS policy, one missing PR.',
  },
  {
    step: '02',
    title: 'Interrogate it',
    detail: '⌘K → “What blocks the launch?” Every answer cites a source.',
  },
  {
    step: '03',
    title: 'Break it live',
    detail: 'Press C. Drop a rogue Slack admission. Watch confidence and the graph recompute.',
  },
  {
    step: '04',
    title: 'Prove the boundary',
    detail: 'Flip to Manager. Open API-secured. Paths and diffs are withheld by SQL.',
  },
  {
    step: '05',
    title: 'Decide like a human',
    detail: 'Attach a rationale, owner and sign-off, then mark the remediation verified.',
  },
  {
    step: '06',
    title: 'Ship the artifact',
    detail: 'Auto-triage the rest, then export the handover, JSON and patch bundle.',
  },
];

export function Shortcuts() {
  const helpOpen = useConsole((s) => s.helpOpen);
  const setHelpOpen = useConsole((s) => s.setHelpOpen);
  const setChaosOpen = useConsole((s) => s.setChaosOpen);
  const setAskOpen = useConsole((s) => s.setAskOpen);
  const setSecurityOpen = useConsole((s) => s.setSecurityOpen);

  const doubts = useTriage((s) => s.doubts);
  const readiness = useTriage((s) => s.readiness);
  const pendingAction = useTriage((s) => s.pendingAction);
  const fastForward = useTriage((s) => s.fastForward);
  const setView = useTriage((s) => s.setView);

  const open = doubts.filter((doubt) => doubt.status === 'open').length;
  const busy = pendingAction !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useTriage.getState();
      if (state.view !== 'triage') return;
      const element = event.target as HTMLElement | null;
      if (
        element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'SELECT' ||
          element.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(!useConsole.getState().helpOpen);
      } else if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setChaosOpen(true);
      } else if (event.key === 'Escape') {
        if (useConsole.getState().helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setHelpOpen, setChaosOpen]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[115] grid place-items-center bg-zinc-950/85 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-6"
      onClick={() => setHelpOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts and judge route"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-[0_60px_160px_-40px_rgba(0,0,0,1)] animate-in fade-in zoom-in-95 duration-200 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400">
              <HelpCircle className="size-3.5" aria-hidden />
              drive relay without the mouse
            </p>
            <h2 className="mt-2 text-[21px] font-semibold tracking-tight text-zinc-100">
              The 90-second judge route.
            </h2>
            <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-zinc-500">
              Six moves from raw chaos to a verified artifact. Every step is
              backed by the same server-authoritative board.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
            aria-label="Close shortcuts"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
            <div className="flex items-center gap-2">
              <Keyboard className="size-3.5 text-zinc-500" aria-hidden />
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                keyboard
              </p>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {KEYS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-[11px] text-zinc-400">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-emerald-400/80" aria-hidden />
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                judge route
              </p>
            </div>
            <ol className="mt-2.5 flex flex-col gap-2">
              {ROUTE.map((item) => (
                <li key={item.step} className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-zinc-700 font-mono text-[7px] text-zinc-500">
                    {item.step}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10.5px] font-medium text-zinc-200">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] leading-snug text-zinc-500">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              setAskOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/15"
          >
            <Command className="size-3" aria-hidden />
            ask relay
          </button>
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              setChaosOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber-300 transition hover:bg-amber-500/15"
          >
            <Zap className="size-3" aria-hidden />
            inject a signal
          </button>
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              setSecurityOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <ShieldCheck className="size-3 text-emerald-400/80" aria-hidden />
            prove the boundary
          </button>

          <div className="ml-auto flex items-center gap-2">
            {open > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  void fastForward();
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber-300 transition hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50"
              >
                <FastForward className="size-3" aria-hidden />
                auto-triage {open}
              </button>
            )}
            {readiness === 100 && (
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  setView('complete');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-2.5 py-1.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-emerald-950 transition hover:bg-emerald-300"
              >
                open artifact
                <ArrowRight className="size-3" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
          <Terminal className="size-2.5" aria-hidden />
          every action is audited · no model call · no write access to source
          systems
        </p>
      </div>
    </div>
  );
}
