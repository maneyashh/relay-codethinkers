'use client';

import { create } from 'zustand';

import { useTriage } from './triage';

interface ConsoleState {
  chaosOpen: boolean;
  askOpen: boolean;
  securityOpen: boolean;
  helpOpen: boolean;
  day1Open: boolean;

  setChaosOpen: (open: boolean) => void;
  setAskOpen: (open: boolean) => void;
  setSecurityOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setDay1Open: (open: boolean) => void;
  closeAll: () => void;

  /** Jump to a specific evidence node from a citation, anywhere in the app. */
  reveal: (doubtId: string, evidenceId?: string) => void;
}

export const useConsole = create<ConsoleState>((set) => ({
  chaosOpen: false,
  askOpen: false,
  securityOpen: false,
  helpOpen: false,
  day1Open: false,

  setChaosOpen: (chaosOpen) => set({ chaosOpen }),
  setAskOpen: (askOpen) => set({ askOpen }),
  setSecurityOpen: (securityOpen) => set({ securityOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setDay1Open: (day1Open) => set({ day1Open }),
  closeAll: () =>
    set({
      chaosOpen: false,
      askOpen: false,
      securityOpen: false,
      helpOpen: false,
      day1Open: false,
    }),

  reveal: (doubtId, evidenceId) => {
    const triage = useTriage.getState();
    if (triage.view !== 'triage') {
      useTriage.setState({ view: 'triage' });
    }
    triage.focusEvidence(evidenceId ?? null, doubtId);
    set({ chaosOpen: false, askOpen: false, helpOpen: false });
  },
}));
