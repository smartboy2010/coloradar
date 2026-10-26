/**
 * My Results: renders from stored CVDParams alone. Trial data is optional —
 * it only exists right after a test, for the research CSV export.
 */

import type { CVDParams, CVDType } from '@cvd-tools/color-core';
import { simulateCVD, srgbToLinearRGB, linearRGBToSrgb, clampRGB, srgbTo8bit } from '@cvd-tools/color-core';
import type { TrialRecord } from '../staircase.js';
import { downloadFile, downloadJSON, downloadCSV } from '../export.js';
import { createCompareSlider } from '../components/compareSlider.js';
import { t, formatDate } from '../i18n/i18n.js';
import { testedOnText, retestNotice } from '../device.js';
import { buildShareUrl } from '../store/shareLink.js';
import type { ProfileStore } from '../store/ProfileStore.js';

export interface ResultsOptions {
  store: ProfileStore;
  trials?: TrialRecord[];
  justFinished?: boolean;
  /** Result this one replaced (history[0]), to flag a change of device class */
  previous?: CVDParams | null;
  onRetest: () => void;
  onOpenFixer: () => void;
  onDataChanged: () => void;
}

function createComparisonCanvas(type: CVDType, severity: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const size = 280;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const colors: Array<[number, number, number]> = [
    [0.9, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.3, 0.9],
    [0.95, 0.85, 0.1], [0.9, 0.5, 0.1], [0.6, 0.2, 0.8],
    [0.1, 0.8, 0.8], [0.9, 0.4, 0.6], [0.4, 0.7, 0.3],
  ];
  const cols = 3;
  const cell = size / cols;
  colors.forEach(([sr, sg, sb], i) => {
    const simulated = simulateCVD(srgbToLinearRGB([sr, sg, sb]), type, severity);
    const [r8, g8, b8] = srgbTo8bit(linearRGBToSrgb(clampRGB(simulated)));
    ctx.fillStyle = `rgb(${r8},${g8},${b8})`;
    ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  });
  return canvas;
}

function normalized(params: CVDParams): CVDParams['thresholds'] | null {
  const { thresholds: th, maxOffsets: mo } = params;
  if (!(mo.protan > 0 && mo.deutan > 0 && mo.tritan > 0)) return null;
  const n = (v: number, m: number) => Math.min(1, v / m);
  return { protan: n(th.protan, mo.protan), deutan: n(th.deutan, mo.deutan), tritan: n(th.tritan, mo.tritan) };
}

const HESITATION_NOTE_SHARE = 0.25;

function hesitationNote(params: CVDParams): string {
  const h = params.hesitation;
  if (!h || params.type === 'normal' || params.type === 'tritan') return '';
  if (!h.downgraded && h.hesitantShare < HESITATION_NOTE_SHARE) return '';
  const pct = Math.round(h.hesitantShare * 100);
  return `<p class="notice notice-info" role="note">${t(h.downgraded ? 'results.hesitation.downgraded' : 'results.hesitation.many', { pct })}</p>`;
}

function thresholdRow(axis: 'protan' | 'deutan' | 'tritan', value: number): string {
  return `
    <div class="threshold-item">
      <span class="threshold-label">${t(`results.axis.${axis}`)}</span>
      <div class="threshold-bar-bg">
        <div class="threshold-bar-fill ${axis}-bar" style="width: ${Math.min(100, value * 100)}%"></div>
      </div>
      <span class="threshold-value">${(value * 100).toFixed(1)}%</span>
    </div>`;
}

function flash(btn: HTMLButtonElement, text: string): void {
  const orig = btn.innerHTML;
  btn.innerHTML = `<span class="btn-icon" aria-hidden="true">✓</span><span>${text}</span>`;
  setTimeout(() => { btn.innerHTML = orig; }, 2000);
}

function renderEmpty(container: HTMLElement, opts: ResultsOptions): void {
  container.innerHTML = `
    <div class="screen results-screen">
      <div class="screen-content">
        <h2>${t('results.title')}</h2>
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2.5"/>
              <circle cx="24" cy="24" r="12" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
            </svg>
          </div>
          <p class="info-title">${t('results.empty.title')}</p>
          <p>${t('results.empty.body')}</p>
        </div>
        <button class="btn-primary" id="take-test"><span>${t('results.empty.take')}</span><span class="btn-arrow" aria-hidden="true">→</span></button>
        <a class="text-link" href="#/import">${t('results.empty.import')}</a>
      </div>
    </div>`;
  container.querySelector('#take-test')!.addEventListener('click', opts.onRetest);
}

export function renderResults(container: HTMLElement, params: CVDParams | null, opts: ResultsOptions): void {
  if (!params) {
    renderEmpty(container, opts);
    return;
  }

  const isNormal = params.type === 'normal';
  const cvdType = (params.type === 'rg_uncertain' ? 'deutan' : params.type) as CVDType;
  const norm = normalized(params);
  const imported = typeof params.device.selfReport.importedFrom === 'string';
  const trials = opts.trials ?? [];
  const testedOn = testedOnText(params);
  const deviceNote = retestNotice(params, opts.previous);

  container.innerHTML = `
    <div class="screen results-screen">
      <div class="screen-content">
        <h2>${t('results.title')}</h2>
        ${opts.justFinished ? `<p class="notice notice-info" role="status"><span aria-hidden="true">✓</span> ${t('results.justFinished')}</p>` : ''}

        <div class="result-card ${isNormal ? 'result-normal' : 'result-cvd'}">
          <div class="result-icon" aria-hidden="true">
            ${isNormal
              ? '<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 20l6 6 10-12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
              : '<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 12v10M20 26v.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'
            }
          </div>
          <div class="result-type">${t(`type.${params.type}`)}</div>
          ${!isNormal ? `<div class="result-level">${t('results.severity', { level: t(`level.${params.level}`) })}</div>` : ''}
          <div class="result-confidence">${t('results.confidence', { confidence: t(`confidence.${params.confidence}`) })}</div>
          <div class="result-confidence">${t('results.testedAt', { date: formatDate(params.testedAt) })}</div>
          ${testedOn ? `<div class="result-confidence result-device">${testedOn}</div>` : ''}
        </div>
        ${deviceNote ? `<p class="notice notice-warn" role="note"><span aria-hidden="true">⚠</span> ${deviceNote}</p>` : ''}
        ${hesitationNote(params)}

        <div class="info-card warning">
          <div class="info-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L1 18h18L10 2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M10 8v5M10 15v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <p class="info-title">${t('results.disclaimerTitle')}</p>
            <p>${t('results.disclaimerBody')}</p>
          </div>
        </div>

        <button class="btn-primary" id="open-fixer"><span>${t('results.useInFixer')}</span><span class="btn-arrow" aria-hidden="true">→</span></button>

        ${norm ? `
        <div class="thresholds-section">
          <h3>${t('results.thresholds')}</h3>
          <div class="threshold-bars">
            ${thresholdRow('protan', norm.protan)}
            ${thresholdRow('deutan', norm.deutan)}
            ${thresholdRow('tritan', norm.tritan)}
          </div>
        </div>` : imported ? `<p class="footnote">${t('results.imported')}</p>` : ''}

        ${!isNormal ? `
        <div class="comparison-section">
          <h3>${t('results.comparison')}</h3>
          <p class="comparison-desc">${t('results.comparisonDesc')}</p>
          <div id="comparison-host"></div>
        </div>` : ''}

        <div class="actions-section">
          <h3>${t('results.backupTitle')}</h3>
          <p class="section-hint">${t('results.backupHint')}</p>
          <div class="action-buttons">
            <button class="btn-secondary" id="download-backup"><span class="btn-icon" aria-hidden="true">⤓</span><span>${t('results.downloadBackup')}</span></button>
            <button class="btn-secondary" id="copy-link"><span class="btn-icon" aria-hidden="true">🔗</span><span>${t('results.copyLink')}</span></button>
            <label class="btn-secondary file-btn"><span class="btn-icon" aria-hidden="true">⤒</span><span>${t('results.importFile')}</span><input type="file" id="import-file" accept="application/json,.json" /></label>
          </div>
          <p class="footnote" id="import-status" role="status"></p>
        </div>

        <div class="actions-section">
          <h3>${t('results.exportTitle')}</h3>
          <div class="action-buttons">
            <button class="btn-secondary" id="export-json"><span class="btn-icon" aria-hidden="true">{ }</span><span>${t('results.exportJson')}</span></button>
            ${trials.length ? `<button class="btn-secondary" id="export-csv"><span class="btn-icon" aria-hidden="true">📊</span><span>${t('results.exportCsv')}</span></button>` : ''}
            <button class="btn-secondary" id="copy-params"><span class="btn-icon" aria-hidden="true">📋</span><span>${t('results.copyParams')}</span></button>
          </div>
        </div>

        <button class="btn-secondary btn-wide" id="restart-btn"><span>${t('results.retest')}</span></button>
      </div>
    </div>
  `;

  if (!isNormal) {
    const slider = createCompareSlider({
      before: createComparisonCanvas(cvdType, 0),
      after: createComparisonCanvas(cvdType, params.severity),
      beforeLabel: t('results.comparisonTypical'),
      afterLabel: t('results.comparisonSimulated'),
      ariaLabel: t('results.comparisonSlider'),
      maxWidth: 280,
    });
    container.querySelector('#comparison-host')!.append(slider.element);
  }

  container.querySelector('#open-fixer')!.addEventListener('click', opts.onOpenFixer);

  container.querySelector('#download-backup')!.addEventListener('click', async () => {
    const json = await opts.store.exportAll();
    downloadFile(json, `color-vision-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  });

  container.querySelector('#copy-link')!.addEventListener('click', async e => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(buildShareUrl(params, location));
      flash(btn, t('common.copied'));
    } catch {
      window.prompt(t('results.copyLink'), buildShareUrl(params, location));
    }
  });

  const status = container.querySelector('#import-status') as HTMLElement;
  container.querySelector('#import-file')!.addEventListener('change', async e => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await opts.store.importAll(await file.text());
      status.textContent = t('results.importOk');
      opts.onDataChanged();
    } catch (err) {
      status.textContent = t('results.importFailed', { error: (err as Error).message });
    }
    input.value = '';
  });

  container.querySelector('#export-json')!.addEventListener('click', () => downloadJSON(params, trials));
  container.querySelector('#export-csv')?.addEventListener('click', () => downloadCSV(trials));
  container.querySelector('#copy-params')!.addEventListener('click', e => {
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(() => flash(btn, t('common.copied')), () => {});
  });

  container.querySelector('#restart-btn')!.addEventListener('click', () => {
    if (window.confirm(t('results.retestConfirm'))) opts.onRetest();
  });
}
