import { applyI18n } from '../i18nDom.js';
import { t } from '../../i18n/i18n.js';
import { gearIcon } from '../../components/icons.js';

export interface TopBarCallbacks {
  onFreeze(): void;
  onImageUpload(file: File): void;
  onOpenParams(): void;
}

export function createTopBar(container: HTMLElement, callbacks: TopBarCallbacks) {
  const bar = document.createElement('div');
  bar.className = 'top-bar';
  bar.innerHTML = `
    <div class="top-bar-inner">
      <button type="button" class="tb-btn" id="btn-freeze" data-i18n-aria="radar.tb.freezeAria">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
        <span data-i18n="radar.tb.freeze"></span>
      </button>
      <label class="tb-btn" id="btn-upload" data-i18n-aria="radar.tb.imageAria">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="m21 15-5-5L5 21"/>
        </svg>
        <span data-i18n="radar.tb.image"></span>
        <input type="file" accept="image/*" style="display:none" id="file-input"/>
      </label>
      <button type="button" class="tb-badge" id="params-badge">
        <span class="tb-badge-dot" aria-hidden="true"></span>
        <span class="tb-badge-text"></span>
        <span class="tb-badge-gear">${gearIcon(16)}</span>
      </button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .top-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      padding: 8px 12px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 70%, transparent 100%);
      pointer-events: none;
    }
    .top-bar-inner {
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }
    .tb-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      min-height: 44px;
      border: none;
      border-radius: 22px;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .tb-btn:active { background: rgba(255,255,255,0.3); }
    .tb-btn.active {
      background: rgba(59, 130, 246, 0.7);
    }
    .tb-badge {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      max-width: 60%;
      padding: 6px 12px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 22px;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font: inherit;
      font-size: 12px;
      color: rgba(255,255,255,0.9);
      cursor: pointer;
    }
    .tb-badge-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tb-badge-gear { display: inline-flex; flex-shrink: 0; opacity: 0.85; }
    .tb-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: #4c8dff; flex-shrink: 0; }
    .tb-badge.is-unset .tb-badge-dot { background: transparent; border: 2px solid #f2c14e; }
    label.tb-btn { display: inline-flex; }
    @media (max-width: 420px) {
      .tb-btn span { display: none; }
    }
  `;

  container.appendChild(style);
  container.appendChild(bar);
  applyI18n(bar);

  const freezeBtn = bar.querySelector('#btn-freeze') as HTMLButtonElement;
  const fileInput = bar.querySelector('#file-input') as HTMLInputElement;
  const badge = bar.querySelector('#params-badge') as HTMLButtonElement;
  const badgeText = badge.querySelector('.tb-badge-text') as HTMLSpanElement;

  freezeBtn.addEventListener('click', () => callbacks.onFreeze());
  badge.addEventListener('click', () => callbacks.onOpenParams());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) callbacks.onImageUpload(file);
    fileInput.value = '';
  });

  return {
    setFrozen(frozen: boolean) {
      freezeBtn.classList.toggle('active', frozen);
      freezeBtn.setAttribute('aria-pressed', String(frozen));
      const label = freezeBtn.querySelector('span')!;
      label.dataset.i18n = frozen ? 'radar.tb.resume' : 'radar.tb.freeze';
      label.textContent = t(label.dataset.i18n);
    },
    setStatus(text: string, unset: boolean) {
      badgeText.textContent = text;
      badge.classList.toggle('is-unset', unset);
      badge.setAttribute('aria-label', t('radar.status.aria', { text }));
    },
  };
}
