import { describe, it, expect } from 'vitest';
import { hexToRgb8, srgb8ToOKLab, deltaEOKLab } from '@cvd-tools/color-core';
import { extractPalette } from '../palette.js';
import { renderChart, TEST_PALETTES, type ChartKind } from '../synthetic.js';
import type { ImageLike } from '../types.js';

function labOf(hex: string) {
  const [r, g, b] = hexToRgb8(hex);
  return srgb8ToOKLab(r, g, b);
}

const KINDS: ChartKind[] = ['line', 'bar', 'pie', 'scatter', 'map'];

describe('extractPalette', () => {
  for (const kind of KINDS) {
    for (const [name, colors] of Object.entries(TEST_PALETTES)) {
      it(`finds every series color in a ${kind} chart (${name})`, () => {
        const pal = extractPalette(renderChart(kind, colors));
        for (const hex of colors) {
          const best = Math.min(...pal.colors.map(c => deltaEOKLab(c.lab, labOf(hex))));
          expect(best, `${hex} missing`).toBeLessThan(0.03);
        }
        // No phantom anti-aliasing clusters: chromatic clusters should be the series colors only
        const chromatic = pal.colors.filter(c => !c.neutral);
        for (const c of chromatic) {
          const best = Math.min(...colors.map(h => deltaEOKLab(c.lab, labOf(h))));
          expect(best, `unexpected cluster ${c.hex}`).toBeLessThan(0.03);
        }
        expect(pal.suitable).toBe(true);
        expect(pal.colors.length).toBeLessThanOrEqual(12);
      });
    }
  }

  it('marks background, grid and axis colors as neutral', () => {
    const pal = extractPalette(renderChart('line', TEST_PALETTES.matplotlib));
    const white = pal.colors.find(c => deltaEOKLab(c.lab, labOf('#ffffff')) < 0.02);
    expect(white?.neutral).toBe(true);
    expect(white!.share).toBeGreaterThan(0.5);
  });

  it('flags thin line colors as thin and big bars as not thin', () => {
    const line = extractPalette(renderChart('line', TEST_PALETTES.redGreen, 960, 640));
    const red = line.colors.find(c => deltaEOKLab(c.lab, labOf('#d7191c')) < 0.03)!;
    expect(red.thin).toBe(true);
    const pie = extractPalette(renderChart('pie', TEST_PALETTES.redGreen));
    const red2 = pie.colors.find(c => deltaEOKLab(c.lab, labOf('#d7191c')) < 0.03)!;
    expect(red2.thin).toBe(false);
  });

  it('rejects photo-like images (smooth noise) as unsuitable', () => {
    const w = 256, h = 256;
    const data = new Uint8ClampedArray(w * h * 4);
    let s = 1;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        data[o] = (x + rand() * 60) | 0;
        data[o + 1] = (y + rand() * 60) | 0;
        data[o + 2] = ((x * y) / 256 + rand() * 60) | 0;
        data[o + 3] = 255;
      }
    }
    const img: ImageLike = { data, width: w, height: h };
    expect(extractPalette(img).suitable).toBe(false);
  });

  it('ignores transparent pixels and handles empty images', () => {
    const img: ImageLike = { data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 };
    const pal = extractPalette(img);
    expect(pal.colors).toEqual([]);
    expect(pal.suitable).toBe(false);
  });
});
