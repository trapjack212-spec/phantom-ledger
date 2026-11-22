# Phantom Ledger — Tasks

Spec-driven build order. Each task maps to requirements (REQ) and is
checked off only when its acceptance criteria pass. Mark with `[x]` and
the date when done; never mark a task done on the basis of "it should work".

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done + verified

## Phase 0 — Scaffolding

- [x] 0.1 Init local git repo (`trapjack212` / `sendlup31@gmail.com`), create
  `.kiro/` tree skeleton. — 2026-11-22
- [x] 0.2 Try installing Kiro CLI headlessly (`kiro-cli 3.5.0` installed and
  `--version` verified; agentic use blocked — no login/API key in sandbox,
  see `KIRO-USAGE.md`). — 2026-11-22
- [x] 0.3 Write `requirements.md` (US-1…US-7, NFR-1…NFR-5). — 2026-11-22
- [x] 0.4 Write `design.md` (architecture, data model, QR protocol, voice
  parser, rules, report). — 2026-11-22
- [x] 0.5 Write `tasks.md` (this file). — 2026-11-22
- [x] 0.6 Write steering docs (`.kiro/steering/`). — 2026-11-22
- [x] 0.7 Write hooks + scripts (`.kiro/hooks/`), verify they run. — 2026-11-22

## Phase 1 — Pure core (no DOM, unit-testable)

- [x] 1.1 `src/money.js` — IDR formatting, `parseIndonesianAmount`
  (digits + number words). REQ US-3.2, US-2.2.
- [x] 1.2 `src/rules.js` — default rule table, `suggestCategory(note)`,
  add/remove/toggle rule. REQ US-4.
- [x] 1.3 `src/sync.js` — payload codec (gzip/base64url, `PL1` envelope,
  chunking, validation) + `mergeTransactions(local, incoming)`. REQ US-5.
- [x] 1.4 `src/report.js` — `computeTotals`, `toWhatsAppText`, `toCsv`.
  REQ US-6.
- [x] 1.5 `src/voice.js` — `parseVoice(text)` transcript → draft
  transaction. REQ US-3. (SpeechRecognition wiring lives in `app.js`.)
- [x] 1.6 Unit tests `tests/unit.test.mjs` (node:test) covering 1.1–1.5,
  incl. tamper rejection and old-version rejection. All green.

## Phase 2 — Storage + app shell

- [x] 2.1 `src/store.js` — IndexedDB wrapper (transactions/meta/rules)
  + in-memory fallback with warning. REQ US-1, US-2.4.
- [x] 2.2 `index.html` + `src/styles.css` — PWA shell, dark phantom theme,
  Indonesian UI. REQ US-1.4, NFR-1.
- [x] 2.3 `src/app.js` — CRUD UI, balance, month/type filters, edit/delete
  with confirm. REQ US-2.
- [x] 2.4 `manifest.webmanifest` + `sw.js` (cache-first offline). REQ US-1.4.

## Phase 3 — The Frankenstein features

- [x] 3.1 Voice entry UI in `app.js` + `voice.js` wiring, graceful
  degradation banner when SpeechRecognition is unavailable. REQ US-3.
- [x] 3.2 Auto-category suggestion in the form + rules editor in Settings.
  REQ US-4.
- [x] 3.3 QR export UI (chunk stepping) + QR import UI (scan via
  BarcodeDetector, paste, file) with pre-confirm summary. REQ US-5.
- [x] 3.4 Monthly report view + copy-to-WhatsApp + CSV download. REQ US-6.
- [x] 3.5 Vendor QR encoder (`src/qrcode.min.js`, MIT, kazuhikoarase
  qrcode-generator) + `THIRD-PARTY-NOTICES.md`. REQ US-7.3.

## Phase 4 — Verification

- [x] 4.1 Headless-Chromium smoke test `tests/smoke.mjs`: CRUD,
  voice degrade, QR renders + decodes, import merges, report + CSV.
  REQ NFR-5.
- [x] 4.2 Offline check: load with network disabled, add a transaction,
  reload, still there.
- [x] 4.3 Zero-network check: confirm no runtime requests leave the page.

## Phase 5 — Ship

- [x] 5.1 `README.md` (setup/run, Frankenstein story, testing).
- [x] 5.2 `LICENSE` (MIT).
- [x] 5.3 `KIRO-USAGE.md` (honest write-up).
- [x] 5.4 Demo plan `demo/SCRIPT.md` + screenshots `demo/screenshots/`.
- [x] 5.5 Demo video `demo/phantom-ledger-demo.mp4` (screenshots + ffmpeg;
  narration via gTTS if available, else captioned silent video).
- [x] 5.6 Final commit; verify `.kiro/` is committed and NOT gitignored.
