/**
 * CVD parameters schema: type, defaults, and schema validation.
 * Pure functions only — persistence lives in the app layer (ProfileStore).
 */

export interface CVDParams {
  schema: 'cvd-params/0.1';
  type: 'protan' | 'deutan' | 'tritan' | 'rg_uncertain' | 'normal';
  level: 'none' | 'mild' | 'moderate' | 'severe';
  severity: number;
  thresholds: { protan: number; deutan: number; tritan: number };
  maxOffsets: { protan: number; deutan: number; tritan: number };
  confidence: 'low' | 'medium' | 'high';
  device: {
    userAgent: string;
    screen: string;
    selfReport: Record<string, unknown>;
    /** Auto-detected class of the device the test ran on; absent in older results */
    deviceClass?: DeviceClass;
  };
  testedAt: string;
  /** Response-time summary; absent in results from before hesitation weighting */
  hesitation?: CVDHesitation;
}

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

export interface CVDHesitation {
  /** Median RT (ms) of clearly-seen answers */
  baselineRtMs: number | null;
  /** Share (0–1) of red-green threshold-region correct answers that were hesitant */
  hesitantShare: number;
  /** A protan/deutan call was withheld because it rested on hesitant answers */
  downgraded: boolean;
}

export const CVD_PARAMS_SCHEMA = 'cvd-params/0.1';

export const CVD_RESULT_TYPES: readonly CVDParams['type'][] = [
  'protan', 'deutan', 'tritan', 'rg_uncertain', 'normal',
];
export const CVD_LEVELS: readonly CVDParams['level'][] = ['none', 'mild', 'moderate', 'severe'];
export const CVD_CONFIDENCES: readonly CVDParams['confidence'][] = ['low', 'medium', 'high'];
export const DEVICE_CLASSES: readonly DeviceClass[] = ['phone', 'tablet', 'desktop'];

export function isDeviceClass(v: unknown): v is DeviceClass {
  return DEVICE_CLASSES.includes(v as DeviceClass);
}

export function createDefaultParams(): CVDParams {
  return {
    schema: CVD_PARAMS_SCHEMA,
    type: 'normal',
    level: 'none',
    severity: 0,
    thresholds: { protan: 0, deutan: 0, tritan: 0 },
    maxOffsets: { protan: 0, deutan: 0, tritan: 0 },
    confidence: 'low',
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
      selfReport: {},
    },
    testedAt: new Date().toISOString(),
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readAxes(v: unknown): CVDParams['thresholds'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    protan: isFiniteNumber(o.protan) ? o.protan : 0,
    deutan: isFiniteNumber(o.deutan) ? o.deutan : 0,
    tritan: isFiniteNumber(o.tritan) ? o.tritan : 0,
  };
}

/** Optional field: a malformed value is dropped rather than rejecting the result. */
function readHesitation(v: unknown): CVDHesitation | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.hesitantShare) || o.hesitantShare < 0 || o.hesitantShare > 1) return null;
  return {
    baselineRtMs: isFiniteNumber(o.baselineRtMs) && o.baselineRtMs > 0 ? o.baselineRtMs : null,
    hesitantShare: o.hesitantShare,
    downgraded: o.downgraded === true,
  };
}

/**
 * Validate an unknown value against the cvd-params/0.1 schema.
 * Required fields must be valid; optional detail (thresholds, device) is
 * normalized so callers always get a complete object. Returns null if invalid.
 */
export function validateParams(value: unknown): CVDParams | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== CVD_PARAMS_SCHEMA) return null;
  if (!CVD_RESULT_TYPES.includes(v.type as CVDParams['type'])) return null;
  if (!CVD_LEVELS.includes(v.level as CVDParams['level'])) return null;
  if (!CVD_CONFIDENCES.includes(v.confidence as CVDParams['confidence'])) return null;
  if (!isFiniteNumber(v.severity) || v.severity < 0 || v.severity > 1) return null;

  const device = (v.device && typeof v.device === 'object' ? v.device : {}) as Record<string, unknown>;
  const params: CVDParams = {
    schema: CVD_PARAMS_SCHEMA,
    type: v.type as CVDParams['type'],
    level: v.level as CVDParams['level'],
    severity: v.severity,
    thresholds: readAxes(v.thresholds),
    maxOffsets: readAxes(v.maxOffsets),
    confidence: v.confidence as CVDParams['confidence'],
    device: {
      userAgent: typeof device.userAgent === 'string' ? device.userAgent : '',
      screen: typeof device.screen === 'string' ? device.screen : '',
      selfReport: (device.selfReport && typeof device.selfReport === 'object'
        ? device.selfReport : {}) as Record<string, unknown>,
    },
    testedAt: typeof v.testedAt === 'string' ? v.testedAt : new Date(0).toISOString(),
  };
  if (isDeviceClass(device.deviceClass)) params.device.deviceClass = device.deviceClass;
  const hesitation = readHesitation(v.hesitation);
  if (hesitation) params.hesitation = hesitation;
  return params;
}
