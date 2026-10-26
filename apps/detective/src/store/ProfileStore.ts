/**
 * Storage interface for profiles, results and preferences.
 * Async by design so a future cloud implementation can drop in without
 * changing callers; v0.2 ships only the localStorage implementation.
 */

import type { CVDParams } from '@cvd-tools/color-core';

export type Lang = 'en' | 'zh';
export type FixerMode = 'forMe' | 'forEveryone';

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  latestResult: CVDParams | null;
  history: CVDParams[];
}

export interface Prefs {
  lang: Lang;
  fixerMode: FixerMode;
}

export interface AppData {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: Profile[];
  prefs: Prefs;
}

/** Why the store is running from memory instead of persisting, if it is. */
export type StoreIssue = 'unavailable' | 'corrupt' | null;

export interface ProfileStore {
  listProfiles(): Promise<Profile[]>;
  getActiveProfile(): Promise<Profile | null>;
  setActiveProfile(id: string): Promise<void>;
  saveResult(profileId: string, result: CVDParams): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(p: Partial<Prefs>): Promise<void>;
  exportAll(): Promise<string>;
  importAll(json: string): Promise<void>;
  clearAll(): Promise<void>;
}

export const DEFAULT_PREFS: Prefs = { lang: 'en', fixerMode: 'forMe' };
export const HISTORY_LIMIT = 10;
