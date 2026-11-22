# Steering — Tech Stack

## Stack (deliberately boring, deliberately free)

- **No framework, no build step.** Vanilla HTML/CSS/JS, ES modules.
  `index.html` + `src/*.js`. Run with any static server
  (`python3 -m http.server`, `npx serve`, GitHub Pages).
- **Storage:** IndexedDB via a tiny promise wrapper in `src/store.js`.
  In-memory fallback if IndexedDB is unavailable (with a visible banner).
- **QR encoding:** vendored `qrcode-generator` (kazuhikoarase, MIT) —
  see `THIRD-PARTY-NOTICES.md`. No CDN, no runtime fetch.
- **Compression:** `CompressionStream`/`DecompressionStream` (gzip) with
  an uncompressed `PL0` fallback.
- **Voice:** Web Speech API (`SpeechRecognition`, `id-ID`). No cloud STT.
- **QR scanning:** `BarcodeDetector` where available; paste/file import
  always available as the fallback path.
- **PWA:** `manifest.webmanifest` + `sw.js` (cache-first, versioned cache).
- **Tests:** Node's built-in `node:test` (no test framework dependency);
  `puppeteer-core` + system Chromium for the browser smoke test only.

## Conventions

- Pure functions live in `src/money.js`, `src/rules.js`, `src/sync.js`,
  `src/report.js`, `src/voice.js` — **no DOM, no IndexedDB, no `window`**
  in these files, so they run unchanged under Node for unit tests.
- `src/app.js` and `src/store.js` are the only files that touch the DOM
  and IndexedDB respectively.
- Money is always an integer number of IDR. Never floats for money.
- Dates are local `YYYY-MM-DD` strings; timestamps are epoch ms.
- IDs are `crypto.randomUUID()` with a time+random fallback.
- All user-visible strings in Indonesian; keep them in `app.js` near the
  UI that shows them (no i18n framework — scope discipline).
- Every new pure function gets a unit test in the same commit.
- Never add a runtime network call. `grep -r "fetch(" src/` must stay
  empty except in tests.
