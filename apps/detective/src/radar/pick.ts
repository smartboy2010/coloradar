// Color picking: read 9×9 block from video source, average in linear RGB, convert to OKLab

// sRGB decode
function srgbDecode(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// OKLab M1 matrix (row-major)
const M1 = [
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
];

// OKLab M2 matrix (row-major)
const M2 = [
  0.2104542553, 0.7936177850, -0.0040720468,
  1.9779984951, -2.4285922050, 0.4505937099,
  0.0259040371, 0.7827717662, -0.8086757660,
];

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  let l = M1[0]*r + M1[1]*g + M1[2]*b;
  let m = M1[3]*r + M1[4]*g + M1[5]*b;
  let s = M1[6]*r + M1[7]*g + M1[8]*b;

  l = Math.cbrt(l);
  m = Math.cbrt(m);
  s = Math.cbrt(s);

  const L = M2[0]*l + M2[1]*m + M2[2]*s;
  const a = M2[3]*l + M2[4]*m + M2[5]*s;
  const bb = M2[6]*l + M2[7]*m + M2[8]*s;

  return [L, a, bb];
}

export interface PickResult {
  lab: [number, number, number];
  chroma: number;
  srgb: [number, number, number];
}

export function pickColorFromCanvas(
  gl: WebGLRenderingContext,
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number,
): PickResult {
  const size = 9;
  const half = Math.floor(size / 2);
  const x = Math.max(half, Math.min(canvasWidth - half - 1, Math.floor(canvasX)));
  const y = Math.max(half, Math.min(canvasHeight - half - 1, Math.floor(canvasY)));

  const pixels = new Uint8Array(size * size * 4);
  gl.readPixels(x - half, canvasHeight - y - half - 1, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  let rSum = 0, gSum = 0, bSum = 0;
  const count = size * size;

  for (let i = 0; i < count; i++) {
    const idx = i * 4;
    rSum += srgbDecode(pixels[idx] / 255);
    gSum += srgbDecode(pixels[idx + 1] / 255);
    bSum += srgbDecode(pixels[idx + 2] / 255);
  }

  const rAvg = rSum / count;
  const gAvg = gSum / count;
  const bAvg = bSum / count;

  const lab = linearRgbToOklab(rAvg, gAvg, bAvg);
  const chroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);

  // sRGB average for display
  let sR = 0, sG = 0, sB = 0;
  for (let i = 0; i < count; i++) {
    const idx = i * 4;
    sR += pixels[idx];
    sG += pixels[idx + 1];
    sB += pixels[idx + 2];
  }

  return {
    lab,
    chroma,
    srgb: [Math.round(sR / count), Math.round(sG / count), Math.round(sB / count)],
  };
}
