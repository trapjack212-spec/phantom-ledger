// money.js — IDR formatting + Indonesian number-word parsing.
// Pure module: no DOM, no IndexedDB. Runs under Node and in the browser.

/** Format an integer IDR amount, e.g. 50000 -> "Rp 50.000". */
export function formatIDR(amount) {
  const n = Math.trunc(Number(amount) || 0);
  return "Rp " + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Format with sign for reports: negative amounts show "-Rp ...". */
export function formatIDRSigned(amount) {
  const n = Math.trunc(Number(amount) || 0);
  return (n < 0 ? "-" : "") + formatIDR(n);
}

const ONES = {
  nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7,
  delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};

const TEENS = {
  duabelas: 12, tigabelas: 13, empatbelas: 14, limabelas: 15,
  enambelas: 16, tujuhbelas: 17, delapanbelas: 18, sembilanbelas: 19,
};

const SCALES = { ratus: 100, ribu: 1_000, juta: 1_000_000, miliar: 1_000_000_000 };

/**
 * Parse an Indonesian amount expression into integer IDR.
 * Accepts digits ("50.000", "50000", "50,000", "Rp 50 ribu") and number
 * words ("lima puluh ribu", "dua juta lima ratus ribu", "seratus ribu",
 * "tiga belas ribu", "satu juta dua ratus lima puluh ribu").
 * Returns null when nothing parseable is found.
 */
export function parseIndonesianAmount(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();

  // 1) Digit form: "50.000", "50,000", "50000", "50 ribu", "2,5 juta"
  const digitRe = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(ribu|juta|miliar|ratus)?\b/;
  const dm = lower.match(digitRe);
  if (dm) {
    let numStr = dm[1];
    const scaleWord = dm[2];
    let value;
    if (/[.,]\d{3}$/.test(numStr) && (numStr.match(/[.,]/g) || []).length >= 1 && /^\d{1,3}([.,]\d{3})+$/.test(numStr)) {
      // thousands separators: 50.000 / 1.250.000
      value = Number(numStr.replace(/[.,]/g, ""));
    } else if (numStr.includes(",") || numStr.includes(".")) {
      // decimal: 2,5 juta -> 2.5
      value = Number(numStr.replace(",", "."));
    } else {
      value = Number(numStr);
    }
    if (!Number.isFinite(value)) return null;
    if (scaleWord) value *= SCALES[scaleWord] || 1;
    return Math.round(value);
  }

  // 2) Number words: tokenize and evaluate.
  const tokens = lower.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  // "se-" prefix forms: seratus=100, seribu=1000, sejuta=1000000, sepuluh=10, sebelas=11
  const expanded = [];
  for (const t of tokens) {
    if (t === "seratus") expanded.push("satu", "ratus");
    else if (t === "seribu") expanded.push("satu", "ribu");
    else if (t === "sejuta") expanded.push("satu", "juta");
    else if (t === "sepuluh") expanded.push("satu", "puluh");
    else if (t === "sebelas") expanded.push("satu", "belas");
    else expanded.push(t);
  }

  let total = 0;
  let current = 0;
  let lastDigit = 0; // most recent ones value, for puluh/belas/ratus scaling
  let seen = false;
  for (const t of expanded) {
    if (t in ONES) { current += ONES[t]; lastDigit = ONES[t]; seen = true; }
    else if (t in TEENS) { current += TEENS[t]; lastDigit = TEENS[t]; seen = true; }
    else if (t === "belas") { current = current - lastDigit + (lastDigit + 10); lastDigit = lastDigit + 10; seen = true; }
    else if (t === "puluh") { current = current - lastDigit + lastDigit * 10; lastDigit = lastDigit * 10; seen = true; }
    else if (t === "ratus") { current = current - lastDigit + lastDigit * 100; lastDigit = lastDigit * 100; seen = true; }
    else if (t === "ribu" || t === "juta" || t === "miliar") {
      total += (current || 1) * SCALES[t];
      current = 0;
      lastDigit = 0;
      seen = true;
    } else if (seen) {
      // A non-number word after a number run ends the amount phrase.
      break;
    }
    // words before any number are ignored (e.g. "pengeluaran")
  }
  total += current;
  if (!seen || total <= 0) return null;
  return total;
}
