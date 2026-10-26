import { describe, it, expect } from 'vitest';
import { srgbToLinear, linearToSrgb } from '../srgb.js';
import { SRGB8_TO_LINEAR, linearToSrgb8 } from '../srgbLut.js';
import {
  clampChromaToGamut,
  oklabInGamut,
  srgb8ToOKLab,
  oklabToSrgb8,
  rgb8ToHex,
  hexToRgb8,
} from '../gamut.js';
import { oklchToOKLab } from '../oklab.js';
import { validateParams, createDefaultParams } from '../params.js';

describe('sRGB lookup tables', () => {
  it('decode table matches the exact formula', () => {
    for (let i = 0; i < 256; i++) {
      expect(Math.abs(SRGB8_TO_LINEAR[i] - srgbToLinear(i / 255))).toBeLessThan(1e-6);
    }
  });

  it('encode round-trips every 8-bit value exactly', () => {
    for (let i = 0; i < 256; i++) {
      expect(linearToSrgb8(SRGB8_TO_LINEAR[i])).toBe(i);
    }
  });

  it('encode is within 1 code value of the exact formula and clamps', () => {
    for (let k = 0; k <= 2000; k++) {
      const v = k / 2000;
      const exact = Math.round(linearToSrgb(v) * 255);
      expect(Math.abs(linearToSrgb8(v) - exact)).toBeLessThanOrEqual(1);
    }
    expect(linearToSrgb8(-0.2)).toBe(0);
    expect(linearToSrgb8(1.3)).toBe(255);
    expect(linearToSrgb8(NaN)).toBe(0);
  });
});

describe('gamut helpers', () => {
  it('clampChromaToGamut leaves in-gamut colors unchanged', () => {
    const lch: [number, number, number] = [0.6, 0.05, 120];
    expect(clampChromaToGamut(lch)).toEqual(lch);
  });

  it('clampChromaToGamut reduces chroma of out-of-gamut colors but keeps L and h', () => {
    const out = clampChromaToGamut([0.7, 0.4, 150]);
    expect(out[0]).toBe(0.7);
    expect(out[2]).toBe(150);
    expect(out[1]).toBeLessThan(0.4);
    expect(out[1]).toBeGreaterThan(0.05);
    expect(oklabInGamut(oklchToOKLab(out))).toBe(true);
  });

  it('8-bit ↔ OKLab round-trips', () => {
    for (const rgb of [[255, 0, 0], [12, 200, 77], [0, 0, 0], [255, 255, 255], [31, 119, 180]] as const) {
      expect(oklabToSrgb8(srgb8ToOKLab(rgb[0], rgb[1], rgb[2]))).toEqual([...rgb]);
    }
  });

  it('hex helpers', () => {
    expect(rgb8ToHex([31, 119, 180])).toBe('#1f77b4');
    expect(hexToRgb8('#1f77b4')).toEqual([31, 119, 180]);
  });
});

describe('validateParams', () => {
  it('accepts a full v0.1 params object', () => {
    const p = { ...createDefaultParams(), type: 'deutan', level: 'moderate', severity: 0.55 };
    expect(validateParams(p)).toMatchObject({ type: 'deutan', level: 'moderate', severity: 0.55 });
  });

  it('normalizes missing optional detail', () => {
    const p = validateParams({
      schema: 'cvd-params/0.1', type: 'protan', level: 'mild', severity: 0.2, confidence: 'high',
    });
    expect(p?.thresholds).toEqual({ protan: 0, deutan: 0, tritan: 0 });
    expect(p?.device.selfReport).toEqual({});
  });

  it('rejects invalid input', () => {
    expect(validateParams(null)).toBeNull();
    expect(validateParams('x')).toBeNull();
    expect(validateParams({ ...createDefaultParams(), schema: 'cvd-params/9' })).toBeNull();
    expect(validateParams({ ...createDefaultParams(), type: 'purple' })).toBeNull();
    expect(validateParams({ ...createDefaultParams(), severity: 3 })).toBeNull();
    expect(validateParams({ ...createDefaultParams(), confidence: 'great' })).toBeNull();
  });
});
