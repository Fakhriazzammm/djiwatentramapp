# Plan: Dua Link Publik Pendaftaran KOL dan Kalender Visit Bersama

- Project: `/opt/djiwatentramapp`
- Tanggal: 2026-10-06
- Status: rencana saja; belum ada perubahan implementasi
- Link publik yang dituju:
  - **Link A — pendaftaran:** `https://kolmarketing.yumme.id/`
  - **Link B — kalender kedatangan:** `https://kolmarketing.yumme.id/visit`

## Tujuan

Pisahkan pendaftaran KOL dan booking kunjungan menjadi dua flow. Link A dan Link B masing-masing adalah **satu link umum untuk semua KOL**, bukan link unik per creator. Hanya KOL yang sudah dinyatakan eligible oleh Admin boleh melakukan booking di Link B. Kalender bersama menunjukkan tanggal yang telah diambil; aturan bisnisnya **maksimal satu KOL per tanggal**, terlepas dari jam.

## Kondisi repo yang sudah diverifikasi

- Admin KOL sudah tersedia: `apps/admin/src/routes/admin/kol-data.tsx` dan `kol.lazy.tsx` untuk Data KOL; workspace portal/KOL berada pada `apps/admin/src/routes/admin/-components/KolPortalAdmin.tsx`, dengan tab **Visit**.
- Visit saat ini sudah memiliki undangan/token per KOL dan kalender Admin. `apps/auth-server/src/kol-portal.ts` melayani pembuatan undangan, autentikasi/link identitas, booking dan pembacaan kalender. Migration terkait ada di `supabase/migrations/20260923000003_kol_creator_portal_foundation.sql`, `20260923000004_kol_visit_booking_rpc.sql`, dan `20260924000003_kol_visit_invites.sql`.
- Booking saat ini menyimpan tanggal (belum jam dan checkbox consent). Unique partial index `idx_kol_visit_one_active_per_day` menjaga satu booking aktif pada satu tanggal (`requested`, `confirmed`, `completed`); index per creator mencegah booking aktif ganda. RPC lama dan flow undangan masih menjadi dasar yang harus direkonsiliasi, bukan digandakan begitu saja.
- Form awal berada di `apps/kol/src/App.tsx`; Admin Data KOL masih membaca/menulis `application_data.visitDate` dan `visitTime`. Keduanya perlu diaudit agar data kunjungan lama tidak hilang saat tanggal dihapus dari form pendaftaran.
- `apps/kolmarketing/` di repo saat ini hanya memiliki artifact/public hasil serving, sementara source form yang terverifikasi ada di `apps/kol`. Pastikan build/deploy mapping aktual sebelum mengubah atau menerbitkan bundle.
- `/`, `/visit`, dan `/admin` pada domain KOL merespons HTTP 200 saat diperiksa, tetapi respons itu belum membuktikan route UI/admin terlindungi sudah berfungsi.
- Pola pembanding tersedia di `apps/rekrutmen/public/admin.html` dan `apps/rekrutmen/server.js`: halaman `/admin` mandiri, memakai login Google dan endpoint server yang memvalidasi sesi/otorisasi. Gunakan sebagai referensi pengalaman/arsitektur, bukan salin token, secret, tabel, atau izin rekrutmen ke KOL.
- Working tree VPS sudah memiliki banyak perubahan lain dan untracked files. Sebelum implementasi/deploy, isolasi hanya file yang berubah untuk task ini; jangan menghapus atau memasukkan perubahan pihak lain.

## Flow sasaran

### A — Pendaftaran publik (`https://kolmarketing.yumme.id/`)

1. Creator masuk dengan Google; bila sesi aktif, lanjut.
2. Isi profil, kontak, username/platform, audience, jenis konten, dan minat kolaborasi; tinjau sebelum submit.
3. **Tidak meminta tanggal/jam kunjungan.** Pendaftaran baru tersimpan sebagai menunggu review, memakai status/transisi yang disepakati dengan Admin.
4. Tampilkan: “Data kamu sedang kami review. Mohon tunggu konfirmasi kami di platform kami atau melalui DM sosial media dan WhatsApp kamu.” Lalu keterangan diarahkan ke Portal KOL.
5. Countdown 15 detik yang terlihat; setelah nol arahkan ke Portal KOL. Portal menunjukkan status review dan instruksi bahwa booking kalender dibuka setelah eligible.

### Review Admin

1. Pendaftaran tampil di Data KOL yang sudah ada.
2. Admin meninjau data dan menentukan apakah creator eligible untuk memilih jadwal. Gunakan status/pola yang sudah ada bila semantiknya cocok; jangan menganggap status `Potential` otomatis eligible.
3. Eligibility harus ditegakkan server-side, bukan hanya menyembunyikan tombol UI. Tentukan transisi status dan siapa berwenang mengubahnya.
4. Admin tetap mengelola dan melihat booking di workspace KOL → Visit yang ada. Hapus/ganti pembuatan undangan per creator dari alur utama Link B bersama, sambil mempertahankan histori undangan/booking lama.

### Admin mandiri di kolmarketing (`https://kolmarketing.yumme.id/admin`)

Selain halaman Admin KOL yang sudah ada di aplikasi Admin utama, sediakan workspace mandiri di domain KOL agar Admin dapat langsung membuka dan mengelola proses KOL di domain yang sama. Ini **tambahan UI admin yang terfokus**, bukan pengganti `/admin/kol-data` atau workspace Admin KOL yang sudah dipakai.

1. Admin membuka `https://kolmarketing.yumme.id/admin`; user yang belum terautentikasi diarahkan ke halaman masuk. Pola UX boleh mengikuti `https://rekrutmen.yumme.id/admin` (login Google, layout workspace, dashboard/tabel), namun autentikasi/otorisasi harus memakai identitas/session dan pemeriksaan role Admin yang sesuai untuk aplikasi KOL.
2. Backend memvalidasi session dan role/permission Admin pada setiap endpoint. Jangan mengandalkan route tersembunyi, localStorage token buatan frontend, atau menyalin secret/session rekrutmen. Creator biasa yang login Google tidak boleh mendapat akses admin.
3. Tampilkan antrian pendaftar, pencarian/filter status, detail profil/platform/kontak sesuai hak akses, dan aksi review/eligible/tidak eligible dengan catatan serta audit siapa/kapan. Jaga PII pada endpoint admin saja.
4. Sediakan tampilan kalender Visit untuk melihat tanggal, jam, nama KOL, status dan consent; admin dapat mengelola status/cancel sesuai permission. Perubahan langsung memakai service/API bersama agar kalender Admin mandiri, Portal KOL, serta Admin utama membaca sumber data yang sama.
5. UI responsive dengan loading/empty/error/retry/success, konfirmasi aksi yang mengubah status, dan logout/session-expiry yang jelas. Tidak perlu menambahkan link ke navigasi pendaftar umum; halaman admin hanya diketahui oleh petugas dan tetap dilindungi server-side.
6. Pastikan URL `/admin` tidak tertimpa default history fallback yang mengirim halaman pendaftaran tanpa proteksi; routing/rewrite harus melayani halaman admin dan public form berdampingan di domain yang sama.

### B — Kalender bersama (`https://kolmarketing.yumme.id/visit`)

1. Link yang sama dapat dibagikan ke seluruh KOL.
2. Login Google bila belum login. Setelah login, server memetakan identitas auth yang sudah diverifikasi ke profil KOL terkait; client tidak boleh mengirim `kol_id` sebagai identitas yang dipercaya.
3. Jika belum eligible atau tidak ada profil yang terhubung, tampilkan instruksi/status yang jelas dan jangan izinkan booking.
4. Kalender bulanan menampilkan tanggal tersedia dan tanggal yang sudah terisi. Tanggal booked nonaktif. Bila menampilkan identitas KOL di halaman publik, batasi ke nama publik/username yang memang disetujui; jangan tampilkan email, nomor WhatsApp, token, atau data private. Default aman: kalender publik hanya menunjukkan status tanggal; Admin melihat detail creator.
5. Creator memilih tanggal tersedia dan jam kedatangan dari opsi yang dikelola bisnis (belum menetapkan jam operasional hardcoded). Pilih satu tanggal; tanggal menjadi terkunci begitu booking berhasil sesuai status yang disepakati.
6. Wajib centang persetujuan syarat & ketentuan dan konfirmasi kesiapan hadir untuk tanggal/jam itu. Simpan versi/teks atau metadata persetujuan dan waktu persetujuan yang dapat diaudit.
7. Backend/RPC atomik menyimpan booking dan consent. Jika ada dua request bersamaan untuk tanggal sama, satu berhasil dan yang lain menerima `DATE_ALREADY_BOOKED` serta diminta pilih tanggal lain. UI refresh kalender setelah hasil sukses/gagal.
8. Konfirmasi: “Jadwal kedatangan kamu sudah kami terima, mohon datang tepat waktu ya.” Tampilkan countdown 15 detik lalu arahkan ke Portal KOL. Portal menampilkan jadwal milik creator, jam, status, dan ketentuan perubahan/pembatalan.

## Skema/data dan API yang direncanakan

```text
Google/Better Auth session
        │ verified user → creator mapping + eligibility check
        ├── Link A → existing KOL application flow
        │            → pos.kol_creators + pos.kol_platforms + private contacts
        │            → application_data (tanpa visitDate/visitTime untuk aplikasi baru)
        │            → Admin /admin/kol-data review + eligibility
        └── Link B → shared availability API → pos.kol_visit_bookings
                                      │       └→ calendar view/API
                                      ├→ consent + booking date + time
                                      ├→ Portal KOL: booking milik sendiri
                                      └→ Admin KOL → Visit: semua booking & status

Admin mandiri kolmarketing (`/admin`)
        ├→ Admin auth/session guard (role/permission KOL Admin)
        ├→ API admin: pendaftar/review/eligibility + audit events
        └→ API Visit admin: semua booking/detail/update status
           (menggunakan sumber tabel dan layanan yang sama, bukan salinan data)
```

- Tabel utama yang ada: `pos.kol_creators`, `pos.kol_platforms`, `pos.kol_visit_bookings` (`id`, `kol_id`, `booking_date`, `status`, `visit_note`, `admin_note`, `confirmed_at`, `cancelled_at`, timestamps), dan histori `pos.kol_visit_booking_events`.
- Skema saat ini belum mencakup jam booking atau bukti consent. Rancang migration **additive/idempotent** untuk waktu kunjungan, consent, versi/teks persetujuan, serta waktu persetujuan bila audit membuktikan diperlukan. Gunakan waktu Indonesia secara eksplisit untuk validasi hari ini/jam operasional.
- Pertahankan unique constraint/index per hari dan per creator, tinjau ulang status mana yang memblok tanggal (status cancelled membebaskan tanggal; definisikan apakah completed tetap mengunci tanggal historis tanpa menutup tanggal masa depan). Jangan DROP/rename objek lama, jangan menghapus histori, dan uji konflik dengan data eksisting sebelum migrasi.
- API backend sebaiknya mencakup: kalender ketersediaan publik minimal (tanpa PII), kalender/detail booking admin, booking creator terautentikasi, jadwal creator sendiri, dan perubahan/cancel terotorisasi. Konfirmasi prefix/routing aktual di auth server serta proxy sebelum menentukan path final.
- Akses DB tetap melalui pola server/service-role yang ada; jangan membuka tabel private ke `anon`/`authenticated`. RPC booking harus memeriksa identitas/eligibility di sisi server, consent wajib, tanggal/jam valid, serta menangani unique violation secara eksplisit.

## UI/UX dan states

- Link A: form mobile-first bertahap mengikuti komponen existing; tanggal/jam kunjungan dikeluarkan dari data baru tanpa menghilangkan histori di Admin. Submit/loading, validasi, error, success, countdown 15→0 yang terlihat, dan tombol masuk Portal jika redirect gagal.
- Link B: kalender bulan dengan legenda tersedia/terisi/terpilih; loading skeleton; empty (tidak ada slot); error dengan retry; tanggal terisi tidak dapat dipilih; konflik submit menjelaskan bahwa tanggal baru saja diambil; success menampilkan tanggal/jam sebelum countdown.
- Consent harus jelas dan dapat diakses, bukan pre-checked. Sediakan keyboard focus, label screen-reader, tampilan mobile, dan cegah submit berulang.
- Portal KOL: status review/eligibility dan ringkasan jadwal creator; jangan menampilkan jadwal creator lain.
- Admin: lanjutkan workspace Visit yang ada untuk kalender semua booking, nama/username, tanggal, jam, status, consent audit indicator, filter status/tanggal, detail, refresh, dan aksi status sesuai permission. Pertahankan halaman Data KOL dan navigasi yang sudah berjalan.
- Admin mandiri `/admin`: UI serupa workspace operasional seperti rekrutmen (tanpa menyalin data/copy bisnisnya), tabel pendaftar, filter status/search, detail, aksi review/eligibility, panel kalender Visit, serta indikator/loading/empty/error/saving/success. Gunakan tampilan responsif, konfirmasi aksi berisiko, dan batasi PII ke role Admin.
- Akses publik tidak diberi tautan navigasi menuju admin; Admin masuk dengan URL langsung dan tetap melalui login/authorization backend.

## File yang kemungkinan disentuh

- `apps/kol/src/App.tsx` — pisah submit aplikasi dari pemilihan jadwal; review/redirect countdown.
- Route/router source untuk Portal KOL, kalender `/visit`, dan admin `/admin` (audit route resolver aktual; source `apps/kolmarketing/` belum ditemukan, source React berada di `apps/kol`). Pertimbangkan komponen baru khusus admin di `apps/kol/src/` dengan lazy load agar bundle creator tidak membesar.
- `apps/auth-server/src/kol-portal.ts` dan handler admin KOL yang melayani actions `visit_calendar`, `invite_*`, serta auth mapping — tambah/shared flow dengan akses terotorisasi, jangan memutus API lama tanpa migrasi bertahap. Tambah endpoint admin khusus untuk list/detail/review/eligibility serta Visit; role guard wajib server-side.
- `apps/admin/src/routes/admin/-components/KolPortalAdmin.tsx` — integrasi kalender bersama dan detail booking; `apps/admin/src/routes/admin/kol.lazy.tsx` — hentikan input tanggal/jam pendaftaran baru, pertahankan pembacaan histori lama atau tampilkan sebagai legacy.
- `apps/rekrutmen/public/admin.html` dan `apps/rekrutmen/server.js` hanya referensi read-only untuk pola login/workspace; tidak menjadi target perubahan KOL.
- Migration baru di `supabase/migrations/` untuk kolom/constraints/RPC/view, hanya setelah audit schema live dan rencana rollback.
- Tests terkait form, route admin, auth/role guard, API, dan migration; konfigurasi build/deploy hanya jika pemetaan domain/build membuktikan perlu.

## Tahapan implementasi setelah plan disetujui

1. Audit route/build/domain sebenar, auth session mapping, status KOL + policy eligibility, Admin actions dan view calendar, data tanggal lama, serta status booking live. Catat baseline; jangan ubah data produksi.
2. Tetapkan policy: eligibility dan transisi status; jam/slot operasional dan zona waktu; definisi booking aktif, pembatalan/reschedule, serta apakah identitas creator ditampilkan di kalender umum.
3. Rancang migration additive dan RPC atomik; cek histori, konflik hari, constraints/index, izin role, dan rollback sebelum menjalankan apa pun di DB.
4. Implement API/auth/eligibility/calendar/booking; uji otorisasi lintas KOL, konflik paralel, expired session, dan consent.
5. Implement UI Link A, Link B, Portal KOL, dan route admin mandiri `/admin`; update Data KOL dan workspace Visit agar tetap sinkron. Admin mandiri serta Admin utama memakai API/sumber data yang sama.
6. Jalankan unit/integration tests, migration checks, typecheck/build app KOL + Admin + auth server, lalu browser E2E untuk seluruh alur publik dan admin di desktop/mobile.
7. Review git diff terhadap baseline dan perubahan kerja lain; selective stage/deploy hanya file dan aplikasi yang terkait, setelah persetujuan rilis.
8. Setelah deploy yang disetujui, verifikasi halaman nyata `/`, `/visit`, `/admin`, akses tanpa login (ditolak/diarahkan), API response, booking sample yang aman, tanggal terisi terlihat pada UI, dan log tanpa PII/secret. Simpan screenshot/hasil sebagai preview efek.

## Kriteria penerimaan dan pengujian

- `https://kolmarketing.yumme.id/` menjalankan Link A dan tidak meminta tanggal/jam; pendaftar tersimpan dan tampil di Data KOL.
- `https://kolmarketing.yumme.id/admin` menampilkan admin workspace setelah login; tanpa login/role Admin API menolak akses, creator login biasa tidak memperoleh data admin, dan session kadaluarsa ditangani aman.
- Admin mandiri dapat meninjau pendaftar, memberi/mencabut eligibility sesuai aturan, dan mengelola status kunjungan; hasilnya sama dengan Admin KOL utama dan Portal KOL.
- Pesan review benar, countdown terlihat sampai 0, lalu Portal KOL terbuka.
- Pendaftar belum eligible ditolak oleh server saat memanggil API booking langsung; KOL eligible dapat membuka satu Link B yang sama.
- Kalender menampilkan tanggal terisi; tanggal terisi nonaktif. Dua booking bersamaan untuk tanggal sama menghasilkan tepat satu sukses dan satu konflik, tanpa duplikasi.
- Creator tidak dapat booking atas nama KOL lain; jadwal personal tidak bocor; Admin berwenang dapat melihat detail yang dibutuhkan.
- Tanggal, jam, consent, versi persetujuan, dan timestamp tersimpan dan konsisten pada Portal KOL/Admin Visit; validasi WIB benar.
- Booking batal membebaskan tanggal hanya sesuai aturan; booking historis tetap terlindungi. Retry/refresh tidak membuat booking kedua.
- Form B success copy dan countdown 15 detik bekerja; error/login/refresh tidak kehilangan keadaan secara membingungkan.
- Build, typecheck, tes dan verifikasi deployment dilakukan sebelum klaim selesai.

## Risiko / keputusan yang perlu dikunci saat implementasi

- **Eligibility:** status pipeline saat ini mencakup Potential, Belum Dihubungi, Sudah Dihubungi, Negotiation, Scheduled Visit, Collaboration, Completed, Rejected. Tetapkan secara eksplisit mana yang eligible; jangan menyimpulkan dari label saja.
- **Login mapping:** beberapa profil KOL mungkin belum terhubung ke Google user atau email berbeda. Tentukan proses linking aman tanpa mengizinkan klaim profil oleh pihak lain.
- **Jam:** pilih jam operasional/slot dari konfigurasi atau data Admin, bukan hardcode. Satu hari hanya satu KOL sesuai aturan pengguna, sehingga jam tidak membuka slot KOL kedua.
- **Booking lama:** ada data dan invitations per-KOL saat ini. Migrasi ke shared Link B harus mempertahankan booking, histori, dan kemampuan audit; definisikan perlakuan terhadap data legacy `application_data.visitDate`.
- **Kalender publik:** menampilkan nama semua KOL bisa membuka informasi kunjungan. Default rencana: publik hanya melihat tanggal tersedia/terisi; Admin melihat identitas.
- **Domain/deploy:** HTTP 200 di `/visit`/`/admin` tidak menjamin route benar atau aman; pastikan source route, hosting rewrite, bundle production, auth callback aktual, dan akses API unauthenticated ditolak.
- **Admin standalone:** auth recruitment dibangun untuk HRD dan tidak otomatis menjadi otorisasi KOL. Tetapkan mekanisme SSO/session yang tervalidasi server-side serta mapping permission Admin; jangan membuat login PIN/secret baru atau menyimpan token statis sebagai jalan pintas.
- **Perubahan kerja lain:** working tree VPS dirty, termasuk auth service dan `apps/kolmarketing` artifact; isolasi diff task ini dan jangan deploy/build yang menimpa hasil lain tanpa koordinasi.
