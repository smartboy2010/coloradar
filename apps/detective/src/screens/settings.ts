/**
 * Settings: language, help (user guide), local data (status + clear), privacy notes.
 */

import { t, getLang } from '../i18n/i18n.js';
import { helpIcon } from '../components/icons.js';
import type { Lang } from '../store/ProfileStore.js';
import type { LocalProfileStore } from '../store/LocalProfileStore.js';

export interface SettingsOptions {
  store: LocalProfileStore;
  /** Status line to show (e.g. after clearing data, which re-renders the screen) */
  message?: string;
  onLangChange: (lang: Lang) => void;
  onClear: () => Promise<void>;
}

export function renderSettings(container: HTMLElement, opts: SettingsOptions): void {
  const lang = getLang();
  container.innerHTML = `
    <div class="screen settings-screen">
      <div class="screen-content">
        <h2>${t('settings.title')}</h2>

        <fieldset class="settings-group">
          <legend>${t('settings.language')}</legend>
          <div class="segmented" role="radiogroup" aria-label="${t('settings.language')}">
            <label class="segment"><input type="radio" name="lang" value="en" ${lang === 'en' ? 'checked' : ''} /><span>English</span></label>
            <label class="segment"><input type="radio" name="lang" value="zh" ${lang === 'zh' ? 'checked' : ''} /><span>中文</span></label>
          </div>
        </fieldset>

        <section class="settings-group">
          <h3>${t('settings.helpTitle')}</h3>
          <p>${t('settings.helpBody')}</p>
          <a class="btn-secondary" href="#/guide">${helpIcon(18)}<span>${t('settings.helpLink')}</span></a>
        </section>

        <section class="settings-group">
          <h3>${t('settings.dataTitle')}</h3>
          <p>${t('settings.dataBody')}</p>
          <p class="section-hint">${opts.store.issue === 'unavailable' ? `⚠ ${t('settings.storageMemory')}` : `✓ ${t('settings.storageOk')}`}</p>
          <button class="btn-danger" id="clear-data"><span class="btn-icon" aria-hidden="true">✕</span><span>${t('settings.clear')}</span></button>
          <p class="footnote" id="clear-status" role="status"></p>
        </section>

        <section class="settings-group">
          <h3>${t('settings.privacyTitle')}</h3>
          <ul class="plain-list">
            <li>${t('settings.privacy1')}</li>
            <li>${t('settings.privacy2')}</li>
            <li>${t('settings.privacy3')}</li>
            <li>${t('settings.privacy4')}</li>
          </ul>
        </section>

        <section class="settings-group">
          <h3>${t('settings.aboutTitle')}</h3>
          <p>${t('settings.about')}</p>
        </section>
      </div>
    </div>`;

  container.querySelectorAll<HTMLInputElement>('input[name="lang"]').forEach(input => {
    input.addEventListener('change', () => opts.onLangChange(input.value as Lang));
  });

  if (opts.message) {
    container.querySelector('#clear-status')!.textContent = opts.message;
  }

  container.querySelector('#clear-data')!.addEventListener('click', () => {
    if (window.confirm(t('settings.clearConfirm'))) void opts.onClear();
  });
}
