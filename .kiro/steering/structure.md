# Steering — Code Structure

```
phantom-ledger/
├── index.html                  # PWA shell, loads src/app.js as a module
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # cache-first service worker
├── src/
│   ├── money.js                # IDR format + Indonesian number-word parsing
│   ├── rules.js                # auto-categorization rule table
│   ├── sync.js                 # QR payload codec (PL1 envelope) + merge
│   ├── report.js               # totals, WhatsApp text, CSV
│   ├── voice.js                # voice transcript → draft transaction
│   ├── store.js                # IndexedDB wrapper (+ memory fallback)
│   ├── qrcode.min.js           # vendored MIT QR encoder (not our code)
│   ├── app.js                  # UI wiring only
│   └── styles.css              # dark "phantom" theme
├── tests/
│   ├── unit.test.mjs           # node:test, pure core
│   └── smoke.mjs               # headless-Chromium end-to-end
├── demo/                       # video script, screenshots, demo video
├── .kiro/
│   ├── specs/phantom-ledger/   # requirements.md, design.md, tasks.md
│   ├── steering/               # product.md, tech.md, structure.md
│   └── hooks/                  # *.json hook configs + scripts/
├── README.md
├── KIRO-USAGE.md
├── THIRD-PARTY-NOTICES.md
└── LICENSE (MIT)
```

## Rules

- The spec is the plan: implement in `tasks.md` order; check a task off
  only after its acceptance criteria pass.
- `src/*.js` pure modules must stay importable by Node (`node --check`
  passes, no browser globals at import time).
- Keep files small and single-purpose; if a file passes ~400 lines, split it.
- No `console.log` left in shipped code (errors via `console.error` only).
- `.kiro/` is committed and must never appear in `.gitignore`.
