# Steering — Product

Phantom Ledger is a bookkeeping PWA for Indonesian community treasurers
(RT, masjid, arisan, warung). The user is often non-technical, on a cheap
Android phone, offline half the time.

## Product principles

1. **No account, no server, no excuse.** If a feature needs a login or a
   backend, it does not ship. The QR code *is* the network.
2. **Offline is the default, not a mode.** Every feature must work with the
   network off. "Online" only ever means "nicer", never "required".
3. **Explainable beats clever.** Categorization is a visible rule table,
   not a black box. A bendahara must be able to answer "kenapa masuk
   Listrik?" by pointing at a rule.
4. **Voice never writes directly.** Speech produces a *draft* the user
   confirms. A misheard "lima puluh ribu" must never silently become a
   transaction.
5. **One source of truth for money.** All balances, reports, and CSVs go
   through `report.computeTotals`. Never recompute a balance inline in UI
   code.
6. **Bahasa Indonesia first.** UI strings in Indonesian; code comments and
   docs in English or Indonesian, but identifiers in English.
7. **Privacy is a feature, not a setting.** Zero network requests at
   runtime, zero analytics, zero third-party scripts. Say so in the UI
   (footer: "Data hanya di perangkat ini").

## Tone

- Friendly, a little spooky (👻 "hantu" = ghost — the ledger that haunts
  no server), never scary. Halloween theming is decoration, never at the
  cost of clarity.
- Error messages say what happened and what to do next, in Indonesian.
