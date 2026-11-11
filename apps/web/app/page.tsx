'use client';

import { HandoverComplete } from '@/components/flow/HandoverComplete';
import { IngestView } from '@/components/flow/IngestView';
import { LandingView } from '@/components/flow/LandingView';
import { TriageBoard } from '@/components/triage/TriageBoard';
import { useTriage } from '@/stores/triage';

export default function RelayApp() {
  const view = useTriage((s) => s.view);

  switch (view) {
    case 'ingesting':
      return <IngestView />;
    case 'triage':
      return <TriageBoard />;
    case 'complete':
      return <HandoverComplete />;
    case 'landing':
    default:
      return <LandingView />;
  }
}
