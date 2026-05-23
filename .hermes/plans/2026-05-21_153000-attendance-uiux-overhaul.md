# Plan: UI/UX Overhaul Halaman /attendance

## Goal
Perbaiki UI/UX halaman `/attendance` menjadi profesional, compact, cepat, interaktif dengan animasi ringan, responsif mobile, dan data detail tetap lengkap.

---

## Current Context

### File target
- **Route:** `/opt/djiwatentramapp/apps/web/src/routes/attendance.index.lazy.tsx` (875 lines)
- **Route def:** `/opt/djiwatentramapp/apps/web/src/routes/attendance.index.tsx` (3 lines)
- **Dep:** `FaceRecognition` component (already simplified — 279 lines)
- **Dep:** `@/hooks/use-hybrid-attendance-data` — hooks for staff, logs, currently-in-store
- **Dep:** `@/hooks/use-hybrid-write-actions` — clockIn, clockOut, enrollFace, verifyPin

### Current sections (4-step flow)

| Step | Lines | Fungsi |
|---|---|---|
| **Background** | 343-347 | 2 animated gradient blobs dengan `blur-[120px]` + `animate-pulse` |
| **Header** | 349-404 | Logo "Portal Presensi", shift chip, location chip, back button |
| **Select** | 408-582 | User grid (kiri) + Live Status Board + Shift Info + Geofencing Warning (kanan) |
| **PIN** | 585-634 | Input PIN 6 digit + submit |
| **Face** | 636-772 | FaceRecognition + fallback button PIN + daftar ulang wajah |
| **Success** | 775-862 | Animasi sukses + celebration particles + redirect |

### Current pain points
- **Border-radius overused**: `rounded-[2rem]`, `rounded-[2.5rem]`, `rounded-[3rem]`, `rounded-[1.6rem]` — tidak konsisten dan terlalu melengkung untuk kesan profesional
- **Animated background blobs**: 2 div dengan `blur-[120px]` + `animate-pulse` — berat dan tidak perlu
- **Celebration particles**: 12 `motion.div` spring-animated di success step — sudah dihapus dari FaceRecognition, harus konsisten
- **Spring animations**: `type: "spring"` di success step — terlalu berat untuk mobile
- **Card spacing**: `p-8`, `p-12` di beberapa tempat — terlalu besar untuk mobile
- **Statis layout**: User grid + Live Status Board dalam grid — di mobile jadi stack vertikal, lumayan

---

## Proposed Approach

### Design philosophy

| Prinsip | Penerapan |
|---|---|
| **Professional** | Border-radius seragam `rounded-xl`/`rounded-2xl`, tanpa flutter curve berlebihan |
| **Compact** | Padding minimal `p-3`/`p-4`, font lebih kecil di mobile |
| **Cepat** | Hapus animasi berat (blur background, spring, confetti), ganti fade-in/scale simpel |
| **Interaktif** | Animasi ringan tetap ada: fade-in step transisi, scale on tap, pulse di status |
| **Responsif mobile** | `max-w` untuk desktop, full-width di mobile, compact padding |

### CSS constants mapping

| Token | Current | Target |
|---|---|---|
| card-radius | `rounded-[2rem]`, `rounded-[2.5rem]`, `rounded-[3rem]` | `rounded-2xl` |
| card-padding | `p-6`, `p-8`, `p-12` | `p-4`, `p-5`, `p-6` |
| avatar-size | `h-16 w-16` | `h-12 w-12` |
| font-title | `text-2xl md:text-3xl` | `text-xl md:text-2xl` |
| font-value | `text-lg` | `text-sm` |
| input-height | `h-16 md:h-20` | `h-12 md:h-14` |
| blur-bg | `blur-[120px] animate-pulse` | dihapus |
| gap-grid | `gap-6 lg:gap-12` | `gap-4 lg:gap-6` |
| chip-spacing | `px-4 py-1.5` | `px-3 py-1` |

---

## Step-by-step Plan

### Step 1: Hilangkan animated background blobs (lines 343-347)
Hapus 2 div gradient blur yang melakukan `animate-pulse` dengan `blur-[120px]`.

### Step 2: Compact Header (lines 349-404)
- Compact logo: `h-11 w-11` → `h-9 w-9`, `rounded-2xl` → `rounded-xl`
- Title: `text-lg md:text-xl` → `text-sm md:text-lg`
- Shift chip: `hidden sm:flex` → `hidden md:flex`, compact padding
- Location chip: compact padding, `sm:flex` → `md:flex`
- Back button: compact

### Step 3: Compact Select Step — User Grid (lines 408-478)
- Title: `text-2xl md:text-3xl` → `text-xl md:text-2xl`
- Grid gap: `gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-6` → `gap-2 sm:grid-cols-3 md:grid-cols-4 md:gap-3`
- User card: `aspect-square rounded-[1.6rem] md:rounded-[2rem] p-4 md:p-6` → `aspect-square rounded-xl p-3`
- Avatar: `h-16 w-16 rounded-2xl text-2xl` → `h-12 w-12 rounded-xl text-lg`
- Label: `text-sm` → `text-[11px]`
- Button chip: compact padding

### Step 4: Compact Select Step — Live Status Board (lines 481-580)
- Card: `rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-8` → `rounded-2xl p-4`
- Icon decoration: `h-32 w-32 opacity-[0.03]` — hapus (decorative, tidak perlu)
- Title: `text-lg` → `text-sm`
- Staff item: `p-4 rounded-2xl` → `p-3 rounded-xl`
- Avatar: `h-10 w-10 rounded-xl` → `h-8 w-8 rounded-lg`
- Shift info card: `rounded-[1.6rem] md:rounded-[2rem] p-4 md:p-5` → `rounded-2xl p-3`
- Geofencing warning: `rounded-3xl p-5 md:p-6` → `rounded-xl p-3`

### Step 5: Compact PIN Step (lines 585-634)
- Icon: `h-16 w-16 rounded-[2rem]` → `h-12 w-12 rounded-xl`
- Title: `text-2xl md:text-3xl` → `text-xl md:text-2xl`
- Input: `h-16 md:h-20 rounded-[1.6rem] md:rounded-[2rem]` → `h-12 md:h-14 rounded-xl`
- Buttons: `h-12 md:h-16` → `h-10 md:h-12`

### Step 6: Compact Face Step (lines 636-772)
- Title font: compact
- Shift chip & location chip: compact
- FaceRecognition wrapper: compact
- Fallback buttons: `h-14` → `h-11`
- "Ganti Identitas" button: compact

### Step 7: Simplify Success Step (lines 775-862)
- Card: `rounded-[3rem] p-12` → `rounded-2xl p-6`
- Hapus celebration particles (12 motion.div)
- Hapus spring animation pada check circle — ganti dengan scale fade-in simpel
- Compact success icon: `h-32 w-32` → `h-24 w-24`
- Compact text spacing

### Step 8: Animasi — konsisten dan ringan
- Step transisi: `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}` — pertahankan (ringan)
- Hapus `scale` transitions pada face step — cukup fade
- Hapus semua spring animation — ganti dengan `transition={{ duration: 0.3 }}`
- Hapus `animate-pulse` pada background blobs
- User card: `whileHover={{ scale: 1.05 }}` → `whileHover={{ scale: 1.02 }}`

### Step 9: Verifikasi Build
- `cd /opt/djiwatentramapp/apps/web && npx vite build`

---

## Files changed
1. `apps/web/src/routes/attendance.index.lazy.tsx` — main changes (estimated: 875 → ~600 lines)

## Files NOT changed
- `FaceRecognition.tsx` — already simplified
- Hooks — no logic changes needed
- Database — no schema changes

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Terlalu compact jadi cramped | Gunakan `gap-2`/`gap-3` untuk breathing room antar elemen |
| Animasi dihapus semua jadi terasa kaku | Pertahankan fade transisi antar step + hover scale pada interactive elements |
| Border-radius terlalu kecil jadi kaku | `rounded-2xl` (16px) masih cukup lembut |
| Perubahan layout merusak readability di desktop | Test dengan browser tools setelah build |

## Verification
1. `npx vite build` — must pass
2. Manual test: flow select → pin → face → success di mobile viewport (375px)
3. Pastikan status chips (shift, location) masih visible di desktop
