# Plan: Migrasi Loyalty Points ke Wallet / Saldo

**Status:** Implemented — wallet foundation, checkout, profile/saldo, top-up Mayar settlement, admin summary/ledger, and audited adjustment live
**Tanggal:** 2026-08-22
**Scope utama:** `apps/customer`, `apps/admin`, Supabase schema, Edge Functions, integrasi order/payment
**Keputusan penting:** Jangan menghapus histori poin atau mengganti `total_points` secara langsung menjadi nominal Rupiah.

---

## 1. Ringkasan Audit Saat Ini

Sistem customer saat ini menggunakan loyalty points:

- `pos.customers.total_points` — poin yang dapat digunakan
- `pos.customers.lifetime_points` — total poin yang pernah diperoleh
- `pos.customer_point_ledger` — riwayat earn/redeem poin
- Trigger `pos.award_order_points()` — memberikan 1.000 poin untuk order `paid`/`completed`
- RPC `pos.redeem_points(...)` — penukaran poin secara atomik
- `apps/customer/src/routes/$username/poin.lazy.tsx` — halaman saldo/riwayat poin/reward
- `apps/customer/src/hooks/use-customer-data.ts` — query ledger poin
- `apps/admin/src/routes/admin/customers.lazy.tsx` — daftar customer dan statistik poin
- `supabase/functions/customer-sync/index.ts` — action redeem poin

Audit live read-only:

| Data | Jumlah |
|---|---:|
| Customer aktif | 32 |
| Baris point ledger | 8 |
| Customer dengan poin aktif | 5 |

---

## 2. Rekomendasi Arsitektur

Gunakan dua domain yang berbeda:

```text
Loyalty Points
├── Untuk tier/member level
├── Histori engagement customer
└── Bukan nilai uang

Wallet / Saldo
├── Nilai Rupiah internal
├── Dipakai untuk membayar order
├── Memiliki ledger debit/kredit
├── Memiliki hold/capture/release
└── Memiliki audit dan idempotensi
```

Rekomendasi versi pertama:

- Wallet adalah **store credit internal**.
- Wallet **tidak dapat di-withdraw atau ditarik menjadi uang asli**.
- Wallet **tidak dapat dicairkan ke rekening bank/e-wallet eksternal**.
- Wallet **tidak dapat ditransfer antar customer**.
- Wallet hanya dapat digunakan untuk transaksi yang diizinkan di aplikasi DjiwaApp.
- Wallet dapat digunakan untuk membayar order di DjiwaApp.
- Saldo berasal dari refund, credit admin, dan kemudian top-up Mayar.
- Poin lama tetap dipertahankan untuk histori dan tier.
- Route lama `/poin` dipertahankan sebagai redirect kompatibilitas ke `/saldo`.

Batasan wallet ini harus diterapkan di tiga lapisan:

```text
Frontend  → tidak menampilkan tombol tarik/cairkan/transfer
Backend   → tidak menyediakan action withdraw/cash-out/transfer
Database  → ledger hanya mengizinkan transaksi bisnis yang disetujui
```

Jika customer meminta pengembalian dana, refund mengikuti kebijakan bisnis dan dikreditkan kembali sebagai saldo internal, bukan uang tunai, kecuali ada keputusan bisnis/legal terpisah di masa depan.

---

## 3. Keputusan Bisnis yang Harus Disetujui

Sebelum implementasi, owner perlu menyetujui:

### 3.1 Apakah wallet dapat dicairkan?

Rekomendasi: **tidak dapat dicairkan**, hanya digunakan sebagai saldo internal.

### 3.2 Sumber saldo awal

Pilihan:

1. Refund order yang dibatalkan.
2. Manual credit dari admin.
3. Bonus/promosi.
4. Top-up melalui Mayar.
5. Konversi poin lama.

Rekomendasi rollout: mulai dari refund/manual credit, kemudian top-up Mayar setelah ledger stabil.

### 3.3 Konversi poin lama

Pilihan:

- Poin tidak dikonversi; tetap menjadi loyalty history.
- Konversi satu kali, misalnya `1 poin = Rp1`.
- Poin tetap untuk tier dan wallet berjalan terpisah.

Rekomendasi: **poin tetap untuk tier, wallet terpisah**.

Konversi tidak boleh dilakukan tanpa persetujuan tertulis karena akan menciptakan kewajiban saldo uang.

### 3.4 Apakah split payment didukung?

Rekomendasi fase pertama:

- Bayar penuh dengan wallet, atau
- Bayar penuh dengan metode lain.

Jangan langsung mendukung kombinasi wallet + Mayar sebelum flow dasar stabil.

---

## 4. Database Design

Semua perubahan database harus additive dan idempotent.

### 4.1 Tabel wallet customer

Tambahkan `pos.customer_wallets`:

```text
customer_id       text primary key
currency          text default 'IDR'
status            text: active | blocked
created_at        timestamptz
updated_at        timestamptz
```

### 4.2 Ledger wallet

Tambahkan `pos.customer_wallet_ledger`:

```text
id                bigserial / bigint
customer_id       text
amount            bigint              -- Rupiah integer, bukan float
direction         text: credit | debit
balance_after     bigint
status            text: pending | completed | reversed | cancelled
transaction_type  text
reference_type    text
reference_id      text
idempotency_key   text unique
note              text
created_by        text
created_at        timestamptz
```

Jenis transaksi yang direncanakan:

```text
topup_pending
topup_completed
wallet_hold
wallet_capture
wallet_release
order_debit
refund
manual_credit
manual_debit
adjustment
```

### 4.3 Hold wallet

Tambahkan `pos.customer_wallet_holds` atau gunakan ledger hold dengan status yang jelas:

```text
hold_id
customer_id
order_id
amount
status: held | captured | released | expired
expires_at
idempotency_key
created_at
```

Rekomendasi: tabel hold terpisah agar status reserve tidak tercampur dengan saldo final.

### 4.4 Public read model

Buat view customer/admin yang aman:

```text
public.pos_customer_wallets_view
```

Expose hanya:

```text
customer_id
available_balance
held_balance
status
updated_at
```

Jangan expose data internal seperti raw webhook atau credential metadata.

---

## 5. RPC dan Edge Function

Semua perubahan saldo harus atomik dan server-side.

RPC yang diperlukan:

```text
get_wallet_balance(customer_id)
create_wallet_hold(customer_id, order_id, amount, idempotency_key)
capture_wallet_hold(hold_id, idempotency_key)
release_wallet_hold(hold_id, reason, idempotency_key)
credit_wallet(customer_id, amount, reference, idempotency_key)
debit_wallet(customer_id, amount, reference, idempotency_key)
refund_wallet(order_id, idempotency_key)
```

Edge Function baru atau action baru dengan otorisasi server-side:

```text
wallet-balance
wallet-hold
wallet-capture
wallet-release
wallet-topup
wallet-refund
wallet-adjustment
```

Aturan keamanan:

- Frontend tidak boleh update saldo langsung.
- Setiap write memakai idempotency key.
- Row wallet dikunci saat debit/credit.
- Saldo tidak boleh negatif.
- `capture` dan `release` hanya boleh berhasil satu kali.
- `order_id`/`reference_id` wajib untuk debit order.
- Admin adjustment wajib memiliki alasan dan operator.
- Action wallet harus memverifikasi ownership customer.
- Jangan memberikan RPC mutasi wallet langsung ke `anon` tanpa boundary Edge Function yang aman.

---

## 6. Flow Pembayaran Order dengan Wallet

```text
Customer memilih Wallet
        ↓
Buat order pending dengan idempotency key
        ↓
Create wallet hold secara atomik
        ↓
Jika valid → lanjutkan order
        ↓
Order paid/completed → capture hold menjadi debit
        ↓
Simpan wallet_transaction_id ke payment metadata
```

Jika order gagal/cancelled sebelum capture:

```text
release hold
saldo kembali tersedia
```

Jika order sudah captured lalu dibatalkan:

```text
buat transaksi refund baru
jangan menghapus transaksi debit lama
```

Metadata order/payment yang diperlukan:

```text
payment_method = wallet
wallet_hold_id
wallet_transaction_id
wallet_amount
```

Tidak boleh melakukan:

```text
baca saldo → hitung di browser → update saldo
```

Karena pola tersebut rentan race condition dan double-spend.

---

## 7. Perubahan `apps/customer`

### 7.0 Pembayaran Checkout Menggunakan Wallet — Wajib

Wallet harus dapat dipilih langsung sebagai metode pembayaran di checkout Customer, bukan hanya ditampilkan sebagai saldo atau digunakan untuk refund.

Flow wajib:

```text
Customer membuka checkout
        ↓
Memilih metode "Bayar dengan Saldo Wallet"
        ↓
Sistem membaca saldo terbaru dari server
        ↓
Validasi saldo >= total order
        ↓
Buat wallet hold dengan idempotency key
        ↓
Order dibuat sebagai pending
        ↓
Jika order berhasil dibayar → capture hold
        ↓
Order menyimpan payment_method = wallet
        ↓
Receipt menampilkan nominal wallet
```

Jika saldo tidak cukup:

```text
Saldo tersedia: Rp20.000
Total order:    Rp35.000
Kekurangan:     Rp15.000

[Top Up Saldo] [Pilih Metode Pembayaran Lain]
```

Aturan checkout:

- saldo harus divalidasi ulang server-side saat submit;
- saldo tidak boleh hanya dipercaya dari state React atau tampilan profile;
- wallet hold harus dibuat sebelum order dianggap berhasil;
- retry checkout dengan idempotency key tidak boleh membuat hold atau debit kedua;
- order gagal/cancel sebelum capture harus me-release hold;
- order yang sudah captured lalu dibatalkan harus membuat transaksi refund baru;
- order receipt dan riwayat harus menampilkan `Saldo Wallet` sebagai metode pembayaran;
- payment metadata menyimpan `wallet_hold_id`, `wallet_transaction_id`, dan `wallet_amount`;
- saldo kurang harus memiliki error yang jelas dan tombol kembali ke metode pembayaran;
- tombol submit harus memiliki loading, disabled state, dan error retry;
- fase pertama hanya mendukung pembayaran penuh dengan wallet atau metode lain, bukan split payment.

Acceptance khusus checkout:

- [ ] Customer dapat memilih Wallet di checkout.
- [ ] Customer dengan saldo cukup dapat menyelesaikan order tanpa Mayar.
- [ ] Customer dengan saldo kurang tidak dapat membuat debit/hold permanen.
- [ ] Saldo berkurang tepat satu kali setelah order berhasil.
- [ ] Retry/double-click tidak membuat order atau debit wallet kedua.
- [ ] Order gagal me-release hold.
- [ ] Pembatalan setelah capture menghasilkan refund ledger.
- [ ] Receipt menampilkan metode `Saldo Wallet` dan nominalnya.

### 7.1 Navigasi dan route

Tambah:

```text
/$username/saldo
```

Pertahankan:

```text
/$username/poin → redirect ke /$username/saldo
```

### 7.2 Home/profile card

Profile customer wajib menampilkan ringkasan wallet, bukan hanya poin.

Minimal informasi yang ditampilkan:

```text
Saldo tersedia:      Rp150.000
Total saldo masuk:   Rp500.000
Total saldo dipakai: Rp350.000
```

Jika wallet memiliki sumber transaksi berbeda, profile juga menampilkan ringkasan:

```text
Top up:              Rp300.000
Refund:              Rp150.000
Bonus/credit admin:  Rp50.000
Penggunaan order:    Rp350.000
```

Aturan tampilan:

- saldo tersedia dihitung dari state wallet terbaru;
- total saldo masuk adalah akumulasi transaksi credit yang completed;
- total saldo dipakai adalah akumulasi debit order yang completed;
- transaksi pending tidak masuk ke total final;
- hold ditampilkan terpisah sebagai saldo tertahan jika nilainya lebih dari nol;
- refund ditampilkan sebagai credit dengan reference order;
- profile tidak boleh menghitung total dari data lokal saja;
- jika data wallet gagal dimuat, tampilkan error/retry dan jangan menampilkan angka nol yang menyesatkan;
- nominal menggunakan format Rupiah tanpa pecahan desimal;
- customer tetap dapat melihat poin lifetime jika sistem hybrid dipertahankan.

Ganti tampilan utama dari:

```text
Poin: 3.000
```

menjadi:

```text
Saldo tersedia: Rp150.000
Top up/credit:  Rp500.000
Digunakan:      Rp350.000
```

Jika poin dipertahankan:

```text
Saldo: Rp150.000
Member Gold
Poin lifetime: 3.000
```

Profile dapat menyediakan link menuju halaman `/saldo` untuk melihat ledger lengkap.

### 7.3 Halaman saldo

Komponen:

- saldo tersedia;
- saldo tertahan;
- tombol Top Up;
- riwayat saldo;
- filter kredit/debit/refund;
- detail transaksi;
- status wallet active/blocked;
- loading, empty, error, retry;
- copy transaksi/reference jika diperlukan.

Format riwayat:

```text
+ Rp20.000   Refund order
- Rp15.000   Pembayaran pesanan
+ Rp50.000   Top Up Mayar
```

### 7.4 Checkout

Tambahkan metode pembayaran:

```text
Saldo Wallet
```

Tampilkan:

```text
Saldo tersedia: Rp50.000
Total order:    Rp35.000
Sisa saldo:     Rp15.000
```

Saldo kurang:

```text
Saldo tidak cukup
Kurang Rp10.000
[Top Up Saldo] [Pilih metode lain]
```

Implementasi harus mengikuti idempotensi order yang sudah berjalan.

### 7.5 Riwayat order dan receipt

Tampilkan:

```text
Metode pembayaran: Saldo Wallet
Nominal wallet:    Rp35.000
```

Jangan menampilkan wallet sebagai `cash`, `djiwaapp`, atau label generik.

### 7.6 Refund

Saat order dibatalkan:

```text
Order dibatalkan
Refund Rp35.000 masuk ke saldo wallet
```

Refund harus berasal dari ledger, bukan hanya update UI.

---

## 8. Perubahan `apps/admin`

### 8.1 Tabel customer

Kolom baru:

```text
Saldo
Poin Lifetime
Wallet Status
Total Credit
Total Debit
```

Kolom poin aktif dapat dipertahankan selama masa transisi.

### 8.2 Detail customer

Tambahkan:

```text
Saldo tersedia
Saldo tertahan
Total credit
Total penggunaan
Total refund
Status wallet
```

Tambahkan section:

```text
Riwayat Saldo
```

Kolom ledger:

```text
Tanggal
Jenis
Nominal
Saldo setelah transaksi
Order/reference
Status
Catatan
Operator
```

### 8.3 Manual adjustment

Admin dapat:

```text
Tambah saldo
Kurangi saldo
Blokir wallet
Buka blokir wallet
```

Form wajib:

```text
Nominal
Jenis adjustment
Alasan
Catatan
```

Semua adjustment harus melalui Edge Function dan memiliki audit trail.

### 8.4 Customer search

Hasil pencarian customer membawa:

```text
name
email
phone
walletBalance
walletStatus
memberTier
```

Saldo pada search hanya untuk display. Validasi final tetap dilakukan server-side saat pembayaran.

### 8.5 Reconciliation/admin report

Tambahkan filter dan laporan:

```text
Total credit hari ini
Total debit hari ini
Total refund
Total top-up
Saldo liability wallet
Transaksi pending
Transaksi gagal
```

Anomali yang harus terdeteksi:

- ledger tanpa reference;
- debit tanpa order;
- saldo negatif;
- double idempotency key;
- hold kedaluwarsa;
- top-up paid tanpa credit wallet;
- credit wallet tanpa sumber yang valid.

---

## 9. Integrasi Top-up Mayar

Top-up Mayar menjadi fase setelah wallet ledger dan order debit stabil.

Flow:

```text
Customer pilih nominal top-up
        ↓
Buat wallet_topup pending
        ↓
Create invoice Mayar
        ↓
Simpan invoiceId dan transactionId
        ↓
Customer bayar
        ↓
Webhook Mayar menerima event
        ↓
Verifikasi transaction detail server-side
        ↓
Status harus paid
        ↓
Credit wallet sekali dengan idempotency key
```

Aturan:

- redirect Mayar bukan bukti pembayaran;
- webhook harus memverifikasi transaksi ke Mayar;
- invoice duplicate harus aman;
- satu transaction ID hanya boleh credit sekali;
- top-up pending tidak menambah saldo;
- semua data Mayar sensitif tetap server-side.

---

## 10. Migrasi Data Poin

Tidak melakukan destructive migration.

Urutan:

1. Backup `pos.customers` dan `pos.customer_point_ledger`.
2. Tambah tabel wallet.
3. Buat wallet Rp0 untuk semua customer aktif.
4. Verifikasi seluruh customer memiliki satu wallet.
5. Pertahankan trigger award poin selama mode hybrid.
6. Tentukan keputusan konversi poin secara tertulis.
7. Jika tidak ada konversi, poin tetap menjadi tier/history.
8. Jika ada konversi, buat migration satu kali dengan reference khusus:

```text
legacy_points_conversion_<customer_id>
```

9. Audit total nominal hasil konversi.
10. Jangan menghapus ledger poin lama.
11. Jalankan rollout wallet secara bertahap.

---

## 11. Testing Strategy

### Unit test

- saldo tidak negatif;
- debit atomik;
- double debit ditolak;
- duplicate webhook aman;
- hold capture satu kali;
- hold release satu kali;
- refund satu kali;
- conversion mapping benar.

### Integration test

- create wallet;
- credit manual;
- debit order;
- cancel sebelum capture;
- cancel setelah capture;
- refund;
- top-up pending;
- top-up paid;
- top-up webhook duplicate;
- admin adjustment;
- wallet blocked.

### E2E Customer

```text
Login
→ lihat saldo
→ pilih pembayaran wallet
→ order berhasil
→ saldo berkurang
→ lihat ledger
→ order dibatalkan
→ refund masuk
→ saldo dan ledger konsisten
```

### E2E Admin

```text
Buka customer
→ lihat saldo
→ buka ledger
→ tambah saldo dengan alasan
→ cek audit
→ blokir wallet
→ pastikan wallet tidak dapat dipakai
```

### Security test

- customer A tidak dapat membaca wallet customer B;
- customer tidak dapat memanggil adjustment admin;
- email/source ID mismatch ditolak;
- saldo negatif ditolak;
- request retry tidak membuat transaksi kedua;
- top-up paid hanya credit satu kali.

---

## 12. Rollout Plan

### Wave 1 — Wallet foundation

- schema wallet;
- ledger;
- RPC atomik;
- Edge Function;
- unit/integration tests;
- wallet Rp0 untuk customer aktif.

### Wave 2 — Admin visibility

- saldo di tabel customer;
- detail wallet;
- ledger;
- audit view;
- belum mengaktifkan pembayaran wallet.

### Wave 3 — Customer read-only

- route `/saldo`;
- saldo card;
- riwayat saldo;
- route `/poin` redirect.

### Wave 4 — Wallet payment

- hold/capture/release;
- checkout customer;
- receipt dan order history;
- refund.

### Wave 5 — Top-up Mayar

- invoice top-up;
- webhook verification;
- settlement wallet;
- reconciliation.

### Wave 6 — Gradual rollout

- pilot internal;
- pilot customer terbatas;
- monitor failed/duplicate ledger;
- rollout semua customer;
- pertahankan fallback pembayaran lama.

---

## 13. Rollback Plan

Rollback tidak boleh menghapus ledger atau membalik data secara manual.

Jika wallet payment bermasalah:

1. Nonaktifkan metode wallet di site settings/feature flag.
2. Order baru kembali ke metode pembayaran lama.
3. Wallet ledger tetap read-only untuk audit.
4. Pending hold direlease dengan job aman.
5. Top-up baru dihentikan sementara.
6. Transaksi yang sudah captured tidak dihapus.
7. Refund dilakukan melalui credit ledger jika dibutuhkan.

Feature flag yang disarankan:

```text
wallet_enabled
wallet_checkout_enabled
wallet_topup_enabled
wallet_admin_adjustment_enabled
wallet_legacy_points_conversion_enabled
```

---

## 14. Acceptance Criteria

Fitur dianggap siap hanya jika:

- [ ] Histori poin lama tetap dapat dibaca.
- [ ] Setiap customer aktif memiliki wallet tepat satu.
- [ ] Saldo tidak dapat menjadi negatif.
- [ ] Semua perubahan saldo memiliki ledger.
- [ ] Tidak ada debit ganda saat retry checkout.
- [ ] Order cancelled menghasilkan release/refund yang benar.
- [ ] Customer hanya dapat melihat wallet sendiri.
- [ ] Wallet tidak memiliki fitur withdraw/cash-out.
- [ ] Wallet tidak dapat ditransfer antar customer.
- [ ] Customer hanya dapat menggunakan wallet untuk transaksi aplikasi yang diizinkan.
- [ ] Admin adjustment memiliki alasan dan audit.
- [ ] Customer App menampilkan saldo yang benar.
- [ ] Admin App menampilkan saldo dan ledger yang benar.
- [ ] Mayar top-up hanya credit satu kali setelah status paid terverifikasi.
- [ ] Build customer/admin berhasil.
- [ ] Production bundle dan endpoint canonical terverifikasi.
- [ ] Rollback feature flag sudah diuji.

---

## 15. File/Modul yang Kemungkinan Terlibat

### Customer

```text
apps/customer/src/routes/$username/poin.lazy.tsx
apps/customer/src/routes/$username/poin.tsx
apps/customer/src/routes/$username/route.lazy.tsx
apps/customer/src/hooks/use-customer-data.ts
apps/customer/src/hooks/use-customer-auth.tsx
apps/customer/src/hooks/use-order-context.tsx
apps/customer/src/components/customer/profile-card.tsx
apps/customer/src/components/customer/CustomerMenuGrid.tsx
apps/customer/src/routes/$username/order.lazy.tsx
```

### Admin

```text
apps/admin/src/routes/admin/customers.lazy.tsx
apps/admin/src/components/pos/customer-search-modal.tsx
apps/admin/src/components/pos/checkout-sidebar.tsx
apps/admin/src/routes/menu.lazy.tsx
```

### Backend/database

```text
supabase/functions/customer-sync/index.ts
supabase/functions/mayar-proxy/index.ts
supabase/functions/mayar-webhook/index.ts
supabase/migrations/*wallet*.sql
supabase/migrations/*customer*.sql
```

### Existing data to preserve

```text
pos.customers.total_points
pos.customers.lifetime_points
pos.customer_point_ledger
pos.award_order_points()
pos.redeem_points(...)
```

---

## 16. Implementasi Selesai dan Batasan Saat Ini

Sudah diimplementasikan dan diverifikasi:

- wallet customer IDR additive;
- wallet ledger dan wallet hold;
- RPC atomik hold/capture/release;
- customer wallet Edge Function;
- customer checkout dengan metode `Saldo Wallet`;
- validasi saldo server-side;
- idempotensi hold/capture;
- profile customer menampilkan saldo, total masuk, total digunakan, dan saldo tertahan;
- route `/$username/saldo` dan riwayat saldo;
- Admin customer summary menampilkan saldo;
- Admin detail menampilkan ledger wallet;
- audited admin credit/debit adjustment melalui token staff dan role check;
- top-up Mayar membuat record `pending` dan hanya menambah saldo setelah webhook memverifikasi status `paid`;
- webhook top-up idempotent berdasarkan transaction ID Mayar;
- tidak ada fitur withdraw, cash-out, atau transfer antar customer;
- poin lama tidak dihapus.

Masih menjadi tahap lanjutan sebelum dinyatakan full rollout:

- top-up wallet melalui invoice Mayar + webhook settlement;
- automatic refund wallet untuk seluruh jalur pembatalan order;
- admin adjustment UI form penuh; backend action sudah tersedia dan diaudit;
- split payment wallet + Mayar;
- feature flag rollout dan monitoring reconciliation.

Semua perubahan saat ini tetap additive. Tidak ada konversi poin lama ke Rupiah dan tidak ada saldo customer yang diisi otomatis.
