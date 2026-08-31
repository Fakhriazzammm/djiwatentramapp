# Djiwa Tentram → Plastix-Level UI/UX Upgrade Plan

> **Goal:** Menaikkan kualitas UI/UX Djiwa Tentram (POS, Admin, Karyawan, Customer) ke level Plastix — premium, mobile-native feel, cohesive brand.

## 🔍 Analisis Gap

### Plastix Design Essence
| Aspek | Plastix | Djiwa Tentram (saat ini) |
|-------|---------|--------------------------|
| Font body | **Geist** (clean, modern) | Plus Jakarta Sans (sama dgn display) |
| Font display | **Plus Jakarta Sans** (bold) | Plus Jakarta Sans (sama dgn body) |
| Accent | Lime `#B6FF00` — bold, cohesive | Blue `#1a5dc6` — ok, beda brand |
| Mobile shell | `max-width: 430px`, centered, shadow | Responsive penuh (no shell) |
| Focus ring | Ink + accent outline — distinctive | Blue ring standard |
| Selection color | Accent bg — brand cohesive | Default browser |
| Komponen | Minimal: Button, Card, Badge, Progress | Komprehensif: 8+ komponen |
| Animasi | `motion` (framer-motion) + CSS rise | CSS transitions + iOS curve ✅ |
| States | `AsyncBoundary` — 1 component, 3 states | Terpisah: EmptyState, ErrorState, Skeleton |
| Shadow | 2-tier: shadow-1, shadow-2 | 2-tier ✅ |
| Card radius | 24px | 24px ✅ |
| Control radius | 14px | 14px ✅ |
| iOS curve | `.32,.72,0,1` | Sama ✅ |

### Yang Perlu Diubah

| Prioritas | Perubahan | Level | Risiko |
|-----------|-----------|-------|--------|
| 🔴 P1 | **Font system: Geist untuk body, PJS untuk display** | theme.css + index.css semua app | Rendah — additive |
| 🔴 P1 | **Mobile shell** untuk karyawan & customer app | `__root.tsx` + layout | Rendah — wrapper |
| 🟠 P2 | **Selection color** + **focus ring** branded | theme.css | Rendah — CSS |
| 🟠 P2 | **Entry animations** (ios rise) | theme.css | Rendah — CSS |
| 🟡 P3 | **Button refinement** — match Plastix quality | `button.tsx` | Rendah — visual only |
| 🟡 P3 | **Card refinement** — simplify | `app-card.tsx` | Rendah — additive |
| 🟡 P3 | **AsyncBoundary pattern** — port dari Plastix | `states.tsx` baru | Rendah — additive |
| 🔵 P4 | **motion library** untuk page transitions | package.json + theme | Sedang — dep baru |

---

## ⚖️ Dua Approach

### APPROACH A: Incremental (Safe) — ✅ Rekomendasi

**Filosofi:** Additive changes only. Tidak ada rewrite. Setiap perubahan terisolasi dan bisa diverifikasi independen.

**Wave 1 — Font System + Theme (5 files, paralel 🔥)**
| Task | File | Perubahan |
|------|------|-----------|
| A1 | `packages/yumipos-web-shared/src/theme.css` | Tambah `--font-display: PJS`, `--font-body: Geist`, selection color, focus ring, entry animations |
| A2 | `apps/pos/src/index.css` | Tambah `@import url(...Geist...)` |
| A3 | `apps/admin/src/index.css` | Tambah `@import url(...Geist...)` |
| A4 | `apps/karyawan/src/index.css` | Tambah `@import url(...Geist...)` |
| A5 | `apps/customer/src/index.css` | Tambah `@import url(...Geist...)` |

**Wave 2 — Mobile Shell (2 files, paralel 🔥)**
| Task | File | Perubahan |
|------|------|-----------|
| A6 | `apps/karyawan/src/routes/__root.tsx` | Bungkus `<Outlet />` dgn `.mobile-shell` |
| A7 | `apps/customer/src/routes/__root.tsx` | Bungkus `<Outlet />` dgn `.mobile-shell` |

**Wave 3 — Component Polish (3 files, paralel 🔥)**
| Task | File | Perubahan |
|------|------|-----------|
| A8 | `packages/.../button.tsx` | Refine loading state, tambah `font-display` utk bold variant |
| A9 | `packages/.../states.tsx` | Tambah `AsyncBoundary` pattern (port dari Plastix) |
| A10 | `packages/.../app-card.tsx` | Simplify API, tambah `card-elevated` variant |

**Wave 4 — Verifikasi**
| Task | File | Perubahan |
|------|------|-----------|
| A11 | Build all 4 apps | `TMPDIR=/opt/djiwatentramapp/.tmp bun run build` |
| A12 | Screenshot verify | `browser_navigate` tiap app |

**Dampak jika gagal:**
- Font gagal load → fallback ke system font (safe)
- Mobile shell salah → layout normal tetap jalan (hanya wrapper)
- Component polish gagal → komponen lama tetap ada

### APPROACH B: Rewrite Components (High Impact, Higher Risk)

**Filosofi:** Rewrite 4 komponen utama shared package agar lebih sederhana, berani, dan "Plastix-like".

**Yang di-rewrite:**

| Komponen | Lama | Baru (Plastix-inspired) |
|----------|------|------------------------|
| **Button** | 6 variant × 7 size = 42 combos | 3 variant (default/outline/ghost), 3 size (sm/md/lg), `h-11`, `rounded-[14px]`, bold, loading spinner inline |
| **Card** | `AppCard` + `AppCardHeader` + `app-card-strong` | `Card` — single class, `.card` / `.card-elevated`, 24px radius, soft shadow |
| **States** | `EmptyState` + `ErrorState` terpisah | `AsyncBoundary<T>` — 1 component handles loading/error/empty, port persis dari Plastix |
| **Skeleton** | 3 shapes (rounded/circle/square) | `CardSkeleton` — simple, `animate-pulse`, `rounded-2xl` |

**Risiko Rewrite:**
1. **Breaking changes** — Semua halaman yang import `Button`/`AppCard`/`EmptyState`/`ErrorState` perlu diupdate
2. **41 import** `@yumipos/web-shared` di codebase — perlu audit tiap file
3. **Testing** — perlu regression test di semua 4 apps
4. **Waktu** — 2-3x lebih lama dari Approach A

**Mitigasi:**
- Buat komponen BARU dengan nama baru (`ButtonNew` → `Button` setelah migrasi selesai)
- Jangan hapus komponen lama sampai semua usage di-migrate
- Migrasi per-app, bukan sekaligus

---

## 📊 Perbandingan Approach

| Aspek | Approach A (Incremental) | Approach B (Rewrite) |
|-------|-------------------------|---------------------|
| ⏱️ Waktu | ~30-45 menit | ~2-3 jam |
| 🔥 Dampak visual | 80% dari target | 100% dari target |
| ⚠️ Risiko | Sangat rendah | Sedang-tinggi |
| 🔧 Perubahan file | ~10 files | ~20+ files |
| 🔄 Regression | Minimal | Perlu test tiap halaman |
| 🧹 Technical debt | Tidak bertambah | Mengurangi (simplifikasi) |
| 📦 Bundle size | +Geist font (~16KB) | Sama |

---

## 💡 Rekomendasi

**Approach A (Incremental) dulu.** 
- Beri hasil 80% dalam 1/4 waktu
- Zero risk regression
- Kalau hasilnya kurang memuaskan, baru Approach B untuk komponen tertentu

**Tapi untuk "rasa Plastix" yang sebenarnya**, Approach B tetap diperlukan untuk:
1. `Button` — simplify API + loading state
2. `AsyncBoundary` — pola loading/error/empty yang lebih elegan
3. `CardSkeleton` — skeleton yang lebih premium

---

## 🚀 Execution Plan

### Wave 1: Font System + Theme Tokens (5 file, paralel 🔥)

#### Task A1: Update theme.css — tambah font system, selection, focus, animations

**File:** `packages/yumipos-web-shared/src/theme.css`

**Changes:**
```css
/* ── Font System (DNA §10 — Display ≠ Body) ── */
:root {
  --font-body: "Geist Variable", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif;
  --font-display: "Plus Jakarta Sans", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif;
}

@theme inline {
  --font-sans: var(--font-body);
  --font-display: var(--font-display);
}

/* ── Brand Selection (DNA §10) ── */
::selection {
  background: color-mix(in srgb, var(--primary) 30%, transparent 70%);
  color: var(--foreground);
}

/* ── Focus Ring (inspired by Plastix) ── */
*:focus-visible {
  outline: 2px solid var(--ink, var(--foreground));
  outline-offset: 3px;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 35%, transparent 65%);
  border-radius: var(--radius-md, 0.5rem);
}

/* ── Entry Animations (inspired by Plastix animate-rise) ── */
@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-rise {
  animation: rise 0.44s cubic-bezier(.32,.72,0,1) both;
}
```

#### Task A2-A5: Tambah Geist font import di tiap app

**File:** `apps/pos/src/index.css`, `apps/admin/src/index.css`, `apps/karyawan/src/index.css`, `apps/customer/src/index.css`

**Add after existing PJS font import:**
```css
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap");
```

---

### Wave 2: Mobile Shell (2 file, paralel 🔥)

#### Task A6: Karyawan app — mobile shell wrapper

**File:** `apps/karyawan/src/routes/__root.tsx`

**Change:** Wrap `<Outlet />` dengan `mobile-shell`:
```tsx
return (
  <YumiAuthProvider>
    <RootErrorBoundary>
      <div className="mobile-shell">
        <RootContent />
      </div>
    </RootErrorBoundary>
  </YumiAuthProvider>
);
```

#### Task A7: Customer app — mobile shell wrapper

**File:** `apps/customer/src/routes/__root.tsx`

**Sama seperti A6.** Bungkus root content dengan `mobile-shell`.

---

### Wave 3: Component Polish (3 file, paralel 🔥)

#### Task A8: Button — refine loading state + font-display

**File:** `packages/yumipos-web-shared/src/components/ui/button.tsx`

**Changes:**
- `font-semibold` → `font-bold` (Plastix uses bold)
- Loading spinner: use CSS-only spinner (like Plastix's `border-2 border-white/30 border-t-white`)
- Add `font-display` class for primary variant

#### Task A9: Port AsyncBoundary dari Plastix

**File:** `packages/yumipos-web-shared/src/components/ui/states.tsx`

**Add new component:**
```tsx
/**
 * AsyncBoundary — ported from Plastix
 * One component for loading/error/empty states.
 */
export function AsyncBoundary<T>({
  query,
  children,
  skeleton,
  empty = false,
}: {
  query: { isLoading: boolean; isError: boolean; data: T | undefined; error: Error | null; refetch: () => void };
  children: (data: T) => React.ReactNode;
  skeleton?: React.ReactNode;
  empty?: boolean | ((data: T) => boolean);
}) {
  if (query.isLoading) return skeleton ?? <CardSkeleton />;
  if (query.isError) return <ErrorState title="Gagal memuat data" onRetry={() => query.refetch()} />;
  const data = query.data;
  const isEmpty = data !== undefined && (typeof empty === "function" ? empty(data) : empty);
  if (isEmpty || data === undefined) return <EmptyState />;
  return <>{children(data)}</>;
}
```

#### Task A10: AppCard — simplify + elevated variant

**File:** `packages/yumipos-web-shared/src/components/ui/app-card.tsx`

**Add `elevated` prop:**
```tsx
function AppCard({
  className,
  elevated = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={cn(
        elevated ? "card-elevated" : "app-card",
        "p-5 sm:p-6 lift-ios",
        className
      )}
      data-slot="app-card"
      {...props}
    >
      {children}
    </div>
  );
}
```

---

### Wave 4: Build & Verify

#### Task A11: Build all apps
```bash
TMPDIR=/opt/djiwatentramapp/.tmp bun run build
```

#### Task A12: Visual verification
- Navigate to POS, Admin, Karyawan, Customer
- Screenshot via `browser_vision` or minta screenshot dari user

---

## 📋 Checklist Verifikasi

- [ ] Font Geist muncul di body text (inspect element)
- [ ] Font PJS muncul di headings (h1-h6)
- [ ] Selection color memakai brand blue (bukan default)
- [ ] Focus ring memiliki accent color (bukan blue ring doang)
- [ ] Entry animation `animate-rise` bekerja di halaman
- [ ] Mobile shell di karyawan app: max-width 430px, centered
- [ ] Mobile shell di customer app: max-width 430px, centered
- [ ] EmptyState/ErrorState tidak broken
- [ ] Button loading state menggunakan CSS spinner
- [ ] Build success di semua 4 apps
- [ ] Tidak ada error console baru

---

## Ringkasan

**Approach A (Incremental):** ~10 files, ~1 jam, risiko rendah, 80% hasil
**Approach B (Rewrite):** ~20+ files, ~3 jam, risiko sedang, 100% hasil

**Rekomendasi: Approach A dulu.** Kalau kurang puas, approach B bisa dilakukan per-komponen setelahnya.