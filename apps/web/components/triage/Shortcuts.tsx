'use client';

import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Command,
  FastForward,
  FileText,
  HelpCircle,
  KeyRound,
  Keyboard,
  Layers,
  Play,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  isKeynoteRunning,
  startCompleteGuide,
} from '@/components/triage/JudgeWalkthrough';
import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

type GuideTab = 'proofs' | 'tour' | 'keys';

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['1', '2', '3'], label: 'Resolve with that option' },
  { keys: ['S'], label: 'Skip this doubt for now' },
  { keys: ['J', '↓'], label: 'Next doubt' },
  { keys: ['K', '↑'], label: 'Previous doubt' },
  { keys: ['⌘K', 'Ctrl K'], label: 'Ask Relay (grounded, cited)' },
  { keys: ['C'], label: 'Inject a live signal' },
  { keys: ['?'], label: 'This judge guide' },
  { keys: ['Esc'], label: 'Close any overlay' },
];

const TABS: { id: GuideTab; label: string; icon: typeof Star }[] = [
  { id: 'proofs', label: 'Round 3 proofs', icon: BadgeCheck },
  { id: 'tour', label: 'Product tour', icon: Layers },
  { id: 'keys', label: 'Keyboard', icon: Keyboard },
];

export function Shortcuts() {
  const helpOpen = useConsole((s) => s.helpOpen);
  const setHelpOpen = useConsole((s) => s.setHelpOpen);
  const setChaosOpen = useConsole((s) => s.setChaosOpen);
  const setAskOpen = useConsole((s) => s.setAskOpen);
  const setSecurityOpen = useConsole((s) => s.setSecurityOpen);
  const setIngestOpen = useConsole((s) => s.setIngestOpen);

  const doubts = useTriage((s) => s.doubts);
  const readiness = useTriage((s) => s.readiness);
  const pendingAction = useTriage((s) => s.pendingAction);
  const fastForward = useTriage((s) => s.fastForward);
  const setView = useTriage((s) => s.setView);

  const [tab, setTab] = useState<GuideTab>('proofs');

  const open = doubts.filter((doubt) => doubt.status === 'open').length;
  const busy = pendingAction !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The keynote owns the keyboard while it runs; a stray "c" must never
      // drop a chaos modal on top of a chapter.
      if (isKeynoteRunning()) return;
      const state = useTriage.getState();
      if (state.view !== 'triage' && state.view !== 'landing') return;
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

      // While the guide is open it owns the keyboard: Esc closes it, and we do
      // not let a stray "c" or "?" open another surface behind the dialog.
      if (useConsole.getState().helpOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        setTab('proofs');
        setHelpOpen(true);
      } else if (event.key.toLowerCase() === 'c' && state.view === 'triage') {
        event.preventDefault();
        setChaosOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setHelpOpen, setChaosOpen]);

  async function goToBoard() {
    setHelpOpen(false);
    const triage = useTriage.getState();
    if (triage.ingestStatus !== 'ready') {
      await triage.loadBoard();
    }
    useTriage.getState().setFocusMode('guided');
    useTriage.getState().setView('triage');
  }

  if (!helpOpen) return null;

  const proofs: {
    tag: string;
    title: string;
    promised: string;
    live: string;
    routes: string;
    primary: { label: string; run: () => void };
    secondary: { label: string; run: () => void };
  }[] = [
    {
      tag: 'D1',
      title: 'Live GitHub ingestion + signed webhooks',
      promised:
        'Replace the static seed.json demo with the real GitHub REST API and verified deliveries.',
      live:
        'Relay fetches a public repository, runs a deterministic drift analyzer over real files and commits, and appends findings to this signed session. Webhook deliveries are HMAC-SHA256 verified before they touch the board. If an anonymous judge IP is rate-limited, the fallback is clearly labelled — never disguised as live.',
      routes: 'POST /api/github/ingest · POST /api/github/webhook',
      primary: {
        label: 'Open ingest studio',
        run: () => {
          setHelpOpen(false);
          setIngestOpen(true);
        },
      },
      secondary: {
        label: 'Run complete guide',
        run: () => {
          setHelpOpen(false);
          startCompleteGuide();
        },
      },
    },
    {
      tag: 'D2',
      title: 'Role-gated PR + Notion execution',
      promised:
        'Turn the fake Round 2 buttons into real, least-privilege server dispatches.',
      live:
        'The artifact is built on the server from the signed role’s board — the browser never supplies the content. A manager receives a hard 403 with zero artifact leakage. A junior receives a signed branch, artifact SHA-256 and unified diff. Notion sync follows the same role filter.',
      routes:
        'POST /api/integrations/github-pr · POST /api/integrations/notion-sync',
      primary: {
        label: 'Open role boundary',
        run: () => {
          setHelpOpen(false);
          setSecurityOpen(true);
          useConsole.getState().openSecurityTab('boundary');
        },
      },
      secondary: {
        label: 'Run complete guide',
        run: () => {
          setHelpOpen(false);
          startCompleteGuide();
        },
      },
    },
    {
      tag: 'D3',
      title: 'SHA-256 ledger + progressive UI',
      promised:
        'Fix cognitive overload and add the missing post-export security proof.',
      live:
        'Focus mode shows one contradiction at a time; War-Room expands everything. Every decision extends an append-only SHA-256 chain signed with HMAC. Export .relay.sig, or run a rogue tamper attack and watch the verifier reject the forged link while the live chain stays intact.',
      routes: 'GET /api/security/receipt · POST /api/security/receipt',
      primary: {
        label: 'Open receipt verifier',
        run: () => {
          setHelpOpen(false);
          setSecurityOpen(true);
          useConsole.getState().openSecurityTab('receipt');
        },
      },
      secondary: {
        label: 'Run complete guide',
        run: () => {
          setHelpOpen(false);
          startCompleteGuide();
        },
      },
    },
  ];

  const tour: {
    icon: typeof Star;
    title: string;
    detail: string;
    go: string;
    run: () => void;
  }[] = [
    {
      icon: Sparkles,
      title: 'Landing — the 30-second story',
      detail:
        'The problem, the three deliverables, and one button that starts the judge walkthrough.',
      go: 'You are here',
      run: () => setHelpOpen(false),
    },
    {
      icon: ScanLine,
      title: 'Ingest studio — real repositories',
      detail:
        'Pick the gold ★ self-scan preset (our own live repo) or Express, Hono, Koa and friends. Watch real files and commits become doubts.',
      go: 'Open studio',
      run: () => {
        setHelpOpen(false);
        setIngestOpen(true);
      },
    },
    {
      icon: Layers,
      title: 'Triage board — Focus vs War-Room',
      detail:
        'Focus mode walks one contradiction at a time. War-Room shows the whole handover surface. Same server-authoritative data behind both.',
      go: 'Open board',
      run: () => void goToBoard(),
    },
    {
      icon: Command,
      title: 'Ask Relay — cited answers',
      detail:
        'Ask “What blocks the launch?” Every answer cites the source it came from. No uncited model claims.',
      go: 'Ask Relay',
      run: () => {
        setHelpOpen(false);
        setAskOpen(true);
      },
    },
    {
      icon: ShieldCheck,
      title: 'Security proof — RBAC made visible',
      detail:
        'Compare the manager and developer payloads, inspect the SQL views, and confirm that paths, diffs and SHAs are withheld at the database layer.',
      go: 'Prove boundary',
      run: () => {
        setHelpOpen(false);
        setSecurityOpen(true);
        useConsole.getState().openSecurityTab('boundary');
      },
    },
    {
      icon: KeyRound,
      title: 'Receipt chain — tamper evidence',
      detail:
        'Export the .relay.sig chain, then forge one link. The verifier names the broken sequence and rejects the signature.',
      go: 'Open receipt',
      run: () => {
        setHelpOpen(false);
        setSecurityOpen(true);
        useConsole.getState().openSecurityTab('receipt');
      },
    },
    {
      icon: FileText,
      title: 'Handover artifact — the decision record',
      detail:
        'Resolved doubts, rationale, owners, sign-offs and verification become the exportable handover.',
      go: readiness === 100 ? 'Open artifact' : 'Finish decisions',
      run: () => {
        setHelpOpen(false);
        setView(readiness === 100 ? 'complete' : 'triage');
      },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[170] grid place-items-center bg-zinc-950/88 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-6"
      onClick={() => setHelpOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Relay judge guide"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#07080C] p-4 shadow-[0_60px_160px_-40px_rgba(0,0,0,1),0_0_60px_-30px_rgba(251,191,36,0.35)] animate-in fade-in zoom-in-95 duration-200 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300">
              <Star className="size-3.5 fill-amber-300 text-amber-300" aria-hidden />
              Relay · Round 3 judge guide
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-zinc-50 sm:text-[28px]">
              Understand every part in 60 seconds.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-zinc-400">
              Three judged improvements, one product tour, and the exact route to
              verify each claim. Nothing here is a mock: every proof button calls
              the real route handler.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-amber-500/35 hover:text-zinc-100"
            aria-label="Close judge guide"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] transition',
                tab === id
                  ? 'bg-amber-400/15 text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-zinc-500 hover:text-zinc-200',
              ].join(' ')}
            >
              <Icon className="size-3" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === 'proofs' && (
          <div className="mt-4 grid gap-3">
            {proofs.map((proof) => (
              <div
                key={proof.tag}
                className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3.5 transition hover:border-amber-500/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-amber-200">
                    {proof.tag}
                  </span>
                  <p className="text-[13px] font-semibold text-zinc-100">
                    {proof.title}
                  </p>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-300">
                    <span className="size-1 rounded-full bg-emerald-400" aria-hidden />
                    live
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-amber-300/70">
                    promised ·{' '}
                  </span>
                  {proof.promised}
                </p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-300">
                  {proof.live}
                </p>
                <p className="mt-2 break-all font-mono text-[9px] text-sky-300/80">
                  {proof.routes}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={proof.primary.run}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-zinc-200 transition hover:border-amber-500/40 hover:text-amber-100"
                  >
                    {proof.primary.label}
                    <ArrowRight className="size-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={proof.secondary.run}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/[0.08] px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-amber-200 transition hover:bg-amber-400/15"
                  >
                    <Star className="size-3 fill-amber-300 text-amber-300" aria-hidden />
                    {proof.secondary.label}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'tour' && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {tour.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.018] p-3 transition hover:border-amber-500/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-zinc-800 bg-zinc-900 text-amber-300">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                      step {String(index + 1).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={item.run}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-emerald-300 transition hover:text-emerald-200"
                    >
                      {item.go}
                      <ChevronRight className="size-3" aria-hidden />
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] font-semibold text-zinc-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-500">
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'keys' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3.5">
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
                    <span className="text-[11px] text-zinc-400">
                      {item.label}
                    </span>
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
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-3.5">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-emerald-400/80" aria-hidden />
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                  one-command verification
                </p>
              </div>
              <pre className="mt-2.5 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-300/90">
                {'cd apps/web\nnpm run verify:security\n\n# → 72 checks passed'}
              </pre>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                The suite talks to the real route handlers over HTTP. It never
                imports the database, so it proves what a browser can actually
                receive — including the manager/developer boundary.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              startCompleteGuide();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-zinc-950 transition hover:bg-white"
          >
            <Play className="size-3 fill-current" aria-hidden />
            Judge Walkthrough — Complete Guide
          </button>
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              setAskOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-emerald-300 transition hover:bg-emerald-500/15"
          >
            <Command className="size-3" aria-hidden />
            Ask Relay
          </button>
          {open > 0 && (
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                void fastForward();
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-amber-300 transition hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50"
            >
              <FastForward className="size-3" aria-hidden />
              Auto-triage {open}
            </button>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
            <HelpCircle className="size-2.5" aria-hidden />
            press ? anywhere · Esc closes
          </span>
        </div>
      </div>
    </div>
  );
}
