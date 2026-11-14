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
| 1 | Migrasi fondasi `mgr_*` (akses, tugas, komentar, laporan); route auth-server; scaffold apps/manager (login Google, pilih peran, menunggu persetujuan, Tugas, Laporan, Playbook dasar); persetujuan akun di apps/admin | dikerjakan sekarang |
| 2 | Seed Playbook/Dokumen dari prototipe + editor Owner di admin; unggah lampiran (Storage) | berikut |
| 3 | AI harian `manager-daily-plan` (Helipod `qwen3.7-flash`, validasi server) + pemicu event realtime | berikut |
| 4 | Pengeluaran + OCR struk bersama (app + bot, migrasi draf lokal bot ke DB), kategori/templat | berikut |
| 5 | Stok & Opname (konversi satuan, kebijakan, log), integrasi stok pos | berikut |
| 6 | Tim & Gaji (aturan, penyesuaian, slip → karyawan), Keuangan/analitik | berikut |
| 7 | Deploy: `ship-artifacts.sh manager`, vhost nginx, env build, auth-server redeploy | berikut |

## Keputusan terbuka (default dipakai sampai dijawab)
Periode gaji (bulanan vs 2-mingguan; trigger dan `generate-payroll` belum sejalan); opname Final membuat jurnal?; perubahan aturan Manager perlu persetujuan Owner?; slip perlu persetujuan Owner?; ambang pengeluaran (Rp1.000.000 / Rp100.000); toleransi opname; uji kualitas OCR dengan 20–30 struk asli sebelum mengunci model.

## Risiko
Migrasi produksi hanya aditif (tabel baru). Fase 1 tidak mengubah payroll/order/stok. Deploy butuh `~/.djiwa-build/manager.env`, entri `manager` di `ship-artifacts.sh` dan vhost baru di VPS.
