# Rencana: apps/manager (manager.djiwatentram.web.id)

Sumber desain: `prototypes/manager-panel/v20.html` (+ `playbook-data.js`, `docs-data.js`, `README.md`).

## Yang sudah dibuat (prototipe v20)
Panel untuk **Manager** dan **Supervisor/Purchasing**; Owner bekerja di `apps/admin`.
- Halaman pertama Playbook + Dokumen (15 bab SOP, 19 templat PDF), tidak wajib.
- Tugas hari ini dibuat AI dari data nyata; Manager/Supervisor/Owner bisa menambah tugas (file, link, foto, video); tanpa kanban/delegasi.
- Dashboard + monitor realtime, Keuangan (pengeluaran saja; pemasukan datang dari pos/customer), Pengeluaran + scan struk AI (setara bot Telegram), Stok & Opname (konversi karton→pcs, ★ Penting), Tim & Gaji (slip), Pembelian/PO, Laporan ke atasan (editor + inbox owner), Akun & persetujuan, Format, AI.
- Login Google (Better Auth) + pilih peran, disetujui Owner di admin. Mobile: bottom nav.

## Prinsip integrasi
1. Satu data: semua tabel di Postgres yang sama dengan admin/pos/karyawan/customer; tidak ada salinan.
2. Satu pintu: manager hanya bicara ke `auth-server` (`/api/manager/*`), yang memeriksa sesi Better Auth + keanggotaan `mgr_memberships` + peran. Tabel `mgr_*` tertutup untuk anon/authenticated (RLS + revoke), pola yang sama dengan investor.
3. AI hanya membuat tugas dari sinyal data deterministik (`source_ref` wajib); tidak boleh menyetujui/membayar/mengirim PO.
4. Satu layanan struk: app dan bot Telegram memakai tabel draf/kategori/templat yang sama.

## Fase
| Fase | Isi | Status |
|---|---|---|
| 1 | Migrasi fondasi `mgr_*` (akses, tugas, komentar, laporan); route auth-server; scaffold apps/manager (login Google, pilih peran, menunggu persetujuan, Tugas, Laporan, Playbook dasar); persetujuan akun di apps/admin | selesai |
| 2 | Seed Playbook/Dokumen dari prototipe + editor Owner di admin; unggah lampiran (Storage) | selesai |
| 3 | AI harian `manager-daily-plan` (Helipod `qwen3.7-flash`, validasi server) + pemicu event realtime | selesai |
| 4 | Pengeluaran + OCR struk bersama (app + bot, migrasi draf lokal bot ke DB), kategori/templat | selesai |
| 5 | Stok & Opname (konversi satuan, kebijakan, log), integrasi stok pos | selesai |
| 6 | Tim & Gaji (aturan, penyesuaian, slip → karyawan), Keuangan/analitik | selesai |
| 7 | Deploy: `ship-artifacts.sh manager`, vhost nginx, env build, auth-server redeploy | selesai |

Catatan implementasi: migrasi `20261114100000_manager_foundation.sql`, `20261114110000_manager_playbook_seed.sql`, dan `20261114120000_manager_expense_settings.sql` sudah diterapkan ke database production (15 bab, 19 dokumen, 13 kategori, 5 pengaturan). Lihat bagian "Verifikasi" di bawah.

## Keputusan terbuka (default dipakai sampai dijawab)
Periode gaji (bulanan vs 2-mingguan; trigger dan `generate-payroll` belum sejalan); opname Final membuat jurnal?; perubahan aturan Manager perlu persetujuan Owner?; slip perlu persetujuan Owner?; ambang pengeluaran (Rp1.000.000 / Rp100.000); toleransi opname; uji kualitas OCR dengan 20–30 struk asli sebelum mengunci model.

## Risiko
Migrasi produksi hanya aditif (tabel baru). Fase 1 tidak mengubah payroll/order/stok. Deploy butuh `~/.djiwa-build/manager.env`, entri `manager` di `ship-artifacts.sh` dan vhost baru di VPS.

## Verifikasi
- Migrasi (aditif) diterapkan ke PostgreSQL production di VPS `vps-djiwa-tentram` lewat `psql` di container `supabase-db`, masing-masing dalam satu transaksi dengan `ON_ERROR_STOP=1`. Backup pra-migrasi (`pg_dump -Fc`) disimpan di build machine (`~/.djiwa-build/backups/`), bukan di VPS yang disknya penuh.
- Objek terverifikasi: 10 tabel `mgr_*`, 15 bab Playbook, 19 dokumen, 13 kategori pengeluaran, 5 pengaturan awal, bucket `manager-uploads`.
- Query dan tipe parameter yang dipakai modul (dashboard, pengeluaran, laporan, stok, payroll, fungsi admin) diuji langsung terhadap skema production.
- `apps/manager` lolos `check-types` dan `vite build`; `apps/auth-server` tidak menambah error TypeScript baru.
- Yang belum bisa dibuktikan dari build/HTTP 200: login Google end-to-end, OCR struk dengan kunci Helipod asli, dan penerimaan artifact oleh timer VPS. Catat hasil uji manual setelah deploy.

### Hasil deploy (14 Nov 2026)

- Artifact: `manager` dan `admin` dibangun di build machine lewat `scripts/ship-artifacts.sh`, lalu diterbitkan timer `djiwa-artifact-deploy` di VPS (log: `manager: OK`). `https://manager.djiwatentram.web.id/version.json` menyajikan commit yang sama dengan `origin/main`.
- nginx: vhost `manager.conf` aktif, sertifikat `manager.djiwatentram.web.id` terbit (berlaku sampai 12 Feb 2027), root HTTPS 200.
- auth-server: sumber `manager-*.ts` disalin ke checkout production dan `better-auth.service` di-restart (log: `Auth server running on http://localhost:3001`). Origin `https://manager.djiwatentram.web.id` ditambahkan ke daftar origin Better Auth.
- Live tanpa sesi: seluruh `/api/manager/*` mengembalikan 401, `/api/admin-manager/*` 401 tanpa token staf, preflight CORS dari origin manager 204 dengan `POST,GET,PUT,PATCH,OPTIONS`, dan `sign-in/social` hanya menerima callback origin tepercaya (origin lain 403).
- Uji route + SQL sungguhan: harness lokal (`.runtime`, tidak di-commit) menjalankan handler Hono asli terhadap database production lewat tunnel SSH dengan sesi Better Auth tiruan — 58 pemeriksaan lulus: baca Manager (dashboard, keuangan, pengeluaran, stok+riwayat, tim+payroll, PO, dokumen, playbook, pengaturan, tugas, laporan), gating peran (Supervisor tidak boleh `finance`/approve/tinjau izin), pengeluaran Supervisor di bawah batas langsung tercatat di `pos.financial_transactions`, di atas batas masuk `pending_approval` lalu disetujui Manager, jalur tolak, scan struk tanpa kunci → `AI_UNAVAILABLE` (foto tetap tersimpan), PO, tugas+komentar, laporan, dan simpan stok. Semua baris uji (`e2e-*`) dihapus lagi; status stok bahan yang tersentuh dikembalikan ke nilai semula.
- AI harian sudah berjalan di production: `runDailyPlan` membuat 16 tugas `source=ai` untuk 14 Nov (idempoten, bentrok unik tidak menggandakan).
- Sisa uji manual yang butuh akun/kunci asli: login Google sampai dashboard Manager, dan OCR struk setelah `HELIPOD_AI_KEY` diisi di `better-auth.service`.
