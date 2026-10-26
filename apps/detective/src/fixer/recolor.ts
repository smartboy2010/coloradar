/**
 * Recolor a full-size image from a palette mapping, and simulate CVD on images.
 *
 * Each distinct pixel color is explained as a blend of its best-fitting pair
 * among the 3 nearest palette colors (nearest by OKLab ΔE). The pair's color
 * changes are interpolated by the blend factor, then attenuated by how far the
 * pixel is from that blend line. So exact palette pixels map exactly, anti-aliased
 * edges and gradients between palette colors stay smooth, unchanged colors
 * (background) pull blends toward "no change", and unrelated colors are left alone.
 */

import {
  srgb8ToOKLab,
  SRGB8_TO_LINEAR,
  linearToSrgb8,
  machadoMatrix,
  type OKLab,
} from '@cvd-tools/color-core';
import type { ImageLike, RGB8, SimSpec } from './types.js';
import { segmentProjection } from './palette.js';

/** Residual (8-bit sRGB units) at which a pixel gets ~37% of the change */
const ATTENUATION_RADIUS = 48;
/** A blend must beat the nearest single color by this much (8-bit units) to be used */
const BLEND_PREFERENCE = 2;

export interface PaletteMapping {
  from: RGB8[];
  to: RGB8[];
}

function d2(a: OKLab, b: OKLab): number {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Map a single 8-bit color through the palette mapping (exported for tests). */
export function recolorPixel(rgb: RGB8, mapping: PaletteMapping, fromLabs: OKLab[]): RGB8 {
  const { from, to } = mapping;
  const n = from.length;
  if (n === 0) return [...rgb] as RGB8;
  const lab = srgb8ToOKLab(rgb[0], rgb[1], rgb[2]);

  // 3 nearest palette colors
  const near: number[] = [];
  const nd: number[] = [];
  for (let k = 0; k < n; k++) {
    const dd = d2(lab, fromLabs[k]);
    let pos = near.length;
    while (pos > 0 && nd[pos - 1] > dd) pos--;
    if (pos < 3) {
      near.splice(pos, 0, k);
      nd.splice(pos, 0, dd);
      if (near.length > 3) {
        near.pop();
        nd.pop();
      }
    }
  }

  // Blend partners: one end among the 3 nearest, the other any palette color
  // (the far end of an anti-aliased edge, e.g. the background, is often not "near").
  let bestA = near[0], bestB = near[0], bestT = 0;
  let bestR = Math.hypot(rgb[0] - from[near[0]][0], rgb[1] - from[near[0]][1], rgb[2] - from[near[0]][2]);
  for (const a of near) {
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      const [t, r] = segmentProjection(rgb, from[a], from[b]);
      // Prefer the plain nearest color unless a blend explains the pixel clearly better
      if (r < bestR - BLEND_PREFERENCE) {
        bestR = r;
        bestA = a;
        bestB = b;
        bestT = t;
      }
    }
  }

  const dA = [to[bestA][0] - from[bestA][0], to[bestA][1] - from[bestA][1], to[bestA][2] - from[bestA][2]];
  const dB = [to[bestB][0] - from[bestB][0], to[bestB][1] - from[bestB][1], to[bestB][2] - from[bestB][2]];
  if (dA[0] === 0 && dA[1] === 0 && dA[2] === 0 && dB[0] === 0 && dB[1] === 0 && dB[2] === 0) {
    return [...rgb] as RGB8;
  }
  const atten = Math.exp(-((bestR / ATTENUATION_RADIUS) ** 2));
  const w = atten;
  return [
    clamp255(rgb[0] + w * ((1 - bestT) * dA[0] + bestT * dB[0])),
    clamp255(rgb[1] + w * ((1 - bestT) * dA[1] + bestT * dB[1])),
    clamp255(rgb[2] + w * ((1 - bestT) * dA[2] + bestT * dB[2])),
  ];
}

/** Recolor every pixel (alpha preserved). Distinct colors are cached, so flat charts are fast. */
export function recolorImage(img: ImageLike, mapping: PaletteMapping): Uint8ClampedArray {
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const fromLabs = mapping.from.map(c => srgb8ToOKLab(c[0], c[1], c[2]));
  const cache = new Map<number, number>();
  for (let o = 0; o < src.length; o += 4) {
    const key = (src[o] << 16) | (src[o + 1] << 8) | src[o + 2];
    let v = cache.get(key);
    if (v === undefined) {
      const c = recolorPixel([src[o], src[o + 1], src[o + 2]], mapping, fromLabs);
      v = (c[0] << 16) | (c[1] << 8) | c[2];
      cache.set(key, v);
    }
    out[o] = (v >> 16) & 255;
    out[o + 1] = (v >> 8) & 255;
    out[o + 2] = v & 255;
    out[o + 3] = src[o + 3];
  }
  return out;
}

/** Apply a Machado simulation to every pixel (linear-light, via lookup tables). */
export function simulateImage(img: ImageLike, sim: SimSpec): Uint8ClampedArray {
  const m = machadoMatrix(sim.type, sim.severity);
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const cache = new Map<number, number>();
  for (let o = 0; o < src.length; o += 4) {
    const key = (src[o] << 16) | (src[o + 1] << 8) | src[o + 2];
    let v = cache.get(key);
    if (v === undefined) {
      const r = SRGB8_TO_LINEAR[src[o]], g = SRGB8_TO_LINEAR[src[o + 1]], b = SRGB8_TO_LINEAR[src[o + 2]];
      const R = linearToSrgb8(m[0] * r + m[1] * g + m[2] * b);
      const G = linearToSrgb8(m[3] * r + m[4] * g + m[5] * b);
      const B = linearToSrgb8(m[6] * r + m[7] * g + m[8] * b);
      v = (R << 16) | (G << 8) | B;
      cache.set(key, v);
    }
    out[o] = (v >> 16) & 255;
    out[o + 1] = (v >> 8) & 255;
    out[o + 2] = v & 255;
    out[o + 3] = src[o + 3];
  }
  return out;
}
