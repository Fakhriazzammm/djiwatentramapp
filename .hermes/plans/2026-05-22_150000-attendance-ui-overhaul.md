# Plan: Perombakan UI/UX Halaman `/attendance`

## Goal

Merombak total UI/UX halaman `/attendance` menjadi **mobile-first, responsif, compact, profesional, dan clean** dengan flow face recognition + PIN fallback yang interaktif dan menyatu.

**Target ukuran layar yang didukung:**
| Device | Lebar viewport | Target |
|--------|---------------|--------|
| Mobile S | 320px | Minimal support — grid 2 kolom, kamera full-width |
| Mobile M/L | 375-425px | **Primary target** — grid 3 kolom, kamera max-w-sm |
| Tablet | 768px | Grid 4 kolom, kamera max-w-md |
| Desktop | 1024px+ | Grid 5-6 kolom, kamera max-w-lg, informasi tambahan |

---

## Design Philosophy

| Prinsip | Penerapan |
|---------|-----------|
| **Mobile-first** | Semua layout dimulai dari `max-w-sm`, desktop ditingkatkan dengan `md:`/`lg:`. Tombol di thumb zone bawah. |
| **Responsif** | Grid user cards: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`. Kamera: `max-w-sm md:max-w-md lg:max-w-lg`. Tidak ada scroll horizontal. |
| **Compact** | Setiap elemen punya space budget ketat. Hapus padding/jarak berlebih. Maksimal informasi per viewport tanpa scroll vertikal berlebihan. |
| **Simple** | Maksimal 1 info card per step. Hapus semua dekorasi (blur, glow, gradient bg). Warna solid + border. |
| **Profesional** | Font weight konsisten. Spacing seragam (gap-3, p-3). Tidak ada teks yang terlalu panjang. |
| **Clean** | Flat design. Card dengan `bg-card border border-border rounded-xl shadow-sm`. Hapus animate-ping, animate-bounce. |

---

## Current Layout (Before) vs Target (After)

### Header

| Aspek | Before | After |
|-------|--------|-------|
| Judul | "Portal Presensi" + "Sistem Biometrik Online" | "Absensi" saja |
| Dekorasi | Gradient border, blur glow, animated dot | Flat icon + teks bold |
| Status chip | 2 chip (shift + lokasi) + tombol Dashboard | 1 chip status lokasi saja (mobile: none) |
| Tinggi header | 56px (h-14) | 48px (h-12) — mobile |

### Select Step — Responsive Grid

| Aspek | Before | After |
|-------|--------|-------|
| Layout | Grid `grid-cols-2 sm:3 md:4` + sidebar `lg:col-span-4` | Full-width grid **`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`**. **Sidebar dihapus** |
| User card | aspect-square, animated hover, gradient bg, ping dot, "Klik untuk Masuk/Keluar" label | aspect-square, solid bg, no animation, label inline/overlay. **Compact: h-10 w-10 avatar, text-[10px] nama** |
| Live status | Sidebar card with "Tim Bertugas" + animated pulse | **Strip horizontal tipis `overflow-x-auto flex gap-2`** di bawah grid — avatar 24px + nama. Hanya muncul saat ada yang bertugas. |
| Shift card | Sidebar with bg-blue-50/amber-50 | **Dihapus dari select step** — info shift cukup di face step |
| Geofencing | Sidebar warning card | **Full-width strip** di atas grid saat out-of-range |
| Pertanyaan | "SIAPA ANDA?" uppercase besar | "Pilih nama" teks normal, **`text-[11px]`** |
| **Responsive behavior** | Grid tetap 4 kolom di semua ukuran | **`grid-cols-2`** di mobile sempit (320px), **`sm:grid-cols-3`** (375px+), **`md:grid-cols-4`** (768px+), **`lg:grid-cols-5`** (1024px+). Card otomatis melebar. |

### Face Step — Face Recognition Cepat

| Aspek | Before | After |
|-------|--------|-------|
| Layout | `max-w-lg` dengan header info baris | `max-w-sm` mobile-first, info di atas kamera compact |
| Kamera | `aspect-[3/4]` portrait, interval scan 500ms | `aspect-[4/3]` landscape, **`requestAnimationFrame` loop** — scan real-time tanpa jeda |
| Deteksi | `detectAllFaces` | **`detectSingleFace`** dengan **TinyFaceDetector score ≥ 0.5** — 3-5x lebih cepat |
| Auto-process | Manual — user nunggu deteksi lalu proses | **Auto-verify** setelah 3 frame stabil — scan, verify, proses dalam 1 detik |
| Visual feedback | Teks status | **Live bounding box** — kotak hijau real-time di sekitar wajah |
| Loading models | useEffect mount | Preload dari select step, progress bar |
| Model error fallback | Toast error | Auto-redirect ke PIN step setelah 3 detik timeout |
| Re-enroll face | Tombol "DAFTAR ULANG WAJAH" di face step (tersembunyi) | **Tombol "Daftar Ulang Wajah" visible di face step** — klik → PIN → enroll face baru (tidak perlu pilih user ulang) |

### PIN Step

| Aspek | Before | After |
|-------|--------|-------|
| Layout | `max-w-sm` center | Sama — sudah mobile-friendly |
| Input | `h-12 md:h-14`, full border | `h-14` konsisten, border ringan |
| Tombol | Grid 2 kolom (KEMBALI + LANJUT) | Tetap 2 kolom, tapi tombol lebih besar (h-12) |
| Teks | "Halo {nama}, masukkan PIN untuk mendaftarkan biometrik baru" + KeyRound icon | Disesuaikan konteks: "Masukkan PIN" (untuk absen) atau "Daftarkan Wajah — masukkan PIN" (untuk enroll) |

### Success Step

| Aspek | Before | After |
|-------|--------|-------|
| Animasi | Scale from 0 + fade-in + blur glow + ping | **Fade-in sederhana** — check circle scale |
| Waktu redirect | 3 detik | **2 detik** |
| Layout | Card dengan decorative top gradient bar | Flat card, shadow ringan |
| Teks | "SUKSES!" uppercase besar + gradient text | "Berhasil!" teks hijau solid |

### Footer

| Aspek | Before | After |
|-------|--------|-------|
| Footer | `<Footer className="pb-8" />` | Footer dihapus — ganti dengan safe-area padding `pb-safe` |

---

## Spacing & CSS Constants Mapping

| Token | Before | After | Responsive |
|-------|--------|-------|------------|
| card-padding | `p-4`, `p-6` | `p-3` seragam | Sama semua ukuran |
| card-radius | `rounded-2xl` | `rounded-xl` seragam | Sama semua ukuran |
| header-height | `h-14` (56px) | `h-12` (48px) | `md:h-14` (56px desktop) |
| section-gap | `gap-4`, `space-y-4` | `gap-3` seragam | `md:gap-4` desktop |
| button-height | `h-10 md:h-12` | `h-12` konsisten | `md:h-14` desktop |
| icon-size (cards) | `h-12 w-12` | `h-10 w-10` | `md:h-12 md:w-12` desktop |
| font-heading | `text-xl md:text-2xl font-black` | `text-base font-bold` | `md:text-lg` desktop |
| font-subtitle | `text-xs font-medium` | `text-[11px] font-semibold` | Sama semua ukuran |
| user-card-avatar | `h-12 w-12` + `text-lg` | `h-10 w-10` + `text-sm` | `md:h-12 md:w-12 md:text-base` |
| user-card-name | `text-[11px] uppercase` | `text-[10px] font-bold` | `md:text-xs` desktop |
| main-padding | `p-3 md:p-8` | `p-3` | `md:p-6` desktop |
| camera-width | `max-w-lg` | `max-w-sm` | `md:max-w-md lg:max-w-lg` desktop |
| camera-aspect | `aspect-[3/4]` | `aspect-[4/3]` | Sama semua ukuran |
| grid-columns | `grid-cols-2 sm:3 md:4` | `grid-cols-2` | `sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5` |
| animate | `AnimatePresence, motion.div, whileHover, whileTap` | **Hapus AnimatePresence** — cukup `motion.div` fade-in (tanpa exit). `whileTap: scale(0.97)` saja | Sama semua ukuran |

---

## Per-Section Space Budget

| Section | Before (approx) | After (approx) | Savings |
|---------|----------------|----------------|---------|
| Header | 64px | 52px | 12px |
| Select: Title | 48px | 24px | 24px |
| Select: Grid | 320px | 280px | 40px |
| Select: Sidebar (live + shift + geo) | 280px | 40px (strip) | 240px |
| Face: Header info | 48px | 32px | 16px |
| Face: Camera | 400px | 320px | 80px |
| Face: Button area | 120px | 48px | 72px |
| PIN: Form + buttons | 200px | 200px | 0px |
| Success: Card | 320px | 240px | 80px |
| **Total** | ~1800px | ~1236px | ~**564px (31%)** |

---

## Step Flow (Unchanged)

```
Select → (hasFace? Face : PIN) → Face → (isEnrolling? enroll + clockIn : clockIn/clockOut) → Success → /home
Select → PIN fallback → (verify PIN → clockIn/clockOut) → Success → /home
```

Hanya UI yang diubah — logic flow tetap sama.

---

## Files to Change

### 1. `apps/web/src/routes/attendance.index.lazy.tsx` (PRIMARY)

Perubahan:

- **Header**: Simplifikasi judul jadi "Absensi", hapus chip shift (pindah ke face step), simpan chip lokasi (mobile: none or compact)
- **Select step**: 
  - Hapus `<div className="lg:col-span-4">` sidebar (live status, shift card, geofencing)
  - Pindah live status ke strip tipis di bawah grid (`<div className="flex gap-2 overflow-x-auto">` dengan avatar kecil)
  - Pindah geofencing warning ke full-width strip di atas grid
  - Hapus shift card (info shift pindah ke face step header)
  - Compact user cards: hapus `animate-ping`, gradient bg, decorative border. Gunakan flat card.
  - Label "BERTUGAS" / "OFF Duty" jadi overlay badge kecil di avatar
  - Hapus label "Klik untuk Masuk/Keluar" — cukup badge status
- **Face step**:
  - Ubah `max-w-lg` → `max-w-sm` (mobile-first)
  - Ubah `aspect-[3/4]` → `aspect-[4/3]` (landscape kamera)
  - Judul: "Absen Masuk" (hijau) atau "Absen Keluar" (kuning) — sederhana
  - Pindah shift info ke badge kecil di pojok
  - **Tombol area**: 
    - 1 tombol utama **"Absen Pakai PIN"** (PIN fallback — jika face reject atau user pilih PIN)
    - 1 tombol **"Daftar Ulang Wajah"** — visible, langsung trigger PIN → enroll flow. Tidak perlu kembali ke select step.
    - 1 tombol **"Ganti Identitas"** — kembali ke select step
  - Tombol disusun vertikal (stacked), tidak horizontal agar tidak sempit di mobile
  - Geofencing blocking: overlay di atas kamera dengan blur + strip warning
- **PIN step**: 
  - Sesuaikan teks konteks (enroll vs attendance)
  - Layout tetap sama
- **Success step**: 
  - Sederhanakan animasi (fade-in, scale check circle, tanpa blur glow)
  - Kurangi delay redirect jadi 2 detik
  - Teks: "Berhasil!" bukan "SUKSES!"
  - Hapus gradient bar di atas card
- **Global (responsif & compact)**:
  - Kurangi spacing: `p-4` → `p-3`, `gap-4` → `gap-3`
  - Hapus `rounded-2xl` → `rounded-xl`
  - Hapus decorative: gradient background, blur, glow, animate-ping, animate-bounce
  - Ganti `font-black` → `font-bold` (lebih profesional)
  - Ganti ukuran icon di user cards: `h-12 w-12` → `h-10 w-10` (`md:h-12 md:w-12`)
  - **Grid responsif**: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`
  - **Kamera responsif**: `max-w-sm md:max-w-md lg:max-w-lg`
  - **Header responsif**: `h-12 md:h-14`
  - **Tombol responsif**: `h-12 md:h-14`
  - **Tanpa scroll horizontal** di semua viewport — gunakan `overflow-hidden` atau `flex-wrap`

### 2. `apps/web/src/components/auth/FaceRecognition.tsx` (OPTIMASI UTAMA)

**Goal:** Scan wajah cepat, deteksi instan, auto-process tanpa tombol tambahan.

| Optimasi | Sebelum | Sesudah |
|----------|---------|---------|
| **Scan interval** | `setInterval` ~500ms | **`requestAnimationFrame` loop** — scan terus-menerus tanpa jeda, frame rate kamera alami |
| **Face detection** | `detectAllFaces` — scan semua wajah | **`detectSingleFace`** — scan 1 wajah (lebih cepat 3-5x), sudah cukup untuk absensi 1 orang |
| **Threshold** | standard | **TinyFaceDetector score ≥ 0.5** — lebih sensitif, wajah jarak jauh tetap terdeteksi |
| **Auto-verify** | User harus menatap kamera sampai tombol diproses | **Auto-verify saat face terdeteksi stabil 3 frame berturut-turut** — tidak perlu klik, scan lalu langsung proses |
| **Visual feedback** | Status "idle → scanning → success/fail" dengan teks | **Live bounding box overlay** di atas kamera — kotak hijau saat face detected, merah saat tidak. Status "✓ Wajah Terdeteksi" langsung |
| **Loading models** | `useEffect` mount — user menunggu | **`preloadFaceModels` wajib dipanggil** dari select step agar model sudah siap saat face step muncul. Tambahkan progress bar loading. |
| **Model error** | Toast error | **Fallback otomatis** — 3 detik timeout → auto-redirect ke PIN step dengan pesan "Kamera tidak tersedia, gunakan PIN" |

**Detail optimasi FaceRecognition component:**

```tsx
// Sebelum: interval 500ms
dRef.current = setInterval(async () => {
  // ...
}, 500);

// Sesudah: requestAnimationFrame loop + single face + auto-verify
let stableCount = 0;
async function scan() {
  if (!video || !loaded || alreadySuccess) return;
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  if (detection) {
    stableCount++;
    setSt("scanning");
    // Auto-verify after 3 stable frames
    if (stableCount >= 3 && mode === "verify" && onVerify) {
      alreadySuccess = true;
      await onVerify(detection.descriptor);
    }
  } else {
    stableCount = 0;
    setSt("idle");
  }
  if (!alreadySuccess) requestAnimationFrame(scan);
}
scan();
```

### 3. `apps/web/src/hooks/use-hybrid-attendance-data.ts` (tidak berubah)

Logic hooks tetap sama — hanya UI yang diubah.

---

## UX Flow — Smart Status Awareness

### Jika user sudah clocked in:

| Step | Tampilan |
|------|----------|
| Select step | User card: badge hijau "BERTUGAS", strip "Sedang Bertugas" |
| Face step | Judul: **"Absen Keluar"** (kuning/amber). Tombol PIN: **"Absen Keluar (PIN)"** |
| Success | **"Berhasil Absen Keluar"** — "Hati-hati di jalan!" |

### Jika user belum clocked in:

| Step | Tampilan |
|------|----------|
| Select step | User card: badge abu "Off Duty" |
| Face step | Judul: **"Absen Masuk"** (hijau/emerald). Tombol PIN: **"Absen Masuk (PIN)"** |
| Success | **"Berhasil Absen Masuk"** — "Semangat bekerja!" |

---

## Implementation Order

1. **FaceRecognition.tsx optimasi** — `requestAnimationFrame` loop, `detectSingleFace`, TinyFaceDetector threshold 0.5, auto-verify 3 frame stabil, live bounding box overlay, loading progress bar, 3 detik timeout fallback
2. **Spacing refactor**: Ubah semua `p-4`/`gap-4` → `p-3`/`gap-3`, `rounded-2xl` → `rounded-xl`, `font-black` → `font-bold`
3. **Header**: Simplifikasi judul, hapus chip shift, compact location chip
4. **Select step**: Hapus sidebar (live status, shift card, geo warning), restruktur grid jadi full-width, compact user cards, pindah live status ke strip bawah, geo warning ke strip atas
5. **Face step**: Ubah layout ke `max-w-sm`, ubah `aspect-[3/4]` → `aspect-[4/3]`, sederhanakan title, tombol "Daftar Ulang Wajah" + "Absen Pakai PIN" + "Ganti Identitas"
6. **Re-enroll flow**: Face step → klik "Daftar Ulang Wajah" → PIN step (konteks enroll) → Face step (mode enroll) → auto clock-in setelah enroll sukses
7. **PIN step**: Sesuaikan teks konteks
8. **Success step**: Sederhanakan animasi, kurangi delay
9. **Footer**: Hapus Footer component, ganti dengan `pb-safe`
10. **Hapus unused imports**: Periksa dan hapus icon lucide yang tidak terpakai
11. **Build verification**: `vite build`

---

## Verification

1. `vite build` — harus sukses tanpa error
2. **Responsive test** di 4 viewport:
   - 320px (Mobile S) — grid 2 kolom, kamera full-width, tanpa scroll horizontal
   - 375px (Mobile M — primary) — grid 3 kolom, semua elemen rapi
   - 768px (Tablet) — grid 4 kolom, kamera max-w-md
   - 1024px+ (Desktop) — grid 5 kolom, kamera max-w-lg
3. Manual test flow:
   - Buka `/attendance` → pilih user → face/PIN → success → redirect `/home`
   - PIN fallback (belum daftar wajah) → PIN → absen langsung
   - User sudah clock-in → tampilkan "Absen Keluar"
   - Klik dari `/home` → redirect ke `/attendance`
4. **Compactness check**:
   - Tidak ada padding/jarak berlebih (cek setiap section dengan DevTools)
   - Semua teks muat dalam 1 baris (tidak ada wrapping tidak sengaja)
   - Button area tidak tumpang tindih dengan safe-area
   - Total height halaman tidak overflow viewport

## Compactness Checklist

- [ ] `p-3` seragam di semua card (bukan campuran `p-3`, `p-4`, `p-6`)
- [ ] `gap-3` seragam (bukan campuran `gap-2`, `gap-3`, `gap-4`)
- [ ] `rounded-xl` seragam (bukan campuran `rounded-xl`, `rounded-2xl`)
- [ ] Tidak ada `animate-ping`, `animate-bounce`, `blur-2xl`, `bg-gradient-*`
- [ ] `h-12` header, `h-12` tombol (konsisten)
- [ ] Tidak ada scroll horizontal di viewport 320px
- [ ] Live status strip tidak mengambil >40px height
- [ ] Geofencing strip tidak mengambil >32px height

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Terlalu compact — informasi hilang | Informasi esensial tetap ada (status, shift, lokasi). Hanya dekorasi yang dihapus. |
| Sidebar dihapus — live status hilang di desktop | Pindah ke strip horizontal di bawah grid — lebih ringkas, tetap informatif. |
| Kamera aspect ratio berubah — wajah tidak terdeteksi | `aspect-[4/3]` tetap landscape cukup lebar untuk face-api.js yang butuh lebar minimal 320px. |
| User tidak bisa menemukan tombol ganti user | Tambahkan `...` menu di pojok kanan face step dengan opsi "Ganti Identitas" dan "Daftar Ulang Wajah". |

---

## Open Questions

1. Apakah `Footer` component memang perlu dihapus atau bisa disembunyikan hanya di /attendance? → Dihapus saja, `pb-safe` sudah cukup.
2. Animasi dihapus total atau ada yang dipertahankan? → Hanya `whileTap: scale(0.97)` dipertahankan untuk tactile feedback. Fade-in saja untuk transisi step.
3. Status chip lokasi di header — perlu di mobile? → Lebih baik disembunyikan di mobile (<md) karena geofencing strip di select step sudah cukup.
