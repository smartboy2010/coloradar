/**
 * Dot mosaic stimulus generation on Canvas 2D.
 * Random dot sizes, luminance noise ±25%, devicePixelRatio handling.
 */

import {
  linearRGBToSrgb,
  srgbTo8bit,
  clampRGB,
  uvPrimeYToXYZ,
  xyzToLinearRGB,
  offsetAlongAxis,
  D65_UV,
  isInGamut,
  type UVPrime,
  type ConfusionAxis,
  type RGB,
} from '@cvd-tools/color-core';

export interface StimulusConfig {
  cellSize: number;
  bgLuminance: number;       // Y value for background, typically ~0.2
  luminanceNoise: number;    // fraction, e.g. 0.25 for ±25%
  dotMinRadius: number;
  dotMaxRadius: number;
  dotPacking: number;        // attempts per cell
  gapSize: number;           // gap between cells in px
}

export const DEFAULT_CONFIG: StimulusConfig = {
  cellSize: 140,
  bgLuminance: 0.2,
  luminanceNoise: 0.25,
  dotMinRadius: 3,
  dotMaxRadius: 9,
  dotPacking: 200,
  gapSize: 8,
};

interface Dot {
  x: number;
  y: number;
  r: number;
}

function packDots(
  width: number,
  height: number,
  minR: number,
  maxR: number,
  attempts: number,
  rng: () => number,
): Dot[] {
  const dots: Dot[] = [];
  for (let i = 0; i < attempts; i++) {
    const r = minR + rng() * (maxR - minR);
    const x = r + rng() * (width - 2 * r);
    const y = r + rng() * (height - 2 * r);
    let overlaps = false;
    for (const d of dots) {
      const dx = d.x - x;
      const dy = d.y - y;
      if (dx * dx + dy * dy < (d.r + r + 1) * (d.r + r + 1)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) dots.push({ x, y, r });
  }
  return dots;
}

function colorForDot(
  baseUV: UVPrime,
  baseLuminance: number,
  luminanceNoise: number,
  rng: () => number,
): RGB | null {
  const Y = baseLuminance * (1 + (rng() * 2 - 1) * luminanceNoise);
  const xyz = uvPrimeYToXYZ(baseUV, Math.max(0.01, Y));
  const linRGB = xyzToLinearRGB(xyz);
  if (!isInGamut(linRGB, 0.01)) return null;
  return clampRGB(linRGB);
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

export interface TrialStimulus {
  targetIndex: number;  // which of the 4 cells is different (0–3)
  axis: ConfusionAxis;
  offset: number;       // u'v' offset distance
}

/**
 * Draw a 4-cell stimulus onto a canvas.
 * Returns the drawn canvas for display.
 */
export function drawStimulus(
  canvas: HTMLCanvasElement,
  trial: TrialStimulus,
  config: StimulusConfig = DEFAULT_CONFIG,
  seed?: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const { cellSize, gapSize } = config;
  const totalSize = cellSize * 2 + gapSize * 3;

  canvas.width = totalSize * dpr;
  canvas.height = totalSize * dpr;
  canvas.style.width = `${totalSize}px`;
  canvas.style.height = `${totalSize}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, totalSize, totalSize);

  const rng = seededRng(seed ?? Date.now());

  const positions = [
    [gapSize, gapSize],
    [gapSize + cellSize + gapSize, gapSize],
    [gapSize, gapSize + cellSize + gapSize],
    [gapSize + cellSize + gapSize, gapSize + cellSize + gapSize],
  ];

  for (let i = 0; i < 4; i++) {
    const [ox, oy] = positions[i];
    const isTarget = i === trial.targetIndex;
    const uv: UVPrime = isTarget
      ? offsetAlongAxis(D65_UV, trial.axis, trial.offset)
      : D65_UV;

    const dots = packDots(
      cellSize, cellSize,
      config.dotMinRadius, config.dotMaxRadius,
      config.dotPacking, rng,
    );

    for (const dot of dots) {
      const linRGB = colorForDot(uv, config.bgLuminance, config.luminanceNoise, rng);
      if (!linRGB) continue;
      const srgb = linearRGBToSrgb(linRGB);
      const [r8, g8, b8] = srgbTo8bit(srgb);
      ctx.beginPath();
      ctx.arc(ox + dot.x, oy + dot.y, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r8},${g8},${b8})`;
      ctx.fill();
    }
  }
}

/**
 * Draw an attention check trial: one cell is clearly brighter.
 */
export function drawAttentionCheck(
  canvas: HTMLCanvasElement,
  targetIndex: number,
  config: StimulusConfig = DEFAULT_CONFIG,
  seed?: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const { cellSize, gapSize } = config;
  const totalSize = cellSize * 2 + gapSize * 3;

  canvas.width = totalSize * dpr;
  canvas.height = totalSize * dpr;
  canvas.style.width = `${totalSize}px`;
  canvas.style.height = `${totalSize}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, totalSize, totalSize);

  const rng = seededRng(seed ?? Date.now());

  const positions = [
    [gapSize, gapSize],
    [gapSize + cellSize + gapSize, gapSize],
    [gapSize, gapSize + cellSize + gapSize],
    [gapSize + cellSize + gapSize, gapSize + cellSize + gapSize],
  ];

  for (let i = 0; i < 4; i++) {
    const [ox, oy] = positions[i];
    const isTarget = i === targetIndex;
    const Y = isTarget ? config.bgLuminance * 2.0 : config.bgLuminance;

    const dots = packDots(
      cellSize, cellSize,
      config.dotMinRadius, config.dotMaxRadius,
      config.dotPacking, rng,
    );

    for (const dot of dots) {
      const dotY = Y * (1 + (rng() * 2 - 1) * config.luminanceNoise * 0.5);
      const xyz = uvPrimeYToXYZ(D65_UV, Math.max(0.01, dotY));
      const linRGB = xyzToLinearRGB(xyz);
      if (!isInGamut(linRGB, 0.01)) continue;
      const srgb = linearRGBToSrgb(clampRGB(linRGB));
      const [r8, g8, b8] = srgbTo8bit(srgb);
      ctx.beginPath();
      ctx.arc(ox + dot.x, oy + dot.y, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r8},${g8},${b8})`;
      ctx.fill();
    }
  }
}
