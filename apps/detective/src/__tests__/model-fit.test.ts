/**
 * Observer-model classifier: Machado predictions, fit recovery on noise-free
 * data, and classification rates for seeded simulated observers.
 */

import { describe, it, expect } from 'vitest';
import type { ConfusionAxis } from '@cvd-tools/color-core';
import { predictNormThreshold, fitObserverModel, MODEL_AXES, type ModelType } from '../cvdModel.js';
import { classify } from '../classifier.js';
import { runObserver, runUnmaskedObserver, tally } from './observers.js';

const FULL: Record<ConfusionAxis, number> = { protan: 1, deutan: 1, tritan: 1 };

function predicted(type: ModelType, severity: number, jnd: number, kappa = 0): Record<ConfusionAxis, number> {
  const out = {} as Record<ConfusionAxis, number>;
  for (const axis of MODEL_AXES) out[axis] = predictNormThreshold(type, severity, axis, jnd, kappa);
  return out;
}

const share = (c: Record<string, number>, type: string, n = 100) => (c[type] ?? 0) / n;

describe('Machado threshold predictions', () => {
  it('a deficiency raises the threshold on the deutan axis relative to normal', () => {
    const normal = predicted('normal', 0, 0.008);
    for (const type of ['protan', 'deutan'] as const) {
      expect(predicted(type, 0.8, 0.008).deutan).toBeGreaterThan(normal.deutan * 3);
    }
  });

  it('higher severity never lowers the own-axis threshold', () => {
    for (const [type, axis] of [['protan', 'protan'], ['deutan', 'deutan'], ['tritan', 'tritan']] as const) {
      let prev = 0;
      for (const s of [0.2, 0.4, 0.6, 0.8, 1]) {
        const p = predictNormThreshold(type, s, axis, 0.008);
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
  });

  it('red-green deficiencies leave the tritan axis close to normal', () => {
    const normal = predictNormThreshold('normal', 0, 'tritan', 0.008);
    expect(predictNormThreshold('protan', 1, 'tritan', 0.008)).toBeLessThan(normal * 1.5);
    expect(predictNormThreshold('deutan', 1, 'tritan', 0.008)).toBeLessThan(normal * 1.5);
  });

  it('a lightness cue (κ > 0) lowers a protan\'s protan-axis threshold', () => {
    expect(predictNormThreshold('protan', 1, 'protan', 0.008, 1))
      .toBeLessThan(predictNormThreshold('protan', 1, 'protan', 0.008, 0) * 0.5);
  });
});

describe('fitObserverModel on noise-free thresholds', () => {
  it('recovers type and severity of every red-green candidate', () => {
    for (const type of ['protan', 'deutan'] as const) {
      for (const severity of [0.6, 0.8, 1]) {
        const fit = fitObserverModel(predicted(type, severity, 0.008), FULL);
        expect(fit.winner.type).toBe(type);
        expect(Math.abs(fit.winner.severity - severity)).toBeLessThanOrEqual(0.1);
        expect(type === 'protan' ? fit.rgMargin : -fit.rgMargin).toBeGreaterThan(0);
      }
    }
  });

  it('recovers tritan and normal', () => {
    expect(fitObserverModel(predicted('tritan', 1, 0.008), FULL).winner.type).toBe('tritan');
    expect(fitObserverModel(predicted('normal', 0, 0.012), FULL).winner.type).toBe('normal');
  });

  it('absorbs an overall sensitivity shift through the jnd nuisance parameter', () => {
    const fit = fitObserverModel(predicted('protan', 0.8, 0.011), FULL);
    expect(fit.winner.type).toBe('protan');
    expect(fit.winner.jnd).toBeGreaterThan(0.009);
  });
});

describe('Simulated observers — model-fit classification', () => {
  const rt = (type: ModelType, sev: number) => tally(seed => runObserver(seed, type, sev, true));
  const unmasked = (type: ModelType, sev: number) => tally(seed => runUnmaskedObserver(seed, type, sev));

  it('protan 0.6 / 0.8 / 1.0 are mostly protan, rarely deutan', () => {
    const c06 = rt('protan', 0.6);
    const c08 = rt('protan', 0.8);
    const c10 = rt('protan', 1);
    console.log('protan 0.6/0.8/1.0:', JSON.stringify(c06), JSON.stringify(c08), JSON.stringify(c10));
    expect(share(c06, 'protan')).toBeGreaterThanOrEqual(0.45);
    expect(share(c06, 'protan')).toBeGreaterThan(share(c06, 'rg_uncertain'));
    expect(share(c06, 'deutan')).toBeLessThanOrEqual(0.15);
    expect(share(c08, 'protan')).toBeGreaterThanOrEqual(0.75);
    expect(share(c08, 'deutan')).toBeLessThanOrEqual(0.06);
    expect(share(c10, 'protan')).toBeGreaterThanOrEqual(0.95);
  });

  it('deutan 0.6 / 0.8 / 1.0 stay deutan', () => {
    const c06 = rt('deutan', 0.6);
    const c08 = rt('deutan', 0.8);
    const c10 = rt('deutan', 1);
    console.log('deutan 0.6/0.8/1.0:', JSON.stringify(c06), JSON.stringify(c08), JSON.stringify(c10));
    expect(share(c06, 'deutan')).toBeGreaterThanOrEqual(0.55);
    expect(share(c06, 'protan')).toBeLessThanOrEqual(0.12);
    expect(share(c08, 'deutan')).toBeGreaterThanOrEqual(0.95);
    expect(share(c10, 'deutan')).toBeGreaterThanOrEqual(0.95);
  });

  it('normal observers stay normal', () => {
    const c = rt('normal', 0);
    console.log('normal:', JSON.stringify(c));
    expect(share(c, 'normal')).toBeGreaterThanOrEqual(0.88);
  });

  it('still names the type when lightness is not masked and no RTs exist', () => {
    const p = unmasked('protan', 0.8);
    const d = unmasked('deutan', 0.8);
    console.log('unmasked protan 0.8 / deutan 0.8:', JSON.stringify(p), JSON.stringify(d));
    expect(share(p, 'protan')).toBeGreaterThanOrEqual(0.6);
    expect(share(p, 'deutan')).toBeLessThanOrEqual(0.15);
    expect(share(d, 'deutan')).toBeGreaterThanOrEqual(0.85);
  });

  it('confidence follows the fit margin', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = classify(runObserver(seed, 'protan', 0.6, true));
      if (r.type === 'rg_uncertain') expect(r.confidence).not.toBe('high');
      if ((r.type === 'protan' || r.type === 'deutan') && Math.abs(r.fit!.rgMargin) < 1.5) {
        expect(r.confidence).toBe('low');
      }
    }
  });

  it('reports a Machado severity that grows with the simulated severity', () => {
    const mean = (sev: number) => {
      let s = 0;
      for (let seed = 1; seed <= 30; seed++) s += classify(runObserver(seed, 'protan', sev, true)).severity;
      return s / 30;
    };
    const [a, b, c] = [mean(0.6), mean(0.8), mean(1)];
    console.log(`protan severity estimates: 0.6→${a.toFixed(2)} 0.8→${b.toFixed(2)} 1.0→${c.toFixed(2)}`);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
