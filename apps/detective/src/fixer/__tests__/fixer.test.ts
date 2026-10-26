import { describe, it, expect } from 'vitest';
import { hexToRgb8, srgb8ToOKLab, deltaEOKLab, oklabToOKLCh, type CVDParams } from '@cvd-tools/color-core';
import {
  simsForResult,
  simsForEveryone,
  computeTau,
  findConfusions,
  simulateLab,
  TAU_BASE,
} from '../confusion.js';
import { optimizePalette } from '../optimize.js';
import { recolorImage, recolorPixel, simulateImage } from '../recolor.js';
import { extractPalette } from '../palette.js';
import { fixChart } from '../fixChart.js';
import { renderChart, TEST_PALETTES, type ChartKind } from '../synthetic.js';
import type { PaletteColor, RGB8, SimSpec } from '../types.js';

function color(id: number, hex: string, share = 0.05, thin = false): PaletteColor {
  const rgb = hexToRgb8(hex) as RGB8;
  const lab = srgb8ToOKLab(rgb[0], rgb[1], rgb[2]);
  const chroma = oklabToOKLCh(lab)[1];
  return { id, lab, rgb, hex, share, chroma, neutral: chroma < 0.035, edgeRatio: thin ? 0.9 : 0.1, thin };
}

function paletteOf(hexes: string[], thin = false): PaletteColor[] {
  return [color(0, '#ffffff', 0.7), color(1, '#333333', 0.02), ...hexes.map((h, i) => color(i + 2, h, 0.04, thin))];
}

describe('simulation selection', () => {
  it('maps every result type (C-11)', () => {
    expect(simsForResult('protan', 0.6)).toEqual([{ type: 'protan', severity: 0.6 }]);
    expect(simsForResult('deutan', 0.6)).toEqual([{ type: 'deutan', severity: 0.6 }]);
    expect(simsForResult('tritan', 0.9)).toEqual([{ type: 'tritan', severity: 0.9 }]);
    expect(simsForResult('rg_uncertain', 0.5)).toEqual([
      { type: 'protan', severity: 0.5 }, { type: 'deutan', severity: 0.5 },
    ]);
    expect(simsForResult('normal', 0)).toEqual([]);
  });

  it('universal mode covers red-green, tritan opt-in', () => {
    expect(simsForEveryone().map(s => s.type)).toEqual(['protan', 'deutan']);
    expect(simsForEveryone(true).map(s => s.type)).toEqual(['protan', 'deutan', 'tritan']);
    expect(simsForEveryone().every(s => s.severity === 1)).toBe(true);
  });

  it('τ grows as confidence drops and with strength', () => {
    const conf: CVDParams['confidence'][] = ['high', 'medium', 'low'];
    const taus = conf.map(c => computeTau('forMe', c));
    expect(taus[0]).toBeLessThan(taus[1]);
    expect(taus[1]).toBeLessThan(taus[2]);
    expect(computeTau('forMe', 'high', 0)).toBe(TAU_BASE);
    expect(computeTau('forEveryone', null, 2)).toBeGreaterThan(computeTau('forEveryone', null, 1));
  });
});

describe('findConfusions', () => {
  it('flags red vs green for deutan but not for normal vision', () => {
    const pal = paletteOf(['#d7191c', '#1a9641']);
    const tau = computeTau('forMe', 'high');
    expect(findConfusions(pal, simsForResult('deutan', 1), tau).map(c => [c.a, c.b])).toContainEqual([2, 3]);
    expect(findConfusions(pal, [], tau)).toEqual([]);
  });

  it('does not flag blue vs orange (CVD-safe pair)', () => {
    const pal = paletteOf(['#1f77b4', '#ff7f0e']);
    for (const t of ['protan', 'deutan'] as const) {
      expect(findConfusions(pal, simsForResult(t, 1), computeTau('forMe', 'high'))).toEqual([]);
    }
  });

  it('uses the tritan matrix for tritan results', () => {
    // Blue vs purple-ish pair that tritans confuse but red-green observers do not
    const pal = paletteOf(['#4285f4', '#00acc1']);
    const tau = computeTau('forMe', 'high');
    expect(findConfusions(pal, simsForResult('tritan', 1), tau).length).toBeGreaterThan(0);
  });

  it('rg_uncertain takes the worst case of protan and deutan', () => {
    const pal = paletteOf(TEST_PALETTES.matplotlib);
    const tau = computeTau('forMe', 'medium');
    const p = findConfusions(pal, simsForResult('protan', 0.8), tau).length;
    const d = findConfusions(pal, simsForResult('deutan', 0.8), tau).length;
    const rg = findConfusions(pal, simsForResult('rg_uncertain', 0.8), tau).length;
    expect(rg).toBeGreaterThanOrEqual(Math.max(p, d));
  });
});

describe('optimizePalette', () => {
  it('only changes confused chromatic colors and never neutrals', () => {
    const pal = paletteOf(['#d7191c', '#1a9641', '#1f77b4']);
    const res = optimizePalette({ colors: pal, sims: simsForResult('deutan', 1), tau: computeTau('forMe', 'high') });
    expect(res.before.length).toBeGreaterThan(0);
    expect(res.after).toEqual([]);
    expect(res.introduced).toEqual([]);
    expect(res.changed).not.toContain(0);
    expect(res.changed).not.toContain(1);
    for (const id of res.changed) expect(res.before.some(c => c.a === id || c.b === id)).toBe(true);
  });

  it('respects locked colors (C-15)', () => {
    const pal = paletteOf(['#d7191c', '#1a9641']);
    const res = optimizePalette({
      colors: pal, sims: simsForResult('deutan', 1), tau: computeTau('forMe', 'high'), locked: new Set([2]),
    });
    expect(res.changed).not.toContain(2);
    expect(res.changed).toContain(3);
    expect(res.after).toEqual([]);
  });

  it('prefers the smaller-area color when both could move', () => {
    const pal = [color(0, '#ffffff', 0.5), color(1, '#d7191c', 0.4), color(2, '#1a9641', 0.02)];
    const res = optimizePalette({ colors: pal, sims: simsForResult('deutan', 1), tau: computeTau('forMe', 'high') });
    expect(res.changed).toEqual([2]);
  });

  it('keeps hue direction roughly (red stays reddish)', () => {
    const pal = paletteOf(['#d7191c', '#1a9641'], true);
    const res = optimizePalette({ colors: pal, sims: simsForResult('protan', 1), tau: computeTau('forMe', 'high') });
    for (const id of res.changed) {
      const h0 = oklabToOKLCh(pal[id].lab)[2];
      const h1 = oklabToOKLCh(res.labs[id])[2];
      let dh = Math.abs(h1 - h0);
      if (dh > 180) dh = 360 - dh;
      expect(dh).toBeLessThanOrEqual(46);
    }
  });

  it('returns the original palette when there is nothing to fix', () => {
    const pal = paletteOf(['#1f77b4', '#ff7f0e']);
    const res = optimizePalette({ colors: pal, sims: simsForResult('deutan', 1), tau: computeTau('forMe', 'high') });
    expect(res.changed).toEqual([]);
    expect(res.labs).toEqual(pal.map(c => c.lab));
  });
});

describe('synthetic atlas (palette level)', () => {
  const simCases: Array<[string, SimSpec[], number]> = [
    ['protan 0.6', simsForResult('protan', 0.6), computeTau('forMe', 'high')],
    ['protan 1.0', simsForResult('protan', 1), computeTau('forMe', 'high')],
    ['deutan 0.6', simsForResult('deutan', 0.6), computeTau('forMe', 'high')],
    ['deutan 1.0', simsForResult('deutan', 1), computeTau('forMe', 'high')],
    ['tritan 1.0', simsForResult('tritan', 1), computeTau('forMe', 'high')],
    ['rg_uncertain 0.7', simsForResult('rg_uncertain', 0.7), computeTau('forMe', 'medium')],
    ['everyone', simsForEveryone(), computeTau('forEveryone', null)],
    ['everyone+tritan', simsForEveryone(true), computeTau('forEveryone', null)],
  ];

  it('removes ≥90% of simulated confusions and introduces none', () => {
    let before = 0, after = 0, introduced = 0;
    const rows: string[] = [];
    for (const [name, sims, tau] of simCases) {
      for (const [pname, hexes] of Object.entries(TEST_PALETTES)) {
        for (const thin of [false, true]) {
          const pal = paletteOf(hexes, thin);
          const res = optimizePalette({ colors: pal, sims, tau });
          before += res.before.length;
          after += res.after.length;
          introduced += res.introduced.length;
          rows.push(`${name.padEnd(17)} ${pname.padEnd(13)} ${thin ? 'thin' : 'area'} ${res.before.length} → ${res.after.length}`);
        }
      }
    }
    console.log(rows.join('\n'));
    console.log(`TOTAL confusions ${before} → ${after} (${((1 - after / before) * 100).toFixed(1)}% removed), introduced ${introduced}`);
    expect(before).toBeGreaterThan(20);
    expect(after / before).toBeLessThanOrEqual(0.1);
    expect(introduced).toBe(0);
  });
});

describe('recolor', () => {
  const mapping = {
    from: [[255, 255, 255], [200, 30, 30], [30, 160, 60]] as RGB8[],
    to: [[255, 255, 255], [200, 30, 30], [40, 90, 200]] as RGB8[],
  };
  const labs = mapping.from.map(c => srgb8ToOKLab(c[0], c[1], c[2]));

  it('maps palette colors exactly and leaves unchanged colors alone', () => {
    expect(recolorPixel([30, 160, 60], mapping, labs)).toEqual([40, 90, 200]);
    expect(recolorPixel([200, 30, 30], mapping, labs)).toEqual([200, 30, 30]);
    expect(recolorPixel([255, 255, 255], mapping, labs)).toEqual([255, 255, 255]);
  });

  it('keeps anti-aliasing: a 50% blend with white maps to a 50% blend of the new color', () => {
    const mid: RGB8 = [143, 208, 158]; // ≈ (green + white) / 2
    const out = recolorPixel(mid, mapping, labs);
    const expected = [(40 + 255) / 2, (90 + 255) / 2, (200 + 255) / 2];
    out.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(3));
  });

  it('barely touches colors far from any palette blend', () => {
    const out = recolorPixel([250, 0, 250], mapping, labs);
    out.forEach((v, i) => expect(Math.abs(v - [250, 0, 250][i])).toBeLessThanOrEqual(2));
  });

  it('preserves alpha and image size', () => {
    const img = { data: new Uint8ClampedArray([30, 160, 60, 128, 255, 255, 255, 255]), width: 2, height: 1 };
    const out = recolorImage(img, mapping);
    expect(Array.from(out)).toEqual([40, 90, 200, 128, 255, 255, 255, 255]);
  });

  it('simulateImage matches per-color simulation', () => {
    const img = { data: new Uint8ClampedArray([200, 30, 30, 255]), width: 1, height: 1 };
    const out = simulateImage(img, { type: 'deutan', severity: 1 });
    const viaLab = simulateLab(srgb8ToOKLab(200, 30, 30), { type: 'deutan', severity: 1 });
    const outLab = srgb8ToOKLab(out[0], out[1], out[2]);
    expect(deltaEOKLab(viaLab, outLab)).toBeLessThan(0.01);
  });
});

describe('end-to-end on rendered charts', () => {
  const kinds: ChartKind[] = ['line', 'bar', 'pie', 'scatter', 'map'];
  const cases: Array<[string, SimSpec[], number]> = [
    ['deutan', simsForResult('deutan', 1), computeTau('forMe', 'high')],
    ['rg_uncertain', simsForResult('rg_uncertain', 0.7), computeTau('forMe', 'medium')],
    ['everyone', simsForEveryone(), computeTau('forEveryone', null)],
  ];

  it('re-extracting the fixed image shows the confusions are gone', () => {
    let before = 0, after = 0;
    for (const kind of kinds) {
      for (const pname of ['redGreen', 'trafficLight', 'matplotlib']) {
        for (const [, sims, tau] of cases) {
          const img = renderChart(kind, TEST_PALETTES[pname]);
          const out = fixChart(img, { sims, tau });
          before += out.report.before.length;
          expect(out.report.introduced).toEqual([]);
          const refixed = extractPalette({ data: out.fixed, width: img.width, height: img.height });
          // Measure on the re-extracted palette with a little slack for re-quantization
          after += findConfusions(refixed.colors, sims, tau).filter(c => c.simulated < tau - 0.01).length;
        }
      }
    }
    console.log(`end-to-end confusions ${before} → ${after}`);
    expect(before).toBeGreaterThan(10);
    expect(after / before).toBeLessThanOrEqual(0.1);
  });

  it('normal result: no sims, image unchanged', () => {
    const img = renderChart('line', TEST_PALETTES.redGreen);
    const out = fixChart(img, { sims: [], tau: computeTau('forMe', 'high') });
    expect(out.report.changes).toEqual([]);
    expect(out.fixed).toEqual(img.data);
    expect(out.simBefore).toBeUndefined();
  });

  it('a 2000×1500 chart fixes in reasonable time', () => {
    const img = renderChart('bar', TEST_PALETTES.redGreen, 2000, 1500);
    const t0 = performance.now();
    fixChart(img, { sims: simsForResult('deutan', 1), tau: computeTau('forMe', 'high') });
    const ms = performance.now() - t0;
    console.log(`2000×1500 fix: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(5000);
  });
});
