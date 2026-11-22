#!/usr/bin/env python3
"""Build demo/phantom-ledger-demo.mp4 from screenshots + gTTS narration.

No video-generation tool: screenshots are real (demo/shots.mjs), narration
is gTTS Indonesian TTS, assembly is ffmpeg. Run: python3 demo/build-video.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"
SHOTS = DEMO / "screenshots"
WORK = DEMO / ".video-work"
WORK.mkdir(exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
OUT = DEMO / "phantom-ledger-demo.mp4"

SCENES = [
    {
        "image": None, "kind": "title",
        "caption": "PHANTOM LEDGER — buku kas hantu",
        "narration": "Phantom Ledger. Buku kas hantu. Tanpa akun, tanpa server, tanpa jejak. Dibuat untuk Kiroween 2026, kategori Frankenstein.",
    },
    {
        "image": SHOTS / "01-catat.png",
        "caption": "Catat — offline, kategori otomatis",
        "narration": "Bendahara RT, masjid, atau arisan sering mencatat kas di buku tulis. Phantom Ledger menggantinya dengan aplikasi yang hidup sepenuhnya di HP. Tanpa daftar, tanpa login, tanpa internet. Semua tersimpan lokal, dan kategorinya terisi otomatis. Ketik bayar listrik, kategorinya langsung Listrik.",
    },
    {
        "image": SHOTS / "02-suara.png",
        "caption": "Suara — bicara, periksa, simpan",
        "narration": "Tangan sedang sibuk? Tinggal bicara. Ucapkan: pengeluaran lima puluh ribu untuk listrik. Aplikasi mengubah suara menjadi draft transaksi. Jumlah, jenis, dan kategori sudah terisi. Kamu periksa dulu, baru simpan. Suara tidak pernah menulis langsung.",
    },
    {
        "image": SHOTS / "03-sinkron-qr.png",
        "caption": "Sinkron QR — tanpa server",
        "narration": "Ini bagian paling hantu. Tidak ada server, jadi bagaimana pindah HP? Lewat kode QR. Satu HP menampilkan kode, HP lain memindai. Seluruh kas pindah, dan data yang sama digabung otomatis, tanpa duplikat. Tidak ada akun, tidak ada kabel, tidak ada cloud.",
    },
    {
        "image": SHOTS / "04-laporan.png",
        "caption": "Laporan — siap kirim ke WhatsApp",
        "narration": "Akhir bulan, laporan siap dalam satu ketuk. Saldo awal, pemasukan, pengeluaran, per kategori. Disalin sebagai teks WhatsApp untuk grup RT, atau diunduh sebagai CSV untuk arsip.",
    },
    {
        "image": None, "kind": "end",
        "caption": "Phantom Ledger — Kiroween 2026",
        "narration": "Phantom Ledger. Lima teknologi yang tidak seharusnya bertemu, dijahit jadi satu buku kas. Dibangun dengan Kiro: spec, steering, dan hooks. Coba sendiri. Semua kode ada di GitHub.",
    },
]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAILED:", " ".join(cmd), "\n", r.stderr[-2000:])
        sys.exit(1)
    return r


def audio_duration(mp3):
    r = run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "json", str(mp3)])
    return float(json.loads(r.stdout)["format"]["duration"])


def main():
    from gtts import gTTS

    segments = []
    for i, scene in enumerate(SCENES):
        img = scene["image"]
        if img is None:
            img = WORK / f"card-{i}.png"
            if scene.get("kind") == "title":
                from PIL import Image, ImageDraw, ImageFont
                im = Image.new("RGB", (720, 1280), "#0d0b14")
                d = ImageDraw.Draw(im)
                fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
                fm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
                for j, t in enumerate(["PHANTOM", "LEDGER"]):
                    w = d.textlength(t, font=fb)
                    d.text(((720 - w) / 2, 480 + j * 90), t, font=fb, fill="#f2eefc")
                t = "Buku kas hantu — tanpa akun, tanpa server"
                w = d.textlength(t, font=fm)
                d.text(((720 - w) / 2, 700), t, font=fm, fill="#9d7bff")
                t2 = "Kiroween 2026 · Frankenstein"
                w = d.textlength(t2, font=fm)
                d.text(((720 - w) / 2, 750), t2, font=fm, fill="#a89fc7")
                im.save(img)
            else:
                from PIL import Image, ImageDraw, ImageFont
                im = Image.new("RGB", (720, 1280), "#0d0b14")
                d = ImageDraw.Draw(im)
                fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
                fm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
                for j, t in enumerate(["PHANTOM LEDGER", "Terima kasih sudah", "menonton."]):
                    w = d.textlength(t, font=fb if j == 0 else fm)
                    d.text(((720 - w) / 2, 520 + j * 80), t,
                           font=fb if j == 0 else fm,
                           fill="#f2eefc" if j == 0 else "#a89fc7")
                im.save(img)
        mp3 = WORK / f"narration-{i}.mp3"
        # A 0-byte file left by a failed TTS attempt counts as missing.
        if mp3.exists() and mp3.stat().st_size == 0:
            mp3.unlink()
        if not mp3.exists():
            import time
            made = False
            # Primary: edge-tts (Microsoft Edge TTS, free, no key), id-ID voice.
            # Fallback: gTTS. Last resort: 6 s of silence (video stays captioned).
            for attempt in range(3):
                r = subprocess.run(["edge-tts", "--voice", "id-ID-ArdiNeural",
                                    "--write-media", str(mp3), "--text", scene["narration"]],
                                   capture_output=True, text=True)
                if r.returncode == 0 and mp3.exists() and mp3.stat().st_size > 0:
                    made = True
                    break
                time.sleep(5 * (attempt + 1))
            if not made:
                try:
                    gTTS(text=scene["narration"], lang="id").save(str(mp3))
                    made = mp3.stat().st_size > 0
                except Exception as e:
                    print(f"WARNING: TTS failed for scene {i} ({e}); using silent audio")
            if not made:
                if mp3.exists():
                    mp3.unlink()
                run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                     "anullsrc=r=24000:cl=mono", "-t", "6", "-c:a", "libmp3lame", str(mp3)])
        dur = audio_duration(mp3) + 0.9
        seg = WORK / f"seg-{i}.mp4"
        caption = scene["caption"].replace(":", "\\:").replace("'", "")
        vf = (
            "scale=720:1280:force_original_aspect_ratio=increase,"
            "crop=720:1280,"
            f"drawtext=fontfile={FONT}:text='{caption}':fontsize=26:"
            "fontcolor=white:x=(w-text_w)/2:y=h-80:"
            "box=1:boxcolor=black@0.6:boxborderw=14"
        )
        run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(img),
             "-i", str(mp3), "-vf", vf, "-t", f"{dur:.2f}",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
             "-c:a", "aac", "-shortest", str(seg)])
        segments.append(seg)
        print(f"scene {i}: {dur:.1f}s  {scene['caption']}")

    concat = WORK / "concat.txt"
    concat.write_text("".join(f"file '{s}'\n" for s in segments))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", str(concat), "-c", "copy", str(OUT)])
    r = run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration,size",
             "-of", "json", str(OUT)])
    info = json.loads(r.stdout)["format"]
    print(f"WROTE {OUT}  duration={float(info['duration']):.1f}s  size={int(info['size']) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
