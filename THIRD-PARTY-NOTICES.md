# Third-Party Notices

Phantom Ledger is original code (MIT, see `LICENSE`), with one vendored
library exception. No runtime network calls are made to any third party.

## qrcode-generator 1.4.4 (MIT)

- File: `src/qrcode.min.js`
- Source: https://github.com/kazuhikoarase/qrcode-generator
  (vendored from the jsDelivr copy of the 1.4.4 release)
- License: MIT — Copyright (c) 2012 Kazuhiko Arase
- Used for: QR-code *encoding* only (rendering export chunks as QR images).
- No other third-party code ships in the app. Dev-only test tooling
  (puppeteer-core, jsQR) is not bundled and is not a runtime dependency.
