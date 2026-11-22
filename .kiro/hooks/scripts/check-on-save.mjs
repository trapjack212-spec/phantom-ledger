#!/usr/bin/env node
/**
 * Hook script: check-on-save
 * Invoked by .kiro/hooks/check-on-save.json (PostFileSave).
 * Reads the Kiro hook event JSON from STDIN (contains the saved file path
 * when run by Kiro) or takes file paths as CLI arguments, so it is also
 * runnable by hand:  node .kiro/hooks/scripts/check-on-save.mjs src/app.js
 *
 * What it does:
 *  1. `node --check` syntax-checks every changed/arg JS file.
 *  2. Runs the unit test suite (fast, no deps).
 *  3. Fails (exit 1) with a readable message if anything breaks.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail(msg) {
  console.error(`[phantom-hook] FAIL: ${msg}`);
  process.exitCode = 1;
}

let files = process.argv.slice(2).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

// When Kiro runs the hook, event context arrives on STDIN as JSON.
if (files.length === 0 && !process.stdin.isTTY) {
  try {
    const stdin = readFileSync(0, "utf8").trim();
    if (stdin) {
      const evt = JSON.parse(stdin);
      const p = evt.filePath || evt.file_path || evt.path || "";
      if (p && (p.endsWith(".js") || p.endsWith(".mjs"))) files = [p];
    }
  } catch { /* no usable stdin — fall through to full check */ }
}

const targets = files.length > 0 ? files : ["src/money.js", "src/rules.js", "src/sync.js", "src/report.js", "src/voice.js", "src/store.js", "src/app.js", "sw.js", "tests/unit.test.mjs", "tests/smoke.mjs"];

for (const f of targets) {
  const r = spawnSync("node", ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) {
    fail(`syntax error in ${f}\n${r.stderr}`);
  } else {
    console.log(`[phantom-hook] syntax OK: ${f}`);
  }
}

const test = spawnSync("node", ["--test", "tests/unit.test.mjs"], { encoding: "utf8" });
process.stdout.write(test.stdout || "");
process.stderr.write(test.stderr || "");
if (test.status !== 0) {
  fail("unit tests failed — see output above");
} else {
  console.log("[phantom-hook] unit tests passed");
}
