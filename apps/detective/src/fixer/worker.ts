/// <reference lib="webworker" />
/**
 * Worker shell: message in, fixChart, message out. All logic lives in pure modules.
 */

import { fixChart } from './fixChart.js';
import type { FixRequest, FixResponse } from './protocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<FixRequest>) => {
  const { id, width, height, buffer, options } = e.data;
  try {
    const out = fixChart({ data: new Uint8ClampedArray(buffer), width, height }, options);
    const msg: FixResponse = {
      id,
      ok: true,
      report: out.report,
      fixed: out.fixed.buffer as ArrayBuffer,
      simBefore: out.simBefore?.buffer as ArrayBuffer | undefined,
      simAfter: out.simAfter?.buffer as ArrayBuffer | undefined,
    };
    const transfer = [msg.fixed, msg.simBefore, msg.simAfter].filter((b): b is ArrayBuffer => !!b);
    ctx.postMessage(msg, transfer);
  } catch (err) {
    const msg: FixResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(msg);
  }
};
