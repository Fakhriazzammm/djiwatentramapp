# Plan: ASCII Motion Graphic Video — Halaman /home

## Goal

Buat ASCII motion graphic video (~10-15 detik) dari halaman `/home` Djiwa Tentram POS dashboard — merekam interaksi UI dan konversi ke colored ASCII MP4.

---

## Current Context

### Halaman /home (POS Dashboard)

Halaman utama kasir dengan komponen:
- **HomeHeroOperational** — shift status, clock in/out
- **HomeSearchBar** — pencarian menu/produk
- **HomeQuickActions** — aksi cepat
- **HomeServiceGrid** — grid layanan
- **HomeStickyStrip** — strip informasi sticky
- **HomeRepeatUsage** — menu sering dipesan
- **HomeBottomNav** — navigasi bawah
- **LeaderboardPanel** — papan skor karyawan
- **FaceRecognition** — komponen face login (lazy loaded)

Tech stack: React + TanStack Router + Framer Motion + Supabase

### ASCII Video Skill

Pipeline: `INPUT → ANALYZE → SCENE_FN → TONEMAP → SHADE → ENCODE`

Dua mode yang relevan:
1. **Screen recording → ASCII** — rekam browser, konversi frame ke ASCII
2. **Generative ASCII** — buat animasi dari nol (text, particles, efek)

---

## Proposed Approach

### Opsi A: Screen Recording + ASCII Convert (Realistis)

1. Buka `/home` di browser
2. Rekam interaksi (scroll, klik, transisi) via browser tools
3. Simpan sebagai video MP4
4. Convert ke ASCII via ascii-video pipeline

**Pros:** Real footage, sesuai aslinya
**Cons:** File besar, render lama, hasil tergantung kualitas recording

### Opsi B: Generative ASCII Animation (Kreatif)

1. Bikin Python script dari nol — animasi ASCII yang merepresentasikan elemen halaman /home
2. Scene: logo brand → shift status → grid menu → transisi → leaderboard
3. Output: ASCII MP4 1920x1080 @ 24fps, ~10-15 detik

**Pros:** Kreatif, branded, file lebih kecil, bisa di-loop
**Cons:** Gak menampilkan UI asli, lebih abstrak

### ⭐ Rekomendasi: Hybrid (Opsi A + B)

1. **Scene 1 (3 detik):** Brand intro — ASCII "DJIWA TENTRAM" dengan efek steam/kopi
2. **Scene 2 (5 detik):** Screen recording dashboard — transisi slow-motion
3. **Scene 3 (4 detik):** Data visualizer — revenue, orders, shift status dalam ASCII bars
4. **Outro (3 detik):** Fade ke logo + tagline

---

## Step-by-Step Plan

### Step 1: Setup & Dependencies

```bash
pip install numpy pillow scipy opencv-python ffmpeg-python
sudo apt install ffmpeg
```

### Step 2: Record Screen (untuk Scene 2)

Buka `/home` di browser, record:
- Transisi halaman (loading → selesai)
- Scroll grid
- Klik shift/clock in
- Framer Motion animations

Gunakan `browser_navigate` + `browser_console` untuk capture, lalu `ffmpeg` untuk rekam.

### Step 3: Build ASCII Render Script

Single Python file dengan pipeline:

| Komponen | Detail |
|----------|--------|
| **Grid** | 1920x1080, cell 10px → 192×108 chars |
| **Palette** | Kopi/earth tones (warm brown, cream, gold) + brand hijau |
| **Effek** | FBM noise for background, particles for steam/bubble |
| **Scene 1** | Brand text reveal — karakter muncul satu per satu, background steam |
| **Scene 2** | Video-to-ASCII — frame dari recording |
| **Scene 3** | Bar chart animasi — data visual |
| **Outro** | Glow fade |

### Step 4: Render

```bash
python3 ascii_home_video.py
```

Estimasi: ~15-30 menit render (bergantung resolusi & durasi)

### Step 5: Integrasi ke Halaman /home

Opsi:
- **Background video** — auto-play muted loop
- **Loading screen** — tampil pas data belum load
- **Embed di hero** — section dekoratif di atas halaman

---

## Files

| File | Tujuan |
|------|--------|
| `.hermes/ascii-home/ascii_home_video.py` | Main Python script |
| `.hermes/ascii-home/scenes.py` | Scene functions |
| `.hermes/ascii-home/palettes.py` | Color & character palettes |
| `.hermes/ascii-home/output/` | Render output (MP4) |
| `apps/web/public/videos/home-ascii.mp4` | Final video untuk web |

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Render terlalu lama (>30 menit) | Turunkan resolusi ke 1280x720, fps 15 |
| Screen recording blur/kabur | Record di resolusi tinggi, slowmo |
| File terlalu besar (>50MB) | Kompresi H.264, turunkan bitrate |
| ASCII tidak terbaca di layar | Test frame dulu sebelum full render |
| Browser tidak bisa di-automate | Pakai `browser_navigate` manual + screenshot sequence |

---

## Verification

```
[ ] Script bisa jalan tanpa error
[ ] Test frame (3 frame kunci) keluar bagus
[ ] Full render selesai <30 menit
[ ] Video bisa diputar di browser
[ ] Integrasi ke halaman /home
[ ] Build success
```
