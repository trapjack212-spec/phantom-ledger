// store.js — IndexedDB wrapper (+ in-memory fallback). Browser only.
// API: openStore(), getAllTransactions(), putTransaction(tx),
// deleteTransaction(id) [tombstone], getMeta/setMeta, getRules/putRule(s),
// getKasName/setKasName. All async, promise-based.

const DB_NAME = "phantom-ledger";
const DB_VERSION = 1;

let db = null;
let memoryFallback = false;

// In-memory fallback (private mode / blocked IndexedDB).
const mem = { transactions: new Map(), meta: new Map(), rules: new Map() };

function idbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

export function isMemoryFallback() {
  return memoryFallback;
}

export function openStore() {
  if (db) return Promise.resolve(db);
  if (!idbAvailable()) {
    memoryFallback = true;
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("transactions")) {
        const s = d.createObjectStore("transactions", { keyPath: "id" });
        s.createIndex("by-date", "date", { unique: false });
      }
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
      if (!d.objectStoreNames.contains("rules")) d.createObjectStore("rules", { keyPath: "id" });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => { memoryFallback = true; resolve(null); };
    req.onblocked = () => { memoryFallback = true; resolve(null); };
  });
}

function tx(storeNames, mode, fn) {
  if (memoryFallback || !db) {
    // Memory path: fn receives a fake store map.
    return Promise.resolve(fn(null));
  }
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Transaksi DB dibatalkan."));
  });
}

function storeGetAll(storeName) {
  if (memoryFallback || !db) return Promise.resolve([...mem[storeName].values()]);
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function storePut(storeName, value) {
  if (memoryFallback || !db) { mem[storeName].set(value.id || value.key, value); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function storePutAll(storeName, values) {
  if (memoryFallback || !db) {
    for (const v of values) mem[storeName].set(v.id || v.key, v);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    const s = t.objectStore(storeName);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function storeDelete(storeName, key) {
  if (memoryFallback || !db) { mem[storeName].delete(key); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const getAllTransactions = () => storeGetAll("transactions");
export const putTransaction = (t) => storePut("transactions", t);
export const putTransactions = (list) => storePutAll("transactions", list);
export const getAllRules = () => storeGetAll("rules");
export const putRule = (r) => storePut("rules", r);
export const putRules = (list) => storePutAll("rules", list);
export const deleteRule = (id) => storeDelete("rules", id);

export async function getMeta(key) {
  if (memoryFallback || !db) return mem.meta.get(key)?.value ?? null;
  return new Promise((resolve, reject) => {
    const req = db.transaction("meta", "readonly").objectStore("meta").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key, value) {
  if (memoryFallback || !db) { mem.meta.set(key, { key, value }); return; }
  await storePut("meta", { key, value });
}

export async function getKas() {
  const name = (await getMeta("kasName")) || "Kas RT 05";
  const id = (await getMeta("kasId")) || "kas-rt05";
  return { id, name };
}

export async function setKas(kas) {
  await setMeta("kasId", kas.id);
  await setMeta("kasName", kas.name);
}

/** Soft-delete: write a tombstone (keeps the id for sync propagation). */
export async function tombstoneTransaction(tx) {
  const now = Date.now();
  const tomb = { ...tx, deletedAt: now, updatedAt: now };
  await putTransaction(tomb);
  return tomb;
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
