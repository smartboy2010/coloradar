/**
 * Lookup tables for fast 8-bit sRGB ↔ linear conversion.
 * Per-pixel Math.pow is too slow for multi-megapixel images.
 */

import { srgbToLinear, linearToSrgb } from './srgb.js';

/** 256-entry table: 8-bit sRGB channel → linear [0,1] */
export const SRGB8_TO_LINEAR: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

const ENCODE_SIZE = 4096;

const LINEAR_TO_SRGB8: Uint8Array = (() => {
  const lut = new Uint8Array(ENCODE_SIZE + 1);
  for (let i = 0; i <= ENCODE_SIZE; i++) {
    lut[i] = Math.round(linearToSrgb(i / ENCODE_SIZE) * 255);
  }
  return lut;
})();

/** Linear [0,1] → 8-bit sRGB channel (clamped). Max error ±1 code value in the darkest tones. */
export function linearToSrgb8(v: number): number {
  if (!(v > 0)) return 0;
  if (v >= 1) return 255;
  // Exact formula below ~0.004 where the table is too coarse for the steep gamma toe
  if (v < 0.004) return Math.round(linearToSrgb(v) * 255);
  return LINEAR_TO_SRGB8[Math.round(v * ENCODE_SIZE)];
}
