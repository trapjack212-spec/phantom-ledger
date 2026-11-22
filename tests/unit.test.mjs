// Unit tests for the pure core — run with: node --test tests/unit.test.mjs
// No dependencies. Covers money, rules, sync codec + merge, report, voice.
import test from "node:test";
import assert from "node:assert/strict";
import { formatIDR, parseIndonesianAmount } from "../src/money.js";
import { defaultRules, suggestCategory } from "../src/rules.js";
import { encodeExport, decodeChunks, mergeTransactions, buildExportPayload } from "../src/sync.js";
import { computeTotals, toWhatsAppText, toCsv, monthName } from "../src/report.js";
import { parseVoice } from "../src/voice.js";

const rules = defaultRules();
const tx = (over = {}) => ({
  id: "t1", kasId: "kas-rt05", type: "out", amount: 50000,
  date: "2026-11-05", category: "Listrik", note: "bayar listrik",
  createdAt: 1000, updatedAt: 1000, deletedAt: null, ...over,
});

// ---- money ----
test("formatIDR formats with dots", () => {
  assert.equal(formatIDR(50000), "Rp 50.000");
  assert.equal(formatIDR(1250000), "Rp 1.250.000");
  assert.equal(formatIDR(0), "Rp 0");
});

test("parseIndonesianAmount: digits", () => {
  assert.equal(parseIndonesianAmount("50.000"), 50000);
  assert.equal(parseIndonesianAmount("1.250.000"), 1250000);
  assert.equal(parseIndonesianAmount("50 ribu"), 50000);
  assert.equal(parseIndonesianAmount("2,5 juta"), 2500000);
  assert.equal(parseIndonesianAmount("Rp 75000"), 75000);
});

test("parseIndonesianAmount: number words", () => {
  assert.equal(parseIndonesianAmount("lima puluh ribu"), 50000);
  assert.equal(parseIndonesianAmount("dua juta lima ratus ribu"), 2500000);
  assert.equal(parseIndonesianAmount("seratus ribu"), 100000);
  assert.equal(parseIndonesianAmount("tiga belas ribu"), 13000);
  assert.equal(parseIndonesianAmount("satu juta dua ratus lima puluh ribu"), 1250000);
  assert.equal(parseIndonesianAmount("sepuluh ribu"), 10000);
  assert.equal(parseIndonesianAmount("dua puluh lima ribu"), 25000);
  assert.equal(parseIndonesianAmount("tidak ada angka"), null);
});

// ---- rules ----
test("suggestCategory matches keywords, first rule wins", () => {
  assert.equal(suggestCategory("bayar listrik PLN", rules), "Listrik");
  assert.equal(suggestCategory("BAYAR AIR PDAM", rules), "Air");
  assert.equal(suggestCategory("iuran warga bulan november", rules), "Iuran");
  assert.equal(suggestCategory("beli kopi untuk rapat", rules), "Konsumsi");
  assert.equal(suggestCategory("fotokopi undangan", rules), "ATK"); // "kopi" inside "fotokopi" must not win
  assert.equal(suggestCategory("catatan rapat", rules), "Lainnya"); // "cat" must not match "catatan"
  assert.equal(suggestCategory("hal tidak dikenal", rules), "Lainnya");
  assert.equal(suggestCategory("", rules), "Lainnya");
});

// ---- sync codec ----
test("sync codec round-trips small and large payloads", async () => {
  const payload = buildExportPayload({
    kas: { id: "kas-rt05", name: "Kas RT 05" },
    transactions: [tx(), tx({ id: "t2", amount: 100000, date: "2026-11-06", note: "iuran warga" })],
    rules,
  });
  const chunks = await encodeExport(payload);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks[0].startsWith("PL1.0."));
  // shuffled order must still decode
  const decoded = await decodeChunks([...chunks].reverse());
  assert.equal(decoded.kas.name, "Kas RT 05");
  assert.equal(decoded.transactions.length, 2);
  assert.equal(decoded.transactions[0].note, "bayar listrik");
});

test("sync codec chunks a big payload and rejects incomplete sets", async () => {
  // Notes carry pseudo-random hex (LCG) so gzip cannot collapse the payload.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff).toString(16);
  const many = Array.from({ length: 400 }, (_, i) => tx({ id: `big-${i}`, note: `transaksi ${i} ${rnd()} ${rnd()} untuk kas RT`, amount: 1000 + i }));
  const payload = buildExportPayload({ kas: { id: "k", name: "K" }, transactions: many, rules: [] });
  const chunks = await encodeExport(payload);
  assert.ok(chunks.length > 1, `expected chunking, got ${chunks.length} chunk(s)`);
  await assert.rejects(() => decodeChunks(chunks.slice(0, -1)), /belum lengkap/);
  const decoded = await decodeChunks(chunks);
  assert.equal(decoded.transactions.length, 400);
});

test("sync codec rejects tampered and wrong-version payloads", async () => {
  const payload = buildExportPayload({ kas: { id: "k", name: "K" }, transactions: [tx()], rules: [] });
  const chunks = await encodeExport(payload);
  // tamper with the body
  const bad = chunks[0].slice(0, -4) + "AAAA";
  await assert.rejects(() => decodeChunks([bad]), /rusak|tidak valid|tidak dikenali/);
  // wrong magic
  await assert.rejects(() => decodeChunks(["XX1.0.1.aaaa"]), /tidak dikenali/);
  // wrong version inside JSON (crafted plain payload)
  const wrong = { v: 99, kind: "phantom-ledger/export", kas: { id: "k", name: "K" }, transactions: [], rules: [] };
  const plain = "PL0.0.1." + Buffer.from(JSON.stringify(wrong)).toString("base64url");
  await assert.rejects(() => decodeChunks([plain]), /Versi payload/);
});

// ---- merge ----
test("mergeTransactions: insert, update-wins, skip-stale, tombstone", () => {
  const local = [tx(), tx({ id: "t2", amount: 1000, updatedAt: 2000 })];
  const incoming = [
    tx({ id: "t3", amount: 7000, updatedAt: 3000 }),           // insert
    tx({ id: "t2", amount: 2000, updatedAt: 3000 }),           // update (newer)
    tx({ id: "t1", amount: 999, updatedAt: 500 }),             // skip (stale)
    tx({ id: "t2", amount: 2000, updatedAt: 4000, deletedAt: 4000 }), // tombstone wins
  ];
  const r = mergeTransactions(local, incoming);
  assert.equal(r.inserted, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.tombstoned, 1);
  const t2 = r.merged.find((t) => t.id === "t2");
  assert.equal(t2.deletedAt, 4000);
});

// ---- report ----
test("computeTotals: opening/in/out/closing and categories", () => {
  const all = [
    tx({ id: "a", date: "2026-10-20", type: "in", amount: 1000000, category: "Iuran" }),
    tx({ id: "b", date: "2026-10-25", type: "out", amount: 200000, category: "Listrik" }),
    tx({ id: "c", date: "2026-11-02", type: "in", amount: 500000, category: "Iuran" }),
    tx({ id: "d", date: "2026-11-03", type: "out", amount: 50000, category: "Listrik" }),
    tx({ id: "e", date: "2026-11-04", type: "out", amount: 30000, category: "Listrik", deletedAt: 9999 }),
  ];
  const t = computeTotals(all, "2026-11");
  assert.equal(t.opening, 800000);
  assert.equal(t.in, 500000);
  assert.equal(t.out, 50000);
  assert.equal(t.closing, 1250000);
  assert.equal(t.count, 2); // tombstone excluded
  assert.equal(t.byCategory["Listrik"].out, 50000);
  assert.equal(monthName("2026-11"), "November 2026");
});

test("toWhatsAppText and toCsv agree with totals", () => {
  const all = [tx({ id: "a", date: "2026-11-02", type: "in", amount: 500000, category: "Iuran", note: "iuran warga" })];
  const t = computeTotals(all, "2026-11");
  const text = toWhatsAppText("Kas RT 05", "2026-11", t);
  assert.match(text, /Saldo akhir: Rp 500\.000/);
  assert.match(text, /November 2026/);
  const csv = toCsv(all, "2026-11");
  assert.ok(csv.startsWith("\uFEFFtanggal,jenis,kategori,jumlah,catatan"));
  assert.match(csv, /2026-11-02,pemasukan,Iuran,500000,iuran warga/);
});

// ---- voice ----
test("parseVoice: Indonesian transcripts", () => {
  const r1 = parseVoice("pengeluaran lima puluh ribu untuk listrik", rules);
  assert.equal(r1.type, "out");
  assert.equal(r1.amount, 50000);
  assert.equal(r1.category, "Listrik");
  assert.match(r1.note, /listrik/i);

  const r2 = parseVoice("pemasukan dua juta lima ratus ribu iuran warga", rules);
  assert.equal(r2.type, "in");
  assert.equal(r2.amount, 2500000);
  assert.equal(r2.category, "Iuran");

  const r3 = parseVoice("bayar token listrik 100000", rules);
  assert.equal(r3.amount, 100000);
  assert.equal(r3.category, "Listrik");

  const bad = parseVoice("halo apa kabar", rules);
  assert.ok(bad.error);
  assert.equal(parseVoice("", rules).error.includes("Tidak ada suara"), true);
});
