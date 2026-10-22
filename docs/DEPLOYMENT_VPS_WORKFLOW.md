# Djiwa Tentram VPS Deployment Workflow

Dokumen ini adalah konteks operasional untuk agent dan developer yang mengubah atau men-deploy project Djiwa Tentram.

## Topologi runtime

Untuk deployment saat ini, frontend Djiwa Pay disajikan dari VPS frontend/Helipod. Auth, backend, dan database berada pada runtime/VPS terpisah. Browser tetap memakai pay bridge same-origin yang diproxy Nginx.

| Komponen | Runtime | Lokasi / endpoint |
| --- | --- | --- |
| Repository | Monorepo | `/opt/djiwatentramapp` |
| Djiwa Pay frontend | Static Vite build | `/opt/djiwatentramapp/apps/djiwapay/dist` |
| Auth dan backend API | Bun + Better Auth | VPS backend, `better-auth.service`, port lokal `3001` |
| Database | PostgreSQL terpisah | Connection string hanya melalui environment service backend |
| Public frontend | Nginx + TLS | `https://pay.djiwatentram.web.id/` |
| Pay bridge API | Nginx proxy ke auth-server | `/api/pay-bridge/*` |

Jangan menaruh IP private/public, password, API key, connection string, atau token di repository. Detail akses harus berasal dari environment file/service manager di server.

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
