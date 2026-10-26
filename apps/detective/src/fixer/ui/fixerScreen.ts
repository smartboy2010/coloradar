/**
 * Chart Fixer screen: input (upload / drop / paste / samples), settings bar
 * (mode, parameter source, strength), comparison, change list, palette locks, download.
 *
 * State lives at module scope so a language switch (which re-renders the
 * screen) keeps the current image and result.
 */

import type { CVDParams } from '@cvd-tools/color-core';
import { t, escapeHtml } from '../../i18n/i18n.js';
import type { ProfileStore } from '../../store/ProfileStore.js';
import { simsForResult, simsForEveryone, computeTau, type FixMode } from '../confusion.js';
import { runFix, type FixResult } from '../client.js';
import type { FixReport, SimSpec } from '../types.js';
import { createCompareSlider } from '../../components/compareSlider.js';
import { fileToImageData, isAcceptedImage, previewCanvas, downloadPng } from './image.js';
import { renderSample, type SampleId } from './samples.js';

type OverrideType = Exclude<CVDParams['type'], 'normal'>;
type OverrideLevel = Exclude<CVDParams['level'], 'none'>;

const LEVEL_SEVERITY: Record<OverrideLevel, number> = { mild: 0.3, moderate: 0.6, severe: 1 };
const OVERRIDE_TYPES: OverrideType[] = ['rg_uncertain', 'protan', 'deutan', 'tritan'];
const OVERRIDE_LEVELS: OverrideLevel[] = ['mild', 'moderate', 'severe'];
/** Used in "For me" mode when there is no test result and the user hasn't picked a type */
const DEFAULT_OVERRIDE: { type: OverrideType; level: OverrideLevel } = { type: 'rg_uncertain', level: 'moderate' };

interface FixerState {
  mode: FixMode | null;
  override: { type: OverrideType; level: OverrideLevel } | null;
  includeTritan: boolean;
  strength: number;
  locked: Set<string>;
  image: ImageData | null;
  fileName: string;
  status: 'idle' | 'working' | 'done' | 'error';
  error: string;
  result: FixResult | null;
  showSim: boolean;
  runId: number;
}

const state: FixerState = {
  mode: null,
  override: null,
  includeTritan: false,
  strength: 1,
  locked: new Set(),
  image: null,
  fileName: '',
  status: 'idle',
  error: '',
  result: null,
  showSim: false,
  runId: 0,
};

export interface FixerContext {
  store: ProfileStore;
  params: CVDParams | null;
  initialMode: FixMode;
}

interface Effective {
  sims: SimSpec[];
  tau: number;
  /** Personal result says typical vision and no override: nothing to fix in For me mode */
  normal: boolean;
}

function levelFromSeverity(s: number): OverrideLevel {
  return s < 0.4 ? 'mild' : s < 0.75 ? 'moderate' : 'severe';
}

function effective(ctx: FixerContext): Effective {
  if (state.mode === 'forEveryone') {
    return { sims: simsForEveryone(state.includeTritan), tau: computeTau('forEveryone', null, state.strength), normal: false };
  }
  const p = ctx.params;
  const ov = state.override ?? (p ? null : DEFAULT_OVERRIDE);
  if (ov) {
    return {
      sims: simsForResult(ov.type, LEVEL_SEVERITY[ov.level]),
      tau: computeTau('forMe', 'medium', state.strength),
      normal: false,
    };
  }
  if (p && p.type !== 'normal') {
    return { sims: simsForResult(p.type, p.severity), tau: computeTau('forMe', p.confidence, state.strength), normal: false };
  }
  return { sims: [], tau: computeTau('forMe', p?.confidence ?? null, state.strength), normal: true };
}

function swatch(hex: string): string {
  return `<span class="swatch" style="background:${hex}" aria-hidden="true"></span>`;
}

function hexLabel(hex: string): string {
  return `<code class="hex">${hex.toUpperCase()}</code>`;
}

function describeChange(dL: number, dC: number, dh: number): string {
  const parts: string[] = [];
  if (dL > 0.03) parts.push(t('fixer.changes.lighter'));
  else if (dL < -0.03) parts.push(t('fixer.changes.darker'));
  if (dC > 0.02) parts.push(t('fixer.changes.moreVivid'));
  else if (dC < -0.02) parts.push(t('fixer.changes.softer'));
  if (Math.abs(dh) > 8) parts.push(t('fixer.changes.hueShifted'));
  if (!parts.length) parts.push(t('fixer.changes.adjusted'));
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function settingsBarHtml(ctx: FixerContext, eff: Effective): string {
  const mode = state.mode!;
  const p = ctx.params;
  let usingHtml = '';
  if (mode === 'forEveryone') {
    usingHtml = `<p class="using">${t(state.includeTritan ? 'fixer.using.everyoneTritan' : 'fixer.using.everyone')}</p>`;
  } else if (state.override) {
    usingHtml = `<p class="using">${t('fixer.using.override', {
      type: t(`typeShort.${state.override.type}`), level: t(`level.${state.override.level}`),
    })}</p>`;
  } else if (p) {
    usingHtml = `<p class="using">${t('fixer.using.result', {
      type: t(`typeShort.${p.type}`), level: t(`level.${p.level}`),
    })}</p>`;
  }
  if (mode === 'forMe' && !p) {
    usingHtml += `<p class="using using-muted">${t('fixer.using.none')} <a href="#/test">${t('fixer.using.takeTest')}</a></p>`;
  }

  const ov = state.override ?? (p && p.type !== 'normal' && p.level !== 'none'
    ? { type: p.type, level: p.level }
    : DEFAULT_OVERRIDE);

  return `
    <section class="fixer-settings" aria-label="${t('fixer.mode.label')}">
      <div class="segmented" role="radiogroup" aria-label="${t('fixer.mode.label')}">
        <label class="segment"><input type="radio" name="fixer-mode" value="forMe" ${mode === 'forMe' ? 'checked' : ''} /><span>${t('fixer.mode.forMe')}</span></label>
        <label class="segment"><input type="radio" name="fixer-mode" value="forEveryone" ${mode === 'forEveryone' ? 'checked' : ''} /><span>${t('fixer.mode.forEveryone')}</span></label>
      </div>
      <p class="section-hint">${t(mode === 'forMe' ? 'fixer.mode.forMeHint' : 'fixer.mode.forEveryoneHint')}</p>
      ${usingHtml}
      ${mode === 'forMe' ? `
        <details class="override" ${state.override || !p ? 'open' : ''}>
          <summary>${t('fixer.override.toggle')}</summary>
          <div class="override-row">
            <label>${t('fixer.override.type')}
              <select id="ov-type">${OVERRIDE_TYPES.map(v => `<option value="${v}" ${ov.type === v ? 'selected' : ''}>${t(`typeShort.${v}`)}</option>`).join('')}</select>
            </label>
            <label>${t('fixer.override.level')}
              <select id="ov-level">${OVERRIDE_LEVELS.map(v => `<option value="${v}" ${ov.level === v ? 'selected' : ''}>${t(`level.${v}`)}</option>`).join('')}</select>
            </label>
          </div>
          ${state.override && p ? `<button class="text-link" id="ov-reset" type="button">${t('fixer.override.reset')}</button>` : ''}
        </details>` : `
        <label class="toggle"><input type="checkbox" id="tritan" ${state.includeTritan ? 'checked' : ''} /><span class="toggle-track" aria-hidden="true"></span><span>${t('fixer.tritan')}</span></label>`}
      <label class="strength">
        <span>${t('fixer.strength')}</span>
        <span class="strength-row"><span class="strength-end">${t('fixer.strengthGentle')}</span>
        <input type="range" id="strength" min="0" max="2" step="0.25" value="${state.strength}" />
        <span class="strength-end">${t('fixer.strengthStrong')}</span></span>
      </label>
      ${eff.normal ? `
        <div class="notice notice-info" role="status">
          <p><span aria-hidden="true">ℹ</span> ${t('fixer.normalNotice')}</p>
          <button class="btn-secondary" id="switch-everyone" type="button">${t('fixer.switchEveryone')}</button>
        </div>` : ''}
    </section>`;
}

function inputHtml(): string {
  const has = !!state.image;
  return `
    <section class="fixer-input">
      <label class="dropzone ${has ? 'dropzone-compact' : ''}" id="dropzone">
        <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp" />
        ${has ? `<span class="dropzone-title">⤒ ${t('fixer.drop.replace')}</span>` : `
        <span class="dropzone-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" stroke-width="2"/><path d="M4 26l9-8 7 6 5-4 11 8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="27" cy="15" r="3" stroke="currentColor" stroke-width="2"/></svg>
        </span>
        <span class="dropzone-title">${t('fixer.drop.title')}</span>
        <span class="dropzone-body">${t('fixer.drop.body')}</span>
        <span class="btn-secondary dropzone-btn">${t('fixer.drop.choose')}</span>
        <span class="footnote">${t('fixer.drop.formats')}</span>`}
      </label>
      <div class="samples">
        <span>${t('fixer.samples')}</span>
        ${(['line', 'bar', 'map'] as SampleId[]).map(id =>
          `<button class="chip" type="button" data-sample="${id}">${t(`fixer.sample.${id}`)}</button>`).join('')}
      </div>
      <p class="footnote">🔒 ${t('fixer.drop.privacy')}</p>
    </section>`;
}

function resultHtml(report: FixReport): string {
  const colors = report.palette.colors;
  const resolved = report.before.length - report.after.length;
  const nothing = report.before.length === 0;
  const viewSim = report.viewSim >= 0 ? report.sims[report.viewSim] : null;
  const simType = viewSim ? t(`typeShort.${viewSim.type}`) : '';

  const changes = report.changes.map(ch => {
    const others = ch.distinguishFrom.map(id => `${swatch(colors[id].hex)}${hexLabel(colors[id].hex)}`).join(', ');
    return `
      <li class="change-item">
        <div class="change-colors">
          ${swatch(ch.from)}${hexLabel(ch.from)}
          <span class="change-arrow" aria-label="→">→</span>
          ${swatch(ch.to)}${hexLabel(ch.to)}
        </div>
        <div class="change-desc">${describeChange(ch.dL, ch.dC, ch.dh)}. ${others ? t('fixer.changes.reason', { others }) : ''}</div>
      </li>`;
  }).join('');

  const palette = colors.map(c => {
    const locked = state.locked.has(c.hex);
    if (c.neutral) {
      return `<span class="palette-chip palette-neutral" title="${t('fixer.palette.neutral')}">${swatch(c.hex)}${hexLabel(c.hex)}<span class="sr-only">${t('fixer.palette.neutral')}</span></span>`;
    }
    return `<button type="button" class="palette-chip ${locked ? 'is-locked' : ''}" data-lock="${c.hex}" aria-pressed="${locked}"
      aria-label="${t(locked ? 'fixer.palette.unlock' : 'fixer.palette.lock', { hex: c.hex.toUpperCase() })}">
      ${swatch(c.hex)}${hexLabel(c.hex)}${locked ? `<span class="lock-badge">🔒 ${t('fixer.palette.locked')}</span>` : ''}
    </button>`;
  }).join('');

  return `
    <section class="fixer-result" aria-live="polite">
      ${!report.palette.suitable ? `<p class="notice notice-warn" role="alert"><span aria-hidden="true">⚠</span> ${t('fixer.unsuitable')}</p>` : ''}
      <p class="fixer-summary">
        ${nothing
          ? `<span aria-hidden="true">✓</span> ${t('fixer.summary.nothing')} ${t('fixer.summary.nothingSafe')}`
          : `<span aria-hidden="true">✓</span> ${t('fixer.summary.fixed', {
            changed: report.changes.length, total: colors.length, resolved, pairs: report.before.length,
          })}`}
        ${report.after.length ? `<br /><span aria-hidden="true">⚠</span> ${t('fixer.summary.partial', { remaining: report.after.length })}` : ''}
      </p>
      ${viewSim ? `
        <label class="toggle"><input type="checkbox" id="show-sim" ${state.showSim ? 'checked' : ''} /><span class="toggle-track" aria-hidden="true"></span>
          <span>${state.mode === 'forEveryone' ? t('fixer.view.toggleEveryone', { type: simType }) : t('fixer.view.toggleMe')}</span></label>` : ''}
      <div id="fixer-compare"></div>
      ${viewSim && state.showSim ? `<p class="footnote">${state.mode === 'forEveryone'
        ? t('fixer.view.noteEveryone', { type: simType })
        : t('fixer.view.note', { type: simType, level: t(`level.${levelFromSeverity(viewSim.severity)}`) })}</p>` : ''}
      <button class="btn-primary" id="download" type="button"><span class="btn-icon" aria-hidden="true">⤓</span><span>${t('fixer.download')}</span></button>

      <div class="actions-section">
        <h3>${t('fixer.changes.title')}</h3>
        ${report.changes.length ? `<ul class="change-list">${changes}</ul>` : `<p class="section-hint">${t('fixer.changes.none')}</p>`}
      </div>

      <div class="actions-section">
        <h3>${t('fixer.palette.title')}</h3>
        <p class="section-hint">${t('fixer.palette.hint')}</p>
        <div class="palette-list">${palette}</div>
      </div>
    </section>`;
}

let currentCtx: FixerContext | null = null;
let currentContainer: HTMLElement | null = null;

async function process(): Promise<void> {
  const ctx = currentCtx;
  if (!ctx || !state.image) return;
  const eff = effective(ctx);
  const runId = ++state.runId;
  state.status = 'working';
  state.error = '';
  render();
  try {
    const result = await runFix(state.image, { sims: eff.sims, tau: eff.tau, locked: [...state.locked] });
    if (runId !== state.runId) return;
    state.result = result;
    state.status = 'done';
  } catch (err) {
    if (runId !== state.runId) return;
    state.status = 'error';
    state.error = t('fixer.error.process', { error: escapeHtml((err as Error).message) });
  }
  render();
}

async function loadFile(file: File): Promise<void> {
  if (!isAcceptedImage(file)) {
    state.status = 'error';
    state.error = t('fixer.error.type');
    render();
    return;
  }
  try {
    state.image = await fileToImageData(file);
    state.fileName = file.name.replace(/\.[^.]+$/, '') || 'chart';
  } catch {
    state.status = 'error';
    state.error = t('fixer.error.load');
    render();
    return;
  }
  state.locked.clear();
  state.result = null;
  await process();
}

function settingsChanged(): void {
  render();
  if (state.image) void process();
}

function render(): void {
  const ctx = currentCtx;
  const container = currentContainer;
  if (!ctx || !container) return;
  const eff = effective(ctx);
  const working = state.status === 'working';

  container.innerHTML = `
    <div class="screen wide fixer-screen">
      <div class="screen-content">
        <h2>${t('fixer.title')}</h2>
        <p class="lead">${t('fixer.lead')}</p>
        ${settingsBarHtml(ctx, eff)}
        ${inputHtml()}
        ${working ? `<p class="status-line" role="status"><span class="spinner" aria-hidden="true"></span> ${t('fixer.working')}</p>` : ''}
        ${state.status === 'error' ? `<p class="notice notice-error" role="alert"><span aria-hidden="true">✗</span> ${state.error}</p>` : ''}
        ${state.result && state.image ? resultHtml(state.result.report) : ''}
      </div>
    </div>`;

  // Settings
  container.querySelectorAll<HTMLInputElement>('input[name="fixer-mode"]').forEach(input => {
    input.addEventListener('change', () => {
      state.mode = input.value as FixMode;
      void ctx.store.setPrefs({ fixerMode: state.mode });
      settingsChanged();
    });
  });
  const ovType = container.querySelector('#ov-type') as HTMLSelectElement | null;
  const ovLevel = container.querySelector('#ov-level') as HTMLSelectElement | null;
  const applyOverride = () => {
    state.override = { type: ovType!.value as OverrideType, level: ovLevel!.value as OverrideLevel };
    settingsChanged();
  };
  ovType?.addEventListener('change', applyOverride);
  ovLevel?.addEventListener('change', applyOverride);
  container.querySelector('#ov-reset')?.addEventListener('click', () => {
    state.override = null;
    settingsChanged();
  });
  container.querySelector('#tritan')?.addEventListener('change', e => {
    state.includeTritan = (e.currentTarget as HTMLInputElement).checked;
    settingsChanged();
  });
  container.querySelector('#strength')?.addEventListener('change', e => {
    state.strength = parseFloat((e.currentTarget as HTMLInputElement).value);
    settingsChanged();
  });
  container.querySelector('#switch-everyone')?.addEventListener('click', () => {
    state.mode = 'forEveryone';
    void ctx.store.setPrefs({ fixerMode: state.mode });
    settingsChanged();
  });

  // Input
  const dropzone = container.querySelector('#dropzone') as HTMLElement;
  const fileInput = container.querySelector('#file-input') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) void loadFile(f);
  });
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('is-dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('is-dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) void loadFile(f);
  });
  container.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.sample as SampleId;
      state.image = renderSample(id);
      state.fileName = `sample-${id}`;
      state.locked.clear();
      state.result = null;
      void process();
    });
  });

  // Result
  const result = state.result;
  if (result && state.image) {
    const host = container.querySelector('#fixer-compare');
    const useSim = state.showSim && result.simBefore && result.simAfter;
    const before = previewCanvas(useSim ? result.simBefore! : state.image);
    const after = previewCanvas(useSim ? result.simAfter! : result.fixed);
    const slider = createCompareSlider({
      before,
      after,
      beforeLabel: t('fixer.compare.original'),
      afterLabel: t('fixer.compare.fixed'),
      ariaLabel: t('fixer.compare.slider'),
    });
    host?.append(slider.element);

    container.querySelector('#show-sim')?.addEventListener('change', e => {
      state.showSim = (e.currentTarget as HTMLInputElement).checked;
      render();
    });
    container.querySelector('#download')?.addEventListener('click', () => {
      downloadPng(result.fixed, `${state.fileName}-fixed.png`);
    });
    container.querySelectorAll<HTMLButtonElement>('[data-lock]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hex = btn.dataset.lock!;
        if (state.locked.has(hex)) state.locked.delete(hex);
        else state.locked.add(hex);
        void process();
      });
    });
  }
}

function onPaste(e: ClipboardEvent): void {
  const item = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file' && i.type.startsWith('image/'));
  const file = item?.getAsFile();
  if (file) {
    e.preventDefault();
    void loadFile(file);
  }
}

/** Mount the screen; returns a cleanup function. */
export function renderFixer(container: HTMLElement, ctx: FixerContext): () => void {
  currentCtx = ctx;
  currentContainer = container;
  if (state.mode === null) {
    // No personal result → default to the universal mode (C-02)
    state.mode = ctx.params ? ctx.initialMode : 'forEveryone';
  }
  render();
  document.addEventListener('paste', onPaste);
  return () => {
    document.removeEventListener('paste', onPaste);
    currentCtx = null;
    currentContainer = null;
  };
}

/** Forget the parameter-dependent part of the state (e.g. after data is cleared or imported). */
export function resetFixerSettings(): void {
  state.mode = null;
  state.override = null;
  state.result = null;
}
