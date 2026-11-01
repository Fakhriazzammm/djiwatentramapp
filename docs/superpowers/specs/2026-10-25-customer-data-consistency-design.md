# Customer Data Consistency Design

## Intent

Memastikan `apps/customer` pada `djiwatentram.web.id` menampilkan data yang benar-benar dimiliki customer yang sedang login: profil existing, seluruh pesanan/transaksi, detail struk, status pembayaran, saldo dan ledger Djiwa Pay, serta notifikasi push.

Masalah yang ditemukan adalah migrasi backend yang belum konsisten. Profil dan Better Auth sudah memakai `api.djiwatentram.web.id`, tetapi beberapa pembacaan data masih memakai `api.yumme.id`, dan loader detail struk masih membaca order langsung dari Supabase melalui hook shared. Jalur-jalur itu dapat menghasilkan data kosong atau tidak melewati otorisasi customer yang sama.

## Goals

- Menggunakan satu origin API customer: `https://api.djiwatentram.web.id/v1/customer`.
- Memastikan member membaca `/orders` dengan cookie Better Auth dan guest membaca `/guest-orders` dengan pasangan `orderId`/`accessToken`.
- Memastikan daftar riwayat, notifikasi, order aktif, detail/struk, dan refresh status memakai data yang sama.
- Mempertahankan field existing dan field tracking/payment baru melalui mapper yang kompatibel dengan format camelCase maupun snake_case.
- Menjaga wallet/pembayaran tetap melalui edge function yang sudah memiliki ownership check `sourceId + email`.
- Menambahkan regression tests untuk URL, authorization path, dan pemetaan data transaksi.

## Non-goals

- Tidak mengubah atau menghapus data customer, order, wallet, ledger, atau pembayaran di database.
- Tidak mengubah kontrak backend auth-server maupun edge function.
- Tidak memindahkan data pembayaran ke client-side Supabase query.
- Tidak melakukan redesign visual di luar kebutuhan state data/error yang diperlukan.

## Constraints

- Perubahan dibatasi pada source customer dan utility shared yang benar-benar dibutuhkan oleh loader customer.
- Endpoint member wajib memakai `credentials: "include"`.
- Endpoint guest wajib mengirim access token; tidak boleh kembali ke request guest berbasis `orderIds` tanpa token.
- Direct Supabase tetap boleh untuk katalog publik dan realtime trigger, tetapi bukan sebagai source of truth untuk order customer atau detail pembayaran.
- Perubahan lama yang sudah ada di workspace di luar scope harus dipertahankan.

## Approaches

1. **Penggantian URL saja.** Cepat, tetapi tidak menyelesaikan loader struk yang masih memakai Supabase dan tidak mencegah drift URL di masa depan.
2. **Satu customer API client + jalur data authorization-aware (dipilih).** Centralize origin/request helpers, gunakan endpoint member/guest yang benar untuk semua order reads, pertahankan mapper kompatibel, dan arahkan push ke origin yang sama. Ini menyelesaikan akar masalah tanpa memperluas akses database ke browser.
3. **Direct Supabase reads.** Tidak dipilih karena RLS/session boundary customer tidak sama dengan Better Auth dan berisiko menampilkan atau gagal membaca data lintas customer.

## Design

- Tambahkan utility API customer yang memiliki base URL tunggal dan helper untuk request member/guest order.
- Reuse helper tersebut di `use-customer-data.ts`, `use-hybrid-ops-data.ts`, dan `order.lazy.tsx` sehingga riwayat dan struk memakai sumber data yang identik.
- Lengkapi tipe dan mapper order untuk metadata source, brand/platform, daily receipt, delivery, payment, dan tracking tanpa menghilangkan field lama.
- Pindahkan endpoint push subscribe/unsubscribe ke helper/base URL customer.
- Pertahankan wallet read/top-up melalui `customer-wallet` edge function dan validasi hasil response; data wallet harus tetap di-scope oleh customer aktif.
- Jika API gagal, tampilkan error/retry yang jujur; jangan mengganti data customer dengan data customer lain atau fallback kosong yang menyamarkan kegagalan.

## Verification

- Regression tests harus membuktikan member memakai `/orders`, guest memakai `/guest-orders` dengan token, dan order detail tidak memakai direct Supabase read.
- Typecheck customer harus lulus.
- Build customer harus lulus.
- Diff akhir harus hanya berisi perubahan yang diperlukan untuk alur data customer serta dokumen desain/rencana.
