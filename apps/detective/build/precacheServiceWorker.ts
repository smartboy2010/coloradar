/**
 * Vite plugin: emit `sw.js` from `sw-template.js` with a precache list of every
 * emitted file (JS chunks, the Worker, CSS, public files) and a content-hash
 * cache version, so each release refreshes the offline cache.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

function listFiles(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(listFiles(p));
    else out.push(p);
  }
  return out;
}

export function precacheServiceWorker(opts: { template: string; publicDir: string }): Plugin {
  return {
    name: 'cvd-precache-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const files = new Set<string>(['./', './index.html']);
      for (const [fileName, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (fileName.endsWith('.map') || fileName === 'sw.js') continue;
        files.add(`./${fileName}`);
        hash.update(fileName);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const publicDir = resolve(opts.publicDir);
      for (const p of listFiles(publicDir).sort()) {
        const rel = relative(publicDir, p).split('\\').join('/');
        files.add(`./${rel}`);
        hash.update(rel);
        hash.update(readFileSync(p));
      }
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(resolve(opts.template), 'utf8')
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE_MANIFEST__', JSON.stringify([...files], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
