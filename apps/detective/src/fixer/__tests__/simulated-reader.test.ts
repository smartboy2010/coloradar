/**
 * Simulated chart reader, adapted from the v0.1 simulated observer: a virtual
 * CVD reader tries to match each pair of legend colors. The chance of telling
 * a pair apart follows a Weibull psychometric function of the simulated ΔE.
 * We compare success rates on the original vs. fixed palettes.
 */

import { describe, it, expect } from 'vitest';
import { hexToRgb8, srgb8ToOKLab, oklabToOKLCh, type OKLab } from '@cvd-tools/color-core';
import { simsForResult, simsForEveryone, computeTau, simulateLab, simDistance } from '../confusion.js';
import { optimizePalette } from '../optimize.js';
import { TEST_PALETTES } from '../synthetic.js';
import type { PaletteColor, RGB8, SimSpec } from '../types.js';

const JND = 0.035;
const BETA = 3.5;
const RUNS = 40;

function pDistinguish(d: number): number {
  // 2AFC "same or different" with guessing floor 0.5
  return 0.5 + 0.5 * (1 - Math.exp(-((d / JND) ** BETA)));
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function toColors(hexes: string[]): PaletteColor[] {
  return ['#ffffff', ...hexes].map((hex, id) => {
    const rgb = hexToRgb8(hex) as RGB8;
    const lab = srgb8ToOKLab(rgb[0], rgb[1], rgb[2]);
    const chroma = oklabToOKLCh(lab)[1];
    return { id, lab, rgb, hex, share: id === 0 ? 0.7 : 0.05, chroma, neutral: chroma < 0.035, edgeRatio: 0.9, thin: true };
  });
}

function successRate(labs: OKLab[], viewer: SimSpec, seed: number): number {
  const rand = rng(seed);
  let ok = 0, total = 0;
  for (let run = 0; run < RUNS; run++) {
    for (let i = 1; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const d = simDistance(simulateLab(labs[i], viewer), simulateLab(labs[j], viewer), true);
        if (rand() < pDistinguish(d)) ok++;
        total++;
      }
    }
  }
  return ok / total;
}

describe('simulated chart reader', () => {
  const cases: Array<[string, SimSpec, SimSpec[], number]> = [
    ['deutan reader, personal fix', { type: 'deutan', severity: 1 }, simsForResult('deutan', 1), computeTau('forMe', 'high')],
    ['protan reader, personal fix', { type: 'protan', severity: 0.8 }, simsForResult('protan', 0.8), computeTau('forMe', 'high')],
    ['protan reader, universal fix', { type: 'protan', severity: 1 }, simsForEveryone(), computeTau('forEveryone', null)],
    ['deutan reader, universal fix', { type: 'deutan', severity: 1 }, simsForEveryone(), computeTau('forEveryone', null)],
  ];

  for (const [name, viewer, sims, tau] of cases) {
    it(`${name}: red-green palettes become readable`, () => {
      for (const pname of ['redGreen', 'trafficLight']) {
        const colors = toColors(TEST_PALETTES[pname]);
        const res = optimizePalette({ colors, sims, tau });
        const before = successRate(colors.map(c => c.lab), viewer, 1);
        const after = successRate(res.labs, viewer, 1);
        console.log(`${name} ${pname}: legend-matching ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%`);
        expect(after).toBeGreaterThanOrEqual(0.95);
        expect(after).toBeGreaterThanOrEqual(before);
        if (before < 0.95) expect(after - before).toBeGreaterThanOrEqual(0.1);
      }
    });
  }
});
