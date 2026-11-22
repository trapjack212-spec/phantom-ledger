// rules.js — rule-based auto-categorization. Pure module.
// A rule is { id, keyword, category, enabled }. First matching rule wins.

export const DEFAULT_RULES = [
  { keyword: "listrik", category: "Listrik" },
  { keyword: "pln", category: "Listrik" },
  { keyword: "token", category: "Listrik" },
  { keyword: "air", category: "Air" },
  { keyword: "pdam", category: "Air" },
  { keyword: "iuran", category: "Iuran" },
  { keyword: "kas rt", category: "Iuran" },
  { keyword: "warga", category: "Iuran" },
  { keyword: "donasi", category: "Donasi" },
  { keyword: "sedekah", category: "Donasi" },
  { keyword: "infak", category: "Donasi" },
  { keyword: "infaq", category: "Donasi" },
  { keyword: "zakat", category: "Donasi" },
  { keyword: "fotokopi", category: "ATK" },
  { keyword: "print", category: "ATK" },
  { keyword: "atk", category: "ATK" },
  { keyword: "konsumsi", category: "Konsumsi" },
  { keyword: "makan", category: "Konsumsi" },
  { keyword: "minum", category: "Konsumsi" },
  { keyword: "snack", category: "Konsumsi" },
  { keyword: "kopi", category: "Konsumsi" },
  { keyword: "kebersihan", category: "Kebersihan" },
  { keyword: "sampah", category: "Kebersihan" },
  { keyword: "gotong royong", category: "Kebersihan" },
  { keyword: "keamanan", category: "Keamanan" },
  { keyword: "satpam", category: "Keamanan" },
  { keyword: "hansip", category: "Keamanan" },
  { keyword: "perbaikan", category: "Perbaikan" },
  { keyword: "renovasi", category: "Perbaikan" },
  { keyword: "pengecatan", category: "Perbaikan" },
  { keyword: "tukang", category: "Perbaikan" },
  { keyword: "transport", category: "Transport" },
  { keyword: "bensin", category: "Transport" },
  { keyword: "ojek", category: "Transport" },
  { keyword: "parkir", category: "Transport" },
  { keyword: "gaji", category: "Honor" },
  { keyword: "honor", category: "Honor" },
  { keyword: "upah", category: "Honor" },
  { keyword: "arisan", category: "Arisan" },
];

export function defaultRules() {
  return DEFAULT_RULES.map((r, i) => ({
    id: `rule-${i + 1}`,
    keyword: r.keyword,
    category: r.category,
    enabled: true,
  }));
}

/**
 * Suggest a category for a note. Case-insensitive substring match,
 * first enabled rule wins. Returns "Lainnya" when nothing matches.
 */
export function suggestCategory(note, rules) {
  const text = (note || "").toLowerCase();
  if (!text.trim()) return "Lainnya";
  for (const rule of rules || []) {
    if (!rule.enabled) continue;
    if (text.includes(String(rule.keyword).toLowerCase())) return rule.category;
  }
  return "Lainnya";
}

/** All distinct categories, in first-seen order, for filter dropdowns. */
export function allCategories(rules) {
  const seen = [];
  for (const r of rules || []) {
    if (!seen.includes(r.category)) seen.push(r.category);
  }
  for (const extra of ["Lainnya", "Pemasukan"]) {
    if (!seen.includes(extra)) seen.push(extra);
  }
  return seen;
}
