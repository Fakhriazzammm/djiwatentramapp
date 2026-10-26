# Plan: Pisahkan Admin ke App Terpisah (`apps/web` → `admindjiwatentram.web.id`)

**Tanggal:** 2026-07-29
**Author:** Zantara
**Status:** 🟢 Disetujui untuk implementasi (user: "buat plan lalu implementasi, pastikan data muncul")

---

## 🔍 Temuan Investigasi (Krusial — mengubah rencana)

| Fakta | Detail |
|---|---|
| **`apps/web` SUDAH ADA** | Struktur `apps/web/src/routes/admin/*` hampir identik dengan `apps/pos/src/routes/admin/*` (117 vs 121 file). Ini bukan dari nol. |
| `apps/web` punya entry point lengkap | `index.html` + `src/main.tsx` ✅ |
| `VITE_SUPABASE_URL` di web | `https://supabase.djiwatentram.web.id` — **SAMA** dengan pos → data dari Supabase self-host yang sama → **data akan muncul** ✅ |
| `apps/web/src/lib/client.ts` | `createBrowserClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)` → terhubung Supabase ✅ |
| **Beda admin** | pos punya `customers.*` + `operational-team/rekrutmen.*` yang **TIDAK ada di web** (2 modul kurang) |
| `apps/web` hooks | Pakai hook **LOKAL** (`@/hooks`, `@/components`) — bukan shared package. Tapi tetap nembak Supabase sama. |
| `apps/web` belum ter-deploy | Tidak ada case `web` di `scripts/deploy-vps.sh` → belum ada di domain manapun. |
| `apps/web` punya route customer | `$brandSlug` (customer ordering) — ekstra, tidak berbahaya di admin domain. |

### Kesimpulan
`apps/web` **sudah 95% siap jadi admin app**. Yang perlu dilengkapi:
1. Tambah 2 modul missing (`customers`, `rekrutmen`) agar **tidak ada fitur berkurang**.
2. Tambah case `web` ke `deploy-vps.sh`.
3. Deploy `apps/web` → `admindjiwatentram.web.id` (ganti isi webroot dari "copy-pos" jadi "build-web").
4. Verifikasi data muncul.

---

## 🎯 Goal
- Admin berjalan sebagai **app terpisah** (`apps/web`) di `admindjiwatentram.web.id`.
- Tetap **terhubung ke pos/karyawan/customer** via Supabase self-host yang sama (data sinkron).
- **Tidak ada fitur berkurang** (customers + rekrutmen ditambahkan).
- **Data muncul** (verifikasi: chunk Supabase ada + API respond).

---

## 📋 Langkah Implementasi

### FASE 1 — Lengkapi modul missing di `apps/web`
- Copy `apps/pos/src/routes/admin/customers.tsx` + `customers.lazy.tsx` → `apps/web/src/routes/admin/`
- Copy `apps/pos/src/routes/admin/operational-team/rekrutmen.tsx` + `rekrutmen.lazy.tsx` → `apps/web/src/routes/admin/operational-team/`
- Cek dependency import (pastikan hook/@components yang dipakai ada di web; kalau tidak, copy juga atau pakai shared).
- Tambah entri menu ke `apps/web/src/routes/admin/route.tsx` (PAGE_TITLES, QUICK_MENU_SECTIONS, MORE_MENU_PATHS, BOTTOM_NAV) supaya konsisten dengan pos.

### FASE 2 — Tambah case `web` ke deploy-vps.sh
- Di fungsi argumen handler: `web) deploy_app "web" "admindjiwatentram.web.id" ;;`
- Pastikan build script `build:web` ada di root package.json (atau `bun run build` di folder web).

### FASE 3 — Build & Deploy
- `bun run build:web` (atau `cd apps/web && bun run build`).
- Clear `/var/www/admindjiwatentram.web.id/*`, copy `apps/web/dist/*`.
- `chown www-data`.

### FASE 4 — Verifikasi "Data Muncul"
- `curl` admin domain → 200.
- Cek chunk JS webroot berisi `https://supabase.djiwatentram.web.id` (bukti data source benar).
- Cek `/rest/v1/` masih 200.
- Regression: `pos.djiwatentram.web.id` tetap 200 (kita TIDAK ubah dist pos).

---

## 🗂️ Files Likely to Change
| File | Aksi |
|---|---|
| `apps/web/src/routes/admin/customers.tsx` + `.lazy.tsx` | **BARU** (copy dari pos) |
| `apps/web/src/routes/admin/operational-team/rekrutmen.tsx` + `.lazy.tsx` | **BARU** (copy dari pos) |
| `apps/web/src/routes/admin/route.tsx` | Edit: tambah 2 entri menu |
| `scripts/deploy-vps.sh` | Edit: tambah case `web` |

---

## ⚠️ Risks & Mitigation
| Risiko | Mitigasi |
|---|---|
| Modul copy butuh hook yg tidak ada di web | Cek import; copy hook yg kurang dari pos ke web/src/hooks |
| Build web gagal (type error) | Jalankan `bun run build:web` dulu, fix error sebelum deploy |
| Web app punya route customer ($brandSlug) di admin domain | Tidak berbahaya; bisa diabaikan atau disembunyikan nanti |
| POS tidak sengaja berubah | Kita TIDAK rebuild/redeploy pos — hanya ganti webroot admin domain |

---

## ✅ Success Criteria
- [ ] `admindjiwatentram.web.id` serve build `apps/web` (bukan copy pos)
- [ ] 2 modul baru (customers, rekrutmen) ada di menu admin
- [ ] Chunk JS berisi `https://supabase.djiwatentram.web.id` → data source benar
- [ ] `pos.djiwatentram.web.id` tetap 200 (regression aman)
- [ ] Tidak ada fitur admin yang hilang vs pos
