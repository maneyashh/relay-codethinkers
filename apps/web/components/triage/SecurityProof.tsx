'use client';

import {
  Activity,
  ArrowRight,
  Check,
  Columns3,
  Database,
  EyeOff,
  Fingerprint,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Rows3,
  ScrollText,
  ShieldCheck,
  ShieldX,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type {
  AuditResponse,
  SecurityCheck,
  SecurityProjection,
  SecurityReport,
} from '@/lib/api-types';
import { useConsole } from '@/stores/console';

type TabId = 'boundary' | 'payload' | 'signals' | 'audit';

const TABS: {
  id: TabId;
  label: string;
  icon: typeof ShieldCheck;
}[] = [
  { id: 'boundary', label: 'Boundary', icon: Lock },
  { id: 'payload', label: 'Payload diff', icon: Columns3 },
  { id: 'signals', label: 'Live signals', icon: Zap },
  { id: 'audit', label: 'Audit trail', icon: ScrollText },
];

const CATEGORY_LABEL: Record<SecurityCheck['category'], string> = {
  row: 'Row-level filtering',
  column: 'Column-level filtering',
  session: 'Session integrity',
  synthesis: 'Signal synthesis',
};

const CATEGORY_ICON: Record<SecurityCheck['category'], typeof Rows3> = {
  row: Rows3,
  column: Columns3,
  session: Fingerprint,
  synthesis: Activity,
};

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/60 py-1.5 last:border-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span
        className={[
          'font-mono text-[11.5px] font-medium',
          danger ? 'text-red-400' : 'text-zinc-200',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

function ProjectionCard({
  title,
  accent,
  data,
}: {
  title: string;
  accent: string;
  data: SecurityProjection;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-400">
          {title}
        </p>
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        >
          {data.role}
        </span>
      </div>
      <div className="mt-2">
        <Metric label="evidence delivered" value={data.evidenceDelivered} />
        <Metric label="withheld by SQL" value={data.evidenceWithheld} />
        <Metric
          label="filePath keys"
          value={data.filePathKeys}
          danger={data.role === 'manager' && data.filePathKeys > 0}
        />
        <Metric
          label="commit keys"
          value={data.commitKeys}
          danger={data.role === 'manager' && data.commitKeys > 0}
        />
        <Metric
          label="implementation objects"
          value={data.implementationObjects}
          danger={data.role === 'manager' && data.implementationObjects > 0}
        />
        <Metric label="impact objects" value={data.impactObjects} />
        <Metric
          label="restricted value leaked"
          value={data.restrictedValueLeaked ? 'yes' : 'no'}
          danger={data.role === 'manager' && data.restrictedValueLeaked}
        />
        <Metric
          label="payload"
          value={`${(data.payloadBytes / 1024).toFixed(1)} KB`}
        />
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: SecurityCheck }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-2.5 py-2">
      <span
        className={[
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
          check.pass
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400',
        ].join(' ')}
      >
        {check.pass ? (
          <Check className="size-2.5" aria-hidden />
        ) : (
          <X className="size-2.5" aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[10.5px] leading-snug text-zinc-300">
          {check.label}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[8.5px] text-zinc-600">
          {check.detail}
        </span>
      </span>
    </li>
  );
}

export function SecurityProof() {
  const open = useConsole((s) => s.securityOpen);
  const setOpen = useConsole((s) => s.setSecurityOpen);
  const setChaosOpen = useConsole((s) => s.setChaosOpen);

  const [tab, setTab] = useState<TabId>('boundary');
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuditError(null);
    try {
      const [reportResult, auditResult] = await Promise.allSettled([
        fetch('/api/security/verify', { cache: 'no-store' }),
        fetch('/api/security/audit', { cache: 'no-store' }),
      ]);

      if (
        reportResult.status === 'fulfilled' &&
        reportResult.value.ok
      ) {
        setReport((await reportResult.value.json()) as SecurityReport);
      } else {
        const status =
          reportResult.status === 'fulfilled'
            ? reportResult.value.status
            : 'network';
        throw new Error(`Security probe failed (${status})`);
      }

      if (auditResult.status === 'fulfilled' && auditResult.value.ok) {
        setAudit((await auditResult.value.json()) as AuditResponse);
      } else {
        setAuditError('Audit trail unavailable for this session');
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Security probe failed',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      void load();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, load, setOpen]);

  const grouped = report
    ? (Object.keys(CATEGORY_LABEL) as SecurityCheck['category'][]).map(
        (category) => ({
          category,
          checks: report.checks.filter((check) => check.category === category),
        }),
      )
    : [];

  const passCount = report
    ? report.checks.filter((check) => check.pass).length
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-emerald-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10"
        title="Inspect the server-side role boundary (live API proof)"
        aria-haspopup="dialog"
      >
        <ShieldCheck className="size-3" aria-hidden />
        <span className="hidden xl:inline">API-secured</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-zinc-950/88 p-3 backdrop-blur-sm animate-in fade-in duration-200 sm:p-6"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Security and telemetry inspector"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_60px_160px_-40px_rgba(0,0,0,1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-4 py-4 sm:px-6">
              <div>
                <p className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  live permission proof
                </p>
                <h2 className="mt-2 text-[21px] font-semibold tracking-tight text-zinc-100">
                  The API never sends what the role cannot read.
                </h2>
                <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-zinc-500">
                  Relay runs the probe against both SQL projections. The report
                  contains counts only — no quotes, paths, commits or secrets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
                aria-label="Close security inspector"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800/70 px-3 py-2 sm:px-5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] transition',
                    tab === id
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
                  ].join(' ')}
                >
                  <Icon className="size-3" aria-hidden />
                  {label}
                </button>
              ))}
              <span className="ml-auto hidden items-center gap-1.5 pr-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600 sm:inline-flex">
                <Gauge className="size-3" aria-hidden />
                {report ? `${passCount}/${report.checks.length} assertions` : 'probing'}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {loading && !report && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Loader2
                    className="size-6 animate-spin text-emerald-400"
                    aria-hidden
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    running both SQL projections…
                  </p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
                  <p className="flex items-center gap-2 text-[12px] text-red-300">
                    <ShieldX className="size-4" aria-hidden />
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/10"
                  >
                    <RefreshCw className="size-3" aria-hidden />
                    Retry probe
                  </button>
                </div>
              )}

              {report && !loading && tab === 'boundary' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      {
                        label: 'effective role',
                        value: report.effectiveRole,
                        icon: Lock,
                      },
                      {
                        label: 'session source',
                        value: 'signed cookie',
                        icon: ShieldCheck,
                      },
                      {
                        label: 'forged cookie',
                        value: report.forgedCookieRejected
                          ? 'rejected'
                          : 'accepted',
                        icon: report.forgedCookieRejected ? Check : ShieldX,
                      },
                    ].map(({ label, value, icon: Icon }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                      >
                        <Icon
                          className="size-3.5 text-emerald-400/80"
                          aria-hidden
                        />
                        <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                          {label}
                        </p>
                        <p className="mt-0.5 font-mono text-[11.5px] text-zinc-200">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <ProjectionCard
                      title="Manager projection"
                      accent="#f97316"
                      data={report.manager}
                    />
                    <ProjectionCard
                      title="Developer projection"
                      accent="#34d399"
                      data={report.junior}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {grouped.map(({ category, checks }) => {
                      const Icon = CATEGORY_ICON[category];
                      return (
                        <div
                          key={category}
                          className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3"
                        >
                          <p className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                            <Icon className="size-3" aria-hidden />
                            {CATEGORY_LABEL[category]}
                          </p>
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {checks.map((check) => (
                              <CheckRow key={check.id} check={check} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {report && !loading && tab === 'payload' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      {
                        icon: Database,
                        label: 'evidence rows in DB',
                        value: String(report.receipt.evidenceRowsInDatabase),
                      },
                      {
                        icon: EyeOff,
                        label: 'rows withheld by SQL',
                        value: String(report.receipt.evidenceRowsWithheldBySql),
                      },
                      {
                        icon: KeyRound,
                        label: 'payload bytes saved',
                        value: `${(report.receipt.payloadBytesSaved / 1024).toFixed(1)} KB`,
                      },
                    ].map(({ icon: Icon, label, value }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                      >
                        <Icon
                          className="size-3.5 text-emerald-400/80"
                          aria-hidden
                        />
                        <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                          {label}
                        </p>
                        <p className="mt-0.5 font-mono text-[13px] text-zinc-100">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                      payload size, by lens
                    </p>
                    {[
                      {
                        label: 'Manager',
                        bytes: report.manager.payloadBytes,
                        color: '#f97316',
                        rows: report.manager.evidenceDelivered,
                      },
                      {
                        label: 'Developer',
                        bytes: report.junior.payloadBytes,
                        color: '#34d399',
                        rows: report.junior.evidenceDelivered,
                      },
                    ].map((row) => {
                      const max = Math.max(
                        report.manager.payloadBytes,
                        report.junior.payloadBytes,
                        1,
                      );
                      return (
                        <div key={row.label} className="mt-3">
                          <div className="flex items-baseline justify-between gap-3 font-mono text-[9.5px]">
                            <span className="text-zinc-400">{row.label}</span>
                            <span className="text-zinc-300">
                              {(row.bytes / 1024).toFixed(1)} KB ·{' '}
                              {row.rows} rows
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.max(4, (row.bytes / max) * 100)}%`,
                                backgroundColor: row.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="mt-3 text-[10.5px] leading-relaxed text-zinc-500">
                      The gap is the point: the manager browser receives a
                      smaller, commercially-shaped payload because{' '}
                      <code className="font-mono text-zinc-400">
                        {report.receipt.signalView}
                      </code>{' '}
                      and{' '}
                      <code className="font-mono text-zinc-400">
                        {report.receipt.sqlView}
                      </code>{' '}
                      never select restricted columns.
                    </p>
                  </div>

                  <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                      receipt
                    </p>
                    <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                      <Metric label="SQL view" value={report.receipt.sqlView} />
                      <Metric
                        label="signal view"
                        value={report.receipt.signalView}
                      />
                      <Metric label="session HMAC" value={report.receipt.hmac} />
                      <Metric
                        label="cache-control"
                        value={report.receipt.cacheControl}
                      />
                      <Metric label="storage" value={report.receipt.storage} />
                      <Metric
                        label="role source"
                        value={report.roleSource}
                      />
                    </div>
                  </div>
                </>
              )}

              {report && !loading && tab === 'signals' && (
                <>
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3.5">
                    <div className="flex items-start gap-2">
                      <Zap
                        className="mt-0.5 size-4 shrink-0 text-amber-300"
                        aria-hidden
                      />
                      <div>
                        <p className="text-[12px] font-medium text-amber-100">
                          Injected signals obey the same boundary as seeded
                          evidence.
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                          Every signal is written with an audience. The server
                          re-projects both lenses and fails the assertion if a
                          signal quote crosses to the wrong role.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    {[
                      {
                        label: 'signals in session',
                        value: report.signals.total,
                      },
                      {
                        label: 'manager visible',
                        value: report.signals.managerVisible,
                      },
                      {
                        label: 'developer visible',
                        value: report.signals.juniorVisible,
                      },
                      {
                        label: 'cross-lens leaks',
                        value:
                          report.signals.managerLeaked +
                          report.signals.juniorLeaked,
                        danger:
                          report.signals.managerLeaked +
                            report.signals.juniorLeaked >
                          0,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                      >
                        <p
                          className={[
                            'font-mono text-[20px] font-medium tracking-tight',
                            item.danger ? 'text-red-400' : 'text-zinc-100',
                          ].join(' ')}
                        >
                          {item.value}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {report.signals.total === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-zinc-800/80 p-6 text-center">
                      <Zap
                        className="mx-auto size-5 text-amber-300/80"
                        aria-hidden
                      />
                      <p className="mt-2 text-[12.5px] font-medium text-zinc-200">
                        Isolation is armed, not yet exercised.
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-zinc-500">
                        Inject a signal in this browser session, then reopen this
                        inspector. Relay will show how many rows each lens
                        received and whether any quote crossed the boundary.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setChaosOpen(true);
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-300 transition hover:bg-amber-500/15"
                      >
                        <Zap className="size-3" aria-hidden />
                        inject a signal
                        <ArrowRight className="size-3" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ProjectionCard
                        title="Manager signal view"
                        accent="#f97316"
                        data={report.manager}
                      />
                      <ProjectionCard
                        title="Developer signal view"
                        accent="#34d399"
                        data={report.junior}
                      />
                    </div>
                  )}
                </>
              )}

              {report && !loading && tab === 'audit' && (
                <>
                  {auditError && (
                    <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-200/80">
                      {auditError}
                    </p>
                  )}

                  <div className="grid gap-2 sm:grid-cols-5">
                    {[
                      { label: 'events', value: audit?.counts.total ?? 0 },
                      { label: 'resolves', value: audit?.counts.resolves ?? 0 },
                      { label: 'skips', value: audit?.counts.skips ?? 0 },
                      { label: 'signals', value: audit?.counts.signals ?? 0 },
                      { label: 'decisions', value: audit?.counts.decisions ?? 0 },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                      >
                        <p className="font-mono text-[18px] font-medium tracking-tight text-zinc-100">
                          {item.value}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-500">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800/80">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
                      <p className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
                        <ScrollText className="size-3" aria-hidden />
                        sanitized audit log · newest first
                      </p>
                      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
                        {audit?.role ?? report.effectiveRole} lens
                      </span>
                    </div>
                    <ul className="max-h-72 divide-y divide-zinc-800/60 overflow-y-auto">
                      {(audit?.events ?? []).map((event) => (
                        <li
                          key={event.id}
                          className="flex items-start gap-2 px-3 py-2"
                        >
                          <span
                            className={[
                              'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
                              event.action.includes('signal')
                                ? 'bg-amber-500/10 text-amber-300'
                                : 'bg-emerald-500/10 text-emerald-400',
                            ].join(' ')}
                          >
                            {event.action.includes('signal') ? (
                              <Zap className="size-2.5" aria-hidden />
                            ) : (
                              <Check className="size-2.5" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <code className="font-mono text-[9.5px] text-zinc-300">
                                {event.action}
                              </code>
                              {event.doubtId && (
                                <span className="font-mono text-[8.5px] text-zinc-600">
                                  {event.doubtId}
                                </span>
                              )}
                              <span className="ml-auto font-mono text-[8px] text-zinc-600">
                                {new Date(event.createdAt).toLocaleTimeString(
                                  'en',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  },
                                )}
                              </span>
                            </span>
                            {event.detail && (
                              <span className="mt-0.5 block truncate font-mono text-[8.5px] text-zinc-600">
                                {event.detail}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                      {!auditError && (audit?.events.length ?? 0) === 0 && (
                        <li className="px-3 py-8 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                          no audit events yet · make a decision
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 px-4 py-3 sm:px-6">
              <p className="max-w-lg font-mono text-[8.5px] leading-relaxed uppercase tracking-[0.1em] text-zinc-600">
                {report?.roleSource ?? 'signed session'} · spoof attempt:{' '}
                {report?.spoofAttempted ? 'ignored' : 'none'} ·{' '}
                {report?.auditEvents ?? 0} audit events
              </p>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-50"
              >
                <RefreshCw
                  className={['size-3', loading ? 'animate-spin' : ''].join(' ')}
                  aria-hidden
                />
                Run again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
