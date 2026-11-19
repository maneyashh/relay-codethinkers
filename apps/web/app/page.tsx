'use client';

import { HandoverComplete } from '@/components/flow/HandoverComplete';
import { IngestView } from '@/components/flow/IngestView';
import { LandingView } from '@/components/flow/LandingView';
import { JudgeWalkthroughOverlay } from '@/components/triage/JudgeWalkthrough';
import { TriageBoard } from '@/components/triage/TriageBoard';
import { useTriage } from '@/stores/triage';

export default function RelayApp() {
  const view = useTriage((s) => s.view);

  return (
    <>
      {view === 'ingesting' ? (
        <IngestView />
      ) : view === 'triage' ? (
        <TriageBoard />
      ) : view === 'complete' ? (
        <HandoverComplete />
      ) : (
        <LandingView />
      )}
      <JudgeWalkthroughOverlay />
    </>
  );
}
