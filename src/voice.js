// voice.js — Indonesian voice transcript -> draft transaction. Pure module.
import { parseIndonesianAmount } from "./money.js";
import { suggestCategory } from "./rules.js";

const OUT_WORDS = ["pengeluaran", "keluar", "bayar", "beli", "belanja"];
const IN_WORDS = ["pemasukan", "masuk", "terima", "dapat", "iuran masuk"];

/**
 * Parse a SpeechRecognition transcript (id-ID) into a draft transaction.
 * Returns { type, amount, note, category, confidence } or { error }.
 * Never throws on weird input; the UI always shows the draft for confirm.
 */
export function parseVoice(text, rules) {
  const raw = (text || "").trim();
  if (!raw) return { error: "Tidak ada suara yang dikenali. Coba lagi." };
  const lower = raw.toLowerCase();

  let type = "out";
  if (IN_WORDS.some((w) => lower.includes(w))) type = "in";
  else if (OUT_WORDS.some((w) => lower.includes(w))) type = "out";

  // Find the amount: prefer digit forms, else number-word runs.
  let amount = null;
  let amountSpan = null;
  const digitRe = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(ribu|juta|miliar|ratus)?/i;
  const dm = lower.match(digitRe);
  if (dm) {
    amount = parseIndonesianAmount(dm[0]);
    amountSpan = dm[0];
  }
  if (amount === null) {
    // Number-word run: longest run of number words (+ scale words).
    const numWords = new Set([
      "nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
      "sepuluh", "sebelas", "duabelas", "tigabelas", "empatbelas", "limabelas", "enambelas",
      "tujuhbelas", "delapanbelas", "sembilanbelas", "belas", "puluh", "ratus", "ribu", "juta",
      "miliar", "seratus", "seribu", "sejuta",
    ]);
    const tokens = lower.split(/[^a-z]+/).filter(Boolean);
    let best = null;
    let run = [];
    const flush = () => {
      if (run.length >= 1) {
        const phrase = run.join(" ");
        const v = parseIndonesianAmount(phrase);
        if (v !== null && (!best || run.length > best.length)) best = { phrase, value: v, len: run.length };
      }
      run = [];
    };
    for (const t of tokens) {
      if (numWords.has(t)) run.push(t);
      else flush();
    }
    flush();
    if (best) {
      amount = best.value;
      amountSpan = best.phrase;
    }
  }

  if (amount === null || amount <= 0) {
    return { error: `Jumlah tidak dikenali dari: "${raw}". Contoh: "pengeluaran lima puluh ribu untuk listrik".` };
  }

  // Note = transcript minus type keywords and the amount phrase.
  let note = lower;
  for (const w of [...OUT_WORDS, ...IN_WORDS]) note = note.replace(w, " ");
  if (amountSpan) note = note.replace(amountSpan.toLowerCase(), " ");
  note = note
    .replace(/\b(untuk|buat|rupiah|rp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Capitalize first letter for display.
  if (note) note = note.charAt(0).toUpperCase() + note.slice(1);

  const category = suggestCategory(note, rules || []);
  return {
    type,
    amount,
    note,
    category,
    confidence: note ? "high" : "medium",
    transcript: raw,
  };
}
