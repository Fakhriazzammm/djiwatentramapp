# Plan: Dynamic PWA Settings via /admin/settings

**Date:** 2026-05-28
**Based on:** `.hermes/plans/2026-05-28_143000-opsi-b-multi-domain-enhanced.md`

---

## 1. Goal

Semua pengaturan PWA untuk **kedua app** (POS + Customer) bisa diatur dari `/admin/settings` → tab Branding, tidak hardcoded di `vite.config.ts`.

| Pengaturan | POS App | Customer App |
|---|---|---|
| `name` | "Djiwa Tentram POS" | "Djiwa Tentram App" |
| `short_name` | "Djiwa POS" | "Djiwa App" |
| `description` | "Aplikasi kasir Djiwa Tentram" | "Pesan menu favorit dari meja" |
| `theme_color` | `#fefefe` | `#fefefe` |
| `background_color` | `#0a0a0b` | `#ffffff` |
| `start_url` | `/menu` | `/djiwatentram` |
| `orientation` | `landscape` | `portrait` |
| `icons` | pwa-pos-192, pwa-pos-512 | pwa-app-192, pwa-app-512 |

---

## 2. Current Context

### 2.1 Yang Sudah Ada

| Komponen | Lokasi | Status |
|---|---|---|
| `appName` field | `pos_site_settings.raw.appName` | ✅ Ada (tapi satu untuk semua) |
| PWA icons upload | `/admin/settings` → Branding tab | ✅ Ada (192, 512, maskable) |
| `useHybridSiteSettings()` | `hooks/use-hybrid-pos-data.ts` | ✅ Fetch dari `pos_site_settings` |
| `useHybridUpdateSiteSettings()` | `hooks/use-hybrid-write-actions.ts` | ✅ Update settings |
| PWA manifest POS | `apps/pos/vite.config.ts` | ❌ Hardcoded |
| PWA manifest Customer | `apps/customer/vite.config.ts` | ❌ Hardcoded |

### 2.2 Masalah

```
Saat ini:
  vite.config.ts → manifest hardcoded → build → manifest.webmanifest (static)

Yang diinginkan:
  /admin/settings → simpan ke pos_site_settings → build script baca → inject ke vite.config.ts → build
```

### 2.3 Kenapa Tidak Bisa Runtime Saja

`vite-plugin-pwa` generate manifest saat **build time**. Cloudflare Pages serve static files. Tidak ada server-side render. Solusi: build script yang fetch settings dari Supabase **sebelum** `vite build`.

---

## 3. Approach: Build-Time Settings Injection

### Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│ /admin/settings → Branding tab                           │
│                                                         │
│ ┌─ POS PWA ─────────────┐ ┌─ Customer PWA ────────────┐│
│ │ Nama: Djiwa Tentram POS│ │ Nama: Djiwa Tentram App    ││
│ │ Short: Djiwa POS       │ │ Short: Djiwa App           ││
│ │ Deskripsi: ...         │ │ Deskripsi: ...             ││
│ │ Theme: #fefefe         │ │ Theme: #fefefe             ││
│ │ Background: #0a0a0b    │ │ Background: #ffffff        ││
│ │ Start URL: /menu       │ │ Start URL: /djiwatentram   ││
│ │ Orientation: landscape │ │ Orientation: portrait      ││
│ │ Icon 192: [upload]     │ │ Icon 192: [upload]         ││
│ │ Icon 512: [upload]     │ │ Icon 512: [upload]         ││
│ └────────────────────────┘ └────────────────────────────┘│
└──────────────────────┬──────────────────────────────────┘
                       │ save
                       ▼
              pos_site_settings.raw
              {
                posPwa: { name, short_name, ... },
                customerPwa: { name, short_name, ... }
              }
                       │
                       ▼ (saat build)
         scripts/generate-pwa-manifest.mjs
         fetch dari Supabase → tulis ke apps/*/src/pwa-settings.ts
                       │
                       ▼
         vite.config.ts → import { posPwaSettings } from "./src/pwa-settings"
         manifest: posPwaSettings
                       │
                       ▼
         build → manifest.webmanifest (dynamic values)
```

---

## 4. Database Schema

### 4.1 `pos_site_settings.raw` — Tambah Field

```json
{
  "...existing fields...": "...",
  "appName": "Yumi POS",
  "headerLogoUrl": "...",
  
  "posPwa": {
    "name": "Djiwa Tentram POS",
    "short_name": "Djiwa POS",
    "description": "Aplikasi kasir Djiwa Tentram",
    "theme_color": "#fefefe",
    "background_color": "#0a0a0b",
    "start_url": "/menu",
    "orientation": "landscape",
    "icon192": "https://.../pwa-pos-192.png",
    "icon512": "https://.../pwa-pos-512.png"
  },
  
  "customerPwa": {
    "name": "Djiwa Tentram App",
    "short_name": "Djiwa App",
    "description": "Pesan menu favorit dari meja",
    "theme_color": "#fefefe",
    "background_color": "#ffffff",
    "start_url": "/djiwatentram",
    "orientation": "portrait",
    "icon192": "https://.../pwa-app-192.png",
    "icon512": "https://.../pwa-app-512.png"
  }
}
```

TypeScript type:

```ts
type PwaSettings = {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  start_url: string;
  orientation: "portrait" | "landscape" | "any";
  icon192: string;
  icon512: string;
};
```

---

## 5. UI/UX — Branding Tab

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│ Branding Aplikasi                                       │
│ Logo header, favicon, dan icon PWA                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌── POS PWA (pos.djiwatentram.web.id) ──────────────────────────┐ │
│ │  Nama Aplikasi:  [Djiwa Tentram POS          ]     │ │
│ │  Short Name:     [Djiwa POS                  ]     │ │
│ │  Deskripsi:      [Aplikasi kasir Djiwa Tentram]     │ │
│ │  Theme Color:    [#fefefe]  Background: [#0a0a0b]   │ │
│ │  Start URL:      [/menu]                            │ │
│ │  Orientasi:      [Landscape ▼]                      │ │
│ │  Icon 192x192:   [📤 upload] [preview]              │ │
│ │  Icon 512x512:   [📤 upload] [preview]              │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌── Customer PWA (djiwatentram.web.id) ────────────┐ │
│ │  Nama Aplikasi:  [Djiwa Tentram App          ]     │ │
│ │  Short Name:     [Djiwa App                  ]     │ │
│ │  Deskripsi:      [Pesan menu favorit dari meja]     │ │
│ │  Theme Color:    [#fefefe]  Background: [#ffffff]   │ │
│ │  Start URL:      [/djiwatentram]                    │ │
│ │  Orientasi:      [Portrait ▼]                       │ │
│ │  Icon 192x192:   [📤 upload] [preview]              │ │
│ │  Icon 512x512:   [📤 upload] [preview]              │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ [💾 Simpan]                                             │
└─────────────────────────────────────────────────────────┘
```

### 5.2 States

| State | UI |
|---|---|
| Loading | Skeleton cards untuk kedua section |
| Empty (belum diset) | Default values terisi, user bisa edit |
| Saving | Button loading spinner, toast "Menyimpan..." |
| Success | Toast "Pengaturan PWA disimpan" |
| Error | Toast merah dengan pesan error |

### 5.3 Validation

- `name`: required, max 45 chars
- `short_name`: required, max 12 chars
- `description`: max 120 chars
- `theme_color` / `background_color`: valid hex color (#XXX or #XXXXXX)
- `start_url`: must start with `/`
- Icon: max 512KB, PNG only

---

## 6. Implementation Steps

### Step 1: Update Type Definitions (10 menit)

**Files:**
- `apps/web/src/hooks/use-hybrid-pos-data.ts`

Add `PwaSettings` type and update `SiteSettingsRecord`:

```ts
type PwaSettings = {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  start_url: string;
  orientation: "portrait" | "landscape" | "any";
  icon192: string;
  icon512: string;
};

// Di fetchSiteSettings(), extract posPwa dan customerPwa dari raw
```

### Step 2: UI — Branding Tab (1.5 jam)

**Files:**
- `apps/web/src/routes/admin/settings.lazy.tsx`

Update Branding section:
1. Ganti single app settings jadi dua panel: POS PWA + Customer PWA
2. Tambah field: `short_name`, `description`, `theme_color`, `background_color`, `start_url`, `orientation`
3. Reuse existing icon upload logic (sudah ada)
4. Default values dari constants

### Step 3: Build Script (30 menit)

**New file:** `scripts/generate-pwa-manifest.mjs`

```js
// Fetch pos_site_settings from Supabase
// Extract posPwa and customerPwa
// Write to apps/pos/src/pwa-settings.ts and apps/customer/src/pwa-settings.ts
```

Script dipanggil di `package.json` scripts:
```json
"build:pos": "node scripts/generate-pwa-manifest.mjs && turbo build --filter=@yumipos/pos",
"build:customer": "node scripts/generate-pwa-manifest.mjs && turbo build --filter=@yumipos/customer"
```

### Step 4: Update vite.config.ts (15 menit per app)

**Files:**
- `apps/pos/vite.config.ts`
- `apps/customer/vite.config.ts`

```ts
import { posPwaSettings } from "./src/pwa-settings";

VitePWA({
  manifest: {
    ...posPwaSettings,
    icons: [
      { src: posPwaSettings.icon192, sizes: "192x192", type: "image/png" },
      { src: posPwaSettings.icon512, sizes: "512x512", type: "image/png" },
    ],
  },
})
```

### Step 5: Fallback Defaults (15 menit)

**New files:**
- `apps/pos/src/pwa-settings.ts` (committed with defaults)
- `apps/customer/src/pwa-settings.ts` (committed with defaults)

Kalau script gagal fetch dari Supabase, fallback ke hardcoded defaults.

### Step 6: Build Test (15 menit)

```bash
bun run build:pos   # verify manifest pakai settings
bun run build:customer
```

---

## 7. Files Summary

| File | Action | Effort |
|---|---|---|
| `apps/web/src/hooks/use-hybrid-pos-data.ts` | Modify: add PwaSettings type | 10 menit |
| `apps/web/src/routes/admin/settings.lazy.tsx` | Modify: split branding → 2 panels | 1.5 jam |
| `scripts/generate-pwa-manifest.mjs` | **Create** | 30 menit |
| `apps/pos/vite.config.ts` | Modify: import from pwa-settings | 15 menit |
| `apps/customer/vite.config.ts` | Modify: import from pwa-settings | 15 menit |
| `apps/pos/src/pwa-settings.ts` | **Create** (defaults) | 5 menit |
| `apps/customer/src/pwa-settings.ts` | **Create** (defaults) | 5 menit |
| `package.json` | Modify: update build scripts | 5 menit |
| **Total** | | **~3 jam** |

---

## 8. Hardcode Audit

| Value | Before (Hardcoded) | After (Settings) |
|---|---|---|
| POS name | `"Djiwa Tentram POS"` in vite.config.ts | `pos_site_settings.raw.posPwa.name` |
| POS short_name | `"Djiwa POS"` in vite.config.ts | `pos_site_settings.raw.posPwa.short_name` |
| Customer name | `"Djiwa Tentram App"` in vite.config.ts | `pos_site_settings.raw.customerPwa.name` |
| Customer short_name | `"Djiwa App"` in vite.config.ts | `pos_site_settings.raw.customerPwa.short_name` |
| Icons | Static files | Upload via admin → Supabase Storage URL |
| Colors | Hardcoded | Admin settings |
| Orientation | Hardcoded | Admin settings |

✅ **Allowed hardcoded:** `pwa-settings.ts` defaults (fallback kalau Supabase unreachable saat build)

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Build script gagal fetch Supabase | Fallback ke `pwa-settings.ts` defaults (committed) |
| Supabase timeout saat build | Retry 3x dengan exponential backoff di script |
| Icon URL broken | Validation di admin: upload → dapat URL → test accessibility |
| CF Pages build env tidak punya SUPABASE_KEY | Tambah env vars di CF Pages dashboard |
