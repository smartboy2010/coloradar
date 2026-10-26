/**
 * Linear RGB ↔ CIE XYZ ↔ CIE 1976 u'v' conversions.
 * Uses sRGB D65 primaries (IEC 61966-2-1).
 */

import type { RGB } from './srgb.js';

export type XYZ = [number, number, number];
export type UVPrime = [number, number];

// sRGB → XYZ (D65) matrix (IEC 61966-2-1)
const M_SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
] as const;

// XYZ → sRGB (D65) inverse matrix
const M_XYZ_TO_SRGB = [
  [ 3.2404542, -1.5371385, -0.4985314],
  [-0.9692660,  1.8760108,  0.0415560],
  [ 0.0556434, -0.2040259,  1.0572252],
] as const;

function matMul3(m: readonly (readonly number[])[], v: readonly number[]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Linear RGB → CIE XYZ (D65) */
export function linearRGBToXYZ(rgb: RGB): XYZ {
  return matMul3(M_SRGB_TO_XYZ, rgb);
}

/** CIE XYZ → Linear RGB (D65) */
export function xyzToLinearRGB(xyz: XYZ): RGB {
  return matMul3(M_XYZ_TO_SRGB, xyz);
}

/** CIE XYZ → CIE 1976 u'v' */
export function xyzToUVPrime(xyz: XYZ): UVPrime {
  const [X, Y, Z] = xyz;
  const denom = X + 15 * Y + 3 * Z;
  if (denom === 0) return [0, 0];
  return [
    (4 * X) / denom,
    (9 * Y) / denom,
  ];
}

/** CIE 1976 u'v' + Y → CIE XYZ */
export function uvPrimeYToXYZ(uv: UVPrime, Y: number): XYZ {
  const [u, v] = uv;
  if (v === 0) return [0, Y, 0];
  const X = Y * (9 * u) / (4 * v);
  const Z = Y * (12 - 3 * u - 20 * v) / (4 * v);
  return [X, Y, Z];
}

/** Check if linear RGB is within sRGB gamut (with small tolerance) */
export function isInGamut(rgb: RGB, tolerance = 1e-6): boolean {
  return rgb.every(c => c >= -tolerance && c <= 1 + tolerance);
}

/** D65 white point in u'v' */
export const D65_UV: UVPrime = [0.19784, 0.46832];

// Copunctal points from Cambridge Colour Test (CIE 1976 u'v')
export const COPUNCTAL_POINTS = {
  protan:  [0.678, 0.501] as UVPrime,
  deutan:  [-1.217, 0.782] as UVPrime,
  tritan:  [0.257, 0.0] as UVPrime,
} as const;

export type ConfusionAxis = keyof typeof COPUNCTAL_POINTS;

/**
 * Compute direction vector from background u'v' toward a copunctal point.
 * Returns a normalized direction in u'v' space.
 */
export function confusionDirection(axis: ConfusionAxis, bgUV: UVPrime = D65_UV): UVPrime {
  const cp = COPUNCTAL_POINTS[axis];
  const du = cp[0] - bgUV[0];
  const dv = cp[1] - bgUV[1];
  const len = Math.sqrt(du * du + dv * dv);
  if (len === 0) return [0, 0];
  return [du / len, dv / len];
}

/**
 * Offset a u'v' point along a confusion axis by a given distance.
 */
export function offsetAlongAxis(
  bgUV: UVPrime,
  axis: ConfusionAxis,
  distance: number,
): UVPrime {
  const dir = confusionDirection(axis, bgUV);
  return [
    bgUV[0] + dir[0] * distance,
    bgUV[1] + dir[1] * distance,
  ];
}

/**
 * Compute the maximum displayable offset along an axis at a given luminance Y.
 * Binary searches for the largest offset where the resulting sRGB is in-gamut.
 */
export function maxGamutOffset(
  axis: ConfusionAxis,
  Y: number,
  bgUV: UVPrime = D65_UV,
): number {
  let lo = 0;
  let hi = 0.3;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const uv = offsetAlongAxis(bgUV, axis, mid);
    const xyz = uvPrimeYToXYZ(uv, Y);
    const rgb = xyzToLinearRGB(xyz);
    if (isInGamut(rgb, 0.001)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
