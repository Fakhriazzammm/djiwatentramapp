# Plan: Onboarding Animasi Karyawan Baru di `/karyawan/$username`

## Goal

Buat animasi onboarding interaktif ketika karyawan baru pertama kali mengunjungi halaman profil mereka sendiri (`/karyawan/$username`). Onboarding berisi:

1. Animasi sambutan (interaktif, framer-motion)
2. Panduan mengisi data profil
3. Link grup Telegram: `https://t.me/addlist/076D_FFRNFw5ZWI1`
4. Tombol X untuk dismiss — setelah dismiss, tidak muncul lagi

---

## Current Context

### Halaman `/karyawan/$username`

| Item | Detail |
|---|---|
| **File** | `apps/web/src/routes/karyawan.$username.lazy.tsx` (889 lines) |
| **Component** | `StaffProfilePage` |
| **Animasi** | Sudah pakai `AnimatePresence` + `motion` dari framer-motion (line 27) |
| **Loading** | Spinner animasi (line 194) |
| **PIN Unlock** | `isUnlocked` state — data sensitif terkunci PIN |
| **Edit Mode** | `isEditMode` state — toggle edit profil |
| **Incomplete Data Badge** | Line 495-516 — badge amber jika ada field kosong |

### Data yang sudah ada

- `isUnlocked` → true jika user sudah unlock PIN
- `authUser.slug` → slug user yang login (untuk cek "apakah ini profil saya sendiri")
- `privateData.raw` → JSONB dengan field personal (phone, identityNumber, address, dll)
- `staff` → data publik karyawan (name, slug, role, dll)
- `isEditMode` → toggle untuk edit profil

### Tidak ada sistem "dismiss once" saat ini

- Belum ada localStorage key untuk tracking onboarding
- Belum ada komponen onboarding khusus

---

## Approach

### Trigger

Onboarding muncul jika **semua** kondisi terpenuhi:
1. User melihat profil mereka **sendiri** (`authUser.slug === username`)
2. Profil sudah di-unlock (`isUnlocked === true`)
3. Belum pernah di-dismiss (`localStorage` key tidak ada)

### Komponen

Buat komponen `OnboardingOverlay` inline di `StaffProfilePage` (tidak perlu file terpisah — cukup state + JSX di komponen utama).

### Animasi

Pakai `motion.div` dari framer-motion yang sudah di-import:
- Entry: fade in + scale (0.9 → 1) + y offset
- Steps: progress bar atau step indicator (1/2, 2/2)
- X button: fade out, set localStorage

### Dismissal

```typescript
const ONBOARDING_DISMISS_KEY = "karyawan_onboarding_dismissed";

// Cek di mount
const [showOnboarding, setShowOnboarding] = useState(() => {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(ONBOARDING_DISMISS_KEY);
});

const dismissOnboarding = () => {
  localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
  setShowOnboarding(false);
};
```

---

## UI/UX Specification

### States

| State | Behavior |
|---|---|
| **Not own profile** | Jangan tampilkan sama sekali |
| **Not unlocked** | Jangan tampilkan (tunggu PIN) |
| **Already dismissed** | Jangan tampilkan (cekT localStorage) |
| **Showing** | Overlay penuh dengan backdrop blur, animasi masuk |
| **Dismissing** | Animasi keluar (fade + scale), set localStorage |
| **Done** | Tidak muncul lagi di session manapun |

### Design

```
┌─────────────────────────────────────┐
│  [X]                              │
│                                     │
│   ✨ Selamat Datang di              │
│       DJIWA TENTRAM!                │
│                                     │
│   ┌─ Langkah 1/2 ─────────────────┐ │
│   │ 📋 Lengkapi Data Diri         │ │
│   │ Isi No HP, alamat, dan data   │ │
│   │ lainnya untuk administrasi.   │ │
│   │ [LENGKAPI SEKARANG]           │ │
│   └────────────────────────────────┘ │
│                                     │
│   ┌─ Langkah 2/2 ─────────────────┐ │
│   │ 💬 Gabung Grup Telegram       │ │
│   │ Dapatkan informasi terbaru    │ │
│   │ dan pengumuman penting.       │ │
│   │ [GABUNG GRUP]                 │ │
│   └────────────────────────────────┘ │
│                                     │
│   ─── atau ───                       │
│   [Nanti Saja]                      │
└─────────────────────────────────────┘
```

### Flow

1. User buka `/karyawan/[slug]` (profil sendiri)
2. Masukkan PIN → unlock
3. Setelah unlock, `OnboardingOverlay` muncul dengan animasi
4. User bisa:
   - Klik "LENGKAPI SEKARANG" → tutup overlay + set `isEditMode(true)` + scroll ke form
   - Klik "GABUNG GRUP" → buka link Telegram di tab baru
   - Klik "Nanti Saja" / X → dismiss, simpan ke localStorage
5. Setelah dismiss, tidak pernah muncul lagi

---

## Expanded Features

### 1. Progress Bar (0→1→2)

Progress bar dinamis yang menandai penyelesaian setiap langkah:

#### Mekanisme

| Step | Trigger Completed | Tampilan |
|---|---|---|
| **0/2** | Awal muncul | Bar kosong + text "0 dari 2" |
| **1/2** | Klik "LENGKAPI SEKARANG" | Bar 50% + centang di step 1 |
| **2/2** | Klik "GABUNG GRUP" | Bar 100% + centang di kedua step |
| **Dismiss** | Klik X/Nanti Saja | Overlay langsung hilang, tidak tracking |

#### Implementasi

```typescript
const [completedSteps, setCompletedSteps] = useState<number>(0);

const handleLengkapiData = () => {
  setCompletedSteps(1);
  dismissOnboarding();
  setIsEditMode(true);
};

const handleGabungGrup = () => {
  setCompletedSteps(2);
  window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank");
};
```

#### UI

```tsx
{/* Progress Bar */}
<div className="mb-5">
  <div className="flex items-center justify-between mb-1.5">
    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      {completedSteps === 0 ? "Baru Mulai" : completedSteps === 1 ? "1 Langkah Selesai" : "Selesai!"}
    </span>
    <span className="text-[9px] font-bold text-muted-foreground">{completedSteps}/2</span>
  </div>
  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
    <motion.div
      initial={{ width: "0%" }}
      animate={{ width: `${(completedSteps / 2) * 100}%` }}
      transition={{ type: "spring", damping: 20, stiffness: 200 }}
      className={`h-full rounded-full ${
        completedSteps === 2 ? "bg-emerald-500" : "bg-primary"
      }`}
    />
  </div>
</div>
```

#### Perubahan di step card

Setelah user klik tombol di suatu step, card step berubah:

```tsx
{/* Step card — completed state */}
{completedSteps >= 1 ? (
  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-3">
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
        <Check className="h-4 w-4" />
      </div>
      <div>
        <p className="font-bold text-sm text-emerald-800">Data Diri ✓</p>
        <p className="text-[11px] text-emerald-600">Sudah dilengkapi</p>
      </div>
    </div>
  </div>
) : (
  // ... existing step card ...
)}
```

> **Catatan:** `Check` perlu ditambah ke import lucide-react. Tapi `Check` belum ada di line 7-24 — perlu tambah `Check` ke import.

---

### 2. Confetti/Celebration Efek Setelah Dismiss

Saat user menekan "Nanti Saja" atau X, overlay tidak langsung hilang — ada **celebration micro-animation** 800ms sebelum dismiss.

#### Implementasi (tanpa library tambahan — pure CSS + framer-motion)

Gunakan teknik **partikel CSS** sederhana yang sudah ada stylingnya di Tailwind:

```tsx
const [isCelebrating, setIsCelebrating] = useState(false);

const dismissOnboarding = () => {
  setIsCelebrating(true);
  setTimeout(() => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
    setShowOnboarding(false);
    setIsCelebrating(false);
    setCompletedSteps(0); // reset untuk next time
  }, 800);
};
```

#### Partikel Konfeti (CSS-only — ringan, tidak perlu library)

```tsx
{isCelebrating && (
  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
    {Array.from({ length: 12 }).map((_, i) => (
      <motion.div
        key={i}
        className="absolute h-2 w-2 rounded-full"
        style={{
          left: `${10 + Math.random() * 80}%`,
          top: `${10 + Math.random() * 40}%`,
          background: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5],
        }}
        initial={{ opacity: 1, scale: 1, y: 0 }}
        animate={{
          opacity: 0,
          scale: 0,
          y: -80 - Math.random() * 120,
          x: (Math.random() - 0.5) * 60,
          rotate: Math.random() * 360,
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    ))}
    {/* Checkmark besar di tengah */}
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1.5, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
        <Check className="h-8 w-8 text-white" />
      </div>
    </motion.div>
  </div>
)}
```

#### Detail timing

| Frame | Waktu | Aksi |
|---|---|---|
| 0ms | Dismiss klik | `isCelebrating = true`, partikel muncul |
| 200ms | Partikel memuncak | Checkmark besar muncul + scale up |
| 600ms | Partikel fade out | Checkmark fade out |
| 800ms | Selesai | localStorage set, overlay hilang |

> **Catatan:** Celebrasi hanya untuk dismiss via X/Nanti Saja. Kalau user klik "LENGKAPI SEKARANG", langsung dismiss tanpa celebrasi (lebih cepat action).

---

### 3. Tooltip/Arrow Pointing ke Tombol EDIT PROFIL

Setelah user klik "LENGKAPI SEKARANG", overlay dismiss dan `isEditMode(true)`. Tapi user mungkin bingung — "di mana formnya?".

Tooltip mengarahkan mata user ke tombol EDIT PROFIL yang ada di atas form data pribadi.

#### Implementasi

Gunakan animasi `ping` + arrow sederhana:

```typescript
const [showEditTooltip, setShowEditTooltip] = useState(false);

const handleLengkapiData = () => {
  dismissOnboarding();
  setIsEditMode(true);
  setShowEditTooltip(true);
  // Tooltip auto-hide setelah 4 detik
  setTimeout(() => setShowEditTooltip(false), 4000);
};
```

#### Tooltip Position

Tombol EDIT PROFIL ada di line 525-532, di dalam section "Data Pribadi":

```tsx
<Button 
  variant="ghost" 
  size="sm" 
  className="text-xs font-bold"
  onClick={() => setIsEditMode(!isEditMode)}
>
  {isEditMode ? "BATAL" : "EDIT PROFIL"}
</Button>
```

Tooltip muncul di sebelah kanan tombol ini:

```tsx
{showEditTooltip && (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0 }}
    className="relative inline-flex items-center gap-2 ml-2"
  >
    {/* Arrow */}
    <motion.div
      animate={{ x: [0, 4, 0] }}
      transition={{ repeat: Infinity, duration: 1.5 }}
      className="text-primary"
    >
      <span className="text-lg">👉</span>
    </motion.div>
    {/* Bubble */}
    <span className="whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">
      Isi data dirimu di sini!
    </span>
  </motion.div>
)}
```

#### Placement di komponen

Tooltip harus di-render di dekat tombol EDIT PROFIL (line ~529). Karena tombol ini ada di dalam render `StaffProfilePage`, state `showEditTooltip` perlu di-pass atau langsung diakses (satu komponen yang sama — tidak masalah).

**Lokasi tepat penempatan:** Setelah line 533 (`</Button>`) di dalam div `flex items-center justify-between`:

```tsx
<div className="flex items-center justify-between px-2">
  <h3>...</h3>
  <div className="flex items-center gap-1">
    <Button onClick={...}>EDIT PROFIL</Button>
    {showEditTooltip && (
      <motion.div ...>👉 Isi data dirimu di sini!</motion.div>
    )}
  </div>
</div>
```

---

### 4. Mobile-First & Desktop Layout

#### Pendekatan

**Mobile-first** — overlay dirancang untuk layar HP dulu (modal penuh), lalu diperluas untuk desktop.

| Viewport | Layout | Ukuran Modal | Backdrop |
|---|---|---|---|
| **Mobile (< 640px)** | Full-width, padding 16px | `max-w-full` rounded-t-2xl dari bawah | Backdrop blur |
| **Tablet (640-1024px)** | Tengah, terbatas | `max-w-md` rounded-2xl | Backdrop blur |
| **Desktop (> 1024px)** | Tengah, kompak | `max-w-sm` rounded-2xl | Backdrop blur + larger padding |

#### CSS Implementation

```tsx
// Container — mobile-first
className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"

// Modal
className={cn(
  "relative w-full rounded-t-2xl sm:rounded-2xl bg-card",
  "sm:max-w-md",
  "p-5 sm:p-6",
  "shadow-2xl border",
  "max-h-[90vh] overflow-y-auto"
)}
```

#### Mobile-specific: Bottom Sheet

Di mobile, overlay muncul dari bawah (seperti bottom sheet):

```tsx
<motion.div
  initial={{ opacity: 0, y: "100%" }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: "100%" }}
  transition={{ type: "spring", damping: 30, stiffness: 300 }}
  className={cn(
    "relative w-full bg-card border",
    "rounded-t-2xl sm:rounded-2xl",
    "sm:max-w-md sm:mx-auto",
    "p-5 sm:p-6",
    "shadow-2xl",
    "max-h-[85vh] overflow-y-auto"
  )}
>
```

Untuk desktop, animasi berubah jadi scale-up:

```tsx
// Bungkus motion.div dengan AnimatePresence yang beda berdasarkan viewport
// Atau gunakan CSS media query di animation props
```

**Simplifikasi:** Gunakan 1 animasi spring untuk semua viewport — spring scale-up. Bottom sheet terlihat aneh di desktop. Scale-up terlihat baik di semua ukuran.

```tsx
// Entry: scale + fade (universal — baik di mobile maupun desktop)
initial={{ opacity: 0, scale: 0.9, y: 20 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 10 }}
```

#### Responsive Font Sizes

```tsx
// Title
className="text-lg sm:text-xl font-black tracking-tight"

// Step number
className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm sm:text-base font-black text-primary"

// Step description
className="text-[11px] sm:text-xs text-muted-foreground mt-0.5"
```

#### Safe Area (Notch iPhone)

```tsx
// Tambah pb-safe di mobile
className="p-5 sm:p-6 pb-8 sm:pb-6"
```

---

## State Management Summary

Semua state baru yang perlu ditambahkan:

| State | Type | Default | Fungsi |
|---|---|---|---|
| `showOnboarding` | `boolean` | `localStorage` check | Overlay visible |
| `completedSteps` | `number` | 0 | Progress bar (0-2) |
| `isCelebrating` | `boolean` | false | Confetti animation |
| `showEditTooltip` | `boolean` | false | Tooltip arrow ke EDIT PROFIL |

**Import tambahan:**
- `Check` dari `lucide-react` (untuk centang di progress & confetti)
- `cn` dari `clsx` utility atau class-variance-authority (opsional — bisa pakai template literal biasa)

| File | Perubahan |
|---|---|
| `apps/web/src/routes/karyawan.$username.lazy.tsx` | Tambah state `showOnboarding` + `dismissOnboarding` + render `OnboardingOverlay` setelah unlock |

**Tidak ada file lain yang berubah.** Tidak perlu migration DB, tidak perlu hook baru, tidak perlu backend.

---

## Step-by-step Implementation

### Step 1: Tambah state & localStorage check

Di `StaffProfilePage`, setelah state yang sudah ada:

```typescript
const ONBOARDING_DISMISS_KEY = "karyawan_onboarding_dismissed";

const [showOnboarding, setShowOnboarding] = useState(() => {
  if (typeof window === "undefined") return false;
  // Hanya tampilkan jika user melihat profil sendiri
  if (authUser?.slug !== username) return false;
  return !localStorage.getItem(ONBOARDING_DISMISS_KEY);
});

const dismissOnboarding = useCallback(() => {
  localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
  setShowOnboarding(false);
}, []);
```

### Step 2: Render overlay setelah unlock

Di dalam return, setelah `<AnimatePresence mode="wait">` atau di dekat render utama, tambah:

```tsx
{/* Onboarding Overlay */}
<AnimatePresence>
  {showOnboarding && isUnlocked && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border"
      >
        {/* X button */}
        <button
          onClick={dismissOnboarding}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Welcome */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 15 }}
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"
          >
            <span className="text-2xl">✨</span>
          </motion.div>
          <h2 className="text-lg font-black tracking-tight">Selamat Datang!</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Selesaikan 2 langkah berikut untuk memulai.
          </p>
        </div>

        {/* Step 1: Lengkapi Data */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border p-3.5 mb-3"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-black text-primary">
              1
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Lengkapi Data Diri</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Isi No HP, alamat, dan data lainnya agar administrasi lebih mudah.
              </p>
              <Button
                size="sm"
                className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3"
                onClick={() => { dismissOnboarding(); setIsEditMode(true); }}
              >
                LENGKAPI SEKARANG
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Step 2: Telegram Group */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl border p-3.5 mb-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sm font-black text-sky-600">
              2
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Gabung Grup Telegram</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Dapatkan informasi terbaru, pengumuman, dan update dari tim.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3"
                onClick={() => window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank")}
              >
                GABUNG GRUP
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Skip */}
        <div className="text-center">
          <button
            onClick={dismissOnboarding}
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Nanti Saja
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### Step 3: Build & verifikasi

```bash
cd /opt/djiwatentramapp/apps/web && /home/ubuntu/.bun/bin/bun run check-types 2>&1 | grep -i "karyawan"
cd /opt/djiwatentramapp/apps/web && /home/ubuntu/.bun/bin/bun run build 2>&1 | tail -10
```

---

## Verification

1. Buka `/karyawan/[slug]` (profil sendiri) → unlock PIN
2. ✅ Onboarding muncul dengan animasi
3. Klik "LENGKAPI SEKARANG" → overlay hilang → edit mode aktif
4. Klik "GABUNG GRUP" → link Telegram terbuka di tab baru
5. Klik X / "Nanti Saja" → overlay hilang → refresh halaman → **tidak muncul lagi**
6. Buka profil orang lain → tidak muncul (hanya untuk profil sendiri)

---

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Overlay menutupi konten penting | Hanya muncul sekali — setelah dismiss, tidak pernah lagi |
| User tidak bisa akses halaman | Overlay bisa di-dismiss kapan saja via X atau "Nanti Saja" |
| Animasi terlalu berat di mobile | Cuma 2 motion.div dengan spring ringan — framer-motion sudah ada |
| Link Telegram invalid | Link sudah di-test: `https://t.me/addlist/076D_FFRNFw5ZWI1` |

---

## Files NOT Changed

- Database — tidak perlu
- Backend / Edge Functions — tidak perlu
- Hooks — tidak perlu
- Auth — tidak perlu
- Sidebar — tidak perlu
