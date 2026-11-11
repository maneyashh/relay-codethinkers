import type { EvidencePolarity, Role } from './triage-types';

/**
 * Relay's confidence synthesis is deliberately deterministic.
 *
 * There is no model call and no randomness: a live signal contributes a fixed,
 * explainable mass based on its polarity and the analyst-assigned relevance.
 * The same function runs on the server (source of truth) and in the browser
 * (live preview inside the Chaos Console).
 */
export interface SignalContribution {
  polarity: EvidencePolarity;
  relevance?: number;
  audience?: Role | 'all';
  injected?: boolean;
}

export const MAX_SIGNALS_PER_SESSION = 12;

export const SIGNAL_WEIGHT: Record<EvidencePolarity, number> = {
  contradicts: 0.1,
  context: 0.03,
  supports: -0.06,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fixed mass contributed by one injected source. */
export function signalWeight(signal: SignalContribution): number {
  const relevance = clamp(signal.relevance ?? 0.5, 0, 1);
  return SIGNAL_WEIGHT[signal.polarity] * relevance;
}

export function projectConfidence(
  baseConfidence: number,
  signals: SignalContribution[],
): number {
  const injected = signals.filter((signal) => signal.injected !== false);
  const delta = injected.reduce((sum, signal) => sum + signalWeight(signal), 0);
  return clamp(baseConfidence + delta, 0.45, 0.995);
}

export function confidenceDelta(
  baseConfidence: number,
  signals: SignalContribution[],
): number {
  return projectConfidence(baseConfidence, signals) - baseConfidence;
}

export function synthesisFormula(
  baseConfidence: number,
  signals: SignalContribution[],
): string {
  const injected = signals.filter((signal) => signal.injected !== false);
  if (injected.length === 0) {
    return `seed confidence ${(baseConfidence * 100).toFixed(0)}% · no injected signals`;
  }

  const terms = injected.map((signal) => {
    const weight = signalWeight(signal);
    return `${weight >= 0 ? '+' : '−'}${Math.abs(weight * 100).toFixed(1)}`;
  });

  const projected = projectConfidence(baseConfidence, injected);
  return `${(baseConfidence * 100).toFixed(0)}% ${terms.join(' ')} = ${(projected * 100).toFixed(1)}%`;
}

export function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.0005) return '±0';
  const points = Math.abs(delta * 100);
  return `${delta > 0 ? '+' : '−'}${points.toFixed(points < 1 ? 1 : 0)}`;
}
