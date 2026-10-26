/**
 * Minimal i18n: flat JSON dictionaries, `t(key, vars)` with `{name}` substitution.
 * English is the primary copy; missing keys render as the key name so gaps are visible.
 * Screens render via innerHTML templates, so switching language re-renders the current screen.
 */

import en from './en.json';
import zh from './zh.json';
import type { Lang } from '../store/ProfileStore.js';

export type Dict = Record<string, string>;

export const DICTIONARIES: Record<Lang, Dict> = { en, zh };

let current: Lang = 'en';
const listeners = new Set<(lang: Lang) => void>();

export function t(key: string, vars?: Record<string, string | number>): string {
  const s = DICTIONARIES[current][key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function getLang(): Lang {
  return current;
}

export function htmlLang(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en';
}

export function setLang(lang: Lang): void {
  const changed = lang !== current;
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = htmlLang(lang);
    document.title = lang === 'zh' ? '色觉侦探 — Color Vision Detective' : 'Color Vision Detective';
  }
  if (changed) listeners.forEach(fn => fn(lang));
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'zh';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Locale-aware short date for display */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(current === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
}
