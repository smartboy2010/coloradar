/**
 * OKLab / OKLCh conversions.
 * Used for perceptual color difference calculations.
 */

import type { RGB } from './srgb.js';

export type OKLab = [number, number, number]; // [L, a, b]
export type OKLCh = [number, number, number]; // [L, C, h]

// Linear sRGB → LMS (Oklab M1)
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;

// LMS^(1/3) → OKLab (M2)
const M2 = [
  [0.2104542553, 0.7936177850, -0.0040720468],
  [1.9779984951, -2.4285922050, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.8086757660],
] as const;

// Inverse M2
const M2_INV = [
  [1.0000000000, 0.3963377774, 0.2158037573],
  [1.0000000000, -0.1055613458, -0.0638541728],
  [1.0000000000, -0.0894841775, -1.2914855480],
] as const;

// Inverse M1
const M1_INV = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.7076147010],
] as const;

function cbrt(x: number): number {
  return x >= 0 ? Math.pow(x, 1 / 3) : -Math.pow(-x, 1 / 3);
}

/** Linear sRGB → OKLab */
export function linearRGBToOKLab(rgb: RGB): OKLab {
  const l = M1[0][0] * rgb[0] + M1[0][1] * rgb[1] + M1[0][2] * rgb[2];
  const m = M1[1][0] * rgb[0] + M1[1][1] * rgb[1] + M1[1][2] * rgb[2];
  const s = M1[2][0] * rgb[0] + M1[2][1] * rgb[1] + M1[2][2] * rgb[2];

  const l_ = cbrt(l);
  const m_ = cbrt(m);
  const s_ = cbrt(s);

  return [
    M2[0][0] * l_ + M2[0][1] * m_ + M2[0][2] * s_,
    M2[1][0] * l_ + M2[1][1] * m_ + M2[1][2] * s_,
    M2[2][0] * l_ + M2[2][1] * m_ + M2[2][2] * s_,
  ];
}

/** OKLab → Linear sRGB */
export function oklabToLinearRGB(lab: OKLab): RGB {
  const l_ = M2_INV[0][0] * lab[0] + M2_INV[0][1] * lab[1] + M2_INV[0][2] * lab[2];
  const m_ = M2_INV[1][0] * lab[0] + M2_INV[1][1] * lab[1] + M2_INV[1][2] * lab[2];
  const s_ = M2_INV[2][0] * lab[0] + M2_INV[2][1] * lab[1] + M2_INV[2][2] * lab[2];

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    M1_INV[0][0] * l + M1_INV[0][1] * m + M1_INV[0][2] * s,
    M1_INV[1][0] * l + M1_INV[1][1] * m + M1_INV[1][2] * s,
    M1_INV[2][0] * l + M1_INV[2][1] * m + M1_INV[2][2] * s,
  ];
}

/** OKLab → OKLCh */
export function oklabToOKLCh(lab: OKLab): OKLCh {
  const [L, a, b] = lab;
  const C = Math.sqrt(a * a + b * b);
  const h = Math.atan2(b, a) * (180 / Math.PI);
  return [L, C, h < 0 ? h + 360 : h];
}

/** OKLCh → OKLab */
export function oklchToOKLab(lch: OKLCh): OKLab {
  const [L, C, h] = lch;
  const hRad = h * (Math.PI / 180);
  return [L, C * Math.cos(hRad), C * Math.sin(hRad)];
}

/** Delta E in OKLab (Euclidean distance) */
export function deltaEOKLab(a: OKLab, b: OKLab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}
