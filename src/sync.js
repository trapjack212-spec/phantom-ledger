// sync.js — "phantom sync": QR payload codec + merge. Pure module.
// Payload: versioned JSON -> gzip -> base64url, split into PL1.i.n chunks.
// No DOM, no IndexedDB. Works in Node (tests) and the browser.

export const SYNC_MAGIC = "PL1";
export const SYNC_MAGIC_PLAIN = "PL0"; // uncompressed fallback envelope
export const SYNC_VERSION = 1;
export const CHUNK_SIZE = 1800; // base64url chars per QR chunk (conservative)

function b64urlEncode(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gzip(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  if (typeof DecompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Validate the shape of a decoded export payload. Throws on bad shape. */
export function validatePayload(p) {
  if (!p || typeof p !== "object") throw new Error("Payload bukan objek JSON.");
  if (p.v !== SYNC_VERSION) throw new Error(`Versi payload ${p.v} tidak didukung (harapkan v${SYNC_VERSION}).`);
  if (p.kind !== "phantom-ledger/export") throw new Error("Jenis payload bukan ekspor Phantom Ledger.");
  if (!Array.isArray(p.transactions)) throw new Error("Payload tidak berisi daftar transaksi.");
  if (!p.kas || typeof p.kas.id !== "string") throw new Error("Payload tidak berisi info kas.");
  for (const tx of p.transactions) {
    if (typeof tx.id !== "string" || typeof tx.amount !== "number" || tx.amount <= 0) {
      throw new Error("Transaksi di dalam payload rusak.");
    }
    if (tx.type !== "in" && tx.type !== "out") throw new Error("Jenis transaksi di dalam payload rusak.");
  }
  return p;
}

/**
 * Encode an export object into QR-ready chunks: ["PL1.0.3.<b64>", ...].
 * Uses gzip when available, otherwise the PL0 plain envelope.
 */
export async function encodeExport(payload) {
  validatePayload(payload);
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const gz = await gzip(json);
  const magic = gz ? SYNC_MAGIC : SYNC_MAGIC_PLAIN;
  const body = b64urlEncode(gz || json);
  const chunks = [];
  for (let i = 0; i < body.length; i += CHUNK_SIZE) {
    chunks.push(body.slice(i, i + CHUNK_SIZE));
  }
  const n = chunks.length;
  return chunks.map((c, i) => `${magic}.${i}.${n}.${c}`);
}

/**
 * Decode a set of chunk strings (any order) back into the payload object.
 * Throws a clear error on: bad magic, missing parts, bad base64, bad gzip,
 * bad JSON, wrong version, or wrong shape.
 */
export async function decodeChunks(chunkStrings) {
  if (!chunkStrings || chunkStrings.length === 0) {
    throw new Error("Tidak ada bagian QR yang diterima.");
  }
  let magic = null;
  let total = null;
  const parts = new Map();
  for (const raw of chunkStrings) {
    const s = String(raw).trim();
    const m = s.match(/^(PL[01])\.(\d+)\.(\d+)\.(.+)$/s);
    if (!m) throw new Error("Format QR tidak dikenali. Pastikan memindai kode Phantom Ledger.");
    const [, mg, idx, n, body] = m;
    if (magic === null) { magic = mg; total = Number(n); }
    if (mg !== magic) throw new Error("Bagian QR berasal dari ekspor yang berbeda.");
    if (Number(n) !== total) throw new Error("Jumlah bagian QR tidak konsisten.");
    if (parts.has(Number(idx))) continue;
    parts.set(Number(idx), body);
  }
  if (parts.size !== total) {
    const missing = [];
    for (let i = 0; i < total; i++) if (!parts.has(i)) missing.push(i + 1);
    throw new Error(`Bagian QR belum lengkap. Kurang bagian: ${missing.join(", ")} dari ${total}.`);
  }
  const body = Array.from({ length: total }, (_, i) => parts.get(i)).join("");
  let bytes;
  try {
    bytes = b64urlDecode(body);
  } catch {
    throw new Error("Isi QR rusak (base64 tidak valid).");
  }
  let jsonBytes = bytes;
  if (magic === SYNC_MAGIC) {
    try {
      jsonBytes = await gunzip(bytes);
    } catch {
      throw new Error("Isi QR rusak (kompresi tidak valid).");
    }
    if (!jsonBytes) throw new Error("Perangkat ini tidak mendukung dekompresi gzip.");
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new Error("Isi QR rusak (JSON tidak valid).");
  }
  return validatePayload(payload);
}

/**
 * Merge incoming transactions into the local list (last-writer-wins per id).
 * Tombstones (deletedAt set) win over live records with an older updatedAt.
 * Returns { merged, inserted, updated, skipped, tombstoned }.
 * Pure: does not mutate inputs.
 */
export function mergeTransactions(local, incoming) {
  const byId = new Map(local.map((t) => [t.id, t]));
  let inserted = 0, updated = 0, skipped = 0, tombstoned = 0;
  for (const tx of incoming) {
    const cur = byId.get(tx.id);
    if (!cur) {
      byId.set(tx.id, tx);
      if (tx.deletedAt) tombstoned++; else inserted++;
    } else if ((tx.updatedAt || 0) > (cur.updatedAt || 0)) {
      byId.set(tx.id, tx);
      if (tx.deletedAt) tombstoned++; else updated++;
    } else {
      skipped++;
    }
  }
  return {
    merged: [...byId.values()].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)),
    inserted, updated, skipped, tombstoned,
  };
}

/** Build an export payload object from app state. */
export function buildExportPayload({ kas, transactions, rules }) {
  return {
    v: SYNC_VERSION,
    kind: "phantom-ledger/export",
    kas: { id: kas.id, name: kas.name },
    exportedAt: Date.now(),
    transactions,
    rules,
  };
}
