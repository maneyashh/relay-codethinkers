'use client';

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Shield,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AskRelay } from '@/components/triage/AskRelay';
import { BlastRadius } from '@/components/triage/BlastRadius';
import { BoundaryPanel } from '@/components/triage/BoundaryPanel';
import { ChaosConsole } from '@/components/triage/ChaosConsole';
import { ClaimPanel } from '@/components/triage/ClaimPanel';
import { ConflictPair } from '@/components/triage/ConflictPair';
import { EngineHint } from '@/components/triage/EngineHint';
import { GitHubIngestStudio } from '@/components/triage/GitHubIngestStudio';
import { QueueRail } from '@/components/triage/QueueRail';
import { RemediationPanel } from '@/components/triage/RemediationPanel';
import { ResolutionCard } from '@/components/triage/ResolutionCard';
import { Shortcuts } from '@/components/triage/Shortcuts';
import { TimelineAxis } from '@/components/triage/TimelineAxis';
import { TopBar } from '@/components/triage/TopBar';

import {
  evidenceForRole,
  selectCurrent,
  useTriage,
  useTriageHotkeys,
} from '@/stores/triage';
import type { Doubt, Evidence, Role } from '@/stores/triage';

type DetailTab = 'blast' | 'remediation' | 'security';

const DETAIL_TABS: Array<{
  id: DetailTab;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'blast', label: 'Blast radius', icon: Layers },
  { id: 'remediation', label: 'Remediation', icon: Wrench },
  { id: 'security', label: 'Security', icon: Shield },
];

export function TriageBoard() {
  useTriageHotkeys();

  const doubts = useTriage((s) => s.doubts);
  const current = useTriage(selectCurrent);
  const role = useTriage((s) => s.role);
  const readiness = useTriage((s) => s.readiness);
  const lastReward = useTriage((s) => s.lastReward);
  const select = useTriage((s) => s.select);
  const move = useTriage((s) => s.move);
  const reset = useTriage((s) => s.reset);
  const pendingAction = useTriage((s) => s.pendingAction);
  const error = useTriage((s) => s.error);
  const clearError = useTriage((s) => s.clearError);
  const focusEvidenceId = useTriage((s) => s.focusEvidenceId);
  const focusMode = useTriage((s) => s.focusMode);

  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<DetailTab>('blast');

  const guided = focusMode === 'guided';
  const busy = pendingAction !== null;
  const currentIndex = doubts.findIndex((doubt) => doubt.id === current?.id);
  const resolvedCount = doubts.filter((d) => d.status === 'resolved').length;
  const visibleEvidence = current
    ? evidenceForRole(current.evidence, role)
    : [];
  const hiddenEvidenceCount = current
    ? (current.lockedEvidence ??
      current.evidence.length - visibleEvidence.length)
    : 0;
  const selectedEvidence =
    visibleEvidence.find(
      (item) => item.id === (focusEvidenceId ?? selectedEvidenceId),
    ) ?? null;

  // Clear the floating "+XP" toast after a moment.
  useEffect(() => {
    if (!lastReward) return;
    const timer = setTimeout(
      () => useTriage.setState({ lastReward: null }),
      1600,
    );
    return () => clearTimeout(timer);
  }, [lastReward]);

  // Ask Relay and the handover citation chips trade an evidence id for a real
  // scroll position. The citation also highlights the row while it is active;
  // we clear it afterwards so the same citation can retrigger.
  useEffect(() => {
    if (!focusEvidenceId) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`evidence-${focusEvidenceId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = window.setTimeout(() => {
      if (useTriage.getState().focusEvidenceId === focusEvidenceId) {
        useTriage.setState({ focusEvidenceId: null });
      }
    }, 1600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusEvidenceId, current?.id]);

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-[#07080C] text-zinc-100 antialiased selection:bg-zinc-700/60 animate-in fade-in duration-500"
      style={{ fontFamily: 'var(--font-geist-sans)' }}
    >
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {current && !guided && (
          <aside
            data-guide="queue-rail"
            className="hidden min-h-0 w-[30%] min-w-[248px] max-w-[380px] shrink-0 flex-col border-r border-white/[0.06] bg-[#08090d] lg:flex"
          >
            <QueueRail
              doubts={doubts}
              selectedId={current.id}
              onSelect={select}
            />
          </aside>
        )}

        {current ? (
          <main className="relative min-h-0 flex-1 overflow-y-auto">
            {guided ? (
              <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-36 pt-10 sm:px-8 sm:pt-14">
                <NarrativeColumn
                  current={current}
                  role={role}
                  visibleEvidence={visibleEvidence}
                  hiddenEvidenceCount={hiddenEvidenceCount}
                  selectedEvidence={selectedEvidence}
                  onSelectEvidence={setSelectedEvidenceId}
                  tab={tab}
                  onTab={setTab}
                  showTabs
                />
              </div>
            ) : (
              <div className="mx-auto grid w-full max-w-[1560px] grid-cols-1 items-start xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
                <div className="flex flex-col px-5 pb-24 pt-10 sm:px-8 sm:pt-12">
                  <NarrativeColumn
                    current={current}
                    role={role}
                    visibleEvidence={visibleEvidence}
                    hiddenEvidenceCount={hiddenEvidenceCount}
                    selectedEvidence={selectedEvidence}
                    onSelectEvidence={setSelectedEvidenceId}
                    tab={tab}
                    onTab={setTab}
                    showTabs={false}
                  />
                </div>

                <aside
                  aria-label="Live telemetry"
                  data-guide="telemetry"
                  className="hidden flex-col gap-4 border-l border-white/[0.06] px-6 pb-24 pt-12 xl:flex"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-amber-300/80">
                        Live telemetry
                      </p>
                      <p className="mt-1.5 text-[12.5px] text-zinc-500">
                        Everything the engine sees, expanded.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-500 ring-1 ring-white/[0.06]">
                      war-room
                    </span>
                  </div>

                  <BlastRadius
                    doubt={current}
                    role={role}
                    selectedId={selectedEvidence?.id ?? null}
                    onSelect={setSelectedEvidenceId}
                  />
                  <RemediationPanel
                    key={`${current.id}:${role}`}
                    doubt={current}
                    role={role}
                    hideDispatch={current.status === 'resolved'}
                  />
                  <BoundaryPanel
                    role={role}
                    visible={visibleEvidence.length}
                    hidden={hiddenEvidenceCount}
                  />
                </aside>
              </div>
            )}

            {/* Focus Mode's only persistent chrome: a floating pager. */}
            <div
              className={[
                'pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 sm:justify-end sm:px-6',
                guided ? '' : 'xl:hidden',
              ].join(' ')}
            >
              <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full bg-[#0a0b10]/92 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,1)] ring-1 ring-white/[0.09] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => move(-1)}
                  disabled={currentIndex <= 0 || busy}
                  aria-label="Previous contradiction"
                  title="Previous contradiction · K"
                  className="grid size-6 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100 disabled:opacity-25 sm:size-7"
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                </button>
                <span className="flex items-baseline gap-1.5 px-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] sm:px-2 sm:text-[9px]">
                  <span className="tabular-nums text-zinc-200">
                    {currentIndex + 1} of {doubts.length}
                  </span>
                  <span className="size-[2px] rounded-full bg-zinc-700" aria-hidden />
                  <span className="tabular-nums text-emerald-300/90">
                    {resolvedCount} resolved
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => move(1)}
                  disabled={currentIndex >= doubts.length - 1 || busy}
                  aria-label="Next contradiction"
                  title="Next contradiction · J"
                  className="grid size-6 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100 disabled:opacity-25 sm:size-7"
                >
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </main>
        ) : (
          <main className="flex flex-1 items-center justify-center px-6 py-16">
            <div className="w-full max-w-sm rounded-[28px] bg-white/[0.025] px-7 py-8 text-center ring-1 ring-white/[0.07]">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
                <Check className="size-4" aria-hidden />
              </div>
              <h2 className="mt-4 text-[19px] font-semibold tracking-[-0.02em] text-zinc-100">
                Queue cleared
              </h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">
                Every contradiction has been resolved or skipped. Handover
                readiness is{' '}
                <span className="font-mono tabular-nums text-zinc-200">
                  {readiness}%
                </span>
                .
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {readiness === 100 && (
                  <button
                    type="button"
                    onClick={() => useTriage.getState().setView('complete')}
                    className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.99]"
                  >
                    Open handover artifact
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void reset()}
                  disabled={busy}
                  className="inline-flex h-9 items-center justify-center rounded-full font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500 ring-1 ring-white/[0.08] transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-wait disabled:opacity-50"
                >
                  Reset session
                </button>
              </div>
            </div>
          </main>
        )}
      </div>

      {lastReward && (
        <div
          key={lastReward.key}
          className="pointer-events-none fixed left-1/2 top-[72px] z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 rounded-full bg-emerald-400/10 px-3.5 py-1.5 font-mono text-[11px] tabular-nums text-emerald-300 shadow-[0_18px_40px_-16px_rgba(0,0,0,1)] ring-1 ring-emerald-400/25 backdrop-blur-xl"
        >
          +{lastReward.amount} XP
        </div>
      )}

      <ChaosConsole />
      <AskRelay />
      <Shortcuts />
      <GitHubIngestStudio />

      {error && (
        <div className="fixed bottom-5 left-5 z-50 flex max-w-sm items-start gap-2 rounded-2xl bg-red-500/[0.09] px-3 py-2.5 text-[11px] leading-snug text-red-200 shadow-[0_24px_60px_-24px_rgba(0,0,0,1)] ring-1 ring-red-500/25 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-red-400"
            aria-hidden
          />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-red-400/70 transition hover:text-red-200"
            aria-label="Dismiss error"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

    </div>
  );
}

/**
 * One unbroken reading flow: contradiction → evidence → decision → telemetry.
 * It is rendered identically in both modes; only the second telemetry location
 * changes, so switching modes never remounts the resolution card.
 */
function NarrativeColumn({
  current,
  role,
  visibleEvidence,
  hiddenEvidenceCount,
  selectedEvidence,
  onSelectEvidence,
  tab,
  onTab,
  showTabs,
}: {
  current: Doubt;
  role: Role;
  visibleEvidence: Evidence[];
  hiddenEvidenceCount: number;
  selectedEvidence: Evidence | null;
  onSelectEvidence: (id: string | null) => void;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  showTabs: boolean;
}) {
  return (
    <>
      <div id="guided-claim" data-guide="claim" className="scroll-mt-24">
        <ClaimPanel doubt={current} role={role} />
        <EngineHint
          hint={current.engineHint}
          confidence={current.confidence}
          role={role}
        />
      </div>

      <div
        id="guided-conflict"
        data-guide="conflict"
        className="mt-10 scroll-mt-24 border-t border-white/[0.06] pt-10"
      >
        <ConflictPair
          doubt={current}
          role={role}
          evidence={visibleEvidence}
          hiddenCount={hiddenEvidenceCount}
        />
        <div className="mt-6">
          <TimelineAxis evidence={visibleEvidence} />
        </div>
      </div>

      <div id="guided-decision" className="mt-10 scroll-mt-24">
        <ResolutionCard
          key={`${current.id}:${role}`}
          doubt={current}
          role={role}
        />
      </div>

      <div
        className={[
          'mt-6 flex flex-col',
          showTabs ? '' : 'xl:hidden',
        ].join(' ')}
      >
        <div
          className="inline-flex flex-wrap items-center gap-0.5 self-start rounded-full bg-white/[0.03] p-0.5 ring-1 ring-white/[0.06]"
          role="tablist"
          aria-label="Secondary telemetry"
        >
          {DETAIL_TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                data-guide={id === 'remediation' ? 'remediation-tab' : undefined}
                onClick={() => onTab(id)}
                className={[
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-3 transition-colors duration-200',
                  active
                    ? 'bg-white/[0.09] text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-200',
                ].join(' ')}
              >
                <Icon className="size-3" aria-hidden />
                <span className="text-[10.5px] font-medium tracking-[-0.005em]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 animate-in fade-in duration-200">
          {tab === 'blast' && (
            <BlastRadius
              doubt={current}
              role={role}
              selectedId={selectedEvidence?.id ?? null}
              onSelect={onSelectEvidence}
            />
          )}
          {tab === 'remediation' && (
            <RemediationPanel
              key={`${current.id}:${role}`}
              doubt={current}
              role={role}
              hideDispatch={current.status === 'resolved'}
            />
          )}
          {tab === 'security' && (
            <BoundaryPanel
              role={role}
              visible={visibleEvidence.length}
              hidden={hiddenEvidenceCount}
            />
          )}
        </div>
      </div>
    </>
  );
}
