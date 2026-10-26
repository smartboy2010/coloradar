/**
 * OKLCh helpers with sRGB gamut handling, plus 8-bit sRGB ↔ OKLab shortcuts.
 */

import type { RGB } from './srgb.js';
import { linearRGBToOKLab, oklabToLinearRGB, oklchToOKLab, type OKLab, type OKLCh } from './oklab.js';
import { SRGB8_TO_LINEAR, linearToSrgb8 } from './srgbLut.js';

/** Linear RGB inside [0,1]³ (with tolerance) */
export function linearInGamut(rgb: RGB, tolerance = 1e-4): boolean {
  return rgb[0] >= -tolerance && rgb[0] <= 1 + tolerance
    && rgb[1] >= -tolerance && rgb[1] <= 1 + tolerance
    && rgb[2] >= -tolerance && rgb[2] <= 1 + tolerance;
}

export function oklabInGamut(lab: OKLab, tolerance = 1e-4): boolean {
  return linearInGamut(oklabToLinearRGB(lab), tolerance);
}

/**
 * Reduce chroma (keeping L and h) until the color fits in sRGB.
 * L is clamped to [0,1]; returns an in-gamut OKLCh.
 */
export function clampChromaToGamut(lch: OKLCh): OKLCh {
  const L = Math.max(0, Math.min(1, lch[0]));
  const h = lch[2];
  if (oklabInGamut(oklchToOKLab([L, lch[1], h]))) return [L, lch[1], h];
  let lo = 0;
  let hi = lch[1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (oklabInGamut(oklchToOKLab([L, mid, h]))) lo = mid;
    else hi = mid;
  }
  return [L, lo, h];
}

/** 8-bit sRGB → OKLab (via lookup table) */
export function srgb8ToOKLab(r: number, g: number, b: number): OKLab {
  return linearRGBToOKLab([SRGB8_TO_LINEAR[r], SRGB8_TO_LINEAR[g], SRGB8_TO_LINEAR[b]]);
}

/** OKLab → 8-bit sRGB (clamped to gamut per channel) */
export function oklabToSrgb8(lab: OKLab): [number, number, number] {
  const lin = oklabToLinearRGB(lab);
  return [linearToSrgb8(lin[0]), linearToSrgb8(lin[1]), linearToSrgb8(lin[2])];
}

export function rgb8ToHex(rgb: readonly [number, number, number] | readonly number[]): string {
  return '#' + [rgb[0], rgb[1], rgb[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb8(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
