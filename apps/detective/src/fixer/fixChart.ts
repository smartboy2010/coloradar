/**
 * End-to-end pipeline: palette → confusions → optimized palette → recolored image.
 * Pure; runs inside the Worker, and directly in tests.
 */

import {
  oklabToOKLCh,
  oklabToSrgb8,
  rgb8ToHex,
  deltaEOKLab,
  type OKLab,
} from '@cvd-tools/color-core';
import { extractPalette } from './palette.js';
import { optimizePalette } from './optimize.js';
import { recolorImage, simulateImage } from './recolor.js';
import type { ColorChange, FixOptions, FixReport, ImageLike, Palette, RGB8 } from './types.js';

/** Changes smaller than this are not reported as a change */
const MIN_REPORTED_CHANGE = 0.004;

function lockedIds(palette: Palette, locked: string[] | undefined): Set<number> {
  const ids = new Set<number>();
  if (!locked?.length) return ids;
  for (const hex of locked) {
    const exact = palette.colors.find(c => c.hex.toLowerCase() === hex.toLowerCase());
    if (exact) ids.add(exact.id);
  }
  return ids;
}

function hueDelta(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function planFix(palette: Palette, opts: FixOptions): Omit<FixReport, 'palette'> & { labs: OKLab[] } {
  const res = optimizePalette({
    colors: palette.colors,
    sims: opts.sims,
    tau: opts.tau,
    locked: lockedIds(palette, opts.locked),
  });
  const newRgb = res.labs.map(l => oklabToSrgb8(l) as RGB8);
  const changes: ColorChange[] = [];
  for (const id of res.changed) {
    const c = palette.colors[id];
    if (deltaEOKLab(c.lab, res.labs[id]) < MIN_REPORTED_CHANGE) continue;
    const [L0, C0, h0] = oklabToOKLCh(c.lab);
    const [L1, C1, h1] = oklabToOKLCh(res.labs[id]);
    const partners = res.before
      .filter(k => k.a === id || k.b === id)
      .map(k => (k.a === id ? k.b : k.a));
    changes.push({
      id,
      from: c.hex,
      to: rgb8ToHex(newRgb[id]),
      dL: L1 - L0,
      dC: C1 - C0,
      dh: C0 > 0.02 ? hueDelta(h0, h1) : 0,
      distinguishFrom: partners,
    });
  }

  const counts = opts.sims.map(() => 0);
  for (const k of res.before) if (k.sim >= 0) counts[k.sim]++;
  const viewSim = counts.length ? counts.indexOf(Math.max(...counts)) : -1;

  return {
    labs: res.labs,
    newColors: newRgb.map(rgb8ToHex),
    changes,
    before: res.before,
    after: res.after,
    introduced: res.introduced,
    sims: opts.sims,
    tau: opts.tau,
    viewSim,
  };
}

export interface FixOutput {
  report: FixReport;
  fixed: Uint8ClampedArray;
  /** Original and fixed images as seen with sims[viewSim]; absent if there is no simulation */
  simBefore?: Uint8ClampedArray;
  simAfter?: Uint8ClampedArray;
}

export function fixChart(img: ImageLike, opts: FixOptions): FixOutput {
  const palette = extractPalette(img);
  const plan = planFix(palette, opts);
  const { labs: _labs, ...rest } = plan;
  const report: FixReport = { palette, ...rest };

  const mapping = {
    from: palette.colors.map(c => c.rgb),
    to: plan.newColors.map((_, i) =>
      (plan.changes.some(ch => ch.id === i) ? oklabToSrgb8(plan.labs[i]) : palette.colors[i].rgb) as RGB8),
  };
  const fixed = plan.changes.length ? recolorImage(img, mapping) : new Uint8ClampedArray(img.data);

  const out: FixOutput = { report, fixed };
  if (plan.viewSim >= 0) {
    const sim = opts.sims[plan.viewSim];
    out.simBefore = simulateImage(img, sim);
    out.simAfter = simulateImage({ data: fixed, width: img.width, height: img.height }, sim);
  }
  return out;
}
