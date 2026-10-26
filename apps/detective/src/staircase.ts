/**
 * Three-axis interleaved staircase state machine.
 * 2-down-1-up rule: converges at ~70.7% correct rate.
 * Log-spaced steps, step size halves after 2 reversals.
 * Stops at 8 reversals or 25 trials per axis.
 * Threshold = weighted geometric mean of last 6 reversal points.
 *
 * Hesitation weighting: when a reaction time is supplied, a correct answer
 * given much slower than the observer's own baseline is treated as a probable
 * guess. It only adds its weight w ∈ [W_MIN, 1] toward the two corrects needed
 * to step down, and reversals reached through hesitant corrects count less in
 * the threshold. Errors always count fully. Without RTs the staircase is the
 * plain 2-down-1-up.
 */

import { type ConfusionAxis, maxGamutOffset, D65_UV } from '@cvd-tools/color-core';

export interface AxisState {
  axis: ConfusionAxis;
  currentLevel: number;      // current offset in u'v' distance
  stepSize: number;          // in log units
  consecutiveCorrect: number; // weighted count of corrects at this level
  reversals: number[];       // offset values at reversal points
  reversalWeights: number[]; // confidence weight of each reversal point
  trialCount: number;
  direction: 'up' | 'down' | null;
  stopped: boolean;
  maxOffset: number;         // max displayable offset for this axis
  levelHistory: number[];    // track all levels for fallback threshold
  levelWeights: number[];    // hesitation weight of the trial at each level
  stepWeights: number[];     // weights of the corrects accumulated at this level
  lastDescentWeight: number; // mean weight of the corrects that led into this level
  /** Corrects / hesitant corrects after the first reversal (the threshold region) */
  regionCorrect: number;
  regionHesitant: number;
}

export interface TrialRecord {
  axis: ConfusionAxis;
  offset: number;
  response: number;          // chosen cell index (0-3), or -1 for "can't tell"
  correct: boolean;
  targetIndex: number;
  rt: number;                // reaction time in ms
  isAttentionCheck: boolean;
  trialNumber: number;
  /** Observer's RT baseline (ms) when this trial was scored; null if none yet */
  rtBaseline?: number | null;
  /** rt / rtBaseline; null when there was no baseline */
  hesitation?: number | null;
  /** Weight given to the answer: 1 = confident, down to W_MIN for a likely guess */
  weight?: number;
  hesitant?: boolean;
}

export interface StaircaseState {
  axes: Record<ConfusionAxis, AxisState>;
  trials: TrialRecord[];
  attentionChecksFailed: number;
  totalTrials: number;
  /** RTs of easy, clearly-seen answers (practice, attention checks, pre-reversal corrects) */
  rtAnchors: number[];
  /** RTs of every correct staircase answer, fallback baseline source */
  rtCorrect: number[];
}

export interface ResponseTiming {
  rtBaseline: number | null;
  hesitation: number | null;
  weight: number;
  hesitant: boolean;
}

/** Below this ratio of RT to baseline an answer is fully confident. */
export const HESITATION_ONSET = 1.5;
/** At or above this ratio an answer gets the minimum weight. */
export const HESITATION_FULL = 3;
/** Ratio from which a trial is flagged hesitant. */
export const HESITANT_RATIO = 2;
/** Any answer slower than this is treated as a guess, regardless of baseline. */
export const HESITATION_ABS_MS = 8000;
export const W_MIN = 0.15;
const MIN_ANCHORS = 3;
const BASELINE_CLAMP: [number, number] = [300, 5000];

const MAX_REVERSALS = 8;
const MAX_TRIALS_PER_AXIS = 25;
const INITIAL_STEP = 0.4;           // large steps for fast convergence
const STEP_HALVING_AFTER = 2;
const REVERSAL_THRESHOLD_COUNT = 6;
const MIN_LEVEL = 0.0005;           // floor to prevent hitting zero

export const BG_LUMINANCE = 0.2;

export function createAxisState(axis: ConfusionAxis): AxisState {
  const maxOff = maxGamutOffset(axis, BG_LUMINANCE, D65_UV);
  return {
    axis,
    currentLevel: maxOff * 0.7,     // start high for fast descent
    stepSize: INITIAL_STEP,
    consecutiveCorrect: 0,
    reversals: [],
    reversalWeights: [],
    trialCount: 0,
    direction: null,
    stopped: false,
    maxOffset: maxOff,
    levelHistory: [],
    levelWeights: [],
    stepWeights: [],
    lastDescentWeight: 1,
    regionCorrect: 0,
    regionHesitant: 0,
  };
}

/** `seedRts`: reaction times from the practice round, used as the initial RT baseline. */
export function createStaircaseState(seedRts: number[] = []): StaircaseState {
  return {
    axes: {
      protan: createAxisState('protan'),
      deutan: createAxisState('deutan'),
      tritan: createAxisState('tritan'),
    },
    trials: [],
    attentionChecksFailed: 0,
    totalTrials: 0,
    rtAnchors: seedRts.filter(isValidRt),
    rtCorrect: [],
  };
}

function isValidRt(rt: unknown): rt is number {
  return typeof rt === 'number' && Number.isFinite(rt) && rt > 0;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The observer's typical RT for an answer they clearly saw: median of the
 * anchor RTs, or of all correct answers until enough anchors exist.
 */
export function rtBaseline(state: StaircaseState): number | null {
  const src = state.rtAnchors.length >= MIN_ANCHORS ? state.rtAnchors
    : state.rtCorrect.length >= MIN_ANCHORS ? state.rtCorrect
    : state.rtAnchors.length > 0 ? state.rtAnchors
    : null;
  if (!src) return null;
  return Math.min(BASELINE_CLAMP[1], Math.max(BASELINE_CLAMP[0], median(src)));
}

/**
 * Weight of an answer given its RT: 1 up to HESITATION_ONSET × baseline,
 * falling log-linearly to W_MIN at HESITATION_FULL × baseline.
 */
export function hesitationWeight(rt: number, baseline: number | null): ResponseTiming {
  if (!isValidRt(rt)) return { rtBaseline: baseline, hesitation: null, weight: 1, hesitant: false };
  const ratio = baseline ? rt / baseline : null;
  let weight = 1;
  if (ratio !== null && ratio > HESITATION_ONSET) {
    const t = Math.min(1, Math.log(ratio / HESITATION_ONSET) / Math.log(HESITATION_FULL / HESITATION_ONSET));
    weight = 1 - t * (1 - W_MIN);
  }
  if (rt >= HESITATION_ABS_MS) weight = W_MIN;
  const hesitant = rt >= HESITATION_ABS_MS || (ratio !== null && ratio >= HESITANT_RATIO);
  return {
    rtBaseline: baseline === null ? null : Math.round(baseline),
    hesitation: ratio === null ? null : Math.round(ratio * 100) / 100,
    weight: Math.round(weight * 1000) / 1000,
    hesitant,
  };
}

/** Attention checks are trivially easy, so a correct one is a clean RT anchor. */
export function recordAttentionCheckRt(state: StaircaseState, rt: number, correct: boolean): void {
  if (correct && isValidRt(rt)) state.rtAnchors.push(rt);
}

export function isFinished(state: StaircaseState): boolean {
  return Object.values(state.axes).every(a => a.stopped);
}

export function pickNextAxis(state: StaircaseState, rng?: () => number): ConfusionAxis | null {
  const active = Object.values(state.axes).filter(a => !a.stopped);
  if (active.length === 0) return null;
  const rand = rng ? rng() : Math.random();
  return active[Math.floor(rand * active.length)].axis;
}

export function shouldAttentionCheck(state: StaircaseState): boolean {
  return state.totalTrials > 0 && state.totalTrials % 15 === 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 1);

/**
 * Score one staircase answer. Pass `rt` (ms) to enable hesitation weighting;
 * without it every answer has weight 1 (plain 2-down-1-up).
 */
export function processResponse(
  state: StaircaseState,
  axis: ConfusionAxis,
  correct: boolean,
  rt?: number,
): ResponseTiming {
  const a = state.axes[axis];
  const timing = rt === undefined
    ? { rtBaseline: null, hesitation: null, weight: 1, hesitant: false }
    : hesitationWeight(rt, rtBaseline(state));
  if (a.stopped) return timing;

  if (correct && rt !== undefined && isValidRt(rt)) {
    state.rtCorrect.push(rt);
    if (a.reversals.length === 0 && !timing.hesitant) state.rtAnchors.push(rt);
  }
  if (correct && a.reversals.length > 0) {
    a.regionCorrect++;
    if (timing.hesitant) a.regionHesitant++;
  }

  // A hesitant error is still an error: only correct answers are discounted.
  const w = correct ? timing.weight : 1;
  a.levelHistory.push(a.currentLevel);
  a.levelWeights.push(w);
  const logLevel = Math.log(a.currentLevel);
  const prevDir = a.direction;

  if (correct) {
    a.consecutiveCorrect += w;
    a.stepWeights.push(w);
    if (a.consecutiveCorrect >= 2 - 1e-9) {
      const newDir: 'down' = 'down';
      const levelWeight = mean(a.stepWeights);
      if (prevDir === 'up') {
        a.reversals.push(a.currentLevel);
        a.reversalWeights.push(levelWeight);
        a.stepSize = computeStepSize(a.reversals.length);
      }
      a.direction = newDir;
      a.currentLevel = Math.exp(logLevel - a.stepSize);
      a.consecutiveCorrect = 0;
      a.stepWeights = [];
      a.lastDescentWeight = levelWeight;
    }
  } else {
    const newDir: 'up' = 'up';
    if (prevDir === 'down') {
      a.reversals.push(a.currentLevel);
      a.reversalWeights.push(a.lastDescentWeight);
      a.stepSize = computeStepSize(a.reversals.length);
    }
    a.direction = newDir;
    a.currentLevel = Math.exp(logLevel + a.stepSize);
    a.consecutiveCorrect = 0;
    a.stepWeights = [];
    a.lastDescentWeight = 1;
  }

  a.currentLevel = Math.max(MIN_LEVEL, Math.min(a.currentLevel, a.maxOffset));
  a.trialCount++;

  if (a.reversals.length >= MAX_REVERSALS || a.trialCount >= MAX_TRIALS_PER_AXIS) {
    a.stopped = true;
  }
  return timing;
}

function computeStepSize(numReversals: number): number {
  if (numReversals < STEP_HALVING_AFTER) return INITIAL_STEP;
  const halvings = Math.floor(numReversals / STEP_HALVING_AFTER);
  return Math.max(0.05, INITIAL_STEP / Math.pow(2, halvings));
}

function weightedGeoMean(values: number[], weights: (number | undefined)[]): number {
  let sw = 0;
  let s = 0;
  values.forEach((v, i) => {
    const w = weights[i] ?? 1;
    sw += w;
    s += w * Math.log(v);
  });
  return Math.exp(s / sw);
}

/**
 * Compute threshold for an axis.
 * Primary: weighted geometric mean of last N reversal values.
 * Fallback when too few reversals: weighted geometric mean of last half of level history.
 */
export function computeThreshold(axis: AxisState, unweighted = false): number {
  const revs = axis.reversals;
  const revW = unweighted ? [] : axis.reversalWeights ?? [];

  if (revs.length >= 4) {
    const count = Math.min(REVERSAL_THRESHOLD_COUNT, revs.length);
    return weightedGeoMean(revs.slice(-count), revW.slice(revs.length - count));
  }

  // Fallback: use the latter portion of level history
  if (axis.levelHistory.length >= 4) {
    const from = Math.floor(axis.levelHistory.length / 2);
    return weightedGeoMean(axis.levelHistory.slice(from), unweighted ? [] : (axis.levelWeights ?? []).slice(from));
  }

  // Ultimate fallback: last known level
  if (axis.levelHistory.length > 0) {
    return axis.levelHistory[axis.levelHistory.length - 1];
  }

  return axis.maxOffset;
}

export function getAllThresholds(state: StaircaseState): Record<ConfusionAxis, number> {
  return {
    protan: computeThreshold(state.axes.protan),
    deutan: computeThreshold(state.axes.deutan),
    tritan: computeThreshold(state.axes.tritan),
  };
}

export function getMaxOffsets(state: StaircaseState): Record<ConfusionAxis, number> {
  return {
    protan: state.axes.protan.maxOffset,
    deutan: state.axes.deutan.maxOffset,
    tritan: state.axes.tritan.maxOffset,
  };
}

export function getTotalProgress(state: StaircaseState): number {
  const total = Object.values(state.axes).reduce((s, a) => s + a.trialCount, 0);
  const max = 3 * MAX_TRIALS_PER_AXIS;
  return Math.min(1, total / max);
}
