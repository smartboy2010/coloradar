/**
 * Disclaimer & consent screen.
 */

import { t } from '../i18n/i18n.js';

export function renderDisclaimer(
  container: HTMLElement,
  onContinue: (dataConsent: boolean) => void,
): void {
  container.innerHTML = `
    <div class="screen disclaimer-screen">
      <div class="screen-content">
        <div class="logo-area">
          <div class="logo-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2.5"/>
              <circle cx="24" cy="24" r="12" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
              <circle cx="24" cy="24" r="4" fill="currentColor"/>
            </svg>
          </div>
          <h1>${t('app.name')}</h1>
          <p class="subtitle">${t('app.tagline')}</p>
        </div>

        <div class="info-card">
          <div class="info-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10 9v5M10 6.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <p class="info-title">${t('disclaimer.importantTitle')}</p>
            <p>${t('disclaimer.notDiagnosis')}</p>
            <p>${t('disclaimer.seeDoctor')}</p>
          </div>
        </div>

        <div class="info-card secondary">
          <p>${t('disclaimer.howItWorks')}</p>
        </div>

        <label class="consent-check" id="data-consent-label">
          <input type="checkbox" id="data-consent" />
          <span class="checkmark" aria-hidden="true"></span>
          <span>${t('disclaimer.consent')}</span>
        </label>

        <button class="btn-primary" id="start-btn">
          <span>${t('disclaimer.start')}</span>
          <span class="btn-arrow" aria-hidden="true">→</span>
        </button>

        <p class="footnote">${t('disclaimer.localOnly')}</p>
      </div>
    </div>
  `;

  const btn = container.querySelector('#start-btn') as HTMLButtonElement;
  const checkbox = container.querySelector('#data-consent') as HTMLInputElement;

  btn.addEventListener('click', () => {
    onContinue(checkbox.checked);
  });
}
