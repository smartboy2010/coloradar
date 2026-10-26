import { applyI18n } from '../i18nDom.js';

export interface SliderOptions {
  /** i18n key */
  labelKey: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(value: number): void;
}

export function createSlider(container: HTMLElement, options: SliderOptions): { el: HTMLElement; setValue(v: number): void; show(): void; hide(): void } {
  const el = document.createElement('div');
  el.className = 'slider-control';
  el.innerHTML = `
    <span class="slider-label" data-i18n="${options.labelKey}"></span>
    <input type="range" class="slider-input" data-i18n-aria="${options.labelKey}"
      min="${options.min}" max="${options.max}" step="${options.step}" value="${options.value}"/>
    <span class="slider-value">${options.value}</span>
  `;

  const style = document.createElement('style');
  if (!document.querySelector('#slider-styles')) {
    style.id = 'slider-styles';
    style.textContent = `
      .slider-control {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 16px;
        pointer-events: auto;
      }
      .slider-label {
        font-size: 13px;
        color: rgba(255,255,255,0.85);
        white-space: nowrap;
        min-width: 36px;
      }
      .slider-input {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.25);
        outline: none;
        min-height: 44px;
      }
      .slider-input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        border: 2px solid #fff;
      }
      .slider-input::-moz-range-thumb {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        border: 2px solid #fff;
      }
      .slider-value {
        font-size: 13px;
        color: rgba(255,255,255,0.7);
        min-width: 32px;
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  container.appendChild(el);
  applyI18n(el);

  const input = el.querySelector('.slider-input') as HTMLInputElement;
  const valueDisplay = el.querySelector('.slider-value') as HTMLSpanElement;

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueDisplay.textContent = v.toFixed(2);
    options.onChange(v);
  });

  // Prevent touch events from bubbling to canvas gestures
  el.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  el.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
  el.addEventListener('mousedown', e => e.stopPropagation());

  return {
    el,
    setValue(v: number) {
      input.value = String(v);
      valueDisplay.textContent = v.toFixed(2);
    },
    show() { el.style.display = 'flex'; },
    hide() { el.style.display = 'none'; },
  };
}
