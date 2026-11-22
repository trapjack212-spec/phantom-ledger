// app.js — UI wiring only. All money/voice/sync/report logic lives in the
// pure modules; this file touches the DOM and the store.
import { formatIDR, parseIndonesianAmount } from "./money.js";
import { defaultRules, suggestCategory, allCategories } from "./rules.js";
import { encodeExport, decodeChunks, mergeTransactions, buildExportPayload } from "./sync.js";
import { computeTotals, toWhatsAppText, toCsv, monthKey, monthName } from "./report.js";
import { parseVoice } from "./voice.js";
import {
  openStore, isMemoryFallback, getAllTransactions, putTransaction, putTransactions,
  getAllRules, putRule, putRules, deleteRule, getKas, setKas, tombstoneTransaction,
  newId, todayStr,
} from "./store.js";

const $ = (id) => document.getElementById(id);

const state = {
  kas: { id: "kas-rt05", name: "Kas RT 05" },
  transactions: [],
  rules: [],
  editId: null,
  voiceDraft: null,
  exportChunks: [],
  exportIndex: 0,
  exportTimer: null,
  pendingImport: null, // { payload, summary }
  scanStream: null,
  scanRaf: null,
};

// ---------- helpers ----------
function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}
function liveTxns() {
  return state.transactions.filter((t) => !t.deletedAt);
}
function currentMonth() {
  return monthKey(todayStr());
}

// ---------- init ----------
async function init() {
  await openStore();
  if (isMemoryFallback()) $("offlineBanner").hidden = false;

  state.kas = await getKas();
  $("kasNameInput").value = state.kas.name;

  state.rules = await getAllRules();
  if (state.rules.length === 0) {
    state.rules = defaultRules();
    await putRules(state.rules);
  }
  state.transactions = await getAllTransactions();

  // Voice capability banner (graceful degradation, US-3.3).
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("voiceBanner").hidden = false;
    $("voiceBanner").textContent =
      "🎙️ Browser ini tidak mendukung pengenalan suara (Web Speech API). Isi manual tetap bisa dipakai — coba Chrome di Android/desktop.";
    $("voiceBtn").disabled = true;
  } else if (!navigator.mediaDevices) {
    $("voiceBanner").hidden = false;
    $("voiceBanner").textContent = "🎙️ Mikrofon tidak tersedia di halaman ini (butuh HTTPS/localhost). Isi manual tetap bisa dipakai.";
  }

  const now = currentMonth();
  $("filterMonth").value = now;
  $("reportMonth").value = now;
  $("txnDate").value = todayStr();

  fillCategorySelects();
  renderAll();
  wireEvents();

  if ("serviceWorker" in navigator) {
    // registered from inline script in index.html
  }
}

// ---------- rendering ----------
function fillCategorySelects() {
  const cats = allCategories(state.rules);
  $("txnCategory").innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  const cur = $("filterCategory").value;
  $("filterCategory").innerHTML =
    `<option value="all">Semua</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  if ([...$("filterCategory").options].some((o) => o.value === cur)) $("filterCategory").value = cur;
}

function renderBalance() {
  const all = liveTxns();
  let inc = 0, out = 0;
  for (const t of all) {
    if (t.type === "in") inc += t.amount; else out += t.amount;
  }
  $("balanceValue").textContent = formatIDR(inc - out);
  $("sumIn").textContent = `⬆️ Masuk ${formatIDR(inc)}`;
  $("sumOut").textContent = `⬇️ Keluar ${formatIDR(out)}`;
  $("txnCount").textContent = `${all.length} transaksi`;
}

function renderList() {
  const month = $("filterMonth").value;
  const type = $("filterType").value;
  const cat = $("filterCategory").value;
  const list = liveTxns()
    .filter((t) => (!month || monthKey(t.date) === month))
    .filter((t) => (type === "all" || t.type === type))
    .filter((t) => (cat === "all" || (t.category || "Lainnya") === cat))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));

  $("emptyState").hidden = list.length > 0;
  $("txnList").innerHTML = list.map((t) => `
    <li class="txn" data-id="${t.id}">
      <span class="icon">${t.type === "in" ? "⬆️" : "⬇️"}</span>
      <div class="main">
        <div class="note">${escapeHtml(t.note || "(tanpa catatan)")}</div>
        <div class="meta">${t.date} · ${escapeHtml(t.category || "Lainnya")}</div>
      </div>
      <span class="amount ${t.type}">${t.type === "in" ? "+" : "−"}${formatIDR(t.amount)}</span>
      <button class="mini" data-action="edit" title="Ubah" aria-label="Ubah transaksi">✏️</button>
      <button class="mini" data-action="delete" title="Hapus" aria-label="Hapus transaksi">🗑️</button>
    </li>`).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderReport() {
  const month = $("reportMonth").value || currentMonth();
  const totals = computeTotals(state.transactions, month);
  $("repOpening").textContent = formatIDR(totals.opening);
  $("repIn").textContent = formatIDR(totals.in);
  $("repOut").textContent = formatIDR(totals.out);
  $("repClosing").textContent = formatIDR(totals.closing);
  $("repCategories").innerHTML = Object.entries(totals.byCategory)
    .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
    .map(([cat, v]) => {
      const parts = [];
      if (v.in) parts.push(`masuk ${formatIDR(v.in)}`);
      if (v.out) parts.push(`keluar ${formatIDR(v.out)}`);
      return `<li>${escapeHtml(cat)}: ${parts.join(", ")}</li>`;
    }).join("") || "<li>Belum ada transaksi bulan ini.</li>";
  $("repTop").innerHTML = totals.top.slice(0, 5).map((t) =>
    `<li>${t.date} — ${t.type === "in" ? "⬆️" : "⬇️"} ${formatIDR(t.amount)} (${escapeHtml(t.category)}) ${escapeHtml(t.note || "")}</li>`
  ).join("") || "<li>—</li>";
  $("reportText").textContent = toWhatsAppText(state.kas.name, month, totals);
  return totals;
}

function renderRules() {
  $("ruleList").innerHTML = state.rules.map((r) => `
    <li class="${r.enabled ? "" : "off"}">
      <input type="checkbox" data-rule-toggle="${r.id}" ${r.enabled ? "checked" : ""} aria-label="Aktifkan aturan ${escapeHtml(r.keyword)}">
      <span class="kw">${escapeHtml(r.keyword)}</span><span class="arrow">→</span>
      <span>${escapeHtml(r.category)}</span>
      <span class="spacer"></span>
      <button class="mini" data-rule-del="${r.id}" title="Hapus aturan" aria-label="Hapus aturan">🗑️</button>
    </li>`).join("");
}

function renderAll() {
  renderBalance();
  renderList();
  renderReport();
  renderRules();
}

// ---------- form / CRUD ----------
function setForm(tx) {
  state.editId = tx ? tx.id : null;
  $("editId").value = tx ? tx.id : "";
  $("formTitle").textContent = tx ? "Ubah Transaksi" : "Tambah Transaksi";
  $("txnType").value = tx ? tx.type : "out";
  $("txnAmount").value = tx ? formatIDR(tx.amount).replace("Rp ", "") : "";
  $("txnDate").value = tx ? tx.date : todayStr();
  $("txnNote").value = tx ? tx.note : "";
  $("txnCategory").value = tx ? tx.category : "Lainnya";
  $("catHint").textContent = "";
  $("cancelEditBtn").hidden = !tx;
  showError($("formError"), "");
}

function suggestForNote() {
  const note = $("txnNote").value;
  const cat = suggestCategory(note, state.rules);
  $("txnCategory").value = cat;
  $("catHint").textContent = note.trim() ? `(otomatis: ${cat})` : "";
}

async function saveForm(e) {
  e.preventDefault();
  const amount = parseIndonesianAmount($("txnAmount").value.replace(/^rp\s*/i, ""));
  if (amount === null || amount <= 0) {
    showError($("formError"), "Jumlah tidak valid. Contoh: 50000 atau 50.000 atau 50 ribu.");
    return;
  }
  const date = $("txnDate").value;
  if (!date) {
    showError($("formError"), "Tanggal wajib diisi.");
    return;
  }
  const now = Date.now();
  if (state.editId) {
    const idx = state.transactions.findIndex((t) => t.id === state.editId);
    if (idx >= 0) {
      const updated = {
        ...state.transactions[idx],
        type: $("txnType").value, amount, date,
        category: $("txnCategory").value,
        note: $("txnNote").value.trim(),
        updatedAt: now,
      };
      state.transactions[idx] = updated;
      await putTransaction(updated);
    }
  } else {
    const tx = {
      id: newId(), kasId: state.kas.id,
      type: $("txnType").value, amount, date,
      category: $("txnCategory").value,
      note: $("txnNote").value.trim(),
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    state.transactions.push(tx);
    await putTransaction(tx);
  }
  setForm(null);
  renderAll();
  switchTab("catat");
}

// ---------- voice ----------
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showError($("voiceError"), "Browser ini tidak mendukung pengenalan suara. Gunakan Chrome.");
    return;
  }
  const rec = new SR();
  rec.lang = "id-ID";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  $("voiceStatus").textContent = "🎙️ Mendengarkan… bicara sekarang.";
  $("voiceBtn").disabled = true;
  showError($("voiceError"), "");
  rec.onresult = (ev) => {
    const transcript = ev.results[0][0].transcript;
    handleVoiceTranscript(transcript);
  };
  rec.onerror = (ev) => {
    $("voiceBtn").disabled = false;
    $("voiceStatus").textContent = "Ketuk tombol, lalu bicara.";
    showError($("voiceError"), `Suara gagal dikenali (${ev.error}). Coba lagi atau isi manual.`);
  };
  rec.onend = () => { $("voiceBtn").disabled = false; };
  try { rec.start(); } catch (err) {
    $("voiceBtn").disabled = false;
    showError($("voiceError"), `Tidak bisa memulai mikrofon: ${err.message}`);
  }
}

function handleVoiceTranscript(transcript) {
  $("voiceStatus").textContent = "Memproses…";
  const draft = parseVoice(transcript, state.rules);
  if (draft.error) {
    showError($("voiceError"), draft.error);
    $("voiceStatus").textContent = "Ketuk tombol, lalu bicara.";
    return;
  }
  state.voiceDraft = draft;
  $("voiceTranscript").textContent = `“${draft.transcript}”`;
  $("draftType").textContent = draft.type === "in" ? "⬆️ Pemasukan" : "⬇️ Pengeluaran";
  $("draftAmount").textContent = formatIDR(draft.amount);
  $("draftCategory").textContent = draft.category;
  $("draftNote").textContent = draft.note || "(tanpa catatan)";
  $("voiceDraft").hidden = false;
  $("voiceStatus").textContent = "Periksa draft di bawah, lalu simpan.";
}

async function confirmVoiceDraft() {
  const d = state.voiceDraft;
  if (!d) return;
  const now = Date.now();
  const tx = {
    id: newId(), kasId: state.kas.id, type: d.type, amount: d.amount,
    date: todayStr(), category: d.category, note: d.note,
    createdAt: now, updatedAt: now, deletedAt: null,
  };
  state.transactions.push(tx);
  await putTransaction(tx);
  state.voiceDraft = null;
  $("voiceDraft").hidden = true;
  $("voiceStatus").textContent = "✅ Tersimpan! Ketuk tombol untuk mencatat lagi.";
  renderAll();
}

// ---------- QR export / import ----------
function renderQrChunk() {
  const box = $("qrCode");
  const chunk = state.exportChunks[state.exportIndex];
  box.innerHTML = "";
  if (!chunk) return;
  try {
    const qr = qrcode(0, "M");
    qr.addData(chunk);
    qr.make();
    box.innerHTML = qr.createImgTag(6, 4);
  } catch (err) {
    box.innerHTML = `<p class="error">Gagal membuat QR: ${escapeHtml(err.message)}</p>`;
  }
  $("qrMeta").textContent = `Bagian ${state.exportIndex + 1} dari ${state.exportChunks.length} · ${chunk.length} karakter · pindai semua bagian di perangkat lain`;
}

async function startExport() {
  showError($("exportError"), "");
  try {
    const payload = buildExportPayload({
      kas: state.kas,
      transactions: state.transactions,
      rules: state.rules,
    });
    state.exportChunks = await encodeExport(payload);
    state.exportIndex = 0;
    $("qrBox").hidden = false;
    renderQrChunk();
  } catch (err) {
    showError($("exportError"), `Gagal membuat ekspor: ${err.message}`);
  }
}

function stopQrAuto() {
  if (state.exportTimer) { clearInterval(state.exportTimer); state.exportTimer = null; }
  $("qrAutoAdv").checked = false;
}

async function previewImport(chunkStrings) {
  showError($("importError"), "");
  $("importPreview").hidden = true;
  state.pendingImport = null;
  try {
    const payload = await decodeChunks(chunkStrings);
    // Merge against ALL local incl. tombstones so counts are right:
    const full = mergeTransactions(state.transactions, payload.transactions);
    state.pendingImport = { payload, result: full };
    $("importSummary").textContent =
      `Dari kas "${payload.kas.name}" (${payload.transactions.length} transaksi, diekspor ${new Date(payload.exportedAt).toLocaleString("id-ID")}): ` +
      `${full.inserted} baru, ${full.updated} diperbarui, ${full.tombstoned} dihapus, ${full.skipped} sudah sama. ` +
      `Aturan kategori: ${payload.rules ? payload.rules.length : 0} aturan.`;
    $("importPreview").hidden = false;
  } catch (err) {
    showError($("importError"), err.message);
  }
}

async function confirmImport() {
  const p = state.pendingImport;
  if (!p) return;
  state.transactions = p.result.merged;
  await putTransactions(state.transactions);
  if (p.payload.rules && p.payload.rules.length) {
    state.rules = p.payload.rules;
    await putRules(state.rules);
  }
  state.pendingImport = null;
  $("importPreview").hidden = true;
  $("importText").value = "";
  fillCategorySelects();
  renderAll();
  $("importSummary").textContent = "✅ Berhasil digabungkan!";
  $("importPreview").hidden = false;
  setTimeout(() => { $("importPreview").hidden = true; }, 4000);
}

async function startScan() {
  const status = $("scanStatus");
  if (!("BarcodeDetector" in window)) {
    status.textContent = "📷 Pemindai kamera tidak didukung browser ini. Tempel kode atau unggah file.";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    state.scanStream = stream;
    const video = $("scanVideo");
    video.hidden = false;
    video.srcObject = stream;
    await video.play();
    status.textContent = "📷 Arahkan kamera ke kode QR… (ketuk lagi untuk berhenti)";
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const collected = new Map();
    let total = null;
    const scanLoop = async () => {
      if (!state.scanStream) return;
      try {
        const codes = await detector.detect(video);
        for (const c of codes) {
          const v = (c.rawValue || "").trim();
          const m = v.match(/^(PL[01])\.(\d+)\.(\d+)\./);
          if (m) {
            collected.set(Number(m[2]), v);
            total = Number(m[3]);
            status.textContent = `📷 Terkumpul ${collected.size} dari ${total} bagian…`;
            if (collected.size === total) {
              stopScan();
              $("importText").value = [...collected.values()].join("\n");
              await previewImport([...collected.values()]);
              return;
            }
          }
        }
      } catch { /* keep scanning */ }
      state.scanRaf = requestAnimationFrame(scanLoop);
    };
    scanLoop();
  } catch (err) {
    status.textContent = `📷 Kamera tidak bisa dibuka (${err.message}). Tempel kode atau unggah file.`;
  }
}

function stopScan() {
  if (state.scanRaf) cancelAnimationFrame(state.scanRaf);
  if (state.scanStream) {
    state.scanStream.getTracks().forEach((t) => t.stop());
    state.scanStream = null;
  }
  $("scanVideo").hidden = true;
}

// ---------- tabs ----------
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tabpage").forEach((s) => s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "laporan") renderReport();
}

// ---------- events ----------
function wireEvents() {
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $("kasNameInput").addEventListener("change", async () => {
    const name = $("kasNameInput").value.trim() || "Kas RT 05";
    state.kas = { ...state.kas, name };
    await setKas(state.kas);
    renderReport();
  });

  $("txnForm").addEventListener("submit", saveForm);
  $("cancelEditBtn").addEventListener("click", () => setForm(null));
  $("txnNote").addEventListener("input", suggestForNote);
  $("txnType").addEventListener("change", suggestForNote);

  $("txnList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const li = btn.closest(".txn");
    const id = li?.dataset.id;
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    if (btn.dataset.action === "edit") {
      setForm(tx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (btn.dataset.action === "delete") {
      if (confirm(`Hapus transaksi "${tx.note || tx.category}" (${formatIDR(tx.amount)})?`)) {
        await tombstoneTransaction(tx);
        state.transactions = state.transactions.map((t) => (t.id === id ? { ...t, deletedAt: Date.now(), updatedAt: Date.now() } : t));
        renderAll();
      }
    }
  });

  for (const id of ["filterMonth", "filterType", "filterCategory"]) {
    $(id).addEventListener("change", renderList);
  }
  $("clearFiltersBtn").addEventListener("click", () => {
    $("filterMonth").value = currentMonth();
    $("filterType").value = "all";
    $("filterCategory").value = "all";
    renderList();
  });

  $("voiceBtn").addEventListener("click", startVoice);
  $("voiceConfirmBtn").addEventListener("click", confirmVoiceDraft);
  $("voiceDiscardBtn").addEventListener("click", () => {
    state.voiceDraft = null;
    $("voiceDraft").hidden = true;
    $("voiceStatus").textContent = "Draft dibuang. Ketuk tombol untuk mencoba lagi.";
  });

  $("exportBtn").addEventListener("click", startExport);
  $("qrPrevBtn").addEventListener("click", () => {
    if (!state.exportChunks.length) return;
    state.exportIndex = (state.exportIndex - 1 + state.exportChunks.length) % state.exportChunks.length;
    renderQrChunk();
  });
  $("qrNextBtn").addEventListener("click", () => {
    if (!state.exportChunks.length) return;
    state.exportIndex = (state.exportIndex + 1) % state.exportChunks.length;
    renderQrChunk();
  });
  $("qrAutoAdv").addEventListener("change", (e) => {
    stopQrAuto();
    if (e.target.checked && state.exportChunks.length > 1) {
      state.exportTimer = setInterval(() => {
        state.exportIndex = (state.exportIndex + 1) % state.exportChunks.length;
        renderQrChunk();
      }, 2500);
    }
  });

  $("scanBtn").addEventListener("click", () => {
    if (state.scanStream) { stopScan(); $("scanStatus").textContent = "Pemindaian dihentikan."; }
    else startScan();
  });
  $("importPasteBtn").addEventListener("click", () => {
    const lines = $("importText").value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) {
      showError($("importError"), "Tempel dulu kode QR-nya (teks PL1.…).");
      return;
    }
    previewImport(lines);
  });
  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let lines;
    try {
      const obj = JSON.parse(text);
      if (obj && obj.v && obj.kind) {
        // Raw JSON export file — encode it back through the codec path.
        const chunks = await encodeExport(obj);
        lines = chunks;
      } else throw new Error("not an export");
    } catch {
      lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    }
    $("importText").value = lines.join("\n");
    previewImport(lines);
    e.target.value = "";
  });
  $("importConfirmBtn").addEventListener("click", confirmImport);
  $("importCancelBtn").addEventListener("click", () => {
    state.pendingImport = null;
    $("importPreview").hidden = true;
  });

  $("reportMonth").addEventListener("change", renderReport);
  $("copyReportBtn").addEventListener("click", async () => {
    const text = $("reportText").textContent;
    try {
      await navigator.clipboard.writeText(text);
      $("reportStatus").textContent = "✅ Laporan disalin — tempel di grup WhatsApp.";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); $("reportStatus").textContent = "✅ Laporan disalin — tempel di grup WhatsApp."; }
      catch { $("reportStatus").textContent = "Salin manual dari kotak teks di bawah."; }
      ta.remove();
    }
  });
  $("csvBtn").addEventListener("click", () => {
    const month = $("reportMonth").value || currentMonth();
    const csv = toCsv(state.transactions, month);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `phantom-ledger-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $("reportStatus").textContent = `✅ CSV ${monthName(month)} diunduh.`;
  });

  $("ruleList").addEventListener("click", async (e) => {
    const del = e.target.closest("button[data-rule-del]");
    if (del) {
      state.rules = state.rules.filter((r) => r.id !== del.dataset.ruleDel);
      await deleteRule(del.dataset.ruleDel);
      fillCategorySelects();
      renderRules();
      return;
    }
    const tog = e.target.closest("input[data-rule-toggle]");
    if (tog) {
      const r = state.rules.find((x) => x.id === tog.dataset.ruleToggle);
      if (r) { r.enabled = tog.checked; await putRule(r); renderRules(); }
    }
  });
  $("ruleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const keyword = $("ruleKeyword").value.trim().toLowerCase();
    const category = $("ruleCategory").value.trim();
    if (!keyword || !category) return;
    const rule = { id: newId(), keyword, category, enabled: true };
    state.rules.push(rule);
    await putRule(rule);
    $("ruleKeyword").value = "";
    $("ruleCategory").value = "";
    fillCategorySelects();
    renderRules();
  });

  $("wipeBtn").addEventListener("click", async () => {
    if (!confirm("Hapus SEMUA transaksi di perangkat ini? Tindakan ini tidak bisa dibatalkan.")) return;
    const now = Date.now();
    state.transactions = state.transactions.map((t) => ({ ...t, deletedAt: now, updatedAt: now }));
    await putTransactions(state.transactions);
    renderAll();
  });
}

// Test hook: expose state for the headless smoke test (read-only snapshot).
window.__phantom = {
  get state() { return state; },
  parseVoice,
  suggestCategory,
  computeTotals,
};

init();
