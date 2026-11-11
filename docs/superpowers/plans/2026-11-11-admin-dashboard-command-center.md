# Rencana: Dashboard Admin "Command Center" + Sidebar Baru

Prototipe acuan (terbaru): https://claude.ai/artifact/2QhvXAwdkcmDjDgWHNAGS6
Target: `apps/admin` (admin.djiwatentram.web.id/admin). Status: **rencana, belum ada kode yang diubah.**

## 1. Hasil audit kode (dasar rencana)

| Temuan | Lokasi | Dampak |
|---|---|---|
| Dashboard sekarang | `apps/admin/src/routes/admin/index.lazy.tsx` → `-OperationalDecisionDashboard.tsx` (131 baris) | Dipakai di `/` dan `/admin/`. Periode baru 6 (hari ini…bulan lalu). |
| Data dashboard | `use-hybrid-pos-data.ts` (`useHybridDashboardStatsState`, `useHybridOrders({limit:1000})`) | Order diambil ke klien dengan batas 1000 baris: **tidak akan akurat untuk "3/6 bulan" dan "semua"**. Agregasi harus pindah ke database. |
| Realtime | `hooks/use-supabase-live-value.ts` (Supabase Realtime per skema/tabel + polling min 5 dtk) | Bisa dipakai ulang; tambah daftar tabel. |
| Jam operasional | `-HourlyTransactionAnalysis.tsx` + `lib/hourly-transaction-analysis.ts` | Sudah ada tab chart / heatmap / jam teratas, tapi rentang hanya hari ini/7/30 hari/tanggal/rentang (maks 31 hari) dan belum ada dimensi **hari dalam minggu**. |
| Kehadiran | `pos_attendance_logs`, `pos_users_public` (nama, foto), RPC `get_currently_in_store`, `attendance_leave_requests`, jadwal di `use-hybrid-attendance-schedules.ts` | Nama karyawan tersedia. |
| DjiwaPay | `pos.customer_wallets`, `pos.customer_wallet_ledger` (tipe: topup_completed, order_debit, refund, wallet_hold/capture/release, manual_credit), view `pos_customer_wallets_view` | Saldo, ditahan, mutasi: ada. Metode bayar per order: kolom `paymentMethod` di order (mis. `djiwa_pay`, `qris`). |
| Lalu lintas web (halaman dibaca, orang/bot/AI, sumber kedatangan) | **Tidak ada tabel/pelacak di repo** (hanya `visitor_key` di app 500kopitasik) | Bagian "Web pelanggan" di prototipe **tidak bisa memakai data asli** sebelum ada pelacakan baru. |
| Sidebar admin | `routes/admin/route.tsx` (1890 baris, `AdminLayout`, `DesktopNavLink`, `SidebarSection`), sudah memakai framer-motion, collapse 64/256 px, cek `permission` | Restyle di tempat; jangan ubah struktur menu/izin. |
| Stack | framer-motion ^12.29, recharts ^3.8, TanStack Router, Supabase | Tidak perlu dependency baru (kecuali font mono, lihat risiko). |

## 2. Keputusan yang perlu Anda setujui

1. **Web pelanggan**: (a) tahap 2 — bangun pelacakan ringan (tabel `web_page_events`, dicatat dari app customer, klasifikasi orang/bot/AI dari user-agent), bagian disembunyikan sampai aktif; atau (b) buang bagian ini. **Rekomendasi: (a).**
2. **Kartu ekosistem**: hanya tampil bila tabel sumbernya terverifikasi (POS, DjiwaPay, Booking, Karyawan, Stok hampir pasti ada; B2B, KOL, Merchandise, Rekrutmen, Investor, Jumat Berkah perlu dicek per app). Kartu tanpa sumber data **tidak ditampilkan**, bukan diisi angka contoh. **Rekomendasi: setuju.**
3. **Gaya**: prototipe datar + monospace, sedangkan `DESIGN.md` dan dashboard sekarang bergaya Apple (membulat). Saya batasi gaya baru dalam satu class pembungkus (`.admin-command`) hanya untuk dashboard dan sidebar, tidak menyentuh halaman admin lain. Ikon sidebar tetap Lucide seperti sekarang (kontrol navigasi); ikon 3D Djiwa dipakai hanya untuk empty state dan kartu ilustratif. **Rekomendasi: setuju.**

## 3. Arsitektur

### 3.1 Filter periode (permintaan #1)
- `lib/dashboard-periods.ts`: 9 periode — `today, yesterday, this_week, last_week, this_month, last_month, last_3_months, last_6_months, all` + opsional tanggal kustom. Semua batas dihitung dalam **WIB** memakai `wib-utils.ts`. Tiap periode punya "periode pembanding" (rentang sama panjang tepat sebelumnya; `all` tanpa pembanding).
- Periode tersimpan di URL (`?period=`) agar bisa dibagikan dan bertahan saat refresh.
- Definisi "minggu" = Senin–Minggu (cek kesesuaian dengan `getWibDayRange`/laporan keuangan yang ada sebelum final).
- Tes unit: batas awal/akhir tiap periode, pergantian bulan/tahun, pembanding.

### 3.2 Data asli dan realtime (permintaan #1)
- Migrasi baru `supabase/migrations/<timestamp>_admin_dashboard_overview.sql` berisi RPC `security definer` dengan pemeriksaan peran admin:
  - `admin_dashboard_overview(p_start, p_end, p_prev_start, p_prev_end)` → jsonb: pendapatan settled, jumlah order, rata-rata, kas bersih, alur order (dibuat/dibayar/disiapkan/selesai), metode bayar, kanal, kategori, produk terlaris, pembanding.
  - `admin_sales_heatmap(p_start, p_end)` → matriks hari-dalam-minggu × jam (order + revenue, WIB). Menggantikan batas 31 hari.
  - `admin_djiwapay_summary(...)` → volume, jumlah transaksi, status, saldo tersedia/ditahan, per sumber, mutasi terbaru.
- Semua RPC mengagregasi di database; klien tidak lagi menarik ribuan order.
- Realtime: hook `use-admin-overview.ts` membungkus `useSupabaseLiveValue` dengan `tables: [orders, pos_attendance_logs, pos.customer_wallet_ledger, bookings…]`, debounce 1–2 dtk, polling cadangan 30 dtk saat tab terlihat. Feed aktivitas langsung memakai event INSERT dari tabel yang sama. Indikator "diperbarui X dtk lalu" dihitung dari waktu sinkron nyata, bukan timer.
- Setiap bagian punya state loading (skeleton), kosong, error + coba lagi, dan "data basi" bila realtime putus (aturan `DESIGN.md` §7).
- Tidak ada angka contoh di produksi.

### 3.3 Kehadiran dengan nama (permintaan #2)
- Panel "Kehadiran tim": daftar per orang — **nama, peran, foto, jam masuk/keluar, status** (hadir, terlambat, belum hadir, izin/cuti, sudah pulang) dari `pos_attendance_logs` + jadwal + `attendance_leave_requests`; ringkasan "9 dari 11 hadir" dan hitungan per shift.
- Realtime saat ada clock-in/out. Klik nama → `/admin/karyawan/$username`.
- Privasi: hanya untuk pengguna dengan izin yang sama seperti halaman karyawan; tombol "Sembunyikan data" yang ada ikut menyamarkan nama.

### 3.4 Analisa jam operasional (permintaan #3)
- Tab: **Chart · Heatmap · Jam teratas · Hari teratas**.
- Heatmap = baris hari (Sen–Min) × kolom jam (fokus 07–21), warna berdasar intensitas, metrik Order/Revenue, tooltip rinci, sel bisa diklik untuk membuka order pada slot itu.
- "Jam teratas" = 5 jam tersibuk; "Hari teratas" = urutan hari tersibuk; plus jam ramai/tersepi dan tingkat keyakinan (jumlah hari sampel) seperti sekarang.
- Memakai semua 9 periode; rentang "semua" didukung lewat RPC.
- Perluas `lib/hourly-transaction-analysis.ts` (agregasi hari × jam) dengan tes WIB.

### 3.5 Sidebar baru (permintaan #4)
- Restyle `AdminLayout` di `routes/admin/route.tsx`: rel ikon rapat, garis tipis, status aktif gelap persegi, hover bergeser halus, tooltip saat collapse, grup menu dan `permission` **tidak berubah**. Navigasi mobile tidak berubah.
- Jika memungkinkan, ekstrak ke `components/layout/AdminSidebar.tsx` hanya bila tidak memperbesar risiko; jika tidak, restyle di tempat.
- Tes manual: collapse/expand, izin berbeda, navigasi keyboard, 768/1024/1440.

### 3.6 Motion framer + interaktif (permintaan #5)
- Pembungkus `MotionConfig reducedMotion="user"` (mengikuti "kurangi gerakan").
- Komponen bersama di folder dashboard: `AnimatedNumber` (hitung naik, animasi saat nilai/periode berubah), `Reveal` (stagger masuk), `DrawLine` (`motion.path` + `pathLength`), `GrowBar` (`scaleY/scaleX`), `SegmentedControl` (pil geser dengan `layoutId`), `LiveFeed` (`AnimatePresence` + `layout` untuk item baru), `LiveDot`.
- Interaktif: filter periode, toggle metrik, hover/tap tooltip, klik kartu ke halaman terkait, klik sel heatmap, refresh dengan umpan balik, urutan feed realtime.
- Hanya animasikan `transform`/`opacity`; tidak ada layout thrash.

## 4. Struktur file (usulan)
```
apps/admin/src/routes/admin/-dashboard/
  CommandCenter.tsx          # halaman, menggantikan -OperationalDecisionDashboard
  sections/ {Toolbar, LiveFeed, Sales, Ecosystem, DjiwaPay, Attendance, Hourly, Breakdown, Actions}.tsx
  motion/ {AnimatedNumber, Reveal, DrawLine, GrowBar, SegmentedControl}.tsx
apps/admin/src/hooks/use-admin-overview.ts
apps/admin/src/lib/dashboard-periods.ts (+ .test.ts)
apps/admin/src/lib/hourly-transaction-analysis.ts   # diperluas
supabase/migrations/<timestamp>_admin_dashboard_overview.sql
```
`/` dan `/admin/` tetap memakai dashboard yang sama (aturan komentar di `index.lazy.tsx`).

## 5. Tahapan
1. **Fondasi**: `dashboard-periods` + tes; migrasi RPC; `use-admin-overview`. *Selesai bila* angka Hari ini/Bulan ini cocok dengan dashboard lama.
2. **Penjualan + filter 9 periode + motion dasar**; ganti dashboard lama di balik flag tanpa menghapusnya dulu.
3. **Jam operasional**: heatmap hari×jam, jam teratas, hari teratas.
4. **Kehadiran bernama + DjiwaPay + feed realtime + kartu ekosistem terverifikasi**.
5. **Sidebar**.
6. **Web pelanggan** (bila keputusan 1a): pelacakan + tampilan.
7. **Pemolesan + hapus kode dashboard lama** setelah Anda setuju.

## 6. Verifikasi
- Tes unit: periode WIB, agregasi heatmap, pembanding. Jalankan lint, typecheck, dan tes sesuai `scripts` di `apps/admin/package.json`.
- Cocokkan angka dashboard baru dengan query SQL langsung dan dengan laporan keuangan untuk tiap periode.
- Uji realtime: buat order/clock-in uji lalu pastikan tampil < beberapa detik.
- Cek visual 375/768/1024/1440, mode kurangi gerakan, fokus keyboard, kontras, tanpa overflow horizontal.
- Deploy: ikuti `docs/DEPLOYMENT_VPS_WORKFLOW.md` (build di Mac lewat `scripts/ship-artifacts.sh`, VPS hanya publish; tidak build/`git pull` di VPS). Cara menerapkan migrasi mengikuti alur yang ada di dokumen itu; **belum saya verifikasi**.

## 7. Risiko
- Definisi "minggu" dan "settled" harus sama dengan laporan keuangan agar angka tidak berbeda.
- RPC agregasi untuk "semua" perlu indeks pada `orders(createdAt, status)`; cek rencana query sebelum rilis.
- Nama karyawan di dashboard = data pribadi; batasi dengan izin.
- Font monospace prototipe (JetBrains Mono) menambah muatan; pakai font yang sudah dimuat admin atau `font-mono` sistem bila tidak ingin dependensi baru.
- Tabel untuk beberapa kartu ekosistem belum diverifikasi.

---

## Status implementasi (kode)

| Tahap | Status | Berkas utama |
|---|---|---|
| 0. Fondasi | Selesai | `apps/admin/src/lib/dashboard-periods.ts` (+ tes), `lib/dashboard-analytics.ts` (+ tes), `hooks/use-admin-overview.ts`, `lib/admin-protected-read.ts` (`adminProtectedRpc`) |
| 1. Penjualan + 9 periode + motion | Selesai | `routes/admin/-dashboard/SalesSection.tsx`, `CommandCenter.tsx`, `motion.tsx` |
| 2. Jam operasional (chart, heatmap, jam teratas, hari teratas) | Selesai | `routes/admin/-dashboard/HourlySection.tsx` |
| 3. Kehadiran bernama, DjiwaPay, feed realtime, kartu ekosistem terverifikasi | Selesai | `OpsSection.tsx`, `PaymentsSection.tsx`, `EcosystemSection.tsx` |
| 4. Sidebar | Selesai (restyle gaya rel) | `routes/admin/route.tsx` (`DesktopNavLink`, `SidebarSection`) |
| 5. Motion dan interaksi | Selesai | `motion.tsx`, animasi per bagian, `prefers-reduced-motion` |
| 6. Web pelanggan (tracking) | Selesai (perlu deploy migrasi + app customer) | `supabase/migrations/20261111100000_admin_command_center.sql` (`web_page_views`), `apps/customer/src/lib/web-analytics.ts`, `apps/customer/src/routes/__root.tsx` |
| 7. Pemolesan | Sebagian: bagian berat dibungkus `memo`; dashboard lama (`-OperationalDecisionDashboard.tsx`) belum dihapus sebagai jalur rollback | — |

Yang belum dilakukan (butuh persetujuan operator):

1. **Migrasi** `supabase/migrations/20261111100000_admin_command_center.sql` belum diterapkan ke database produksi. Ikuti langkah di `docs/DEPLOYMENT_VPS_WORKFLOW.md` (backup, review, `psql`).
2. **Edge Function** `supabase/functions/admin-protected-read/index.ts` (aksi `rpc` baru) harus di-deploy ulang; sebelum itu dashboard baru tidak bisa memuat data.
3. **Artefak** admin dan customer dikirim lewat `scripts/ship-artifacts.sh` setelah commit ada di `origin/main`. Commit belum dibuat.
4. Verifikasi visual di browser dan angka terhadap laporan keuangan belum dilakukan; perlu data nyata.

Catatan teknis:
- SQL diperiksa dengan parser PostgreSQL (`pglast`) untuk sintaks saja; fungsi belum dijalankan di database.
- Tes: `bun test src/lib/dashboard-periods.test.ts src/lib/dashboard-analytics.test.ts` lulus (19 tes). Dua tes `employee onboarding schema` gagal, tetapi berkas itu tidak diubah.
- `vite build` berhasil; `tsc` tidak menunjukkan galat di berkas baru.
- Bagian yang tidak memiliki sumber data terverifikasi (B2B, KOL, Investor) tidak ditampilkan.
