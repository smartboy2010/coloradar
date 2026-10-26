import { describe, it, expect } from 'vitest';
import { createDefaultParams, type CVDParams } from '@cvd-tools/color-core';
import {
  LocalProfileStore,
  STORAGE_KEY,
  LEGACY_KEY,
  type KeyValueStorage,
} from '../store/LocalProfileStore.js';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
}

class ThrowingStorage implements KeyValueStorage {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
  removeItem(): void { throw new Error('SecurityError'); }
}

let n = 0;
const uuid = () => `id-${++n}`;

function result(type: CVDParams['type'], severity = 0.6): CVDParams {
  return { ...createDefaultParams(), type, level: type === 'normal' ? 'none' : 'moderate', severity, confidence: 'medium' };
}

describe('LocalProfileStore', () => {
  it('creates a default profile and English prefs on first run', async () => {
    const s = new LocalProfileStore({ storage: new FakeStorage(), uuid });
    const p = await s.getActiveProfile();
    expect(p?.name).toBe('Me');
    expect(p?.latestResult).toBeNull();
    expect(await s.getPrefs()).toEqual({ lang: 'en', fixerMode: 'forMe' });
    expect(s.issue).toBeNull();
  });

  it('saves and reloads results across instances', async () => {
    const storage = new FakeStorage();
    const a = new LocalProfileStore({ storage, uuid });
    const prof = (await a.getActiveProfile())!;
    await a.saveResult(prof.id, result('deutan'));
    await a.saveResult(prof.id, result('protan'));
    await a.setPrefs({ lang: 'zh' });

    const b = new LocalProfileStore({ storage, uuid });
    const p = (await b.getActiveProfile())!;
    expect(p.latestResult?.type).toBe('protan');
    expect(p.history.map(h => h.type)).toEqual(['deutan']);
    expect((await b.getPrefs()).lang).toBe('zh');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(1);
  });

  it('migrates v0.1 cvd-params into the default profile and keeps the legacy key', async () => {
    const storage = new FakeStorage();
    storage.setItem(LEGACY_KEY, JSON.stringify(result('rg_uncertain', 0.45)));
    const s = new LocalProfileStore({ storage, uuid });
    const p = (await s.getActiveProfile())!;
    expect(p.latestResult?.type).toBe('rg_uncertain');
    expect(p.latestResult?.severity).toBe(0.45);
    expect(s.migratedFromLegacy).toBe(true);
    expect(storage.getItem(LEGACY_KEY)).not.toBeNull();
    // Second run does not migrate again
    const s2 = new LocalProfileStore({ storage, uuid });
    expect(s2.migratedFromLegacy).toBe(false);
  });

  it('ignores an invalid legacy entry', async () => {
    const storage = new FakeStorage();
    storage.setItem(LEGACY_KEY, '{"schema":"other"}');
    const s = new LocalProfileStore({ storage, uuid });
    expect((await s.getActiveProfile())!.latestResult).toBeNull();
    expect(s.migratedFromLegacy).toBe(false);
  });

  it('export then import round-trips all data', async () => {
    const a = new LocalProfileStore({ storage: new FakeStorage(), uuid });
    await a.saveResult((await a.getActiveProfile())!.id, result('tritan', 0.8));
    await a.setPrefs({ lang: 'zh', fixerMode: 'forEveryone' });
    const json = await a.exportAll();

    const b = new LocalProfileStore({ storage: new FakeStorage(), uuid });
    await b.importAll(json);
    expect(await b.listProfiles()).toEqual(await a.listProfiles());
    expect(await b.getPrefs()).toEqual(await a.getPrefs());
  });

  it('imports a bare cvd-params file and the v0.1 {params, trials} export', async () => {
    const s = new LocalProfileStore({ storage: new FakeStorage(), uuid });
    await s.importAll(JSON.stringify(result('protan')));
    expect((await s.getActiveProfile())!.latestResult?.type).toBe('protan');
    await s.importAll(JSON.stringify({ params: result('deutan'), trials: [] }));
    expect((await s.getActiveProfile())!.latestResult?.type).toBe('deutan');
  });

  it('rejects unrecognized imports without touching data', async () => {
    const s = new LocalProfileStore({ storage: new FakeStorage(), uuid });
    await s.saveResult((await s.getActiveProfile())!.id, result('protan'));
    await expect(s.importAll('not json')).rejects.toThrow();
    await expect(s.importAll('{"hello":1}')).rejects.toThrow();
    expect((await s.getActiveProfile())!.latestResult?.type).toBe('protan');
  });

  it('clearAll removes all local data including the legacy key', async () => {
    const storage = new FakeStorage();
    storage.setItem(LEGACY_KEY, JSON.stringify(result('deutan')));
    const s = new LocalProfileStore({ storage, uuid });
    await s.getActiveProfile();
    await s.clearAll();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_KEY)).toBeNull();
    expect((await s.getActiveProfile())!.latestResult).toBeNull();
    expect((await s.getPrefs()).lang).toBe('en');
  });

  it('keeps working from memory when storage throws (private mode)', async () => {
    const s = new LocalProfileStore({ storage: new ThrowingStorage(), uuid });
    const p = (await s.getActiveProfile())!;
    await s.saveResult(p.id, result('deutan'));
    expect((await s.getActiveProfile())!.latestResult?.type).toBe('deutan');
    expect(s.issue).toBe('unavailable');
  });

  it('works with no storage at all', async () => {
    const s = new LocalProfileStore({ storage: null, uuid });
    expect(s.issue).toBe('unavailable');
    await s.setPrefs({ lang: 'zh' });
    expect((await s.getPrefs()).lang).toBe('zh');
  });

  it('recovers from corrupt JSON and flags it', async () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    const s = new LocalProfileStore({ storage, uuid });
    expect((await s.getActiveProfile())).not.toBeNull();
    expect(s.issue).toBe('corrupt');
    expect(storage.getItem(`${STORAGE_KEY}:corrupt`)).toBe('{not json');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(1);
  });

  it('drops invalid results inside otherwise valid data', async () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, activeProfileId: 'x',
      profiles: [{ id: 'x', name: 'A', createdAt: '2026-01-01', latestResult: { schema: 'bad' }, history: [] }],
      prefs: { lang: 'fr' },
    }));
    const s = new LocalProfileStore({ storage, uuid });
    const p = (await s.getActiveProfile())!;
    expect(p.id).toBe('x');
    expect(p.latestResult).toBeNull();
    expect((await s.getPrefs()).lang).toBe('en');
  });
});
