/**
 * Before/after comparison slider: two stacked canvases, the "after" one
 * revealed with clip-path as the (invisible) range input moves.
 */

export interface CompareSliderOptions {
  before: HTMLCanvasElement;
  after: HTMLCanvasElement;
  beforeLabel: string;
  afterLabel: string;
  ariaLabel: string;
  /** Max display width in CSS px; the slider keeps the image aspect ratio */
  maxWidth?: number;
  initial?: number;
}

export interface CompareSlider {
  element: HTMLElement;
  setCanvases(before: HTMLCanvasElement, after: HTMLCanvasElement): void;
}

export function createCompareSlider(opts: CompareSliderOptions): CompareSlider {
  const root = document.createElement('div');
  root.className = 'comparison-container';
  root.innerHTML = `
    <div class="comparison-slider-wrap">
      <div class="comparison-divider" aria-hidden="true"></div>
      <input type="range" min="0" max="100" value="${opts.initial ?? 50}" class="comparison-slider" />
    </div>
    <div class="comparison-labels">
      <span></span>
      <span></span>
    </div>
  `;
  const wrap = root.querySelector('.comparison-slider-wrap') as HTMLElement;
  const divider = root.querySelector('.comparison-divider') as HTMLElement;
  const slider = root.querySelector('.comparison-slider') as HTMLInputElement;
  const [beforeLabel, afterLabel] = Array.from(root.querySelectorAll('.comparison-labels span')) as HTMLElement[];
  beforeLabel.textContent = opts.beforeLabel;
  afterLabel.textContent = opts.afterLabel;
  slider.setAttribute('aria-label', opts.ariaLabel);
  if (opts.maxWidth) wrap.style.maxWidth = `${opts.maxWidth}px`;

  let beforeCanvas: HTMLCanvasElement | null = null;
  let afterCanvas: HTMLCanvasElement | null = null;

  function update(): void {
    const val = parseInt(slider.value, 10);
    if (afterCanvas) afterCanvas.style.clipPath = `inset(0 0 0 ${val}%)`;
    divider.style.left = `${val}%`;
    slider.setAttribute('aria-valuetext', `${val}%`);
  }

  function setCanvases(before: HTMLCanvasElement, after: HTMLCanvasElement): void {
    beforeCanvas?.remove();
    afterCanvas?.remove();
    beforeCanvas = before;
    afterCanvas = after;
    before.className = 'comparison-canvas comparison-before';
    after.className = 'comparison-canvas comparison-after';
    before.setAttribute('aria-hidden', 'true');
    after.setAttribute('aria-hidden', 'true');
    wrap.style.aspectRatio = `${before.width} / ${before.height}`;
    wrap.prepend(before, after);
    update();
  }

  slider.addEventListener('input', update);
  setCanvases(opts.before, opts.after);
  return { element: root, setCanvases };
}
