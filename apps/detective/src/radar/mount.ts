/**
 * Color Radar: live camera view with tap-to-highlight, confusion-color
 * separation (personalized daltonization) and color naming.
 *
 * Loaded lazily from the `#/radar` route so the test pages never pull in the
 * WebGL pipeline. `mountRadar` returns a handle whose `destroy()` releases the
 * camera, the render loop and the GL context when the route changes.
 */

import type { CVDParams } from '@cvd-tools/color-core';
import { createCamera } from './camera.js';
import { createPipeline, type GLPipeline, type RenderMode, type PipelineUniforms } from './gl/pipeline.js';
import { pickColorFromCanvas } from './pick.js';
import { nameFromPixels, type ColorName } from './naming.js';
import { setupGestures } from './gestures.js';
import { effectiveRadar, getRadarOverride, setRadarOverride, simUniforms, type SimUniforms } from './params.js';
import { createTopBar } from './ui/TopBar.js';
import { createBottomBar, type AppMode } from './ui/BottomBar.js';
import { createSlider } from './ui/Slider.js';
import { showOnboarding } from './ui/Onboarding.js';
import { createParamsPanel } from './ui/ParamsPanel.js';
import { applyI18n } from './i18nDom.js';
import { t, onLangChange, escapeHtml } from '../i18n/i18n.js';

export interface RadarContext {
  /** Active profile's latest result (cvd-app/v1), or null if the user hasn't tested yet */
  params: CVDParams | null;
}

export interface RadarHandle {
  destroy(): void;
}

// Survives route changes within a session
let ctaDismissed = false;

const RADAR_CSS = `
  .radar-root { position: absolute; inset: 0; overflow: hidden; background: #000; color: #fff;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; line-height: 1.4; }
  .radar-root canvas { touch-action: none; }
  .radar-stack { position: absolute; top: 60px; left: 12px; right: 12px; z-index: 11; display: flex; flex-direction: column;
    align-items: center; gap: 8px; pointer-events: none; }
  .radar-cta { pointer-events: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 520px;
    padding: 10px 12px; border-radius: 14px; background: rgba(15, 52, 96, 0.92); border: 1px solid rgba(255,255,255,0.15);
    font-size: 13px; }
  .radar-cta p { flex: 1 1 200px; margin: 0; }
  .radar-cta a { color: #fff; background: #4c8dff; padding: 8px 12px; border-radius: 10px; text-decoration: none;
    font-weight: 600; min-height: 36px; display: inline-flex; align-items: center; }
  .radar-cta a.secondary { background: rgba(255,255,255,0.15); }
  .radar-cta button { background: none; border: none; color: rgba(255,255,255,0.7); font-size: 20px; line-height: 1;
    width: 36px; height: 36px; cursor: pointer; }
  .radar-swatch { display: none; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 20px;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  .radar-swatch i { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; }
  .radar-swatch span { font-size: 12px; color: rgba(255,255,255,0.8); }
  .radar-note { margin: 0 auto 4px; max-width: 520px; padding: 8px 12px; border-radius: 12px; background: rgba(0,0,0,0.6);
    font-size: 12px; color: rgba(255,255,255,0.9); text-align: center; pointer-events: auto; }
  .radar-clear { display: none; margin: 4px auto; padding: 8px 20px; min-height: 44px; border: none; border-radius: 22px;
    background: rgba(255, 154, 60, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #111;
    font-size: 13px; font-weight: 600; cursor: pointer; pointer-events: auto; }
  .crosshair-ring { position: absolute; width: 60px; height: 60px; border: 3px solid #fff; border-radius: 50%;
    transform: translate(-50%, -50%); box-shadow: 0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.3); }
  .crosshair-ring::before, .crosshair-ring::after { content: ''; position: absolute; background: #fff; }
  .crosshair-ring::before { width: 1px; height: 20px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .crosshair-ring::after { width: 20px; height: 1px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .crosshair-label { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); padding: 6px 16px;
    border-radius: 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    font-size: 16px; font-weight: 600; color: #fff; white-space: nowrap; }
  .crosshair-label .warning { display: block; font-size: 11px; font-weight: 400; color: rgba(255,200,50,0.9); margin-top: 2px; }
  .radar-message { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
    padding: 24px; text-align: center; }
  .radar-message > div { max-width: 360px; }
  .radar-message h2 { font-size: 18px; margin-bottom: 8px; }
  .radar-message p { font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.5; margin-bottom: 20px; }
  .radar-message .detail { font-size: 12px; color: #ff9a3c; word-break: break-word; }
  .radar-upload { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 14px;
    background: #4c8dff; color: #fff; font-size: 15px; cursor: pointer; min-height: 48px; }
`;

export function mountRadar(container: HTMLElement, ctx: RadarContext): RadarHandle {
  const root = document.createElement('div');
  root.className = 'radar-root';
  const css = document.createElement('style');
  css.textContent = RADAR_CSS;
  root.appendChild(css);
  container.appendChild(root);

  let pipeline: GLPipeline;
  try {
    pipeline = createPipeline();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const msg = document.createElement('div');
    msg.className = 'radar-message init-error';
    msg.innerHTML = `
      <div>
        <h2 data-i18n="radar.init.webglTitle"></h2>
        <p data-i18n="radar.init.webglBody"></p>
        <p class="detail">${escapeHtml(detail)}</p>
      </div>`;
    root.appendChild(msg);
    applyI18n(msg);
    const off = onLangChange(() => applyI18n(msg));
    return { destroy() { off(); root.remove(); } };
  }
  return bootstrap(root, pipeline, ctx);
}

function bootstrap(root: HTMLElement, pipeline: GLPipeline, ctx: RadarContext): RadarHandle {
  let alive = true;
  let rafId = 0;

  let appMode: AppMode = 'highlight';
  let frozen = false;
  let showOriginal = false;
  let tolerance = 0.12;
  let daltonStrength = 0.80;
  let targetLab: [number, number, number] = [0, 0, 0];
  let targetChroma = 0;
  let hasTarget = false;
  let crosshairX = 0.5;
  let crosshairY = 0.5;
  let imageSource: HTMLImageElement | null = null;
  // A new still image must reach the GPU once even though it starts frozen
  let pendingUpload = false;
  let lastName: ColorName | null = null;

  let eff = effectiveRadar(ctx.params);
  let sims: SimUniforms = simUniforms(eff.sims);

  const camera = createCamera();
  root.appendChild(pipeline.canvas);

  // Status chip under the top bar: CTA when untested, picked target swatch
  const stack = document.createElement('div');
  stack.className = 'radar-stack';
  root.appendChild(stack);

  const cta = document.createElement('div');
  cta.className = 'radar-cta';
  cta.setAttribute('role', 'status');
  cta.innerHTML = `
    <p data-i18n="radar.cta.text"></p>
    <a href="#/test" data-i18n="radar.cta.test"></a>
    <a href="#/import" class="secondary" data-i18n="radar.cta.import"></a>
    <button type="button" data-i18n-aria="radar.cta.dismiss">×</button>`;
  cta.querySelector('button')!.addEventListener('click', () => {
    ctaDismissed = true;
    updateCta();
  });
  stack.appendChild(cta);

  const swatch = document.createElement('div');
  swatch.className = 'radar-swatch';
  swatch.innerHTML = `<i></i><span data-i18n="radar.highlight.target"></span>`;
  stack.appendChild(swatch);

  function updateCta() {
    cta.style.display = !ctx.params && !getRadarOverride() && !ctaDismissed ? 'flex' : 'none';
  }

  function showTargetSwatch(srgb: [number, number, number]) {
    (swatch.firstElementChild as HTMLElement).style.background = `rgb(${srgb[0]},${srgb[1]},${srgb[2]})`;
    swatch.style.display = 'flex';
  }
  function removeTargetSwatch() {
    swatch.style.display = 'none';
  }

  // Mode controls
  const modeControlsEl = document.createElement('div');
  modeControlsEl.className = 'mode-controls';
  modeControlsEl.style.cssText = 'position:absolute;bottom:80px;left:0;right:0;z-index:10;pointer-events:none;padding:0 12px;';
  root.appendChild(modeControlsEl);

  const noteEl = document.createElement('p');
  noteEl.className = 'radar-note';
  noteEl.setAttribute('role', 'status');
  modeControlsEl.appendChild(noteEl);

  const toleranceSlider = createSlider(modeControlsEl, {
    labelKey: 'radar.slider.tolerance',
    min: 0.02, max: 0.35, step: 0.01, value: tolerance,
    onChange: v => { tolerance = v; },
  });

  const strengthSlider = createSlider(modeControlsEl, {
    labelKey: 'radar.slider.strength',
    min: 0, max: 1.5, step: 0.05, value: daltonStrength,
    onChange: v => { daltonStrength = v; },
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'radar-clear';
  clearBtn.dataset.i18n = 'radar.highlight.clear';
  clearBtn.addEventListener('click', () => {
    hasTarget = false;
    clearBtn.style.display = 'none';
    removeTargetSwatch();
  });
  clearBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  clearBtn.addEventListener('mousedown', e => e.stopPropagation());
  modeControlsEl.appendChild(clearBtn);

  // Crosshair for naming mode
  const crosshairEl = document.createElement('div');
  crosshairEl.className = 'crosshair-overlay';
  crosshairEl.innerHTML = `
    <div class="crosshair-ring"></div>
    <div class="crosshair-label" aria-live="polite"></div>
  `;
  crosshairEl.style.cssText = 'position:absolute;z-index:9;pointer-events:none;display:none;';
  root.appendChild(crosshairEl);
  const nameLabel = crosshairEl.querySelector('.crosshair-label') as HTMLElement;

  function renderName() {
    if (!lastName) {
      nameLabel.textContent = t('radar.naming.reading');
      return;
    }
    nameLabel.innerHTML = escapeHtml(t(lastName.name))
      + (lastName.warning ? `<span class="warning">${escapeHtml(t(lastName.warning))}</span>` : '');
  }

  function updateCrosshair() {
    const rect = pipeline.canvas.getBoundingClientRect();
    crosshairEl.style.left = `${crosshairX * rect.width}px`;
    crosshairEl.style.top = `${crosshairY * rect.height}px`;
  }

  // Bars and settings panel
  const topBar = createTopBar(root, {
    onFreeze() {
      frozen = !frozen;
      topBar.setFrozen(frozen);
    },
    onImageUpload(file) {
      camera.loadImage(file).then(img => {
        if (!alive) return;
        imageSource = img;
        pendingUpload = true;
        camera.stop();
        frozen = true;
        topBar.setFrozen(true);
        root.querySelector('.radar-message')?.remove();
        startLoop();
      }).catch(() => {});
    },
    onOpenParams() {
      panel.open();
    },
  });

  createBottomBar(root, appMode, {
    onModeChange(mode) {
      appMode = mode;
      updateModeUI();
    },
  });

  const panel = createParamsPanel(root, {
    getResult: () => ctx.params,
    getOverride: getRadarOverride,
    onOverrideChange(o) {
      setRadarOverride(o);
      applyParams();
    },
  });

  function statusText(): { text: string; unset: boolean } {
    const ov = getRadarOverride();
    if (ov) return { text: t('radar.status.manual', { type: t(`typeShort.${ov.type}`), pct: Math.round(ov.severity * 100) }), unset: false };
    const p = ctx.params;
    if (!p) return { text: t('radar.status.unset'), unset: true };
    const confidence = t('radar.status.confidence', { level: t(`confidence.${p.confidence}`) });
    if (p.type === 'normal') return { text: t('radar.status.normal', { type: t('typeShort.normal'), confidence }), unset: false };
    return { text: t('radar.status.result', { type: t(`typeShort.${p.type}`), level: t(`level.${p.level}`), confidence }), unset: false };
  }

  function updateNote() {
    let key = '';
    if (appMode === 'separate') {
      if (eff.normal) key = 'radar.separate.normalNote';
      else if (eff.type === 'rg_uncertain') key = 'radar.separate.rgNote';
    }
    noteEl.style.display = key ? 'block' : 'none';
    if (key) noteEl.textContent = t(key);
  }

  function applyParams() {
    eff = effectiveRadar(ctx.params);
    sims = simUniforms(eff.sims);
    const s = statusText();
    topBar.setStatus(s.text, s.unset);
    updateCta();
    updateNote();
  }

  function updateModeUI() {
    toleranceSlider.el.style.display = appMode === 'highlight' ? 'flex' : 'none';
    clearBtn.style.display = (appMode === 'highlight' && hasTarget) ? 'block' : 'none';
    strengthSlider.el.style.display = appMode === 'separate' && !eff.normal ? 'flex' : 'none';
    crosshairEl.style.display = appMode === 'name' ? 'block' : 'none';
    if (appMode !== 'highlight') removeTargetSwatch();
    else if (hasTarget) swatch.style.display = 'flex';
    if (appMode === 'name') updateCrosshair();
    updateNote();
  }

  const offLang = onLangChange(() => {
    applyI18n(root);
    applyParams();
    renderName();
    panel.refresh();
  });

  setupGestures(pipeline.canvas, {
    onTap(clientX, clientY) {
      const rect = pipeline.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (clientX - rect.left) * dpr;
      const y = (clientY - rect.top) * dpr;

      if (appMode === 'highlight') {
        // Render passthrough first to read original pixels
        renderFrame(true);
        const result = pickColorFromCanvas(pipeline.gl, x, y, pipeline.canvas.width, pipeline.canvas.height);
        targetLab = result.lab;
        targetChroma = result.chroma;
        hasTarget = true;
        clearBtn.style.display = 'block';
        showTargetSwatch(result.srgb);
      } else if (appMode === 'name') {
        crosshairX = (clientX - rect.left) / rect.width;
        crosshairY = (clientY - rect.top) / rect.height;
        updateCrosshair();
      }
    },
    onDoubleTap() {
      frozen = !frozen;
      topBar.setFrozen(frozen);
    },
    onHoldStart() {
      showOriginal = true;
    },
    onHoldEnd() {
      showOriginal = false;
    },
  });

  let lastNamingRead = 0;
  function updateNaming(now: number) {
    if (appMode !== 'name') return;
    if (now - lastNamingRead < 200) return;
    lastNamingRead = now;

    const cx = Math.floor(crosshairX * pipeline.canvas.width);
    const cy = Math.floor(crosshairY * pipeline.canvas.height);
    const size = 9;
    const half = Math.floor(size / 2);
    const sx = Math.max(0, cx - half);
    const sy = Math.max(0, pipeline.canvas.height - cy - half - 1);

    const pixels = new Uint8Array(size * size * 4);
    pipeline.gl.readPixels(sx, sy, size, size, pipeline.gl.RGBA, pipeline.gl.UNSIGNED_BYTE, pixels);
    lastName = nameFromPixels(pixels, size);
    renderName();
  }

  function getRenderMode(): RenderMode {
    if (showOriginal) return 0;
    switch (appMode) {
      case 'highlight': return hasTarget ? 1 : 0;
      case 'separate': return 2;
      case 'name': return 3;
    }
  }

  function getUniforms(): PipelineUniforms {
    return {
      mode: getRenderMode(),
      targetLab,
      targetChroma,
      tolerance,
      hasTarget,
      showOriginal,
      simCount: sims.count,
      sim0: sims.sim0,
      sim1: sims.sim1,
      daltonStrength,
      videoWidth: imageSource ? imageSource.naturalWidth : camera.width,
      videoHeight: imageSource ? imageSource.naturalHeight : camera.height,
    };
  }

  function renderFrame(forcePassthrough = false) {
    pipeline.resize();

    const source = imageSource || camera.video;
    const cameraReady = camera.state === 'active' || camera.state === 'image';
    if (!imageSource && !cameraReady) return;

    if (!frozen || forcePassthrough || pendingUpload) {
      pipeline.uploadVideoFrame(source);
      pendingUpload = false;
    }

    const uniforms = getUniforms();
    if (forcePassthrough) {
      uniforms.mode = 0;
      uniforms.hasTarget = false;
      uniforms.showOriginal = false;
    }
    pipeline.render(uniforms);
  }

  function tick(now: number) {
    renderFrame();
    updateNaming(now);
    if (appMode === 'name') updateCrosshair();
  }

  let looping = false;
  function startLoop() {
    if (looping || !alive) return;
    looping = true;
    // requestAnimationFrame always; it also covers frozen frames and still images
    const frame = (now: number) => {
      if (!alive) return;
      tick(now);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function showCameraError() {
    const isDenied = camera.state === 'denied';
    const msg = document.createElement('div');
    msg.className = 'radar-message';
    msg.innerHTML = `
      <div>
        <div style="font-size:48px;margin-bottom:16px" aria-hidden="true">${isDenied ? '🚫' : '📷'}</div>
        <h2 data-i18n="${isDenied ? 'radar.camera.deniedTitle' : 'radar.camera.unavailableTitle'}"></h2>
        <p data-i18n="${isDenied ? 'radar.camera.deniedBody' : 'radar.camera.unavailableBody'}"></p>
        <label class="radar-upload">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="m21 15-5-5L5 21"/>
          </svg>
          <span data-i18n="radar.camera.upload"></span>
          <input type="file" accept="image/*" style="display:none"/>
        </label>
      </div>`;
    root.appendChild(msg);
    applyI18n(msg);

    const fileInput = msg.querySelector('input') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      camera.loadImage(file).then(img => {
        if (!alive) return;
        imageSource = img;
        pendingUpload = true;
        frozen = true;
        topBar.setFrozen(true);
        msg.remove();
        startLoop();
      }).catch(() => {});
    });
  }

  applyI18n(root);
  applyParams();
  updateModeUI();
  renderName();

  const cancelOnboarding = showOnboarding(root, () => {
    if (!alive) return;
    camera.start().then(() => {
      if (!alive) {
        camera.stop();
        return;
      }
      if (camera.state === 'active') startLoop();
      else if (camera.state === 'denied' || camera.state === 'unavailable') showCameraError();
    });
  });

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(rafId);
      cancelOnboarding();
      offLang();
      camera.dispose();
      pipeline.destroy();
      pipeline.gl.getExtension('WEBGL_lose_context')?.loseContext();
      root.remove();
    },
  };
}
