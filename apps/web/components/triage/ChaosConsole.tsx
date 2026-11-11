'use client';

import {
  AlertTriangle,
  ArrowRight,
  Code2,
  GitBranch,
  Lock,
  MessageSquare,
  Radio,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { SignalInput } from '@/lib/api-types';
import { formatDelta, MAX_SIGNALS_PER_SESSION, projectConfidence } from '@/lib/synthesis';
import type {
  EvidencePolarity,
  EvidenceSource,
  Role,
} from '@/lib/triage-types';
import { useConsole } from '@/stores/console';
import { useTriage } from '@/stores/triage';

interface Preset {
  id: string;
  name: string;
  blurb: string;
  icon: typeof MessageSquare;
  tone: string;
  input: SignalInput;
}

const PRESETS: Preset[] = [
  {
    id: 'rogue-slack',
    name: 'Rogue Slack admission',
    blurb: 'A 02:14 message reopens the KMS secret question.',
    icon: MessageSquare,
    tone: '#a78bfa',
    input: {
      doubtId: 'd-003',
      source: 'slack',
      author: 'Dani Okafor',
      quote:
        'The KMS migration never actually happened. config.ts still has the staging password — please do not put this in the incident log yet.',
      audience: 'all',
      polarity: 'contradicts',
      relevance: 0.97,
      channel: '#security',
    },
  },
  {
    id: 'hotfix-commit',
    name: 'Last-minute hotfix',
    blurb: 'A 01:48 commit reintroduces the datastore conflict.',
    icon: GitBranch,
    tone: '#e4e4e7',
    input: {
      doubtId: 'd-001',
      source: 'github',
      author: 'Marcus Webb',
      quote:
        'hotfix(api): restore Supabase client behind FIREBASE=0 flag to unblock checkout',
      audience: 'junior',
      polarity: 'contradicts',
      relevance: 0.92,
      channel: 'PR #431 · hotfix',
      filePath: 'services/api/db.ts',
      commit: 'PR #431',
    },
  },
  {
    id: 'broken-pr',
    name: 'Broken PR revert',
    blurb: 'A revert silently drops billing backoff again.',
    icon: AlertTriangle,
    tone: '#f97316',
    input: {
      doubtId: 'd-004',
      source: 'github',
      author: 'Sam Ortiz',
      quote:
        'revert: drop retry backoff again — the new schedule blocked checkout during the flash sale',
      audience: 'junior',
      polarity: 'contradicts',
      relevance: 0.94,
      channel: 'PR #429 · revert',
      filePath: 'services/billing/webhook.ts',
      commit: 'PR #429',
    },
  },
  {
    id: 'ci-failure',
    name: 'CI failure log',
    blurb: 'The build itself proves the Node mismatch.',
    icon: Code2,
    tone: '#34d399',
    input: {
      doubtId: 'd-005',
      source: 'code',
      author: 'CI Bot',
      quote:
        'Error: package requires node >=20 but runner is node 18.x. Deployment aborted after 4m12s.',
      audience: 'all',
      polarity: 'contradicts',
      relevance: 0.96,
      channel: '.github/workflows/ci.yml · run 8841',
      filePath: '.github/workflows/ci.yml',
      commit: 'run 8841',
    },
  },
  {
    id: 'ghost-bucket',
    name: 'Ghost bucket sighting',
    blurb: 'The outgoing engineer confirms the bucket still holds data.',
    icon: Radio,
    tone: '#60a5fa',
    input: {
      doubtId: 'd-002',
      source: 'slack',
      author: 'Tobias Klein',
      quote:
        'I checked my personal bucket — it still has three weeks of production exports. I assumed someone would clean it up.',
      audience: 'all',
      polarity: 'contradicts',
      relevance: 0.95,
      channel: '#ops-urgent',
    },
  },
];

const SOURCES: EvidenceSource[] = [
  'slack',
  'github',
  'notion',
  'jira',
  'code',
  'email',
];

const POLARITIES: EvidencePolarity[] = ['contradicts', 'context', 'supports'];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-200 outline-none transition focus:border-zinc-600';

export function ChaosConsole() {
  const open = useConsole((s) => s.chaosOpen);
  const setOpen = useConsole((s) => s.setChaosOpen);
  const doubts = useTriage((s) => s.doubts);
  const role = useTriage((s) => s.role);
  const meta = useTriage((s) => s.meta);
  const pendingAction = useTriage((s) => s.pendingAction);
  const injectSignal = useTriage((s) => s.injectSignal);

  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [form, setForm] = useState<SignalInput>(PRESETS[0].input);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const used =
    (meta?.injectedSignals ?? 0) + (meta?.injectedSignalsLocked ?? 0);
  const remaining = Math.max(0, MAX_SIGNALS_PER_SESSION - used);

  const target = doubts.find((doubt) => doubt.id === form.doubtId) ?? doubts[0];

  const preview = useMemo(() => {
    if (!target) return null;
    const existing = target.evidence
      .filter((evidence) => evidence.injected)
      .map((evidence) => ({
        polarity: evidence.polarity ?? 'context',
        relevance: evidence.relevance,
        injected: true,
      }));
    const base = target.synthesis?.baseConfidence ?? target.confidence;
    const visible = form.audience === 'all' || form.audience === role;
    const projected = visible
      ? projectConfidence(base, [
          ...existing,
          {
            polarity: form.polarity,
            relevance: form.relevance,
            injected: true,
          },
        ])
      : target.confidence;
    return {
      base,
      current: target.confidence,
      projected,
      delta: projected - target.confidence,
      visible,
      target,
    };
  }, [target, form.audience, form.polarity, form.relevance, role]);

  if (!open) return null;

  function applyPreset(preset: Preset) {
    setPresetId(preset.id);
    setForm(preset.input);
  }

  function update<K extends keyof SignalInput>(key: K, value: SignalInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (submitting || pendingAction) return;
    if (!form.quote.trim()) return;
    setSubmitting(true);
    const result = await injectSignal(form);
    setSubmitting(false);
    if (result) setOpen(false);
  }

  const busy = submitting || pendingAction !== null;
  const audienceRole = form.audience as Role | 'all';

  return (
    <div
      className="fixed inset-0 z-[105] flex justify-end bg-zinc-950/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Inject a live signal"
        className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-[-40px_0_120px_-40px_rgba(0,0,0,1)] animate-in slide-in-from-right duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-4 sm:px-5">
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.2em] text-amber-300">
              <Zap className="size-3.5" aria-hidden />
              live chaos injection
            </p>
            <h2 className="mt-1.5 text-[19px] font-semibold tracking-tight text-zinc-100">
              Drop a signal into the handover.
            </h2>
            <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-zinc-500">
              Relay validates it server-side, recomputes confidence with a
              deterministic formula, and rewires the Blast Radius graph. This
              session only — the seeded 24-source dataset is untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
            aria-label="Close chaos console"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
              presets
            </p>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
              {used}/{MAX_SIGNALS_PER_SESSION} signals used
            </span>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={[
                    'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition',
                    active
                      ? 'border-amber-500/40 bg-amber-500/[0.07]'
                      : 'border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60',
                  ].join(' ')}
                >
                  <Icon
                    className="mt-0.5 size-3.5 shrink-0"
                    style={{ color: preset.tone }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[10.5px] font-medium text-zinc-200">
                      {preset.name}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] leading-snug text-zinc-500">
                      {preset.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2">
            <Field label="target doubt">
              <select
                value={form.doubtId}
                onChange={(event) => update('doubtId', event.target.value)}
                className={INPUT_CLASS}
              >
                {doubts.map((doubt) => (
                  <option key={doubt.id} value={doubt.id}>
                    {doubt.id} · {doubt.area} — {doubt.title}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="source">
                <select
                  value={form.source}
                  onChange={(event) =>
                    update('source', event.target.value as EvidenceSource)
                  }
                  className={INPUT_CLASS}
                >
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="author">
                <input
                  value={form.author}
                  onChange={(event) => update('author', event.target.value)}
                  maxLength={80}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="signal text">
              <textarea
                value={form.quote}
                onChange={(event) => update('quote', event.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Paste a rogue Slack message, a hotfix commit message, a CI failure…"
                className={`${INPUT_CLASS} resize-y leading-relaxed`}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="polarity">
                <select
                  value={form.polarity}
                  onChange={(event) =>
                    update('polarity', event.target.value as EvidencePolarity)
                  }
                  className={INPUT_CLASS}
                >
                  {POLARITIES.map((polarity) => (
                    <option key={polarity} value={polarity}>
                      {polarity}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="audience boundary">
                <select
                  value={form.audience}
                  onChange={(event) =>
                    update(
                      'audience',
                      event.target.value as SignalInput['audience'],
                    )
                  }
                  className={INPUT_CLASS}
                >
                  <option value="all">all lenses</option>
                  <option value="junior">developer only</option>
                  <option value="manager">manager only</option>
                </select>
              </Field>
            </div>

            <Field label={`relevance · ${Math.round(form.relevance * 100)}%`}>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={form.relevance}
                onChange={(event) =>
                  update('relevance', Number(event.target.value))
                }
                className="accent-amber-400"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="channel">
                <input
                  value={form.channel ?? ''}
                  onChange={(event) => update('channel', event.target.value)}
                  maxLength={80}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="file path (developer lens)">
                <input
                  value={form.filePath ?? ''}
                  onChange={(event) => update('filePath', event.target.value)}
                  maxLength={200}
                  placeholder="services/api/config.ts"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
          </div>

          {preview && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-amber-300" aria-hidden />
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-300">
                  deterministic synthesis preview
                </p>
                <span className="ml-auto font-mono text-[9px] text-zinc-500">
                  {preview.target.id}
                </span>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <span className="font-mono text-[22px] font-medium text-zinc-100">
                  {Math.round(preview.current * 100)}%
                </span>
                <ArrowRight className="mb-1 size-3.5 text-zinc-600" aria-hidden />
                <span className="font-mono text-[22px] font-medium text-amber-300">
                  {Math.round(preview.projected * 100)}%
                </span>
                <span
                  className={[
                    'mb-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px]',
                    preview.delta >= 0
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300',
                  ].join(' ')}
                >
                  {formatDelta(preview.delta)} pts
                </span>
                <span className="ml-auto mb-1 font-mono text-[8px] text-zinc-600">
                  base {Math.round(preview.base * 100)}%
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                {preview.visible ? (
                  <>
                    This signal will be visible in the <strong className="text-zinc-300">{role}</strong>{' '}
                    lens and will add one node to the Blast Radius graph.
                  </>
                ) : (
                  <>
                    Stored with audience <strong className="text-zinc-300">{audienceRole}</strong>.
                    Your current <strong className="text-zinc-300">{role}</strong> lens
                    will not receive it — switch roles to reveal it. That is the
                    permission boundary working live.
                  </>
                )}
              </p>
            </div>
          )}

          {remaining === 0 && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-2.5 py-2 text-[10px] text-red-300">
              Signal budget reached for this session. Reset the demo to start a
              fresh handover.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800/80 px-4 py-3 sm:px-5">
          <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
            <Lock className="size-3" aria-hidden />
            audience-scoped · server-validated
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || remaining === 0 || !form.quote.trim()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-[11.5px] font-semibold text-amber-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? (
              <Radio className="size-3.5 animate-pulse" aria-hidden />
            ) : (
              <Send className="size-3.5" aria-hidden />
            )}
            {busy ? 'synthesising…' : 'Inject signal'}
          </button>
        </div>
      </aside>
    </div>
  );
}
