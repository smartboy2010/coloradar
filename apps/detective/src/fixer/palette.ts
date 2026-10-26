/**
 * Palette extraction for flat-colored images (charts, maps).
 *
 * 1. Sample on a grid so the long side is ~512 px; skip transparent pixels.
 * 2. Histogram into 6-bit-per-channel bins (weighted points) in OKLab.
 * 3. k-means++-style greedy seeding: next seed maximizes count × min(D², cap²),
 *    so dense, distinct colors win over the sparse anti-aliasing blends.
 * 4. Trimmed Lloyd iterations (only bins near a centroid move it), merge close
 *    clusters, drop tiny ones and clusters that are just blends of two larger ones.
 */

import {
  srgb8ToOKLab,
  deltaEOKLab,
  oklabToSrgb8,
  oklabToOKLCh,
  rgb8ToHex,
  type OKLab,
} from '@cvd-tools/color-core';
import type { ImageLike, Palette, PaletteColor, RGB8 } from './types.js';

export interface PaletteOptions {
  maxColors: number;
  workSize: number;
  mergeDistance: number;
  minShare: number;
  neutralChroma: number;
  coreRadius: number;
}

export const DEFAULT_PALETTE_OPTIONS: PaletteOptions = {
  maxColors: 12,
  workSize: 512,
  mergeDistance: 0.04,
  minShare: 0.0015,
  neutralChroma: 0.035,
  coreRadius: 0.045,
};

const MAX_SEEDS = 32;
const SUITABLE_COVERAGE = 0.85;
/** Lines and small markers sit well above this; filled areas well below. Kept low: misclassifying as thin is the safe side. */
const THIN_EDGE_RATIO = 0.3;

interface Bin {
  count: number;
  rgb: RGB8;
  lab: OKLab;
}

interface Cluster {
  lab: OKLab;
  share: number;
}

function binKey(r: number, g: number, b: number): number {
  return ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
}

/** Squared OKLab distance */
function d2(a: OKLab, b: OKLab): number {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
}

/** Projection of p onto segment a–b in 8-bit sRGB space: [t, residual] */
export function segmentProjection(p: readonly number[], a: readonly number[], b: readonly number[]): [number, number] {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const rx = p[0] - (a[0] + t * abx), ry = p[1] - (a[1] + t * aby), rz = p[2] - (a[2] + t * abz);
  return [t, Math.sqrt(rx * rx + ry * ry + rz * rz)];
}

interface Sampled {
  bins: Bin[];
  /** Per grid cell: index into bins, or -1 for transparent */
  grid: Int32Array;
  gw: number;
  gh: number;
  total: number;
}

function sample(img: ImageLike, workSize: number): Sampled {
  const stride = Math.max(1, Math.ceil(Math.max(img.width, img.height) / workSize));
  const gw = Math.ceil(img.width / stride);
  const gh = Math.ceil(img.height / stride);
  const grid = new Int32Array(gw * gh);
  const index = new Map<number, number>();
  const counts: number[] = [];
  const sums: number[] = [];
  let total = 0;
  const d = img.data;
  for (let gy = 0; gy < gh; gy++) {
    const y = gy * stride;
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * stride;
      const o = (y * img.width + x) * 4;
      if (d[o + 3] < 128) {
        grid[gy * gw + gx] = -1;
        continue;
      }
      const r = d[o], g = d[o + 1], b = d[o + 2];
      const k = binKey(r, g, b);
      let bi = index.get(k);
      if (bi === undefined) {
        bi = counts.length;
        index.set(k, bi);
        counts.push(0);
        sums.push(0, 0, 0);
      }
      counts[bi]++;
      sums[bi * 3] += r;
      sums[bi * 3 + 1] += g;
      sums[bi * 3 + 2] += b;
      grid[gy * gw + gx] = bi;
      total++;
    }
  }
  const bins: Bin[] = counts.map((c, i) => {
    const rgb: RGB8 = [
      Math.round(sums[i * 3] / c),
      Math.round(sums[i * 3 + 1] / c),
      Math.round(sums[i * 3 + 2] / c),
    ];
    return { count: c, rgb, lab: srgb8ToOKLab(rgb[0], rgb[1], rgb[2]) };
  });
  return { bins, grid, gw, gh, total };
}

function seed(bins: Bin[], total: number, opts: PaletteOptions): OKLab[] {
  const cap2 = (opts.mergeDistance * 2) ** 2;
  const merge2 = opts.mergeDistance ** 2;
  const minCount = Math.max(2, opts.minShare * total * 0.5);
  const nearest = new Float64Array(bins.length).fill(Infinity);
  const seeds: OKLab[] = [];
  while (seeds.length < MAX_SEEDS) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < bins.length; i++) {
      if (nearest[i] <= merge2 || bins[i].count < minCount) continue;
      const score = bins[i].count * Math.min(nearest[i], cap2);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    const s = bins[best].lab;
    seeds.push(s);
    for (let i = 0; i < bins.length; i++) {
      const dd = d2(bins[i].lab, s);
      if (dd < nearest[i]) nearest[i] = dd;
    }
  }
  return seeds;
}

function nearestIndex(lab: OKLab, centers: OKLab[]): [number, number] {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < centers.length; k++) {
    const dd = d2(lab, centers[k]);
    if (dd < bestD) {
      bestD = dd;
      best = k;
    }
  }
  return [best, bestD];
}

function refine(bins: Bin[], centers: OKLab[], opts: PaletteOptions): OKLab[] {
  const trim2 = opts.coreRadius ** 2;
  let cs = centers.map(c => [...c] as OKLab);
  for (let iter = 0; iter < 6; iter++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (const bin of bins) {
      const [k, dd] = nearestIndex(bin.lab, cs);
      if (k < 0 || dd > trim2) continue;
      const a = acc[k];
      a[0] += bin.lab[0] * bin.count;
      a[1] += bin.lab[1] * bin.count;
      a[2] += bin.lab[2] * bin.count;
      a[3] += bin.count;
    }
    cs = cs.map((c, k) => (acc[k][3] > 0
      ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] as OKLab
      : c));
  }
  return cs;
}

function coreShares(bins: Bin[], centers: OKLab[], total: number, radius: number): number[] {
  const shares = centers.map(() => 0);
  const r2 = radius * radius;
  for (const bin of bins) {
    const [k, dd] = nearestIndex(bin.lab, centers);
    if (k >= 0 && dd <= r2) shares[k] += bin.count;
  }
  return shares.map(s => s / Math.max(1, total));
}

function mergeClose(clusters: Cluster[], dist: number): Cluster[] {
  const out = [...clusters].sort((a, b) => b.share - a.share);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (deltaEOKLab(out[i].lab, out[j].lab) < dist) {
          const wi = out[i].share, wj = out[j].share, w = wi + wj || 1;
          out[i] = {
            lab: [
              (out[i].lab[0] * wi + out[j].lab[0] * wj) / w,
              (out[i].lab[1] * wi + out[j].lab[1] * wj) / w,
              (out[i].lab[2] * wi + out[j].lab[2] * wj) / w,
            ],
            share: wi + wj,
          };
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/** Drop clusters that sit on the blend line between two clearly larger clusters (anti-aliasing). */
function dropBlends(clusters: Cluster[]): Cluster[] {
  const rgbs = clusters.map(c => oklabToSrgb8(c.lab));
  return clusters.filter((c, k) => {
    for (let i = 0; i < clusters.length; i++) {
      if (i === k) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        if (j === k) continue;
        const minParent = Math.min(clusters[i].share, clusters[j].share);
        if (c.share >= minParent * 0.35) continue;
        const [t, resid] = segmentProjection(rgbs[k], rgbs[i], rgbs[j]);
        if (t > 0.06 && t < 0.94 && resid < 12) return false;
      }
    }
    return true;
  });
}

function edgeRatios(s: Sampled, centers: OKLab[], radius: number): number[] {
  const r2 = radius * radius;
  const binLabel = s.bins.map(b => {
    const [k, dd] = nearestIndex(b.lab, centers);
    return dd <= r2 ? k : -1;
  });
  const area = centers.map(() => 0);
  const edge = centers.map(() => 0);
  const { grid, gw, gh } = s;
  const label = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= gw || y >= gh) return -2;
    const bi = grid[y * gw + x];
    return bi < 0 ? -1 : binLabel[bi];
  };
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const l = label(x, y);
      if (l < 0) continue;
      area[l]++;
      const n = [label(x - 1, y), label(x + 1, y), label(x, y - 1), label(x, y + 1)];
      if (n.some(v => v !== l && v !== -2)) edge[l]++;
    }
  }
  return area.map((a, k) => (a > 0 ? edge[k] / a : 1));
}

/** Fraction of opaque samples that are a palette color or a blend of two palette colors. */
function computeCoverage(bins: Bin[], total: number, colors: { lab: OKLab; rgb: RGB8 }[]): number {
  if (colors.length === 0) return 0;
  let covered = 0;
  const near2 = 0.06 ** 2;
  for (const bin of bins) {
    const ds = colors.map(c => d2(bin.lab, c.lab));
    const order = ds.map((_, i) => i).sort((a, b) => ds[a] - ds[b]);
    if (ds[order[0]] <= near2) {
      covered += bin.count;
      continue;
    }
    const top = order.slice(0, 3);
    let ok = false;
    for (let i = 0; i < top.length && !ok; i++) {
      for (let j = i + 1; j < top.length && !ok; j++) {
        const [, resid] = segmentProjection(bin.rgb, colors[top[i]].rgb, colors[top[j]].rgb);
        if (resid < 14) ok = true;
      }
    }
    if (ok) covered += bin.count;
  }
  return covered / Math.max(1, total);
}

export function extractPalette(img: ImageLike, options: Partial<PaletteOptions> = {}): Palette {
  const opts = { ...DEFAULT_PALETTE_OPTIONS, ...options };
  const s = sample(img, opts.workSize);
  if (s.total === 0) return { colors: [], coverage: 0, suitable: false };

  const seeds = seed(s.bins, s.total, opts);
  const refined = refine(s.bins, seeds, opts);
  const shares = coreShares(s.bins, refined, s.total, opts.coreRadius);
  let clusters: Cluster[] = refined.map((lab, i) => ({ lab, share: shares[i] }));
  clusters = mergeClose(clusters, opts.mergeDistance);
  clusters = clusters.filter(c => c.share >= opts.minShare);
  clusters = dropBlends(clusters);
  clusters.sort((a, b) => b.share - a.share);
  const tooMany = clusters.length > opts.maxColors;
  clusters = clusters.slice(0, opts.maxColors);

  const centers = clusters.map(c => c.lab);
  const finalShares = coreShares(s.bins, centers, s.total, opts.coreRadius);
  const edges = edgeRatios(s, centers, opts.coreRadius);

  const colors: PaletteColor[] = clusters.map((c, id) => {
    const rgb = oklabToSrgb8(c.lab) as RGB8;
    const chroma = oklabToOKLCh(c.lab)[1];
    return {
      id,
      lab: srgb8ToOKLab(rgb[0], rgb[1], rgb[2]),
      rgb,
      hex: rgb8ToHex(rgb),
      share: finalShares[id],
      chroma,
      neutral: chroma < opts.neutralChroma,
      edgeRatio: edges[id],
      thin: edges[id] > THIN_EDGE_RATIO && finalShares[id] < 0.1,
    };
  });

  const coverage = computeCoverage(s.bins, s.total, colors);
  const chromatic = colors.filter(c => !c.neutral).length;
  return {
    colors,
    coverage,
    suitable: coverage >= SUITABLE_COVERAGE && !(tooMany && coverage < 0.95) && chromatic > 0,
  };
}
