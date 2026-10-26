/**
 * Lightweight hash router: `#/test`, `#/fixer`, `#/radar`, `#/results`,
 * `#/import?d=…`, `#/guide`, `#/settings`. Hash routes work on static hosts without SPA fallback.
 * Legacy v0.1 links (`#cvd={…}`) are routed to the import screen.
 */

export type RouteName = 'test' | 'fixer' | 'radar' | 'results' | 'import' | 'guide' | 'settings';

export interface Route {
  name: RouteName;
  query: URLSearchParams;
  /** Raw v0.1 fragment when the URL was a legacy `#cvd=` link */
  legacy?: string;
}

const ROUTES: RouteName[] = ['test', 'fixer', 'radar', 'results', 'import', 'guide', 'settings'];

/** Parse a location hash. Returns null for an empty/unknown hash (caller picks the default). */
export function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('cvd=')) {
    return { name: 'import', query: new URLSearchParams(), legacy: h };
  }
  if (!h.startsWith('/')) return null;
  const [path, qs = ''] = h.slice(1).split('?', 2);
  const name = path.replace(/\/+$/, '') as RouteName;
  if (!ROUTES.includes(name)) return null;
  return { name, query: new URLSearchParams(qs) };
}

export function routeHash(name: RouteName, query?: Record<string, string>): string {
  const qs = query ? new URLSearchParams(query).toString() : '';
  return `#/${name}${qs ? `?${qs}` : ''}`;
}

export function navigateTo(name: RouteName, query?: Record<string, string>): void {
  const target = routeHash(name, query);
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function onRouteChange(handler: (route: Route | null) => void): void {
  window.addEventListener('hashchange', () => handler(parseHash(location.hash)));
}
