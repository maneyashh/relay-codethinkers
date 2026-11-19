'use client';

import {
  ArrowRight,
  Check,
  CloudOff,
  GitBranch,
  Globe2,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GITHUB_PRESETS } from '@/lib/github-types';
import { isKeynoteRunning } from '@/components/triage/JudgeWalkthrough';
import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

/**
 * Accepts anything a human would paste from a browser and returns the canonical
 * `owner/repo` the API expects. Full URLs, trailing slashes and `.git` suffixes
 * are all normalised; anything that cannot be an `owner/repo` pair returns null.
 */
export function normalizeRepoInput(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  value = value
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^github\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  const parts = value.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, name] = parts;
  const pattern = /^[A-Za-z0-9_.-]+$/;
  if (!pattern.test(owner) || !pattern.test(name)) return null;

  return `${owner}/${name}`;
}

const INPUT_CLASS =
  'h-12 w-full rounded-xl bg-black/45 pl-10 pr-3 font-mono text-[12.5px] text-zinc-100 outline-none ring-1 ring-white/10 transition placeholder:text-zinc-600 hover:bg-black/55 focus:bg-black/60 focus:ring-emerald-400/50';

export function GitHubIngestStudio() {
  const open = useConsole((s) => s.ingestOpen);
  const setOpen = useConsole((s) => s.setIngestOpen);
  const view = useTriage((s) => s.view);
  const pendingAction = useTriage((s) => s.pendingAction);
  const role = useTriage((s) => s.role);
  const lastIngest = useTriage((s) => s.lastIngest);
  const webhook = useTriage((s) => s.webhook);
  const liveDoubts = useTriage((s) => s.meta?.liveDoubts ?? 0);
  const setView = useTriage((s) => s.setView);
  const error = useTriage((s) => s.error);

  const [presetId, setPresetId] = useState(GITHUB_PRESETS[0].id);
  const [repo, setRepo] = useState('');
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  /**
   * The picker is a real modal: initial focus, a Tab trap, and a scroll lock.
   * During the keynote it never dismisses itself — Esc belongs to the deck, so
   * the film cannot lose the surface it is narrating.
   */
  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLInputElement>('[data-guide="repo-input"]')
        ?.focus();
    });

    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // The deck handles Escape and exits the film; never close underneath it.
        if (isKeynoteRunning()) return;
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = dialog?.contains(active) ?? false;

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open, setOpen]);

  function dismiss() {
    if (isKeynoteRunning()) return;
    setOpen(false);
  }

  const normalized = useMemo(() => normalizeRepoInput(repo), [repo]);
  const invalid = touched && repo.trim().length > 2 && normalized === null;

  if (!open) return null;

  const busy = pendingAction !== null;
  const selectedPreset =
    GITHUB_PRESETS.find((preset) => preset.id === presetId) ??
    GITHUB_PRESETS[0];
  const hasResult = Boolean(lastIngest || webhook);

  /**
   * Two entry paths, one truthful pipeline:
   *  - `repo` scans whatever the judge typed.
   *  - `presetId` replays a curated repository from the same live endpoint.
   *
   * From the landing page we drive the cinematic extraction view; from the
   * board we stay put and let the modal fill with live findings.
   */
  async function scan(target: { repo?: string; presetId?: string }) {
    if (busy) return;

    const triage = useTriage.getState();
    const fromLanding = triage.view === 'landing';
    triage.clearError();

    if (fromLanding) {
      setOpen(false);
      triage.startIngest();
      await triage.loadBoard();
      const result = await triage.ingestGithub(target);
      if (!result) {
        // The extraction view already surfaces the failure; hand the judge back
        // the selector with the real error attached.
        useTriage.getState().setView('landing');
        setOpen(true);
      }
      return;
    }

    await triage.ingestGithub(target);
  }

  function scanTypedRepo() {
    setTouched(true);
    if (!normalized) return;
    void scan({ repo: normalized });
  }

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-3 backdrop-blur-2xl animate-in fade-in duration-200 sm:p-6"
      onClick={dismiss}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connect and scan a GitHub repository"
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] bg-[#08090d]/96 shadow-[0_80px_180px_-40px_rgba(0,0,0,1)] ring-1 ring-white/[0.09] backdrop-blur-2xl animate-in zoom-in-95 fade-in duration-200"
        onClick={(event) => event.stopPropagation()}
        style={{ fontFamily: 'var(--font-geist-sans)' }}
      >
        <div className="h-px w-full shrink-0 bg-linear-to-r from-transparent via-white/30 to-transparent" />

        <header className="flex items-start gap-3 px-5 pb-1 pt-5 sm:px-7">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-400/[0.09] text-emerald-300 ring-1 ring-emerald-400/25">
            <ScanLine className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-zinc-50">
              Connect a repository
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              Read any public GitHub repo live — real files, commits and
              manifests. No seeding, no fixtures.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5 sm:px-7">
          {/* ------------------------------------------------ */}
          {/* 1 · Scan your own repository — the primary path    */}
          {/* ------------------------------------------------ */}
          <section className="rounded-2xl bg-[linear-gradient(155deg,rgba(16,185,129,0.07),rgba(255,255,255,0.02))] p-4 ring-1 ring-emerald-400/[0.18]">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-emerald-300/90">
                Scan your own GitHub repository
              </p>
              <span className="ml-auto rounded-full bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[6.5px] uppercase tracking-[0.14em] text-emerald-300/80">
                any public repo
              </span>
            </div>

            <label className="mt-3 block">
              <span className="sr-only">GitHub repository</span>
              <div className="relative">
                <GitBranch
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                  aria-hidden
                />
                <input
                  data-guide="repo-input"
                  value={repo}
                  onChange={(event) => {
                    setRepo(event.target.value);
                    setTouched(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      scanTypedRepo();
                    }
                  }}
                  maxLength={200}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="owner/repo  or  https://github.com/owner/repo"
                  className={INPUT_CLASS}
                  aria-invalid={invalid}
                />
              </div>
            </label>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="order-2 min-w-0 flex-1 font-mono text-[8.5px] leading-relaxed text-zinc-500 sm:order-1">
                {invalid ? (
                  <span className="text-amber-300/90">
                    Use owner/repo or a full github.com URL.
                  </span>
                ) : normalized ? (
                  <>
                    will scan{' '}
                    <span className="text-emerald-300">{normalized}</span>
                  </>
                ) : (
                  'Try vercel/next.js, honojs/hono — or your own repo.'
                )}
              </p>
              <button
                data-guide="scan-repo"
                type="button"
                onClick={scanTypedRepo}
                disabled={busy || normalized === null}
                className="order-1 flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-50 px-4 text-[12.5px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:order-2"
              >
                Scan Repository
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>
          </section>

          {/* ------------------------------------------------ */}
          {/* 2 · Curated repositories                           */}
          {/* ------------------------------------------------ */}
          <div className="mt-5 flex items-center gap-2.5">
            <Sparkles className="size-3 text-zinc-600" aria-hidden />
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-500">
              Or pick a curated live repository
            </p>
            <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
          </div>

          <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {GITHUB_PRESETS.map((preset) => {
              const active = preset.id === presetId;
              const featured = preset.featured === true;

              return (
                <button
                  key={preset.id}
                  type="button"
                  data-guide={
                    featured
                      ? 'repo-preset-featured'
                      : `repo-preset-${preset.id}`
                  }
                  data-preset={preset.id}
                  aria-pressed={active}
                  onClick={() => {
                    setPresetId(preset.id);
                    setRepo('');
                    setTouched(false);
                  }}
                  className={[
                    'group relative flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-left ring-1 transition',
                    featured ? 'sm:col-span-2' : '',
                    active
                      ? 'bg-white/[0.075] ring-white/[0.18]'
                      : 'bg-white/[0.022] ring-white/[0.05] hover:bg-white/[0.045] hover:ring-white/[0.1]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg ring-1',
                      featured
                        ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20'
                        : active
                          ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
                          : 'bg-white/[0.04] text-zinc-500 ring-white/[0.06]',
                    ].join(' ')}
                  >
                    {featured ? (
                      <Star className="size-3 fill-current" aria-hidden />
                    ) : (
                      <GitBranch className="size-3" aria-hidden />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-mono text-[11px] font-medium text-zinc-100">
                        {preset.repo}
                      </span>
                      {featured && (
                        <span className="shrink-0 rounded-full bg-amber-400/10 px-1.5 py-0.5 font-mono text-[6.5px] uppercase tracking-[0.12em] text-amber-200/90">
                          our hackathon repo
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] leading-snug text-zinc-500">
                      {featured
                        ? (preset.tagline ?? preset.detail)
                        : preset.detail}
                    </span>
                  </span>

                  <Check
                    className={[
                      'mt-1 size-3.5 shrink-0 transition-opacity',
                      active ? 'text-emerald-300 opacity-100' : 'opacity-0',
                    ].join(' ')}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-amber-400/[0.07] px-3 py-2 text-[10.5px] leading-snug text-amber-200/90 ring-1 ring-amber-400/20">
              {error}
            </p>
          )}

          {lastIngest && (
            <div className="mt-4 overflow-hidden rounded-2xl bg-white/[0.028] ring-1 ring-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.1em]',
                    lastIngest.ingestion.mode === 'live'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-amber-400/10 text-amber-300',
                  ].join(' ')}
                >
                  {lastIngest.ingestion.mode === 'live' ? (
                    <Check className="size-2.5" aria-hidden />
                  ) : (
                    <CloudOff className="size-2.5" aria-hidden />
                  )}
                  {lastIngest.ingestion.mode === 'live'
                    ? 'live github api'
                    : 'labelled fallback'}
                </span>
                <span className="truncate font-mono text-[9px] text-zinc-500">
                  {lastIngest.ingestion.fullName} · {lastIngest.ingestion.ref}
                </span>
                {role === 'junior' && lastIngest.ingestion.headSha && (
                  <code className="ml-auto hidden shrink-0 font-mono text-[8px] text-zinc-600 sm:block">
                    {lastIngest.ingestion.headSha.slice(0, 7)}
                  </code>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.05] border-t border-white/[0.05]">
                {[
                  { label: 'files', value: lastIngest.ingestion.filesScanned },
                  { label: 'commits', value: lastIngest.ingestion.commitsRead },
                  { label: 'findings', value: lastIngest.ingestion.findings },
                ].map((item) => (
                  <div key={item.label} className="px-4 py-3">
                    <p className="font-mono text-[19px] font-medium tabular-nums leading-none text-zinc-100">
                      {item.value}
                    </p>
                    <p className="mt-1.5 font-mono text-[7.5px] uppercase tracking-[0.14em] text-zinc-600">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              {lastIngest.ingestion.fallbackReason && (
                <p className="mx-4 mb-3 rounded-lg bg-amber-400/[0.06] px-2.5 py-2 text-[9.5px] leading-snug text-amber-200/80">
                  {lastIngest.ingestion.fallbackReason}
                </p>
              )}

              <ul className="max-h-52 overflow-y-auto px-1.5 pb-1.5">
                {lastIngest.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-white/[0.03]"
                  >
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          finding.severity === 'critical'
                            ? '#ef4444'
                            : finding.severity === 'high'
                              ? '#f97316'
                              : '#eab308',
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] font-medium text-zinc-200">
                        {finding.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-zinc-500">
                        {finding.claim}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[8px] text-zinc-600">
                      {Math.round(finding.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {webhook && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sky-400/[0.05] px-3 py-2.5 ring-1 ring-sky-400/15">
              <ShieldCheck className="size-3.5 text-sky-300" aria-hidden />
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-sky-300">
                delivery verified · HMAC-SHA256
              </span>
              <span className="ml-auto font-mono text-[8.5px] tabular-nums text-zinc-500">
                {webhook.event} · {webhook.doubtsCreated} doubts
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.05] bg-[#08090d]/95 px-5 pb-5 pt-4 sm:px-7">
          <button
            data-guide="repo-scan"
            type="button"
            onClick={() =>
              repo.trim() && normalized
                ? void scan({ repo: normalized })
                : void scan({ presetId: selectedPreset.id })
            }
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-50 text-[13.5px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.995] disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Globe2 className="size-4" aria-hidden />
            )}
            {pendingAction === 'github-ingest'
              ? 'Fetching · analyzing…'
              : 'Ingest repository'}
          </button>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
              <ShieldCheck className="size-3" aria-hidden />
              read-only api · session-scoped
            </span>
            {hasResult && view === 'triage' && (
              <button
                type="button"
                onClick={() => {
                  if (isKeynoteRunning()) return;
                  setOpen(false);
                  setView('triage');
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-400/[0.08]"
              >
                Open board
                {liveDoubts > 0 && (
                  <span className="tabular-nums text-emerald-200/70">
                    {liveDoubts} live
                  </span>
                )}
                <ArrowRight className="size-3" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className={[
                'py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-500 transition hover:text-zinc-200',
                hasResult && view === 'triage' ? 'pl-2' : 'ml-auto',
              ].join(' ')}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
