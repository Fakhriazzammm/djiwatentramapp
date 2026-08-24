---
name: cross-app-ai-image-generation-strategy
created: 2026-08-24
project: /opt/djiwatentramapp
status: partially-implemented-with-provider-blocker
scope: implementation started; AI generation remains blocked by unavailable image provider
---

# Cross-App AI Image Generation Strategy — Djiwa Tentram

## 1. Goal

Menyusun dan menerapkan sistem asset marketing/illustration berbasis OpenAI Image untuk seluruh monorepo Djiwa Tentram secara konsisten, aman, dan tidak mengganggu data operasional.

Target utama:

- Memperkuat halaman marketing dan customer-facing.
- Menyamakan visual antar `customer`, `ordermieyamin`, `karyawan`, `pos`, dan `admin`.
- Memakai satu aksen brand Djiwa Tentram: biru, bukan hijau dekoratif.
- Memisahkan gambar dekoratif dari data bisnis yang harus selalu native UI.
- Menghindari duplikasi asset antar aplikasi.
- Menyediakan asset yang dapat direuse dengan rasio dan slot yang jelas.

## 2. Non-goals

Jangan memakai generated image untuk:

- Nominal transaksi, harga, diskon, stok, ETA, status pembayaran.
- QRIS, QR code, invoice ID, kode voucher, receipt number.
- Kitchen/bar queue, order board, shift closing, finance report.
- Foto wajah staff, face recognition, signature, kontrak legal, slip gaji.
- Logo Djiwa Tentram, PWA icon, Telegram logo, atau brand mark yang harus presisi.
- Mengganti foto produk aktual yang menjadi sumber kebenaran katalog.

## 3. Current context and audit evidence

### Shared design system

- Tokens: `packages/yumipos-web-shared/src/theme.css:12-78`
- Brand primary: `#1a5dc6`
- Deep blue: `#0d2d54`
- Soft blue: `#d6e2f5`
- Background: `#fefefe` / page surface `#f7f9fc`
- Display font: Plus Jakarta Sans
- Body font: Geist/Inter
- Cards: approximately 24px radius
- Controls: approximately 14px radius

### Shared illustration registry

- Registry: `packages/yumipos-web-shared/src/components/ui/djiwa-3d-icon.tsx:31-60`
- Canonical assets: `packages/yumipos-web-shared/src/assets/djiwa-icons/`
- Existing shared set: approximately 28 WebP illustrations, generally 1024×1024.
- Existing categories: commerce, restaurant, wallet, voucher, tracking, HR, attendance, payroll, inventory, reporting, dashboard, notification.

### Existing marketing assets

- Customer Djiwa Pay banner: `apps/customer/public/djiwa-pay-20-banner.png`, 1024×576, 16:9.
- POS Happy Hour QR asset: `apps/pos/public/djiwaapp-happy-hour-qr.jpg`, 1280×1280, 1:1.
- Order Mie Yamin product source: `apps/ordermieyamin/public/mie-yamin-product.png`, 1254×1254, 1:1.

### Existing customer Home pattern

- Route: `apps/customer/src/routes/$username/route.lazy.tsx`
- Visual component: `apps/customer/src/components/customer/customer-home-sections.tsx`
- Existing banner component: `DjiwaPayOfferCard`
- Existing pattern to preserve: image background + dark overlay + native React text and CTA.

### Existing 3D/icon quality issues to address

- Sebagian asset 3D shared terlihat terpotong atau memiliki whitespace internal yang tidak konsisten ketika dipakai pada tile/menu kecil.
- Sebagian legacy illustration memiliki teks baked-in, nama persona, avatar/wajah, atau panel putih internal sehingga tidak aman dijadikan template generasi baru.
- Bottom navbar dan tombol navigasi utama membutuhkan ikon yang lebih konsisten terhadap ukuran touch target, bukan sekadar gambar 1024px yang diperkecil.
- Regenerasi harus membedakan **functional icon** dan **decorative 3D illustration**: icon untuk navigasi tetap harus terbaca cepat, sedangkan 3D asset boleh menjadi visual pendamping pada tile/card.

## 4. Priority matrix

### P0 — First implementation wave

| App / route | Asset | Ratio | Recommendation |
|---|---|---:|---|
| `apps/customer: /` | Restaurant/lifestyle hero | 16:9 or 3:2 | Customer acquisition hero; keep CTA, best-seller data, hours, address, and prices native. |
| `apps/customer: /$username` | Djiwa Pay/campaign banner | 16:9 | Extend the current `DjiwaPayOfferCard` pattern; generated image is background only. |
| `apps/ordermieyamin: /` | Mie Yamin lifestyle secondary visual | 16:9 / 4:5 | Keep `mie-yamin-product.png` as product truth; use generated image only for atmosphere/context. |

### P1 — Second implementation wave

| App / route | Asset | Ratio | Recommendation |
|---|---|---:|---|
| Customer `/$username/order?step=menu` | Menu atmosphere banner | 16:9 or 3:1 | Decorative banner only; do not bake Happy Hour text, prices, or menu claims into image. |
| Customer `/$username/promo` | Voucher/campaign header | 16:9 or 4:3 | Use image for campaign mood; promo code, dates, discount, and CTA remain native. |
| Customer history/favorite/notification/wallet empty states | Minimal illustration | 1:1 | Only when data is genuinely empty, not while loading or on query error. |
| Karyawan `/$username/beranda` / `SmartBanner` | Announcement background family | 16:5 or 3:1 | Text-free background with copy rendered from DB/React. |
| Karyawan login/register | Workplace/object hero | 4:3 or 16:9 | No identifiable faces, names, signage, or logos. |
| Admin booking customer landing | Booking campaign banner | 16:9 desktop, 4:5 or 1:1 mobile | Preview crop responsively; not for admin calendar/table. |
| Admin settings payment popup branding | Payment-branding background | 16:9 or 4:3 | Keep QRIS, amount, payment CTA, and invoice instructions above the image. |

### P2 — Shared empty-state improvements

- Admin/POS recruitment empty state: `1:1` or `4:3`.
- Admin/POS inventory truly empty: `1:1` or `4:3`.
- Forecasting without enough data: `1:1`.
- Karyawan schedule, payroll, contract, leaderboard, and notification empty states: `1:1`.
- Customer order success/tracking empty/pre-tracking state: `1:1` or `4:3`; never replace the real map/status UI.

## 5. Explicit no-image zones

### POS and Admin

- `/menu` transaction workspace, cart, checkout, and cashier controls.
- `/admin/kitchen` and `/admin/bar` live boards.
- `/admin/inventory` and `/admin/stock-overview` tables.
- Stock opname and shift closing.
- `/laporan`, finance reports, accounting, expenses, and reconciliation.
- Recruitment candidate cards and tables.
- Attendance records and staff identity views.

Use Lucide icons, charts, semantic color, tables, skeletons, and existing shared empty-state illustrations instead.

## 6. Asset contract

Every generated asset must satisfy:

- Master format: WebP or PNG; RGBA for transparent illustrations.
- Wide banners: 16:9 or 16:5/3:1 for SmartBanner.
- Product/food campaign: 1:1 or 4:5.
- Empty states/icons: 1:1, 12–16% safe margin.
- No baked-in text by default.
- No generated logos or QR codes.
- No identifiable human faces unless reference-controlled and approved.
- Main object not clipped at mobile crop.
- Blue-led palette: `#1a5dc6`, `#0d2d54`, `#d6e2f5`, white/off-white, warm food neutrals.
- Green/amber/red only for semantic success/warning/error, not as decorative primary palette.
- Consistent camera angle, lighting, shadow, and object scale within one asset family.

### 6.1 Icon button, bottom navbar, dan 3D asset contract

Regenerate a dedicated icon family, bukan hanya memakai ulang banner atau asset 3D lama yang diperkecil.

#### A. Functional navigation icons

Audit dan siapkan ulang visual untuk:

- Customer bottom navbar: Home, Pesan, Riwayat, Saldo, Profil.
- Karyawan bottom/section navigation: Beranda, Absensi, Jadwal, Rekap, Profil/notifikasi sesuai route aktif.
- POS/Admin navigation: Menu, Order, Inventory, Finance, Staff, Settings sesuai shell masing-masing.
- Tombol utama yang sering dipakai: Mulai Pesan, Pesanan Saya, Top Up, Bayar, Lihat Detail, Retry, Simpan.

Aturan:

- Untuk navigasi yang harus dipahami dalam kurang dari satu detik, prioritas pertama tetap **Lucide/line icon native** dengan stroke konsisten.
- Generated 3D icon tidak boleh menggantikan label, active state, focus ring, atau accessible name.
- Jika user memang menginginkan icon generated pada tombol/navbar, buat versi **small transparent object icon** yang ditempatkan di dalam/di atas tombol; jangan generate seluruh tombol beserta teks.
- Satu icon = satu objek utama, silhouette jelas, tanpa tulisan, angka, logo, wajah, atau background kompleks.
- Active/inactive state dibuat dengan CSS tint/opacity, bukan dua gambar AI yang berbeda.

#### B. Reusable 3D illustration family

Regenerate seluruh asset 3D existing secara bertahap agar:

- objek lengkap dan tidak terpotong;
- tidak ada whitespace berlebihan atau hard white band;
- bounding box konsisten antar asset;
- safe margin konsisten sekitar 12–16% untuk master;
- objek tetap terbaca pada render 32px, 48px, 64px, 80px, 112px, dan 160px;
- lighting, camera angle, shadow, material, dan blue-led palette seragam;
- tidak ada teks baked-in, nama orang, fake UI, wajah identitas, QR, atau brand logo;
- transparansi sudut benar-benar usable pada surface putih dan soft-blue.

Target kategori regenerasi:

```text
Commerce: customer ordering, cart, receipt, tracking, wallet, loyalty, voucher
Restaurant: restaurant/cafe, food customization, upsell, order queue
Operations: cashier, kitchen, inventory, stock opname, shift closing, suppliers
HR: attendance check-in/out, schedule, employee profile, payroll, contract, leaderboard
System: dashboard, notifications, AI assistant, delivery, returns
```

#### C. Ukuran master dan ukuran render

| Slot | Master | Render target | Catatan |
|---|---:|---:|---|
| Bottom navbar decorative icon | 512×512 transparent | 20–24px | Hanya jika tidak mengurangi scanability; native Lucide tetap fallback utama. |
| Small action button icon | 512×512 transparent | 20–32px | Satu objek, kontras tinggi, tidak boleh memenuhi seluruh tombol. |
| Menu/feature tile | 1024×1024 transparent | 40–64px | Cocok untuk Customer Home, Karyawan MenuGrid, empty state ringan. |
| Empty state | 1024×1024 transparent | 80–160px | Safe margin lebih besar dan silhouette tetap jelas. |
| Hero/large illustration | 1536×1536 atau 1024×1024 | 160–320px | Hanya untuk hero/marketing, bukan table/workspace. |

Semua ukuran render harus diuji pada ukuran aktual; master besar tidak dianggap bukti bahwa icon akan terlihat baik pada tombol 24px.

#### D. Asset naming dan canonical path

Usulan struktur:

```text
packages/yumipos-web-shared/src/assets/djiwa-icons-v2/
  navigation/
    home.webp
    order.webp
    history.webp
    wallet.webp
    profile.webp
  actions/
    add-to-cart.webp
    top-up.webp
    pay.webp
    retry.webp
    detail.webp
  domains/
    ...
```

Jangan langsung mengganti asset lama. Simpan V2 berdampingan, audit consumer, lalu migrasikan per app setelah parity visual dan ukuran terverifikasi.

## 7. Prompt and generation workflow

### Phase A — Asset manifest

Create an asset manifest before generation with:

- `asset_id`
- `canonical_path`
- `consumer_apps`
- `route_or_slot`
- `purpose`
- `ratio`
- `palette`
- `reference_images`
- `native_overlay_fields`
- `fallback_asset`
- `approval_status`

Proposed canonical location:

```text
packages/yumipos-web-shared/src/assets/djiwa-marketing/
```

Do not edit or copy generated files inside `dist/` manually.

### Phase B — Prompt documents

Save reproducible prompt files before generation, for example:

```text
packages/yumipos-web-shared/src/assets/djiwa-marketing/prompts/customer-home-djiwa-pay.md
```

Each prompt must specify:

1. Subject and visual role.
2. Djiwa Tentram blue palette.
3. Composition and blank copy-safe area.
4. Aspect ratio.
5. Lighting and camera.
6. Explicit negative constraints: no text, no logo, no QR, no price, no faces unless reference-controlled.

### Phase C — Generate one vertical slice first

Start only with:

```text
Customer Home — Djiwa Pay banner
```

Generate 2–3 candidates, compare on mobile crop, choose one, then define the family style before expanding to other apps.

### Phase D — QA and approval

Before production:

- Check dimensions and file size.
- Check alpha corners and clipping.
- Inspect for hidden text, fake names, faces, logos, or product inaccuracies.
- Render at actual mobile and desktop slot dimensions.
- Verify text/CTA contrast over image.
- Verify loading/fallback behavior.
- Human approval by product/brand owner.
- Only then copy the canonical asset into the consuming app via normal build/import flow.

### Phase E — Icon regeneration and size QA

Urutan khusus untuk icon/navbar:

1. Inventaris semua consumer `Djiwa3DIcon`, icon navbar, menu tile, action button, dan empty state.
2. Kelompokkan mana yang functional native icon dan mana yang decorative 3D.
3. Buat prompt family untuk navigation/actions/domains dengan camera, lighting, material, dan palette yang sama.
4. Generate 2–3 kandidat per kategori, bukan satu asset tanpa pembanding.
5. Jalankan crop/bounding-box QA pada render target 20px, 24px, 32px, 48px, 80px, 112px, dan 160px.
6. Uji pada background putih, `#f7f9fc`, `#d6e2f5`, dan tombol primary navy/blue.
7. Bandingkan keterbacaan dengan Lucide pada mobile screenshot.
8. Migrate one app/slot at a time; jangan melakukan global replacement sebelum semua consumer tervalidasi.
9. Hapus asset lama hanya setelah tidak ada consumer aktif dan hash/build audit menyatakan aman.

## 8. UI/UX specification

### Banner composition

```text
[image layer: generated, text-free]
[brand overlay: CSS blue/navy]
[native eyebrow]
[native headline]
[native description]
[native CTA]
```

Rules:

- One primary message per banner.
- Text stays selectable/accessibility-readable HTML.
- CTA remains a real button/link.
- `alt` text describes purpose, not generated visual details only.
- Provide `prefers-reduced-motion` behavior for carousel/banner motion.
- Use responsive object positioning per viewport.
- Do not place critical copy over high-detail image regions.

### Required states

Every new image-backed component must define:

- Loading: skeleton or reserved aspect-ratio box.
- Success: image loaded with contrast-safe overlay.
- Image error: CSS/solid-color fallback with native copy preserved.
- Empty: dedicated empty illustration only where appropriate.
- Reduced motion: no decorative image animation.

## 9. Database schema and views

No database schema change is needed for the first phase.

Existing dynamic marketing data remains authoritative:

```text
pos.site_settings / public settings views
  → Supabase REST / table view selected by existing hook
  → customer/pos/admin component
  → native text, price, date, CTA, status
```

If marketing assets become admin-configurable later, use an additive table or existing settings JSON field, not hardcoded route constants. Proposed future fields:

```text
asset_id
brand_slug
slot
asset_url
mobile_asset_url
alt_text
active
start_at
end_at
priority
created_by
```

Never store business price/copy inside the image file as the source of truth.

## 10. Multi-source data flow

### Customer promo/banner

```text
Admin/settings or marketing configuration
  → Supabase settings/marketing row
  → customer hook
  → banner component
  → generated asset URL + native dynamic copy
```

### Order Mie Yamin

```text
site settings/product catalog
  → actual product name/price/stock/config
  → native product selector
  + generated lifestyle image as secondary visual
  → checkout payload
```

### Karyawan SmartBanner

```text
announcement/HR data
  → SmartBanner hook/component
  → generated text-free background
  + native title/body/date/CTA
```

### Admin booking/payment branding

```text
admin-configured banner URL
  → customer booking/payment preview
  → native booking/payment controls
```

## 11. No-hardcode audit

Do not hardcode into generated images or JSX:

- Prices and discount percentages.
- Promo codes and expiry dates.
- Store address, phone, hours, capacity, ETA, or stock.
- Employee names, roles, payroll values, or attendance status.
- Payment amounts, invoice IDs, QRIS, or gateway instructions.

Allowed as static design tokens:

- Brand palette.
- Generic abstract scene direction.
- Fixed aspect ratio and safe margins.
- Generic copy only when explicitly static and approved.

## 12. Integration points

### OpenAI Image

- Use the configured `image_generate` tool/model.
- Prefer image-to-image for real product/banner references.
- Use text-to-image only for abstract/lifestyle scenes without exact product truth.
- Keep prompts reproducible and stored before generation.
- Download generated result into the canonical asset path; do not leave only a remote URL.

### Supabase

- No new DB write in first phase.
- Later asset administration must use existing settings/auth/RLS patterns.
- Asset activation/expiry must be data-driven if marketing scheduling is required.

### Telegram/agents

- No image generation in transaction notifications by default.
- Telegram operational messages remain text/data-first.
- Optional marketing broadcasts require separate approval and must use approved asset URLs.

### Purchasing/finance agents

- No generated visual may alter purchasing, inventory, finance, or reconciliation data.
- Images can illustrate reports only in separate presentation artifacts, never as evidence replacing tables.

## 13. Implementation waves after approval

### Wave 0 — Icon and shared 3D regeneration audit

Ini menjadi prerequisite sebelum banner lintas app agar bahasa visual tidak bercampur.

Likely audit/change scope:

- `packages/yumipos-web-shared/src/components/ui/djiwa-3d-icon.tsx`
- `packages/yumipos-web-shared/src/assets/djiwa-icons/`
- shared bottom-navigation components di `packages/yumipos-web-shared/src/components/layout/`
- customer navigation components di `apps/customer/src/components/customer/`
- karyawan navigation/menu components di `apps/karyawan/src/components/karyawan/`
- POS/Admin sidebar/navigation components di app masing-masing
- `apps/*/src/components/ui/empty-state.tsx`

Acceptance criteria:

- Tidak ada icon generated yang terpotong pada ukuran render target.
- Tidak ada teks, nama, wajah, QR, atau logo palsu pada asset V2.
- Functional navbar tetap memiliki label, active state, keyboard/focus semantics, dan fallback Lucide.
- Decorative 3D icon tidak mengubah click target atau business logic.
- Shared asset hanya memiliki satu canonical source; `dist/` tidak diedit manual.
- Visual family konsisten di Customer, Karyawan, POS, dan Admin.

### Wave 0B — Customer bottom navbar prototype

Sebelum migrasi semua app, prototype hanya pada Customer:

```text
Home / Pesan / Riwayat / Saldo / Profil
```

Deliverables:

- Native Lucide baseline.
- Optional generated 3D decorative variant.
- Screenshot comparison pada mobile.
- Perbandingan scanability, active state, contrast, dan tap target.
- Keputusan apakah generated icon benar-benar lebih baik daripada Lucide untuk navbar.

### Wave 1 — Customer Home prototype

Files likely to change:

- `apps/customer/src/components/customer/customer-home-sections.tsx`
- `apps/customer/public/` or canonical shared marketing asset path
- optional shared asset manifest/prompt file

Acceptance:

- Blue-led Djiwa Pay banner.
- Native text/CTA/benefit values.
- Mobile crop tested.
- Image fallback works.
- No generated text/logo/price.

### Wave 2 — Customer landing/promo/order banner family

Likely files:

- `apps/customer/src/routes/index.lazy.tsx`
- `apps/customer/src/routes/$username/promo.lazy.tsx`
- `apps/customer/src/components/customer/menu-section.tsx`

Acceptance:

- Shared family style.
- Dynamic promo data remains native.
- No duplicate banner hierarchy.

### Wave 3 — OrderMieYamin product/lifestyle support

Likely files:

- `apps/ordermieyamin/src/routes/index.lazy.tsx`
- `apps/ordermieyamin/src/components/customer/CustomerMenuGrid.tsx`
- canonical asset manifest and product references

Acceptance:

- Actual product image retained.
- Generated lifestyle image secondary only.
- No product/price mismatch.

### Wave 4 — Karyawan SmartBanner and empty states

Likely files:

- `apps/karyawan/src/components/karyawan/SmartBanner.tsx`
- `apps/karyawan/src/components/karyawan/MenuGrid.tsx`
- selected empty-state routes
- shared asset registry if reuse is confirmed

Acceptance:

- Text-free backgrounds.
- Native announcement content.
- No faces/names/private data.

### Wave 5 — Admin booking/payment branding

Likely files:

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- `apps/admin/src/routes/admin/settings.lazy.tsx`
- corresponding customer-facing preview components

Acceptance:

- Responsive crop preview.
- Payment controls and QRIS remain prominent.
- Expiry/active state is data-driven.

## 14. Verification plan

### Source/build

- Run `git diff --check`.
- Build only the app(s) changed in the wave using the existing `TMPDIR` workaround.
- Confirm no unrelated generated files are staged.
- Verify asset URL and hashed bundle chain.

### Visual

- Test mobile width first, then desktop.
- Capture screenshot of every changed banner/empty state.
- Check image crop, contrast, safe margin, and CTA visibility.
- Test slow image load and image failure fallback.
- Check light/dark-device behavior because project forces light theme.

### Functional

- Click CTA over/near image and verify navigation.
- Confirm dynamic text reflects current DB settings.
- Confirm no payment/order/finance flow changes.
- Confirm accessibility name and keyboard focus.

### Regression

- Customer: landing → home → menu → checkout remains unchanged.
- OrderMieYamin: product selection and payment remain unchanged.
- Karyawan: login, attendance, schedule, payroll, and closing remain unchanged.
- POS/Admin: operational tables, reports, and payment screens remain image-light.

## 15. Risks and tradeoffs

| Risk | Mitigation |
|---|---|
| AI generates fake text/logo | No-text prompt; render all copy natively; visual QA. |
| Generated product differs from real menu | Use image-to-image/reference or retain actual product photo. |
| Banner hides CTA on mobile | Safe copy area, responsive crop preview, object-position tests. |
| Asset duplication across apps | Canonical shared asset path and manifest. |
| Marketing image implies dynamic business claim | Keep claims/figures outside image; use generic atmosphere only. |
| Legacy illustrations contain names/faces | Do not use them as generation references; replace selectively later. |
| Decorative image slows operations | Exclude POS/kitchen/bar/finance/closing workspaces. |
| Admin-configured asset becomes stale | Add active/start/end metadata in a later data-driven phase. |

## 16. Open decisions before implementation

1. Apakah brand owner menyetujui style **blue-led restaurant lifestyle** sebagai style utama?
2. Apakah batch pertama hanya `Customer Home Djiwa Pay`, atau langsung mencakup customer landing?
3. Apakah generated asset akan disimpan di shared package sejak awal atau sementara di app customer?
4. Apakah marketing banner perlu dijadwalkan dari Admin, atau cukup static release asset pada fase pertama?
5. Apakah OrderMieYamin memiliki foto produk reference resmi terbaru untuk image-to-image?
6. Apakah perlu satu family asset untuk Customer/Karyawan/Admin, atau masing-masing punya visual sub-style?

## 17. Recommended first approval

Mulai dengan satu prototype saja:

```text
Customer Home — Djiwa Pay blue banner
```

Deliverables prototype:

- 2–3 generated candidates.
- Prompt reproducibility file.
- Mobile/desktop crop comparison.
- Native overlay mockup.
- Asset QA checklist.
- No code/deploy until user approves candidate and style family.

## 18. Implementation record for this execution

### Completed

- Created normalized shared fallback set at:
  `packages/yumipos-web-shared/src/assets/djiwa-icons-v2/`
- Normalized all 28 existing 3D assets into a consistent 1024×1024 transparent canvas with centered visible object and controlled safe margin.
- Added `manifest.json` with source bbox, output size, and generation status.
- Updated `packages/yumipos-web-shared/src/components/ui/djiwa-3d-icon.tsx` to consume the V2 normalized fallback set.
- Added `micro` icon size (`h-6 w-6`) for future small button/icon slots.
- Generated and integrated 5 Customer bottom-navbar icons with OpenAI Codex `gpt-image-2-medium`: Home, Pesan, Riwayat, Saldo, Profil.
- Generated and integrated 3 clean shared 3D replacements with OpenAI Codex: `customer-food-ordering`, `shopping-cart-order`, and `order-receipt`.
- Built and deployed Customer, Karyawan, POS, Admin, and OrderMieYamin bundles.
- Verified production index HTTP 200 and sampled WebP asset parity on all five domains.
- Visual contact-sheet QA confirmed object bounds are consistent and not clipped.

### Not completed / blocker

- The first FAL image-generation attempt was blocked because the FAL provider was not configured. Hermes was then correctly routed to the available OpenAI Codex OAuth backend and generated 8 valid assets.

- Remaining AI regeneration could not finish because the Codex OAuth pool started returning:

```text
No Codex/ChatGPT OAuth credentials available
```

- 25 of the original 28 shared 3D slots still use normalized legacy fallback and inherit possible content warnings from the source set, including baked-in text, a persona name, and human/avatar elements. These must not be treated as the final V2 generated set.
- New marketing banners for Customer landing, Customer menu/promo, Karyawan SmartBanner, and OrderMieYamin lifestyle remain pending image-provider availability and visual approval.

### Required continuation when image provider is available

1. Refresh/re-authenticate the Codex OAuth pool when the usage limit clears.
2. Generate 2–3 candidates for the remaining navigation/action icon family.
3. Generate clean text-free replacements for the remaining 25 shared 3D assets.
4. Repeat 20px–160px crop QA and contact-sheet review.
5. Replace normalized fallback only after no-text/no-face/no-name inspection passes.
6. Generate Customer Home/landing, Customer promo, Karyawan SmartBanner, and OrderMieYamin lifestyle banners.
7. Rebuild, screenshot, approve, deploy, and verify each consumer app.
