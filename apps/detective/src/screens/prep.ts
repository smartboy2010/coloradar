/**
 * Pre-test preparation screen.
 * Guide user to adjust brightness, disable night mode, etc.
 */

import type { CVDParams, DeviceClass } from '@cvd-tools/color-core';
import { t } from '../i18n/i18n.js';
import { prepNotice } from '../device.js';

export interface SelfReport {
  brightnessFull: boolean;
  nightModeOff: boolean;
  trueColorOff: boolean;
  noColoredLighting: boolean;
}

export interface PrepOptions {
  /** Auto-detected class of this device; picks viewing distance and settings hints */
  deviceClass: DeviceClass;
  /** Currently saved result, to warn when it came from a different kind of device */
  savedResult?: CVDParams | null;
}

export function renderPrep(
  container: HTMLElement,
  onContinue: (report: SelfReport) => void,
  opts: PrepOptions,
): void {
  const dc = opts.deviceClass;
  const notice = prepNotice(opts.savedResult, dc);
  container.innerHTML = `
    <div class="screen prep-screen">
      <div class="screen-content">
        <h2>${t('prep.title')}</h2>
        <p class="prep-desc">${t('prep.desc')}</p>
        <p class="notice notice-info prep-device" role="note"><span aria-hidden="true">ℹ</span> ${t('prep.device', { device: t(`device.name.${dc}`) })} ${t(`prep.distance.${dc}`)}</p>
        ${notice ? `<p class="notice notice-warn prep-device-change" role="note"><span aria-hidden="true">⚠</span> ${notice}</p>` : ''}

        <div class="checklist">
          <label class="check-item">
            <input type="checkbox" id="ck-brightness" checked />
            <span class="check-box" aria-hidden="true"></span>
            <div>
              <span class="check-label">${t('prep.brightness')}</span>
              <span class="check-hint">${t(`prep.brightnessHint.${dc}`)}</span>
            </div>
          </label>

          <label class="check-item">
            <input type="checkbox" id="ck-nightmode" checked />
            <span class="check-box" aria-hidden="true"></span>
            <div>
              <span class="check-label">${t('prep.nightMode')}</span>
              <span class="check-hint">${t(`prep.nightModeHint.${dc}`)}</span>
            </div>
          </label>

          <label class="check-item">
            <input type="checkbox" id="ck-truetone" checked />
            <span class="check-box" aria-hidden="true"></span>
            <div>
              <span class="check-label">${t('prep.trueTone')}</span>
              <span class="check-hint">${t(`prep.trueToneHint.${dc}`)}</span>
            </div>
          </label>

          <label class="check-item">
            <input type="checkbox" id="ck-lighting" checked />
            <span class="check-box" aria-hidden="true"></span>
            <div>
              <span class="check-label">${t('prep.lighting')}</span>
              <span class="check-hint">${t('prep.lightingHint')}</span>
            </div>
          </label>
        </div>

        <button class="btn-primary" id="prep-continue">
          <span>${t('prep.ready')}</span>
          <span class="btn-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  `;

  container.querySelector('#prep-continue')!.addEventListener('click', () => {
    onContinue({
      brightnessFull: (container.querySelector('#ck-brightness') as HTMLInputElement).checked,
      nightModeOff: (container.querySelector('#ck-nightmode') as HTMLInputElement).checked,
      trueColorOff: (container.querySelector('#ck-truetone') as HTMLInputElement).checked,
      noColoredLighting: (container.querySelector('#ck-lighting') as HTMLInputElement).checked,
    });
  });
}
