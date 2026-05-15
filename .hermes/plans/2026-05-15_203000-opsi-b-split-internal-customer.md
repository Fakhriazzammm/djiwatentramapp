# Plan: Split Monorepo — Option B (Internal + Customer)

**Date:** 2026-05-15
**Author:** Hermes Agent
**Status:** Draft — Expanded

---

## 1. Goal

Pisahkan satu Vite app (`apps/web`) menjadi dua app terpisah dalam monorepo yang sama:

| App | Domain | Isi | PWA |
|---|---|---|---|
| **Internal** | `app.djiwatentram.com` | POS (`/menu`) + Admin (`/admin/*`) + Auth flow (login, register, karyawan, attendance, booking) | ✅ "Djiwa Tentram POS" |
| **Customer** | `order.djiwatentram.com` | Customer ordering (`/$brandSlug`) + Minigames (`/$brandSlug/minigames`) | ✅ "Djiwa Tentram Order" |

Backend & database tetap **satu Supabase yang sama**. Shared code dipindah ke `packages/yumipos-web-shared`.

---

## 2. Current Context

### Monorepo Structure (saat ini)
```
djiwatentramapp/
├── apps/
│   └── web/                  ← SATU APP UNTUK SEMUA
│       ├── src/
│       │   ├── routes/       ← ~130 file route
│       │   ├── components/
│       │   │   ├── admin/    ← admin-specific
│       │   │   ├── customer/ ← customer ordering (1 file)
│       │   │   ├── pos/      ← POS-specific (9 files)
│       │   │   ├── ui/       ← shared UI (23 files)
│       │   │   ├── layout/   ← shared layout
│       │   │   └── ...
│       │   ├── hooks/        ← 30+ hooks
│       │   ├── context/      ← cart-context, app-data-context
│       │   ├── lib/          ← utils, client, pricing, dll
│       │   ├── types/
│       │   └── main.tsx      ← entry point + PWA registration
│       ├── vite.config.ts    ← PWA: "Djiwa Tentram POS"
│       └── index.html
├── packages/
│   ├── backend/    ← @yumipos/backend (server)
│   ├── config/     ← @yumipos/config (tsconfig.base.json)
│   └── env/        ← @yumipos/env
└── turbo.json
```

### Route Mapping (Full)

**→ Internal App (POS + Admin + Auth)** — HANYA route ini yang stay di internal

| Route | File | Fungsi | File Size |
|---|---|---|---|
| `/` | `index.tsx` + `.lazy` | Landing page | ~2KB |
| `/login` | `login.tsx` | Login page | ~1KB |
| `/register` | `register.tsx` + `.lazy` | Pendaftaran | ~10KB |
| `/register/selesai/$regNum` | `register.selesai.$registrationNumber.tsx` + `.lazy` | Selesai daftar | ~5KB |
| `/home` | `home.tsx` + `.lazy` | Home page | ~15KB |
| `/home/$section` | `home.$section.tsx` + `.lazy` | Home per section | ~5KB |
| `/dashboard` | `dashboard.tsx` + `.lazy` | Dashboard | ~10KB |
| **`/menu`** | `menu.tsx` + **`.lazy`** | **POS Kasir — 2.343 baris!** | **~83KB** |
| `/attendance` | `attendance.tsx` + subroutes | Absensi | ~15KB |
| `/attendance/` | `attendance.index.tsx` + `.lazy` | Absensi landing | ~10KB |
| `/attendance/stock-opname` | `attendance/stock-opname.tsx` + `.lazy` | Stok opname | ~10KB |
| `/booking` | `booking.tsx` + `.lazy` | Booking customer | ~15KB |
| `/karyawan/login` | `karyawan/login.tsx` + `.lazy` | Login karyawan | ~3KB |
| `/karyawan/$username` | `karyawan.$username.tsx` + `.lazy` | Profile karyawan | ~15KB |
| **Admin (29+ routes)** | | | |
| `/admin/` | `admin/index.tsx` + `.lazy` | Admin dasbor | ~15KB |
| `/admin/ai-chat` | `admin/ai-chat.tsx` + `.lazy` | Yumi AI Chat | ~15KB |
| `/admin/bar` | `admin/bar.tsx` + `.lazy` | Bar display | ~20KB |
| `/admin/booking` | `admin/booking.tsx` + `.lazy` | Admin booking | ~10KB |
| `/admin/customer-service` | `admin/customer-service.tsx` + `.lazy` | CS panel | ~15KB |
| `/admin/discounts` | `admin/discounts.tsx` + `.lazy` | Promo/diskon | ~15KB |
| `/admin/forecasting` | `admin/forecasting.tsx` + `.lazy` | Forecasting | ~10KB |
| `/admin/hpp-calculator` | `admin/hpp-calculator.tsx` + `.lazy` | HPP Kalkulator | ~20KB |
| `/admin/inventory` | `admin/inventory.tsx` + `.lazy` | Inventaris | ~15KB |
| `/admin/kitchen` | `admin/kitchen.tsx` + `.lazy` | Dapur display | ~20KB |
| `/admin/minigames` | `admin/minigames.tsx` + `.lazy` | Mini games admin | ~20KB |
| `/admin/onboarding` | `admin/onboarding.tsx` + `.lazy` | Onboarding admin | ~20KB |
| `/admin/orders` | `admin/orders.tsx` + `.lazy` | Pesanan | ~20KB |
| `/admin/products` | `admin/products.tsx` + `.lazy` | Produk | ~15KB |
| `/admin/recipe/` | `admin/recipe.tsx` + subroutes | Resep (index, view, hpp) | ~30KB total |
| `/admin/settings` | `admin/settings.tsx` + `.lazy` | Pengaturan | ~20KB |
| `/admin/stock-overview` | `admin/stock-overview.tsx` + `.lazy` | Ringkasan stok | ~15KB |
| `/admin/operational-team/` | `admin/operational-team.tsx` + sub (9+) | HR: index, register, payroll, karyawan, attendance, pengaturan, riwayat, onboarding, contract, application | ~100KB total |
| `/admin/finance/` | `admin/finance/route.tsx` + sub (6+) | Finance: index, shift-reports, transactions, reports, accounting | ~80KB total |
| **Root layout** | | | |
| `/` (__root) | `__root.tsx` | Root layout + auth guard | ~3KB |

**→ Customer App (Public)** — route ini pindah ke customer app

| Route | File | Fungsi | File Size |
|---|---|---|---|
| `/$brandSlug` | `$brandSlug.tsx` + `.lazy` | **Customer Ordering Page** | **~63KB (1082 line)** |
| `/$brandSlug/minigames` | `$brandSlug.minigames.tsx` + `.lazy` | Customer mini games (spin wheel) | ~10KB |

### Shared Code — Full Dependency Tree

Berikut dependency chain lengkap antara Customer App dan shared modules:

```
CustomerOrderingPage ($brandSlug.lazy.tsx)  ──  CustomerOrderingPage (component)
├── @/types/backend-compat.ts               ← SIMPLE: 2 baris, Id<T> + Doc<T>
├── @/components/ui/sheet.tsx               ← SIMPLE: 1 UI component
│   ├── @/components/ui/button.tsx          ← dibutuhkan oleh sheet
│   └── @/lib/utils                         ← cn() helper
├── @/hooks/use-hybrid-pos-data.ts          ← BESAR (2071 line) — hook utama
│   ├── @/lib/client.ts                     ← Supabase browser client (16 line)
│   └── @/hooks/use-supabase-live-value.ts  ← live query hook (85 line)
│       └── @/lib/client.ts                 ← (sama)
├── @/hooks/use-hybrid-booking-data.ts      ← SEDANG (367 line)
│   ├── @/lib/client.ts
│   └── @/hooks/use-supabase-live-value.ts
├── @/hooks/use-hybrid-ops-data.ts          ← SEDANG (202 line)
│   ├── @/lib/client.ts
│   └── @/hooks/use-supabase-live-value.ts
├── @/hooks/use-hybrid-write-actions.ts     ← BESAR (6084 line!)
│   ├── @/lib/client.ts
│   ├── @/lib/backend-bridge.ts             ← legacy bridge (31 line, simple)
│   └── @/hooks/useYumiAuth.tsx             ← auth context (151 line)
│       └── @/lib/yumi-auth-client.ts       ← auth client
├── @/lib/utils/pricing.ts                  ← pricing helpers
└── @/context/cart-context.tsx              ← SEDANG (375 line)
    ├── @/context/app-data-context.tsx       ← SEDANG (32 line)
    │   └── @/hooks/use-hybrid-pos-data.ts
    └── @/lib/utils/pricing.ts

Customer MiniGames ($brandSlug.minigames.lazy.tsx)
├── @/components/ui/button.tsx
├── @/components/ui/input.tsx
├── @/hooks/use-hybrid-minigames-data.ts    ← hook minigames
│   ├── @/lib/client.ts
│   └── @/hooks/use-supabase-live-value.ts
└── @/hooks/use-hybrid-write-actions.ts     ← spin action (sama dgn di atas)
```

### Internal App — Route Tree & Auth Logic (Saat Ini)

**`__root.tsx`** — Login guard logic saat ini:

```
__root.tsx (RootContent)
├── useYumiAuth() → { isAuthenticated, isLoading, isStaff, isAdmin, user }
├── useSiteBrandingMetadata()
├── useEffect auth guard:
│   ├── IF loading → return (tampilkan spinner)
│   ├── IF public page → skip auth check
│   │   >> Public page = /login, /register, /register/selesai/*
│   │   >> ATAU path dengan 2 segment + TIDAK di known-private-list
│   │   │     (ini cara mendeteksi /$brandSlug sebagai public!)
│   ├── IF NOT authenticated + NOT public → redirect /login
│   ├── IF authenticated + /login → redirect /home
└── <Outlet />
```

**Masalah untuk internal app:** Saat `/$brandSlug` dihapus, **public page detection perlu diubah**. Sekarang public page detection pake heuristic "2 segments + not in known list" yang secara tidak langsung menangkap `/$brandSlug`. Setelah customer routes dihapus, internal app gak perlu heuristic ini lagi.

---

## [EXPANDED] 3. Daftar Lengkap File yang Dipindah ke Shared Package

### 3.1 `packages/yumipos-web-shared` — Struktur

```
packages/yumipos-web-shared/
├── package.json
│   ├── name: "@yumipos/web-shared"
│   ├── type: "module"
│   ├── main: "./src/index.ts"
│   ├── types: "./src/index.ts"
│   ├── dependencies:
│   │   ├── @supabase/ssr
│   │   ├── @supabase/supabase-js
│   │   ├── react (peer)
│   │   ├── react-dom (peer)
│   │   ├── sonner
│   │   ├── clsx
│   │   ├── tailwind-merge
│   │   ├── @base-ui/react (untuk Dialog/Sheet)
│   │   ├── lucide-react
│   │   └── framer-motion
│   └── devDependencies:
│       ├── @yumipos/config
│       └── typescript
├── tsconfig.json
├── src/
│   ├── index.ts                     ← barrel export
│   ├── lib/
│   │   ├── client.ts                ← CREATE: copy dari apps/web/src/lib/client.ts (16 line)
│   │   ├── utils.ts                 ← CREATE: copy dari apps/web/src/lib/utils.ts (6 line)
│   │   ├── utils/
│   │   │   └── pricing.ts           ← CREATE: copy dari apps/web/src/lib/utils/pricing.ts
│   │   ├── backend-bridge.ts        ← CREATE: copy dari apps/web/src/lib/backend-bridge.ts (31 line)
│   │   └── yumi-auth-client.ts      ← CREATE: copy dari apps/web/src/lib/yumi-auth-client.ts
│   ├── hooks/
│   │   ├── index.ts                 ← barrel
│   │   ├── use-supabase-live-value.ts      ← CREATE: 85 line
│   │   ├── use-hybrid-pos-data.ts          ← CREATE: 2071 line (TERBESAR)
│   │   ├── use-hybrid-write-actions.ts     ← CREATE: 6084 line (TERBESAR — check)
│   │   ├── use-hybrid-ops-data.ts          ← CREATE: 202 line
│   │   ├── use-hybrid-booking-data.ts      ← CREATE: 367 line
│   │   ├── useYumiAuth.tsx                 ← CREATE: 151 line
│   │   └── use-hybrid-minigames-data.ts    ← CREATE: hook untuk minigames
│   ├── types/
│   │   └── backend-compat.ts        ← CREATE: 2 line
│   └── context/
│       ├── index.ts                 ← barrel
│       ├── cart-context.tsx         ← CREATE: 375 line
│       └── app-data-context.tsx     ← CREATE: 32 line
```

### 3.2 Files DI Luar Shared Package (tetap di masing-masing app)

**Internal-only** (gak perlu di-shared karena cuma dipake POS/Admin):
| File | Fungsi | Alasan |
|---|---|---|
| `components/pos/` (9 files) | Cart drawer, checkout, payment modal, dll | POS-specific UI |
| `components/admin/` | Admin dashboard components | Admin-specific |
| `components/attendance/` | Absensi UI | Internal staff only |
| `components/auth/` | Auth UI | Internal staff only |
| `components/employee-onboarding/` | Onboarding flow | Internal staff only |
| `components/inventory/` | Inventory UI | Internal staff only |
| `components/layout/` | Layout components | Mungkin shared, tapi internal punya sidebar |
| `components/payroll/` | Payroll UI | Internal staff only |
| `components/scan/` | Scanner UI | Internal staff only |
| `hooks/use-menu-keyboard-nav.ts` | Keyboard navigation | Khusus POS touchscreen |
| `lib/bluetooth-printer.ts` | Bluetooth printing | Khusus POS (Web Bluetooth API) |
| `lib/receipt-data.ts` | Receipt data builder | Khusus POS |
| `lib/offline-manager.ts` | Offline queue | Khusus POS |
| `lib/app-update.ts` | PWA update handler | Tergantung PWA masing-masing |
| `lib/auth-client.ts` | Better auth client | Internal auth |
| `lib/version.ts` | Version manifest | Masing-masing app punya sendiri |

**Customer-only** (gak perlu di-shared karena cuma dipake customer):
| File | Fungsi |
|---|---|
| `components/customer/customer-ordering-page.tsx` (1082 line) | Full customer ordering flow |

### 3.3 Files dari `components/ui/` — Mana yang Ikut Shared?

**Customer app cuma butuh:**
| UI Component | Dipakai oleh customer? | Butuh shared? |
|---|---|---|
| `sheet.tsx` | ✅ CustomerOrderingPage | ✅ YES |
| `button.tsx` | ✅ via sheet + minigames | ✅ YES |
| `input.tsx` | ✅ minigames | ✅ YES |
| `skeleton.tsx` | ✅ CustomerOrderingPage | ✅ YES |
| `sonner.tsx` | ✅ (toast) | ✅ YES |
| `dialog.tsx` | ⛔ cuma internal | ❌ NO |
| `badge.tsx` | ⛔ | ❌ NO |
| `card.tsx` | ⛔ | ❌ NO |
| `checkbox.tsx` | ⛔ | ❌ NO |
| `confirmation-modal.tsx` | ⛔ | ❌ NO |
| `dropdown-menu.tsx` | ⛔ | ❌ NO |
| `empty-state.tsx` | ⛔ | ❌ NO |
| `icon.tsx` | ⛔ | ❌ NO |
| `label.tsx` | ⛔ | ❌ NO |
| `loading-state.tsx` | ⛔ | ❌ NO |
| `product-card.tsx` | ⛔ (customer punya card sendiri) | ❌ NO |
| `scroll-area.tsx` | ⛔ | ❌ NO |
| `search-bar.tsx` | ⛔ | ❌ NO |
| `select.tsx` | ⛔ | ❌ NO |
| `separator.tsx` | ⛔ | ❌ NO |
| `tabs.tsx` | ⛔ | ❌ NO |
| `textarea.tsx` | ⛔ | ❌ NO |
| `a11y.tsx` | ⛔ | ❌ NO |

**Hanya 5 UI component yang perlu di-shared:** `button`, `input`, `sheet`, `skeleton`, `sonner`

### 3.4 Import Rewrite — Daftar Perubahan

Semua file di shared package perlu ganti import `@/...` menjadi relative `../...`:

| File | Import Lama → Baru |
|---|---|
| `use-hybrid-pos-data.ts` | `@/lib/client` → `../lib/client` |
| `use-hybrid-pos-data.ts` | `@/hooks/use-supabase-live-value` → `./use-supabase-live-value` |
| `use-hybrid-write-actions.ts` | `@/lib/client` → `../lib/client` |
| `use-hybrid-write-actions.ts` | `@/lib/backend-bridge` → `../lib/backend-bridge` |
| `use-hybrid-write-actions.ts` | `@/hooks/useYumiAuth` → `./useYumiAuth` |
| `use-hybrid-ops-data.ts` | `@/lib/client` → `../lib/client` |
| `use-hybrid-ops-data.ts` | `@/hooks/use-supabase-live-value` → `./use-supabase-live-value` |
| `use-hybrid-booking-data.ts` | `@/lib/client` → `../lib/client` |
| `use-hybrid-booking-data.ts` | `@/hooks/use-supabase-live-value` → `./use-supabase-live-value` |
| `useYumiAuth.tsx` | `@/lib/yumi-auth-client` → `../lib/yumi-auth-client` |
| `use-supabase-live-value.ts` | `@/lib/client` → `../lib/client` |
| `cart-context.tsx` | `@/context/app-data-context` → `../context/app-data-context` |
| `cart-context.tsx` | `@/lib/utils/pricing` → `../lib/utils/pricing` |
| `app-data-context.tsx` | `@/hooks/use-hybrid-pos-data` → `../hooks/use-hybrid-pos-data` |
| `sheet.tsx` | `@/components/ui/button` → `./button` |
| `sheet.tsx` + semua UI | `@/lib/utils` → `../lib/utils` |

---

## [EXPANDED] 4. Detail Route Tree Internal Setelah Dipisah

### 4.1 Internal App Route Tree

Setelah customer routes (`/$brandSlug` + `/$brandSlug/minigames`) dihapus, route tree internal jadi:

```
__root.tsx ← Layout + Auth guard
├── / (index.tsx)                     ← Landing page
├── /login (login.tsx)                ← Login page
├── /register (register.tsx)          ← Register
│   └── /register/selesai/$regNum     ← Selesai daftar
├── /home (home.tsx)                  ← Home
│   └── /home/$section                ← Home per section
├── /dashboard (dashboard.tsx)        ← Dashboard
├── /menu (menu.tsx)                  ← POS Kasir (PWA start_url!)
├── /attendance (attendance.tsx)      ← Absensi
│   ├── /attendance/                  ← Absensi index
│   └── /attendance/stock-opname      ← Stok opname
├── /booking (booking.tsx)            ← Booking
├── /karyawan/login                   ← Login karyawan
├── /karyawan/$username               ← Profile karyawan
└── /admin (admin/route.tsx)          ← Admin layout (sidebar)
    ├── /admin/                       ← Admin dasbor
    ├── /admin/ai-chat
    ├── /admin/bar
    ├── /admin/booking
    ├── /admin/customer-service
    ├── /admin/discounts
    ├── /admin/forecasting
    ├── /admin/hpp-calculator
    ├── /admin/inventory
    ├── /admin/kitchen
    ├── /admin/minigames
    ├── /admin/onboarding
    ├── /admin/orders
    ├── /admin/products
    ├── /admin/recipe
    │   ├── /admin/recipe/
    │   ├── /admin/recipe/view
    │   └── /admin/recipe/hpp
    ├── /admin/settings
    ├── /admin/stock-overview
    ├── /admin/finance
    │   ├── /admin/finance/
    │   ├── /admin/finance/shift-reports
    │   ├── /admin/finance/transactions
    │   ├── /admin/finance/reports
    │   └── /admin/finance/accounting
    └── /admin/operational-team
        ├── /admin/operational-team/
        ├── /admin/operational-team/attendance
        │   └── /admin/operational-team/attendance/pengaturan
        ├── /admin/operational-team/karyawan
        ├── /admin/operational-team/payroll
        ├── /admin/operational-team/register
        │   ├── /admin/operational-team/register/
        │   ├── /admin/operational-team/register/contract
        │   ├── /admin/operational-team/register/onboarding
        │   ├── /admin/operational-team/register/riwayat
        │   └── /admin/operational-team/register/application/$regNum
        └── /admin/operational-team/
```

**Total: ~100 route files** (dari 110+ sebelumnya, minus 4 customer route files)

### 4.2 Update `__root.tsx` — Auth Logic Setelah Pisah

**Masalah di kode saat ini (__root.tsx line 24-28):**
```tsx
// Brand slug customer ordering pages are public (e.g. /djiwatentram)
(location.pathname.split("/").length === 2 &&
    !["/", "/admin", "/home", "/dashboard", "/attendance", "/booking",
        "/menu", "/login", "/register", "/karyawan",
        "/stock-opname", "/stock-overview", "/settings"].includes(location.pathname));
```

Ini adalah **heuristic** untuk menangkap `/$brandSlug` sebagai public page. Setelah customer routes dipindah, logic ini **tidak diperlukan lagi** di internal app. Semua route di internal adalah private (kecuali /login dan /register).

**Setelah diubah — `__root.tsx` di internal app:**
```tsx
function RootContent() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, isLoading } = useYumiAuth();
    const siteSettings = useHybridSiteSettings();

    useGlobalKeyboardNavigation();
    useSiteBrandingMetadata();

    useEffect(() => {
        if (isLoading) return;

        const isPublicPage =
            location.pathname === "/login" ||
            location.pathname === "/register" ||
            location.pathname.startsWith("/register/selesai/");

        if (!isAuthenticated) {
            if (location.pathname === "/register" &&
                siteSettings?.employeeOnboarding?.registrationEnabled === false) {
                navigate({ to: "/login" as any, replace: true });
                return;
            }
            if (!isPublicPage) {
                navigate({ to: "/login" as any, replace: true });
            }
        } else {
            if (location.pathname === "/login") {
                navigate({ to: "/home" as any, replace: true });
            }
        }
    }, [isAuthenticated, isLoading, location.pathname, navigate, siteSettings]);

    // ...render spinner or Outlet (sama seperti sekarang)
}
```

**Perubahan dari kode asli:**
1. ❌ Hapus heuristic `location.pathname.split("/").length === 2 && ...`
2. ❌ Hapus list `["/", "/admin", ...]` yang panjang
3. ✅ Ganti jadi explicit check: `/login`, `/register`, `/register/selesai/*` saja

### 4.3 Customer App `__root.tsx` — Super Simpel

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
    component: () => (
        <div className="min-h-app bg-background font-sans text-foreground antialiased">
            <Outlet />
        </div>
    ),
});
```

**Tidak ada:**
- ❌ Auth guard (halaman public)
- ❌ YumiAuthProvider
- ❌ useGlobalKeyboardNavigation
- ❌ useSiteBrandingMetadata
- ❌ Spinner loading
- ❌ AppDataProvider, CartProvider (ditaruh di dalam CustomerOrderingPage atau main.tsx)

---

## [EXPANDED] 5. Estimasi Effort Per Step

### Step 1: Buat `packages/yumipos-web-shared` — ⏱️ **3-4 jam**

| Task | Detail | Effort |
|---|---|---|
| Init package.json + tsconfig | Setup @yumipos/web-shared | 15 menit |
| Copy `lib/client.ts`, `utils.ts`, `backend-bridge.ts` | Simple copy, import relative gampang | 15 menit |
| Copy `lib/utils/pricing.ts` | Cek dependency chain | 15 menit |
| Copy `lib/yumi-auth-client.ts` | Cek import | 15 menit |
| Copy `hooks/use-supabase-live-value.ts` | 85 line, import gampang | 15 menit |
| **Copy `hooks/use-hybrid-pos-data.ts`** | **2071 line** — butuh audit fungsi mana yg dipake customer vs internal-only. Ada kemungkinan perlu split hook ini. | **45-60 menit** |
| **Copy `hooks/use-hybrid-write-actions.ts`** | **6084 line** — TERBESAR. Butuh audit fungsi. Banyak fungsi POS-specific (createShiftReport, dll). Perlu split: shared write actions + POS write actions. | **45-60 menit** |
| Copy `hooks/use-hybrid-ops-data.ts` | 202 line, straightforward | 15 menit |
| Copy `hooks/use-hybrid-booking-data.ts` | 367 line | 20 menit |
| Copy `hooks/useYumiAuth.tsx` | 151 line | 15 menit |
| Copy `hooks/use-hybrid-minigames-data.ts` | Hook kecil | 10 menit |
| Copy `context/cart-context.tsx` + `app-data-context.tsx` | 407 line total | 20 menit |
| Copy `components/ui/button, input, sheet, skeleton, sonner` | 5 UI files | 20 menit |
| Rewrite semua import `@/` → relative | ~25 file perlu diedit | 30 menit |
| **Build test** | `tsc --noEmit` — perbaiki error | 20-60 menit |
| **Total Step 1** | | **3-4 jam** |

**⚠️ Risiko Step 1:** `use-hybrid-write-actions.ts` (6084 line) adalah file raksasa yang campur aduk fungsi POS dan fungsi shared. Kemungkinan besar perlu **di-split** menjadi:
- `use-hybrid-shared-write-actions.ts` (createOrder, updateOrder, mayar — shared)
- `use-hybrid-pos-write-actions.ts` (shift report, printer — POS only)

Ini menambah waktu estimasi 30-45 menit.

### Step 2: Buat `apps/internal` — ⏱️ **1-1.5 jam**

| Task | Detail | Effort |
|---|---|---|
| Copy `apps/web` → `apps/internal` | Full copy | 5 menit |
| Hapus `routes/$brandSlug*` (4 file) + `components/customer/` | Hapus file | 5 menit |
| Update `package.json` | Ganti name, tambah dep @yumipos/web-shared | 10 menit |
| Update imports dari `@/` → `@yumipos/web-shared` | Untuk hooks/lib/context | 30 menit |
| Update `__root.tsx` | Sederhanakan auth logic (hapus heuristic brandSlug) | 15 menit |
| Update `vite.config.ts` | PWA tetap "Djiwa Tentram POS" | 10 menit |
| Regenerate route tree + build test | `turbo -F internal build` | 15 menit |
| **Total Step 2** | | **1-1.5 jam** |

### Step 3: Buat `apps/customer` — ⏱️ **1.5-2 jam**

| Task | Detail | Effort |
|---|---|---|
| Init package.json + tsconfig + index.html + vite.config.ts | Setup app baru | 20 menit |
| PWA config dengan "Djiwa Tentram Order" | Manifest + workbox strategi berbeda | 15 menit |
| Copy route files `$brandSlug.tsx` + `.lazy` + `$brandSlug.minigames` | 4 file | 5 menit |
| Copy `components/customer/customer-ordering-page.tsx` | 1082 line | 5 menit |
| Buat `__root.tsx` simpel tanpa auth | Langsung `<Outlet />` | 10 menit |
| Buat `main.tsx` ringan | Tanpa PWA version check kompleks | 15 menit |
| Import dari `@yumipos/web-shared` | Ganti semua `@/` → `@yumipos/web-shared` di route + component | 20 menit |
| Setup Tailwind CSS + index.css | Copy dari apps/web | 10 menit |
| **Build test** | `turbo -F customer build` | 15 menit |
| **Total Step 3** | | **1.5-2 jam** |

### Step 4: Update Root Config — ⏱️ **30 menit**

| Task | Detail | Effort |
|---|---|---|
| Update root `package.json` scripts | `dev:internal`, `dev:customer`, dll | 10 menit |
| Update `turbo.json` | Pastikan dependsOn untuk shared package | 10 menit |
| Test `turbo build` | Build semua app sekaligus | 10 menit |
| **Total Step 4** | | **30 menit** |

### Step 5: Setup Deploy — ⏱️ **30-60 menit**

| Task | Detail | Effort |
|---|---|---|
| Setup Caddy/Nginx | `app.djiwatentram.com` + `order.djiwatentram.com` | 20 menit |
| deploy script atau Dockerfile | Build + serve masing-masing app | 20 menit |
| Test di production | Akses kedua domain | 20 menit |
| **Total Step 5** | | **30-60 menit** |

### Step 6: Hapus `apps/web` — ⏱️ **15 menit**

| Task | Detail | Effort |
|---|---|---|
| Verifikasi semua route berfungsi | Smoke test | 10 menit |
| Hapus `apps/web/` | `rm -rf` | 5 menit |
| **Total Step 6** | | **15 menit** |

### Total Estimasi

| Step | Effort | Dikerjakan Oleh |
|---|---|---|
| 1. Shared package | 3-4 jam | Agent (intensif) |
| 2. Internal app | 1-1.5 jam | Agent |
| 3. Customer app | 1.5-2 jam | Agent |
| 4. Root config | 30 menit | Agent |
| 5. Deploy setup | 30-60 menit | Manual (DNS + Caddy) |
| 6. Hapus apps/web | 15 menit | Agent |
| **Total** | **~7-10 jam** | |

### Breakdown by Risk & Complexity

| Kompleksitas | File | Estimasi |
|---|---|---|
| 🟢 **Easy** (copy + ganti import) | lib/, types/, UI components | ~1 jam |
| 🟡 **Medium** (copy + audit split) | hooks/use-hybrid-*-data, useYumiAuth, cart-context | ~1.5 jam |
| 🔴 **Complex** (split + rewrite) | `use-hybrid-pos-data.ts` (2071L), `use-hybrid-write-actions.ts` (6084L) | ~2 jam |

---

## 6. PWA Perbandingan Detail

| Aspek | Internal App (app.djiwatentram.com) | Customer App (order.djiwatentram.com) |
|---|---|---|
| **Nama PWA** | "Djiwa Tentram POS" | "Djiwa Tentram Order" |
| **Short name** | "Djiwa POS" | "Djiwa Order" |
| **Start URL** | `/menu` | `/djiwatentram` |
| **Scope** | `/` | `/` |
| **Display** | `standalone` | `standalone` |
| **Theme color** | `#fefefe` | `#fefefe` (atau dynamic dari brandSettings) |
| **Navigasi cache** | NetworkFirst, timeout 5s, 3 entries | NetworkFirst, timeout 5s, 3 entries |
| **Gambar cache** | (none — POS jarang reload gambar) | CacheFirst, 100 entries, 7 hari |
| **Version check** | ✅ Full: unregister old SW + clear caches + redirect | ✅ Simple: autoUpdate saja |
| **Offline queue** | ✅ Ada (lib/offline-manager.ts) | ❌ Tidak ada |
| **Bluetooth** | ✅ Ada (lib/bluetooth-printer.ts) | ❌ Tidak ada |

---

## 7. Files Likely to Change (Lengkap)

### New Files (~40 files)
- `packages/yumipos-web-shared/package.json`
- `packages/yumipos-web-shared/tsconfig.json`
- `packages/yumipos-web-shared/src/index.ts`
- `packages/yumipos-web-shared/src/lib/client.ts`
- `packages/yumipos-web-shared/src/lib/utils.ts`
- `packages/yumipos-web-shared/src/lib/utils/pricing.ts`
- `packages/yumipos-web-shared/src/lib/backend-bridge.ts`
- `packages/yumipos-web-shared/src/lib/yumi-auth-client.ts`
- `packages/yumipos-web-shared/src/hooks/index.ts`
- `packages/yumipos-web-shared/src/hooks/use-supabase-live-value.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-pos-data.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-ops-data.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-booking-data.ts`
- `packages/yumipos-web-shared/src/hooks/useYumiAuth.tsx`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-minigames-data.ts`
- `packages/yumipos-web-shared/src/types/backend-compat.ts`
- `packages/yumipos-web-shared/src/context/index.ts`
- `packages/yumipos-web-shared/src/context/cart-context.tsx`
- `packages/yumipos-web-shared/src/context/app-data-context.tsx`
- `packages/yumipos-web-shared/src/components/ui/button.tsx`
- `packages/yumipos-web-shared/src/components/ui/input.tsx`
- `packages/yumipos-web-shared/src/components/ui/sheet.tsx`
- `packages/yumipos-web-shared/src/components/ui/skeleton.tsx`
- `packages/yumipos-web-shared/src/components/ui/sonner.tsx`
- `apps/customer/package.json`
- `apps/customer/tsconfig.json`
- `apps/customer/vite.config.ts`
- `apps/customer/index.html`
- `apps/customer/src/main.tsx`
- `apps/customer/src/index.css`
- `apps/customer/src/routes/__root.tsx`
- `apps/customer/src/routes/$brandSlug.tsx`
- `apps/customer/src/routes/$brandSlug.lazy.tsx`
- `apps/customer/src/routes/$brandSlug.minigames.tsx`
- `apps/customer/src/routes/$brandSlug.minigames.lazy.tsx`
- `apps/customer/src/components/customer/customer-ordering-page.tsx`
- `apps/internal/` (entire app — copied from apps/web)

### Changed Files (~7 files)
- `package.json` → tambah scripts
- `turbo.json` → validasi dependsOn
- `apps/internal/package.json` → name + dep @yumipos/web-shared
- `apps/internal/src/routes/__root.tsx` → sederhanakan auth logic
- `apps/internal/vite.config.ts` → validasi PWA config
- Semua internal route files → import dari `@yumipos/web-shared`

### Deleted Files (~4 + 1 folder)
- `apps/web/src/routes/$brandSlug.tsx`
- `apps/web/src/routes/$brandSlug.lazy.tsx`
- `apps/web/src/routes/$brandSlug.minigames.tsx`
- `apps/web/src/routes/$brandSlug.minigames.lazy.tsx`
- `apps/web/src/components/customer/` (1 file)
- **Later:** Seluruh `apps/web/`

---

## 8. Risks & Tradeoffs

### 🔴 High Risk

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Shared package refactor massive** | ~30 file import paths perlu diubah dari `@/` ke `@yumipos/web-shared` | Lakukan incremental: extract satu hook dulu, test, lalu lanjut |
| **`use-hybrid-write-actions.ts` (6084 line)** | Campur shared + POS-specific functions | Perlu split jadi 2 file. Audit fungsi sebelum extract |
| **Circular dependencies** | hooks saling import satu sama lain | Audit dependency graph sebelum move |

### 🟡 Medium Risk

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Tailwind class collision** | Kedua app punya CSS sendiri | Pastikan tiap app punya `index.css` + `@tailwind` sendiri |
| **Cart context split** | Customer dan POS pakai cart-context yang sama | CartContext harus di shared package |
| **Version manifest** | `write-version-manifest.mjs` ada di root scripts | Pastikan kedua app jalanin script yang sama |
| **Env variables** | Kedua app butuh SUPABASE_* env yang sama | Reuse dari root `.env` |
| **Double maintenance** | Ada dua app yang perlu di-deploy | Turborepo handles this — `turbo build` build semua |

### 🟢 Low Risk

| Risiko | Dampak |
|---|---|
| **Login flow** | Customer app ga butuh auth — root layout jadi simpel |
| **PWA version check** | Masing-masing app punya SW sendiri — no conflict |
| **Tauri desktop** | Saat ini `tauri` scripts di `apps/web/package.json` — untuk desktop build, run dari `apps/internal` |

---

## 9. Open Questions

1. **Domain final?** — `app.djiwatentram.com` vs `kasir.djiwatentram.com` untuk internal? Ini perlu DNS setup.
2. **Progressive migration?** — Apakah `apps/web` boleh tetap ada selama transisi (dual run), atau langsung cutover?
3. **Shared package scope?** — Apakah `use-hybrid-pos-data.ts` perlu di-split? Atau cukup copy semua fungsi termasuk yg POS-only ke shared package (bloating customer app bundle)?
4. **Customer SEO?** — Apakah customer app perlu SSR/SSG untuk SEO? Saat ini SPA biasa.
5. **App icon PWA?** — Customer app butuh icon sendiri yang beda dari POS. Siap?
6. **Split `use-hybrid-write-actions.ts`?** — File 6084 line campur fungsi shared (createOrder) dan fungsi POS-only (shift report). Wajib di-split.

---

## 10. Deletion Checklist

Setelah migration, verify:
- [ ] ALL route files identified (`.tsx` + `.lazy.tsx`)
- [ ] `/$brandSlug` routes tidak ada referensi di internal app
- [ ] `/menu`, `/admin/*` routes tidak ada referensi di customer app
- [ ] Semua shared code di import dari `@yumipos/web-shared`, bukan dari local `@/`
- [ ] `apps/web` directory dihapus
- [ ] Semua CI/CD references ke `apps/web` diupdate
