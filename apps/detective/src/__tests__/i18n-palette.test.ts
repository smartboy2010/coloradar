import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hexToRgb8, srgb8ToOKLab, deltaEOKLab } from '@cvd-tools/color-core';
import { simulateLab } from '../fixer/confusion.js';
import en from '../i18n/en.json';
import zh from '../i18n/zh.json';

const SRC = resolve(__dirname, '..');

describe('i18n dictionaries', () => {
  it('en and zh have exactly the same keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it('placeholders match between languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ph(zh[k]), k).toEqual(ph(en[k]));
    }
  });

  it('every literal t() key used in the source exists', () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(n => {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p); } else if (p.endsWith('.ts')) files.push(p);
    });
    walk(SRC);
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) {
        if (!(m[1] in en)) missing.push(`${f.replace(SRC, '')}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('dynamic key families are complete', () => {
    for (const ty of ['protan', 'deutan', 'tritan', 'rg_uncertain', 'normal']) {
      expect(en).toHaveProperty(`type.${ty}`);
      expect(en).toHaveProperty(`typeShort.${ty}`);
    }
    for (const l of ['none', 'mild', 'moderate', 'severe']) expect(en).toHaveProperty(`level.${l}`);
    for (const c of ['low', 'medium', 'high']) expect(en).toHaveProperty(`confidence.${c}`);
  });
});

describe('UI palette is colorblind-safe (N-03)', () => {
  const css = readFileSync(join(SRC, 'style.css'), 'utf8');
  const v = (name: string) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`--${name} not found`);
    return m[1];
  };
  const lab = (hex: string) => {
    const [r, g, b] = hexToRgb8(hex);
    return srgb8ToOKLab(r, g, b);
  };

  it('no red/green accent pair remains', () => {
    expect(v('accent').toLowerCase()).not.toBe('#e94560');
    expect(v('success').toLowerCase()).not.toBe('#2ed573');
  });

  const pairs: Array<[string, string]> = [
    ['success', 'danger'], ['accent', 'danger'], ['accent', 'warning'],
    ['accent', 'bg'], ['danger', 'bg'], ['warning', 'bg'], ['success', 'bg-card'],
  ];
  for (const type of ['protan', 'deutan', 'tritan'] as const) {
    it(`main color pairs stay distinguishable under severe ${type}`, () => {
      for (const [a, b] of pairs) {
        const d = deltaEOKLab(
          simulateLab(lab(v(a)), { type, severity: 1 }),
          simulateLab(lab(v(b)), { type, severity: 1 }),
        );
        expect(d, `${a} vs ${b}`).toBeGreaterThan(0.1);
      }
    });
  }
});
