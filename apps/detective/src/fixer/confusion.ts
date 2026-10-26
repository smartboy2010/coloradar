/**
 * Confusion detection: which palette pairs a viewer cannot tell apart.
 *
 * A pair is confused when its normal-vision ΔE is at least τ (the designer
 * meant them to differ) but its simulated ΔE falls below τ for any of the
 * active simulations (worst case).
 */

import {
  machadoMatrix,
  applyMatrix,
  clampRGB,
  oklabToLinearRGB,
  linearRGBToOKLab,
  deltaEOKLab,
  type CVDParams,
  type OKLab,
} from '@cvd-tools/color-core';
import type { Confusion, PaletteColor, SimSpec } from './types.js';

export type FixMode = 'forMe' | 'forEveryone';

/** Base threshold in OKLab ΔE. Initial value; to be calibrated with the synthetic atlas and pilot data. */
export const TAU_BASE = 0.07;

const CONFIDENCE_MARGIN: Record<CVDParams['confidence'], number> = {
  high: 0.01,
  medium: 0.02,
  low: 0.03,
};
const EVERYONE_MARGIN = 0.02;

/** Blue–yellow (OKLab b) weight for pairs involving thin elements: that channel has low spatial resolution. */
export const THIN_B_WEIGHT = 0.6;

/** Machado simulations for a personal result. `normal` → none (nothing to fix). */
export function simsForResult(type: CVDParams['type'], severity: number): SimSpec[] {
  const s = Math.max(0, Math.min(1, severity));
  switch (type) {
    case 'protan':
    case 'deutan':
    case 'tritan':
      return [{ type, severity: s }];
    case 'rg_uncertain':
      return [{ type: 'protan', severity: s }, { type: 'deutan', severity: s }];
    case 'normal':
      return [];
  }
}

/**
 * Universal "for everyone" mode: severe protan + deutan (≈99% of CVD).
 * Tritan is opt-in because it constrains the palette much more for a rare condition.
 */
export function simsForEveryone(includeTritan = false): SimSpec[] {
  const sims: SimSpec[] = [{ type: 'protan', severity: 1 }, { type: 'deutan', severity: 1 }];
  if (includeTritan) sims.push({ type: 'tritan', severity: 1 });
  return sims;
}

/**
 * τ = base + margin × strength. Margin grows as confidence drops;
 * `strength` (0–2, default 1) is the user-facing safety-margin slider.
 */
export function computeTau(
  mode: FixMode,
  confidence: CVDParams['confidence'] | null,
  strength = 1,
): number {
  const margin = mode === 'forEveryone' ? EVERYONE_MARGIN : CONFIDENCE_MARGIN[confidence ?? 'low'];
  return TAU_BASE + margin * Math.max(0, Math.min(2, strength));
}

/** Simulate an OKLab color as seen with the given CVD, back into OKLab. */
export function simulateLab(lab: OKLab, sim: SimSpec): OKLab {
  const lin = clampRGB(oklabToLinearRGB(lab));
  return linearRGBToOKLab(clampRGB(applyMatrix(machadoMatrix(sim.type, sim.severity), lin)));
}

/** Distance used in simulated space; thin elements discount the blue–yellow channel. */
export function simDistance(a: OKLab, b: OKLab, thin: boolean): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = (a[2] - b[2]) * (thin ? THIN_B_WEIGHT : 1);
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Precompute simulated Labs: result[simIndex][colorIndex] */
export function simulatePalette(labs: OKLab[], sims: SimSpec[]): OKLab[][] {
  return sims.map(sim => labs.map(lab => simulateLab(lab, sim)));
}

export function findConfusions(
  colors: PaletteColor[],
  sims: SimSpec[],
  tau: number,
  labs: OKLab[] = colors.map(c => c.lab),
): Confusion[] {
  if (sims.length === 0) return [];
  const simLabs = simulatePalette(labs, sims);
  const out: Confusion[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (colors[i].neutral && colors[j].neutral) continue;
      const original = deltaEOKLab(colors[i].lab, colors[j].lab);
      if (original < tau) continue;
      const thin = colors[i].thin || colors[j].thin;
      let worst = Infinity;
      let worstSim = 0;
      for (let s = 0; s < sims.length; s++) {
        const d = simDistance(simLabs[s][i], simLabs[s][j], thin);
        if (d < worst) {
          worst = d;
          worstSim = s;
        }
      }
      // Also require the fixed colors to stay distinct for normal vision
      const normal = simDistance(labs[i], labs[j], thin);
      if (normal < worst) {
        worst = normal;
        worstSim = -1;
      }
      if (worst < tau) out.push({ a: i, b: j, original, simulated: worst, sim: worstSim });
    }
  }
  return out;
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
