// Headless-Chromium smoke test for Phantom Ledger.
// Run:  npm run smoke   (see package.json)  — or:
//   node tests/smoke.mjs [url]   (default http://localhost:8901/index.html)
// Requires puppeteer-core (dev-only, NOT a repo dependency) and a Chromium
// binary. Install once with:  npm install --no-save puppeteer-core
// Set CHROME_PATH or it defaults to /opt/meta-chromium/chrome.
// Serves the repo itself on :8901 if nothing answers there.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
let puppeteer;
const puppeteerCandidates = [
  process.env.PUPPETEER_CORE_PATH,
  "puppeteer-core",
  new URL("../node_modules/puppeteer-core", import.meta.url).pathname,
  "/tmp/smoke-test/node_modules/puppeteer-core",
].filter(Boolean);
for (const c of puppeteerCandidates) {
  try { puppeteer = require(c); break; } catch { /* next */ }
}
if (!puppeteer) {
  console.error("puppeteer-core not found. Run: npm install --no-save puppeteer-core");
  process.exit(2);
}
const JSQR_PATH = process.env.JSQR_PATH
  || (existsSync("/tmp/smoke-test/jsQR.js") ? "/tmp/smoke-test/jsQR.js" : null)
  || new URL("../node_modules/jsqr/dist/jsQR.js", import.meta.url).pathname;

const APP_URL = process.argv[2] || "http://localhost:8901/index.html";
const CHROME = process.env.CHROME_PATH || "/opt/meta-chromium/chrome";

let server = null;
async function ensureServer() {
  try {
    const r = await fetch(APP_URL, { method: "HEAD" });
    if (r.ok) return;
  } catch { /* start our own */ }
  server = spawn("python3", ["-m", "http.server", "8901", "--bind", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
  });
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(APP_URL, { method: "HEAD" });
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("static server did not come up");
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await ensureServer();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const consoleErrors = [];
const externalRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("request", (req) => {
  const u = req.url();
  if (!u.startsWith("http://localhost:8901") && !u.startsWith("http://127.0.0.1:8901") && !u.startsWith("data:") && !u.startsWith("blob:")) {
    externalRequests.push(u);
  }
});

try {
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(800);

  check("page loads with title", (await page.title()).includes("Phantom Ledger"), await page.title());
  check("no console/page errors on load", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("zero external network requests", externalRequests.length === 0, externalRequests.join(", "));
  check("balance card visible", await page.$eval("#balanceValue", (el) => el.textContent.includes("Rp")));

  // ---- CRUD: add ----
  const month = new Date().toISOString().slice(0, 7);
  await page.select("#txnType", "out");
  await page.type("#txnAmount", "50000");
  await page.type("#txnNote", "bayar listrik PLN");
  const cat = await page.$eval("#txnCategory", (el) => el.value);
  check("auto-category suggests Listrik", cat === "Listrik", `got ${cat}`);
  await page.click("#saveBtn");
  await sleep(500);
  const afterAdd = await page.$eval("#balanceValue", (el) => el.textContent);
  check("add expense updates balance", afterAdd.includes("50.000"), afterAdd);
  const listCount = await page.$$eval("#txnList .txn", (els) => els.length);
  check("transaction appears in list", listCount === 1, `${listCount} rows`);

  // add income
  await page.select("#txnType", "in");
  await page.evaluate(() => { document.querySelector("#txnAmount").value = ""; });
  await page.type("#txnAmount", "200000");
  await page.evaluate(() => { document.querySelector("#txnNote").value = ""; });
  await page.type("#txnNote", "iuran warga");
  await page.click("#saveBtn");
  await sleep(500);
  const afterIn = await page.$eval("#balanceValue", (el) => el.textContent);
  check("add income updates balance to 150.000", afterIn.includes("150.000"), afterIn);

  // persistence across reload (IndexedDB)
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(800);
  const afterReload = await page.$eval("#balanceValue", (el) => el.textContent);
  check("balance persists after reload (IndexedDB)", afterReload.includes("150.000"), afterReload);
  check("no console errors after reload", consoleErrors.length === 0, consoleErrors.join(" | "));

  // ---- edit ---- (list is newest-first: income row 0, expense row 1)
  await page.$$eval("#txnList .txn button[data-action='edit']", (btns) => btns[1].click());
  await sleep(300);
  await page.evaluate(() => { document.querySelector("#txnAmount").value = ""; });
  await page.type("#txnAmount", "60000");
  await page.click("#saveBtn");
  await sleep(500);
  const afterEdit = await page.$eval("#balanceValue", (el) => el.textContent);
  check("edit updates balance to 140.000", afterEdit.includes("140.000"), afterEdit);

  // ---- delete the expense (row 1) ----
  page.on("dialog", (d) => d.accept());
  await page.$$eval("#txnList .txn button[data-action='delete']", (btns) => btns[1].click());
  await sleep(500);
  const afterDel = await page.$eval("#balanceValue", (el) => el.textContent);
  check("delete updates balance to 200.000", afterDel.includes("200.000"), afterDel);

  // ---- voice graceful degradation / parser ----
  const voice = await page.evaluate(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const parsed = window.__phantom.parseVoice(
      "pengeluaran lima puluh ribu untuk listrik",
      window.__phantom.state.rules
    );
    return { hasSR: !!SR, btnDisabled: document.querySelector("#voiceBtn").disabled, parsed };
  });
  check("voice parser works on sample transcript", voice.parsed && voice.parsed.amount === 50000 && voice.parsed.category === "Listrik", JSON.stringify(voice.parsed));
  check("voice UI degrades gracefully without SR", !voice.hasSR ? voice.btnDisabled === true : true, `hasSR=${voice.hasSR} disabled=${voice.btnDisabled}`);

  // ---- QR export renders + decodes ----
  await page.evaluate(() => document.querySelector('[data-tab="sinkron"]').click());
  await sleep(200);
  await page.click("#exportBtn");
  await sleep(1200);
  const qrInfo = await page.evaluate(() => {
    const img = document.querySelector("#qrCode img");
    return { hasImg: !!img, src: img ? img.src.slice(0, 30) : "", meta: document.querySelector("#qrMeta").textContent };
  });
  check("QR code renders", qrInfo.hasImg, qrInfo.meta);

  // Decode the rendered QR with jsQR (injected from disk).
  await page.addScriptTag({ path: JSQR_PATH });
  const decoded = await page.evaluate(async () => {
    const img = document.querySelector("#qrCode img");
    const bmp = await createImageBitmap(img);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const res = jsQR(data.data, data.width, data.height);
    return res ? res.data : null;
  });
  check("rendered QR decodes to a PL1 chunk", typeof decoded === "string" && decoded.startsWith("PL1.0."), decoded ? decoded.slice(0, 40) : "null");

  // Round-trip: decode chunk(s) in-page via the app's own codec.
  const chunks = await page.evaluate(() => window.__phantom.state.exportChunks);
  check("export produced chunk(s)", Array.isArray(chunks) && chunks.length >= 1, `${chunks?.length} chunk(s)`);

  // ---- import merge in a SECOND (fresh) browser context ----
  const ctx2 = await browser.createBrowserContext();
  const page2 = await ctx2.newPage();
  await page2.setViewport({ width: 390, height: 844 });
  await page2.goto(APP_URL, { waitUntil: "networkidle0" });
  await sleep(800);
  await page2.evaluate((ch) => {
    document.querySelector('[data-tab="sinkron"]').click();
    document.querySelector("#importText").value = ch.join("\n");
  }, chunks);
  await page2.click("#importPasteBtn");
  await sleep(800);
  const summary = await page2.$eval("#importSummary", (el) => el.textContent);
  check("import preview shows summary", summary.includes("baru"), summary);
  await page2.click("#importConfirmBtn");
  await sleep(600);
  const balance2 = await page2.$eval("#balanceValue", (el) => el.textContent);
  check("imported data merges into fresh device (balance 200.000)", balance2.includes("200.000"), balance2);

  // ---- report + CSV (in page2) ----
  await page2.evaluate(() => document.querySelector('[data-tab="laporan"]').click());
  await sleep(400);
  const reportText = await page2.$eval("#reportText", (el) => el.textContent);
  check("monthly report shows closing 200.000", reportText.includes("Saldo akhir: Rp 200.000"), reportText.split("\n").slice(0, 6).join(" | "));
  const csv = await page2.evaluate(async () => {
    const mod = await import("/src/report.js");
    const txns = window.__phantom.state.transactions;
    const m = new Date().toISOString().slice(0, 7);
    return mod.toCsv(txns, m);
  });
  check("CSV export has header + 1 row", csv.includes("tanggal,jenis,kategori,jumlah,catatan") && csv.includes("pemasukan"), csv.split("\r\n").slice(0, 3).join(" | "));

  // ---- offline: service worker serves the app ----
  await page2.setOfflineMode(true);
  await page2.reload({ waitUntil: "domcontentloaded" });
  await sleep(1000);
  const offlineTitle = await page2.title();
  check("app loads offline (service worker)", offlineTitle.includes("Phantom Ledger"), offlineTitle);
  await page2.setOfflineMode(false);

  // screenshots for the demo
  await page2.evaluate(() => document.querySelector('[data-tab="catat"]').click());
  await sleep(400);
  await page2.screenshot({ path: "tests/smoke-shots/01-catat.png" });
  await page2.evaluate(() => document.querySelector('[data-tab="sinkron"]').click());
  await sleep(400);
  await page2.screenshot({ path: "tests/smoke-shots/03-sinkron-qr.png" });
  await page2.evaluate(() => document.querySelector('[data-tab="laporan"]').click());
  await sleep(400);
  await page2.screenshot({ path: "tests/smoke-shots/04-laporan.png" });
  await page.evaluate(() => document.querySelector('[data-tab="suara"]').click());
  await sleep(400);
  await page.screenshot({ path: "tests/smoke-shots/02-suara.png" });
} catch (err) {
  check("smoke test completed without exception", false, String(err && err.stack || err));
} finally {
  await browser.close();
  if (server) server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
