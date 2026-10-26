/**
 * Seeded simulated observers shared by the hesitation and model-fit tests.
 */

import {
  simulateCVD,
  linearRGBToOKLab,
  uvPrimeYToXYZ,
  xyzToLinearRGB,
  offsetAlongAxis,
  D65_UV,
  type CVDType,
  type RGB,
  type ConfusionAxis,
} from '@cvd-tools/color-core';
import {
  createStaircaseState,
  pickNextAxis,
  processResponse,
  isFinished,
  recordAttentionCheckRt,
  type StaircaseState,
} from '../staircase.js';
import { classify } from '../classifier.js';

export type ObserverType = CVDType | 'normal';

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chromatic (a,b) and lightness differences in OKLab as seen by the observer. */
export function perceivedDiff(axis: ConfusionAxis, offset: number, type: ObserverType, severity: number) {
  const targetUV = offsetAlongAxis(D65_UV, axis, offset);
  let bg = xyzToLinearRGB(uvPrimeYToXYZ(D65_UV, 0.2)) as RGB;
  let tg = xyzToLinearRGB(uvPrimeYToXYZ(targetUV, 0.2)) as RGB;
  if (type !== 'normal') {
    bg = simulateCVD(bg, type, severity).map(v => Math.max(0, v)) as RGB;
    tg = simulateCVD(tg, type, severity).map(v => Math.max(0, v)) as RGB;
  }
  const a = linearRGBToOKLab(bg);
  const b = linearRGBToOKLab(tg);
  const dC = Math.hypot(a[1] - b[1], a[2] - b[2]);
  const dL = Math.abs(a[0] - b[0]);
  return { dC, dL, dE: Math.hypot(dC, dL) };
}

const weibull = (x: number) => 1 - Math.exp(-Math.pow(x, 3.5));
const JND = 0.008;

/**
 * A hue difference above JND is seen at a glance (fast, correct). Otherwise
 * the observer scrutinizes: the luminance artifact a dichromat sees along a
 * confusion line is masked by the ±25% luminance noise, so it is only found
 * by slow searching; failing that, they guess (25%). Machado protans see a
 * strong luminance artifact on the protan axis, which pulls their protan
 * threshold down and made the old ratio classifier call them deutan.
 */
export function runObserver(
  seed: number,
  type: ObserverType,
  severity: number,
  useRt: boolean,
): StaircaseState {
  const rng = mulberry32(seed);
  const logNormal = (median: number, sigma: number) =>
    median * Math.exp(sigma * Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng()));
  const state = createStaircaseState(useRt ? [1000, 1150] : []);
  let safety = 0;
  while (!isFinished(state) && safety++ < 300) {
    if (state.totalTrials > 0 && state.totalTrials % 15 === 0 && useRt) {
      recordAttentionCheckRt(state, logNormal(1000, 0.2), true);
    }
    const axis = pickNextAxis(state, rng)!;
    const { dC, dL } = perceivedDiff(axis, state.axes[axis].currentLevel, type, severity);
    let correct: boolean;
    let rt: number;
    if (rng() < weibull(dC / JND)) {
      correct = true;
      rt = logNormal(1100, 0.25);
    } else {
      correct = rng() < weibull(dL / JND) || rng() < 0.25;
      rt = logNormal(4500, 0.3);
    }
    processResponse(state, axis, correct, useRt ? rt : undefined);
    state.totalTrials++;
  }
  return state;
}

/**
 * Worst case for the model: lightness is not masked at all (full OKLab ΔE
 * drives a 4AFC Weibull) and no reaction times are recorded.
 */
export function runUnmaskedObserver(seed: number, type: ObserverType, severity: number): StaircaseState {
  const rng = mulberry32(seed);
  const state = createStaircaseState();
  let safety = 0;
  while (!isFinished(state) && safety++ < 300) {
    const axis = pickNextAxis(state, rng)!;
    const { dE } = perceivedDiff(axis, state.axes[axis].currentLevel, type, severity);
    processResponse(state, axis, rng() < 0.25 + 0.75 * weibull(dE / JND));
    state.totalTrials++;
  }
  return state;
}

export function tally(
  run: (seed: number) => StaircaseState,
  n = 100,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const r = classify(run(seed));
    counts[r.type] = (counts[r.type] ?? 0) + 1;
  }
  return counts;
}
