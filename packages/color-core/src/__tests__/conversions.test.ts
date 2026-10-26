import { describe, it, expect } from 'vitest';
import {
  srgbToLinear,
  linearToSrgb,
  srgbToLinearRGB,
  linearRGBToSrgb,
} from '../srgb.js';
import {
  linearRGBToXYZ,
  xyzToLinearRGB,
  xyzToUVPrime,
  uvPrimeYToXYZ,
  isInGamut,
  maxGamutOffset,
  D65_UV,
} from '../xyz.js';
import {
  linearRGBToOKLab,
  oklabToLinearRGB,
  oklabToOKLCh,
  oklchToOKLab,
  deltaEOKLab,
} from '../oklab.js';
import type { RGB } from '../srgb.js';

function expectClose(a: number, b: number, tol = 1e-5): void {
  expect(Math.abs(a - b)).toBeLessThan(tol);
}

function expectRGBClose(a: RGB, b: RGB, tol = 1e-5): void {
  expectClose(a[0], b[0], tol);
  expectClose(a[1], b[1], tol);
  expectClose(a[2], b[2], tol);
}

describe('sRGB ↔ linear', () => {
  it('should round-trip sRGB ↔ linear for known values', () => {
    const values = [0, 0.04045, 0.5, 0.75, 1.0];
    for (const v of values) {
      expectClose(linearToSrgb(srgbToLinear(v)), v, 1e-7);
    }
  });

  it('sRGB 0.5 → linear ≈ 0.214', () => {
    expectClose(srgbToLinear(0.5), 0.2140, 0.001);
  });

  it('linear 0.5 → sRGB ≈ 0.735', () => {
    expectClose(linearToSrgb(0.5), 0.7354, 0.001);
  });

  it('should round-trip RGB triples', () => {
    const rgb: RGB = [0.3, 0.6, 0.9];
    const roundTrip = linearRGBToSrgb(srgbToLinearRGB(rgb));
    expectRGBClose(roundTrip, rgb);
  });
});

describe('Linear RGB ↔ XYZ', () => {
  it('D65 white (1,1,1) → XYZ ≈ (0.9505, 1.0, 1.089)', () => {
    const xyz = linearRGBToXYZ([1, 1, 1]);
    expectClose(xyz[0], 0.9505, 0.001);
    expectClose(xyz[1], 1.0, 0.001);
    expectClose(xyz[2], 1.089, 0.001);
  });

  it('should round-trip RGB → XYZ → RGB', () => {
    const rgb: RGB = [0.2, 0.4, 0.6];
    const roundTrip = xyzToLinearRGB(linearRGBToXYZ(rgb));
    expectRGBClose(roundTrip, rgb, 1e-6);
  });

  it('black (0,0,0) → XYZ (0,0,0)', () => {
    const xyz = linearRGBToXYZ([0, 0, 0]);
    expectClose(xyz[0], 0);
    expectClose(xyz[1], 0);
    expectClose(xyz[2], 0);
  });
});

describe('XYZ ↔ u\'v\'', () => {
  it('D65 white u\'v\' ≈ (0.198, 0.468)', () => {
    const xyz = linearRGBToXYZ([1, 1, 1]);
    const uv = xyzToUVPrime(xyz);
    expectClose(uv[0], 0.198, 0.002);
    expectClose(uv[1], 0.468, 0.002);
  });

  it('should round-trip u\'v\' + Y → XYZ → u\'v\'', () => {
    const origUV = D65_UV;
    const Y = 0.5;
    const xyz = uvPrimeYToXYZ(origUV, Y);
    const uv = xyzToUVPrime(xyz);
    expectClose(uv[0], origUV[0], 1e-6);
    expectClose(uv[1], origUV[1], 1e-6);
    expectClose(xyz[1], Y, 1e-6);
  });
});

describe('Gamut checking', () => {
  it('pure sRGB primaries are in gamut', () => {
    expect(isInGamut([1, 0, 0])).toBe(true);
    expect(isInGamut([0, 1, 0])).toBe(true);
    expect(isInGamut([0, 0, 1])).toBe(true);
  });

  it('out-of-gamut values detected', () => {
    expect(isInGamut([-0.1, 0.5, 0.5])).toBe(false);
    expect(isInGamut([0.5, 1.1, 0.5])).toBe(false);
  });

  it('maxGamutOffset returns a positive value', () => {
    const offset = maxGamutOffset('protan', 0.2);
    expect(offset).toBeGreaterThan(0.001);
    expect(offset).toBeLessThan(0.3);
  });
});

describe('OKLab', () => {
  it('should round-trip linear RGB → OKLab → linear RGB', () => {
    const rgb: RGB = [0.3, 0.5, 0.7];
    const lab = linearRGBToOKLab(rgb);
    const roundTrip = oklabToLinearRGB(lab);
    expectRGBClose(roundTrip, rgb, 1e-5);
  });

  it('white → OKLab L ≈ 1.0', () => {
    const lab = linearRGBToOKLab([1, 1, 1]);
    expectClose(lab[0], 1.0, 0.01);
    expectClose(lab[1], 0, 0.01);
    expectClose(lab[2], 0, 0.01);
  });

  it('black → OKLab L ≈ 0', () => {
    const lab = linearRGBToOKLab([0, 0, 0]);
    expectClose(lab[0], 0, 0.001);
  });

  it('OKLab ↔ OKLCh round-trip', () => {
    const lab = linearRGBToOKLab([0.5, 0.2, 0.8]);
    const lch = oklabToOKLCh(lab);
    const labBack = oklchToOKLab(lch);
    expectClose(labBack[0], lab[0], 1e-10);
    expectClose(labBack[1], lab[1], 1e-10);
    expectClose(labBack[2], lab[2], 1e-10);
  });

  it('deltaE is 0 for identical colors', () => {
    const lab = linearRGBToOKLab([0.5, 0.3, 0.7]);
    expectClose(deltaEOKLab(lab, lab), 0, 1e-15);
  });

  it('deltaE is positive for different colors', () => {
    const a = linearRGBToOKLab([0.5, 0.0, 0.0]);
    const b = linearRGBToOKLab([0.0, 0.5, 0.0]);
    expect(deltaEOKLab(a, b)).toBeGreaterThan(0.01);
  });
});
