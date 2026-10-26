import { describe, it, expect } from 'vitest';
import { createDefaultParams, machadoMatrix, applyMatrix, type CVDParams } from '@cvd-tools/color-core';
import { simsForResult } from '../../fixer/confusion.js';
import { effectiveRadar, simUniforms, toGLMat3, RADAR_DEFAULT } from '../params.js';
import { legacyRadarToParams, migrateLegacyRadarParams, RADAR_LEGACY_KEY } from '../../store/radarLegacy.js';
import { LocalProfileStore, type KeyValueStorage } from '../../store/LocalProfileStore.js';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
}

function result(type: CVDParams['type'], severity = 0.55): CVDParams {
  return { ...createDefaultParams(), type, level: type === 'normal' ? 'none' : 'moderate', severity, confidence: 'medium' };
}

/** Multiply a column-major GL mat3 by a vector, as GLSL does. */
function glMul(m: Float32Array, v: [number, number, number]): number[] {
  return [0, 1, 2].map(r => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);
}

describe('radar params', () => {
  it('uses the same simulations as the Chart Fixer for every result type', () => {
    for (const type of ['protan', 'deutan', 'tritan', 'rg_uncertain', 'normal'] as const) {
      expect(effectiveRadar(result(type), null).sims).toEqual(simsForResult(type, 0.55));
    }
  });

  it('rg_uncertain runs protan and deutan at the same severity (worst case)', () => {
    const eff = effectiveRadar(result('rg_uncertain', 0.7), null);
    expect(eff.sims).toEqual([{ type: 'protan', severity: 0.7 }, { type: 'deutan', severity: 0.7 }]);
    expect(simUniforms(eff.sims).count).toBe(2);
  });

  it('normal results need no enhancement', () => {
    const eff = effectiveRadar(result('normal', 0), null);
    expect(eff.normal).toBe(true);
    expect(simUniforms(eff.sims).count).toBe(0);
  });

  it('override wins over the saved result, default applies without one', () => {
    expect(effectiveRadar(result('normal', 0), { type: 'tritan', severity: 0.4 })).toMatchObject({
      source: 'override', normal: false, sims: [{ type: 'tritan', severity: 0.4 }],
    });
    expect(effectiveRadar(null, null)).toMatchObject({ source: 'default', type: RADAR_DEFAULT.type, severity: RADAR_DEFAULT.severity });
  });

  it('uploads continuous-severity Machado matrices in GL column-major order', () => {
    const v: [number, number, number] = [0.8, 0.3, 0.1];
    const u = simUniforms([{ type: 'deutan', severity: 0.55 }]);
    const expected = applyMatrix(machadoMatrix('deutan', 0.55), v);
    glMul(u.sim0, v).forEach((x, i) => expect(x).toBeCloseTo(expected[i], 6));
    // 0.55 is interpolated, not snapped to a 0.1 step
    expect(Array.from(toGLMat3(machadoMatrix('deutan', 0.55)))).not.toEqual(Array.from(toGLMat3(machadoMatrix('deutan', 0.5))));
  });
});

describe('legacy radar params migration', () => {
  it('maps the old three-step severity onto the matrices it used to render', () => {
    expect(legacyRadarToParams('{"type":"protan","severity":"strong"}')).toMatchObject({ type: 'protan', level: 'severe', severity: 1, confidence: 'low' });
    expect(legacyRadarToParams('{"type":"deutan","severity":"mild"}')).toMatchObject({ level: 'mild', severity: 0.1 });
    expect(legacyRadarToParams('{"type":"x","severity":"mild"}')).toBeNull();
    expect(legacyRadarToParams('not json')).toBeNull();
  });

  it('fills an empty profile once and removes the old key', async () => {
    const storage = new FakeStorage();
    storage.setItem(RADAR_LEGACY_KEY, '{"type":"deutan","severity":"moderate"}');
    const store = new LocalProfileStore({ storage });
    expect(await migrateLegacyRadarParams(store, storage)).toBe(true);
    expect((await store.getActiveProfile())?.latestResult).toMatchObject({ type: 'deutan', severity: 0.5 });
    expect(storage.getItem(RADAR_LEGACY_KEY)).toBeNull();
  });

  it('never overwrites an existing detective result', async () => {
    const storage = new FakeStorage();
    const store = new LocalProfileStore({ storage });
    const p = await store.getActiveProfile();
    await store.saveResult(p!.id, result('protan', 0.8));
    storage.setItem(RADAR_LEGACY_KEY, '{"type":"tritan","severity":"strong"}');
    expect(await migrateLegacyRadarParams(store, storage)).toBe(false);
    expect((await store.getActiveProfile())?.latestResult?.type).toBe('protan');
  });
});
