# Djiwa Tentram VPS Deployment Workflow

Dokumen ini adalah konteks operasional untuk agent dan developer yang mengubah atau men-deploy project Djiwa Tentram.

## Topologi runtime

Untuk deployment saat ini, semua frontend (termasuk Djiwa Pay) disajikan dari VPS `vps-djiwa-tentram` (SSH alias di `~/.ssh/config`; host `ubuntu`). Verifikasi kecocokan VPS Helipod dengan host ini sebelum memakai MCP (lihat bagian Helipod MCP). Auth, backend, dan database berada pada runtime/VPS terpisah. Browser tetap memakai pay bridge same-origin yang diproxy Nginx.

| Komponen | Runtime | Lokasi / endpoint |
| --- | --- | --- |
| Repository | Monorepo | `/opt/djiwatentramapp` |
| Djiwa Pay frontend | Static Vite build | `/opt/djiwatentramapp/apps/djiwapay/dist` |
| Auth dan backend API | Bun + Better Auth | VPS backend, `better-auth.service`, port lokal `3001` |
| Database | PostgreSQL terpisah | Connection string hanya melalui environment service backend |
| Public frontend | Nginx + TLS | `https://pay.djiwatentram.web.id/` |
| Pay bridge API | Nginx proxy ke auth-server | `/api/pay-bridge/*` |

Jangan menaruh IP private/public, password, API key, connection string, atau token di repository. Detail akses harus berasal dari environment file/service manager di server.

## Peta app dan domain

| App | Domain | Webroot di VPS |
| --- | --- | --- |
| pos | pos.djiwatentram.web.id | `/opt/djiwatentramapp/apps/pos/dist` |
| karyawan | karyawan.djiwatentram.web.id | `/opt/djiwatentramapp/apps/karyawan/dist` |
| customer | djiwatentram.web.id | `/opt/djiwatentramapp/apps/customer/dist` |
| admin | admin.djiwatentram.web.id | `/opt/djiwatentramapp/apps/admin/dist` |
| djiwapay | pay.djiwatentram.web.id (utama) dan djiwapay.web.id (alias; konten identik, sertifikat TLS terpisah) | `/opt/djiwatentramapp/apps/djiwapay/dist` |

### Inventaris app lain (live-probe 2026-11-02, dari luar; belum diverifikasi di Nginx karena SSH mati)

| App (`apps/`) | Domain live (HTTP 200) | Catatan |
| --- | --- | --- |
| merchandise | merchandise.djiwatentram.web.id | v0.2.550 |
| b2b | b2b.djiwatentram.web.id | v0.2.548 |
| ordermieyamin | ordermieyamin.djiwatentram.web.id | v0.2.551 |
| investor | investor.djiwatentram.web.id | tanpa version.json |
| booking | booking.djiwatentram.web.id | dipakai di kode (CORS, link) |
| rekrutmen | rekrutmen.djiwatentram.web.id | |
| linkbio | linkbio.djiwatentram.web.id | |
| kol | **kol.djiwatentram.web.id** | lihat ketidaksesuaian di bawah |
| 500kopitasik | **kopitasik.djiwatentram.web.id** | lihat ketidaksesuaian di bawah |
| yumme | belum ada domain live | `yumme.djiwatentram.web.id` tidak punya vhost/TLS |
| auth-server | api.djiwatentram.web.id, supabase.djiwatentram.web.id | root 404 itu normal (API) |

Versi live berbeda per app (pos 0.2.570, customer 0.2.576, admin 0.2.556, karyawan 0.2.554); wajar bila tiap app di-deploy terpisah, tetapi cek `version.json` sebelum menganggap sebuah app sudah ter-update.

### Ketidaksesuaian kode vs domain live (perlu keputusan pemilik)

1. **KOL**: kode (`scripts/deploy-kolmarketing.sh`, CORS di `apps/auth-server/.env.example` dan `src/kol-portal.ts`, link undangan di Edge Function `kol-portal-admin`, `apps/admin` KolPortalAdmin) memakai `kolmarketing.djiwatentram.web.id`, tetapi domain itu **tidak bisa dibuka** (tidak ada vhost/sertifikat; sertifikat hanya mencakup `kol.djiwatentram.web.id`). App KOL live ada di `kol.djiwatentram.web.id`. Akibatnya link undangan creator mengarah ke domain mati, dan Origin `kol.` bisa ditolak CORS. Pilih satu: buat vhost+sertifikat `kolmarketing`, atau ganti semua referensi ke `kol`.
2. **500kopitasik**: canonical/og di `apps/500kopitasik/index.html` dan CORS memakai `500kopitasik.djiwatentram.web.id` (tidak bisa dibuka), sedangkan app live di `kopitasik.djiwatentram.web.id`.
3. **Djiwa Pay**: dua domain valid (lihat tabel utama).
4. `deploy-vps.sh` hanya menangani pos, karyawan, customer, admin, djiwapay. App lain di-deploy lewat script/prosedur masing-masing (mis. `deploy-kolmarketing.sh` ke `/var/www/<domain>`), bukan dari `apps/<app>/dist`.

Status terverifikasi 2026-11-02 (probe luar + SSH + `nginx -T`): semua domain di atas HTTP 200 kecuali `kolmarketing`, `500kopitasik`, `yumme` (tidak ada vhost). Nginx server: `kol.djiwatentram.web.id` -> `/opt/djiwatentramapp/apps/kolmarketing/dist`; `kopitasik.djiwatentram.web.id` -> `apps/500kopitasik/dist`; `pay.djiwatentram.web.id` dan `djiwapay.web.id` -> `apps/djiwapay/dist`; `rekrutmen` -> `apps/booking/dist`; `api`/`auth.djiwatentram.web.id` -> auth-server.

### Kondisi checkout produksi (2026-11-02) - JANGAN `git pull`/`reset`

`/opt/djiwatentramapp` ada di commit snapshot `76fd922b3`, **473 commit di belakang dan 3 di depan `origin/main`** (sudah diverge), dengan 12 file tracked termodifikasi (admin/customer djiwa-run, saldo, run, komunitas, `supabase/functions/djiwa-run`) dan ~119 entri untracked (backup dist, `.worktrees`, dll). Sebelum deploy dari `main`: audit `git diff`, putuskan commit/stash perubahan tersebut, lalu pakai worktree rilis bersih (lihat Workflow release).

### Akses SSH dan fail2ban

Gejala "Connection refused" pada port 22 sementara web hidup = IP klien di-ban `fail2ban` (jail `sshd`), bukan firewall Helipod. Dari konsol web Helipod: `sudo fail2ban-client status sshd` lalu `sudo fail2ban-client set sshd unbanip <IP>`. IP kerja yang diizinkan permanen ada di `ignoreip` pada `/etc/fail2ban/jail.local` (IP publik Mac bisa berubah; tambahkan bila perlu, backup `jail.local.bak-*` dibuat sebelum edit).

Edge Function `customer-auth` dan `djiwa-run` ikut ter-deploy bersama `customer`/`all`.

## Jalur cepat deploy (satu app)

```bash
# 1. dari lokal: pastikan commit sudah di origin/main
ssh vps-djiwa-tentram
cd /opt/djiwatentramapp && git status --short   # jika kotor: STOP, minta persetujuan
# 2. setelah checkout bersih & terbaru (lihat aturan keamanan):
./scripts/deploy-vps.sh pos        # pos|karyawan|customer|admin|djiwapay|all
# 3. verifikasi
curl -fsS https://pos.djiwatentram.web.id/version.json
curl -sS -o /dev/null -w '%{http_code}\n' https://pos.djiwatentram.web.id/
```

Script harus dijalankan dari `/opt/djiwatentramapp`; ia menolak lokasi lain.

## Helipod MCP

Endpoint: `https://api.helipod.io/mcp`. Otorisasi lewat `/mcp` di sesi interaktif (sesi non-interaktif tidak bisa OAuth). Gunakan skill `helipod` / `helipod-vps`.

1. List VPS di akun Helipod, lalu cocokkan dengan project ini: IP `43.173.20.62` / alias `vps-djiwa-tentram`. VPS lain di akun yang sama milik project lain; jangan disentuh.
2. Gunakan MCP untuk status, power, snapshot (ambil snapshot sebelum perubahan besar), dan firewall (pastikan 22, 80, 443 tetap terbuka).
3. Aksi berbayar atau destruktif (reinstall, hapus, resize, renew, ubah firewall) wajib konfirmasi eksplisit pengguna.
4. Deploy kode tetap lewat SSH + `scripts/deploy-vps.sh`. Helipod MCP tidak menggantikan runbook ini.
5. Jangan menulis token/API key Helipod ke repository.

Troubleshooting situs tidak terbuka: cek DNS -> status VPS (Helipod) -> `systemctl status nginx` -> `sudo nginx -t` -> sertifikat TLS -> `dist/index.html` ada -> aset JS/CSS 200 -> `version.json`.

## Source of truth

- Frontend: `apps/djiwapay/`
- Auth/backend: `apps/auth-server/`
- Database migrations dan SQL: migration directory yang digunakan repository, saat ini `supabase/migrations/`
- Edge/integration functions: `supabase/functions/`
- Nginx production frontend: `/etc/nginx/sites-enabled/djiwapay.conf`
- Auth systemd unit backend: `apps/auth-server/better-auth.service` pada VPS backend
- IAK secrets: Supabase Edge Function secrets `IAK_USERNAME`, `IAK_API_KEY`, optional `IAK_BASE_URL`

`AGENTS.md` tetap menjadi instruksi utama untuk perubahan backend. Sebelum menjalankan migration, pastikan targetnya adalah PostgreSQL production pada VPS database/backend yang benar, bukan project Supabase cloud yang berbeda.

## Aturan keamanan repository

- Jangan pernah menyalin credential dari screenshot, terminal output, backup, atau chat ke file Markdown.
- Credential yang pernah terlihat di luar secret manager dianggap compromised dan harus dirotasi.
- Jangan commit `.env`, `/etc/djiwatentramapp/*.env`, backup, atau dump database.
- Worktree production dapat berisi perubahan pengguna. Jangan menjalankan `reset --hard`, `checkout --`, `git clean`, atau `git pull` di sana tanpa persetujuan eksplisit.
- Untuk release, gunakan worktree bersih berbasis `origin/main`.

## Workflow release standar

### 1. Audit dan branch release

```bash
git fetch origin main
git worktree add -b release/<tanggal> /home/ubuntu/worktrees/<release> origin/main
git merge --no-ff <feature-branch> -m "merge: <ringkasan>"
```

Jalankan verifikasi dari worktree release:

```bash
bun install --frozen-lockfile
bun test apps/djiwapay/test/djiwa-pay-checkout.test.ts
bun run --cwd apps/djiwapay check-types
bun run --cwd apps/djiwapay build
cd apps/auth-server
bun test
bun x tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/index.ts
```

Push hanya setelah merge dan verifikasi:

```bash
git push origin HEAD:main
```

### 2. Deploy frontend ke VPS

Backup build yang sedang live sebelum mengganti file:

```bash
release_stamp=$(date +%Y%m%d-%H%M%S)
backup_dir="/opt/backups/djiwapay/${release_stamp}"
sudo mkdir -p "$backup_dir"
sudo cp -a /opt/djiwatentramapp/apps/djiwapay/dist/. "$backup_dir/"
sudo rsync -a --delete /home/ubuntu/worktrees/<release>/apps/djiwapay/dist/ \
  /opt/djiwatentramapp/apps/djiwapay/dist/
sudo chown -R www-data:www-data /opt/djiwatentramapp/apps/djiwapay/dist
sudo nginx -t
sudo systemctl reload nginx
```

Health check:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://pay.djiwatentram.web.id/
curl -sS -o /tmp/pay-bridge.json -w '%{http_code}\n' \
  -X POST https://pay.djiwatentram.web.id/api/pay-bridge/wallet \
  -H 'Content-Type: application/json' -d '{"action":"get"}'
```

Request tanpa session harus ditolak dengan `401`; jangan memakai credential customer untuk smoke test.

### 3. Deploy auth/backend (VPS backend terpisah)

Auth berjalan sebagai service systemd:

```bash
sudo systemctl restart better-auth.service
systemctl is-active better-auth.service
journalctl -u better-auth.service -n 80 --no-pager
```

Sebelum restart, compile source dari checkout yang akan dijalankan. Pastikan `WorkingDirectory`, `EnvironmentFile`, dan `ExecStart` pada unit tidak berubah tanpa alasan.

### 4. Database migration

Database berada pada runtime/VPS terpisah dari frontend dan dapat terpisah dari proses backend. Migration harus dijalankan terhadap database production yang dipakai `better-auth.service`, melalui jalur akses internal yang disetujui operator.

Prosedur aman:

1. Pastikan nama database/host dari environment service, tanpa menulis nilainya ke log atau dokumentasi.
2. Ambil backup/snapshot database sesuai prosedur VPS.
3. Review SQL migration dan urutan timestamp.
4. Jalankan migration dengan tool PostgreSQL yang disetujui operator, misalnya `psql` memakai environment variable—bukan password inline.
5. Verifikasi tabel, constraint, index, dan function yang berubah.
6. Restart backend hanya bila migration membutuhkan reload atau perubahan runtime.

Jangan menjalankan `supabase db push` ke cloud secara otomatis. Gunakan Supabase CLI hanya bila runtime database memang terhubung ke project Supabase yang benar dan operator sudah menyediakan access token melalui secret manager.

## Djiwa Pay checkout notes

- `apps/djiwapay` memakai `/api/pay-bridge/*` sebagai same-origin backend boundary.
- Checkout PPOB wallet menggunakan hold/capture/release dan harus idempotent berdasarkan reference transaction.
- Checkout QRIS menyimpan draft di `sessionStorage` agar dapat kembali setelah redirect provider.
- Invoice QRIS menyimpan `invoiceId`; status dapat diperiksa melalui `/api/pay-bridge/ppob/status`.
- Top up Djiwa Pay menyimpan `invoiceId` bila provider mengembalikannya; status dapat diperiksa melalui action `topup-status` pada `/api/pay-bridge/wallet`.
- Migration `20261022193605_customer_wallet_internal_transfer.sql` menambahkan transfer store credit atomik antar customer; migration harus diterapkan ke database VPS sebelum action `transfer` digunakan.
- Transfer internal bukan withdraw/cash-out; fitur payout eksternal tetap memerlukan provider payout dan verifikasi rekening.
- Status `pending` tidak boleh dianggap berhasil dan tombol bayar harus terkunci sampai provider memberi hasil final.
- Catalog PPOB berasal dari provider IAK; jangan hardcode harga produk pada frontend.
- Flow postpaid menggunakan inquiry-first: PLN/PDAM wajib mengirim nomor pelanggan, menampilkan identitas/tagihan/biaya admin, lalu baru mengizinkan payment.
- IAK credentials tidak pernah masuk browser atau auth-server environment; auth-server hanya memanggil `IAK_PPOB_URL` menuju Edge Function proxy.
- Aktivasi produksi IAK memerlukan callback URL dan IP allowlist provider. Tanpa secret/callback/allowlist valid, endpoint tetap safe unavailable/pending.

## Rollback frontend

Jika health check gagal setelah deploy:

```bash
sudo rsync -a --delete /opt/backups/djiwapay/<timestamp>/ \
  /opt/djiwatentramapp/apps/djiwapay/dist/
sudo chown -R www-data:www-data /opt/djiwatentramapp/apps/djiwapay/dist
sudo nginx -t && sudo systemctl reload nginx
```

Untuk backend, hentikan perubahan hanya setelah melihat status service dan log. Jangan memulihkan source dengan command destructive pada worktree yang memiliki perubahan pengguna.

## Checklist handoff agent

- [ ] Target VPS dan service sudah dikonfirmasi.
- [ ] Tidak ada credential yang ditulis ke output atau file repository.
- [ ] Worktree release bersih dan berasal dari `origin/main`.
- [ ] Test, typecheck, dan production build lulus.
- [ ] Database migration ditinjau dan dijalankan pada database yang benar.
- [ ] Frontend dibackup sebelum `rsync --delete`.
- [ ] `nginx -t`, service status, HTTP 200 frontend, dan HTTP 401 tanpa session sudah diverifikasi.
- [ ] Commit release dan lokasi backup dicatat pada handoff.

### Canonical host `www` -> apex (2026-11-03)

Gejala: Google login di `djiwatentram.web.id/masuk` menampilkan "Load failed" (Safari iOS), kadang `state_mismatch`. Penyebab: `www.djiwatentram.web.id` menyajikan app langsung, sedangkan CORS/cookie/state OAuth Better Auth hanya memercayai origin apex, sehingga preflight `OPTIONS /api/auth/sign-in/social` dari origin `www` tidak punya `Access-Control-Allow-Origin`.

Perbaikan: di `/etc/nginx/sites-available/djiwatentram.conf` (server block customer, 443) ada `if ($host = www.djiwatentram.web.id) { return 301 https://djiwatentram.web.id$request_uri; }`. Jangan hapus saat edit/regenerasi vhost. Verifikasi: `curl -sI https://www.djiwatentram.web.id/masuk` harus 301 ke apex.

Catatan terpisah: proxy ke `*.workers.dev` (customer-community/stories) sesekali mencatat `connect() ... [IPv6] Network is unreachable` di error.log karena VPS tanpa IPv6; nginx jatuh ke IPv4 sehingga hanya menambah latency.

## Auto-deploy GitHub Actions (2026-11-03)

Push ke `main` -> `.github/workflows/deploy-vps.yml` menentukan app yang berubah dari path file lalu SSH ke VPS.

| Path berubah | App yang di-deploy |
| --- | --- |
| `apps/pos/**`, `apps/karyawan/**`, `apps/admin/**` | app terkait |
| `apps/customer/**`, `supabase/functions/{customer-auth,djiwa-run}/**` | `customer` (+ edge function) |
| `apps/djiwapay/**`, `packages/djiwapay-*` | `djiwapay` |
| `packages/**` lain, `package.json`, `bun.lock`, `turbo.json` | semua (5 app) |

Manual: Actions -> "Deploy to VPS" -> Run workflow, isi `apps` (`all` atau `pos,admin`). Migrasi SQL TIDAK ikut auto-deploy.

Mekanisme di VPS:
- Key SSH khusus (`github-actions-djiwa-deploy`) di `~ubuntu/.ssh/authorized_keys` dengan `restrict,command="/usr/local/sbin/djiwa-ci-deploy"`; ia hanya bisa menjalankan `<sha> <apps>`.
- Wrapper mengambil `scripts/ci-deploy.sh` dari commit `<sha>` (tidak perlu update manual), memakai `flock`, cek disk >= 3G.
- Build di worktree bersih `/opt/djiwa-release` (`.env` disalin dari checkout produksi), bukan di checkout produksi yang kotor. Setelah build sukses, `apps/<app>/dist` ditukar atomik; bila verifikasi HTTP gagal, dist lama dikembalikan.

GitHub secrets yang diperlukan: `VPS_SSH_KEY` (private key `~/.ssh/djiwa_ci_deploy` di Mac), `VPS_HOST` (`43.173.20.62`), `VPS_KNOWN_HOSTS` (output `ssh-keyscan -t ed25519 43.173.20.62`).
Wrapper (`/usr/local/sbin/djiwa-ci-deploy`) dipasang manual sekali; bila perlu diubah, edit lewat SSH admin.

## CLI developer `djiwa`

`scripts/djiwa <perintah>` (atau `bun run djiwa <perintah>`) — satu pintu untuk semua app, auth, DB, edge function, dan VPS. Jalan di macOS (bash 3.2) dan Linux. Jalankan `scripts/djiwa help` untuk daftar lengkap.

| Kelompok | Perintah |
| --- | --- |
| Eksplorasi | `apps`, `find <regex> [path...]`, `where <nama>`, `fn list`, `migrations [n]` |
| Develop | `dev <app>`, `build <app\|all>`, `check <app\|all>`, `test [app]`, `verify <app>`, `auth dev` |
| Database | `db new <nama>`, `db sql "<SELECT>"` (read-only), `db tables [pola]`, `db describe <tabel>`, `fn new <nama>`, `fn logs <nama>` |
| Produksi | `status`, `deploy <app[,app]\|all>`, `logs <nginx\|auth\|edge\|db> [n]`, `vps <perintah>` |

Catatan keamanan: `db sql` berjalan dalam transaksi `READ ONLY` dan menolak `commit/rollback/begin/\meta`; perubahan skema selalu lewat file migrasi (`db new`) yang ditinjau dulu. `deploy` memakai key CI terbatas dan hanya men-deploy commit HEAD yang sudah ada di `origin/main`.

## Insiden hilangnya data login (2026-11-04)

Gejala: admin/customer menampilkan pelanggan tanpa riwayat; login Google membuat pelanggan baru yang kosong. Penyebab: `public."user"` terhapus massal (~790 baris) antara 2026-11-02 dan 2026-11-03; `account`, `session`, `investor_*`, `customer_google_calendar_*` ikut terhapus lewat `ON DELETE CASCADE`. `pos.customers` (data bisnis) tidak terdampak. Pelaku penghapusan belum teridentifikasi.

Pemulihan: dari `/opt/backups/db-20261027-0040/postgres.dump` dipulihkan 730 user, 737 akun, 1 investor lead, 1 membership (hanya menambah baris yang belum ada). Backup sebelum pemulihan: `/opt/backups/auth-restore-*/pre-restore.dump`. Tabel staging: schema `recon_stage` (`dump_*`).

Pencegahan:
- Migrasi `20261104000000_betterauth_adopt_existing_customer.sql`: trigger BEFORE INSERT pada `public."user"` memakai ulang `source_id` pelanggan yang emailnya sama (hanya email terverifikasi) sehingga pelanggan yang daftar setelah 27 Okt tinggal login ulang dan datanya kembali.
- Backup harian 03:15: `/usr/local/sbin/djiwa-auth-backup` (sumber `scripts/backup-auth-tables.sh`, cron `/etc/cron.d/djiwa-auth-backup`, retensi 14 hari, tidak memangkas bila user < 50% pelanggan).
- `scripts/djiwa status` memperingatkan bila jumlah user jauh di bawah pelanggan.

Tambahan 2026-11-04 (saldo Rp 0): `pos.customer_wallets` ikut kosong (tinggal 1 baris) dan `pos.customer_wallet_topups` kosong, sehingga Saldo di admin/customer 0 walau `customer_wallet_ledger` utuh. Dipulihkan dari dump 27 Okt: 394 dompet + 137 top-up, lalu mutasi ledger setelah dump diterapkan (hanya 1 pelanggan). Hasil: 351 pelanggan bersaldo, total Rp 852.160, 0 selisih terhadap `balance_after` ledger. Backup sebelum pemulihan: `/opt/backups/auth-restore-*/pre-wallet-restore.dump`. Backup harian kini juga mencakup tabel dompet.

### Pengguna lama di `www` terjebak "Load failed" (2026-11-04)

Setelah `www` di-redirect ke apex, pengguna yang sebelumnya memakai `www.djiwatentram.web.id` (PWA/tab lama) tetap memegang service worker dan build lama. Build lama memanggil `api.djiwatentram.web.id/v1/auth` lintas origin dari origin `www` (diblok CORS), dan `sw.js` di `www` ikut ter-redirect sehingga browser tidak bisa memperbaruinya (redirect pada skrip service worker dilarang).

Perbaikan di `/etc/nginx/sites-available/djiwatentram.conf`:
- `map "$host$uri" $djiwa_www_redirect`: redirect 301 www -> apex untuk semua path **kecuali** `/sw.js`.
- `location = /sw.js`: bila host `www`, sajikan service worker pembersih (hapus semua cache, daftar keluar, arahkan klien ke `https://djiwatentram.web.id/`); host apex tetap menyajikan `sw.js` Workbox.

Verifikasi: `curl -s https://www.djiwatentram.web.id/sw.js` harus berisi kode pembersih (200), `curl -sI https://www.djiwatentram.web.id/masuk` harus 301 ke apex. Setelah semua pengguna lama berpindah (lihat log nginx: tidak ada lagi request ber-Referer `www`), kode pembersih boleh dipertahankan; jangan dihapus tanpa memastikan itu.

Catatan deploy: CI membangun lewat runtime Bun (shim `node` di `/opt/djiwa-release/.node-shim`) karena Node 18 di VPS terlalu lama untuk `unplugin@3`.
