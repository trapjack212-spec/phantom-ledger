// Demo screenshot script — seeds realistic demo data through the real UI
// and captures the four hero shots for the demo video / storyboard.
// Run: node demo/shots.mjs   (needs puppeteer-core; see tests/smoke.mjs)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let puppeteer;
for (const c of ["puppeteer-core", "/tmp/smoke-test/node_modules/puppeteer-core"]) {
  try { puppeteer = require(c); break; } catch { /* next */ }
}
if (!puppeteer) { console.error("puppeteer-core not found"); process.exit(2); }

const APP_URL = process.argv[2] || "http://localhost:8901/index.html";
const CHROME = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { spawn } from "node:child_process";
let server = null;
try {
  const r = await fetch(APP_URL, { method: "HEAD" });
  if (!r.ok) throw new Error("no server");
} catch {
  server = spawn("python3", ["-m", "http.server", "8901", "--bind", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname, stdio: "ignore",
  });
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(APP_URL, { method: "HEAD" }); if (r.ok) break; } catch {}
    await sleep(300);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(APP_URL, { waitUntil: "networkidle0" });
await sleep(800);

const demoTxns = [
  { type: "in", amount: "2500000", note: "iuran warga november" },
  { type: "in", amount: "500000", note: "donasi masjid" },
  { type: "out", amount: "175000", note: "bayar listrik PLN" },
  { type: "out", amount: "85000", note: "konsumsi rapat RT" },
  { type: "out", amount: "120000", note: "bayar air PDAM" },
  { type: "out", amount: "45000", note: "fotokopi undangan" },
];
for (const t of demoTxns) {
  await page.select("#txnType", t.type);
  await page.evaluate(() => { document.querySelector("#txnAmount").value = ""; });
  await page.type("#txnAmount", t.amount);
  await page.evaluate(() => { document.querySelector("#txnNote").value = ""; });
  await page.type("#txnNote", t.note);
  await page.click("#saveBtn");
  await sleep(450);
}
// Show the newest month filter (current month) — default already.
await page.screenshot({ path: "demo/screenshots/01-catat.png" });

// Voice tab with a filled draft (via the real parser, no mic needed).
await page.evaluate(() => document.querySelector('[data-tab="suara"]').click());
await sleep(300);
await page.evaluate(() => {
  const draft = window.__phantom.parseVoice("pengeluaran lima puluh ribu untuk listrik", window.__phantom.state.rules);
  window.__phantom.state.voiceDraft = draft;
  document.querySelector("#voiceTranscript").textContent = `“${draft.transcript}”`;
  document.querySelector("#draftType").textContent = "⬇️ Pengeluaran";
  document.querySelector("#draftAmount").textContent = "Rp 50.000";
  document.querySelector("#draftCategory").textContent = draft.category;
  document.querySelector("#draftNote").textContent = draft.note;
  document.querySelector("#voiceDraft").hidden = false;
  document.querySelector("#voiceStatus").textContent = "Periksa draft di bawah, lalu simpan.";
});
await page.screenshot({ path: "demo/screenshots/02-suara.png" });

// QR export tab.
await page.evaluate(() => document.querySelector('[data-tab="sinkron"]').click());
await sleep(200);
await page.click("#exportBtn");
await sleep(1200);
await page.screenshot({ path: "demo/screenshots/03-sinkron-qr.png" });

// Report tab.
await page.evaluate(() => document.querySelector('[data-tab="laporan"]').click());
await sleep(400);
await page.screenshot({ path: "demo/screenshots/04-laporan.png" });

console.log("demo screenshots written");
await browser.close();
if (server) server.kill();
