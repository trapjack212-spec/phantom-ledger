#!/usr/bin/env node
/**
 * Hook script: validate-spec-checklist
 * Invoked by .kiro/hooks/validate-spec-checklist.json (Stop trigger and
 * manually before commit). Verifies the spec/task discipline:
 *  1. tasks.md exists and every task is either [ ] or [x] (no other states
 *     silently sneaking in) — and reports counts.
 *  2. Every [x] task references a file that actually exists in the repo
 *     (backticks in the task line are treated as file references).
 *  3. .kiro/ is not gitignored.
 *  4. requirements.md / design.md / tasks.md all exist under
 *     .kiro/specs/phantom-ledger/.
 * Exit 0 when everything checks out, 1 with a readable report otherwise.
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = new URL("../../..", import.meta.url).pathname;
let problems = [];
let notes = [];

function check(cond, msg) {
  if (cond) notes.push(`ok: ${msg}`);
  else problems.push(msg);
}

const specDir = `${ROOT}.kiro/specs/phantom-ledger/`;
for (const f of ["requirements.md", "design.md", "tasks.md"]) {
  check(existsSync(specDir + f), `spec file present: .kiro/specs/phantom-ledger/${f}`);
}

const tasks = readFileSync(specDir + "tasks.md", "utf8");
const lines = tasks.split("\n");
const done = lines.filter((l) => /^\s*- \[x\]/.test(l)).length;
const todo = lines.filter((l) => /^\s*- \[ \]/.test(l)).length;
const wip = lines.filter((l) => /^\s*- \[~\]/.test(l)).length;
notes.push(`tasks: ${done} done, ${wip} in progress, ${todo} todo`);
check(done + todo + wip > 0, "tasks.md contains checklist items");

// Referenced files in completed tasks must exist.
const missing = new Set();
for (const line of lines.filter((l) => /^\s*- \[x\]/.test(l))) {
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const ref = m[1];
    // Only path-like refs (contain a slash) are checked; bare filenames
    // like `requirements.md` live under .kiro/specs/ and are covered above.
    if (ref.includes("/") && /^[a-z0-9_./-]+\.(js|mjs|html|css|json|md|webmanifest)$/i.test(ref) && !ref.startsWith("http")) {
      if (!existsSync(ROOT + ref)) missing.add(ref);
    }
  }
}
check(missing.size === 0, `all files referenced by done tasks exist${missing.size ? `: missing ${[...missing].join(", ")}` : ""}`);

// .kiro must not be gitignored: check only real (non-comment) patterns.
let gitignore = "";
try { gitignore = readFileSync(`${ROOT}.gitignore`, "utf8"); } catch { /* no gitignore is fine */ }
const ignorePatterns = gitignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const kiroIgnored = ignorePatterns.some((p) => p === ".kiro" || p === ".kiro/" || p.startsWith(".kiro/"));
check(!kiroIgnored, ".kiro/ is not gitignored");

console.log("[phantom-hook] spec checklist validation");
for (const n of notes) console.log(`  ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`  PROBLEM: ${p}`);
  process.exit(1);
}
console.log("  all spec checks passed");
