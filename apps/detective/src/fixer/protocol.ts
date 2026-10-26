import type { FixOptions, FixReport } from './types.js';

export interface FixRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  options: FixOptions;
}

export type FixResponse =
  | {
    id: number;
    ok: true;
    report: FixReport;
    fixed: ArrayBuffer;
    simBefore?: ArrayBuffer;
    simAfter?: ArrayBuffer;
  }
  | { id: number; ok: false; error: string };
