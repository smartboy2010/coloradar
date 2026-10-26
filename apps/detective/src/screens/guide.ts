/**
 * User guide (`#/guide`, optional `?s=<section>` to jump to a section).
 * Copy lives in the i18n dictionaries as `guide.<section>.title` and
 * numbered items `guide.<section>.1…n` (trusted markup, e.g. <strong>).
 */

import { t } from '../i18n/i18n.js';

export const GUIDE_SECTIONS: { id: string; items: number }[] = [
  { id: 'about', items: 3 },
  { id: 'prepare', items: 5 },
  { id: 'test', items: 6 },
  { id: 'results', items: 5 },
  { id: 'fixer', items: 4 },
  { id: 'radar', items: 6 },
  { id: 'share', items: 3 },
  { id: 'devices', items: 4 },
  { id: 'privacy', items: 3 },
];

export interface GuideOptions {
  /** Section id to scroll to on open */
  section?: string | null;
}

export function renderGuide(container: HTMLElement, opts: GuideOptions = {}): void {
  const items = (id: string, n: number) =>
    Array.from({ length: n }, (_, i) => `<li>${t(`guide.${id}.${i + 1}`)}</li>`).join('');

  container.innerHTML = `
    <div class="screen wide guide-screen">
      <div class="screen-content">
        <h2>${t('guide.title')}</h2>
        <p class="guide-lead">${t('guide.lead')}</p>
        <nav class="guide-toc" aria-label="${t('guide.toc')}">
          ${GUIDE_SECTIONS.map(s => `<button type="button" class="guide-toc-link" data-target="${s.id}">${t(`guide.${s.id}.title`)}</button>`).join('')}
        </nav>
        ${GUIDE_SECTIONS.map(s => `
          <section class="settings-group guide-section" id="guide-${s.id}" tabindex="-1">
            <h3>${t(`guide.${s.id}.title`)}</h3>
            <ul class="plain-list">${items(s.id, s.items)}</ul>
          </section>`).join('')}
        <div class="guide-actions">
          <a class="btn-primary" href="#/test">${t('guide.cta.test')}</a>
          <a class="btn-secondary" href="#/radar">${t('guide.cta.radar')}</a>
        </div>
      </div>
    </div>`;

  const jump = (id: string) => {
    const el = container.querySelector<HTMLElement>(`#guide-${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  };
  container.querySelectorAll<HTMLButtonElement>('.guide-toc-link').forEach(btn => {
    btn.addEventListener('click', () => jump(btn.dataset.target!));
  });
  if (opts.section) requestAnimationFrame(() => jump(opts.section!));
  else window.scrollTo(0, 0);
}
