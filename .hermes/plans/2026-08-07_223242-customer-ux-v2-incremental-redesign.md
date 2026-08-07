# Plan: Incremental Redesign `apps/customer` — Customer UX v2

## 0. Tujuan

Meningkatkan kualitas pengalaman customer-facing app tanpa rewrite total dan tanpa mengubah business logic order/payment yang sudah berjalan.

Target utama:

- Customer langsung memahami CTA utama: mulai pesan.
- Homepage tidak terasa seperti kumpulan shortcut yang setara.
- Navigasi konsisten antara Home, Pesan, Riwayat, Poin, dan Profil.
- Order flow memiliki hierarchy dan progress yang jelas.
- Cart, checkout, service sheet, dan receipt memakai pola visual yang sama.
- Mobile touch target, safe-area, loading, empty, error, dan saving state aman.

## 1. Keputusan arsitektur

### Approach yang dipilih: incremental redesign

Tidak dilakukan:

- Rewrite seluruh `apps/customer`.
- Perubahan schema database.
- Perubahan API Mayar/order/service request.
- Perubahan guest authentication atau route contract.
- Penghapusan fitur existing tanpa audit navigasi.

Dilakukan:

- Mempertahankan TanStack Router, hybrid hooks, `useOrderContext`, dan komponen UI shared.
- Membuat satu visual shell yang konsisten di level route/components.
- Mengubah information architecture secara bertahap.
- Memecah perubahan per vertical slice dan build setelah setiap wave.

Alasan: fondasi functional sudah berjalan; masalah terbesar ada pada visual hierarchy, density, dan navigasi mobile. Incremental approach menurunkan risiko regression pada checkout/payment.

## 2. Current context yang sudah diverifikasi

Route utama customer:

```text
/                         landing
/$username                guest/member home
/$username/order          party → refill → menu → checkout → receipt
/$username/riwayat       order history
/$username/poin          loyalty points
/$username/promo         promo
/$username/favorit       favorites
/$username/profile       profile/login gate
/$username/notifikasi    notifications
/$username/minigames     active games
```

Komponen order sudah sebagian diekstrak:

```text
apps/customer/src/components/customer/menu-section.tsx
apps/customer/src/components/customer/checkout-section.tsx
apps/customer/src/components/customer/receipt-section.tsx
apps/customer/src/components/customer/shared-components.tsx
apps/customer/src/components/customer/barcode-scanner.tsx
apps/customer/src/components/customer/product-sheet.tsx
```

Karena itu, plan ini tidak memasukkan extraction mekanis dari file order yang sudah memiliki komponen tersebut.

## 3. Design principles

| Prinsip | Implementasi |
|---|---|
| CTA-first | `Mulai pesan` menjadi aksi paling dominan di homepage |
| One accent | Gunakan accent existing `#1a5dc6`; hindari banyak warna primer |
| Mobile thumb-zone | CTA dan navigasi penting berada di area jangkauan ibu jari |
| Consistent shell | Header, card, sheet, CTA, spacing, dan typography memakai pattern sama |
| Progressive disclosure | Fitur sekunder masuk Profil/More, bukan memenuhi homepage |
| Safe interaction | Semua sheet/modal punya max-height, internal scroll, z-index, dan safe-area |
| State completeness | Loading, empty, error, saving/success selalu memiliki feedback |
| No business regression | UI boleh berubah; payload, hooks, route, dan payment state tidak berubah |

## 4. Target information architecture

### Homepage

```text
Brand/header
↓
Greeting customer
↓
[ MULAI PESAN ]
↓
Pesan lagi / order terakhir (jika tersedia)
↓
Menu populer (jika data tersedia)
↓
Promo aktif (jika data tersedia)
↓
Akses cepat: Riwayat, Poin, Promo, Favorit, Profil, Notifikasi
```

### Bottom navigation

Target lima item:

```text
[Home] [Pesan] [Riwayat] [Poin] [Profil]
```

Fitur sekunder yang tetap hidup tetapi tidak memenuhi bottom nav:

```text
Promo, Favorit, Notifikasi, Minigames, Bantuan
```

`Staff` tetap menjadi contextual action di order/receipt, bukan primary customer navigation.

### Order flow

```text
1 Data meja → 2 Menu → 3 Checkout → 4 Selesai
```

Progress indicator bersifat visual dan tidak mengubah state machine existing.

## 5. Wave plan dan dependency graph

### Wave 0 — Baseline dan contract audit

**Tujuan:** mengunci baseline sebelum perubahan.

- Audit `route.lazy.tsx`, `CustomerMenuGrid.tsx`, order route, shared components, dan semua navigation target.
- Catat route IDs, query params order (`step`, dsb.), guest-data contract, dan hook output.
- Capture baseline screenshot pada viewport mobile 375×812 dan 390×844.
- Catat console error, layout overlap, dan touch target yang bermasalah.

File baca utama:

```text
apps/customer/src/routes/$username/route.lazy.tsx
apps/customer/src/components/customer/CustomerMenuGrid.tsx
apps/customer/src/routes/$username/order.lazy.tsx
apps/customer/src/components/customer/shared-components.tsx
apps/customer/src/index.css
packages/yumipos-web-shared/theme.css
```

Output: baseline checklist dan daftar regression route.

### Wave 1 — Shared customer shell dan visual tokens

**Dependensi:** Wave 0.

- Buat/standarkan komponen shell jika belum ada:
  - `CustomerHeader`
  - `CustomerSectionHeading`
  - `CustomerPrimaryCta`
  - `CustomerBottomNav`
  - `CustomerEmptyState`
- Reuse shared design tokens; jangan membuat global CSS baru yang bocor.
- Standarkan:
  - typography scale
  - panel radius
  - CTA height minimal 44px
  - sheet/modal z-index
  - mobile safe-area padding

File kemungkinan:

```text
apps/customer/src/components/customer/customer-shell.tsx
apps/customer/src/components/customer/customer-states.tsx
apps/customer/src/components/customer/shared-components.tsx
apps/customer/src/index.css        # hanya jika token lokal benar-benar diperlukan
```

### Wave 2 — Homepage redesign

**Dependensi:** Wave 1.

- Ubah homepage dari shortcut grid menjadi hierarchy berbasis CTA.
- Pertahankan semua route menu existing.
- Tambahkan section bersyarat:
  - last order hanya jika data tersedia
  - popular menu hanya jika data tersedia
  - active promo hanya jika data tersedia
- Akses cepat memakai visual weight sekunder.
- Pastikan inactive Minigames tidak menghasilkan grid dengan layout janggal.
- Pastikan guest dan member tetap memiliki CTA yang sesuai.

File kemungkinan:

```text
apps/customer/src/routes/$username/route.lazy.tsx
apps/customer/src/components/customer/CustomerMenuGrid.tsx
apps/customer/src/components/customer/customer-home-sections.tsx
```

### Wave 3 — Bottom navigation dan route consistency

**Dependensi:** Wave 1 dan Wave 2.

- Implementasi bottom nav lima item pada parent layout.
- Audit seluruh navigation call agar tetap memakai `username` route param yang benar.
- Pastikan child route tetap menjadi sibling `<Outlet />`, bukan terjebak dalam wrapper `display:none`.
- Hide bottom nav ketika:
  - cart open
  - service sheet open
  - scanner open
  - checkout aktif
  - modal full-focus aktif
- Tambahkan active state berdasarkan route, bukan state duplikat.

File kemungkinan:

```text
apps/customer/src/routes/$username/route.lazy.tsx
apps/customer/src/components/customer/customer-bottom-nav.tsx
apps/customer/src/routes/$username/order.lazy.tsx
```

### Wave 4 — Order shell dan katalog

**Dependensi:** Wave 1 dan Wave 3.

- Tambahkan progress indicator non-breaking.
- Standarkan header tiap step.
- Rapikan katalog:
  - category chips
  - search
  - product card
  - price/promo hierarchy
  - fallback image
  - duplicate menu feedback
- Pertahankan search dan duplicate guard existing.
- Cart card dan ProductSheet memakai spacing/action pattern yang sama.

File kemungkinan:

```text
apps/customer/src/routes/$username/order.lazy.tsx
apps/customer/src/components/customer/menu-section.tsx
apps/customer/src/components/customer/product-sheet.tsx
apps/customer/src/components/customer/shared-components.tsx
```

### Wave 5 — Cart, checkout, receipt, service sheet

**Dependensi:** Wave 4.

- Cart:
  - item list lebih ringkas
  - total lebih dominan
  - CTA sticky dengan safe-area
- Checkout:
  - payment method lebih jelas
  - ringkasan order dipisahkan dari form
  - tidak ada bottom-nav distraction
- Receipt:
  - status pembayaran/order lebih jelas
  - `Pesan lagi` dan `Hubungi staff` menjadi action terpisah
- Service sheet:
  - max-height `100dvh`
  - internal scroll
  - z-index konsisten
  - tombol staff minimal 44px
- Scanner/product sheet tetap lazy-loaded.

File kemungkinan:

```text
apps/customer/src/routes/$username/order.lazy.tsx
apps/customer/src/components/customer/checkout-section.tsx
apps/customer/src/components/customer/receipt-section.tsx
apps/customer/src/components/customer/barcode-scanner.tsx
apps/customer/src/components/customer/product-sheet.tsx
```

### Wave 6 — Loyalty/profile/promo/favorites

**Dependensi:** Wave 2 dan Wave 3.

- Satukan visual shell halaman member/guest.
- Profile guest tetap login gate yang jelas.
- Poin menampilkan balance, earning history, dan empty/loading/error state dengan hierarchy sama.
- Promo menampilkan active/expired state dan copy action.
- Favorites menampilkan empty state dengan CTA kembali ke menu.
- Notifikasi memakai list state yang konsisten.

File kemungkinan:

```text
apps/customer/src/routes/$username/profile.lazy.tsx
apps/customer/src/routes/$username/poin.lazy.tsx
apps/customer/src/routes/$username/promo.lazy.tsx
apps/customer/src/routes/$username/favorit.lazy.tsx
apps/customer/src/routes/$username/notifikasi.lazy.tsx
```

### Wave 7 — QA, build, dan release

**Dependensi:** semua wave.

- Build customer.
- Browser E2E guest dan member.
- Visual QA pada 375×812, 390×844, 430×932, dan desktop narrow.
- Console zero new errors.
- `git diff --check -- apps/customer/src`.
- Deploy hanya customer domain setelah approval/release command.
- Hard refresh/PWA cache verification.

## 6. UI/UX specification

### Shared dimensions

| Elemen | Target |
|---|---|
| Primary CTA | min-height 44px; ideal 48px pada checkout |
| Icon action | min 44×44px untuk close/back/action |
| Panel radius | gunakan token existing; target sekitar 20–24px |
| Mobile horizontal padding | 16px |
| Section gap | 24–32px antar section; 8–12px antar item |
| Sheet | `max-h-[calc(100dvh-1rem)]`, `overflow-y-auto`, safe-area |
| Bottom nav | fixed hanya pada non-focus state |
| Text body | minimum 12px untuk metadata; 14–16px untuk primary content |

### Required states per section

| Section | Loading | Empty | Error | Saving/success |
|---|---|---|---|---|
| Homepage data | skeleton section | hide optional section | compact retry | n/a |
| Catalog | product skeleton | menu kosong + retry/menu CTA | retry message | add-to-cart feedback |
| Cart | n/a | empty cart + `Pilih menu` | n/a | quantity update feedback |
| Checkout | disabled CTA + loading label | no cart guard | payment error inline/toast | invoice success state |
| Promo | promo skeleton | `Belum ada promo` | retry | code copied feedback |
| Favorites | skeleton | `Jelajahi menu` CTA | retry | favorite toggle feedback |
| Profile | auth skeleton | login gate | auth error | login success redirect |
| Service sheet | button disabled while sending | n/a | request error | request sent confirmation |

## 7. Before/after target quantification

Angka berikut adalah target desain untuk mobile, bukan perubahan business logic.

| Area | Before | After target | Dampak |
|---|---|---|---|
| Homepage first CTA | bersaing dengan shortcut grid | terlihat dalam viewport pertama | conversion clarity |
| Homepage navigation | banyak shortcut setara | 5 primary nav + secondary features | cognitive load turun |
| Order header | berbeda antar step | satu header + progress | orientation lebih jelas |
| Service sheet | dapat tertutup nav/viewport | max-height + internal scroll | tombol selalu reachable |
| Product card | informasi padat setara | nama → harga → action | scanning lebih cepat |
| Checkout | banyak distraction | focused conversion layout | payment completion |
| Empty states | route-specific | reusable pattern | consistency |

## 8. Database schema dan data flow

### Database impact

**Tidak ada perubahan schema yang direncanakan pada UX redesign ini.**

Data source existing yang harus dipertahankan:

```text
pos.products / catalog source
pos.categories
pos.discounts
pos.orders
pos.order_items
pos.customer/favorites/points source sesuai hybrid hooks
pos.service_requests
site_settings / booking settings
```

Tidak boleh:

- rename/drop kolom
- mengubah nomor menu duplikat dari frontend
- mengubah payment/order status transition
- menambah hardcoded promo atau harga

### Multi-source data flow

```text
Hybrid POS data hooks
  ├── products/categories → catalog/menu cards/search
  ├── discounts → promo price/summary
  └── site settings → theme/feature flags

useOrderContext
  ├── guest-data → customer/table defaults
  ├── cart state → cart/checkout/receipt
  └── order step → order shell/progress

Create order hooks
  ├── order payload unchanged
  ├── Mayar invoice flow unchanged
  └── receipt/order status unchanged

Service request hook
  └── Staff action → existing service request API unchanged
```

## 9. Integration points

### AI/LLM

Tidak ada integrasi AI baru untuk redesign ini. Jika nanti ditambahkan rekomendasi menu, UI harus menerima data optional dan tetap memiliki fallback tanpa AI.

### Telegram/bot

Tidak ada perubahan Telegram flow. Service request tetap menggunakan API existing dan tidak boleh mengirim duplicate request akibat re-render atau double tap.

### Purchasing/inventory agent

Tidak ada perubahan. Harga, stok, dan availability tetap berasal dari source existing; UI tidak boleh menanamkan harga/stok hardcoded.

### Payment

Mayar/QRIS tetap menggunakan hook dan API existing. Redesign hanya mengubah presentasi dan loading/success/error state, bukan invoice creation atau payment status.

## 10. Hardcode audit

Nilai berikut tidak boleh di-hardcode dalam desain baru:

- nama brand
- theme color jika sudah tersedia dari site settings
- harga produk
- diskon
- status game aktif
- nomor menu
- service request status
- payment availability
- loyalty point balance
- promo code

Yang boleh hardcoded:

- label UI statis seperti `Mulai pesan`, `Pesan lagi`, `Pilih menu`
- layout constants/design tokens
- fallback copy ketika record belum tersedia
- icon mapping presentational

## 11. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Bottom nav menutup CTA | browser bounding-box check + hide pada focus state |
| Guest route bounce/blank | test direct navigation dan button-driven navigation |
| React hook order regression | semua hook tetap sebelum conditional return |
| PWA menampilkan bundle lama | hashed chunk check + hard refresh/incognito test |
| Homepage terlalu panjang | optional section hanya render jika data ada |
| Grid rusak saat fitur inactive | layout responsive terhadap jumlah item |
| Payment regression | tidak mengubah payload/hook; stop sebelum submit invoice pada QA |
| Service request duplicate | disable button saat pending + dedupe existing |
| Design inconsistency lintas route | gunakan shared shell/state components |
| Scope melebar menjadi rewrite | setiap wave punya file scope dan acceptance criteria |

## 12. Acceptance criteria

### Homepage

- Dalam viewport mobile pertama, customer dapat menemukan `Mulai pesan` tanpa scroll.
- Guest dan member memiliki CTA yang sesuai.
- Tidak ada lone tile/layout janggal ketika Minigames inactive.
- Semua route existing tetap dapat dibuka.

### Navigation

- Home, Pesan, Riwayat, Poin, Profil memiliki active state benar.
- Promo/Favorit/Notifikasi/Minigames tetap accessible dari lokasi sekunder.
- Bottom nav tidak muncul di cart, checkout, scanner, atau service sheet.

### Order

- Guest flow: registration → party → menu → cart → checkout → receipt.
- Search katalog dan duplicate menu guard tetap bekerja.
- Product card, cart, checkout, receipt memiliki visual shell konsisten.
- CTA tidak terpotong pada viewport 375×812.

### Quality gate

```bash
TMPDIR=/opt/djiwatentramapp/.tmp bun run build

git diff --check -- apps/customer/src
```

Browser checks:

- 375×812 mobile
- 390×844 mobile
- 430×932 mobile
- desktop narrow
- browser console zero new errors
- screenshot before/after homepage, menu, cart, checkout, service sheet
- production asset hash matches deployed dist

## 13. Urutan implementasi yang direkomendasikan

1. Baseline audit dan screenshot matrix.
2. Shared customer shell/state components.
3. Homepage hierarchy dan optional sections.
4. Bottom navigation + route active state.
5. Order shell/progress indicator.
6. Catalog/product card polish.
7. Cart/checkout/receipt/service sheet polish.
8. Profile/loyalty/promo/favorites consistency.
9. Full browser regression.
10. Build, selective diff review, deploy customer-only.

## 14. Definition of done

- Tidak ada rewrite total.
- Semua route existing tetap berfungsi.
- Tidak ada perubahan schema/API/payment payload.
- Homepage punya hierarchy CTA yang jelas.
- Order flow memiliki shell konsisten dan tidak tertutup overlay.
- Semua modal/sheet mobile-safe.
- Loading/empty/error/success state tersedia pada data-driven sections.
- Build dan browser regression lulus.
- Deployment hanya dilakukan pada customer app setelah quality gate lulus.
