import { applyI18n } from '../i18nDom.js';

export type AppMode = 'highlight' | 'separate' | 'name';

export interface BottomBarCallbacks {
  onModeChange(mode: AppMode): void;
}

export function createBottomBar(container: HTMLElement, initialMode: AppMode, callbacks: BottomBarCallbacks) {
  const bar = document.createElement('div');
  bar.className = 'bottom-bar';
  bar.innerHTML = `
    <div class="bb-inner">
      <button type="button" class="bb-mode-btn" data-mode="highlight">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="4"/>
        </svg>
        <span data-i18n="radar.mode.highlight"></span>
      </button>
      <button type="button" class="bb-mode-btn" data-mode="separate">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M2 12h20"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span data-i18n="radar.mode.separate"></span>
      </button>
      <button type="button" class="bb-mode-btn" data-mode="name">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 7h16M4 12h16M4 17h10"/>
        </svg>
        <span data-i18n="radar.mode.name"></span>
      </button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .bottom-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      padding: 8px 12px max(env(safe-area-inset-bottom, 12px), 12px);
      background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 70%, transparent 100%);
      pointer-events: none;
    }
    .bb-inner {
      display: flex;
      justify-content: center;
      gap: 6px;
      pointer-events: auto;
    }
    .bb-mode-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 10px 20px;
      min-width: 72px;
      min-height: 56px;
      border: none;
      border-radius: 16px;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .bb-mode-btn:active { transform: scale(0.95); }
    .bb-mode-btn.active {
      background: rgba(59, 130, 246, 0.7);
      color: #fff;
    }
  `;

  container.appendChild(style);
  container.appendChild(bar);
  applyI18n(bar);

  const buttons = bar.querySelectorAll('.bb-mode-btn') as NodeListOf<HTMLButtonElement>;

  function setActive(mode: AppMode) {
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
  }

  setActive(initialMode);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as AppMode;
      setActive(mode);
      callbacks.onModeChange(mode);
    });
  });

  return { setActive };
}
