# 色觉侦探 — Color Vision Detective (with Color Radar)

One web app with three features that share one result:

1. **Test** (`#/test`) — a gamified mobile-web color vision test that estimates CVD (color vision deficiency) type and severity in ~3 minutes.
2. **Chart Fixer** (`#/fixer`) — recolors charts and maps using your result.
3. **Color Radar** (`#/radar`, 颜色雷达) — a live camera view that highlights a tapped color, separates confusable colors tuned to your result, and names colors.

English by default, Chinese available (EN / 中文 in the top bar, or `?lang=zh`).

New users: the in-app **user guide** (`#/guide`, the ? icon in the top bar, also linked from Settings) explains how to prepare, take the test, read results, and use the Chart Fixer and Color Radar, in English and Chinese.

**This is not a medical diagnostic tool.** Results are for personal reference and calibrating assistive color tools. Consult an ophthalmologist for professional evaluation.

## What it does

- **4-AFC "find the different" test** using dot mosaic stimuli with luminance noise masking
- **Adaptive staircase** (2-down-1-up) on 3 confusion axes: protan, deutan, tritan
- **Hesitation weighting**: a correct answer given much slower than your own baseline (median RT of practice, attention checks and easy early answers) counts as a likely guess — it barely moves the staircase, its reversals weigh less in the threshold, and if the protan/deutan call rests on such answers the result becomes `rg_uncertain`
- **Observer-model classifier**: every type × Machado severity predicts thresholds on all three axes; the best fit (with per-observer sensitivity and lightness-cue nuisance parameters) gives type and severity, and a small protan-vs-deutan fit margin gives `rg_uncertain`
- **Outputs**: estimated CVD type, severity level, confidence, and a standardized parameter set (`cvd-params/0.1`)
- **Device class**: the kind of device (phone / tablet / desktop) is detected automatically from screen size, touch/pointer and user agent (iPadOS desktop-mode Safari is recognized by its touch points) and stored as the optional `device.deviceClass`. Results show "Tested on a …", the prep screen adapts viewing distance and settings hints, and you get a note when you retest or import a result from a different kind of device: severity can differ between screens, while the type is usually stable
- **World comparison**: before/after slider showing Machado 2009 simulation
- **Export**: JSON/CSV trial data, localStorage parameters, URL hash for color tools

## Chart Fixer (v0.2)

- Upload, drag-and-drop or paste a PNG/JPG/WebP chart (or try a built-in sample)
- **For me** uses your saved result (`rg_uncertain` checks protan and deutan and takes the worst case); **For everyone** targets severe protan + deutan (tritan opt-in)
- Extracts the palette (≤12 colors, OKLab k-means++-style seeding), finds pairs that collapse under Machado simulation, moves only those colors (smaller areas first, no new confusions), and recolors the full image with blend-aware soft mapping so anti-aliasing survives
- Before/after slider, "Show how I see it" simulation, a change list (swatch + hex + reason), color locking, strength slider, PNG download
- Runs in a Web Worker; images never leave the browser

## Color Radar

- **Highlight**: tap a color; every matching area (OKLab distance, tolerance slider) stays in color with a white outline, the rest goes grey
- **Separate**: real-time daltonization (Machado 2009 simulation + Fidaner error redistribution, strength slider) driven by your saved result:
  - continuous `severity` (0–1) interpolates the Machado matrices — no three-step snapping
  - simulations follow the Chart Fixer's `simsForResult`; `rg_uncertain` runs protan **and** deutan at the same severity, and the shader blends the two corrections per pixel by their squared error (a soft worst case: whichever simulation loses more of that pixel dominates, without seams or double correction)
  - `normal` shows a note that no enhancement is needed
  - without a result it uses the Chart Fixer's default (red-green, type unclear, moderate) and shows a prompt linking to the test and to `#/import`
- **Name**: reads the color under a movable crosshair (en/zh names, lighting warning)
- **Freeze** (button or double-tap), **hold to compare** with the original, **image mode** when no camera is available
- The status chip shows type · level · confidence; it opens **Radar settings** with result details and a session-only manual override (type + severity)
- WebGL2 (WebGL1 fallback), all processing on the GPU; frames are never stored or uploaded
- The route is lazy-loaded (its own chunk), so the test and fixer pages don't download the WebGL pipeline; leaving the route stops the camera and releases the GL context
- The standalone radar's old `color-vision-params` key is migrated once into the active profile if it has no result

## Storage & privacy

Results and preferences live only in `localStorage` under `cvd-app/v1` (no cookies, no server); the test, Chart Fixer and Color Radar all read the active profile's `latestResult`. v0.1's `cvd-params` key is migrated on first run and kept for one release. Back up via a file or a parameter link (`#/import?d=…`, data after the `#` is never sent to a server; the compact payload carries an optional `k` device class, and links without it still import). v0.1 `#cvd=` links still import.

## Color science

- All color math in **CIE 1976 u'v'** space with luminance noise (±25%)
- Stimuli generated along confusion axes pointing to copunctal points from the Cambridge Colour Test
- **Machado, Oliveira & Fernandes 2009** simulation matrices for CVD modeling
- Perceptual differences computed in **OKLab** space (also used by the radar's highlight and naming)
- Gamut checking ensures all stimuli are displayable in sRGB

## Project structure

```
packages/color-core/      Shared color math library
  ├── srgb.ts             sRGB ↔ linear RGB
  ├── xyz.ts              linear RGB ↔ XYZ ↔ u'v', gamut checking
  ├── oklab.ts            OKLab / OKLCh conversions
  ├── machado.ts          Machado 2009 CVD simulation matrices
  ├── srgbLut.ts          8-bit sRGB ↔ linear lookup tables
  ├── gamut.ts            OKLCh chroma clipping, 8-bit ↔ OKLab helpers
  └── params.ts           cvd-params type, defaults, schema validation (pure)

apps/detective/           The app (test, Chart Fixer, Color Radar)
  ├── src/stimulus.ts     Canvas 2D dot mosaic generation
  ├── src/staircase.ts    3-axis interleaved staircase state machine
  ├── src/cvdModel.ts     Machado threshold predictions + observer-model fit
  ├── src/classifier.ts   Thresholds → model fit → type / severity / confidence
  ├── src/export.ts       JSON / CSV data export
  ├── src/router.ts       Hash routes: #/test #/fixer #/radar #/results #/import #/guide #/settings
  ├── src/store/          ProfileStore interface, LocalProfileStore, share links
  ├── src/i18n/           en.json (primary) / zh.json, t()
  ├── src/fixer/          palette / confusion / optimize / recolor (pure) + Worker + UI
  ├── src/radar/          Color Radar: camera, WebGL pipeline + shaders, gestures, naming, UI
  ├── src/components/     Comparison slider
  └── src/screens/        UI screens (test flow, results, import, settings)
```

## Tech stack

- TypeScript + Vite (no frontend framework — vanilla DOM)
- Canvas 2D for stimulus rendering; hand-written WebGL shaders for the radar
- Vitest for unit and simulated observer tests
- PWA: the build emits a service worker that precaches every asset (versioned by content hash)

## Development

```bash
npm install
npm run dev          # unified app on http://localhost:5199 (all three features)
npm test             # unit tests, simulated observer/reader tests, synthetic chart atlas
npm run typecheck    # TypeScript check of both packages
npm run build        # i18n key check + production build (emits a precaching sw.js)
```

The camera needs a secure context: `localhost` works; on a phone over the LAN use HTTPS (or upload an image in the radar).

## History

This repository contains the full history of two projects: the `genesis` monorepo (`cvd-tools`: `packages/color-core` + `apps/detective`), merged with `--allow-unrelated-histories`, and the standalone Color Radar, whose source now lives in `apps/detective/src/radar/`. `genesis` remains an independent repository.

## Test validation

The test includes simulated observer validation:
- **Normal observers** → classified as normal ≥90% of runs
- **Protan/deutan observers** → red-green deficiency detected 100% of runs
- **Tritan observers** → abnormality detected ≥70% of runs
- **Severity monotonicity** → higher Machado severity produces higher thresholds

## Output format

```json
{
  "schema": "cvd-params/0.1",
  "type": "protan | deutan | tritan | rg_uncertain | normal",
  "level": "none | mild | moderate | severe",
  "severity": 0.0,
  "thresholds": { "protan": 0.0, "deutan": 0.0, "tritan": 0.0 },
  "maxOffsets": { "protan": 0.0, "deutan": 0.0, "tritan": 0.0 },
  "confidence": "low | medium | high",
  "device": { "userAgent": "", "screen": "", "selfReport": {}, "deviceClass": "phone | tablet | desktop (optional)" },
  "testedAt": "ISO-8601"
}
```

## Accessibility

The app itself does not rely on color to convey information:
- Correct/wrong feedback uses icons (✓/✗) + text
- Button states use shape + text + border changes
- All text meets WCAG AA contrast requirements

## License

MIT
