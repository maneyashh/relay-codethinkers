'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

import type {
  BoardMeta,
  BoardResponse,
  DecisionInput,
  FastForwardResponse,
  SignalInput,
  SignalResponse,
  SynthesisResult,
  TriageBoard,
} from '@/lib/api-types';
import type {
  AppView,
  Doubt,
  Evidence,
  Resolution,
  Reward,
  Role,
  Severity,
} from '@/lib/triage-types';

export type {
  AppView,
  DecisionType,
  Doubt,
  DoubtDecision,
  DoubtKind,
  DoubtStatus,
  Evidence,
  EvidencePolarity,
  EvidenceSource,
  Resolution,
  Reward,
  Role,
  Severity,
  VerificationState,
} from '@/lib/triage-types';
export type { SynthesisResult } from '@/lib/api-types';
export { ROLE_LABEL } from '@/lib/triage-types';

/**
 * Defence in depth only. The API has already removed rows this lens may not
 * read, so this filter is a no-op for a well-behaved server. It stays here so a
 * future data source cannot accidentally widen a lens in the browser.
 */
export function evidenceForRole(evidence: Evidence[], role: Role): Evidence[] {
  return evidence.filter(
    (item) =>
      !item.audience || item.audience === 'all' || item.audience === role,
  );
}

/* ------------------------------------------------------------------ */
/* Scoring helpers                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
};

/** Readiness = severity-weighted share of doubts that are resolved (0..100). */
export function computeReadiness(doubts: Doubt[]): number {
  const total = doubts.reduce((sum, doubt) => sum + SEVERITY_WEIGHT[doubt.severity], 0);
  if (total === 0) return 100;
  const done = doubts
    .filter((doubt) => doubt.status === 'resolved')
    .reduce((sum, doubt) => sum + SEVERITY_WEIGHT[doubt.severity], 0);
  return Math.round((done / total) * 100);
}

export const levelFromXp = (xp: number) => Math.floor(xp / 250) + 1;

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `API ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? `API ${response.status}`;
  } catch {
    return text.slice(0, 160);
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Request helper with one transparent session-recovery retry. A serverless
 * cold start can forget the session row; POST /api/session re-establishes it
 * from the signed cookie instead of surfacing a dead 401 to the judge.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const send = () =>
    fetch(path, {
      ...init,
      cache: 'no-store',
      headers: {
        ...JSON_HEADERS,
        ...(init?.headers ?? {}),
      },
    });

  let response = await send();

  if (
    (response.status === 401 || response.status === 404) &&
    path !== '/api/session'
  ) {
    const revived = await fetch('/api/session', {
      method: 'POST',
      cache: 'no-store',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    if (revived.ok) response = await send();
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as T;
}

const requestBoard = (path: string, init?: RequestInit) =>
  requestJson<BoardResponse>(path, init);

function selectAfterLoad(board: TriageBoard, previous: string | null) {
  if (previous && board.doubts.some((doubt) => doubt.id === previous)) {
    return previous;
  }
  return (
    board.doubts.find((doubt) => doubt.status === 'open')?.id ??
    board.doubts[0]?.id ??
    null
  );
}

function boardPatch(
  board: TriageBoard,
  previousSelected: string | null,
): Partial<TriageState> {
  return {
    doubts: board.doubts,
    selectedId: selectAfterLoad(board, previousSelected),
    role: board.session.role,
    xp: board.session.xp,
    streak: board.session.streak,
    readiness: board.session.readiness,
    meta: board.meta,
    sessionId: board.session.id,
    ingestStatus: 'ready',
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type IngestStatus = 'idle' | 'loading' | 'ready' | 'error';

let inflightLoad: Promise<void> | null = null;

interface TriageState {
  view: AppView;
  doubts: Doubt[];
  selectedId: string | null;
  role: Role;
  xp: number;
  readiness: number;
  streak: number;
  lastReward: Reward | null;
  lastSynthesis: SynthesisResult | null;

  ingestStatus: IngestStatus;
  meta: BoardMeta | null;
  sessionId: string | null;
  switchingRole: boolean;
  pendingAction: string | null;
  error: string | null;

  /** Evidence node requested by Ask Relay, a citation chip or the handover. */
  focusEvidenceId: string | null;

  setView: (view: AppView) => void;
  startIngest: () => void;
  loadBoard: () => Promise<void>;
  finishIngest: () => Promise<void>;
  select: (id: string) => void;
  setRole: (role: Role) => Promise<void>;
  move: (dir: 1 | -1) => void;
  resolve: (
    resolutionId: Resolution['id'],
    doubtId?: string,
    decision?: DecisionInput,
  ) => Promise<void>;
  verifyDoubt: (doubtId?: string) => Promise<void>;
  skip: (doubtId?: string) => Promise<void>;
  reopen: (doubtId: string) => Promise<void>;
  injectSignal: (input: SignalInput) => Promise<SignalResponse | null>;
  fastForward: () => Promise<FastForwardResponse | null>;
  focusEvidence: (evidenceId: string | null, doubtId?: string) => void;
  reset: () => Promise<void>;
  clearError: () => void;
  handleKey: (e: KeyboardEvent) => void;
}

export const useTriage = create<TriageState>((set, get) => ({
  view: 'landing',
  doubts: [],
  selectedId: null,
  role: 'junior',
  xp: 0,
  readiness: 0,
  streak: 0,
  lastReward: null,
  lastSynthesis: null,

  ingestStatus: 'idle',
  meta: null,
  sessionId: null,
  switchingRole: false,
  pendingAction: null,
  error: null,
  focusEvidenceId: null,

  setView: (view) => set({ view }),

  startIngest: () =>
    set({
      view: 'ingesting',
      ingestStatus: 'idle',
      error: null,
      lastReward: null,
      lastSynthesis: null,
      focusEvidenceId: null,
    }),

  /**
   * Establishes/receives the signed session and loads the role-filtered board.
   * The ingestion animation awaits this promise before it can transition.
   */
  loadBoard: () => {
    if (inflightLoad) return inflightLoad;

    inflightLoad = (async () => {
      set({ ingestStatus: 'loading', error: null });
      try {
        const data = await requestBoard('/api/session', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        set((state) => boardPatch(data.board, state.selectedId));
      } catch (error) {
        set({
          ingestStatus: 'error',
          error: error instanceof Error ? error.message : 'Unable to load board',
        });
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  },

  finishIngest: async () => {
    if (get().ingestStatus !== 'ready') {
      await get().loadBoard();
    }
    if (get().ingestStatus === 'ready') {
      set({ view: 'triage' });
    }
  },

  select: (id) => set({ selectedId: id, focusEvidenceId: null }),

  setRole: async (role) => {
    if (get().switchingRole) return;
    if (role === get().role && get().ingestStatus === 'ready') return;

    // Never flip the local lens optimistically: we only show the new role after
    // the server has returned the matching projection.
    set({ switchingRole: true, error: null });
    try {
      const data = await requestBoard('/api/session', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      set((state) => ({
        ...boardPatch(data.board, state.selectedId),
        switchingRole: false,
        lastReward: null,
        lastSynthesis: null,
        focusEvidenceId: null,
      }));
    } catch (error) {
      set({
        switchingRole: false,
        error: error instanceof Error ? error.message : 'Unable to switch role',
      });
    }
  },

  move: (dir) => {
    const { doubts, selectedId } = get();
    if (doubts.length === 0) return;
    const index = doubts.findIndex((doubt) => doubt.id === selectedId);
    const next = Math.min(
      doubts.length - 1,
      Math.max(0, (index === -1 ? 0 : index) + dir),
    );
    set({ selectedId: doubts[next].id, focusEvidenceId: null });
  },

  resolve: async (resolutionId, doubtId, decision) => {
    const id = doubtId ?? get().selectedId;
    if (!id || get().pendingAction) return;

    set({ pendingAction: `resolve:${id}`, error: null, lastReward: null });
    try {
      const data = await requestBoard(`/api/doubts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'resolve',
          resolutionId,
          ...(decision ?? {}),
        }),
      });
      set((state) => ({
        ...boardPatch(data.board, state.selectedId),
        pendingAction: null,
        lastReward: data.reward ?? null,
        // Stay on the board so the human can attach verification to the
        // decision they just made. The MissionBar and TopBar surface the
        // Handover artifact once readiness reaches 100.
        view: 'triage',
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Unable to resolve doubt',
      });
    }
  },

  verifyDoubt: async (doubtId) => {
    const id = doubtId ?? get().selectedId;
    if (!id || get().pendingAction) return;

    set({ pendingAction: `verify:${id}`, error: null, lastReward: null });
    try {
      const data = await requestBoard(`/api/doubts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'verify' }),
      });
      set((state) => ({
        ...boardPatch(data.board, state.selectedId),
        pendingAction: null,
        lastReward: data.reward ?? null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : 'Unable to verify doubt',
      });
    }
  },

  skip: async (doubtId) => {
    const id = doubtId ?? get().selectedId;
    if (!id || get().pendingAction) return;

    set({ pendingAction: `skip:${id}`, error: null });
    try {
      const data = await requestBoard(`/api/doubts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'skip' }),
      });
      set((state) => ({
        ...boardPatch(data.board, state.selectedId),
        pendingAction: null,
        lastReward: null,
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Unable to skip doubt',
      });
    }
  },

  reopen: async (doubtId) => {
    if (get().pendingAction) return;

    set({ pendingAction: `reopen:${doubtId}`, error: null });
    try {
      const data = await requestBoard(
        `/api/doubts/${encodeURIComponent(doubtId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'reopen' }),
        },
      );
      set({
        ...boardPatch(data.board, doubtId),
        pendingAction: null,
        lastReward: null,
        view: 'triage',
      });
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Unable to reopen doubt',
      });
    }
  },

  injectSignal: async (input) => {
    if (get().pendingAction) return null;

    set({ pendingAction: 'inject-signal', error: null, lastReward: null });
    try {
      const data = await requestJson<SignalResponse>('/api/signals', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      set({
        ...boardPatch(data.board, input.doubtId),
        pendingAction: null,
        lastSynthesis: data.synthesis,
        selectedId: input.doubtId,
        focusEvidenceId: null,
      });
      return data;
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : 'Unable to inject signal',
      });
      return null;
    }
  },

  fastForward: async () => {
    if (get().pendingAction) return null;

    set({ pendingAction: 'fast-forward', error: null, lastReward: null });
    try {
      const data = await requestJson<FastForwardResponse>(
        '/api/triage/fast-forward',
        { method: 'POST', body: '{}' },
      );
      set((state) => ({
        ...boardPatch(data.board, state.selectedId),
        pendingAction: null,
        lastReward: null,
        lastSynthesis: null,
        view: data.board.session.readiness === 100 ? 'complete' : 'triage',
      }));
      return data;
    } catch (error) {
      set({
        pendingAction: null,
        error:
          error instanceof Error ? error.message : 'Unable to fast-forward',
      });
      return null;
    }
  },

  focusEvidence: (evidenceId, doubtId) =>
    set((state) => ({
      focusEvidenceId: evidenceId,
      selectedId: doubtId ?? state.selectedId,
    })),

  reset: async () => {
    set({ pendingAction: 'reset', error: null });
    try {
      await requestBoard('/api/triage/reset', { method: 'POST', body: '{}' });
      set({
        view: 'landing',
        doubts: [],
        selectedId: null,
        xp: 0,
        readiness: 0,
        streak: 0,
        lastReward: null,
        lastSynthesis: null,
        focusEvidenceId: null,
        ingestStatus: 'idle',
        meta: null,
        pendingAction: null,
        error: null,
      });
    } catch (error) {
      set({
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Unable to reset demo',
      });
    }
  },

  clearError: () => set({ error: null }),

  handleKey: (e) => {
    if (get().view !== 'triage') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const element = e.target as HTMLElement | null;
    if (
      element &&
      (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable)
    ) {
      return;
    }

    const { resolve, skip, move } = get();
    switch (e.key.toLowerCase()) {
      case '1':
        void resolve(1);
        break;
      case '2':
        void resolve(2);
        break;
      case '3':
        void resolve(3);
        break;
      case 's':
        void skip();
        break;
      case 'j':
      case 'arrowdown':
        e.preventDefault();
        move(1);
        break;
      case 'k':
      case 'arrowup':
        e.preventDefault();
        move(-1);
        break;
      default:
        return;
    }
  },
}));

/* ------------------------------------------------------------------ */
/* Selectors + hotkey hook                                             */
/* ------------------------------------------------------------------ */

export const selectCurrent = (state: TriageState) =>
  state.doubts.find((doubt) => doubt.id === state.selectedId) ?? null;
export const selectOpenCount = (state: TriageState) =>
  state.doubts.filter((doubt) => doubt.status === 'open').length;

/** Mount once (in app/page.tsx) to enable 1/2/3, S, J/K and arrow keys. */
export function useTriageHotkeys() {
  const handleKey = useTriage((state) => state.handleKey);
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);
}
