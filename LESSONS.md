# Lessons Learned

## Frontend

| # | Lesson | Sumber |
|---|--------|--------|
| 1 | **Entry point React wajib me-render root** — TypeScript/Vite dapat tetap typecheck dan build walau file hanya mendefinisikan `App`. Pastikan setiap `main.tsx` memanggil `createRoot(document.getElementById("root")!).render(<App />)` dan verifikasi bundle memuat string UI, bukan hanya React runtime. | debug |

## Supabase

| # | Lesson | Sumber |
|---|--------|--------|
| 2 | **Bedakan cloud project dan custom self-hosted URL** — `supabase db query --linked` menargetkan project cloud, sedangkan aplikasi memakai `supabase.yumme.id`. Selalu smoke-test kedua endpoint dan apply migration/deploy function ke runtime yang benar. | deployment |
| 3 | **Extension PostgreSQL dapat berada di schema `extensions`** — gunakan `extensions.digest(...)`, bukan `digest(...)`, pada function SECURITY DEFINER agar tidak bergantung pada `search_path`. | debug |
| 4 | **Payment booking harus payment-first** — simpan booking sebagai `pending` dengan hold kapasitas singkat, buat invoice Mayar lewat Edge Function, korelasikan `extraData.bookingId`, dan ubah menjadi `confirmed/paid` hanya setelah webhook memverifikasi `GET /transactions/{id}` berstatus `paid`. Redirect browser bukan bukti settlement. | payment |
| 5 | **Booking yang sudah terhubung ke finance tidak boleh di-hard-delete** — aksi hapus harus mengecek `financial_transactions`; jika ada linkage, ubah booking menjadi `cancelled` dan simpan `cancelled_at`. Physical delete hanya boleh untuk booking tanpa transaksi finansial. | safety |
| 6 | **Mini App closing wajib diverifikasi ulang di server** — jangan hanya percaya state frontend atau link verifier; `process-closing` harus memvalidasi HMAC UID/timestamp, active check-in, dan menolak duplicate checkout sebelum opname/inventory write. Settings jadwal yang gagal dibaca tidak boleh menjadi bypass validasi jam. | security |
| 7 | **Build sukses tidak berarti production sudah berubah** — untuk SPA/PWA, verifikasi `index.html`, hashed bundle, `sw.js`, dan `version.json` dari domain canonical setelah deploy. HTTP 200 pada route dapat tetap menyajikan build lama. | deployment |
| 8 | **Self-host PostgreSQL tidak selalu menyediakan helper JSONB yang diasumsikan** — RPC harus diuji pada engine production; gunakan operasi JSONB portable seperti `v_updates <> '{}'::jsonb` dan transactional rollback test sebelum rollout. | debug |
| 9 | **Setiap app Vite wajib punya publishable Supabase key saat build** — fallback URL saja tidak cukup; `import.meta.env` dibekukan saat build sehingga app tanpa `VITE_SUPABASE_PUBLISHABLE_KEY` masuk state “Supabase belum dikonfigurasi”. Simpan key production di env ignored dan sediakan `.env.example`. | deployment |

## Backend

| # | Lesson | Sumber |
|---|--------|--------|
| 10 | **Auth custom Yumi menyimpan role lewat `role_source_id`** — jangan mengasumsikan `yumi_users.role_name`; resolve nama role melalui `yumi_roles` di server-side Edge Function. | debug |
| 11 | **Notification dedupe harus server-side** — frontend polling/retry dapat memanggil sync berulang; gunakan `dedupe_key` UNIQUE dan `ON CONFLICT DO NOTHING`, lalu tambahkan guard audio di client. | notification |
| 12 | **Brand fallback harus mengikuti nama canonical terbaru** — hardcoded fallback di banyak app dapat mengalahkan konfigurasi database dan membuat nama brand lama muncul lintas UI/PWA/PDF; perubahan brand harus mencakup copy, manifest, cache identifier, dan deployment artifact. | branding |
| 13 | **Bulk selection kategori harus memakai parentId tree** — memilih kategori parent harus mencakup semua descendant categoryId, sedangkan pilihan subkategori harus tetap dapat dibatalkan sendiri; pertahankan payload `featuredProductIds[]` agar tidak perlu migration. | ui-ux |
