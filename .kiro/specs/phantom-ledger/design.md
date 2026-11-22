# Phantom Ledger — Design

## 1. The Frankenstein stitch

Five technologies that normally never meet in one app:

| Piece | Technology | Why it is "wrong" here — and why it works |
|---|---|---|
| Local-first store | IndexedDB (via a tiny promise wrapper, no library) | A database with no server, no ORM, no backend team |
| Sync | QR codes as a transport (camera-to-camera) | A barcode from the 1990s as a network protocol |
| Input | Web Speech API, `id-ID` | A voice assistant with no cloud, no account, no wake word |
| Intelligence | Hand-written keyword rules | "AI" that is a 30-line lookup table — and is better for it: explainable, offline, editable |
| Distribution | WhatsApp paste + CSV file | A chat app and a spreadsheet as the reporting layer |

The stitch is the point: each piece is deliberately low-tech, free, and
account-free, so the whole works for a treasurer with a Rp 1 jutaan Android
phone and patchy signal.

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  index.html  (single page, PWA shell)                      │
│  ├── src/styles.css        (dark "phantom" theme)          │
│  ├── src/qrcode.min.js     (vendored, MIT — encoder only) │
│  ├── src/app.js            (UI wiring, all DOM code)      │
│  ├── src/store.js          (IndexedDB wrapper)            │
│  ├── src/rules.js          (categorization rules)         │
│  ├── src/voice.js          (SpeechRecognition + ID parser)│
│  ├── src/sync.js           (QR payload codec + merge)     │
│  ├── src/report.js         (totals, WhatsApp text, CSV)   │
│  └── src/money.js          (IDR format + ID number words) │
│  sw.js / manifest.webmanifest (offline installability)     │
└────────────────────────────────────────────────────────────┘
        │ no network at runtime — everything above is local │
        ▼
   IndexedDB  "phantom-ledger"  (stores: transactions, meta, rules)
```

Design rules (from steering):

- **Pure core, thin shell.** `money.js`, `rules.js`, `sync.js`, `report.js`
  contain no DOM and no IndexedDB — they are pure functions, unit-testable
  in Node with zero dependencies.
- **One totals function.** `report.computeTotals(transactions, month)` is
  the single source of truth for balances, report, and CSV summary.
- **No build step.** ES modules via `<script type="module">`, served as
  static files. `file://` works for the app shell; a static server is
  recommended for the service worker (SW requires http(s)).

## 3. Data model

```ts
Transaction {
  id: string;          // crypto.randomUUID() (fallback: time+random)
  kasId: string;       // which cash book (default "kas-rt05")
  type: "in" | "out";  // pemasukan | pengeluaran
  amount: number;      // integer IDR, > 0
  date: string;        // "YYYY-MM-DD" (local date)
  category: string;    // e.g. "Listrik"
  note: string;        // free text
  createdAt: number;   // epoch ms
  updatedAt: number;   // epoch ms — merge conflict winner
  deletedAt: number | null; // tombstone; null = live
}

KasMeta { id, name, createdAt }
Rule     { id, keyword, category, enabled }
```

IndexedDB stores: `transactions` (keyPath `id`, index `by-date`),
`meta` (keyPath `key`), `rules` (keyPath `id`). DB name
`phantom-ledger`, version 1.

## 4. QR sync protocol ("phantom sync")

Payload (JSON, then gzip via `CompressionStream`, then base64url):

```json
{
  "v": 1,
  "kind": "phantom-ledger/export",
  "kas": { "id": "kas-rt05", "name": "Kas RT 05" },
  "exportedAt": 1732300000000,
  "transactions": [ /* Transaction[] incl. tombstones */ ],
  "rules": [ /* Rule[] */ ]
}
```

Envelope for QR chunking:

```
PL1.<partIndex>.<partCount>.<base64url-chunk>
```

- `PL1` = magic + format version 1. Anything else is rejected (US-5.6).
- One QR per chunk; the exporter shows chunk 1 of N and lets the user step
  through chunks (auto-advance every 2.5 s optional). The importer collects
  chunks (scan, paste, or file) until all `n` parts are present, then joins,
  decodes, gunzips, parses, and validates against a shape check.
- QR error-correction level M, version auto. Payloads above ~2 900 bytes of
  base64url per QR are split (safe capacity for a version-40 M code is
  ~2 335 alphanumeric chars; we stay conservative at ~1 800 chars/chunk).
- Merge (last-writer-wins per id, tombstones win over live records with an
  older `updatedAt`):

```
for each incoming tx:
  local = store.get(tx.id)
  if !local            → insert
  else if tx.updatedAt > local.updatedAt → replace (incl. tombstone)
  else                 → skip
```

Import summary counts inserted / updated / skipped / tombstoned, shown
before confirm (US-5.4). Nothing is written until the user confirms.

Fallback note: `CompressionStream` is Chrome 80+; if absent, the codec
falls back to uncompressed JSON with magic `PL0` (still versioned and
validated). Both paths are covered by unit tests.

## 5. Voice parsing (Indonesian)

Pipeline: `SpeechRecognition(lang=id-ID)` → transcript → `parseVoice(text)`:

1. Type: contains `pengeluaran|keluar|bayar|beli` → `out`;
   `pemasukan|masuk|terima|iuran masuk` → `in`; default `out`.
2. Amount: digits with separators (`50.000`, `50 ribu`) and number words:
   `ribu`=1e3, `juta`=1e6, `ratus`=1e2, `puluh`=1e1, `belas`=+10,
   e.g. "lima puluh ribu" → 50 000; "dua juta lima ratus ribu" → 2 500 000.
   Implementation: tokenize Indonesian number words into a value with a
   small state machine (see `money.parseIndonesianAmount`).
3. Note: the transcript minus the amount phrase and type keywords,
   trimmed; category then suggested by the rule engine.
4. The parsed draft is shown in the form for confirmation (US-3.4) —
   voice never writes to the store directly.

## 6. Auto-categorization rules

Default rule table (keyword → category), all editable in Settings:

| Keyword | Category |
|---|---|
| listrik, pln, token | Listrik |
| air, pdam | Air |
| iuran, kas rt, warga | Iuran |
| donasi, sedekah, infak, infaq, zakat | Donasi |
| konsumsi, makan, minum, snack, kopi | Konsumsi |
| kebersihan, sampah, gotong royong | Kebersihan |
| keamanan, satpam, hansip | Keamanan |
| perbaikan, renovasi, pengecatan, tukang | Perbaikan |
| transport, bensin, ojek, parkir | Transport |
| fotokopi, print, atk | ATK |
| gaji, honor, upah | Honor |
| arisan | Arisan |

Matching: lowercase substring, first rule wins (rules are ordered),
no match → "Lainnya". Ordering matters: more specific keywords come
first — e.g. `fotokopi` before `kopi` (otherwise "fotokopi" would match
"kopi"), and short ambiguous keywords like `cat` are avoided entirely
(they would match "catatan").

## 7. Report & export

`computeTotals(txns, "YYYY-MM")` returns
`{ opening, in, out, closing, byCategory: {cat: {in, out}}, top: Tx[] }`.
Opening = balance of all transactions dated before the month.
WhatsApp text (`report.toWhatsAppText`):

```
👻 *LAPORAN KAS — Kas RT 05*
📅 November 2026
💰 Saldo awal: Rp 1.250.000
⬆️ Pemasukan: Rp 500.000
⬇️ Pengeluaran: Rp 350.000
💵 Saldo akhir: Rp 1.400.000
...
```

CSV (`report.toCsv`): header `tanggal,jenis,kategori,jumlah,catatan`,
RFC-4180 quoting, `\r\n` line endings, `BOM` for Excel compatibility.

## 8. Testing strategy

- **Unit tests** (`tests/unit.test.mjs`, plain `node:test`, no deps):
  money parsing (digits + words), categorization, merge, report totals,
  QR codec round-trip (incl. chunking, tamper rejection, old-version reject).
- **Browser smoke test** (`tests/smoke.mjs`, puppeteer-core + system
  Chromium): add/edit/delete, voice graceful-degrade, QR renders a
  decodable code, import merges, report + CSV correctness.
- **Hooks** run the unit tests + a syntax check on every file save
  (see `.kiro/hooks/`).

## 9. Risks & decisions

| Risk | Decision |
|---|---|
| QR capacity too small for a big kas | Chunking (US-5.2) + compact field names in payload |
| SpeechRecognition absent (Firefox/desktop) | Graceful degradation (US-3.3); parser still unit-tested |
| BarcodeDetector absent | Paste/file import always available; camera is enhancement |
| IndexedDB blocked (private mode) | In-memory fallback store with a visible warning banner |
| Judges open `file://` | App works; SW simply doesn't register — noted in README |
