# 👻 Phantom Ledger

**Buku kas hantu — tanpa akun, tanpa server, tanpa jejak.**

A serverless, account-free bookkeeping PWA for community treasurers
(Indonesian RT, masjid, arisan, small shops). Built for
**Kiroween 2026 — category: Frankenstein** ($5,000 category prize,
$100,000+ pool, deadline Fri Dec 4, 2026 2:00 PM PT).

## The Frankenstein stitch

Five technologies that normally never meet in one app, stitched into one:

| Piece | Technology | The "wrong" part |
|---|---|---|
| Storage | **IndexedDB**, local-first | A database with no server, no ORM, no backend |
| Sync | **QR codes as a transport** | A 1990s barcode as a network protocol — one phone shows it, another scans it, the whole ledger moves. No account, no cloud. |
| Input | **Web Speech API** (`id-ID`) | A voice assistant with no cloud, no wake word, no account |
| Intelligence | **Hand-written keyword rules** | "AI" that is a 30-line lookup table — explainable, offline, editable by the treasurer |
| Distribution | **WhatsApp paste + CSV file** | A chat app and a spreadsheet as the reporting layer |

Each piece is deliberately low-tech, free, and account-free — so the whole
thing works for a treasurer with a cheap Android phone and patchy signal.

## Features

- ✏️ **Record** pemasukan/pengeluaran with amount, date, category, note;
  edit/delete, running balance, month/type/category filters. Data persists
  in IndexedDB (in-memory fallback with a warning if IndexedDB is blocked).
- 🎙️ **Voice entry (Indonesian)** — say *"pengeluaran lima puluh ribu
  untuk listrik"* and get a pre-filled draft to confirm. Gracefully
  degrades when the browser has no SpeechRecognition: the manual form
  still works, and the UI says so plainly.
- 🧠 **Rule-based auto-categorization** — "bayar listrik PLN" → Listrik.
  Rules are visible and editable in Settings, and they sync with the QR.
- 🔳 **QR sync ("phantom sync")** — export encodes the full ledger as a
  versioned, gzipped, base64url payload (`PL1.i.n.…` chunks), rendered as
  QR codes. Import by camera scan, paste, or file; merges last-writer-wins
  per transaction id, with tombstones for deletes and a pre-confirm
  summary. Corrupt or wrong-version payloads are rejected with a clear error.
- 📋 **Monthly report** — opening/in/out/closing balance, per-category
  totals, top transactions; one-tap copy as WhatsApp-ready text, plus CSV
  export (`tanggal,jenis,kategori,jumlah,catatan`).
- 🔒 **Privacy** — zero network requests at runtime, zero analytics, zero
  third-party scripts. Data leaves the device only when *you* show a QR
  code or export a file.

## Run it

No build step, no dependencies at runtime.

```bash
# any static server (service worker needs http(s); file:// works for the app shell)
python3 -m http.server 8901
# open http://localhost:8901/
```

Or: `npm run serve`. To install as a PWA, open it in Chrome/Android and
"Add to Home screen" — it works fully offline after the first load.

## Test it

```bash
npm test          # unit tests: money parsing, rules, sync codec, merge, report, voice (node:test, no deps)
npm run smoke     # headless-Chromium end-to-end (needs puppeteer-core, dev-only):
                  #   npm install --no-save puppeteer-core
                  # 22 checks: CRUD, persistence, voice degrade, QR render+decode,
                  # import merge across two browser contexts, report, CSV, offline load
```

Verified 2026-11-22: **11/11 unit tests, 22/22 smoke checks pass**
(see `tests/`).

## Project layout

```
index.html  manifest.webmanifest  sw.js
src/  money.js  rules.js  sync.js  report.js  voice.js  store.js  app.js  styles.css
src/qrcode.min.js            # vendored MIT QR encoder (see THIRD-PARTY-NOTICES.md)
tests/  unit.test.mjs  smoke.mjs
demo/  SCRIPT.md  screenshots/  phantom-ledger-demo.mp4  build-video.py  shots.mjs
.kiro/
  specs/phantom-ledger/      # requirements.md, design.md, tasks.md
  steering/                  # product.md, tech.md, structure.md
  hooks/                     # check-on-save.json, validate-spec-checklist.json + scripts/
KIRO-USAGE.md                # honest write-up of how Kiro was (and wasn't) used
```

## How Kiro was used

Spec-driven: requirements → design → tasks, then implementation in task
order with hooks checking syntax/tests on save and validating the spec
checklist. Full honest account in [`KIRO-USAGE.md`](KIRO-USAGE.md).

## License

MIT — see [LICENSE](LICENSE). Original code; the only third-party code is
the vendored MIT QR encoder listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
