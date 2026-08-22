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
| 14 | **Notification action payload wajib diverifikasi terhadap schema runtime sebelum deploy** — field order detail seperti `tableNumber`, `items`, dan `paymentMethod` harus diuji melalui Edge Function list setelah insert; jangan menganggap build TypeScript saja cukup untuk membuktikan kontrak JSONB/REST production. | notification |
| 15 | **POS notification sync harus memfilter order di layer aplikasi bila runtime REST memakai view camelCase** — filter PostgREST `source/createdAt` dapat menghasilkan batch kosong di internal Kong walau row live ada; ambil bounded batch terbaru, filter `createdAt` dan `source` setelah decode, lalu gunakan dedupe key idempotent. | notification/debug |
| 16 | **CSS Grid dapat membuat kartu kategori pendek ikut setinggi kartu terpanjang** — gunakan `items-start` pada grid dan `h-fit` pada card agar kategori tanpa subkategori tidak menyisakan ruang kosong besar. | ui-ux |
| 17 | **POS `/menu` tidak boleh public jika notifikasi memakai session token** — shift/order read dari Supabase public dapat membuat layar terlihat aktif walau `YumiAuthContext` kosong; route kasir harus memaksa autentikasi agar notification API memakai session yang sama. | notification/security |
| 18 | **Booking mobile harus mengikuti urutan tanggal → ringkasan tanggal → tamu + jam kedatangan** — menaruh stepper tamu sebelum kalender dan input jam jauh di bawah kalender membuat hierarki interaksi membingungkan serta berisiko tertutup sticky CTA. Kelompokkan detail kedatangan setelah tanggal dan beri bottom spacing untuk CTA. | ui-ux |
| 18 | **Idempotency key harus benar-benar disimpan dan diproteksi unique di jalur write yang dipakai app** — membuat key di UI saja tidak cukup; jika hook lokal mengabaikan key, retry dapat membuat order/source ID dan transaksi kedua. Cek sebelum insert, simpan ke kolom `idempotency_key`, dan tangani race `23505` dengan mengembalikan order pertama. | duplicate-order/safety |
| 19 | **App linkbio baru harus punya package, tsconfig, PWA manifest, webroot, dan domain boundary sendiri** — jangan memakai build/deploy target customer/POS; gunakan shared theme secara aman, bundle hanya app baru, dan verifikasi `index.html → hashed assets → domain` setelah deploy. | arsitektur/deployment |
| 20 | **Booking paid tidak otomatis menjadi POS order** — settlement booking tercatat di `financial_transactions.booking_order_id` dengan `order_source_id` kosong, sehingga worker yang hanya mempoll `pos_orders` tidak akan mengirim notifikasi. Booking perlu worker khusus berbasis finance transaction ID, service-role read, dedupe, dan retry setelah Telegram sukses. | notification/booking |
| 20 | **Invoice Mayar harus menerima identitas customer dari sumber order** — nama tidak boleh diganti placeholder jika customer sudah diketahui; email valid customer diteruskan, email kosong memakai default server-side. Validasi ini harus berada di caller dan proxy, serta mapping action create-invoice/get-invoice-detail harus konsisten di shared hook. | payment/integrity |
| 21 | **View booking mengekspos item dengan field `name`, sedangkan consumer POS/Admin mengharapkan `productName`** — normalisasi item di boundary mapper (`productName: item.productName ?? item.name`) sebelum detail, receipt, atau operational list dirender. | debug/data-contract |
