# Djiwa Pay — backend keuangan sendiri (PostgreSQL Helipod) + scan struk

Tujuan: data pencatatan keuangan Djiwa Pay punya Postgres sendiri (Helipod, project `djiwatentram`, schema `finance`), tidak bergantung pada Supabase. Wallet/PPOB tetap di backend lama dan nanti pindah ke database yang sama (schema `wallet`).

## Keputusan
- Database: Postgres 17 Helipod yang sudah ada (paket Free), schema `finance`. Foto struk TIDAK masuk Postgres; disimpan di disk VPS (`/var/lib/djiwapay-api/receipts/<user>/<id>.jpg`).
- Service baru `apps/djiwapay-api` (Bun + Hono + pg), proses terpisah di VPS (`djiwapay-api.service`, port 3011). auth-server produksi TIDAK diubah (checkout VPS-nya diverge dari repo).
- Auth: service meneruskan cookie `djiwa_pay_session` ke `GET 127.0.0.1:3001/api/pay-bridge/profile`; `customer.source_id` menjadi `user_id`. Nginx pay.* dan djiwapay.web.id memproxy `/api/finance/` ke 3011 (same-origin).
- Sinkron: local-first. Klien menghitung diff vs snapshot terakhir lalu `POST /api/finance/sync` (upsert/hapus per entitas, transaksi DB, versi naik). Pull saat buka dan saat fokus. Last-write-wins per baris.
- Scan struk: `POST /api/finance/receipts/scan` (gambar terkompres dari ponsel) -> Helipod AI Gateway `qwen-vl-ocr` (cadangan `qwen3-vl-plus` bila yakin < 0.85 atau total tak cocok) -> JSON terstruktur -> divalidasi -> disimpan sebagai `finance.receipts`.
- Migrasi wallet nanti: user_id sama, schema `wallet` di DB yang sama, dual-write lalu cutover.

## Langkah
1. Migrasi SQL `apps/djiwapay-api/migrations/0001_finance.sql`. 2. API + tes. 3. Deploy service + nginx + env. 4. Klien: sinkron + UI scan struk + tes. 5. Build, ship, verifikasi live.
Rahasia (DATABASE_URL, kunci AI) hanya di `/etc/djiwatentramapp/djiwapay-api.env`.
