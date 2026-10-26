import type { CVDParams } from '@cvd-tools/color-core';
import { t, formatDate, escapeHtml } from '../../i18n/i18n.js';
import { testedOnText } from '../../device.js';
import { RADAR_DEFAULT, RADAR_OVERRIDE_TYPES, type RadarOverride, type RadarOverrideType } from '../params.js';

export interface ParamsPanelOptions {
  getResult(): CVDParams | null;
  getOverride(): RadarOverride | null;
  onOverrideChange(o: RadarOverride | null): void;
}

function resultSource(p: CVDParams): string {
  const from = p.device.selfReport.importedFrom;
  if (from === 'link' || from === 'legacy-link') return t('radar.panel.source.link');
  if (from === 'color-vision-params') return t('radar.panel.source.legacy');
  return t('radar.panel.source.test');
}

export function createParamsPanel(container: HTMLElement, opts: ParamsPanelOptions) {
  const overlay = document.createElement('div');
  overlay.className = 'radar-panel-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="radar-panel" role="dialog" aria-modal="true" aria-labelledby="radar-panel-title"></div>`;
  const panel = overlay.firstElementChild as HTMLElement;

  const style = document.createElement('style');
  style.textContent = `
    .radar-panel-overlay {
      position: absolute;
      inset: 0;
      z-index: 40;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgba(0,0,0,0.55);
    }
    .radar-panel-overlay[hidden] { display: none; }
    .radar-panel {
      width: 100%;
      max-width: 440px;
      max-height: 100%;
      overflow-y: auto;
      padding: 20px 20px max(env(safe-area-inset-bottom, 16px), 16px);
      border-radius: 16px 16px 0 0;
      background: var(--bg-card, #16213e);
      border: 1px solid var(--border, #2a2a4a);
      color: var(--text, #eaeaea);
      font-size: 14px;
      line-height: 1.5;
    }
    @media (min-width: 600px) {
      .radar-panel-overlay { align-items: center; padding: 16px; }
      .radar-panel { border-radius: 16px; }
    }
    .radar-panel h2 { font-size: 18px; margin-bottom: 12px; }
    .radar-panel h3 { font-size: 14px; margin: 16px 0 6px; color: var(--text-secondary, #a0a0b8); font-weight: 600; }
    .radar-panel .rp-result strong { display: block; font-size: 15px; }
    .radar-panel .rp-meta { color: var(--text-secondary, #a0a0b8); font-size: 13px; }
    .radar-panel .rp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .radar-panel .rp-actions a { flex: 1 1 auto; text-align: center; text-decoration: none; }
    .radar-panel .rp-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    .radar-panel .rp-row label { min-width: 72px; }
    .radar-panel select, .radar-panel input[type=range] { flex: 1; min-height: 40px; }
    .radar-panel select {
      background: var(--bg, #1a1a2e); color: inherit; border: 1px solid var(--border, #2a2a4a);
      border-radius: 8px; padding: 6px 8px; font: inherit;
    }
    .radar-panel fieldset { border: none; }
    .radar-panel fieldset[disabled] .rp-row { opacity: 0.5; }
    .radar-panel .rp-check { display: flex; align-items: center; gap: 8px; min-height: 40px; cursor: pointer; }
    .radar-panel .rp-check input { width: 20px; height: 20px; }
    .radar-panel .rp-disclaimer { margin-top: 14px; font-size: 12px; color: var(--text-secondary, #a0a0b8); }
    .radar-panel .rp-disclaimer a { color: var(--accent, #4c8dff); }
    .radar-panel .rp-done { width: 100%; margin-top: 16px; }
  `;
  overlay.appendChild(style);
  container.appendChild(overlay);

  function render(): void {
    const p = opts.getResult();
    const ov = opts.getOverride();
    const draft: RadarOverride = ov
      ?? (p && p.type !== 'normal' ? { type: p.type, severity: p.severity } : { ...RADAR_DEFAULT });
    const pct = (s: number) => Math.round(s * 100);

    const resultHtml = p
      ? `<div class="rp-result">
          <strong>${escapeHtml(t(`type.${p.type}`))}</strong>
          <span class="rp-meta">${escapeHtml([
            p.type === 'normal' ? null : t(`level.${p.level}`),
            p.type === 'normal' ? null : t('radar.panel.severity', { pct: pct(p.severity) }),
            `${t('radar.panel.confidence')}: ${t(`confidence.${p.confidence}`)}`,
          ].filter(Boolean).join(' · '))}</span><br/>
          <span class="rp-meta">${escapeHtml([
            resultSource(p),
            t('radar.panel.testedAt', { date: formatDate(p.testedAt) }),
            testedOnText(p),
          ].filter(Boolean).join(' · '))}</span>
        </div>
        <div class="rp-actions">
          <a class="btn-secondary" href="#/results">${t('nav.results')}</a>
          <a class="btn-secondary" href="#/test">${t('radar.panel.retakeTest')}</a>
          <a class="btn-secondary" href="#/import">${t('radar.panel.import')}</a>
        </div>`
      : `<p>${t('radar.panel.none')}</p>
        <p class="rp-meta">${t('radar.panel.usingDefault')}</p>
        <div class="rp-actions">
          <a class="btn-primary" href="#/test">${t('radar.panel.takeTest')}</a>
          <a class="btn-secondary" href="#/import">${t('radar.panel.import')}</a>
        </div>`;

    panel.innerHTML = `
      <h2 id="radar-panel-title">${t('radar.panel.title')}</h2>
      <h3>${t('radar.panel.resultTitle')}</h3>
      ${resultHtml}
      <h3>${t('radar.panel.overrideTitle')}</h3>
      <label class="rp-check"><input type="checkbox" id="rp-ov-on" ${ov ? 'checked' : ''}/> ${t('radar.panel.overrideToggle')}</label>
      <fieldset id="rp-ov-fields" ${ov ? '' : 'disabled'}>
        <div class="rp-row">
          <label for="rp-ov-type">${t('radar.panel.overrideType')}</label>
          <select id="rp-ov-type">
            ${RADAR_OVERRIDE_TYPES.map(ty => `<option value="${ty}" ${ty === draft.type ? 'selected' : ''}>${t(`typeShort.${ty}`)}</option>`).join('')}
          </select>
        </div>
        <div class="rp-row">
          <label for="rp-ov-sev">${t('radar.panel.overrideSeverity')}</label>
          <input type="range" id="rp-ov-sev" min="0" max="1" step="0.05" value="${draft.severity}"/>
          <output id="rp-ov-sev-out">${pct(draft.severity)}%</output>
        </div>
      </fieldset>
      <p class="rp-disclaimer">${t('radar.panel.disclaimer')} <a href="#/guide?s=radar">${t('radar.panel.guide')}</a></p>
      <button type="button" class="btn-primary rp-done" id="rp-done">${t('radar.panel.close')}</button>
    `;

    const on = panel.querySelector('#rp-ov-on') as HTMLInputElement;
    const fields = panel.querySelector('#rp-ov-fields') as HTMLFieldSetElement;
    const type = panel.querySelector('#rp-ov-type') as HTMLSelectElement;
    const sev = panel.querySelector('#rp-ov-sev') as HTMLInputElement;
    const sevOut = panel.querySelector('#rp-ov-sev-out') as HTMLOutputElement;
    const emit = () => {
      fields.disabled = !on.checked;
      sevOut.textContent = `${pct(parseFloat(sev.value))}%`;
      opts.onOverrideChange(on.checked ? { type: type.value as RadarOverrideType, severity: parseFloat(sev.value) } : null);
    };
    on.addEventListener('change', emit);
    type.addEventListener('change', emit);
    sev.addEventListener('input', emit);
    panel.querySelector('#rp-done')!.addEventListener('click', close);
    panel.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }

  function open(): void {
    render();
    overlay.hidden = false;
    (panel.querySelector('#rp-done') as HTMLButtonElement).focus();
  }

  function close(): void {
    overlay.hidden = true;
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  // Keep pointer/touch input inside the panel away from canvas gestures
  for (const ev of ['touchstart', 'touchmove', 'mousedown'] as const) {
    overlay.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  }

  return {
    open,
    close,
    /** Re-render in place (e.g. after a language switch) if currently open. */
    refresh(): void {
      if (!overlay.hidden) render();
    },
  };
}
