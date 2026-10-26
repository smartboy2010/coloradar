/**
 * Built-in sample charts (C-16), drawn with Canvas 2D so they look like real
 * screenshots (text, anti-aliasing). Palettes are deliberately red–green heavy.
 */

export type SampleId = 'line' | 'bar' | 'map';

const FONT = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SMALL = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function setup(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

function legend(ctx: CanvasRenderingContext2D, items: Array<[string, string]>, x: number, y: number, line = false): void {
  ctx.font = SMALL;
  items.forEach(([label, color], i) => {
    const yy = y + i * 22;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (line) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, yy + 7);
      ctx.lineTo(x + 20, yy + 7);
      ctx.stroke();
    } else {
      ctx.fillRect(x, yy, 14, 14);
    }
    ctx.fillStyle = '#333333';
    ctx.fillText(label, x + 26, yy + 12);
  });
}

function axes(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, labels: string[]): void {
  ctx.strokeStyle = '#e3e3e3';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = y1 + ((y0 - y1) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5);
    ctx.lineTo(x1, Math.round(y) + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#555555';
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y1);
  ctx.lineTo(x0 + 0.5, y0 + 0.5);
  ctx.lineTo(x1, y0 + 0.5);
  ctx.stroke();
  ctx.fillStyle = '#555555';
  ctx.font = SMALL;
  labels.forEach((l, i) => {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / labels.length;
    ctx.fillText(l, x - ctx.measureText(l).width / 2, y0 + 18);
  });
}

function lineChart(): HTMLCanvasElement {
  const [c, ctx] = setup(720, 420);
  ctx.fillStyle = '#222222';
  ctx.font = FONT;
  ctx.fillText('Weekly active users by region', 24, 30);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const x0 = 50, y0 = 370, x1 = 560, y1 = 50;
  axes(ctx, x0, y0, x1, y1, months);
  const series: Array<[string, string, number[]]> = [
    ['North', '#d62728', [40, 46, 44, 52, 58, 55, 63, 70]],
    ['South', '#2ca02c', [35, 41, 47, 45, 54, 60, 58, 66]],
    ['East', '#ff7f0e', [20, 26, 31, 29, 35, 38, 44, 41]],
    ['West', '#8c564b', [28, 24, 30, 36, 33, 40, 47, 52]],
  ];
  series.forEach(([, color, vals]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / vals.length;
      const y = y0 - ((y0 - y1) * v) / 80;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  legend(ctx, series.map(([l, col]) => [l, col]), 590, 70, true);
  return c;
}

function barChart(): HTMLCanvasElement {
  const [c, ctx] = setup(720, 420);
  ctx.fillStyle = '#222222';
  ctx.font = FONT;
  ctx.fillText('"The new office layout works well for me"', 24, 30);
  const teams = ['Design', 'Sales', 'Support', 'Eng', 'Ops'];
  const x0 = 50, y0 = 370, x1 = 540, y1 = 50;
  axes(ctx, x0, y0, x1, y1, teams);
  const cats: Array<[string, string]> = [
    ['Disagree', '#d7191c'], ['Neutral', '#fdae61'], ['Agree', '#a6d96a'], ['Strongly agree', '#1a9641'],
  ];
  const data = [[20, 25, 35, 20], [10, 20, 40, 30], [30, 30, 25, 15], [15, 15, 40, 30], [25, 20, 30, 25]];
  const bw = ((x1 - x0) / teams.length) * 0.6;
  data.forEach((row, i) => {
    let acc = 0;
    const x = x0 + ((x1 - x0) * (i + 0.5)) / teams.length - bw / 2;
    row.forEach((v, k) => {
      const h = ((y0 - y1) * v) / 100;
      ctx.fillStyle = cats[k][1];
      ctx.fillRect(x, y0 - acc - h, bw, h);
      acc += h;
    });
  });
  legend(ctx, cats, 565, 70);
  return c;
}

function mapChart(): HTMLCanvasElement {
  const [c, ctx] = setup(720, 460);
  ctx.fillStyle = '#222222';
  ctx.font = FONT;
  ctx.fillText('Flood risk by district', 24, 30);
  const levels: Array<[string, string]> = [['Low', '#43a047'], ['Medium', '#fdd835'], ['High', '#e53935']];
  let s = 11;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sites = Array.from({ length: 26 }, () => ({ x: 30 + rand() * 520, y: 50 + rand() * 390, l: Math.floor(rand() * 3) }));
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const rgb = levels.map(([, hex]) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  for (let y = 50; y < 440; y++) {
    for (let x = 30; x < 550; x++) {
      let b = 0, bd = Infinity, sd = Infinity;
      sites.forEach((p, i) => {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bd) { sd = bd; bd = d; b = i; } else if (d < sd) sd = d;
      });
      const edge = Math.min(1, Math.max(0, (sd - bd) / 2 - 0.5));
      const col = rgb[sites[b].l];
      const o = (y * c.width + x) * 4;
      for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(255 * (1 - edge) + col[k] * edge);
    }
  }
  ctx.putImageData(img, 0, 0);
  legend(ctx, levels, 580, 70);
  return c;
}

export function renderSample(id: SampleId): ImageData {
  const c = id === 'line' ? lineChart() : id === 'bar' ? barChart() : mapChart();
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}
