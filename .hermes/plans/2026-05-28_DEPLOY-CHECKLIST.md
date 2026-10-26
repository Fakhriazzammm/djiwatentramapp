# Deployment Checklist — Opsi B Multi-Domain

**Plan:** `.hermes/plans/2026-05-28_143000-opsi-b-multi-domain-enhanced.md`

## Pre-Deploy Verification

- [x] `apps/pos` build sukses (102 precache entries, 6MB)
- [x] `apps/customer` build sukses (8 precache entries, 709KB)
- [x] Supabase CORS: `*` (sudah allow all)
- [x] POS `__root.tsx`: brandSlug heuristic dihapus
- [x] GitHub pushed

---

## Step 1: Cloudflare Pages — `yumme-pos`

1. Buka https://dash.cloudflare.com → Workers & Pages → Create
2. Connect GitHub repo `Fakhriazzammm/djiwatentramapp`
3. **Project name:** `yumme-pos`
4. **Production branch:** `main`

Build settings:
```
Framework preset:   None
Build command:      cd ../.. && bun run build:pos
Build output dir:   apps/pos/dist
Root directory:     apps/pos
```

5. Environment variables:
```
VITE_SUPABASE_URL=https://xaemykhjpkgypqqpfdcb.supabase.co
VITE_SUPABASE_ANON_KEY=(copy from apps/web/.env)
```

6. Custom domain: `pos.djiwatentram.web.id`

---

## Step 2: Cloudflare Pages — `yumme-app`

1. Create another Pages project
2. **Project name:** `yumme-app`

Build settings:
```
Framework preset:   None
Build command:      cd ../.. && bun run build:customer
Build output dir:   apps/customer/dist
Root directory:     apps/customer
```

3. Same env variables as above
4. Custom domain: `djiwatentram.web.id`

---

## Step 3: DNS Setup (Cloudflare)

Buat CNAME records:

| Type | Name | Target | TTL |
|---|---|---|---|
| CNAME | `pos` | `yumme-pos.pages.dev` | Auto |
| CNAME | `djiwatentram` | `yumme-app.pages.dev` | Auto |

---

## Step 4: PWA Icons (Customer App)

Ganti file di `apps/customer/public/`:
- `pwa-app-192.png` → ikon 192x192 untuk "Djiwa Tentram App"
- `pwa-app-512.png` → ikon 512x512

Saat ini masih placeholder (copy dari POS). Rebuild setelah ganti:
```bash
bun run build:customer
```

---

## Step 5: Staging Test

1. Deploy kedua project CF Pages
2. Tes `pos.djiwatentram.web.id`:
   - [ ] Login kasir
   - [ ] `/menu` — tambah item, checkout, payment
   - [ ] `/admin/inventory` — edit stok
   - [ ] `/admin/operational-team/karyawan` — lihat data
   - [ ] Shift buka/tutup
3. Tes `djiwatentram.web.id`:
   - [ ] `/djiwatentram` — welcome screen
   - [ ] Browse menu, tambah ke cart
   - [ ] Checkout + payment
   - [ ] Minigames (spin wheel)

---

## Step 6: Cutover (Malam, 23:00)

1. Umumkan maintenance ke tim kasir
2. Update DNS `app.djiwatentram.web.id` → redirect ke `pos.djiwatentram.web.id`
3. Test 15 menit: POS + customer order
4. Kalau OK → done
5. Kalau gagal → revert DNS (5 menit, TTL 60 detik)

---

## Rollback Plan

```
Cloudflare Dashboard → DNS → Records
  app.djiwatentram.web.id → KEMBALI ke yumme-app.pages.dev (existing)
Propagasi max 1 menit (TTL 60 detik)
```

`apps/web` tetap ada sebagai cold backup 1 minggu.
