import { describe, it, expect } from 'vitest';
import en from '../i18n/en.json';
import zh from '../i18n/zh.json';
import { GUIDE_SECTIONS } from '../screens/guide.js';

describe('user guide copy', () => {
  it('every section title and item exists in en and zh, and no extra items are orphaned', () => {
    const expected = new Set<string>();
    for (const s of GUIDE_SECTIONS) {
      expected.add(`guide.${s.id}.title`);
      for (let i = 1; i <= s.items; i++) expected.add(`guide.${s.id}.${i}`);
    }
    for (const dict of [en, zh] as Record<string, string>[]) {
      for (const k of expected) expect(dict[k], k).toBeTruthy();
      const items = Object.keys(dict).filter(k => /^guide\.[a-z]+\.\d+$/.test(k));
      expect(items.filter(k => !expected.has(k))).toEqual([]);
    }
  });

  it('covers the topics users need', () => {
    expect(GUIDE_SECTIONS.map(s => s.id)).toEqual(['about', 'prepare', 'test', 'results', 'fixer', 'radar', 'share', 'devices', 'privacy']);
  });
});
