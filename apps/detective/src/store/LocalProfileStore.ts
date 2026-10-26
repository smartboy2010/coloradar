/**
 * localStorage implementation of ProfileStore.
 *
 * - Everything lives under one key (`cvd-app/v1`); nothing is sent anywhere.
 * - Every read/write is wrapped in try/catch. If storage is unavailable
 *   (private mode, quota, disabled) the store keeps working from memory and
 *   reports `issue` so the UI can warn that results will not be kept.
 * - On first run, a valid v0.1 `cvd-params` entry is migrated into the
 *   default profile. The legacy key is kept for one release so users can
 *   roll back; v0.3 should delete it.
 */

import { validateParams, type CVDParams } from '@cvd-tools/color-core';
import {
  type AppData,
  type Prefs,
  type Profile,
  type ProfileStore,
  type StoreIssue,
  DEFAULT_PREFS,
  HISTORY_LIMIT,
} from './ProfileStore.js';

export const STORAGE_KEY = 'cvd-app/v1';
export const LEGACY_KEY = 'cvd-params';
const BACKUP_FORMAT = 'cvd-app-backup';

/** Minimal subset of the Web Storage API, so tests can inject a fake. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function normalizePrefs(v: unknown): Prefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    lang: o.lang === 'zh' || o.lang === 'en' ? o.lang : DEFAULT_PREFS.lang,
    fixerMode: o.fixerMode === 'forEveryone' || o.fixerMode === 'forMe' ? o.fixerMode : DEFAULT_PREFS.fixerMode,
  };
}

function normalizeProfile(v: unknown, uuid: () => string): Profile | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const history = Array.isArray(o.history)
    ? o.history.map(validateParams).filter((p): p is CVDParams => p !== null).slice(0, HISTORY_LIMIT)
    : [];
  return {
    id: typeof o.id === 'string' && o.id ? o.id : uuid(),
    name: typeof o.name === 'string' && o.name ? o.name : 'Me',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    latestResult: validateParams(o.latestResult),
    history,
  };
}

/** Validate/normalize an AppData-shaped object. Returns null if unusable. */
export function normalizeAppData(v: unknown, uuid: () => string = defaultUuid): AppData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.schemaVersion !== 1 || !Array.isArray(o.profiles)) return null;
  const profiles = o.profiles.map(p => normalizeProfile(p, uuid)).filter((p): p is Profile => p !== null);
  if (profiles.length === 0) return null;
  const activeProfileId = profiles.some(p => p.id === o.activeProfileId)
    ? (o.activeProfileId as string)
    : profiles[0].id;
  return { schemaVersion: 1, activeProfileId, profiles, prefs: normalizePrefs(o.prefs) };
}

export interface LocalProfileStoreOptions {
  /** Storage backend; defaults to window.localStorage. Pass null to force memory-only. */
  storage?: KeyValueStorage | null;
  uuid?: () => string;
}

export class LocalProfileStore implements ProfileStore {
  private storage: KeyValueStorage | null;
  private uuid: () => string;
  private data: AppData | null = null;
  private _issue: StoreIssue = null;
  private _migrated = false;

  constructor(opts: LocalProfileStoreOptions = {}) {
    this.uuid = opts.uuid ?? defaultUuid;
    if (opts.storage !== undefined) {
      this.storage = opts.storage;
    } else {
      try {
        this.storage = typeof localStorage !== 'undefined' ? localStorage : null;
      } catch {
        this.storage = null;
      }
    }
  }

  /** Non-null when results cannot be persisted (or stored data had to be reset). */
  get issue(): StoreIssue {
    this.load();
    return this._issue;
  }

  /** True if this run migrated v0.1 data from the legacy key. */
  get migratedFromLegacy(): boolean {
    this.load();
    return this._migrated;
  }

  private createEmpty(): AppData {
    return {
      schemaVersion: 1,
      activeProfileId: '',
      profiles: [],
      prefs: { ...DEFAULT_PREFS },
    };
  }

  private newProfile(name = 'Me'): Profile {
    return { id: this.uuid(), name, createdAt: new Date().toISOString(), latestResult: null, history: [] };
  }

  private ensureProfile(data: AppData): AppData {
    if (data.profiles.length === 0) {
      const p = this.newProfile();
      data.profiles.push(p);
      data.activeProfileId = p.id;
    }
    return data;
  }

  private load(): AppData {
    if (this.data) return this.data;

    if (!this.storage) {
      this._issue = 'unavailable';
      this.data = this.ensureProfile(this.createEmpty());
      return this.data;
    }

    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
      // Probe writability so private-mode/quota failures surface up front
      this.storage.setItem(`${STORAGE_KEY}:probe`, '1');
      this.storage.removeItem(`${STORAGE_KEY}:probe`);
    } catch {
      this._issue = 'unavailable';
    }

    if (raw !== null) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      const normalized = normalizeAppData(parsed, this.uuid);
      if (normalized) {
        this.data = normalized;
        return this.data;
      }
      this._issue = this._issue ?? 'corrupt';
      try {
        this.storage.setItem(`${STORAGE_KEY}:corrupt`, raw);
      } catch {
        // Best effort only
      }
    }

    const data = this.ensureProfile(this.createEmpty());
    if (raw === null) {
      const legacy = this.readLegacy();
      if (legacy) {
        data.profiles[0].latestResult = legacy;
        this._migrated = true;
      }
    }
    this.data = data;
    this.persist();
    return this.data;
  }

  private readLegacy(): CVDParams | null {
    try {
      const raw = this.storage?.getItem(LEGACY_KEY);
      return raw ? validateParams(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    if (!this.storage || !this.data) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      if (this._issue === 'unavailable') this._issue = null;
    } catch {
      this._issue = 'unavailable';
    }
  }

  async listProfiles(): Promise<Profile[]> {
    return clone(this.load().profiles);
  }

  async getActiveProfile(): Promise<Profile | null> {
    const d = this.load();
    const p = d.profiles.find(x => x.id === d.activeProfileId) ?? null;
    return p ? clone(p) : null;
  }

  async setActiveProfile(id: string): Promise<void> {
    const d = this.load();
    if (!d.profiles.some(p => p.id === id)) throw new Error(`Unknown profile: ${id}`);
    d.activeProfileId = id;
    this.persist();
  }

  async saveResult(profileId: string, result: CVDParams): Promise<void> {
    const valid = validateParams(result);
    if (!valid) throw new Error('Invalid result');
    const d = this.load();
    const p = d.profiles.find(x => x.id === profileId);
    if (!p) throw new Error(`Unknown profile: ${profileId}`);
    if (p.latestResult) p.history = [p.latestResult, ...p.history].slice(0, HISTORY_LIMIT);
    p.latestResult = valid;
    this.persist();
  }

  async getPrefs(): Promise<Prefs> {
    return { ...this.load().prefs };
  }

  async setPrefs(prefs: Partial<Prefs>): Promise<void> {
    const d = this.load();
    d.prefs = normalizePrefs({ ...d.prefs, ...prefs });
    this.persist();
  }

  async exportAll(): Promise<string> {
    return JSON.stringify({ format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), ...this.load() }, null, 2);
  }

  /**
   * Import a backup. Accepts this app's backup format, a bare cvd-params
   * object, or the v0.1 JSON export (`{ params, trials }`). Bare results are
   * saved to the active profile; a full backup replaces all local data.
   */
  async importAll(json: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Not valid JSON');
    }
    const full = normalizeAppData(parsed, this.uuid);
    if (full) {
      this.data = full;
      this.persist();
      return;
    }
    const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    const result = validateParams(parsed) ?? validateParams(obj.params);
    if (!result) throw new Error('Unrecognized file');
    const d = this.load();
    await this.saveResult(d.activeProfileId, result);
  }

  async clearAll(): Promise<void> {
    try {
      this.storage?.removeItem(STORAGE_KEY);
      this.storage?.removeItem(LEGACY_KEY);
      this.storage?.removeItem(`${STORAGE_KEY}:corrupt`);
    } catch {
      // Nothing more we can do
    }
    this.data = this.ensureProfile(this.createEmpty());
    this._migrated = false;
    if (this._issue === 'corrupt') this._issue = null;
    // Don't persist: an empty key is the cleanest "cleared" state.
  }
}
