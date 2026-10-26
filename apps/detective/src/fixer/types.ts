import type { CVDType, OKLab } from '@cvd-tools/color-core';

/** Structural subset of ImageData so pure code and tests don't need the DOM. */
export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type RGB8 = [number, number, number];

export interface PaletteColor {
  id: number;
  lab: OKLab;
  rgb: RGB8;
  hex: string;
  /** Fraction of opaque sampled pixels that belong to this color's core */
  share: number;
  chroma: number;
  /** Low-chroma colors (background, grid, text): checked for confusion but never modified */
  neutral: boolean;
  /** Edge pixels / area — high for lines and scatter points */
  edgeRatio: number;
  thin: boolean;
}

export interface Palette {
  colors: PaletteColor[];
  /** Fraction of pixels explained by the palette (a color or a blend of two) */
  coverage: number;
  /** False for photos / gradients where palette recoloring is not appropriate */
  suitable: boolean;
}

export interface SimSpec {
  type: CVDType;
  severity: number;
}

export interface Confusion {
  a: number;
  b: number;
  /** OKLab ΔE for normal vision */
  original: number;
  /** Smallest simulated distance across the active simulations */
  simulated: number;
  /** Index into the sims array giving the worst case */
  sim: number;
}

export interface ColorChange {
  id: number;
  from: string;
  to: string;
  /** Lightness / chroma / hue deltas in OKLCh (hue in degrees) */
  dL: number;
  dC: number;
  dh: number;
  /** Palette ids this color was changed to be distinguishable from */
  distinguishFrom: number[];
}

export interface FixOptions {
  sims: SimSpec[];
  tau: number;
  /** Hex values of palette colors the user does not want changed */
  locked?: string[];
}

export interface FixReport {
  palette: Palette;
  newColors: string[];
  changes: ColorChange[];
  before: Confusion[];
  after: Confusion[];
  introduced: Confusion[];
  sims: SimSpec[];
  tau: number;
  /** Index of the simulation with the most confusions before fixing (for the "how I see it" view) */
  viewSim: number;
}
