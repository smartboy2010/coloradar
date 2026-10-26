// Color naming from OKLCh values

/** `name` and `warning` are i18n keys (`radar.color.*`, `radar.naming.*`). */
export interface ColorName {
  name: string;
  confidence: 'high' | 'low';
  warning?: string;
}

function srgbDecode(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const M1 = [
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
];

const M2 = [
  0.2104542553, 0.7936177850, -0.0040720468,
  1.9779984951, -2.4285922050, 0.4505937099,
  0.0259040371, 0.7827717662, -0.8086757660,
];

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  let l = M1[0]*r + M1[1]*g + M1[2]*b;
  let m = M1[3]*r + M1[4]*g + M1[5]*b;
  let s = M1[6]*r + M1[7]*g + M1[8]*b;
  l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
  return [M2[0]*l + M2[1]*m + M2[2]*s, M2[3]*l + M2[4]*m + M2[5]*s, M2[6]*l + M2[7]*m + M2[8]*s];
}

export function nameFromPixels(pixels: Uint8Array, size: number): ColorName {
  const count = size * size;
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < count; i++) {
    const idx = i * 4;
    rSum += srgbDecode(pixels[idx] / 255);
    gSum += srgbDecode(pixels[idx + 1] / 255);
    bSum += srgbDecode(pixels[idx + 2] / 255);
  }
  const lab = linearRgbToOklab(rSum / count, gSum / count, bSum / count);
  return nameFromOklab(lab[0], lab[1], lab[2]);
}

export function nameFromOklab(L: number, a: number, b: number): ColorName {
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  let confidence: 'high' | 'low' = 'high';
  let warning: string | undefined;

  if (L < 0.05) {
    warning = 'radar.naming.lightWarning';
    confidence = 'low';
  } else if (L > 0.95) {
    warning = 'radar.naming.lightWarning';
    confidence = 'low';
  }

  // Achromatic
  if (C < 0.03) {
    if (L < 0.15) return { name: 'radar.color.black', confidence, warning };
    if (L < 0.35) return { name: 'radar.color.darkGray', confidence, warning };
    if (L < 0.60) return { name: 'radar.color.gray', confidence, warning };
    if (L < 0.80) return { name: 'radar.color.lightGray', confidence, warning };
    return { name: 'radar.color.white', confidence, warning };
  }

  // Chromatic — classify by hue angle
  let baseName: string;

  if (h < 25) baseName = 'radar.color.red';
  else if (h < 50) {
    // Orange vs brown
    if (L < 0.45) baseName = 'radar.color.brown';
    else baseName = 'radar.color.orange';
  }
  else if (h < 85) baseName = 'radar.color.yellow';
  else if (h < 160) baseName = 'radar.color.green';
  else if (h < 200) baseName = 'radar.color.cyan';
  else if (h < 265) baseName = 'radar.color.blue';
  else if (h < 310) baseName = 'radar.color.purple';
  else if (h < 345) {
    // Pink vs magenta
    if (L > 0.65 && C < 0.15) baseName = 'radar.color.pink';
    else baseName = 'radar.color.pink';
  }
  else {
    // Red again (wraps around)
    if (L > 0.65 && C < 0.12) baseName = 'radar.color.pink';
    else baseName = 'radar.color.red';
  }

  return { name: baseName, confidence, warning };
}
