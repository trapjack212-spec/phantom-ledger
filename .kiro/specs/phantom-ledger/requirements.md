# Phantom Ledger — Requirements

> Kiroween 2026 · Category: **Frankenstein** · Entry: `phantom-ledger`
> A serverless, account-free bookkeeping PWA for community treasurers
> (Indonesian RT, masjid, arisan, small shops).
> Language of the product UI: Bahasa Indonesia (primary), with English
> labels where they aid judges. Currency: IDR.
> Status: draft → approved by builder (2026-11-22). All requirements below
> are the contract the implementation is checked against.

## Glossary

- **Bendahara** — community treasurer, the primary user. Often non-technical,
  often on a low-end Android phone, often offline.
- **Kas** — a cash book: one ledger (e.g. "Kas RT 05", "Kas Masjid Al-Ikhlas").
- **Transaksi** — one money movement: pemasukan (income) or pengeluaran (expense).
- **Sinkronisasi hantu ("phantom sync")** — device-to-device sync with no
  server and no account: one device shows a QR code, the other scans it.
- **Kategori** — expense/income bucket (e.g. Iuran, Donasi, Listrik, Konsumsi).

## User stories

### US-1 — First run needs nothing (account-free, offline-first)
As a bendahara, I can open the app and immediately start recording money,
with no sign-up, no login, no server, and no network.
- AC-1.1: First paint works with the network disabled (all assets local).
- AC-1.2: No credential, email, or phone number is ever requested.
- AC-1.3: A default kas ("Kas RT 05") exists on first run; the name is editable.
- AC-1.4: The app is installable as a PWA (manifest + service worker) and
  works after the browser is closed and reopened.

### US-2 — Record a transaction (CRUD)
As a bendahara, I can add, edit, and delete pemasukan/pengeluaran with
amount, date, category, and note, and see the running balance.
- AC-2.1: Add form validates: amount > 0, date present, type present.
- AC-2.2: Balance = sum(pemasukan) − sum(pengeluaran), shown in IDR format.
- AC-2.3: Editing a transaction updates totals immediately; deleting asks
  for confirmation and updates totals immediately.
- AC-2.4: Transactions persist in IndexedDB and survive reload.
- AC-2.5: List is newest-first, filterable by month and by type.

### US-3 — Voice entry in Indonesian
As a bendahara whose hands are busy, I can tap the microphone and say
e.g. *"pengeluaran lima puluh ribu untuk listrik"* and get a pre-filled form.
- AC-3.1: Uses the Web Speech API (`SpeechRecognition`, lang `id-ID`).
- AC-3.2: Parser extracts: type (masuk/keluar keywords), amount
  (digits and Indonesian number words: ribu, juta, ratus, puluh, belas),
  and the remainder as the note.
- AC-3.3: When the browser has no SpeechRecognition or no microphone,
  the UI says so plainly and the manual form still works (graceful
  degradation — never a dead button or a crash).
- AC-3.4: Parsed result is shown for confirmation before saving; the user
  can correct any field.

### US-4 — Rule-based auto-categorization
As a bendahara, when I type a note like "bayar listrik PLN", the category
is suggested automatically so I don't have to pick it every time.
- AC-4.1: A transparent rule table (keyword → category) ships with the app
  and is visible/editable in Settings.
- AC-4.2: Matching is case-insensitive substring match on the note;
  first matching rule wins; no match → category "Lainnya".
- AC-4.3: The suggested category is shown in the form and can be overridden.
- AC-4.4: Adding a custom rule takes effect immediately for new entries.

### US-5 — QR sync with no server ("phantom sync")
As a bendahara with two phones (or a successor treasurer), I can move the
whole kas from one device to another by showing a QR code on one and
scanning it on the other — no account, no server, no cable.
- AC-5.1: Export encodes the full kas (transactions + rules + kas meta) as
  a compact, versioned JSON payload, gzip-compressed and base64url-encoded,
  rendered as a QR code on screen.
- AC-5.2: Payloads that exceed one QR code's capacity are split into
  numbered chunks (`part i/n`); the importer reassembles them in any order.
- AC-5.3: Import merges by transaction `id`: identical ids are de-duplicated,
  newer `updatedAt` wins on conflict, `deletedAt` tombstones propagate.
- AC-5.4: Import shows a summary (added / updated / skipped / deleted)
  before the user confirms the merge.
- AC-5.5: Import also works by pasting the payload text or uploading a
  `.phantom.json` file (camera scanning is a progressive enhancement).
- AC-5.6: A corrupt, truncated, or wrong-version payload is rejected with a
  clear error and nothing is written.

### US-6 — Monthly report for WhatsApp + CSV export
As a bendahara, at month's end I can produce a report I can paste straight
into the RT WhatsApp group, and a CSV for my own archive.
- AC-6.1: Report covers a chosen month: opening balance, total in, total out,
  closing balance, per-category totals, and the 10 largest transactions.
- AC-6.2: Report text is formatted for WhatsApp (plain text, emoji section
  markers, IDR formatting) with a one-tap copy button.
- AC-6.3: CSV export contains all transactions of the month with headers
  `tanggal,jenis,kategori,jumlah,catatan` and downloads as a file.
- AC-6.4: Report numbers always equal the numbers computed from the stored
  transactions (single source of truth — one totals function).

### US-7 — Privacy & safety
As a bendahara handling neighbours' money, my data never leaves my device
except when I deliberately show a QR code or export a file.
- AC-7.1: Zero network requests at runtime (verified: no fetch/XHR/beacon).
- AC-7.2: No analytics, no tracking, no third-party scripts.
- AC-7.3: All code is original; the only third-party code is vendored,
  MIT-licensed libraries listed in `THIRD-PARTY-NOTICES.md`.

## Non-functional requirements

- NFR-1: No build step. `index.html` + `src/*.js` + `src/*.css`, runnable by
  opening the file or serving the folder with any static server.
- NFR-2: Works on Chrome/Android and desktop Chrome; degrades gracefully
  where an API is missing (Speech, BarcodeDetector, clipboard).
- NFR-3: Payload format is versioned (`v:1`); a future `v:2` reader must
  reject-or-migrate explicitly, never silently misread.
- NFR-4: The repo contains a genuine `.kiro/` tree (specs, steering, hooks)
  that is committed — never gitignored.
- NFR-5: Automated checks exist and pass: unit tests for the pure functions
  (money parsing, categorization, merge, report, QR payload codec) and a
  headless-browser smoke test (CRUD, QR render, import merge, report, CSV).

## Out of scope (explicitly)

- Multi-user accounts, cloud backup, or any server component.
- Real payments, bank integration, or real funds.
- OCR of receipts, AI/LLM categorization (rules only — transparent by design).
- Native mobile apps (PWA only).
