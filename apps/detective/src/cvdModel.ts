/**
 * Observer model fit: which CVD type and Machado severity best explains the
 * measured per-axis thresholds?
 *
 * For a candidate (type, severity), the predicted threshold on an axis is the
 * smallest offset at which the Machado-simulated target and background differ
 * by `jnd` in OKLab, using sqrt(ΔC² + (κ·ΔL)²): hue/chroma counts fully, while
 * the lightness artifact a dichromat sees along a confusion line counts only
 * by κ, because the stimulus masks lightness with ±25% noise and slow answers
 * are discounted. Both are per-observer nuisance parameters fitted for every
 * candidate: `jnd` (screen, distance, attention; weak prior) and κ (how much
 * of the masked lightness cue this observer still uses). Types are told apart
 * by the *pattern* of thresholds across all three axes, not by a ratio.
 */

import {
  simulateCVD,
  linearRGBToOKLab,
  uvPrimeYToXYZ,
  xyzToLinearRGB,
  offsetAlongAxis,
  maxGamutOffset,
  D65_UV,
  type ConfusionAxis,
  type CVDType,
  type RGB,
} from '@cvd-tools/color-core';
import { BG_LUMINANCE } from './staircase.js';

export type ModelType = CVDType | 'normal';

export const MODEL_AXES: readonly ConfusionAxis[] = ['protan', 'deutan', 'tritan'];
export const MODEL_SEVERITIES: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

/**
 * Thresholds are compared only up to this level. An axis the observer cannot
 * see even at max offset still measures well below 1 (lucky guesses make the
 * staircase reverse under the cap), so everything above is "not seen".
 */
const CAP = 0.6;
/** Staircase threshold estimates scatter by roughly this much in natural-log units. */
export const LOG_THRESHOLD_SD = 0.18;
/** Prior on chromatic sensitivity: typical observer JND and its log-SD (≈ ×2). */
export const JND_PRIOR = { median: 0.008, logSd: 0.7 };
export const KAPPA_GRID: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
/**
 * Prior in favour of normal vision (−2·log prior-odds units, ≈ e^0.75 ≈ 2:1
 * against each deficiency type). A normal observer with lower overall
 * sensitivity otherwise fits a mild tritan almost as well.
 */
export const NORMAL_PRIOR_BONUS = 1.5;
const JND_GRID = Array.from({ length: 41 }, (_, i) => 0.002 * Math.pow(25, i / 40)); // 0.002 … 0.05
const OFFSET_FRACTIONS = Array.from({ length: 80 }, (_, i) => 0.002 * Math.pow(500, i / 79)); // 0.002 … 1

interface Curve {
  fractions: number[];
  dC: number[];
}

const curveCache = new Map<string, Curve>();

function perceivedDiff(axis: ConfusionAxis, offset: number, type: ModelType, severity: number): { dC: number; dL: number } {
  let bg = xyzToLinearRGB(uvPrimeYToXYZ(D65_UV, BG_LUMINANCE)) as RGB;
  let tg = xyzToLinearRGB(uvPrimeYToXYZ(offsetAlongAxis(D65_UV, axis, offset), BG_LUMINANCE)) as RGB;
  if (type !== 'normal') {
    bg = simulateCVD(bg, type, severity).map(v => Math.max(0, v)) as RGB;
    tg = simulateCVD(tg, type, severity).map(v => Math.max(0, v)) as RGB;
  }
  const a = linearRGBToOKLab(bg);
  const b = linearRGBToOKLab(tg);
  return { dC: Math.hypot(a[1] - b[1], a[2] - b[2]), dL: Math.abs(a[0] - b[0]) };
}

/** Simulated perceived difference vs. normalized offset, made monotone so it can be inverted. */
function curve(type: ModelType, severity: number, axis: ConfusionAxis, kappa: number): Curve {
  const key = `${type}:${severity}:${axis}:${kappa}`;
  let c = curveCache.get(key);
  if (!c) {
    const maxOff = maxGamutOffset(axis, BG_LUMINANCE, D65_UV);
    let running = 0;
    const dC = OFFSET_FRACTIONS.map(f => {
      const d = perceivedDiff(axis, f * maxOff, type, severity);
      return (running = Math.max(running, Math.hypot(d.dC, kappa * d.dL)));
    });
    c = { fractions: OFFSET_FRACTIONS, dC };
    curveCache.set(key, c);
  }
  return c;
}

/** Predicted normalized threshold (0–1; 1 = not seen even at max offset). */
export function predictNormThreshold(
  type: ModelType, severity: number, axis: ConfusionAxis, jnd: number, kappa = 0,
): number {
  const { fractions, dC } = curve(type, severity, axis, kappa);
  if (dC[dC.length - 1] < jnd) return 1;
  if (dC[0] >= jnd) return fractions[0];
  let i = 1;
  while (dC[i] < jnd) i++;
  const t = (jnd - dC[i - 1]) / Math.max(1e-12, dC[i] - dC[i - 1]);
  return Math.exp(Math.log(fractions[i - 1]) + t * (Math.log(fractions[i]) - Math.log(fractions[i - 1])));
}

export interface CandidateFit {
  type: ModelType;
  severity: number;
  jnd: number;
  kappa: number;
  /** −2·log-likelihood (incl. jnd prior); lower is better */
  error: number;
  predicted: Record<ConfusionAxis, number>;
}

export interface ModelFit {
  /** Best fit per type */
  best: Record<ModelType, CandidateFit>;
  /** Overall best */
  winner: CandidateFit;
  /** error(best deutan) − error(best protan): > 0 favours protan */
  rgMargin: number;
}

/**
 * Fit every candidate to observed normalized thresholds.
 * `weights` (0–1 per axis) express how reliable each axis's estimate is.
 */
export function fitObserverModel(
  observed: Record<ConfusionAxis, number>,
  weights: Record<ConfusionAxis, number>,
): ModelFit {
  const logObs = (x: number) => Math.log(Math.min(CAP, Math.max(OFFSET_FRACTIONS[0], x)));
  const obs = { protan: logObs(observed.protan), deutan: logObs(observed.deutan), tritan: logObs(observed.tritan) };
  const candidates: Array<[ModelType, number]> = [
    ['normal', 0],
    ...(['protan', 'deutan', 'tritan'] as CVDType[]).flatMap(t => MODEL_SEVERITIES.map(s => [t, s] as [ModelType, number])),
  ];

  const best = {} as Record<ModelType, CandidateFit>;
  for (const [type, severity] of candidates) {
    for (const kappa of KAPPA_GRID) for (const jnd of JND_GRID) {
      const prior = ((Math.log(jnd) - Math.log(JND_PRIOR.median)) / JND_PRIOR.logSd) ** 2
        - (type === 'normal' ? NORMAL_PRIOR_BONUS : 0);
      let error = prior;
      const predicted = {} as Record<ConfusionAxis, number>;
      for (const axis of MODEL_AXES) {
        const p = predictNormThreshold(type, severity, axis, jnd, kappa);
        predicted[axis] = p;
        const r = (obs[axis] - logObs(p)) / LOG_THRESHOLD_SD;
        error += weights[axis] * r * r;
      }
      if (!best[type] || error < best[type].error) {
        best[type] = { type, severity, jnd, kappa, error, predicted };
      }
    }
  }

  const winner = Object.values(best).reduce((a, b) => (b.error < a.error ? b : a));
  return { best, winner, rgMargin: best.deutan.error - best.protan.error };
}
