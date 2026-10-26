/**
 * Import screen: `#/import?d=…` parameter links, legacy `#cvd=` links, and backup files.
 * If nothing is saved yet the linked result is imported automatically;
 * otherwise the user confirms before it replaces the current result.
 */

import type { CVDParams } from '@cvd-tools/color-core';
import { t, formatDate } from '../i18n/i18n.js';
import { testedOnText, importNotice, currentDeviceClass } from '../device.js';
import { decodeShareData, parseLegacyHash } from '../store/shareLink.js';
import type { ProfileStore } from '../store/ProfileStore.js';
import type { Route } from '../router.js';

export interface ImportOptions {
  store: ProfileStore;
  route: Route;
  onDataChanged: () => void;
}

function summary(p: CVDParams): string {
  return `
    <div class="result-card ${p.type === 'normal' ? 'result-normal' : 'result-cvd'}">
      <div class="result-type">${t(`type.${p.type}`)}</div>
      ${p.type !== 'normal' ? `<div class="result-level">${t('results.severity', { level: t(`level.${p.level}`) })}</div>` : ''}
      <div class="result-confidence">${t('results.confidence', { confidence: t(`confidence.${p.confidence}`) })}</div>
      <div class="result-confidence">${t('results.testedAt', { date: formatDate(p.testedAt) })}</div>
      ${testedOnText(p) ? `<div class="result-confidence result-device">${testedOnText(p)}</div>` : ''}
    </div>
    ${deviceNotice(p)}`;
}

function deviceNotice(p: CVDParams): string {
  const note = importNotice(p, currentDeviceClass());
  return note ? `<p class="notice notice-warn" role="note"><span aria-hidden="true">⚠</span> ${note}</p>` : '';
}

function fileSection(): string {
  return `
    <div class="actions-section">
      <h3>${t('import.fromFile')}</h3>
      <p class="section-hint">${t('import.fromFileHint')}</p>
      <label class="btn-secondary file-btn"><span class="btn-icon" aria-hidden="true">⤒</span><span>${t('results.importFile')}</span><input type="file" id="import-file" accept="application/json,.json" /></label>
      <p class="footnote" id="import-status" role="status"></p>
    </div>
    <div class="actions-section">
      <h3>${t('import.pasteLink')}</h3>
      <form class="inline-form" id="paste-form">
        <input type="url" class="text-input" id="paste-link" placeholder="https://…#/import?d=…" aria-label="${t('import.pasteLink')}" />
        <button class="btn-secondary" type="submit">${t('import.pasteLinkGo')}</button>
      </form>
    </div>`;
}

const doneButtons = (): string => `
  <div class="action-buttons">
    <a class="btn-primary" href="#/fixer"><span>${t('import.goFixer')}</span><span class="btn-arrow" aria-hidden="true">→</span></a>
    <a class="btn-secondary" href="#/results">${t('import.goResults')}</a>
  </div>`;

export async function renderImport(container: HTMLElement, opts: ImportOptions): Promise<void> {
  const { store, route } = opts;
  const d = route.query.get('d');
  const hasLink = route.legacy !== undefined || d !== null;
  const linked = route.legacy !== undefined ? parseLegacyHash(route.legacy) : d !== null ? decodeShareData(d) : null;

  const profile = await store.getActiveProfile();
  let saved = false;
  if (linked && profile && !profile.latestResult) {
    await store.saveResult(profile.id, linked);
    saved = true;
    opts.onDataChanged();
  }

  let linkHtml = '';
  if (hasLink && !linked) {
    linkHtml = `<p class="notice notice-error" role="alert"><span aria-hidden="true">✗</span> ${t('import.invalid')}</p>`;
  } else if (linked) {
    linkHtml = `
      <p>${t('import.linkResult')}</p>
      ${summary(linked)}
      <div id="link-actions">
        ${saved
          ? `<p class="notice notice-info" role="status"><span aria-hidden="true">✓</span> ${t('import.saved')}</p>${doneButtons()}`
          : `<p class="section-hint">${t('import.replaceWarning')}</p>
             <button class="btn-primary" id="save-linked"><span>${t('import.save')}</span></button>`}
      </div>
      <p class="footnote">${t('import.privacy')}</p>`;
  }

  container.innerHTML = `
    <div class="screen import-screen">
      <div class="screen-content">
        <h2>${t('import.title')}</h2>
        ${linkHtml}
        ${fileSection()}
      </div>
    </div>`;

  container.querySelector('#save-linked')?.addEventListener('click', async () => {
    const p = await store.getActiveProfile();
    if (!p || !linked) return;
    await store.saveResult(p.id, linked);
    opts.onDataChanged();
    container.querySelector('#link-actions')!.innerHTML =
      `<p class="notice notice-info" role="status"><span aria-hidden="true">✓</span> ${t('import.saved')}</p>${doneButtons()}`;
  });

  const status = container.querySelector('#import-status') as HTMLElement;
  container.querySelector('#import-file')!.addEventListener('change', async e => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await store.importAll(await file.text());
      opts.onDataChanged();
      status.innerHTML = `${t('results.importOk')} <a href="#/results">${t('import.goResults')}</a>`;
    } catch (err) {
      status.textContent = t('results.importFailed', { error: (err as Error).message });
    }
    input.value = '';
  });

  container.querySelector('#paste-form')!.addEventListener('submit', e => {
    e.preventDefault();
    const value = (container.querySelector('#paste-link') as HTMLInputElement).value.trim();
    const hashIndex = value.indexOf('#');
    location.hash = hashIndex >= 0 ? value.slice(hashIndex) : value;
  });
}
