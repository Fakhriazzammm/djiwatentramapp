# Plan: Redesign Home Customer Djiwatentram — Ordering-First Mobile Home

## Status

Draft implementasi — analisis dan rencana saja. Belum ada perubahan kode, asset, database, deployment, atau data production untuk redesign ini.

## Goal

Mengubah home customer `apps/customer` dari kumpulan kartu vertikal menjadi home mobile-first yang lebih mirip aplikasi ordering modern:

```text
Greeting ringkas
→ Saldo + benefit Djiwa Pay
→ Pesanan terakhir / repeat order
→ Special offer Djiwa Pay 20%
→ Akses cepat
→ CTA utama Mulai Pesan
```

Home harus menjawab tiga pertanyaan dalam beberapa detik:

1. Saya sedang berada di mana?
2. Saldo/benefit saya apa?
3. Bagaimana cara mulai pesan atau pesan lagi?

## Scope

### In scope

- Redesign visual dan struktur home `/$username`.
- Guest dan member home dengan hierarchy yang konsisten.
- Compact greeting/header.
- Compact Djiwa Pay balance card.
- Djiwa Pay discount 20% special offer.
- Recent order carousel untuk member.
- Repeat-order flow yang hanya mengisi cart, tidak langsung membayar.
- Quick access yang lebih ringkas.
- Sticky bottom CTA yang tidak menutup bottom navigation.
- Responsive mobile layout berdasarkan screenshot referensi.
- Generated artwork banner jika setelah audit asset memang masih diperlukan.
- Visual QA mobile dan deployment customer saja.

### Out of scope

- Mengubah sistem payment/wallet.
- Mengubah nominal reward Rp1.000.
- Mengubah rule voucher Djiwa Pay 20%.
- Mengubah schema order/payment tanpa kebutuhan repeat-order yang sudah terbukti.
- Menambahkan pickup order jika flow pickup belum tersedia.
- Menambahkan multi-location selector jika sistem masih single branch.
- Menghapus route promo, riwayat, saldo, profil, favorit, atau notifikasi.

## Reference → Existing Feature Mapping

| Blok pada referensi | Adaptasi Djiwatentram | Sumber existing |
|---|---|---|
| Greeting | `Halo, {nama}` / `Selamat pagi, {nama}` | `apps/customer/src/routes/$username/route.lazy.tsx` |
| Balance / stamps | Saldo Djiwa Pay + benefit diskon 20% / reward Rp1.000 | `customer.walletBalance`, wallet hooks |
| Pickup location | Tidak ditampilkan pada single-branch; hanya dipakai jika multi-branch valid | `siteSettings`, booking/brand settings |
| Recent order | Horizontal order/product carousel + Pesan lagi | `useCustomerOrders`, `useHybridProducts`, `riwayat.lazy.tsx` |
| Special offer | Djiwa Pay: hemat 20%, top up saldo dahulu | Djiwa Pay settings + current banner asset |
| Scan Barcode | Hanya jika scanner/QR meja resmi tersedia | `order.lazy.tsx` scanner flow |
| Pickup Order | Tidak disalin; ganti `Mulai Pesan` atau `Pesanan Saya` | Existing order route/history |
| Bottom actions | `Riwayat` + `Mulai Pesan`, atau hanya `Mulai Pesan` sebagai primary CTA | `CustomerBottomNav`, order route |
| Bottom navigation | Home, Pesan, Riwayat, Saldo, Profil | Existing `customerNav` |

## Current Context

Yang sudah ditemukan:

- Home member dan guest dirender di `apps/customer/src/routes/$username/route.lazy.tsx`.
- Home saat ini memiliki greeting card, wallet card, top-up CTA, marketing banner, `Mulai pesan`, dan `CustomerMenuGrid`.
- Home sudah memiliki CTA `Top up Djiwa Pay` pada wallet card.
- Banner Djiwa Pay sebelumnya juga memiliki CTA top-up, sehingga redesign wajib menghindari CTA duplikat.
- `useCustomerOrders()` sudah tersedia di `apps/customer/src/hooks/use-customer-data.ts`.
- `riwayat.lazy.tsx` sudah memiliki flow `Pesan lagi` dan `useOrderContext().setCart`.
- Cart persistence/repeat-order sudah menggunakan `useOrderContext` dan localStorage prefill.
- `CustomerBottomNav` sudah tersedia dan sebaiknya dipertahankan.
- Customer menggunakan Better Auth; guest data berasal dari localStorage `guest-data`.
- Djiwa Pay saldo dan top-up memiliki halaman `/$username/saldo`.
- Promo page sudah tersedia di `/$username/promo`.

## Architecture Decision

### Approach yang dipilih: incremental home composition

Tidak rewrite seluruh customer app. Home dipecah menjadi komponen kecil yang dapat diuji:

```text
MemberHomePage
├── CustomerHomeHeader
├── CustomerWalletHero
├── RecentOrdersCarousel
├── DjiwaPayOfferCard
├── CustomerQuickAccess
├── CustomerHomeBottomActions
└── CustomerBottomNav
```

Jika project sudah memiliki komponen yang setara, gunakan komponen existing dan ekstrak hanya bila file home menjadi terlalu padat.

### Alasan

- Meminimalkan risiko terhadap auth guard dan child-route `Outlet`.
- Guest/member flow tetap berada dalam route yang sama.
- Repeat-order logic dapat memakai flow riwayat yang sudah ada.
- Djiwa Pay tidak disentuh di backend/payment layer.
- Perubahan visual dapat diverifikasi per section.

## Product Design Standard Compliance

Implementasi wajib mengikuti `frontend-design/ai-product-design-dna` dan prinsip mobile app Apple/iOS-style. Ini bukan sekadar mengganti warna atau radius; hierarchy, interaction, motion, typography, component state, dan visual QA harus mengikuti standar yang sama.

### Design principles

| Prinsip | Aturan implementasi |
|---|---|
| Mobile-first | Target utama 390×844 dan 430×932; desktop hanya memperluas shell tanpa mengubah hierarchy mobile |
| Apple-style clarity | Satu primary action per viewport, section jelas, copy singkat, tidak ada card dekoratif tanpa fungsi |
| Premium calm | Background terang, satu accent brand, emerald khusus Djiwa Pay, shadow lembut, tanpa gradient berlebihan |
| Touch-first | Semua tombol/link interaktif minimal 44×44px; tap feedback `scale(.97)` sekitar 180ms |
| Content hierarchy | Greeting → wallet/benefit → recent order → offer → quick access → CTA |
| Progressive disclosure | Detail promo, ledger, dan riwayat lengkap tetap berada di route khusus; home hanya menampilkan ringkasan actionable |
| Safe motion | iOS easing `cubic-bezier(.32,.72,0,1)`, 180ms micro interaction, 320ms section transition, reduced-motion fallback |
| Accessibility | Semantic sections, aria-label, focus-visible, contrast WCAG AA, keyboard support untuk carousel dan CTA |

### Apple/iOS visual tokens

Gunakan token existing bila sudah tersedia; jangan membuat token per komponen tanpa audit:

```text
Card radius       : 24px
Control radius    : 14px
Card padding      : 16–20px
Section gap       : 16px
Micro gap         : 8px
Soft shadow       : rgba(9,9,11,0.04–0.12)
Primary accent    : existing brand primary
Djiwa Pay accent  : emerald/teal yang konsisten di wallet, offer, badge, dan CTA top-up
Body font         : existing body font
Display font      : existing display font; jangan mencampur font baru tanpa kebutuhan
Tap transition    : 180ms cubic-bezier(.32,.72,0,1)
Sheet transition  : 320–420ms cubic-bezier(.32,.72,0,1)
```

### UI/UX component contract

Setiap komponen baru wajib memiliki satu tujuan:

| Komponen | Fungsi | CTA | State wajib |
|---|---|---|---|
| `CustomerHomeHeader` | Identitas dan greeting | Profil/keluar jika relevan | loading, authenticated, guest |
| `CustomerWalletHero` | Saldo dan benefit Djiwa Pay | Satu `Top up saldo` | loading, error, empty/zero, ready, blocked |
| `RecentOrdersCarousel` | Repeat order | `Pesan lagi` | loading, empty, error, item unavailable |
| `DjiwaPayOfferCard` | Edukasi diskon 20% | Detail/top-up sesuai context | guest, member, already-funded, disabled |
| `CustomerQuickAccess` | Navigasi sekunder | Route link per item | normal, disabled/in-development |
| `CustomerHomeBottomActions` | Primary conversion | `Mulai Pesan` | normal, pressed, reduced-motion |
| `CustomerBottomNav` | Global navigation | Home/Pesan/Riwayat/Saldo/Profil | active, inactive, child route |

Jangan membuat satu komponen besar yang menggabungkan wallet, promo, recent order, dan navigation state. Setiap section harus dapat diisolasi saat visual QA.

### CTA hierarchy

Hanya ada satu primary CTA di home:

```text
Mulai Pesan
```

CTA sekunder:

```text
Top up saldo
Pesan lagi
Lihat promo
```

Rules:

- `Top up saldo` tidak boleh muncul dua kali dalam viewport utama.
- `Pesan lagi` hanya ada di recent order card dan tidak boleh langsung membuat payment.
- `Lihat promo` tidak boleh bersaing secara visual dengan `Mulai Pesan`.
- Primary CTA menggunakan brand primary; Djiwa Pay secondary action menggunakan emerald.
- Setiap CTA menjelaskan hasil setelah tap, bukan label teknis.
- Semua CTA memiliki pressed state, disabled state, dan loading state bila asynchronous.
- Jangan menggunakan emoji sebagai icon CTA; gunakan Lucide/shared SVG.

### Section contract

Setiap section home harus:

1. Memiliki heading/copy yang singkat dan mudah dipindai.
2. Memiliki satu tujuan interaksi.
3. Memiliki jarak vertikal konsisten 16px.
4. Tidak menampilkan informasi yang sama dengan section sebelumnya.
5. Tidak memaksa user membaca paragraph panjang.
6. Tidak menyebabkan horizontal overflow kecuali carousel yang memang memiliki affordance.
7. Memiliki bottom spacing yang cukup terhadap sticky CTA dan bottom navigation.

### Banner contract

Banner Djiwa Pay harus mengikuti standar promotional card, bukan hero marketing fullscreen:

```text
Height mobile       : sekitar 130–160px
Copy width          : 55–70% card
Artwork area        : sisi kanan, tidak menutupi copy
CTA                 : maksimal satu
Radius              : 24px
Text contrast       : WCAG AA
```

Artwork acceptance:

- Tidak ada teks internal/baked-in.
- Tidak ada watermark.
- Tidak ada logo generator yang tidak presisi.
- Tidak ada objek terpotong di canvas.
- Safe margin minimum di semua sisi.
- `object-fit: cover` tidak boleh memotong subject penting.
- Bila artwork tidak memenuhi standar, gunakan icon wallet/badge dengan CSS surface yang bersih.

### Apple-style interaction rules

- Card yang clickable memiliki `role="button"`, keyboard Enter/Space, dan focus-visible.
- Carousel dapat digeser dengan touch dan tidak menjebak horizontal scroll halaman.
- Press state memakai `active:scale-[.97]`, bukan animasi bouncing berlebihan.
- Tidak memakai decorative animation yang tidak memberi feedback.
- `prefers-reduced-motion` menonaktifkan transform/transition non-essential.
- Sticky CTA tidak boleh menutup section atau bottom nav.
- Sheet/dialog memakai iOS bottom-sheet pattern jika detail perlu dibuka.
- Tap target dan close control minimal 44px.

### Copy and content standards

Copy harus ringkas, natural, dan Bahasa Indonesia:

```text
Saldo tersedia
Total saldo masuk
Bayar dengan Djiwa Pay, hemat 20%
Top up saldo terlebih dahulu
+Rp1.000 setelah transaksi berhasil
Pesanan terakhir
Mulai Pesan
```

Hindari istilah teknis di home customer seperti `system-owned`, `payment channel restriction`, atau `settlement reward pending`.

### Visual review gate

Tidak boleh menyatakan UI selesai hanya dari source/build. Wajib:

- Screenshot sebelum dan sesudah pada viewport mobile.
- Review visual actual pixels, bukan hanya DOM.
- Cek crop/artwork dan contrast.
- Cek horizontal overflow dan text wrapping.
- Cek posisi sticky CTA terhadap bottom nav.
- Cek touch target dengan `getBoundingClientRect()`.
- Cek guest/member/loading/empty/error state.

## Alternatives Analysis

### Option A — Compact single-column home

| Pros | Cons |
|---|---|
| ✅ Paling dekat dengan referensi | ❌ Recent order perlu horizontal scroll |
| ✅ Mudah dipahami mobile | ❌ Banyak section tetap vertikal |
| ✅ Risiko implementasi rendah | ❌ Desktop view tidak terlalu kaya |

### Option B — Dashboard grid dua kolom

| Pros | Cons |
|---|---|
| ✅ Lebih padat | ❌ Kurang cocok untuk mobile 390px |
| ✅ Quick access lebih cepat | ❌ Saldo, promo, dan order bisa kehilangan hierarchy |
| ✅ Terlihat seperti dashboard | ❌ Lebih jauh dari referensi |

### Recommendation

Pilih **Option A**. Aplikasi customer utamanya ordering, bukan dashboard analitik. Prioritaskan satu kolom dengan horizontal carousel untuk recent order dan satu CTA utama.

## Proposed UI/UX

### Member home

```text
┌──────────────────────────────┐
│ Halo, Azzam             👤   │
│ Member Djiwa Tentram         │
├──────────────────────────────┤
│ Saldo Djiwa Pay              │
│ Rp80.000                     │
│ Bayar dengan Djiwa Pay       │
│ hemat 20%                    │
│ [Top up saldo]               │
├──────────────────────────────┤
│ Pesanan terakhir       Lihat │
│ [Produk] [Produk] [Produk]   │
├──────────────────────────────┤
│ Bayar pakai Djiwa Pay        │
│ Hemat 20% + reward Rp1.000   │
│ Top up saldo terlebih dahulu │
├──────────────────────────────┤
│ Akses cepat                  │
│ Promo | Riwayat | Favorit    │
│ Saldo | Notifikasi | Profil  │
├──────────────────────────────┤
│       [Mulai Pesan]          │
└──────────────────────────────┘
```

### Guest home

Guest tidak memiliki saldo atau recent order member. Jangan menampilkan angka saldo palsu.

```text
┌──────────────────────────────┐
│ Halo, Tamu                   │
│ Djiwa Tentram                │
├──────────────────────────────┤
│ Bayar pakai Djiwa Pay        │
│ Hemat 20% setiap transaksi   │
│ Daftar untuk mulai memakai   │
│ saldo dan benefit member     │
│ [Masuk / Daftar]             │
├──────────────────────────────┤
│ Menu populer / recent menu   │
│ [Produk] [Produk] [Produk]   │
├──────────────────────────────┤
│ Akses cepat                  │
│ Promo | Favorit | Notifikasi │
├──────────────────────────────┤
│       [Mulai Pesan]          │
└──────────────────────────────┘
```

### Djiwa Pay card rules

Member:

```text
Saldo tersedia       Rp...
Total saldo masuk    Rp...
Hemat 20% saat bayar
[Top up saldo]
```

Guest:

```text
Bayar pakai Djiwa Pay
Hemat 20% setiap transaksi
[Masuk / Daftar]
```

Rules:

- Hanya satu CTA top-up di home.
- Banner promo tidak mengulang CTA yang sama jika wallet card sudah menampilkannya.
- Tidak menyebut Yumi Poin.
- Tidak menjanjikan reward sebelum transaksi berhasil.
- Copy reward: `+Rp1.000 setelah transaksi berhasil`.
- Label `Total masuk` diganti menjadi `Total saldo masuk` atau `Total credit`.
- Saldo loading/error/empty dibedakan, tidak menganggap error sebagai Rp0.

## Recent Order / Repeat Order

### Data flow

```text
useCustomerOrders()
  → filter paid/completed
  → sort newest first
  → take 5–10 records
  → normalize order items
  → join active products by product id
  → remove unavailable products
  → render horizontal carousel
```

### Card content

Minimal:

```text
Nama produk/order
Jumlah item
Tanggal singkat
[Pesan lagi]
```

Jika memakai product carousel:

```text
Nama produk
Harga terbaru
[+]
```

### Repeat-order safety

- Tidak langsung membuat order.
- Tidak langsung memulai pembayaran.
- Memasukkan item ke cart.
- Menggunakan harga produk terbaru.
- Produk nonaktif dilewati.
- Variasi yang sudah tidak tersedia dilewati atau meminta pilihan ulang.
- Tampilkan feedback jika sebagian item tidak tersedia.
- Quantity tetap dapat diubah di cart sebelum checkout.
- Guest tidak melihat order member dari customer lain.

### Empty state

Jika belum ada riwayat:

```text
Belum ada pesanan
Pesan menu favoritmu dan pesanan berikutnya akan muncul di sini.
[Mulai Pesan]
```

## Special Offer Djiwa Pay

### Preferred design

Banner compact, bukan hero tinggi:

```text
┌─────────────────────────────┐
│ Bayar dengan Djiwa Pay      │
│ Hemat 20% setiap transaksi  │
│ +Rp1.000 setelah berhasil   │
│                        →    │
└─────────────────────────────┘
```

### Artwork rules

Jika artwork dipakai:

- Landscape ratio cocok untuk card.
- Tidak ada teks baked-in.
- Tidak ada watermark.
- Tidak ada logo hasil generator yang tidak presisi.
- Tidak ada objek terpotong di tepi canvas.
- Sisakan safe area untuk overlay text.
- Gunakan emerald/teal yang sama dengan Djiwa Pay card.
- Artwork hanya aksen kanan; copy tetap dominan di kiri.

Jika artwork tidak memenuhi aturan, gunakan icon `Wallet`/`BadgePercent` dengan gradient CSS sederhana. Jangan mempertahankan asset cacat hanya karena sudah digenerate.

## Quick Access

Pertahankan route existing, tetapi kurangi rasa dashboard:

```text
Promo
Riwayat
Favorit
Saldo
Notifikasi
Profil
```

Rules:

- Tidak menambahkan route baru hanya untuk mengikuti referensi.
- Tidak menambahkan `Pickup Order` tanpa flow pickup.
- Tidak menambahkan location selector pada single branch.
- Akses cepat berada setelah recent order dan offer.
- Semua target interaktif minimal 44px.

## Bottom CTA and navigation

### Primary CTA

Gunakan satu CTA sticky:

```text
Mulai Pesan
```

Behavior:

- Navigate ke `/$username/order?step=party`.
- Tidak menutupi content atau `CustomerBottomNav`.
- Gunakan `pb-safe-with-nav`/padding existing yang sudah dipakai project.
- Saat child route aktif, jangan render CTA home di atas child route.
- Saat sheet/cart terbuka, cek pointer interception dan z-index.

### Bottom navigation

Pertahankan:

```text
Home | Pesan | Riwayat | Saldo | Profil
```

Jangan menambah Promo ke bottom nav karena sudah tersedia di Quick Access.

## Data and API Contracts

### Existing read sources

| Kebutuhan | Source |
|---|---|
| Customer identity | `useCustomerAuth()` |
| Wallet balance | customer wallet mapping / `useCustomerWallet` |
| Recent orders | `useCustomerOrders()` |
| Current products | `useHybridProducts()` |
| Promo settings | `useHybridSiteSettings()` / active discount hook |
| Cart mutation | `useOrderContext().setCart()` |
| Navigation | TanStack Router `useNavigate()` |

### No new DB schema by default

Repeat order dapat menggunakan data existing. Migration hanya diperlukan bila audit membuktikan item order tidak dapat dinormalisasi dengan aman atau read model tidak mengembalikan field yang dibutuhkan.

### Order item normalization

Mapper wajib mengakomodasi field existing yang mungkin camelCase/snake_case:

```text
productId / product_source_id
productName / product_name / name
quantity
variant
price
```

Jangan mengandalkan satu casing tanpa membaca response runtime.

## No-Hardcode Audit

Nilai yang tidak boleh di-hardcode di banyak tempat:

- Nama brand.
- Nama customer.
- Saldo wallet.
- Total credit/debit.
- Harga produk.
- Nama dan gambar produk.
- Status order.
- Promo aktif.
- Tanggal promo.
- Nominal reward.
- Persentase diskon.
- Location/branch.

Nilai yang boleh menjadi copy fallback UI:

```text
"Djiwa Pay"
"Mulai Pesan"
"Bayar dengan Djiwa Pay, hemat 20%"
```

Namun angka `20%` dan `Rp1.000` sebaiknya dibaca dari setting/config yang sama bila sudah tersedia, bukan dibuat berbeda dari checkout.

## Likely Files to Change

### Primary

- `apps/customer/src/routes/$username/route.lazy.tsx`
  - Ubah composition home.
  - Pertahankan auth guard dan child-route `Outlet`.
  - Tambahkan member/guest-specific sections.

### Likely extracted components

- `apps/customer/src/components/customer/customer-home-header.tsx`
- `apps/customer/src/components/customer/customer-wallet-hero.tsx`
- `apps/customer/src/components/customer/recent-orders-carousel.tsx`
- `apps/customer/src/components/customer/djiwa-pay-offer-card.tsx`
- `apps/customer/src/components/customer/customer-home-bottom-actions.tsx`

Buat file baru hanya jika ekstraksi benar-benar mengurangi kompleksitas home. Jangan mengekstrak komponen hanya untuk memindahkan JSX tanpa manfaat.

### Existing components/hooks to reuse

- `apps/customer/src/components/customer/CustomerMenuGrid.tsx`
- `apps/customer/src/components/customer/customer-shell.tsx`
- `apps/customer/src/components/customer/customer-states.tsx`
- `apps/customer/src/hooks/use-customer-data.ts`
- `apps/customer/src/hooks/use-order-context.tsx`
- `apps/customer/src/routes/$username/riwayat.lazy.tsx`
- `apps/customer/src/components/customer/types.ts`

### Asset

- Existing banner asset: `apps/customer/public/djiwa-pay-20-banner.png`.
- Inspect before reuse. Regenerate only if source has watermark/text/crop defects.
- Do not modify shared app assets unless the asset is proven shared.

## Implementation Waves

### Wave 0 — baseline and data audit

1. Capture current home screenshot at mobile 390×844 and 430×932.
2. Verify guest and member route behavior.
3. Trace `useCustomerOrders()` response shape and existing repeat-order mapper.
4. Verify current wallet fields and Djiwa Pay settings.
5. Inspect banner asset dimensions/corners/visible artifacts.
6. Record baseline files and unrelated dirty changes.

### Wave 1 — home composition

1. Compact header/greeting.
2. Combine greeting and wallet hierarchy where safe.
3. Keep one top-up CTA.
4. Move primary `Mulai Pesan` into a clear CTA position.
5. Reduce card nesting, radius/shadow noise, and vertical spacing.

### Wave 2 — recent order

1. Add member-only recent order carousel.
2. Reuse current products for fresh price/image.
3. Implement safe repeat-order cart prefill.
4. Add empty/loading/error states.
5. Verify no direct payment/order submission.

### Wave 3 — Djiwa Pay offer

1. Make offer compact.
2. Use one Djiwa Pay visual language.
3. Remove duplicate top-up CTA.
4. Show `20%` and `+Rp1.000 after successful transaction` using shared settings/fallback.
5. Verify guest/member CTA behavior.

### Wave 4 — bottom actions and polish

1. Add sticky `Mulai Pesan` only on home.
2. Preserve bottom nav.
3. Verify safe area, scroll, z-index, and pointer path.
4. Check desktop/tablet without breaking mobile shell.
5. Respect reduced-motion.

### Wave 5 — verification and release

1. Unit-test mapper and repeat-order filtering.
2. Build customer without unrelated release mutation where possible.
3. Run mobile browser QA.
4. Capture screenshots for guest/member/home/empty recent order.
5. Deploy customer only.
6. Verify canonical `index.html → entry bundle → home lazy chunk → banner asset`.
7. Verify PWA service worker/update behavior.

## UI States

### Loading

- Header skeleton.
- Wallet skeleton.
- Recent order skeleton.
- No layout jump larger than necessary.

### Empty recent orders

```text
Belum ada pesanan
Mulai pesan untuk melihat pesanan terakhir di sini.
[Mulai Pesan]
```

### Wallet error

```text
Saldo Djiwa Pay belum dapat dimuat.
Coba lagi
```

Do not show `Rp0` for an error.

### Guest

- No wallet balance.
- No member-only recent orders.
- CTA `Masuk / Daftar` for Djiwa Pay benefit.
- Guest can still start ordering according to existing guest flow.

### Member incomplete profile

- Existing profile completion modal/guard remains.
- Home redesign must not bypass required email/WhatsApp completion.

## Testing Plan

### Unit tests

- Normalize order item from camelCase/snake_case.
- Filter only `paid`/`completed` for recent orders.
- Exclude cancelled/pending orders.
- Exclude unavailable products.
- Preserve latest product price.
- Repeat order does not call payment/submit.
- Empty recent order state.
- Djiwa Pay settings fallback.

### Browser/E2E

- Guest opens `/$username` and sees guest banner.
- Guest CTA `Masuk / Daftar` opens auth modal.
- Member sees wallet balance and exactly one top-up CTA.
- Member CTA `Top up Djiwa Pay` navigates to `/$username/saldo`.
- Member sees recent order carousel when history exists.
- Tap `Pesan lagi` fills cart and navigates to order menu; no payment is created.
- Member taps `Mulai Pesan` and reaches `/$username/order?step=party`.
- Bottom nav remains usable.
- Sticky CTA does not cover content or bottom nav.
- No console/page errors.
- Home child routes still render `Outlet` correctly.

### Visual QA screenshots

Capture at minimum:

```text
390×844  member home
390×844  guest home
430×932  member home
390×844  member with recent order
390×844  member without recent order
```

Compare:

- CTA hierarchy.
- Banner height.
- Card nesting.
- Horizontal overflow.
- Bottom safe area.
- Text wrapping.
- Asset crop/artifacts.
- Touch target size.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Recent order query breaks home | Isolate query section; error state must not blank whole home |
| Old customer orders have inconsistent fields | Boundary mapper with camelCase/snake_case fallback |
| Repeat order adds stale/deleted products | Join current catalog and skip unavailable items |
| Duplicate top-up CTA returns | Single CTA ownership: wallet hero only |
| Banner hides order CTA | Compact offer + sticky primary CTA |
| Bottom nav intercepts CTA | Measure overlays and safe-area padding with real pointer test |
| Guest home redirects unexpectedly | Preserve `resolved`/`guestData` guard logic |
| Existing PWA serves old layout | Verify `version.json`, `sw.js`, hashed lazy chunk |
| Generated artwork contains text/crop | Inspect and regenerate; do not solve source defect with CSS |
| Scope accidentally includes unrelated dirty files | Baseline git status; selective staging only |

## Acceptance Criteria

- Home has one clear primary CTA: `Mulai Pesan`.
- Home has at most one top-up CTA visible in the main viewport.
- Djiwa Pay offer is visible but does not dominate the order action.
- Member sees current saldo Djiwa Pay without fabricated fallback data.
- Guest sees no member balance or private order history.
- Recent order section supports safe repeat order without payment side effects.
- Empty/loading/error states are explicit.
- No `Yumi Poin` appears in the new home UI.
- No `Pickup Order` or location selector appears unless the real flow exists.
- Bottom navigation remains functional.
- Home is visually verified at mobile widths.
- Customer build succeeds and canonical domain serves the new bundle and asset.

## Open Decisions Before Implementation

1. Apakah `Recent Order` menampilkan kartu per order atau kartu per produk dari order terakhir?
2. Apakah CTA special offer hanya `Lihat detail`, atau cukup tanpa CTA karena wallet card sudah memiliki `Top up`?
3. Apakah sticky bottom CTA `Mulai Pesan` diperlukan jika bottom nav sudah memiliki tab `Pesan`? Rekomendasi: gunakan CTA hanya di home jika hasil screenshot tetap tidak terlalu penuh.
4. Apakah ikon/logo header memakai logo brand existing atau tetap memakai ikon restoran?
5. Apakah scan QR meja/menu sudah merupakan flow resmi yang boleh ditampilkan sebagai quick action?
6. Apakah customer ingin recent order tampil untuk guest sebagai `Menu populer`, atau hanya member?

## Recommended First Slice

Implementasi pertama yang paling aman:

```text
1. Compact header + wallet hero
2. Hapus duplicate top-up CTA
3. Compact Djiwa Pay offer
4. Tambahkan recent order read-only carousel
5. Tambahkan repeat-order ke cart melalui flow existing
6. Verifikasi mobile screenshot sebelum menambah sticky CTA
```
