/**
 * Image input helpers: decode a file to ImageData (long side ≤ 4096),
 * make display-size canvases, and export PNG.
 */

export const MAX_SIDE = 4096;
export const PREVIEW_SIDE = 1600;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to <img> decoding (older Safari)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToImageData(file: Blob): Promise<ImageData> {
  const src = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  if ('close' in src && typeof src.close === 'function') src.close();
  return ctx.getImageData(0, 0, w, h);
}

export function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Downscaled copy for on-screen display */
export function previewCanvas(img: ImageData): HTMLCanvasElement {
  const full = imageDataToCanvas(img);
  const scale = Math.min(1, PREVIEW_SIDE / Math.max(img.width, img.height));
  if (scale === 1) return full;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  return c;
}

export function downloadPng(img: ImageData, filename: string): void {
  imageDataToCanvas(img).toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
