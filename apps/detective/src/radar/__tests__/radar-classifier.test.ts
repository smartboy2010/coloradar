/**
 * End to end: simulated observer → observer-model classifier → saved result
 * (cvd-app/v1) → radar simulations and shader uniforms.
 */

import { describe, it, expect } from 'vitest';
import { machadoMatrix, validateParams } from '@cvd-tools/color-core';
import { classify, classificationToParams } from '../../classifier.js';
import { simsForResult } from '../../fixer/confusion.js';
import { LocalProfileStore, type KeyValueStorage } from '../../store/LocalProfileStore.js';
import { runObserver, type ObserverType } from '../../__tests__/observers.js';
import { effectiveRadar, simUniforms, toGLMat3 } from '../params.js';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
}

const CASES: [ObserverType, number][] = [['protan', 0.8], ['deutan', 0.6], ['tritan', 0.9], ['normal', 0]];

describe('radar reads classifier output', () => {
  for (const [observer, severity] of CASES) {
    it(`${observer} observers: saved result drives matching radar uniforms`, async () => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 12; seed++) {
        const params = classificationToParams(classify(runObserver(seed, observer, severity, true)));
        expect(validateParams(params)).not.toBeNull();

        const storage = new FakeStorage();
        const store = new LocalProfileStore({ storage });
        await store.saveResult((await store.getActiveProfile())!.id, params);
        // A fresh instance re-reads cvd-app/v1, as the radar route does
        const saved = (await new LocalProfileStore({ storage }).getActiveProfile())!.latestResult!;
        expect(saved).toMatchObject({ type: params.type, level: params.level, severity: params.severity, confidence: params.confidence });

        const eff = effectiveRadar(saved, null);
        expect(eff.source).toBe('result');
        expect(eff.normal).toBe(saved.type === 'normal');
        expect(eff.sims).toEqual(simsForResult(saved.type, saved.severity));

        const u = simUniforms(eff.sims);
        expect(u.count).toBe(eff.sims.length);
        eff.sims.forEach((s, i) => {
          expect(Array.from(i === 0 ? u.sim0 : u.sim1)).toEqual(Array.from(toGLMat3(machadoMatrix(s.type, s.severity))));
        });
        if (saved.type === 'rg_uncertain') {
          expect(eff.sims.map(s => s.type)).toEqual(['protan', 'deutan']);
          expect(eff.sims[0].severity).toBe(eff.sims[1].severity);
        }
        seen.add(saved.type);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  }
});
