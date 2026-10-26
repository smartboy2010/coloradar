/**
 * The 2×2 answer buttons shared by the practice and test screens.
 */

import { t } from '../i18n/i18n.js';

const CELL_KEYS = ['cell.topLeft', 'cell.topRight', 'cell.bottomLeft', 'cell.bottomRight'];

export function cellButtonsHtml(): string {
  return CELL_KEYS.map((k, i) =>
    `<button class="cell-btn" data-index="${i}" aria-label="${t(k)}"><span class="cell-label">${t(k)}</span></button>`,
  ).join('\n');
}
