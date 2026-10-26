/**
 * JSON / CSV trial data export.
 */

import type { TrialRecord } from './staircase.js';
import type { CVDParams } from '@cvd-tools/color-core';

export function exportJSON(params: CVDParams, trials: TrialRecord[]): string {
  return JSON.stringify({ params, trials }, null, 2);
}

export function exportCSV(trials: TrialRecord[]): string {
  const header = 'trialNumber,axis,offset,targetIndex,response,correct,rt,isAttentionCheck,rtBaseline,hesitation,weight,hesitant';
  const opt = (v: number | boolean | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const rows = trials.map(t =>
    `${t.trialNumber},${t.axis},${t.offset.toFixed(6)},${t.targetIndex},${t.response},${t.correct},${t.rt},${t.isAttentionCheck},`
    + `${opt(t.rtBaseline)},${opt(t.hesitation)},${opt(t.weight)},${opt(t.hesitant)}`
  );
  return [header, ...rows].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(params: CVDParams, trials: TrialRecord[]): void {
  downloadFile(exportJSON(params, trials), 'cvd-test-results.json', 'application/json');
}

export function downloadCSV(trials: TrialRecord[]): void {
  downloadFile(exportCSV(trials), 'cvd-test-trials.csv', 'text/csv');
}
