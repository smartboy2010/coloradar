/**
 * Radar personalization: which Machado simulations drive daltonization.
 *
 * Source order: manual override (this session) → the active profile's
 * `latestResult` (cvd-app/v1, shared with the test and Chart Fixer) → a
 * generic default. Simulations come from the fixer's `simsForResult`, so
 * `rg_uncertain` means protan + deutan at the same severity, exactly as in
 * the Chart Fixer's "For me" mode.
 *
 * This module has no WebGL dependency so the router can import it eagerly.
 */

import { machadoMatrix, type CVDParams } from '@cvd-tools/color-core';
import { simsForResult } from '../fixer/confusion.js';
import type { SimSpec } from '../fixer/types.js';

export type RadarOverrideType = Exclude<CVDParams['type'], 'normal'>;
export const RADAR_OVERRIDE_TYPES: readonly RadarOverrideType[] = ['protan', 'deutan', 'tritan', 'rg_uncertain'];

export interface RadarOverride {
  type: RadarOverrideType;
  severity: number;
}

/** Same default as the Chart Fixer without a result: red-green, type unclear, moderate. */
export const RADAR_DEFAULT: RadarOverride = { type: 'rg_uncertain', severity: 0.6 };

export interface RadarEffective {
  source: 'override' | 'result' | 'default';
  type: CVDParams['type'];
  severity: number;
  sims: SimSpec[];
  /** Result says typical color vision and there is no override: nothing to enhance. */
  normal: boolean;
}

// Session-only, like the Chart Fixer's override; cleared when the saved result changes.
let override: RadarOverride | null = null;

export function getRadarOverride(): RadarOverride | null {
  return override ? { ...override } : null;
}

export function setRadarOverride(o: RadarOverride | null): void {
  override = o ? { type: o.type, severity: Math.max(0, Math.min(1, o.severity)) } : null;
}

export function resetRadarSettings(): void {
  override = null;
}

export function effectiveRadar(result: CVDParams | null, ov: RadarOverride | null = override): RadarEffective {
  if (ov) return { source: 'override', type: ov.type, severity: ov.severity, sims: simsForResult(ov.type, ov.severity), normal: false };
  if (result) {
    return {
      source: 'result',
      type: result.type,
      severity: result.severity,
      sims: simsForResult(result.type, result.severity),
      normal: result.type === 'normal',
    };
  }
  return {
    source: 'default',
    type: RADAR_DEFAULT.type,
    severity: RADAR_DEFAULT.severity,
    sims: simsForResult(RADAR_DEFAULT.type, RADAR_DEFAULT.severity),
    normal: false,
  };
}

/** color-core matrices are row-major; WebGL `uniformMatrix3fv` wants column-major. */
export function toGLMat3(rowMajor: readonly number[]): Float32Array {
  const m = rowMajor;
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

const IDENTITY = toGLMat3([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export interface SimUniforms {
  /** 0 = no enhancement, 1 = single simulation, 2 = worst case over two */
  count: 0 | 1 | 2;
  sim0: Float32Array;
  sim1: Float32Array;
}

export function simUniforms(sims: SimSpec[]): SimUniforms {
  const mats = sims.slice(0, 2).map(s => toGLMat3(machadoMatrix(s.type, s.severity)));
  return {
    count: mats.length as 0 | 1 | 2,
    sim0: mats[0] ?? IDENTITY,
    sim1: mats[1] ?? IDENTITY,
  };
}
