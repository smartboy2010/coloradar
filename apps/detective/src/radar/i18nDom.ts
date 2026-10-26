/**
 * The radar keeps its camera, GL context and gesture state alive across
 * language switches, so static text is re-applied in place instead of
 * re-rendering: `data-i18n` → textContent, `data-i18n-aria` → aria-label.
 */

import { t } from '../i18n/i18n.js';

export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria!)); });
}
