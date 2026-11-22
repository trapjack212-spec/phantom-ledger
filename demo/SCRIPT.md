# Demo Video — Script & Storyboard

Target: under 3 minutes (Devpost limit). Final video:
`demo/phantom-ledger-demo.mp4` (79.7 detik, 720×1280 portrait, captioned +
narasi Bahasa Indonesia — dibuat dari screenshot asli + ffmpeg, tanpa alat
video generatif). Narasi memakai `/opt/hatch/bin/tts` (suara MAI_03),
di-render ulang 2026-11-23 setelah TTS online gagal di sandbox.

## Narration script (Bahasa Indonesia)

| # | Scene (shot) | Durasi | Narasi |
|---|---|---|---|
| 0 | Title card | ~8 dtk | "Phantom Ledger. Buku kas hantu — tanpa akun, tanpa server, tanpa jejak. Dibuat untuk Kiroween 2026, kategori Frankenstein." |
| 1 | `01-catat.png` — dashboard + form | ~18 dtk | "Bendahara RT, masjid, atau arisan sering mencatat kas di buku tulis. Phantom Ledger menggantinya dengan aplikasi yang hidup sepenuhnya di HP — tanpa daftar, tanpa login, tanpa internet. Semua tersimpan lokal, dan kategorinya terisi otomatis. Ketik bayar listrik, kategorinya langsung Listrik." |
| 2 | `02-suara.png` — voice draft | ~18 dtk | "Tangan sedang sibuk? Tinggal bicara. Ucapkan: pengeluaran lima puluh ribu untuk listrik. Aplikasi mengubah suara menjadi draft transaksi — jumlah, jenis, dan kategori sudah terisi. Kamu periksa dulu, baru simpan. Suara tidak pernah menulis langsung." |
| 3 | `03-sinkron-qr.png` — QR export | ~22 dtk | "Ini bagian paling hantu. Tidak ada server, jadi bagaimana pindah HP? Lewat kode QR. Satu HP menampilkan kode, HP lain memindai — seluruh kas pindah, dan data yang sama digabung otomatis, tanpa duplikat. Tidak ada akun, tidak ada kabel, tidak ada cloud." |
| 4 | `04-laporan.png` — monthly report | ~18 dtk | "Akhir bulan, laporan siap dalam satu ketuk. Saldo awal, pemasukan, pengeluaran, per kategori — disalin sebagai teks WhatsApp untuk grup RT, atau diunduh sebagai CSV untuk arsip." |
| 5 | End card | ~8 dtk | "Phantom Ledger — lima teknologi yang tidak seharusnya bertemu, dijahit jadi satu buku kas. Dibangun dengan Kiro: spec, steering, dan hooks. Coba sendiri — semua kode ada di GitHub." |

## Shots (all real screenshots from headless Chromium)

- `demo/screenshots/01-catat.png` — dashboard, saldo Rp 2.575.000, 6 transaksi demo
- `demo/screenshots/02-suara.png` — voice draft "pengeluaran lima puluh ribu untuk listrik"
- `demo/screenshots/03-sinkron-qr.png` — QR export, bagian 1 dari 1
- `demo/screenshots/04-laporan.png` — laporan bulanan November 2026

## How the video was built

`demo/build-video.py`:
1. Narasi tiap scene → MP3 (utama: edge-tts `id-ID-ArdiNeural`, cadangan:
   gTTS `lang="id"`).
2. Durasi audio diukur dengan ffprobe; tiap screenshot ditampilkan selama
   durasi narasi + jeda.
3. ffmpeg: scale/crop ke 720×1280, caption bawah via drawtext (DejaVu),
   lalu concat semua segmen menjadi `demo/phantom-ledger-demo.mp4`.

Rebuild: `python3 demo/build-video.py` (needs edge-tts/gTTS + ffmpeg).

> UPDATE (2026-11-23): narasi SUDAH terisi — di-render ulang dengan
> `/opt/hatch/bin/tts` (suara narator MAI_03, Bahasa Indonesia) karena
> kedua layanan TTS online gagal di sandbox. Video final 79.7 detik
> (masih di bawah batas 3 menit), audio terverifikasi (mean −22.1 dB).
> Catatan lama di bawah ini hanya riwayat kenapa video pertama bisu.
>
> Catatan lama (2026-11-22): di sandbox ini kedua layanan TTS gagal —
> gTTS mengembalikan 429 (rate-limit dari IP sandbox) dan edge-tts gagal
> TLS lewat proxy sandbox — sehingga video yang dihasilkan memakai trek
> audio senyap dan mengandalkan caption di tiap scene. Naskah narasi di
> atas tetap tersimpan di `demo/build-video.py`; jalankan ulang skrip di
> jaringan biasa dan narasi akan terisi otomatis (skrip sudah menangani
> fallback senyap per scene).
