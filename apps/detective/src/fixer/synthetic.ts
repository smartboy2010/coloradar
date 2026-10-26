/**
 * Synthetic chart rasterizer with known palettes, for the automated test atlas.
 * Pure (no canvas): anti-aliased shapes blended in sRGB like a browser canvas.
 */

import { hexToRgb8 } from '@cvd-tools/color-core';
import type { ImageLike } from './types.js';

export type ChartKind = 'line' | 'bar' | 'pie' | 'scatter' | 'map';

export const TEST_PALETTES: Record<string, string[]> = {
  matplotlib: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'],
  excel: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'],
  googleSheets: ['#4285f4', '#db4437', '#f4b400', '#0f9d58', '#ab47bc', '#00acc1'],
  redGreen: ['#d7191c', '#1a9641', '#fdae61', '#a6d96a'],
  trafficLight: ['#e53935', '#43a047', '#fdd835'],
};

export const BACKGROUND = '#ffffff';
export const GRID = '#e0e0e0';
export const AXIS = '#333333';

class Raster implements ImageLike {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number, bg: string) {
    this.data = new Uint8ClampedArray(width * height * 4);
    const [r, g, b] = hexToRgb8(bg);
    for (let o = 0; o < this.data.length; o += 4) {
      this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
    }
  }

  blend(x: number, y: number, rgb: [number, number, number], a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 4;
    const k = Math.min(1, a);
    this.data[o] = Math.round(this.data[o] * (1 - k) + rgb[0] * k);
    this.data[o + 1] = Math.round(this.data[o + 1] * (1 - k) + rgb[1] * k);
    this.data[o + 2] = Math.round(this.data[o + 2] * (1 - k) + rgb[2] * k);
  }

  /** Fill a shape given by a signed distance function (negative inside), 1px AA edge. */
  fillSdf(hex: string, bbox: [number, number, number, number], sdf: (x: number, y: number) => number): void {
    const rgb = hexToRgb8(hex);
    const [x0, y0, x1, y1] = bbox.map(Math.round);
    for (let y = Math.max(0, y0 - 1); y <= Math.min(this.height - 1, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x <= Math.min(this.width - 1, x1 + 1); x++) {
        const d = sdf(x + 0.5, y + 0.5);
        this.blend(x, y, rgb, 0.5 - d);
      }
    }
  }

  rect(hex: string, x: number, y: number, w: number, h: number): void {
    this.fillSdf(hex, [x, y, x + w, y + h], (px, py) =>
      Math.max(x - px, px - (x + w), y - py, py - (y + h)));
  }

  line(hex: string, ax: number, ay: number, bx: number, by: number, width: number): void {
    const r = width / 2;
    this.fillSdf(hex, [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r],
      (px, py) => {
        const abx = bx - ax, aby = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
        return Math.hypot(px - (ax + t * abx), py - (ay + t * aby)) - r;
      });
  }

  circle(hex: string, cx: number, cy: number, r: number): void {
    this.fillSdf(hex, [cx - r, cy - r, cx + r, cy + r], (px, py) => Math.hypot(px - cx, py - cy) - r);
  }
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function axes(r: Raster, m: number): void {
  for (let i = 1; i <= 4; i++) {
    const y = m + ((r.height - 2 * m) * i) / 5;
    r.line(GRID, m, y, r.width - m, y, 1);
  }
  r.line(AXIS, m, r.height - m, r.width - m, r.height - m, 1.5);
  r.line(AXIS, m, m, m, r.height - m, 1.5);
}

function legend(r: Raster, colors: string[], m: number): void {
  colors.forEach((c, i) => {
    r.rect(c, r.width - m - 70, m + i * 18, 14, 10);
    r.rect(AXIS, r.width - m - 50, m + i * 18 + 3, 36, 4);
  });
}

export function renderChart(kind: ChartKind, colors: string[], width = 480, height = 320, seed = 7): ImageLike {
  const r = new Raster(width, height, BACKGROUND);
  const rand = rng(seed);
  const m = 30;
  switch (kind) {
    case 'line': {
      axes(r, m);
      const pts = 9;
      colors.forEach((c, si) => {
        let prev: [number, number] | null = null;
        let v = 0.2 + 0.6 * rand();
        for (let k = 0; k < pts; k++) {
          v = Math.max(0.05, Math.min(0.95, v + (rand() - 0.5) * 0.3));
          const x = m + ((width - 2 * m - 90) * k) / (pts - 1);
          const y = height - m - v * (height - 2 * m) + si;
          if (prev) r.line(c, prev[0], prev[1], x, y, 3);
          prev = [x, y];
        }
      });
      legend(r, colors, m);
      break;
    }
    case 'bar': {
      axes(r, m);
      const groups = 4;
      const gw = (width - 2 * m - 90) / groups;
      const bw = (gw * 0.8) / colors.length;
      for (let g = 0; g < groups; g++) {
        colors.forEach((c, si) => {
          const h = (0.2 + 0.7 * rand()) * (height - 2 * m);
          r.rect(c, m + g * gw + gw * 0.1 + si * bw, height - m - h, bw - 1, h);
        });
      }
      legend(r, colors, m);
      break;
    }
    case 'pie': {
      const cx = width / 2 - 40, cy = height / 2, rad = Math.min(width, height) / 2 - m;
      const weights = colors.map(() => 0.5 + rand());
      const total = weights.reduce((a, b) => a + b, 0);
      let start = -Math.PI / 2;
      colors.forEach((c, i) => {
        const end = start + (weights[i] / total) * Math.PI * 2;
        const s0 = start;
        r.fillSdf(c, [cx - rad, cy - rad, cx + rad, cy + rad], (px, py) => {
          const dr = Math.hypot(px - cx, py - cy) - rad;
          let a = Math.atan2(py - cy, px - cx);
          while (a < s0) a += Math.PI * 2;
          const inside = a <= end;
          const dist = Math.hypot(px - cx, py - cy);
          const angDist = inside ? -Math.min(a - s0, end - a) * dist : Math.min(a - end, s0 + Math.PI * 2 - a) * dist;
          return Math.max(dr, angDist);
        });
        start = end;
      });
      legend(r, colors, m);
      break;
    }
    case 'scatter': {
      axes(r, m);
      colors.forEach(c => {
        const cx0 = m + 40 + rand() * (width - 2 * m - 170), cy0 = m + 30 + rand() * (height - 2 * m - 60);
        for (let k = 0; k < 18; k++) {
          r.circle(c, cx0 + (rand() - 0.5) * 90, cy0 + (rand() - 0.5) * 70, 3.5);
        }
      });
      legend(r, colors, m);
      break;
    }
    case 'map': {
      const sites = Array.from({ length: 24 }, (_, i) => ({
        x: rand() * width, y: rand() * height, c: colors[i % colors.length],
      }));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let best = 0, second = 0, bd = Infinity, sd = Infinity;
          sites.forEach((s, i) => {
            const d = Math.hypot(x - s.x, y - s.y);
            if (d < bd) { sd = bd; second = best; bd = d; best = i; } else if (d < sd) { sd = d; second = i; }
          });
          r.blend(x, y, hexToRgb8(sites[best].c), 1);
          // Thin white borders between regions
          const edge = (sd - bd) / 2;
          if (sites[best].c !== sites[second].c || edge < 1) r.blend(x, y, [255, 255, 255], 1 - edge);
        }
      }
      break;
    }
  }
  return r;
}
