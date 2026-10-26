/**
 * Parameter links: `#/import?d=<base64url(JSON)>`.
 * The payload stays in the URL fragment, which browsers never send to the server.
 * Also parses v0.1 links of the form `#cvd={"t":…,"l":…,"s":…,"c":…}`.
 */

import {
  validateParams,
  isDeviceClass,
  CVD_PARAMS_SCHEMA,
  type DeviceClass,
  type CVDParams,
} from '@cvd-tools/color-core';

export const SHARE_VERSION = 1;

interface SharePayload {
  v: number;
  t: CVDParams['type'];
  l: CVDParams['level'];
  s: number;
  c: CVDParams['confidence'];
  d?: string;
  /** Device class the test ran on (optional; older links omit it) */
  k?: DeviceClass;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareData(params: CVDParams): string {
  const payload: SharePayload = {
    v: SHARE_VERSION,
    t: params.type,
    l: params.level,
    s: Math.round(params.severity * 1000) / 1000,
    c: params.confidence,
    d: params.testedAt,
  };
  if (params.device.deviceClass) payload.k = params.device.deviceClass;
  return toBase64Url(JSON.stringify(payload));
}

/** Build the `#/import?d=…` fragment for a result. */
export function buildShareHash(params: CVDParams): string {
  return `#/import?d=${encodeShareData(params)}`;
}

/** Full shareable URL based on the current page location. */
export function buildShareUrl(params: CVDParams, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}${buildShareHash(params)}`;
}

/** Turn the compact link fields into a full CVDParams (detail fields unknown → zero). */
function compactToParams(o: Record<string, unknown>, source: 'link' | 'legacy-link'): CVDParams | null {
  const severity = typeof o.s === 'string' ? parseFloat(o.s) : o.s;
  return validateParams({
    schema: CVD_PARAMS_SCHEMA,
    type: o.t,
    level: o.l,
    severity,
    confidence: o.c,
    thresholds: { protan: 0, deutan: 0, tritan: 0 },
    maxOffsets: { protan: 0, deutan: 0, tritan: 0 },
    device: {
      userAgent: '',
      screen: '',
      selfReport: { importedFrom: source },
      ...(isDeviceClass(o.k) ? { deviceClass: o.k } : {}),
    },
    testedAt: typeof o.d === 'string' ? o.d : new Date().toISOString(),
  });
}

export function decodeShareData(d: string): CVDParams | null {
  try {
    const o = JSON.parse(fromBase64Url(d)) as Record<string, unknown>;
    if (typeof o.v !== 'number' || o.v > SHARE_VERSION) return null;
    return compactToParams(o, 'link');
  } catch {
    return null;
  }
}

/** Parse a v0.1 `#cvd=…` fragment (with or without the leading `#`). */
export function parseLegacyHash(hash: string): CVDParams | null {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith('cvd=')) return null;
  try {
    const o = JSON.parse(decodeURIComponent(h.slice(4))) as Record<string, unknown>;
    return compactToParams(o, 'legacy-link');
  } catch {
    return null;
  }
}
