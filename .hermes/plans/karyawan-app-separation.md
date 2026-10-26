# Plan: Pisahkan Karyawan Portal ke `apps/karyawan`

## Ringkasan

Buat app baru `apps/karyawan` (`@yumipos/karyawan`) dengan PWA sendiri, domain `karyawan.djiwatentram.web.id`. Admin Operational Team tetap di `apps/pos`.

---

## ⚠️ Safety Rules (Operational Running — Zero Error Policy)

Production `apps/pos` **TIDAK BOLEH error** di setiap tahap. Strategi migrasi:

1. **Dual-path copy**: File dipindah ke web-shared DULU, POS tetap pakai `@/` path lama — kedua versi jalan bareng
2. **Swap import satu per satu**: Setiap kali ganti import dari `@/` ke `@yumipos/web-shared`, **build & test** dulu
3. **Tahap 'no-op'**: Tidak ada file di POS yang dihapus sebelum apps/karyawan deployed & verified
4. **Karyawan routes tetap di POS** sampai apps/karyawan live di karyawan.djiwatentram.web.id
5. **Hapus duplikasi terakhir**: Baru setelah verified, hapus karyawan routes + hooks duplikat dari POS

### Urutan aman (dependency chain)
```
web-shared hooks ready  ──►  POS ganti import  ──► apps/karyawan  ──► deploy karyawan  ──► hapus dari POS
     ↑ (test dulu)             ↑ (build dulu)        ↑ (build dulu)         ↑ (verify)        ↑ (last step)
```

---

## Tahap 0: Prasyarat — Pindahkan Shared Hooks/Components ke `@yumipos/web-shared`

Sebelum bikin app baru, hooks yang sekarang cuma di `apps/pos/src/hooks/` perlu dipindah ke `packages/yumipos-web-shared/` biar bisa dipakai bersama tanpa duplikasi.

### Yang SUDAH di web-shared (amankan, tinggal import)
| File | Path di web-shared |
|------|-------------------|
| `client.ts` | `src/lib/client.ts` ✅ |
| `yumi-auth-client.ts` | `src/lib/yumi-auth-client.ts` ✅ |
| `useYumiAuth.tsx` | `src/hooks/useYumiAuth.tsx` ✅ |
| `use-hybrid-pos-data.ts` | `src/hooks/use-hybrid-pos-data.ts` ✅ |
| `use-hybrid-write-actions.ts` | `src/hooks/use-hybrid-write-actions.ts` ✅ |
| `use-supabase-live-value.ts` | `src/hooks/use-supabase-live-value.ts` ✅ |

### Yang PERLU ditambahkan ke web-shared

#### A. Hooks (dari `apps/pos/src/hooks/`)
| File | Dipakai oleh | Notes |
|------|-------------|-------|
| `use-hybrid-attendance-data.ts` | `$username` page | useHybridPrivateStaffData, useHybridStaffBySlug, useHybridStaffLogs, useHybridStaffStats |
| `use-hybrid-payroll-data.ts` | `$username` page | useHybridPayslips |
| `use-hybrid-attendance-schedules.ts` | `PersonalSchedule` component | Kalender shift personal |

#### B. Lib (dari `apps/pos/src/lib/`)
| File | Dipakai oleh | Notes |
|------|-------------|-------|
| `payslip-pdf.ts` | `$username` page | generatePayslipPDF — butuh jspdf + jspdf-autotable |
| `api-helper.ts` | payroll hook | invokeEdgeFunction (cuma 1 fungsi) |
| `wib-utils.ts` | home-clockout-banner | Fungsi WIB timezone |

#### C. Components (dari `apps/pos/src/components/`)
| Component | Dipakai oleh | Deps |
|-----------|-------------|------|
| `ui/button.tsx` | `$username` page, PersonalSchedule | shadcn-style |
| `ui/input.tsx` | `$username` page | shadcn-style |
| `layout/Footer.tsx` | `$username` page | — |
| `attendance/PersonalSchedule.tsx` | `$username` page | use-hybrid-attendance-schedules, date-fns, cn |
| `home/home-clockout-banner.tsx` | `$username` page | wib-utils, useYumiAuth, createClient |

#### D. Update `package.json` web-shared
Tambah peerDependencies:
- `date-fns` (dipakai PersonalSchedule)
- `jspdf` + `jspdf-autotable` (dipakai payslip-pdf)
- `@tanstack/react-router` (dipakai home-clockout-banner — useNavigate)

#### E. Update barrel `src/index.ts`
Export semua hook & lib baru.

#### F. Update imports di `apps/pos`
Hooks/lib yg udah pindah ke web-shared, ganti import dari `@/` jadi `@yumipos/web-shared`.

---

## Tahap 1: Buat App `apps/karyawan`

### Struktur folder
```
apps/karyawan/
├── package.json              # @yumipos/karyawan
├── vite.config.ts             # Vite + TanStack Router + VitePWA (manifest karyawan)
├── tsconfig.json
├── index.html
├── public/
│   └── (icon PWA, favicon)
└── src/
    ├── main.tsx               # Entry point + router
    ├── pwa-settings.ts        # PWA manifest config
    ├── routeTree.gen.ts       # Auto-generated
    ├── App.css                # Tailwind + global styles minimal
    ├── routes/
    │   ├── __root.tsx         # Root layout — YumiAuthProvider + Outlet
    │   ├── index.lazy.tsx     # Redirect ke login
    │   ├── login.lazy.tsx     # PIN-based login (copy dari POS — ubah imports)
    │   └── $username.lazy.tsx # Profile page (copy dari POS — ubah imports)
    ├── lib/
    │   └── utils.ts           # cn() utility (copy dari POS)
    └── hooks/                 # (kosong — semua dari web-shared)
```

### package.json
```json
{
  "name": "@yumipos/karyawan",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "serve": "vite preview",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@yumipos/web-shared": "workspace:*",
    "@yumipos/env": "workspace:*",
    "@tanstack/react-router": "^1.141.1",
    "@supabase/supabase-js": "^2.103.3",
    "@supabase/ssr": "^0.10.2",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "lucide-react": "^0.473.0",
    "framer-motion": "^12.29.0",
    "sonner": "^2.0.5",
    "tailwind-merge": "^3.3.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "jspdf": "^4.2.0",
    "jspdf-autotable": "^5.0.7",
    "html2canvas": "^1.4.1",
    "vite-plugin-pwa": "^1.0.1",
    "workbox-window": "^7.4.0",
    "@base-ui/react": "^1.0.0"
  },
  "devDependencies": {
    "@tanstack/react-router-devtools": "^1.141.1",
    "@tanstack/router-plugin": "^1.141.1",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.15",
    "typescript": "catalog:",
    "vite": "^6.2.2"
  }
}
```

### vite.config.ts
Mirip `apps/customer/vite.config.ts` tapi dengan:
- PWA manifest nama: "Karyawan Djiwa Tentram"
- start_url: "/login"
- TanStack Router plugin (routes di `src/routes/`)

### Root layout (`__root.tsx`)
- YumiAuthProvider (dari web-shared)
- Auth guard: redirect ke `/login` kalau belum auth
- TanStack Router Outlet

### Update `index.html`
Title: "Karyawan — Djiwa Tentram"

---

## Tahap 2: Integrasi Root

### 2a. Update `package.json` root
Tambah script:
```
"dev:karyawan": "turbo dev --filter=@yumipos/karyawan",
"build:karyawan": "node scripts/generate-pwa-manifest.mjs && turbo build --filter=@yumipos/karyawan"
```

### 2b. Update root `turbo.json` — tasks untuk karyawan
Tambah task `build` dan `dev` (inherit dari default).

---

## Tahap 3: Deploy apps/karyawan

### 3a. Deploy ke karyawan.djiwatentram.web.id
- `apps/karyawan` → deploy ke **karyawan.djiwatentram.web.id** (Cloudflare Pages atau Vercel)
- SETELAH verified live dan akses login/profile berfungsi penuh di karyawan.djiwatentram.web.id, baru lanjut

### 3b. Home page redirect (`home.lazy.tsx`) — AFTER deploy verified
Link avatar click → `https://karyawan.djiwatentram.web.id/{slug}` buka tab baru (window.open)
Sementara masih bisa navigasi internal POS juga sebagai fallback

### 3c. Hapus dari POS (LAST STEP — setelah apps/karyawan live ≥1 hari)
- Hapus `/karyawan/login` dari daftar `isPublicPage` di `__root.tsx`
- Hapus file `routes/karyawan/login.tsx`, `routes/karyawan/login.lazy.tsx`, `routes/karyawan.$username.tsx`, `routes/karyawan.$username.lazy.tsx`
- Hapus hooks duplikat dari `src/hooks/` (yang udah pindah ke web-shared dan cuma dipakai karyawan):
  - `use-hybrid-attendance-data.ts`
  - `use-hybrid-payroll-data.ts`
  - `use-hybrid-attendance-schedules.ts`
- Hapus components duplikat dari `src/components/` (yang cuma dipakai karyawan):
  - `attendance/PersonalSchedule.tsx`
  - `home/home-clockout-banner.tsx`
- Hapus lib duplikat dari `src/lib/`:
  - `payslip-pdf.ts` (kalau gak dipakai admin payroll)
  - `api-helper.ts` (kalau gak dipakai POS lain)
- Build & test POS setelah hapus

### 3d. Hooks/components yang tetap di POS (shared, bukan cuma karyawan)
- `wib-utils.ts` — dipakai banyak page POS
- `Footer`, `button`, `input` — UI components umum
- Yang masih dipakai admin operational team di POS

---

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Auth state gak shared antar app | Karyawan login 2x (POS + karyawan) | Terima — memang nature PWA terpisah. Supabase auth cookie domain-based |
| Duplikasi CSS/Tailwind | Bundle size | Shared Tailwind config dari `@yumipos/config` |
| Hooks di POS dan web-shared divergen | Bug | Setelah pindahkan ke web-shared, import dari web-shared di POS juga (single source of truth) |
| Payslip PDF depend on jspdf (heavy) | Bundle | Already minimal — cuma 2 halaman, gak masalah |
| **🚨 Import berubah di POS — typo/alias salah** | **Build break — POS down** | Safety rule: setiap ubah import, `cd apps/pos && npx tsc --noEmit && npm run build`. Jangan commit sebelum build lulus |
| **🚨 Hooks di POS tiba-tiba error karena web-shared version beda** | **Runtime error** | Dual-path copy: POS masih punya copy lokal. Swap satu per satu, test tiap langkah |
| **🚨 Karyawan routes dihapus terlalu cepat** | **Karyawan gak bisa akses** | Hapus dari POS HANYA setelah apps/karyawan live ≥24 jam dan semua flow (login, profile, payslip) verified |

---

## Ringkasan Perubahan

```
Sebelum:
apps/pos/                  ← monolit: admin + karyawan + menu
└── src/routes/karyawan/   ← 2 file

Sesudah:
apps/pos/                  ← admin operational team tetap
apps/karyawan/             ← karyawan portal (PWA sendiri)
packages/yumipos-web-shared/ ← hooks + lib + components shared
```

**Total file baru:** ~15 file (app scaffold, 2 route pages, configs)
**Total file diubah:** ~10 file (web-shared barrel + hooks, POS imports, root configs)
**Zero perubahan** data Supabase atau backend — semua read/write tetap sama via hooks.
