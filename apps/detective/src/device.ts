/**
 * Device class (phone / tablet / desktop), detected automatically. Results are
 * measured on an uncalibrated screen, so the class is stored with each result
 * and used to warn when results from different kinds of screens are compared.
 */

import type { CVDParams, DeviceClass } from '@cvd-tools/color-core';
import { t } from './i18n/i18n.js';

export interface DeviceEnv {
  userAgent: string;
  /** navigator.maxTouchPoints */
  maxTouchPoints: number;
  /** screen.width / screen.height in CSS px */
  screenWidth: number;
  screenHeight: number;
  /** Primary input is coarse (touch) and no fine pointer (mouse/trackpad) is available */
  touchOnly: boolean;
}

/** Shorter screen side (CSS px) from which a touch-only device counts as a tablet. */
export const TABLET_MIN_SHORT_SIDE = 600;

export function detectDeviceClass(env: DeviceEnv): DeviceClass {
  const ua = env.userAgent;
  const shortSide = Math.min(env.screenWidth, env.screenHeight) || 0;

  if (/iPad/.test(ua)) return 'tablet';
  // iPadOS 13+ Safari reports a Mac user agent; Macs have no touch points
  if (/Macintosh/.test(ua) && env.maxTouchPoints > 1) return 'tablet';
  if (/iPhone|iPod|Windows Phone|IEMobile/.test(ua)) return 'phone';
  // Android phones send "Mobile"; Android tablets usually don't
  if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) return shortSide >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone';
    return shortSide > 0 && shortSide < TABLET_MIN_SHORT_SIDE ? 'phone' : 'tablet';
  }
  if (/Tablet|Silk|Kindle|PlayBook/.test(ua)) return 'tablet';
  if (/Mobi/.test(ua)) return 'phone';
  // Unknown UA: a touch-only device is a phone or tablet by size
  if (env.touchOnly && env.maxTouchPoints > 0) return shortSide >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone';
  return 'desktop';
}

export function currentDeviceEnv(): DeviceEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const scr = typeof screen !== 'undefined' ? screen : null;
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    screenWidth: scr?.width ?? 0,
    screenHeight: scr?.height ?? 0,
    touchOnly: mq('(pointer: coarse)') && !mq('(any-pointer: fine)'),
  };
}

export function currentDeviceClass(): DeviceClass {
  return detectDeviceClass(currentDeviceEnv());
}

export function deviceClassOf(p: CVDParams | null | undefined): DeviceClass | null {
  return p?.device.deviceClass ?? null;
}

/** "Tested on a phone" etc., or '' for results without a recorded class. */
export function testedOnText(p: CVDParams): string {
  const dc = deviceClassOf(p);
  return dc ? t(`device.testedOn.${dc}`) : '';
}

/** Both classes known and different. */
export function differentDevice(a: DeviceClass | null, b: DeviceClass | null): boolean {
  return a !== null && b !== null && a !== b;
}

/** After a retest: this result vs the previous one. */
export function retestNotice(latest: CVDParams, previous: CVDParams | null | undefined): string | null {
  const now = deviceClassOf(latest);
  const before = deviceClassOf(previous);
  if (!differentDevice(now, before)) return null;
  return t('device.notice.retest', { now: t(`device.name.${now}`), before: t(`device.name.${before}`) });
}

/** Before testing: the saved result came from a different kind of screen than this one. */
export function prepNotice(saved: CVDParams | null | undefined, current: DeviceClass): string | null {
  const before = deviceClassOf(saved);
  if (!differentDevice(current, before)) return null;
  return t('device.notice.prep', { now: t(`device.name.${current}`), before: t(`device.name.${before}`) });
}

/** Importing a result that was tested on a different kind of screen than this one. */
export function importNotice(linked: CVDParams, current: DeviceClass): string | null {
  const then = deviceClassOf(linked);
  if (!differentDevice(current, then)) return null;
  return t('device.notice.import', { now: t(`device.name.${current}`), then: t(`device.name.${then}`) });
}
