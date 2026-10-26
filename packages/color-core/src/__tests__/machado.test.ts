import { describe, it, expect } from 'vitest';
import { machadoMatrix, simulateCVD, applyMatrix, type CVDType } from '../machado.js';
import type { RGB } from '../srgb.js';

function expectClose(a: number, b: number, tol = 1e-5): void {
  expect(Math.abs(a - b)).toBeLessThan(tol);
}

describe('Machado matrices', () => {
  it('severity 0 is identity for all types', () => {
    const types: CVDType[] = ['protan', 'deutan', 'tritan'];
    for (const t of types) {
      const m = machadoMatrix(t, 0);
      expect(m).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }
  });

  it('severity 1.0 protan: red channel reduced', () => {
    const rgb: RGB = [1, 0, 0];
    const sim = simulateCVD(rgb, 'protan', 1.0);
    expect(sim[0]).toBeLessThan(0.5);
  });

  it('severity 1.0 deutan: green mapped differently', () => {
    const rgb: RGB = [0, 1, 0];
    const sim = simulateCVD(rgb, 'deutan', 1.0);
    expect(sim[1]).toBeLessThan(1);
  });

  it('severity 1.0 tritan: blue channel altered', () => {
    const rgb: RGB = [0, 0, 1];
    const sim = simulateCVD(rgb, 'tritan', 1.0);
    expect(sim[2]).toBeLessThan(1);
  });

  it('interpolation at 0.5 gives intermediate values', () => {
    const m0 = machadoMatrix('protan', 0.0);
    const m10 = machadoMatrix('protan', 1.0);
    const m5 = machadoMatrix('protan', 0.5);
    for (let i = 0; i < 9; i++) {
      expect(m5[i]).toBeGreaterThanOrEqual(Math.min(m0[i], m10[i]) - 0.01);
      expect(m5[i]).toBeLessThanOrEqual(Math.max(m0[i], m10[i]) + 0.01);
    }
  });

  it('interpolation at 0.15 works (between 0.1 and 0.2)', () => {
    const m = machadoMatrix('protan', 0.15);
    expect(m).toHaveLength(9);
    expect(m.every(v => isFinite(v))).toBe(true);
  });

  it('simulation preserves luminance roughly for neutral gray', () => {
    const gray: RGB = [0.5, 0.5, 0.5];
    const types: CVDType[] = ['protan', 'deutan', 'tritan'];
    for (const t of types) {
      const sim = simulateCVD(gray, t, 0.5);
      const lum = 0.2126 * sim[0] + 0.7152 * sim[1] + 0.0722 * sim[2];
      const origLum = 0.2126 * 0.5 + 0.7152 * 0.5 + 0.0722 * 0.5;
      expectClose(lum, origLum, 0.05);
    }
  });
});
