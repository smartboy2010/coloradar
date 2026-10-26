#!/usr/bin/env node
// Fails the build if en.json and zh.json don't have exactly the same keys,
// or if any value is empty or uses different {placeholders}.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/i18n');
const en = JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8'));
const zh = JSON.parse(readFileSync(resolve(dir, 'zh.json'), 'utf8'));

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const problems = [];
for (const k of Object.keys(en)) if (!(k in zh)) problems.push(`zh.json is missing "${k}"`);
for (const k of Object.keys(zh)) if (!(k in en)) problems.push(`en.json is missing "${k}"`);
for (const [name, dict] of [['en', en], ['zh', zh]]) {
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string' || !v.trim()) problems.push(`${name}.json "${k}" is empty`);
  }
}
for (const k of Object.keys(en)) {
  if (k in zh && placeholders(en[k]) !== placeholders(zh[k])) {
    problems.push(`"${k}" placeholders differ: en {${placeholders(en[k])}} vs zh {${placeholders(zh[k])}}`);
  }
}

if (problems.length) {
  console.error(`i18n check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n check passed (${Object.keys(en).length} keys)`);
