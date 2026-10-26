/**
 * Palette optimization: move only the confused chromatic colors, as little as
 * possible, until every originally-distinct pair is distinct in simulation.
 *
 * cost = Σ change(i) weighted by area  +  separation penalty over ALL pairs
 *        (including unchanged ones)    +  hue-shift penalty
 *
 * Search: OKLCh candidate grid around each original color (lightness, chroma,
 * limited hue), clipped into sRGB, coordinate descent over clusters with the
 * smallest areas first. A hard constraint rejects any candidate that makes a
 * previously fine pair confused, so fixing one pair never creates another.
 */

import {
  oklabToOKLCh,
  oklchToOKLab,
  clampChromaToGamut,
  deltaEOKLab,
  type OKLab,
} from '@cvd-tools/color-core';
import type { Confusion, PaletteColor, SimSpec } from './types.js';
import { findConfusions, simulateLab, simDistance, pairKey } from './confusion.js';

const L_STEPS = Array.from({ length: 25 }, (_, i) => Math.round((i - 12) * 0.035 * 1000) / 1000);
const C_FACTORS = [0.4, 0.6, 0.8, 1, 1.25, 1.5, 1.8];
const H_STEPS = [-45, -30, -15, 0, 15, 30, 45];

const SEPARATION_STEP = 1;
const SEPARATION_WEIGHT = 10;
const HUE_WEIGHT = 0.02;
const AREA_WEIGHT = 25;
const MAX_ROUNDS = 8;

export interface OptimizeInput {
  colors: PaletteColor[];
  sims: SimSpec[];
  tau: number;
  /** Palette ids that must not change */
  locked?: Set<number>;
}

export interface OptimizeResult {
  labs: OKLab[];
  changed: number[];
  before: Confusion[];
  after: Confusion[];
  introduced: Confusion[];
}

interface Candidate {
  lab: OKLab;
  /** Simulated labs, index 0 = normal vision, then one per sim */
  views: OKLab[];
  changeCost: number;
}

function hueDelta(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function views(lab: OKLab, sims: SimSpec[]): OKLab[] {
  return [lab, ...sims.map(s => simulateLab(lab, s))];
}

function buildCandidates(color: PaletteColor, sims: SimSpec[]): Candidate[] {
  const [L0, C0, h0] = oklabToOKLCh(color.lab);
  const weight = 1 + AREA_WEIGHT * color.share;
  // Thin elements: prefer lightness changes over chroma/hue changes
  const kL = color.thin ? 0.6 : 1;
  const kAB = color.thin ? 1.6 : 1;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const dL of L_STEPS) {
    for (const cf of C_FACTORS) {
      for (const dh of H_STEPS) {
        const lch = clampChromaToGamut([L0 + dL, C0 * cf, h0 + dh]);
        const lab = oklchToOKLab(lch);
        const key = lab.map(v => v.toFixed(3)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const eL = lab[0] - color.lab[0];
        const ea = lab[1] - color.lab[1];
        const eb = lab[2] - color.lab[2];
        const realDh = hueDelta(h0, lch[2]);
        const hueCost = HUE_WEIGHT * (realDh / 45) ** 2 * Math.min(1, C0 / 0.1);
        out.push({
          lab,
          views: views(lab, sims),
          changeCost: weight * (kL * eL * eL + kAB * (ea * ea + eb * eb)) + hueCost,
        });
      }
    }
  }
  return out;
}

export function optimizePalette(input: OptimizeInput): OptimizeResult {
  const { colors, sims, tau } = input;
  const locked = input.locked ?? new Set<number>();
  const n = colors.length;
  const original = colors.map(c => c.lab);
  const before = findConfusions(colors, sims, tau);
  if (before.length === 0) {
    return { labs: original.map(l => [...l] as OKLab), changed: [], before, after: [], introduced: [] };
  }

  const confusedKeys = new Set(before.map(c => pairKey(c.a, c.b)));
  const modifiable = new Set<number>();
  for (const c of before) {
    for (const id of [c.a, c.b]) {
      if (!colors[id].neutral && !locked.has(id)) modifiable.add(id);
    }
  }

  // Pairs that must be kept apart: originally ≥ τ for normal vision
  const mustSeparate: boolean[][] = colors.map((a, i) => colors.map((b, j) =>
    i !== j && !(a.neutral && b.neutral) && deltaEOKLab(a.lab, b.lab) >= tau));

  const current: OKLab[] = original.map(l => [...l] as OKLab);
  const currentViews: OKLab[][] = current.map(l => views(l, sims));
  const candidates = new Map<number, Candidate[]>();
  const chosen = new Map<number, Candidate>();
  for (const id of modifiable) {
    const unchanged: Candidate = { lab: current[id], views: currentViews[id], changeCost: 0 };
    candidates.set(id, [unchanged, ...buildCandidates(colors[id], sims)]);
    chosen.set(id, unchanged);
  }

  const pairWorst = (vi: OKLab[], vj: OKLab[], thin: boolean): number => {
    let worst = Infinity;
    for (let s = 0; s < vi.length; s++) {
      const d = simDistance(vi[s], vj[s], thin);
      if (d < worst) worst = d;
    }
    return worst;
  };

  /** Cost of placing color i at `cand` given everyone else's current color; Infinity if infeasible. */
  const evaluate = (i: number, cand: Candidate): number => {
    let cost = cand.changeCost;
    for (let j = 0; j < n; j++) {
      if (!mustSeparate[i][j]) continue;
      const d = pairWorst(cand.views, currentViews[j], colors[i].thin || colors[j].thin);
      if (d < tau) {
        if (!confusedKeys.has(pairKey(i, j))) return Infinity;
        // Step + linear: any unresolved pair outweighs any color change
        cost += SEPARATION_STEP + SEPARATION_WEIGHT * (tau - d);
      }
    }
    return cost;
  };

  const order = [...modifiable].sort((a, b) => colors[a].share - colors[b].share);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    for (const i of order) {
      const currentCost = evaluate(i, chosen.get(i)!);
      let best = chosen.get(i)!;
      let bestCost = currentCost;
      for (const cand of candidates.get(i)!) {
        const cost = evaluate(i, cand);
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = cand;
        }
      }
      if (best !== chosen.get(i)) {
        chosen.set(i, best);
        current[i] = best.lab;
        currentViews[i] = best.views;
        improved = true;
      }
    }
    if (!improved) break;
  }

  const after = findConfusions(colors, sims, tau, current);
  const introduced = after.filter(c => !confusedKeys.has(pairKey(c.a, c.b)));
  const changed = current
    .map((lab, i) => (deltaEOKLab(lab, original[i]) > 1e-6 ? i : -1))
    .filter(i => i >= 0);
  return { labs: current, changed, before, after, introduced };
}
