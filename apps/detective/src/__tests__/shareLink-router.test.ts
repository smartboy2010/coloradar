import { describe, it, expect } from 'vitest';
import { createDefaultParams, type CVDParams } from '@cvd-tools/color-core';
import {
  encodeShareData,
  decodeShareData,
  buildShareHash,
  parseLegacyHash,
} from '../store/shareLink.js';
import { parseHash, routeHash } from '../router.js';

const params: CVDParams = {
  ...createDefaultParams(),
  type: 'rg_uncertain', level: 'moderate', severity: 0.5512, confidence: 'medium',
  testedAt: '2026-10-01T10:00:00.000Z',
};

describe('share links', () => {
  it('round-trips type, level, severity, confidence', () => {
    const p = decodeShareData(encodeShareData(params))!;
    expect(p).toMatchObject({ type: 'rg_uncertain', level: 'moderate', severity: 0.551, confidence: 'medium' });
    expect(p.testedAt).toBe(params.testedAt);
    expect(p.device.selfReport).toEqual({ importedFrom: 'link' });
  });

  it('produces URL-safe base64 in a #/import hash', () => {
    const hash = buildShareHash(params);
    expect(hash.startsWith('#/import?d=')).toBe(true);
    expect(hash.slice('#/import?d='.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    const route = parseHash(hash)!;
    expect(route.name).toBe('import');
    expect(decodeShareData(route.query.get('d')!)?.type).toBe('rg_uncertain');
  });

  it('rejects garbage and future versions', () => {
    expect(decodeShareData('%%%')).toBeNull();
    expect(decodeShareData(btoa('{"v":99,"t":"protan","l":"mild","s":0.2,"c":"high"}'))).toBeNull();
    expect(decodeShareData(btoa('{"v":1,"t":"purple","l":"mild","s":0.2,"c":"high"}'))).toBeNull();
  });

  it('parses v0.1 #cvd= links (as produced by paramsToURLHash)', () => {
    const v01 = '#cvd=' + encodeURIComponent(JSON.stringify({ t: 'deutan', l: 'severe', s: '0.912', c: 'high' }));
    const p = parseLegacyHash(v01)!;
    expect(p).toMatchObject({ type: 'deutan', level: 'severe', severity: 0.912, confidence: 'high' });
    expect(p.device.selfReport).toEqual({ importedFrom: 'legacy-link' });
    expect(parseLegacyHash('#cvd=broken')).toBeNull();
    expect(parseLegacyHash('#/fixer')).toBeNull();
  });
});

describe('router', () => {
  it('parses known routes with query', () => {
    expect(parseHash('#/fixer')?.name).toBe('fixer');
    expect(parseHash('#/results/')?.name).toBe('results');
    expect(parseHash('#/import?d=abc')?.query.get('d')).toBe('abc');
  });

  it('returns null for empty or unknown hashes', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#/nope')).toBeNull();
    expect(parseHash('#section')).toBeNull();
  });

  it('routes legacy #cvd= links to import', () => {
    const r = parseHash('#cvd=%7B%22t%22%3A%22protan%22%7D')!;
    expect(r.name).toBe('import');
    expect(r.legacy).toBe('cvd=%7B%22t%22%3A%22protan%22%7D');
  });

  it('builds hashes', () => {
    expect(routeHash('fixer')).toBe('#/fixer');
    expect(routeHash('import', { d: 'x y' })).toBe('#/import?d=x+y');
  });
});
