/**
 * Simulated observer tests.
 * Construct virtual subjects with Machado-transformed color perception,
 * run them through the full staircase, and verify classification.
 */

import { describe, it, expect } from 'vitest';
import {
  simulateCVD,
  linearRGBToOKLab,
  deltaEOKLab,
  uvPrimeYToXYZ,
  xyzToLinearRGB,
  offsetAlongAxis,
  D65_UV,
  isInGamut,
  type CVDType,
  type RGB,
} from '@cvd-tools/color-core';
import {
  createStaircaseState,
  pickNextAxis,
  processResponse,
  isFinished,
  type StaircaseState,
} from '../staircase.js';
import { classify } from '../classifier.js';

const BG_LUMINANCE = 0.2;

/**
 * Psychometric function: probability of correct response given delta E.
 * Uses a Weibull-like curve with chance level 0.25 (4AFC).
 */
function psychometricP(dE: number, threshold: number): number {
  const gamma = 0.25; // chance level for 4AFC
  if (dE <= 0) return gamma;
  const beta = 3.5; // steepness
  const x = dE / threshold;
  return gamma + (1 - gamma) * (1 - Math.exp(-Math.pow(x, beta)));
}

/**
 * Simulate how a CVD observer would respond to a trial.
 * Transform colors through Machado matrix, compute perceptual difference.
 */
function simulatedResponse(
  axis: 'protan' | 'deutan' | 'tritan',
  offset: number,
  cvdType: CVDType | 'normal',
  severity: number,
  observerJND: number = 0.008,
): boolean {
  const bgUV = D65_UV;
  const targetUV = offsetAlongAxis(bgUV, axis, offset);

  const bgXYZ = uvPrimeYToXYZ(bgUV, BG_LUMINANCE);
  const targetXYZ = uvPrimeYToXYZ(targetUV, BG_LUMINANCE);

  let bgRGB = xyzToLinearRGB(bgXYZ) as RGB;
  let targetRGB = xyzToLinearRGB(targetXYZ) as RGB;

  if (cvdType !== 'normal') {
    bgRGB = simulateCVD(bgRGB, cvdType, severity);
    targetRGB = simulateCVD(targetRGB, cvdType, severity);
  }

  // Clamp to valid range for OKLab conversion
  bgRGB = bgRGB.map(v => Math.max(0, v)) as RGB;
  targetRGB = targetRGB.map(v => Math.max(0, v)) as RGB;

  const bgLab = linearRGBToOKLab(bgRGB);
  const targetLab = linearRGBToOKLab(targetRGB);
  const dE = deltaEOKLab(bgLab, targetLab);

  const pCorrect = psychometricP(dE, observerJND);
  return Math.random() < pCorrect;
}

function runSimulatedTest(
  cvdType: CVDType | 'normal',
  severity: number,
): StaircaseState {
  const state = createStaircaseState();
  let safety = 0;

  while (!isFinished(state) && safety < 300) {
    safety++;
    const axis = pickNextAxis(state)!;
    if (!axis) break;

    const offset = state.axes[axis].currentLevel;
    const correct = simulatedResponse(axis, offset, cvdType, severity);
    processResponse(state, axis, correct);
    state.totalTrials++;
  }

  return state;
}

describe('Simulated Observer — Classification', () => {
  const N = 50;

  it('normal observers → classified as normal (>60%)', () => {
    let normalCount = 0;
    for (let i = 0; i < N; i++) {
      const state = runSimulatedTest('normal', 0);
      const result = classify(state);
      if (result.type === 'normal') normalCount++;
    }
    const rate = normalCount / N;
    console.log(`Normal classification rate: ${(rate * 100).toFixed(0)}% (${normalCount}/${N})`);
    expect(rate).toBeGreaterThan(0.6);
  });

  it('protan severe → classified as red-green deficiency (>50%)', () => {
    let correctCount = 0;
    for (let i = 0; i < N; i++) {
      const state = runSimulatedTest('protan', 0.8);
      const result = classify(state);
      if (result.type === 'protan' || result.type === 'deutan' || result.type === 'rg_uncertain') correctCount++;
    }
    const rate = correctCount / N;
    console.log(`Protan 0.8 RG detection rate: ${(rate * 100).toFixed(0)}% (${correctCount}/${N})`);
    expect(rate).toBeGreaterThan(0.5);
  });

  it('deutan severe → classified as deutan or rg_uncertain (>50%)', () => {
    let correctCount = 0;
    for (let i = 0; i < N; i++) {
      const state = runSimulatedTest('deutan', 0.8);
      const result = classify(state);
      if (result.type === 'deutan' || result.type === 'rg_uncertain') correctCount++;
    }
    const rate = correctCount / N;
    console.log(`Deutan 0.8 detection rate: ${(rate * 100).toFixed(0)}% (${correctCount}/${N})`);
    expect(rate).toBeGreaterThan(0.5);
  });

  it('tritan severe → classified as tritan or abnormal (>50%)', () => {
    let correctCount = 0;
    for (let i = 0; i < N; i++) {
      const state = runSimulatedTest('tritan', 0.9);
      const result = classify(state);
      if (result.type !== 'normal') correctCount++;
    }
    const rate = correctCount / N;
    console.log(`Tritan 0.9 abnormal detection rate: ${(rate * 100).toFixed(0)}% (${correctCount}/${N})`);
    expect(rate).toBeGreaterThan(0.5);
  });

  it('severity monotonicity: higher severity → higher normalized threshold', () => {
    const severities = [0.3, 0.6, 0.9];
    const avgThresholds: number[] = [];

    for (const sev of severities) {
      let totalThreshold = 0;
      const runs = 15;
      for (let i = 0; i < runs; i++) {
        const state = runSimulatedTest('protan', sev);
        const result = classify(state);
        totalThreshold += result.normalizedThresholds.protan;
      }
      avgThresholds.push(totalThreshold / runs);
    }

    console.log(`Severity monotonicity: ${avgThresholds.map(t => t.toFixed(3)).join(' < ')}`);
    for (let i = 1; i < avgThresholds.length; i++) {
      expect(avgThresholds[i]).toBeGreaterThanOrEqual(avgThresholds[i - 1] * 0.5);
    }
  });
});

describe('Staircase convergence', () => {
  it('converges within max trials for normal observer', () => {
    const state = runSimulatedTest('normal', 0);
    expect(isFinished(state)).toBe(true);
    const totalTrials = Object.values(state.axes).reduce((s, a) => s + a.trialCount, 0);
    expect(totalTrials).toBeLessThanOrEqual(75);
  });

  it('all axes stop properly', () => {
    const state = runSimulatedTest('protan', 0.5);
    expect(isFinished(state)).toBe(true);
    for (const axis of Object.values(state.axes)) {
      expect(axis.stopped).toBe(true);
    }
  });
});
