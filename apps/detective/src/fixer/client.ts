/**
 * Main-thread client for the fixer Worker. The caller keeps its ImageData;
 * a copy of the pixels is transferred to the Worker. Falls back to running
 * inline if Workers are unavailable.
 */

import type { FixOptions, FixReport } from './types.js';
import type { FixRequest, FixResponse } from './protocol.js';

export interface FixResult {
  report: FixReport;
  fixed: ImageData;
  simBefore?: ImageData;
  simAfter?: ImageData;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: FixResponse) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<FixResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
    worker.onerror = e => {
      workerFailed = true;
      worker = null;
      const err = new Error(e.message || 'Worker error');
      pending.forEach(p => p.reject(err));
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function toImageData(buf: ArrayBuffer | undefined, w: number, h: number): ImageData | undefined {
  return buf ? new ImageData(new Uint8ClampedArray(buf), w, h) : undefined;
}

async function runInline(img: ImageData, options: FixOptions): Promise<FixResponse> {
  const { fixChart } = await import('./fixChart.js');
  const out = fixChart({ data: img.data, width: img.width, height: img.height }, options);
  return {
    id: 0,
    ok: true,
    report: out.report,
    fixed: out.fixed.buffer as ArrayBuffer,
    simBefore: out.simBefore?.buffer as ArrayBuffer | undefined,
    simAfter: out.simAfter?.buffer as ArrayBuffer | undefined,
  };
}

export async function runFix(img: ImageData, options: FixOptions): Promise<FixResult> {
  const w = getWorker();
  let res: FixResponse;
  if (w) {
    const copy = new Uint8ClampedArray(img.data);
    const id = nextId++;
    const req: FixRequest = { id, width: img.width, height: img.height, buffer: copy.buffer, options };
    try {
      res = await new Promise<FixResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage(req, [copy.buffer]);
      });
    } catch {
      res = await runInline(img, options);
    }
  } else {
    res = await runInline(img, options);
  }
  if (!res.ok) throw new Error(res.error);
  return {
    report: res.report,
    fixed: toImageData(res.fixed, img.width, img.height)!,
    simBefore: toImageData(res.simBefore, img.width, img.height),
    simAfter: toImageData(res.simAfter, img.width, img.height),
  };
}
