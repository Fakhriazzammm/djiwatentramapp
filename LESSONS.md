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
| 5 | **Mini App closing wajib diverifikasi ulang di server** — jangan hanya percaya state frontend atau link verifier; `process-closing` harus memvalidasi HMAC UID/timestamp, active check-in, dan menolak duplicate checkout sebelum opname/inventory write. Settings jadwal yang gagal dibaca tidak boleh menjadi bypass validasi jam. | security |
