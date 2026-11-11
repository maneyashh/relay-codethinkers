'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTriage } from '@/stores/triage';

const DURATION_MS = 4600;

const SOURCES: {
  name: string;
  detail: string;
  icon: LucideIcon;
  color: string;
  start: number;
  span: number;
}[] = [
  {
    name: 'Slack',
    detail: '18 channels · 4,812 messages',
    icon: MessageSquare,
    color: '#a78bfa',
    start: 0,
    span: 46,
  },
  {
    name: 'Jira',
    detail: '42 tickets · 6 epics',
    icon: ClipboardList,
    color: '#60a5fa',
    start: 12,
    span: 46,
  },
  {
    name: 'GitHub',
    detail: '6 repos · 2,861 commits',
    icon: GitBranch,
    color: '#e4e4e7',
    start: 24,
    span: 46,
  },
  {
    name: 'Notion',
    detail: '31 docs · 12 specs',
    icon: FileText,
    color: '#d4d4d8',
    start: 36,
    span: 46,
  },
];

const LOG: { at: number; source: string; text: string; color: string }[] = [
  { at: 2, source: 'relay', text: 'handshake · workspace relay-labs', color: '#a1a1aa' },
  { at: 8, source: 'slack', text: '#ops-urgent · 1,204 messages parsed', color: '#a78bfa' },
  { at: 16, source: 'jira', text: 'REL-201 · Supabase platform mandate', color: '#60a5fa' },
  { at: 24, source: 'github', text: 'PR #402 · 47 files moved to Firebase', color: '#e4e4e7' },
  { at: 32, source: 'relay', text: 'contradiction · Supabase vs Firebase', color: '#ef4444' },
  { at: 40, source: 'slack', text: '2am admission · “do not put this in writing”', color: '#a78bfa' },
  { at: 48, source: 'code', text: 'config.ts:41 · hardcoded staging password', color: '#34d399' },
  { at: 56, source: 'relay', text: 'contradiction · KMS policy vs committed secret', color: '#ef4444' },
  { at: 64, source: 'code', text: 'cron · export routed to personal AWS bucket', color: '#34d399' },
  { at: 72, source: 'relay', text: 'contradiction · export ownership + bucket', color: '#ef4444' },
  { at: 80, source: 'github', text: 'PR #412 · retry policy silently reduced', color: '#e4e4e7' },
  { at: 88, source: 'relay', text: '6 doubts · 24 sources · 91% mean confidence', color: '#10b981' },
  { at: 96, source: 'relay', text: 'handover queue ready', color: '#10b981' },
];

function progressFor(progress: number, start: number, span: number) {
  return Math.max(0, Math.min(100, ((progress - start) / span) * 100));
}

function compact(n: number) {
  return n.toLocaleString('en-US');
}

export function IngestView() {
  const loadBoard = useTriage((s) => s.loadBoard);
  const finishIngest = useTriage((s) => s.finishIngest);
  const ingestStatus = useTriage((s) => s.ingestStatus);
  const meta = useTriage((s) => s.meta);
  const error = useTriage((s) => s.error);
  const [progress, setProgress] = useState(0);

  // The cinematic scan and the real API request run in parallel. The view only
  // advances when *both* the animation and the server response are complete.
  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => {
      const next = Math.min(
        100,
        Math.round(((performance.now() - started) / DURATION_MS) * 100),
      );
      setProgress(next);
      if (next >= 100) window.clearInterval(id);
    }, 70);
    return () => window.clearInterval(id);
  }, []);

  const ready = ingestStatus === 'ready';
  const failed = ingestStatus === 'error';
  const done = progress >= 100 && ready;

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => void finishIngest(), 900);
    return () => window.clearTimeout(t);
  }, [done, finishIngest]);

  const scanned = Math.min(1, progress / 78);
  const contradictions = meta
    ? meta.doubts
    : Math.min(6, Math.floor(progress / 14));
  const apiLog = meta
    ? [
        {
          at: 88,
          source: 'relay',
          text: `api · ${meta.doubts} doubts · ${meta.evidenceVisible} evidence rows returned`,
          color: '#10b981',
        },
        {
          at: 92,
          source: 'auth',
          text: `session · signed HttpOnly cookie · ${meta.evidenceLocked} sources withheld`,
          color: '#34d399',
        },
        {
          at: 97,
          source: 'sqlite',
          text: `db · ${meta.sources} sources indexed · ready`,
          color: '#60a5fa',
        },
      ]
    : [];
  const visibleLog = [...LOG, ...apiLog]
    .filter((line) => progress >= line.at)
    .sort((a, b) => a.at - b.at)
    .slice(-8);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100 antialiased selection:bg-zinc-700/60">
      <div className="relay-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute -top-56 left-1/3 size-[640px] rounded-full bg-emerald-500/[0.08] blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-56 right-0 size-[520px] rounded-full bg-sky-500/[0.06] blur-[140px]" />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-zinc-100 font-mono text-[11px] font-bold text-zinc-950">
            R
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold tracking-tight text-zinc-100">
              Relay
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-500">
              ingestion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/80 bg-zinc-900/50 px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-400">
            <Activity
              className={[
                'size-3',
                failed ? 'text-red-400' : 'text-emerald-400',
              ].join(' ')}
              aria-hidden
            />
            {failed
              ? 'api unavailable'
              : done
                ? 'scan complete'
                : progress >= 100
                  ? 'securing handshake'
                  : 'reading workspace'}
          </span>
          <button
            type="button"
            onClick={() => void finishIngest()}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-900/50 px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            skip scan
            <ArrowRight className="size-3" aria-hidden />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pb-12 pt-2 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12 lg:pb-8">
        <section className="animate-in fade-in slide-in-from-bottom-3 duration-700">
          <p className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">
            <ScanLine className="size-3.5 text-emerald-400" aria-hidden />
            step 01 · ingest
          </p>

          <h1 className="mt-5 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-zinc-50 sm:text-[46px]">
            Relay is reading
            <br />
            <span className="text-zinc-500">your workspace.</span>
            <span className="ml-1.5 inline-block h-[0.82em] w-[0.42ch] translate-y-[0.04em] animate-pulse bg-emerald-400/80 align-baseline" />
          </h1>

          <p className="mt-4 max-w-md text-[13.5px] leading-6 text-zinc-400">
            Scanning messages, tickets, commits, and docs—then cross-referencing
            them for claims that don&apos;t agree.
          </p>

          <div className="mt-7 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-1.5">
            {SOURCES.map(
              ({ name, detail, icon: Icon, color, start, span }, index) => {
                const p = progressFor(progress, start, span);
                const complete = p >= 100;
                const active = p > 0 && !complete;

                return (
                  <div
                    key={name}
                    className={[
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                      active ? 'bg-zinc-800/30' : '',
                    ].join(' ')}
                    style={{ transitionDelay: `${index * 40}ms` }}
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-950"
                      style={{ color }}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12.5px] font-medium text-zinc-200">
                          {name}
                        </p>
                        <span
                          className={[
                            'font-mono text-[8px] uppercase tracking-[0.14em]',
                            complete
                              ? 'text-emerald-400'
                              : active
                                ? 'text-zinc-300'
                                : 'text-zinc-600',
                          ].join(' ')}
                        >
                          {complete ? 'parsed' : active ? 'reading' : 'queued'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[8.5px] text-zinc-500">
                        {detail}
                      </p>
                      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full transition-[width] duration-200 ease-out"
                          style={{ width: `${p}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>

                    <span className="grid size-5 shrink-0 place-items-center">
                      {complete ? (
                        <Check
                          className="size-3.5 text-emerald-400"
                          aria-hidden
                        />
                      ) : active ? (
                        <Loader2
                          className="size-3.5 animate-spin text-zinc-500"
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="size-1.5 rounded-full bg-zinc-700"
                          aria-hidden
                        />
                      )}
                    </span>
                  </div>
                );
              },
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-emerald-400/80" aria-hidden />
                {done ? 'scan complete' : 'extracting contradictions'}
              </span>
              <span className="text-zinc-300">{progress}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-500 via-emerald-400 to-sky-400 transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
            <Lock className="size-3" aria-hidden />
            read-only ·{' '}
            {meta
              ? `${meta.evidenceLocked} sources withheld by SQL for this lens`
              : 'establishing signed session'}
          </p>
        </section>

        <section className="animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:120ms]">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/30">
            <div className="scan-sweep pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-transparent via-emerald-500/[0.1] to-transparent">
              <div className="absolute inset-x-0 bottom-0 h-px bg-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
            </div>

            <div className="relative flex items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-zinc-500" aria-hidden />
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  live extraction
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                relay-engine
              </span>
            </div>

            <div className="grid grid-cols-2 gap-px bg-zinc-800/60">
              {[
                { label: 'messages parsed', value: compact(Math.round(4812 * scanned)) },
                { label: 'commits read', value: compact(Math.round(2861 * scanned)) },
                { label: 'docs indexed', value: compact(Math.round(31 * scanned)) },
                { label: 'contradictions', value: String(contradictions).padStart(2, '0') },
              ].map((stat) => (
                <div key={stat.label} className="bg-zinc-950/70 px-4 py-3.5">
                  <p className="font-mono text-[19px] font-medium tracking-tight text-zinc-100">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="relative h-[228px] overflow-hidden px-4 py-3 font-mono text-[9.5px] leading-6">
              {visibleLog.map((line) => (
                <div
                  key={`${line.at}-${line.text}`}
                  className="animate-in fade-in slide-in-from-bottom-1 flex gap-2 duration-300"
                >
                  <span className="shrink-0 text-zinc-700">
                    {String(line.at).padStart(3, '0')}
                  </span>
                  <span
                    className="w-[52px] shrink-0 uppercase tracking-wider"
                    style={{ color: line.color }}
                  >
                    {line.source}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400">
                    {line.text}
                  </span>
                </div>
              ))}
              {visibleLog.length === 0 && (
                <p className="text-zinc-600">establishing secure handshake…</p>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-zinc-900/90 to-transparent" />
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800/70 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                <ShieldCheck className="size-3 text-emerald-400/70" aria-hidden />
                zero-retention scan
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                {meta
                  ? `${meta.evidenceVisible} visible · ${meta.evidenceLocked} withheld`
                  : 'awaiting /api/session'}
              </span>
            </div>

            {done && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-zinc-950/75 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="text-center">
                  <div className="seal-in mx-auto grid size-12 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                    <Check className="size-5" aria-hidden />
                  </div>
                  <p className="mt-3 text-[14px] font-medium text-zinc-100">
                    {meta?.doubts ?? 0} doubts found
                  </p>
                  <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-zinc-500">
                    server board ready · opening triage
                  </p>
                </div>
              </div>
            )}

            {progress >= 100 && !ready && !failed && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-zinc-950/75 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="text-center">
                  <Loader2
                    className="mx-auto size-7 animate-spin text-emerald-400"
                    aria-hidden
                  />
                  <p className="mt-3 text-[14px] font-medium text-zinc-100">
                    Waiting for the API
                  </p>
                  <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-zinc-500">
                    signed session · role-scoped payload
                  </p>
                </div>
              </div>
            )}

            {failed && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="mx-6 max-w-xs text-center">
                  <AlertTriangle
                    className="mx-auto size-7 text-red-400"
                    aria-hidden
                  />
                  <p className="mt-3 text-[14px] font-medium text-zinc-100">
                    The backend did not answer
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                    {error ?? 'Unknown API error'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadBoard()}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/15"
                  >
                    <RefreshCw className="size-3" aria-hidden />
                    Retry API
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-3 py-2">
            <Sparkles className="size-3.5 shrink-0 text-emerald-400/80" aria-hidden />
            <p className="text-[10.5px] leading-snug text-zinc-500">
              Relay doesn&apos;t summarise. It finds where your team&apos;s
              sources disagree, then asks you to decide.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
