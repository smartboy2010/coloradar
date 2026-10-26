/**
 * One-time migration of the standalone Color Radar's `color-vision-params`
 * key (`{ type, severity: 'mild' | 'moderate' | 'strong' }`) into the active
 * profile's `latestResult`. Only runs when the profile has no result yet; the
 * old key is removed afterwards so "clear all data" can't resurrect it.
 */

import { validateParams, CVD_PARAMS_SCHEMA, type CVDParams } from '@cvd-tools/color-core';
import type { ProfileStore } from './ProfileStore.js';
import type { KeyValueStorage } from './LocalProfileStore.js';

export const RADAR_LEGACY_KEY = 'color-vision-params';

// Severities match the Machado matrices the old radar rendered (0.1 / 0.5 / 1.0 rows)
const LEGACY_SEVERITY: Record<string, { level: CVDParams['level']; severity: number }> = {
  mild: { level: 'mild', severity: 0.1 },
  moderate: { level: 'moderate', severity: 0.5 },
  strong: { level: 'severe', severity: 1 },
};

export function legacyRadarToParams(raw: string | null): CVDParams | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const sev = LEGACY_SEVERITY[String(o.severity)];
    if (!sev || !['protan', 'deutan', 'tritan'].includes(String(o.type))) return null;
    return validateParams({
      schema: CVD_PARAMS_SCHEMA,
      type: o.type,
      level: sev.level,
      severity: sev.severity,
      confidence: 'low',
      thresholds: { protan: 0, deutan: 0, tritan: 0 },
      maxOffsets: { protan: 0, deutan: 0, tritan: 0 },
      device: { userAgent: '', screen: '', selfReport: { importedFrom: RADAR_LEGACY_KEY } },
      testedAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Returns true if a legacy result was migrated. */
export async function migrateLegacyRadarParams(
  store: ProfileStore,
  storage: KeyValueStorage | null = defaultStorage(),
): Promise<boolean> {
  if (!storage) return false;
  let raw: string | null = null;
  try {
    raw = storage.getItem(RADAR_LEGACY_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;
  const profile = await store.getActiveProfile();
  if (!profile) return false;
  const params = legacyRadarToParams(raw);
  if (params && !profile.latestResult) await store.saveResult(profile.id, params);
  try {
    storage.removeItem(RADAR_LEGACY_KEY);
  } catch {
    // Best effort only
  }
  return params !== null && !profile.latestResult;
}
