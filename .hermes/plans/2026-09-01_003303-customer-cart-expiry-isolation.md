# Plan: Customer Cart Expiry dan Isolation

## Status

Plan only. Belum ada perubahan source code, database, localStorage user, deployment, commit, atau push.

## Goal

Mencegah keranjang pada `djiwatentram.web.id` menampilkan item dari hari/sesi/customer sebelumnya, sambil tetap mempertahankan pengalaman cart saat refresh dan perpindahan halaman dalam satu sesi pemesanan.

## Current Context

Audit read-only menemukan:

- `apps/customer/src/hooks/use-order-context.tsx` memuat cart dari `localStorage` saat `OrderProvider` dibuat.
- Key yang digunakan adalah global: `customer-ordering-cart-v2`.
- Cart dipersist setiap kali berubah dan tidak memiliki expiry tanggal, user, guest identity, atau session scope.
- `OrderProvider` dipasang di `apps/customer/src/routes/__root.tsx`, sehingga state hidup lintas route.
- Cart hanya dibersihkan setelah checkout sukses atau `startNewOrder`; meninggalkan browser/halaman tidak membersihkannya.
- `getSessionId()` memang menyimpan session ID di localStorage, tetapi session ID belum menjadi bagian dari key cart.
- `guest-data` juga disimpan di localStorage untuk prefill identitas, tetapi bukan penyebab langsung isi cart.
- Fitur `Pesan Lagi` sengaja mengisi cart melalui `setCart(items)` dan harus tetap dibedakan dari stale-cart hydration.
- Tidak ditemukan tabel/RPC/server-side cart pada source Customer yang diaudit.
- Service Worker melakukan cache halaman, asset, dan gambar; isi cart tetap berasal dari localStorage, bukan Cache Storage.
- Logout member saat ini belum terlihat membersihkan cart.

## Root Cause

Penyebab utama adalah localStorage persistence yang terlalu luas:

```text
key global + tidak ada expiry + tidak ada identity/session scope
```

Akibatnya cart dapat bertahan melewati hari berikutnya, refresh, penutupan browser, dan perubahan customer pada device/browser yang sama.

## Alternatives Analysis

### Option A — Hanya menghapus cart saat startup jika tanggal berubah

| Pros | Cons |
|---|---|
| Perubahan kecil | Cart masih dapat tertukar antar customer pada device yang sama |
| Tidak perlu perubahan besar pada flow | Tidak menyelesaikan logout/member switch secara penuh |
| Tetap mempertahankan cart selama hari yang sama | Tidak membedakan guest session |

### Option B — Menghapus persistence cart sepenuhnya

| Pros | Cons |
|---|---|
| Stale cart hampir pasti hilang | Refresh browser menghilangkan cart aktif |
| Implementasi sederhana | UX buruk saat koneksi lambat atau customer berpindah halaman |
| Tidak ada risiko cart lama bertahan | Tidak sesuai kebutuhan cart yang survive saat refresh |

### Option C — Cart scoped + expiry harian + lifecycle cleanup (rekomendasi)

| Pros | Cons |
|---|---|
| Mencegah stale cart lintas hari dan lintas customer | Perubahan code lebih luas daripada Option A |
| Cart tetap survive refresh dan route navigation | Perlu definisi identity guest/member yang konsisten |
| Aman untuk device bersama | Perlu regression test untuk guest/member switching |
| Dapat membersihkan data lama secara bertahap | Harus hati-hati terhadap hydration race |

### Recommendation

Gunakan **Option C**:

1. Scope key berdasarkan konteks identity yang tersedia.
2. Simpan metadata `savedAt` dan `dateKey` timezone `Asia/Jakarta`.
3. Buang cart jika tanggal WIB sudah berbeda atau payload invalid.
4. Bersihkan cart ketika logout dan setelah checkout berhasil.
5. Jangan menghapus `guest-data` atau guest order history secara otomatis karena keduanya memiliki lifecycle berbeda.
6. Pertahankan `Pesan Lagi` sebagai explicit user action, bukan hydration otomatis.

## Proposed Data Contract

Client-only cart envelope:

```ts
{
  version: 3,
  ownerKey: string,
  dateKey: "YYYY-MM-DD", // Asia/Jakarta
  savedAt: number,
  items: CartItem[]
}
```

`ownerKey` harus dibentuk dari identity yang aman dan stabil:

```text
member:{customer.sourceId}
guest:{customer-ordering-session}
```

Catatan:

- Jangan gunakan nama customer, nomor meja, atau username display sebagai satu-satunya ownership key.
- Jangan mengubah schema database untuk client-only cart kecuali audit lanjutan menemukan cart server-side.
- Migrasi dari key `customer-ordering-cart-v2` harus fail-safe; cart lama yang tidak dapat dibuktikan owner/date-nya tidak boleh otomatis diberikan ke customer lain.

## Implementation Plan

### Phase 1 — Identity dan storage helper

File utama:

- `apps/customer/src/hooks/use-order-context.tsx`
- `apps/customer/src/components/customer/types.ts` atau helper baru di `apps/customer/src/lib/`

Langkah:

1. Tetapkan version storage baru, misalnya `customer-ordering-cart-v3`.
2. Buat helper untuk menghasilkan `dateKey` berdasarkan timezone `Asia/Jakarta`, bukan timezone perangkat.
3. Buat helper untuk menghasilkan `ownerKey` member/guest.
4. Ubah loader agar membaca envelope, memvalidasi version, owner, date, dan item.
5. Jika data lama v2 tidak memiliki owner/date yang dapat diverifikasi, jangan hydrate ke customer aktif; hapus hanya key cart lama setelah keputusan migrasi disetujui.
6. Hindari menulis envelope baru sebelum identity/session siap bila hal itu dapat membuat cart guest masuk ke member.

### Phase 2 — Lifecycle cleanup

File utama:

- `apps/customer/src/hooks/use-order-context.tsx`
- `apps/customer/src/routes/$username/route.lazy.tsx`
- `apps/customer/src/routes/$username/profile.lazy.tsx`
- `apps/customer/src/routes/$username/order.lazy.tsx`

Langkah:

1. Clear cart saat date key berubah.
2. Clear cart saat customer identity berubah.
3. Clear cart saat logout selesai atau sebelum navigasi keluar.
4. Pertahankan clear setelah checkout sukses.
5. Pastikan `startNewOrder` tetap clear cart dan tidak mengembalikan item lama.
6. Pastikan `Pesan Lagi` menulis cart baru hanya setelah customer menekan aksi tersebut.
7. Tambahkan guard terhadap hydration race agar loader lama tidak menimpa cart yang baru dipilih.

### Phase 3 — Compatibility dan UX

File yang kemungkinan berubah:

- `apps/customer/src/components/customer/` bila perlu menampilkan notice
- `apps/customer/src/hooks/use-order-context.tsx`

Perilaku yang direncanakan:

- Jika cart expired: tampilkan cart kosong secara normal; optional toast ringan seperti `Keranjang sebelumnya sudah kedaluwarsa`.
- Jika identity berubah: jangan tampilkan cart customer sebelumnya.
- Jika storage rusak/invalid: abaikan dengan aman dan mulai cart kosong.
- Jika localStorage tidak tersedia: cart tetap berfungsi in-memory selama halaman aktif.
- Jangan menghapus order history atau receipt state karena itu bukan cart.

### Phase 4 — Regression tests

Target test baru/yang diperluas:

- `apps/customer/src/hooks/use-order-context.test.tsx` atau helper test yang sesuai pola repository.
- `packages/yumipos-web-shared` hanya jika helper sengaja dipindahkan ke shared package.

Skenario wajib:

1. Cart hari ini dimuat kembali setelah refresh.
2. Cart kemarin tidak dimuat.
3. Cart member A tidak muncul untuk member B.
4. Cart guest session A tidak muncul untuk guest session B.
5. Logout membersihkan cart yang sedang aktif.
6. Checkout sukses membersihkan cart.
7. Checkout gagal tidak menghapus cart tanpa keputusan eksplisit.
8. Payload localStorage invalid tidak menyebabkan runtime crash.
9. `Pesan Lagi` tetap mengisi cart hanya setelah aksi eksplisit.
10. Perubahan promo/harga tidak menghapus item valid secara tidak sengaja.
11. Timezone perangkat non-WIB tetap mengikuti `Asia/Jakarta`.
12. StrictMode/mount ulang tidak menggandakan item atau menimpa cart baru.

### Phase 5 — Build dan production verification

Perintah/verifikasi setelah implementasi:

```text
npm run build                         # apps/customer
npm run check-types                   # catat baseline error dan error baru
bun test <target-cart-tests>          # jika test runner tersedia
git diff --check
```

Verifikasi runtime:

- `https://djiwatentram.web.id/version.json`
- `https://djiwatentram.web.id/sw.js`
- Customer route order dari domain canonical.
- Browser test pada guest session baru.
- Browser test member A → logout → member B.
- Browser test melewati perubahan date key secara mocked test, bukan menunggu tengah malam.
- Pastikan tidak ada data cart user yang ditulis ke database.

## Files Likely to Change

### Utama

- `apps/customer/src/hooks/use-order-context.tsx`
- `apps/customer/src/components/customer/types.ts` atau helper baru `apps/customer/src/lib/cart-storage.ts`
- `apps/customer/src/routes/$username/order.lazy.tsx`
- `apps/customer/src/routes/$username/route.lazy.tsx`
- `apps/customer/src/routes/$username/profile.lazy.tsx`

### Test

- Test file baru di dekat `use-order-context` atau helper storage.
- Tidak mengubah shared package kecuali ada alasan reuse lintas app.

### Tidak direncanakan berubah

- Schema Supabase.
- `pos.orders` dan order history.
- Payment, finance, inventory, atau Telegram.
- Service Worker cache policy, kecuali verification menemukan masalah bundle terpisah.
- `guest-data` dan `customer-guest-order-history`, karena lifecycle-nya berbeda dari cart.

## Database Schema / Server Data Boundary

Tidak ada perubahan schema yang direncanakan.

Current boundary:

```text
Browser localStorage
  └── customer-ordering-cart-v2 (current cart persistence)

Browser localStorage
  ├── guest-data (guest checkout prefill)
  ├── customer-ordering-session (guest/order session reference)
  └── customer-guest-order-history-v1 (temporary order references)

Supabase
  └── pos.orders / public.pos_orders (submitted orders, bukan draft cart)
```

Order hanya ditulis ke Supabase saat checkout. Draft cart tidak boleh dianggap sebagai order dan tidak boleh dibersihkan dari database sebagai solusi stale-cart.

## UI/UX Specification

- Cart valid: tampilkan item seperti sekarang, tanpa perubahan visual besar.
- Cart expired: tampilkan empty state standar, optional informational toast sekali per load.
- Cart identity mismatch: tampilkan empty cart, jangan menampilkan nama/item customer sebelumnya.
- Storage error: fallback in-memory tanpa modal teknis.
- Checkout failed: pertahankan cart agar customer dapat retry, kecuali order sudah confirmed/paid.
- Checkout succeeded: cart kosong dan receipt tetap tersedia.
- `Pesan Lagi`: tetap eksplisit, menampilkan feedback sukses/gagal yang jelas.

## Integration Points

- Payment: tidak mengubah payload atau settlement; hanya memastikan clear cart terjadi setelah status/order write yang tepat.
- Finance/inventory: tidak tersentuh karena cart belum menjadi transaksi.
- Telegram/supervisor: tidak tersentuh.
- AI/LLM/purchasing agent: tidak relevan untuk client cart.
- PWA: hanya diuji sebagai faktor bundle/cache; tidak dijadikan tempat penyimpanan cart.

## Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Cart aktif hilang saat release | Versioned envelope + migration policy yang conservative |
| Cart guest masuk ke member | ownerKey wajib dan identity transition cleanup |
| Cart terhapus saat checkout network race | clear hanya setelah order creation/payment state terbukti sesuai flow |
| Date key salah karena timezone device | gunakan `Asia/Jakarta` secara eksplisit |
| StrictMode menyebabkan write race | gunakan loader/persistence effect yang idempotent |
| Customer mengira order history hilang | pisahkan cart cleanup dari guest order history |
| User memakai beberapa tab | pertimbangkan `storage` event dan conflict policy pada implementasi |
| Storage key lama tetap tertinggal | cleanup key lama hanya setelah payload lama tidak dipakai |

## Open Questions Before Implementation

1. Apakah cart memang harus expire tepat pergantian hari WIB, atau boleh bertahan 24 jam sejak item terakhir ditambahkan?
2. Untuk member yang login di device yang sama, apakah cart harus dipertahankan per member atau selalu dikosongkan saat login/logout?
3. Untuk guest, kapan sesi dianggap selesai: setelah checkout, logout/navigation, atau tetap sampai expiry?
4. Apakah fitur `Pesan Lagi` boleh mengisi cart dengan item dari hari sebelumnya secara eksplisit? Rekomendasi: boleh, karena itu aksi sadar customer.
5. Apakah ada kebutuhan multi-tab yang harus disinkronkan real-time?

## Acceptance Criteria

- Item cart dari hari sebelumnya tidak muncul otomatis.
- Customer A tidak melihat cart Customer B pada browser/device yang sama.
- Refresh dan perpindahan route dalam sesi aktif tetap mempertahankan cart.
- Checkout sukses tetap mengosongkan cart.
- Checkout gagal tidak diam-diam menghapus cart.
- `Pesan Lagi` tetap berfungsi sebagai aksi eksplisit.
- Tidak ada perubahan pada order history, payment, finance, inventory, Telegram, atau database order.
- Build/test Customer lulus atau baseline error terdokumentasi terpisah.
- Domain production canonical diverifikasi setelah deployment jika implementasi nanti disetujui.
