/**
 * Color Vision Detective — app entry: hash routing, top navigation, language.
 * `#/test` runs the original 5-step flow (disclaimer → prep → practice → test → results).
 * `#/radar` lazy-loads the Color Radar camera view (WebGL), so other routes stay light.
 */

import { renderDisclaimer } from './screens/disclaimer.js';
import { renderPrep, type SelfReport } from './screens/prep.js';
import { renderPractice } from './screens/practice.js';
import { renderTest } from './screens/test.js';
import { renderResults } from './screens/results.js';
import { renderImport } from './screens/import.js';
import { renderSettings } from './screens/settings.js';
import { renderGuide } from './screens/guide.js';
import { gearIcon, helpIcon } from './components/icons.js';
import { renderFixer, resetFixerSettings } from './fixer/ui/fixerScreen.js';
import { resetRadarSettings } from './radar/params.js';
import { migrateLegacyRadarParams } from './store/radarLegacy.js';
import { classify, classificationToParams } from './classifier.js';
import { currentDeviceClass } from './device.js';
import type { StaircaseState, TrialRecord } from './staircase.js';
import { parseHash, navigateTo, onRouteChange, type Route, type RouteName } from './router.js';
import { LocalProfileStore } from './store/LocalProfileStore.js';
import type { Lang } from './store/ProfileStore.js';
import { t, getLang, setLang, onLangChange, isLang } from './i18n/i18n.js';

type TestStage = 'disclaimer' | 'prep' | 'practice' | 'test';

const store = new LocalProfileStore();
const topbar = document.getElementById('topbar')!;
const notices = document.getElementById('notices')!;
const app = document.getElementById('app')!;

let currentRoute: Route = { name: 'test', query: new URLSearchParams() };
let testStage: TestStage = 'disclaimer';
let selfReport: Record<string, unknown> = {};
let practiceRts: number[] = [];
let lastTrials: TrialRecord[] | null = null;
let justFinished = false;
let cleanup: (() => void) | null = null;
let settingsMessage = '';
let migrationNoticeShown = false;
let renderSeq = 0;

function renderTopbar(): void {
  const lang = getLang();
  const active = currentRoute.name;
  // Re-rendering a running test would reset the staircase, so hide the switch there
  const hideLang = active === 'test' && (testStage === 'practice' || testStage === 'test');
  const link = (name: RouteName, key: string) =>
    `<a href="#/${name}" class="nav-link ${active === name ? 'is-active' : ''}" ${active === name ? 'aria-current="page"' : ''}>${t(key)}</a>`;
  topbar.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="#/test" aria-label="${t('app.name')}">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="3.5"/>
          <circle cx="24" cy="24" r="12" stroke="currentColor" stroke-width="3" stroke-dasharray="4 3"/>
          <circle cx="24" cy="24" r="5" fill="currentColor"/>
        </svg>
        <span>${t('app.name')}</span>
      </a>
      <div class="topbar-tools">
        ${hideLang ? '' : `
        <div class="lang-switch" role="group" aria-label="${t('lang.switch')}">
          <button type="button" data-lang="en" aria-pressed="${lang === 'en'}" lang="en">EN</button>
          <button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}" lang="zh-CN">中文</button>
        </div>`}
        <a href="#/guide" class="icon-link ${active === 'guide' ? 'is-active' : ''}" aria-label="${t('nav.guide')}" title="${t('nav.guide')}">
          ${helpIcon()}
        </a>
        <a href="#/settings" class="icon-link ${active === 'settings' ? 'is-active' : ''}" aria-label="${t('nav.settings')}" title="${t('nav.settings')}">
          ${gearIcon()}
        </a>
      </div>
    </div>
    <nav class="nav" aria-label="${t('nav.main')}">
      ${link('test', 'nav.test')}
      ${link('fixer', 'nav.fixer')}
      ${link('radar', 'nav.radar')}
      ${link('results', 'nav.results')}
    </nav>`;
  topbar.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => void changeLang(btn.dataset.lang as Lang));
  });
}

function renderNotices(): void {
  const issue = store.issue;
  const items: string[] = [];
  if (issue === 'unavailable') items.push(`<p class="notice notice-warn" role="alert"><span aria-hidden="true">⚠</span> ${t('storage.unavailable')}</p>`);
  if (issue === 'corrupt') items.push(`<p class="notice notice-warn" role="alert"><span aria-hidden="true">⚠</span> ${t('storage.corrupt')}</p>`);
  if (store.migratedFromLegacy && !migrationNoticeShown) {
    items.push(`<p class="notice notice-info" role="status"><span aria-hidden="true">ℹ</span> ${t('storage.migrated')}</p>`);
  }
  notices.innerHTML = items.join('');
}

async function changeLang(lang: Lang): Promise<void> {
  await store.setPrefs({ lang });
  setLang(lang);
}

function renderTestStage(): void {
  window.scrollTo(0, 0);
  renderTopbar();
  switch (testStage) {
    case 'disclaimer':
      renderDisclaimer(app, () => {
        testStage = 'prep';
        renderTestStage();
      });
      break;
    case 'prep':
      void store.getActiveProfile().then(profile => {
        if (currentRoute.name !== 'test' || testStage !== 'prep') return;
        renderPrep(app, (report: SelfReport) => {
          selfReport = report as unknown as Record<string, unknown>;
          testStage = 'practice';
          renderTestStage();
        }, { deviceClass: currentDeviceClass(), savedResult: profile?.latestResult ?? null });
      });
      break;
    case 'practice':
      renderPractice(app, (rts: number[]) => {
        practiceRts = rts;
        testStage = 'test';
        renderTestStage();
      });
      break;
    case 'test':
      renderTest(app, (state: StaircaseState) => void finishTest(state), practiceRts);
      break;
  }
}

async function finishTest(state: StaircaseState): Promise<void> {
  const params = classificationToParams(classify(state, selfReport), selfReport, currentDeviceClass());
  const profile = await store.getActiveProfile();
  if (profile) await store.saveResult(profile.id, params);
  lastTrials = state.trials;
  justFinished = true;
  testStage = 'disclaimer';
  resetFixerSettings();
  resetRadarSettings();
  navigateTo('results');
}

async function render(route: Route): Promise<void> {
  const seq = ++renderSeq;
  const leavingTest = currentRoute.name === 'test' && route.name !== 'test';
  cleanup?.();
  cleanup = null;
  currentRoute = route;
  if (leavingTest) testStage = 'disclaimer';
  app.className = '';
  document.body.classList.toggle('is-radar', route.name === 'radar');
  renderTopbar();
  renderNotices();

  switch (route.name) {
    case 'test':
      renderTestStage();
      break;
    case 'fixer': {
      const profile = await store.getActiveProfile();
      const prefs = await store.getPrefs();
      cleanup = renderFixer(app, { store, params: profile?.latestResult ?? null, initialMode: prefs.fixerMode });
      break;
    }
    case 'radar': {
      app.className = 'radar-route';
      app.innerHTML = '';
      const profile = await store.getActiveProfile();
      const { mountRadar } = await import('./radar/mount.js');
      if (seq !== renderSeq) break;
      const radar = mountRadar(app, { params: profile?.latestResult ?? null });
      cleanup = () => radar.destroy();
      break;
    }
    case 'results': {
      const profile = await store.getActiveProfile();
      renderResults(app, profile?.latestResult ?? null, {
        store,
        previous: profile?.history[0] ?? null,
        trials: lastTrials ?? undefined,
        justFinished,
        onRetest: () => {
          testStage = 'disclaimer';
          navigateTo('test');
        },
        onOpenFixer: () => navigateTo('fixer'),
        onDataChanged: () => {
          lastTrials = null;
          resetFixerSettings();
          resetRadarSettings();
          void render(currentRoute);
        },
      });
      justFinished = false;
      break;
    }
    case 'import':
      await renderImport(app, {
        store,
        route,
        onDataChanged: () => {
          lastTrials = null;
          resetFixerSettings();
          resetRadarSettings();
        },
      });
      break;
    case 'guide':
      renderGuide(app, { section: route.query.get('s') });
      break;
    case 'settings':
      renderSettings(app, {
        store,
        message: settingsMessage,
        onLangChange: lang => void changeLang(lang),
        onClear: async () => {
          await store.clearAll();
          lastTrials = null;
          resetFixerSettings();
          resetRadarSettings();
          settingsMessage = t('settings.cleared');
          if (getLang() !== 'en') setLang('en');
          else void render(currentRoute);
        },
      });
      settingsMessage = '';
      break;
  }
  if (store.migratedFromLegacy) migrationNoticeShown = true;
}

async function defaultRoute(): Promise<RouteName> {
  const profile = await store.getActiveProfile();
  return profile?.latestResult ? 'fixer' : 'test';
}

/** The radar fills the viewport below the sticky top bar and any notices. */
function trackChromeHeight(): void {
  const update = () => {
    const bottom = notices.childElementCount > 0
      ? notices.getBoundingClientRect().bottom
      : topbar.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--chrome-h', `${Math.max(0, Math.round(bottom))}px`);
  };
  update();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(update);
    ro.observe(topbar);
    ro.observe(notices);
  }
  window.addEventListener('resize', update);
}

async function boot(): Promise<void> {
  await migrateLegacyRadarParams(store);
  const prefs = await store.getPrefs();
  // ?lang=zh (in the query or the hash query) opens a specific language and remembers it
  const urlLang = new URLSearchParams(location.search).get('lang') ?? parseHash(location.hash)?.query.get('lang');
  let lang: Lang = prefs.lang;
  if (isLang(urlLang)) {
    lang = urlLang;
    await store.setPrefs({ lang });
  }
  setLang(lang);
  trackChromeHeight();
  onLangChange(() => {
    if (currentRoute.name === 'test') renderTestStage();
    // The radar relabels itself in place; remounting would restart the camera
    else if (currentRoute.name === 'radar') {
      renderTopbar();
      renderNotices();
    } else void render(currentRoute);
  });

  onRouteChange(async route => {
    if (!route) {
      location.replace(`#/${await defaultRoute()}`);
      return;
    }
    void render(route);
  });

  const initial = parseHash(location.hash);
  if (initial) {
    await render(initial);
  } else {
    history.replaceState(null, '', `#/${await defaultRoute()}`);
    await render(parseHash(location.hash)!);
  }
}

void boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
