/**
 * Hesitation (response-time) weighting: unit tests plus the seeded simulated
 * observer from observers.ts, which answers fast when it sees the hue
 * difference and slowly when it has to scrutinize or guess.
 */

import { describe, it, expect } from 'vitest';
import { validateParams } from '@cvd-tools/color-core';
import {
  createStaircaseState,
  processResponse,
  hesitationWeight,
  rtBaseline,
  computeThreshold,
  recordAttentionCheckRt,
  W_MIN,
  HESITATION_ABS_MS,
} from '../staircase.js';
import { classify, classificationToParams } from '../classifier.js';
import { exportCSV } from '../export.js';
import { runObserver, tally, type ObserverType } from './observers.js';

function tallyRt(type: ObserverType, severity: number, useRt: boolean): Record<string, number> {
  return tally(seed => runObserver(seed, type, severity, useRt));
}

describe('hesitationWeight', () => {
  it('is 1 at baseline speed and W_MIN at 3× baseline', () => {
    expect(hesitationWeight(1000, 1000)).toMatchObject({ weight: 1, hesitant: false, hesitation: 1 });
    expect(hesitationWeight(1500, 1000).weight).toBe(1);
    expect(hesitationWeight(3000, 1000)).toMatchObject({ weight: W_MIN, hesitant: true });
    expect(hesitationWeight(9000, 1000).weight).toBe(W_MIN);
  });

  it('decreases monotonically and flags hesitant from 2× baseline', () => {
    const ws = [1600, 2000, 2500, 2900].map(rt => hesitationWeight(rt, 1000).weight);
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeLessThan(ws[i - 1]);
    expect(hesitationWeight(1900, 1000).hesitant).toBe(false);
    expect(hesitationWeight(2000, 1000).hesitant).toBe(true);
  });

  it('applies the absolute cap even without a baseline', () => {
    expect(hesitationWeight(HESITATION_ABS_MS, null)).toMatchObject({ weight: W_MIN, hesitant: true, hesitation: null });
    expect(hesitationWeight(4000, null)).toMatchObject({ weight: 1, hesitant: false });
  });
});

describe('RT baseline', () => {
  it('uses the median of practice/attention-check anchors', () => {
    const s = createStaircaseState([900, 1100]);
    recordAttentionCheckRt(s, 1300, true);
    recordAttentionCheckRt(s, 20000, false);
    expect(rtBaseline(s)).toBe(1100);
  });

  it('does not let slow pre-reversal answers inflate the anchors', () => {
    const s = createStaircaseState([1000, 1000, 1000]);
    processResponse(s, 'protan', true, 5000);
    expect(s.rtAnchors).toEqual([1000, 1000, 1000]);
    processResponse(s, 'protan', true, 1100);
    expect(s.rtAnchors).toEqual([1000, 1000, 1000, 1100]);
  });
});

describe('weighted staircase', () => {
  it('without RTs behaves exactly like the plain 2-down-1-up', () => {
    const answers = Array.from({ length: 25 }, (_, i) => (i * 7) % 3 !== 0);
    const plain = createStaircaseState();
    const fast = createStaircaseState([1000, 1000, 1000]);
    for (const c of answers) {
      processResponse(plain, 'deutan', c);
      processResponse(fast, 'deutan', c, 1000);
    }
    expect(fast.axes.deutan.levelHistory).toEqual(plain.axes.deutan.levelHistory);
    expect(fast.axes.deutan.reversals).toEqual(plain.axes.deutan.reversals);
    expect(computeThreshold(fast.axes.deutan)).toBeCloseTo(computeThreshold(plain.axes.deutan), 12);
  });

  it('two confident corrects step down; two hesitant corrects do not', () => {
    const s = createStaircaseState([1000, 1000, 1000]);
    const start = s.axes.protan.currentLevel;
    processResponse(s, 'protan', true, 6000);
    processResponse(s, 'protan', true, 6000);
    expect(s.axes.protan.currentLevel).toBe(start);
    processResponse(s, 'protan', true, 1000);
    processResponse(s, 'protan', true, 1000);
    expect(s.axes.protan.currentLevel).toBeLessThan(start);
  });

  it('hesitant errors still step up', () => {
    const s = createStaircaseState([1000, 1000, 1000]);
    const start = s.axes.tritan.currentLevel;
    processResponse(s, 'tritan', false, 6000);
    expect(s.axes.tritan.currentLevel).toBeGreaterThanOrEqual(start);
    expect(s.axes.tritan.levelWeights).toEqual([1]);
  });

  it('down-weights reversals reached through hesitant corrects', () => {
    const s = createStaircaseState();
    const a = s.axes.protan;
    a.reversals = [0.01, 0.04, 0.01, 0.04];
    a.reversalWeights = [1, 1, 1, 1];
    const even = computeThreshold(a);
    a.reversalWeights = [W_MIN, 1, W_MIN, 1];
    expect(computeThreshold(a)).toBeGreaterThan(even);
    expect(computeThreshold(a)).toBeLessThan(0.04);
  });
});

describe('Simulated slow-guessing protan', () => {
  it('discounting slow corrects raises the protan-axis threshold the luminance search pulled down', () => {
    const geoMean = (useRt: boolean) => {
      let s = 0;
      for (let seed = 1; seed <= 100; seed++) {
        s += Math.log(classify(runObserver(seed, 'protan', 0.8, useRt)).normalizedThresholds.protan);
      }
      return Math.exp(s / 100);
    };
    const before = geoMean(false);
    const after = geoMean(true);
    console.log(`protan 0.8 protan-axis threshold: ${before.toFixed(3)} → ${after.toFixed(3)}`);
    expect(after).toBeGreaterThan(before * 1.1);
  });

  it('with hesitation weighting the same observers are protan or rg_uncertain', () => {
    const c = tallyRt('protan', 0.8, true);
    console.log('protan 0.8, RT weighting:', JSON.stringify(c));
    expect(((c.protan ?? 0) + (c.rg_uncertain ?? 0)) / 100).toBeGreaterThanOrEqual(0.8);
    expect((c.deutan ?? 0) / 100).toBeLessThanOrEqual(0.2);
  });

  it('a dichromat-like protan (1.0) is almost never called deutan with weighting', () => {
    const before = tallyRt('protan', 1, false);
    const after = tallyRt('protan', 1, true);
    console.log('protan 1.0:', JSON.stringify(before), '→', JSON.stringify(after));
    expect(after.deutan ?? 0).toBeLessThan(before.deutan ?? 0);
    expect((after.deutan ?? 0) / 100).toBeLessThanOrEqual(0.05);
  });

  it('a deutan is still deutan or rg_uncertain, never protan', () => {
    const c = tallyRt('deutan', 0.8, true);
    console.log('deutan 0.8, RT weighting:', JSON.stringify(c));
    expect(c.protan ?? 0).toBe(0);
    expect((c.deutan ?? 0) / 100).toBeGreaterThan(0.5);
  });

  it('a normal observer is still normal', () => {
    const c = tallyRt('normal', 0, true);
    console.log('normal, RT weighting:', JSON.stringify(c));
    expect((c.normal ?? 0) / 100).toBeGreaterThanOrEqual(0.85);
  });

  it('records the downgrade and hesitant share in the result', () => {
    let downgraded = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = classify(runObserver(seed, 'protan', 0.6, true));
      expect(r.hesitation).not.toBeNull();
      if (r.hesitation!.downgraded) {
        downgraded++;
        expect(r.type).toBe('rg_uncertain');
        expect(r.confidence).not.toBe('high');
      }
    }
    expect(downgraded).toBeGreaterThan(0);
    expect(classify(runObserver(1, 'protan', 0.8, false)).hesitation).toBeNull();
  });
});

describe('params and export', () => {
  it('stores an optional hesitation summary that validateParams round-trips', () => {
    const r = classify(runObserver(3, 'protan', 0.8, true));
    const p = classificationToParams(r);
    expect(p.hesitation).toBeDefined();
    const v = validateParams(JSON.parse(JSON.stringify(p)));
    expect(v?.hesitation).toEqual(p.hesitation);
  });

  it('old params without hesitation stay valid; malformed hesitation is dropped', () => {
    const p = classificationToParams(classify(runObserver(3, 'protan', 0.8, false)));
    expect(p.hesitation).toBeUndefined();
    expect(validateParams(p)).not.toBeNull();
    expect(validateParams(p)?.hesitation).toBeUndefined();
    const bad = validateParams({ ...p, hesitation: { hesitantShare: 7 } });
    expect(bad).not.toBeNull();
    expect(bad?.hesitation).toBeUndefined();
  });

  it('CSV includes per-trial hesitation columns, blank for legacy trials', () => {
    const csv = exportCSV([
      { axis: 'protan', offset: 0.01, response: 1, correct: true, targetIndex: 1, rt: 4200, isAttentionCheck: false, trialNumber: 0,
        rtBaseline: 1000, hesitation: 4.2, weight: W_MIN, hesitant: true },
      { axis: 'deutan', offset: 0.02, response: 0, correct: false, targetIndex: 2, rt: 900, isAttentionCheck: false, trialNumber: 1 },
    ]).split('\n');
    expect(csv[0]).toBe('trialNumber,axis,offset,targetIndex,response,correct,rt,isAttentionCheck,rtBaseline,hesitation,weight,hesitant');
    expect(csv[1].endsWith(',1000,4.2,0.15,true')).toBe(true);
    expect(csv[2].endsWith(',false,,,,')).toBe(true);
  });
});
