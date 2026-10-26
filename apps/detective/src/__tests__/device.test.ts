import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultParams, validateParams, type CVDParams, type DeviceClass } from '@cvd-tools/color-core';
import { detectDeviceClass, retestNotice, prepNotice, importNotice, testedOnText, type DeviceEnv } from '../device.js';
import { classificationToParams, classify } from '../classifier.js';
import { encodeShareData, decodeShareData } from '../store/shareLink.js';
import { setLang } from '../i18n/i18n.js';
import { runObserver } from './observers.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ Safari requests the desktop site
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

const env = (o: Partial<DeviceEnv>): DeviceEnv => ({
  userAgent: UA.windows, maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080, touchOnly: false, ...o,
});

describe('detectDeviceClass', () => {
  it.each<[string, Partial<DeviceEnv>, DeviceClass]>([
    ['iPhone', { userAgent: UA.iphone, maxTouchPoints: 5, screenWidth: 393, screenHeight: 852, touchOnly: true }, 'phone'],
    ['iPad (iPad UA)', { userAgent: UA.ipadLegacy, maxTouchPoints: 5, screenWidth: 768, screenHeight: 1024, touchOnly: true }, 'tablet'],
    ['iPadOS reporting as Mac', { userAgent: UA.mac, maxTouchPoints: 5, screenWidth: 820, screenHeight: 1180, touchOnly: true }, 'tablet'],
    ['Mac', { userAgent: UA.mac, maxTouchPoints: 0, screenWidth: 1512, screenHeight: 982 }, 'desktop'],
    ['Android phone', { userAgent: UA.androidPhone, maxTouchPoints: 5, screenWidth: 412, screenHeight: 915, touchOnly: true }, 'phone'],
    ['Android tablet', { userAgent: UA.androidTablet, maxTouchPoints: 10, screenWidth: 800, screenHeight: 1280, touchOnly: true }, 'tablet'],
    ['Windows laptop with touchscreen', { userAgent: UA.windows, maxTouchPoints: 10, touchOnly: false }, 'desktop'],
    ['Windows desktop', { userAgent: UA.windows }, 'desktop'],
    ['unknown touch-only UA, small screen', { userAgent: UA.linux, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844, touchOnly: true }, 'phone'],
    ['unknown touch-only UA, large screen', { userAgent: UA.linux, maxTouchPoints: 5, screenWidth: 1024, screenHeight: 1366, touchOnly: true }, 'tablet'],
  ])('%s → %s', (_name, o, expected) => {
    expect(detectDeviceClass(env(o))).toBe(expected);
  });
});

function result(deviceClass?: DeviceClass, type: CVDParams['type'] = 'deutan'): CVDParams {
  const p: CVDParams = { ...createDefaultParams(), type, level: 'moderate', severity: 0.6, confidence: 'medium' };
  p.device = { ...p.device, ...(deviceClass ? { deviceClass } : {}) };
  return p;
}

describe('deviceClass in CVDParams', () => {
  it('is optional and validated', () => {
    expect(validateParams(result('tablet'))?.device.deviceClass).toBe('tablet');
    expect(validateParams(result())?.device).not.toHaveProperty('deviceClass');
    const bad = { ...result(), device: { userAgent: '', screen: '', selfReport: {}, deviceClass: 'fridge' } };
    expect(validateParams(bad)).not.toBeNull();
    expect(validateParams(bad)?.device).not.toHaveProperty('deviceClass');
  });

  it('is recorded by classificationToParams when provided', () => {
    const r = classify(runObserver(1, 'deutan', 0.6, false));
    expect(classificationToParams(r, {}, 'phone').device.deviceClass).toBe('phone');
    expect(classificationToParams(r).device).not.toHaveProperty('deviceClass');
  });

  it('survives share links; old links without it still decode', () => {
    expect(decodeShareData(encodeShareData(result('desktop')))?.device.deviceClass).toBe('desktop');
    const old = encodeShareData(result());
    expect(JSON.parse(atob(old.replace(/-/g, '+').replace(/_/g, '/')))).not.toHaveProperty('k');
    expect(decodeShareData(old)?.device).not.toHaveProperty('deviceClass');
  });
});

describe('device notices', () => {
  beforeEach(() => setLang('en'));

  it('flags a retest on a different kind of device only', () => {
    expect(retestNotice(result('phone'), result('desktop'))).toMatch(/measured on a phone; your previous one was measured on a computer/);
    expect(retestNotice(result('phone'), result('phone'))).toBeNull();
    expect(retestNotice(result('phone'), null)).toBeNull();
    expect(retestNotice(result('phone'), result())).toBeNull();
  });

  it('warns before testing and when importing from a different device', () => {
    expect(prepNotice(result('desktop'), 'tablet')).toMatch(/measured on a computer, and you're now on a tablet/);
    expect(prepNotice(result('tablet'), 'tablet')).toBeNull();
    expect(prepNotice(null, 'tablet')).toBeNull();
    expect(importNotice(result('phone'), 'desktop')).toMatch(/measured on a phone, and you're on a computer/);
    expect(importNotice(result(), 'desktop')).toBeNull();
  });

  it('says that severity can differ but type is usually stable, in both languages', () => {
    expect(importNotice(result('phone'), 'desktop')).toMatch(/Severity can differ between screens, while the type is usually stable/);
    setLang('zh');
    expect(retestNotice(result('tablet'), result('phone'))).toMatch(/本次结果在平板上测得，上一次结果在手机上测得/);
    expect(testedOnText(result('desktop'))).toBe('在电脑上测试');
    expect(testedOnText(result())).toBe('');
  });
});
