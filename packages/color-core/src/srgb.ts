/**
 * sRGB ↔ Linear RGB conversions.
 * All math operates in linear light; gamma encoding/decoding only at I/O boundaries.
 */

/** Single-channel sRGB → linear */
export function srgbToLinear(c: number): number {
  return c <= 0.04045
    ? c / 12.92
    : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Single-channel linear → sRGB */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308
    ? c * 12.92
    : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

export type RGB = [number, number, number];

/** sRGB [0,1] → linear RGB [0,1] */
export function srgbToLinearRGB(rgb: RGB): RGB {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** linear RGB [0,1] → sRGB [0,1] */
export function linearRGBToSrgb(rgb: RGB): RGB {
  return [linearToSrgb(rgb[0]), linearToSrgb(rgb[1]), linearToSrgb(rgb[2])];
}

/** Clamp a value to [0,1] */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp an RGB triple to [0,1] */
export function clampRGB(rgb: RGB): RGB {
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
}

/** Convert sRGB [0,1] to 8-bit [0,255] */
export function srgbTo8bit(rgb: RGB): [number, number, number] {
  return [
    Math.round(clamp01(rgb[0]) * 255),
    Math.round(clamp01(rgb[1]) * 255),
    Math.round(clamp01(rgb[2]) * 255),
  ];
}
