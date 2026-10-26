import { applyI18n } from '../i18nDom.js';

/** Returns a cancel function that removes the overlay without calling `onComplete`. */
export function showOnboarding(container: HTMLElement, onComplete: () => void): () => void {
  const LS_KEY = 'color-radar-onboarded';
  let seen = false;
  try {
    seen = !!localStorage.getItem(LS_KEY);
  } catch {
    // Storage unavailable: show onboarding every time
  }
  if (seen) {
    onComplete();
    return () => {};
  }

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onb-card">
      <div class="onb-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2" fill="#3b82f6"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
        </svg>
      </div>
      <h1 class="onb-title" data-i18n="radar.name"></h1>
      <p class="onb-desc" data-i18n="radar.tagline"></p>

      <div class="onb-section">
        <div class="onb-feature">
          <span class="onb-feature-icon">🎯</span>
          <div>
            <strong data-i18n="radar.onb.highlight.title"></strong>
            <p data-i18n="radar.onb.highlight.desc"></p>
          </div>
        </div>
        <div class="onb-feature">
          <span class="onb-feature-icon">🔀</span>
          <div>
            <strong data-i18n="radar.onb.separate.title"></strong>
            <p data-i18n="radar.onb.separate.desc"></p>
          </div>
        </div>
        <div class="onb-feature">
          <span class="onb-feature-icon">🏷️</span>
          <div>
            <strong data-i18n="radar.onb.name.title"></strong>
            <p data-i18n="radar.onb.name.desc"></p>
          </div>
        </div>
      </div>

      <div class="onb-privacy">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span data-i18n="radar.onb.privacy"></span>
      </div>

      <button type="button" class="onb-btn" id="onb-start" data-i18n="radar.onb.start"></button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .onboarding-overlay {
      position: absolute;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 20px;
      overflow-y: auto;
    }
    .onb-card {
      max-width: 380px;
      width: 100%;
      text-align: center;
      margin: auto;
      animation: onb-fade-in 0.4s ease-out;
    }
    @keyframes onb-fade-in {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .onb-icon { margin-bottom: 16px; }
    .onb-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .onb-desc {
      font-size: 15px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 28px;
      line-height: 1.5;
    }
    .onb-section { text-align: left; margin-bottom: 24px; }
    .onb-feature {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      align-items: flex-start;
    }
    .onb-feature-icon {
      font-size: 24px;
      flex-shrink: 0;
      width: 32px;
      text-align: center;
    }
    .onb-feature strong {
      display: block;
      font-size: 14px;
      margin-bottom: 2px;
    }
    .onb-feature p {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      line-height: 1.4;
      margin: 0;
    }
    .onb-privacy {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255,255,255,0.08);
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 24px;
      text-align: left;
    }
    .onb-privacy svg { flex-shrink: 0; }
    .onb-btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 14px;
      background: #3b82f6;
      color: #fff;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
      min-height: 52px;
      transition: background 0.2s;
    }
    .onb-btn:active { background: #2563eb; }
  `;

  overlay.appendChild(style);
  container.appendChild(overlay);
  applyI18n(overlay);
  let done = false;

  overlay.querySelector('#onb-start')!.addEventListener('click', () => {
    try {
      localStorage.setItem(LS_KEY, '1');
    } catch {
      // Best effort only
    }
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      overlay.remove();
      if (!done) {
        done = true;
        onComplete();
      }
    }, 300);
  });

  return () => {
    done = true;
    overlay.remove();
  };
}
