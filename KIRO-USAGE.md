# KIRO-USAGE.md — How Kiro Was Used (honest account)

Phantom Ledger was built for Kiroween 2026 (Frankenstein) as a
**spec-driven** project. This file says plainly what Kiro did, what it
didn't, and what shaped the build — because the judges ask, and because
faking tool usage would be worse than admitting a gap.

## What actually happened

### 1. Kiro CLI — installed and verified, but NOT used agentically

- The official installer was run headlessly in the sandbox:
  `curl https://desktop-release.q.us-east-1.amazonaws.com/latest/kirocli-x86_64-linux.zip`,
  SHA-256 verified (`kirocli.zip: OK`), `./kirocli/install.sh`.
- Result: **`kiro-cli 3.5.0`** installed at `~/.local/bin/kiro-cli`,
  `--version` and `--help` work.
- But: `kiro-cli whoami` → **"Not logged in"**, and
  `kiro-cli chat --no-interactive "…"` → **"Not logged in. Set the
  KIRO_API_KEY environment variable or run `kiro-cli login` first."**
- There was no Builder ID, no API key, and no interactive browser login
  available in the sandbox — and no credential was requested or entered.
  So the CLI's agentic chat, spec generation, and Crew features were
  **never run**. The CLI install is genuine; the agentic use is not
  claimed.

### 2. Spec-driven development — the real process, done by hand in Kiro format

Because the CLI agent couldn't run, the spec workflow was executed
manually, following Kiro's documented spec structure exactly:

1. **Requirements first** (`.kiro/specs/phantom-ledger/requirements.md`):
   7 user stories (US-1…US-7) with acceptance criteria, plus NFRs and an
   explicit out-of-scope list. Every feature decision traces to a story.
2. **Design second** (`design.md`): architecture, data model, the QR sync
   protocol (`PL1.i.n` envelope, chunking, merge rules), the Indonesian
   voice parser, the rule table, the report format, and a risks table.
   The design caught real issues before code existed — e.g. QR capacity
   forcing chunking, and SpeechRecognition needing graceful degradation.
3. **Tasks third** (`tasks.md`): 31 tasks in build order across 6 phases.
   Implementation followed that order, and tasks were checked off only
   after their acceptance criteria passed (unit tests first, then the
   browser smoke test). This is the opposite of vibe coding: the two test
   failures found along the way (Indonesian "puluh" math, gzip making the
   chunking test vacuous) were caught by tests the spec demanded, not by
   eyeballing the UI.

Compared with vibe coding: the spec forced the hard decisions up front
(merge semantics, payload versioning, tombstones, the single totals
function) instead of discovering them mid-build. The app is smaller and
more consistent for it — one `computeTotals` feeds balance, report, and
CSV, because the design said so before any UI existed.

### 3. Steering — three docs that actually constrained the build

`.kiro/steering/` holds `product.md`, `tech.md`, `structure.md`. Their
concrete effects:

- **product.md** ("voice never writes directly", "explainable beats
  clever") → the voice draft confirmation screen, and rules instead of
  any ML categorization.
- **tech.md** ("pure core, thin shell"; "no runtime network call") → the
  five pure modules (`money`, `rules`, `sync`, `report`, `voice`) contain
  no DOM and no IndexedDB, so they run under plain `node:test`; the smoke
  test asserts zero external requests.
- **structure.md** → file layout, the rule that pure modules stay
  Node-importable, and that `.kiro/` is never gitignored.

### 4. Hooks — real configs + real scripts, verified by running them

`.kiro/hooks/` (schema per the Kiro docs page for hooks, `version: "v1"`):

- `check-on-save.json` — `PostFileSave`, matcher `\.(js|mjs)$` → runs
  `.kiro/hooks/scripts/check-on-save.mjs`: `node --check` on the changed
  file(s) + the unit suite. Verified by running it directly.
- `validate-spec-checklist.json` — `Stop` trigger → runs
  `validate-spec-checklist.mjs`: spec files exist, done tasks reference
  files that really exist, `.kiro/` is not gitignored. Plus a `PreToolUse`
  **agent** action reminding the agent to check `tasks.md` order before
  writing new features. Verified by running it directly (it caught a
  real bug in its own file matcher during the build, which was fixed).

These hooks were exercised from the shell, not from inside a Kiro IDE
session — the scripts are the working automation; the JSON is the Kiro
wiring that will fire them when the repo is opened in Kiro IDE/CLI.

### 5. MCP, Crew, custom agents, powers, PBT — NOT used

- No MCP server was connected (nothing in this build needed external
  data; the app is deliberately network-free).
- No Kiro Crew session was run (single-builder project, CLI login blocked).
- No custom agents, no Kiro powers, no property-based testing.
  The test story is unit tests + a headless-browser smoke test, both
  documented in `design.md` §8 and both green.

## What the user still needs to do in Kiro

To get the full Kiro experience on this repo: `kiro-cli login` (or set
`KIRO_API_KEY`), open the repo in Kiro IDE/CLI, and the `.kiro/` tree —
specs, steering, hooks — activates automatically. The hooks and steering
are written to work there without changes.

## Bottom line

Kiro shaped this build through its **method** (spec → design → tasks →
hooks → steering) more than through its **agent**: the CLI is installed
and real, the spec discipline is real, the hooks run — but no agentic
Kiro session wrote this code, because login wasn't available in the
sandbox. That limitation is stated here rather than hidden.
