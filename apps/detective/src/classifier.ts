/**
 * Classify test results: normalized thresholds → type, severity level, confidence.
 *
 * Type and severity come from an observer-model fit (see cvdModel.ts): every
 * candidate type × Machado severity predicts a threshold on all three axes,
 * and the candidate that best explains the measured (hesitation-weighted)
 * thresholds wins. Under Machado, a protan's protan-axis threshold is *lower*
 * than its deutan-axis threshold, so a "higher axis = your type" ratio rule
 * calls most protans deutan; the fit compares whole patterns instead.
 * Protan vs deutan is decided by the fit margin: a small margin → rg_uncertain.
 */

import type { ConfusionAxis } from '@cvd-tools/color-core';
import type { CVDParams, DeviceClass } from '@cvd-tools/color-core';
import type { StaircaseState, AxisState } from './staircase.js';
import { getAllThresholds, getMaxOffsets, rtBaseline, computeThreshold } from './staircase.js';
import { fitObserverModel, type ModelFit } from './cvdModel.js';

export interface ClassificationResult {
  type: CVDParams['type'];
  level: CVDParams['level'];
  severity: number;
  confidence: CVDParams['confidence'];
  thresholds: Record<ConfusionAxis, number>;
  normalizedThresholds: Record<ConfusionAxis, number>;
  maxOffsets: Record<ConfusionAxis, number>;
  /** Present only when the run carried reaction times */
  hesitation: HesitationSummary | null;
  /** Observer-model fit behind the type/severity call (absent when every axis is in the normal range) */
  fit: ModelFit | null;
}

export interface HesitationSummary {
  baselineRtMs: number | null;
  /** Share of correct answers in each axis's threshold region that were hesitant */
  hesitantShare: Record<ConfusionAxis, number>;
  /** Same, pooled over the protan and deutan axes */
  rgHesitantShare: number;
  /** rg_uncertain only because hesitant answers were discounted: unweighted thresholds would have named protan or deutan */
  downgraded: boolean;
}

const NORMAL_UPPER_LIMIT = 0.10;

/**
 * Fit-error difference (−2·log-likelihood units) between the best protan and
 * best deutan explanation needed to name one of them; below it → rg_uncertain.
 * Chosen from simulated observers: at Machado severity 0.6 the two types are
 * barely separable on three axes, and 0.5 keeps wrong calls under 10% there.
 */
const RG_MARGIN = 0.5;
/** Below this margin a protan/deutan call is reported with low confidence. */
const RG_MARGIN_MEDIUM = 1.5;
/** Margin from which a protan/deutan call can keep "high" confidence. */
const RG_MARGIN_HIGH = 4;
/** Pooled red-green hesitant share that lowers confidence one step. */
const HESITANT_CONFIDENCE_SHARE = 0.25;
/** Best-fit error above which no candidate explains the data well (χ², 3 axes, p≈0.01). */
const POOR_FIT_ERROR = 12;

function summarizeHesitation(state: StaircaseState): HesitationSummary | null {
  if (!state.rtCorrect || state.rtCorrect.length === 0) return null;
  const share = (a: StaircaseState['axes'][ConfusionAxis]) =>
    a.regionCorrect > 0 ? a.regionHesitant / a.regionCorrect : 0;
  const { protan, deutan, tritan } = state.axes;
  const rgCorrect = protan.regionCorrect + deutan.regionCorrect;
  const baseline = rtBaseline(state);
  return {
    baselineRtMs: baseline === null ? null : Math.round(baseline),
    hesitantShare: { protan: share(protan), deutan: share(deutan), tritan: share(tritan) },
    rgHesitantShare: rgCorrect > 0 ? (protan.regionHesitant + deutan.regionHesitant) / rgCorrect : 0,
    downgraded: false,
  };
}

function normalizeThreshold(threshold: number, maxOffset: number): number {
  if (maxOffset <= 0) return 1;
  return Math.min(1, threshold / maxOffset);
}

/** Machado severity → level, matching the severity bands of earlier versions. */
function toLevel(severity: number): CVDParams['level'] {
  if (severity <= 0) return 'none';
  if (severity < 0.4) return 'mild';
  if (severity < 0.7) return 'moderate';
  return 'severe';
}

/**
 * How much to trust an axis's threshold: the summed confidence weight of the
 * reversals it was averaged over, relative to a full set of 6.
 */
function axisReliability(a: AxisState, unweighted: boolean): number {
  if (a.reversals.length < 4) return 0.25;
  const w = unweighted ? [] : (a.reversalWeights ?? []).slice(-6);
  const sum = a.reversals.slice(-6).reduce((s, _, i) => s + (w[i] ?? 1), 0);
  return Math.min(1, Math.max(0.25, sum / 6));
}

function normalizedThresholds(
  state: StaircaseState, maxOffsets: Record<ConfusionAxis, number>, unweighted: boolean,
): Record<ConfusionAxis, number> {
  const n = (axis: ConfusionAxis) => normalizeThreshold(computeThreshold(state.axes[axis], unweighted), maxOffsets[axis]);
  return { protan: n('protan'), deutan: n('deutan'), tritan: n('tritan') };
}

interface Decision {
  type: CVDParams['type'];
  severity: number;
  fit: ModelFit | null;
  /** |protan vs deutan fit margin|; Infinity when the call was not red-green */
  rgMargin: number;
}

function decide(norm: Record<ConfusionAxis, number>, state: StaircaseState, unweighted: boolean): Decision {
  if (!Object.values(norm).some(n => n > NORMAL_UPPER_LIMIT)) {
    return { type: 'normal', severity: 0, fit: null, rgMargin: Infinity };
  }
  const fit = fitObserverModel(norm, {
    protan: axisReliability(state.axes.protan, unweighted),
    deutan: axisReliability(state.axes.deutan, unweighted),
    tritan: axisReliability(state.axes.tritan, unweighted),
  });
  const { winner, best } = fit;
  if (winner.type === 'normal') return { type: 'normal', severity: 0, fit, rgMargin: Infinity };
  if (winner.type === 'tritan') return { type: 'tritan', severity: winner.severity, fit, rgMargin: Infinity };
  const rgMargin = Math.abs(fit.rgMargin);
  const rgBest = fit.rgMargin >= 0 ? best.protan : best.deutan;
  return {
    type: rgMargin >= RG_MARGIN ? rgBest.type as 'protan' | 'deutan' : 'rg_uncertain',
    severity: rgBest.severity,
    fit,
    rgMargin,
  };
}

const lower = (c: CVDParams['confidence']): CVDParams['confidence'] => (c === 'high' ? 'medium' : 'low');

export function classify(
  state: StaircaseState,
  selfReport: Record<string, unknown> = {},
): ClassificationResult {
  const thresholds = getAllThresholds(state);
  const maxOffsets = getMaxOffsets(state);
  const hesitation = summarizeHesitation(state);

  const norm: Record<ConfusionAxis, number> = {
    protan: normalizeThreshold(thresholds.protan, maxOffsets.protan),
    deutan: normalizeThreshold(thresholds.deutan, maxOffsets.deutan),
    tritan: normalizeThreshold(thresholds.tritan, maxOffsets.tritan),
  };

  const { type, severity, fit, rgMargin } = decide(norm, state, false);

  if (hesitation && type === 'rg_uncertain') {
    const unweighted = decide(normalizedThresholds(state, maxOffsets, true), state, true);
    hesitation.downgraded = unweighted.type === 'protan' || unweighted.type === 'deutan';
  }

  const level = type === 'normal' ? 'none' : toLevel(severity);

  let confidence: CVDParams['confidence'] = 'high';
  if (state.attentionChecksFailed > 1) {
    confidence = 'low';
  } else if (state.attentionChecksFailed === 1) {
    confidence = 'medium';
  }

  const totalReversals = Object.values(state.axes).reduce((s, a) => s + a.reversals.length, 0);
  if (totalReversals < 12) confidence = lower(confidence);

  if (type === 'rg_uncertain' || ((type === 'protan' || type === 'deutan') && rgMargin < RG_MARGIN_HIGH)) {
    confidence = confidence === 'high' ? 'medium' : confidence;
  }
  if ((type === 'protan' || type === 'deutan') && rgMargin < RG_MARGIN_MEDIUM) confidence = 'low';

  if (fit && type !== 'normal' && fit.winner.error > POOR_FIT_ERROR) confidence = lower(confidence);

  if (hesitation && type !== 'normal' && type !== 'tritan'
    && (hesitation.downgraded || hesitation.rgHesitantShare >= HESITANT_CONFIDENCE_SHARE)) {
    confidence = lower(confidence);
  }

  return {
    type,
    level,
    severity: Math.round(severity * 1000) / 1000,
    confidence,
    thresholds,
    normalizedThresholds: norm,
    maxOffsets,
    hesitation,
    fit,
  };
}

export function classificationToParams(
  result: ClassificationResult,
  selfReport: Record<string, unknown> = {},
  deviceClass?: DeviceClass,
): CVDParams {
  return {
    schema: 'cvd-params/0.1',
    type: result.type,
    level: result.level,
    severity: result.severity,
    thresholds: {
      protan: Math.round(result.thresholds.protan * 10000) / 10000,
      deutan: Math.round(result.thresholds.deutan * 10000) / 10000,
      tritan: Math.round(result.thresholds.tritan * 10000) / 10000,
    },
    maxOffsets: {
      protan: Math.round(result.maxOffsets.protan * 10000) / 10000,
      deutan: Math.round(result.maxOffsets.deutan * 10000) / 10000,
      tritan: Math.round(result.maxOffsets.tritan * 10000) / 10000,
    },
    confidence: result.confidence,
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}@${window.devicePixelRatio}x` : '',
      selfReport,
      ...(deviceClass ? { deviceClass } : {}),
    },
    testedAt: new Date().toISOString(),
    ...(result.hesitation ? {
      hesitation: {
        baselineRtMs: result.hesitation.baselineRtMs,
        hesitantShare: Math.round(result.hesitation.rgHesitantShare * 1000) / 1000,
        downgraded: result.hesitation.downgraded,
      },
    } : {}),
  };
}
