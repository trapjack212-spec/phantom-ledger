// report.js — monthly totals, WhatsApp report text, CSV export. Pure module.
import { formatIDR } from "./money.js";

/** "YYYY-MM" key for a "YYYY-MM-DD" date string. */
export function monthKey(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

/** Indonesian month name, e.g. "2026-11" -> "November 2026". */
export function monthName(key) {
  const [y, m] = String(key).split("-").map(Number);
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  if (!y || !m || m < 1 || m > 12) return key;
  return `${names[m - 1]} ${y}`;
}

/** Live (non-deleted) transactions only. */
export function live(transactions) {
  return (transactions || []).filter((t) => !t.deletedAt);
}

/**
 * Single source of truth for all money math.
 * Returns { opening, in, out, closing, byCategory, top, count, monthTxns }.
 */
export function computeTotals(transactions, month) {
  const all = live(transactions);
  let opening = 0, inc = 0, out = 0;
  const byCategory = {};
  const monthTxns = [];
  for (const tx of all) {
    const key = monthKey(tx.date);
    if (key < month) {
      opening += tx.type === "in" ? tx.amount : -tx.amount;
    } else if (key === month) {
      monthTxns.push(tx);
      if (tx.type === "in") inc += tx.amount; else out += tx.amount;
      const cat = tx.category || "Lainnya";
      byCategory[cat] = byCategory[cat] || { in: 0, out: 0 };
      byCategory[cat][tx.type === "in" ? "in" : "out"] += tx.amount;
    }
  }
  const top = [...monthTxns].sort((a, b) => b.amount - a.amount).slice(0, 10);
  return { opening, in: inc, out, closing: opening + inc - out, byCategory, top, count: monthTxns.length, monthTxns };
}

/** WhatsApp-ready plain-text monthly report. */
export function toWhatsAppText(kasName, month, totals) {
  const lines = [];
  lines.push(`👻 *LAPORAN KAS — ${kasName}*`);
  lines.push(`📅 ${monthName(month)}`);
  lines.push(`--------------------------`);
  lines.push(`💰 Saldo awal: ${formatIDR(totals.opening)}`);
  lines.push(`⬆️ Pemasukan: ${formatIDR(totals.in)}`);
  lines.push(`⬇️ Pengeluaran: ${formatIDR(totals.out)}`);
  lines.push(`💵 Saldo akhir: ${formatIDR(totals.closing)}`);
  lines.push(`--------------------------`);
  const cats = Object.entries(totals.byCategory).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  if (cats.length) {
    lines.push(`📂 *Per Kategori*`);
    for (const [cat, v] of cats) {
      const parts = [];
      if (v.in) parts.push(`masuk ${formatIDR(v.in)}`);
      if (v.out) parts.push(`keluar ${formatIDR(v.out)}`);
      lines.push(`• ${cat}: ${parts.join(", ")}`);
    }
    lines.push(`--------------------------`);
  }
  if (totals.top.length) {
    lines.push(`🔝 *Transaksi Terbesar*`);
    for (const tx of totals.top.slice(0, 5)) {
      lines.push(`• ${tx.date} — ${tx.type === "in" ? "⬆️" : "⬇️"} ${formatIDR(tx.amount)} (${tx.category}) ${tx.note || ""}`.trim());
    }
  }
  lines.push(`--------------------------`);
  lines.push(`📝 ${totals.count} transaksi bulan ini. Dibuat dengan Phantom Ledger 👻 (tanpa akun, tanpa server).`);
  return lines.join("\n");
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV for a month's transactions. Header: tanggal,jenis,kategori,jumlah,catatan */
export function toCsv(transactions, month) {
  const rows = live(transactions)
    .filter((t) => monthKey(t.date) === month)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const lines = ["tanggal,jenis,kategori,jumlah,catatan"];
  for (const tx of rows) {
    lines.push([tx.date, tx.type === "in" ? "pemasukan" : "pengeluaran", tx.category || "Lainnya", tx.amount, tx.note || ""].map(csvCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
