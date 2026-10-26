# Plan: Pindahkan Admin POS ke Subdomain Baru `admindjiwatentram.web.id`

**Tanggal:** 2026-07-29
**Author:** Zantara
**Status:** 🟡 Menunggu persetujuan
**Task type:** Architecture restructuring + domain provisioning (operasional LIVE — zero-downtime wajib)

---

## 🎯 Goal

Membuat subdomain baru `admindjiwatentram.web.id` yang menampung **seluruh panel admin** (yang sekarang di `pos.djiwatentram.web.id/admin`), untuk mempermudah pengelolaan admin.

**Syarat mutlak dari user:**
1. Sistem, fitur, fungsi **sama persis** — tidak ada yang berkurang. Boleh ditambah, tidak boleh dihapus.
2. UI/UX pakai skill `ai-product-design-dna` + MD Product Design Standard. Boleh ubah layout / rombak asalkan fungsi tetap.
3. **End-to-end, tanpa error** — aplikasi & operasional (kasir, absensi, order) **sedang berjalan**.

---

## 📊 Current Context (Hasil Investigasi Codebase)

### Fakta arsitektur penting (SUDAH DIVERIFIKASI, bukan asumsi)

| Fakta | Detail |
|---|---|
| **`pos.djiwatentram.web.id` bukan app "admin"** | Ia adalah **1 app monolitik** `@yumipos/pos` yang berisi: `/admin/*` (116 file), `/kasir/login`, `/attendance`, `/attendance/stock-opname`, `/menu`, `/register`, `/booking`, `/karyawan/login`, `/dashboard`, `/home`. Admin cuma **1 sub-route**. |
| **Admin sangat terkopling** | Admin memakai hook & komponen shared: `use-hybrid-pos-data` (43×), `use-hybrid-write-actions` (21×), `use-hybrid-finance-analytics-data` (14×), `useYumiAuth`, `Footer`, `dropdown-menu`, dll. Hook yang **sama persis** dipakai kasir/attendance/menu. |
| **Auth guard** | `__root.tsx` → kalau `!isAuthenticated` redirect ke `/kasir/login`. Admin login di `/admin/login`. Guard permission per-item pakai `isAdmin \|\| role?.permissions?.includes(...)`. |
| **Router** | TanStack Router, default basepath `/`. Tidak ada `basepath` custom. |
| **Deploy** | `bun run build:pos` (turbo filter `@yumipos/pos`) → `dist/` (21 MB) → copy ke `/var/www/pos.djiwatentram.web.id`. Script: `scripts/deploy-vps.sh pos`. |
| **PWA** | pos punya service worker + manifest, `scope: "/"`, `registerType: autoUpdate`. |
| **Nginx** | `/etc/nginx/sites-enabled/djiwa-pos` → `server_name pos.djiwatentram.web.id`, root `/var/www/pos.djiwatentram.web.id`, SPA fallback, proxy `/api/rekrutmen/` → :3456. SSL via certbot. |
| **DNS** | `admindjiwatentram` **BELUM ADA**. Yang ada: pos, karyawan, djiwatentram, hrd, supabase, rekrutmen, belajarjepang → semua A record → `43.129.54.5`. Hostinger CLI config ADA ✅. |
| **App lain tidak link ke /admin** | `apps/karyawan` & `apps/customer` **tidak** punya link ke `pos.djiwatentram.web.id/admin`. Aman dari sisi itu. |

### Apa yang sudah ada vs apa yang diminta

- **Sudah ada:** Admin lengkap & berfungsi di `pos.djiwatentram.web.id/admin` (dasbor, produk, resep, HPP, inventaris, keuangan+akuntansi+transaksi+laporan+shift, pesanan, promosi, Yumi AI, tim operasional: absensi+payroll+register+kontrak+karyawan+rekrutmen, kitchen, bar, customer service, booking, minigames, forecasting, settings, stock-overview).
- **Diminta:** Admin yang sama, tapi diakses lewat domain sendiri `admindjiwatentram.web.id` agar pengelolaan lebih mudah. UI boleh dirombak (compact/professional) selama fungsi utuh.

---

## ⚖️ Alternatives Analysis (WAJIB — user minta "pindahkan bisa?")

Ada 3 cara memindahkan admin ke subdomain. Masing-masing punya trade-off nyata untuk operasional LIVE.

### Opsi A — **Domain baru, app POS yang SAMA (multi-host, tanpa split kode)** ⭐

Deploy `dist/` POS yang **sama** ke `/var/www/admindjiwatentram.web.id`, tambahkan `admindjiwatentram.web.id` ke nginx (host tambahan), user akses `admindjiwatentram.web.id/admin`. Opsional: root `/` di domain admin auto-redirect ke `/admin/login`.

| Pros | Cons |
|---|---|
| ✅ **ZERO perubahan kode aplikasi** — tidak sentuh hooks/komponen shared | ❌ Domain admin juga secara teknis bisa buka `/kasir`, `/menu` (bisa di-hide, tapi kode tetap ada) |
| ✅ **Risiko operasional ~nol** — `pos.djiwatentram.web.id` tidak berubah sama sekali | ❌ Dua domain melayani bundle 21 MB yang sama (duplikasi disk, wajar) |
| ✅ Cepat: DNS + nginx + copy dist + certbot | ❌ Bukan pemisahan "bersih" secara arsitektur (tapi user minta kemudahan akses, bukan pemisahan kode) |
| ✅ Bisa langsung online hari ini, rollback instan (hapus nginx block) | ❌ PWA scope sama → kalau user install PWA dari 2 domain, 2 entri terpisah (bukan masalah) |
| ✅ Rombak UI admin = edit `route.tsx` admin saja, kena ke KEDUA domain sekaligus (konsisten) | |

### Opsi B — **Split app admin terpisah (`apps/admin` baru)**

Buat workspace `apps/admin` baru, pindahkan 116 file route admin + ekstrak semua shared hooks (`use-hybrid-*.ts` ~ribuan baris) & komponen ke `packages/yumipos-web-shared`, build terpisah, deploy ke domain admin.

| Pros | Cons |
|---|---|
| ✅ Pemisahan arsitektur "bersih" — admin punya bundle sendiri, lebih kecil | ❌ **RISIKO TINGGI ke operasional LIVE**: ekstraksi `use-hybrid-write-actions.ts` (6000+ baris) & 40+ hook shared. Salah sedikit → kasir/absensi ikut rusak |
| ✅ Domain admin murni admin (tidak ada /kasir) | ❌ Butuh refactor besar auth (`__root.tsx` admin → redirect `/admin/login`, bukan `/kasir/login`) |
| ✅ PWA & bundle teroptimasi per-app | ❌ Estimasi besar, banyak titik gagal, sulit dijamin "tanpa error" di app yang sedang jalan |
| | ❌ Duplikasi config (vite, tailwind, tsconfig, PWA) + maintenance 2× |
| | ❌ Melanggar "tanpa error karena operasional berjalan" — window risiko besar |

### Opsi C — **Reverse-proxy only (nginx rewrite `admindjiwatentram.web.id/` → `pos.djiwatentram.web.id/admin`)**

Domain admin nginx proxy_pass ke pos, atau rewrite root ke /admin. Tanpa deploy dist terpisah.

| Pros | Cons |
|---|---|
| ✅ Tidak duplikasi disk | ❌ SPA + PWA + router basepath jadi rumit (asset path `/assets/` bentrok, SW scope) |
| ✅ Satu sumber bundle | ❌ Rewrite path SPA client-side router rawan broken link & 404 saat refresh |
| | ❌ Lebih rapuh daripada Opsi A untuk keuntungan minim |

### ⭐ REKOMENDASI: **Opsi A** (domain baru, app sama, multi-host)

**Alasan:**
1. **Memenuhi tujuan user 100%** — user minta "subdomain baru untuk mempermudah pengelolaan admin", BUKAN "pisahkan kode admin dari POS". Opsi A memberi domain khusus admin tanpa menyentuh apa pun yang bisa merusak operasional.
2. **Zero risk ke operasional** — `pos.djiwatentram.web.id` (kasir, absensi, order) **tidak berubah satu byte pun**. Ini syarat mutlak "tanpa error karena operasional berjalan".
3. **Rollback instan** — kalau ada masalah, hapus 1 nginx server block → selesai. Opsi B tidak bisa di-rollback semudah itu.
4. **Rombak UI tetap bisa** — permintaan "UI boleh dirombak" dikerjakan dengan mengedit `admin/route.tsx` + halaman admin. Karena app sama, perubahan otomatis konsisten di kedua domain. **Tidak ada fitur yang hilang** karena kode 100% sama.
5. Kalau nanti user benar-benar mau pemisahan kode penuh (Opsi B), itu bisa jadi fase lanjutan **setelah** domain admin stabil — tidak perlu ambil risiko sekarang.

**Guard tambahan (opsional, aman):** Di domain admin, root `/` bisa langsung ke `/admin/login`. Bisa lewat 2 cara:
- (a) nginx: `location = / { return 302 /admin/login; }` di server block admin saja — TIDAK sentuh kode.
- (b) Deteksi hostname di app: kalau `window.location.hostname === "admindjiwatentram.web.id"` → default route ke `/admin`. Sedikit sentuh kode tapi terpusat di 1 tempat.
Rekomendasi: **cara (a) nginx** — nol perubahan kode.

---

## 🗂️ Proposed Approach (Opsi A) — Langkah Detail

### FASE 0 — Persiapan (read-only, verifikasi)
1. Verifikasi Hostinger CLI/token aktif: `curl` list DNS `djiwatentram.web.id` (sudah ✅).
2. Cek disk VPS ≥ 3 GB free (dibutuhkan build): `df -h /`.
3. Konfirmasi build POS terkini sehat: bandingkan `/var/www/pos.djiwatentram.web.id/version.json` dengan `dist`.

### FASE 1 — DNS (Hostinger CLI)
4. **Validate** dulu record baru:
   ```bash
   hostinger dns records validate djiwatentram.web.id \
     --zone '[{"name":"admindjiwatentram","type":"A","records":[{"content":"43.129.54.5"}],"ttl":300}]'
   ```
5. **Apply** dengan `--overwrite=false` (append, tidak hapus record lain):
   ```bash
   hostinger dns records update djiwatentram.web.id \
     --zone '[{"name":"admindjiwatentram","type":"A","records":[{"content":"43.129.54.5"}],"ttl":300}]' \
     --overwrite=false
   ```
6. **Verify propagasi**: `dig @ns1.dns-parking.com admindjiwatentram.web.id A +short` → harus `43.129.54.5`. Lalu `dig @8.8.8.8 ...`.
   - ⚠️ Karena ini record **BARU** (bukan mengganti CNAME lama), tidak ada masalah stale-cache ISP. Propagasi cepat (TTL 300s).

### FASE 2 — Direktori & Nginx (HTTP dulu, untuk certbot)
7. Buat direktori web root:
   ```bash
   sudo mkdir -p /var/www/admindjiwatentram.web.id
   ```
8. Buat nginx server block **HTTP-only** dulu (agar certbot bisa jalan — hindari deadlock cert):
   ```nginx
   # /etc/nginx/sites-available/djiwa-admin
   server {
       server_name admindjiwatentram.web.id;
       root /var/www/admindjiwatentram.web.id;
       index index.html;
       client_max_body_size 10m;

       # (opsional) root langsung ke admin login — nol perubahan kode
       location = / { return 302 /admin/login; }

       location / { try_files $uri $uri/ /index.html; }
       location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
       location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
       location = /version.json { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
       location = /sw.js { add_header Cache-Control "no-cache, no-store, must-revalidate"; }

       # proxy rekrutmen SAMA seperti pos (kalau admin akses fitur rekrutmen)
       location /api/rekrutmen/ {
           proxy_pass http://127.0.0.1:3456/api/;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       listen 80;
   }
   ```
9. Symlink & test:
   ```bash
   sudo ln -s /etc/nginx/sites-available/djiwa-admin /etc/nginx/sites-enabled/djiwa-admin
   sudo nginx -t && sudo systemctl reload nginx
   ```

### FASE 3 — SSL (certbot Let's Encrypt)
10. Issue cert (nginx plugin auto-upgrade block ke 443):
    ```bash
    sudo certbot --nginx -d admindjiwatentram.web.id \
      --non-interactive --agree-tos --email <email-owner>
    ```
11. Verify: `curl -sk -o /dev/null -w "%{http_code}\n" https://admindjiwatentram.web.id/admin/login`.

### FASE 4 — Rombak UI Admin (sesuai skill design DNA) — DIKERJAKAN DI KODE POS
> Karena app sama, ini otomatis apply ke kedua domain. **Tidak menghapus fitur apa pun.**
12. Load skill `ai-product-design-dna` + `table-first-admin-ui-overhauls` + `admin-ui-compaction`.
13. Target rombak (opsional, sesuai izin user "boleh dirombak"):
    - `admin/route.tsx` (sidebar + bottom nav + header) — compact, Lucide 2px, Inter/Plus Jakarta Sans, one-accent, mobile-first.
    - Halaman index dasbor `admin/index.tsx`.
14. **Aturan mutlak:** semua route/menu/permission yang ada sekarang **tetap ada** (verifikasi pakai daftar 116 file + `QUICK_MENU_SECTIONS` + `MORE_MENU_PATHS` + `BOTTOM_NAV_ITEMS`). Boleh reorganisasi visual, TIDAK boleh hilangkan entri.
15. Verifikasi tab corruption setelah tiap edit (Python byte-check `\t`).

### FASE 5 — Build & Deploy
16. Build POS sekali:
    ```bash
    cd /opt/djiwatentramapp && bun run build:pos
    ```
17. Deploy ke KEDUA domain (pos sudah live, admin domain baru):
    ```bash
    # domain admin baru
    sudo rm -rf /var/www/admindjiwatentram.web.id/*
    sudo cp -r apps/pos/dist/* /var/www/admindjiwatentram.web.id/
    sudo chown -R www-data:www-data /var/www/admindjiwatentram.web.id/
    # pos.djiwatentram.web.id di-redeploy HANYA jika FASE 4 mengubah UI (kalau tidak, biarkan)
    sudo cp -r apps/pos/dist/* /var/www/pos.djiwatentram.web.id/   # hanya jika UI dirombak
    sudo chown -R www-data:www-data /var/www/pos.djiwatentram.web.id/
    ```
    - ⚠️ Kalau FASE 4 di-skip (UI tidak dirombak), `pos.djiwatentram.web.id` **tidak disentuh** sama sekali → risiko nol.

### FASE 6 — Verifikasi End-to-End
18. Login admin di `https://admindjiwatentram.web.id/admin/login` → dasbor tampil.
19. Cek 5 modul kritikal: Keuangan, Transaksi, Absensi, Payroll, Inventaris → data live tampil.
20. **Regression pos.djiwatentram.web.id**: buka `https://pos.djiwatentram.web.id/kasir/login`, `/attendance` → pastikan operasional TIDAK terganggu.
21. Cek console error (browser_console) di kedua domain.
22. Cek PWA: manifest & SW load di admin domain.
23. Screenshot bukti (browser_vision) sebelum vs sesudah UI rombak.

---

## 🗄️ Database / Backend Impact

**TIDAK ADA perubahan database.** Admin domain baru pakai:
- `VITE_SUPABASE_URL=https://supabase.djiwatentram.web.id` (sama) — build env tidak berubah.
- Edge Functions, RLS, Better Auth (:3001), rekrutmen (:3456) — semua tetap. Domain admin memproxy `/api/rekrutmen/` sama seperti pos.
- ⚠️ **CORS/Auth check**: `VITE_AUTH_URL` & Better Auth mungkin punya allowed-origins. Perlu cek apakah `admindjiwatentram.web.id` harus di-whitelist di config Better Auth / Supabase auth redirect. **(OPEN QUESTION #2 di bawah)**

---

## 📁 Files Likely to Change

### Infrastruktur (server, bukan repo)
| File | Aksi |
|---|---|
| DNS `djiwatentram.web.id` (Hostinger) | + A record `admindjiwatentram` |
| `/etc/nginx/sites-available/djiwa-admin` | **BARU** — server block |
| `/etc/nginx/sites-enabled/djiwa-admin` | **BARU** — symlink |
| `/etc/letsencrypt/live/admindjiwatentram.web.id/` | **BARU** — cert (certbot) |
| `/var/www/admindjiwatentram.web.id/` | **BARU** — dist POS |

### Kode repo (HANYA jika FASE 4 rombak UI dijalankan)
| File | Aksi |
|---|---|
| `apps/pos/src/routes/admin/route.tsx` | Rombak sidebar/nav/header (compact, design DNA) — TANPA hapus menu |
| `apps/pos/src/routes/admin/index.tsx` | Rombak dasbor (opsional) |
| (opsional) `apps/pos/.env` | Kalau perlu deteksi hostname / auth origin |

### Kalau UI TIDAK dirombak → **NOL file kode berubah**, murni infra.

---

## ✅ Tests / Validation

1. `nginx -t` sukses sebelum reload.
2. `dig` admindjiwatentram → 43.129.54.5 (authoritative + public).
3. `curl -sk https://admindjiwatentram.web.id/admin/login` → 200 + HTML.
4. Login admin sukses, dasbor + 5 modul tampil data live.
5. **pos.djiwatentram.web.id regression**: kasir/attendance masih normal (bukti operasional aman).
6. Browser console 0 error di kedua domain.
7. Build `bun run build:pos` exit 0.
8. Kalau UI dirombak: semua entri menu lama masih ada (checklist 116 route + 3 menu-group).

---

## ⚠️ Risks, Tradeoffs & Mitigation

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Certbot deadlock (cert belum ada saat nginx test) | SSL gagal | Pakai HTTP-only block dulu (FASE 2), baru certbot upgrade (skill hostinger-cli) |
| Redeploy `pos.djiwatentram.web.id` untuk UI baru bikin downtime sesaat | Kasir kehilangan akses beberapa detik | Deploy pakai `cp -r` (atomic-ish); atau deploy ke domain admin dulu, pos belakangan di jam sepi. Kalau UI tidak dirombak → pos tidak disentuh |
| Better Auth / Supabase belum whitelist origin admin | Login admin gagal (CORS) | **Cek dulu** config Better Auth allowed-origins sebelum go-live (OPEN Q#2). Tambah origin bila perlu (additive, tidak hapus pos) |
| Tab corruption saat rombak `route.tsx` (tab-indented) | Sidebar rusak `\t\t\t` | Pakai `execute_code` open() / heredoc, byte-check `\t` tiap edit (skill plan) |
| PWA SW cache lama nyangkut di domain admin | User lihat versi lama | `registerType: autoUpdate` + no-cache header sw.js sudah ada. Hard-refresh saat verifikasi |
| Hilang fitur saat rombak UI | Melanggar syarat user | Checklist entri menu wajib cocok 1:1 sebelum & sesudah |

---

## ❓ Open Questions (perlu jawaban user sebelum eksekusi)

1. **UI rombak: iya/tidak & seberapa jauh?**
   User bilang "boleh dirombak". Tapi merombak = redeploy `pos.djiwatentram.web.id` juga (karena app sama) → ada window deploy singkat. Pilihan:
   - **(a)** Go-live domain admin dulu TANPA rombak UI (nol risiko ke pos), rombak UI menyusul terjadwal.
   - **(b)** Rombak UI sekalian sekarang, deploy dua-duanya (butuh window jam sepi).
2. **Email untuk certbot Let's Encrypt?** (default pakai email owner — konfirmasi alamat).
3. **Root `/` di domain admin:** auto-redirect ke `/admin/login` (rekomendasi) atau biarkan buka landing pos biasa?
4. **Konfirmasi Opsi A** (rekomendasi) vs mau Opsi B (split kode penuh — risiko tinggi, tidak disarankan sekarang).

---

## 🔭 Fase Lanjutan (opsional, di masa depan)

Jika suatu saat mau pemisahan kode penuh (Opsi B): buat `apps/admin`, ekstrak shared hooks ke `packages/yumipos-web-shared`, refactor auth. Dilakukan **setelah** domain admin stabil, dengan plan & window terpisah. Tidak sekarang.

---

## 📌 Ringkasan Rekomendasi

> **Opsi A**: Tambah DNS `admindjiwatentram.web.id` → nginx host baru → certbot → copy `dist` POS yang sama → (opsional) rombak UI admin. Memenuhi tujuan "domain khusus admin untuk kemudahan" dengan **risiko operasional ~nol** dan **rollback instan**. Fitur 100% utuh karena kode sama.
