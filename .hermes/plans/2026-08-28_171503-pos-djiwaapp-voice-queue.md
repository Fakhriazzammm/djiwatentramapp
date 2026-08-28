# Plan: POS `/menu` Voice Queue untuk DjiwaApp dan Kasir

## Goal

Menambahkan voice notification yang aman dan berurutan pada `pos.yumme.id/menu`:

1. Setiap event voice selalu memainkan `/sounds/transaction-success.mp3` **1 kali terlebih dahulu**.
2. Setelah MP3 selesai, baru memainkan voice ResponsiveVoice/TTS.
3. Semua event masuk ke **satu antrean audio global** dan diproses satu per satu sampai selesai.
4. Transaksi beruntun atau bersamaan tidak boleh membuat suara bertubrukan.
5. Order yang sama/event yang sama tidak boleh berbunyi dua kali.

Tidak mengubah UI transaksi atau payment settlement selain integrasi audio.

## Current Context

Yang sudah ada dan dipertahankan:

- `apps/pos/src/lib/play-success-sound.ts` memainkan MP3 transaksi sukses dua kali.
- `apps/pos/src/routes/menu.lazy.tsx` memanggil sound saat order kasir berhasil, open bill/invoice dibuat, serta event notifikasi order DjiwaApp.
- `apps/pos/src/hooks/use-pos-notifications.ts` melakukan polling notifikasi secara berkala.
- Notification event yang relevan adalah `order_cashier_pending` dan `order_paid`.
- Source order dan metode pembayaran harus dibedakan; order DjiwaApp tetap berlabel DjiwaApp walaupun metode pembayarannya berbeda.

Perubahan yang direncanakan adalah mengganti pemanggilan sound langsung dengan audio queue. MP3 existing tidak dihapus.

## Voice Contract

### DjiwaApp

| Payment method/event | Voice setelah MP3 selesai |
|---|---|
| Djiwa Pay berhasil | `Pesanan DjiwaApp atas nama [customer] sudah dibayar melalui Djiwa Pay.` |
| QRIS berhasil | `Pesanan DjiwaApp atas nama [customer] sudah dibayar melalui QRIS.` |
| Bayar di kasir / cashier pending | `Pesanan baru DjiwaApp atas nama [customer], menunggu pembayaran di kasir.` |

Fallback jika nama kosong:

- `Pesanan DjiwaApp sudah dibayar melalui Djiwa Pay.`
- `Pesanan DjiwaApp sudah dibayar melalui QRIS.`
- `Pesanan baru DjiwaApp menunggu pembayaran di kasir.`

### POS Kasir

Untuk transaksi yang langsung dibuat kasir dari `/menu`, hanya ada satu voice:

```text
Pesanan baru diterima.
```

Voice kasir diputar setelah MP3 selesai. Tidak menambahkan voice kedua untuk print, refresh, atau toast.

## Proposed Architecture

```text
Order/payment event
  -> canonical event resolver
  -> stable event key + dedupe guard
  -> global audio queue
  -> play transaction-success.mp3 once
  -> await MP3 ended/error
  -> request/play ResponsiveVoice TTS
  -> await TTS ended/error
  -> release queue
  -> process next event
```

### Audio queue behavior

Buat helper terpusat, kemungkinan:

```text
apps/pos/src/lib/transaction-voice-queue.ts
```

Tanggung jawab:

- Menyimpan queue FIFO.
- Menjaga satu `isPlaying`/promise processor global.
- Menerima item `{ eventKey, text, priority? }`.
- Menolak `eventKey` yang sudah queued/playing/played.
- Memutar MP3 sekali dengan `HTMLAudioElement`.
- Menunggu `ended`, `error`, atau timeout yang aman.
- Menjalankan TTS setelah MP3 selesai.
- Menunggu TTS selesai sebelum mengambil item berikutnya.
- Jika TTS gagal, mencatat warning dan tetap lanjut ke item berikutnya.
- Memiliki fallback MP3/skip yang tidak menyebabkan deadlock queue.
- Menyediakan `clear()` hanya untuk cleanup saat unmount/session reset, bukan menghapus event transaksi yang sedang berjalan.

## Event Dedupe

Gunakan key stabil, bukan message text:

```text
pos-order:<orderId>:created
pos-order:<orderId>:open-bill-created
pos-order:<orderId>:qris-invoice-created
order:<orderId>:order_cashier_pending
order:<orderId>:order_paid:<paymentMethod>
```

Aturan:

- Initial seed dari order/notifikasi tidak memutar suara.
- Polling berikutnya hanya event baru/status transition yang boleh masuk queue.
- Order yang terlihat dari order polling dan notification polling memakai dedupe key yang sama.
- `order_paid` hanya dibuat dari status authoritative `paid`/`completed`.
- Invoice QRIS dibuat/pending tidak boleh memakai kalimat “sudah dibayar”.
- Djiwa Pay `wallet_hold` bukan settlement; voice paid hanya setelah debit/capture berhasil.

## ResponsiveVoice Integration

Gunakan SDK CDN yang diminta user di `apps/pos/index.html`:

```html
<script src="https://cdn.responsivevoice.org/sdk/latest/responsivevoice.js"></script>
<script>
responsiveVoice.init({
    "apiKey": "Q1BY1geN"
});
</script>
```

Queue memanggil:

```ts
responsiveVoice.speak(text, "Indonesian Female", {
  onend: releaseQueue,
  onerror: releaseQueue,
});
```

API key ini berada di frontend karena mengikuti model SDK browser yang diberikan user. Jangan menambahkan API secret REST ke bundle. Native browser speech hanya menjadi fallback jika CDN tidak termuat. Semua pemutaran tetap berada di queue yang sama sehingga audio TTS tidak overlapping.

## Database Schema / Source Contract

Tidak direncanakan migration baru.

Sumber data yang dibaca:

```text
pos.orders / pos_orders
  - _id / id
  - source / source_app
  - status
  - paymentMethod / payment_method
  - paymentReceiptKind / payment_receipt_kind
  - customerName / customer_name
  - tableNumber / table_number

pos_notifications
  - id
  - notification_type
  - order_source_id
  - order_number
  - source
  - action_payload.orderId
  - action_payload.customerName
  - action_payload.paymentMethod
  - isRead/read state
```

Read path tetap:

```text
POS hook -> Supabase/pos-notifications Edge Function -> notification list
POS order sync -> existing hybrid order read model
```

Notification payload wajib dinormalisasi di boundary agar mendukung camelCase dan snake_case. Data order tetap menjadi source of truth untuk status/payment; metadata notification hanya fallback display.

## UI/UX Specification

Tidak ada redesign UI.

Behavior yang terlihat:

- Popup transaksi tetap tampil seperti sekarang.
- Voice tidak bergantung pada popup sedang terbuka.
- Queue berjalan FIFO berdasarkan waktu event diterima.
- Event kedua menunggu sampai MP3 dan TTS event pertama selesai.
- Tidak ada overlapping audio element.
- Jika user menutup popup, audio queue tetap mengikuti event yang sudah diterima.
- Jika browser memblokir autoplay, tampilkan/pertahankan mekanisme audio unlock setelah interaksi user dan lanjutkan queue secara aman.
- `prefers-reduced-motion` tidak mematikan voice; hanya memengaruhi animasi popup.
- Jika audio gagal, queue tidak boleh berhenti dan UI tidak boleh menampilkan status paid yang tidak benar.

## Multi-Source Data Flow

```text
DjiwaApp checkout
  -> pos.orders
  -> payment settlement/webhook/RPC
  -> pos_notifications order_cashier_pending/order_paid
  -> POS notification polling
  -> event resolver
  -> voice queue

POS cashier checkout
  -> pos.orders source=pos
  -> successful create response
  -> event resolver
  -> voice queue
```

Order polling dan notification polling boleh tetap berjalan terpisah, tetapi keduanya harus memasukkan event ke queue terpusat dengan stable dedupe key.

## No-Hardcode Audit

Nilai yang tidak boleh di-hardcode sebagai data transaksi:

- Nama customer.
- Metode pembayaran.
- Status paid/pending/completed.
- Nomor order/meja.
- API key dan API secret.
- URL audio TTS.

Nilai yang boleh tetap menjadi konfigurasi/contract:

- `/sounds/transaction-success.mp3` sebagai asset wajib.
- Template voice per event/payment method.
- Voice ResponsiveVoice default, jika belum tersedia di settings.
- Timeout dan batas queue.

Template kalimat sebaiknya diletakkan di resolver terpusat, bukan tersebar di komponen JSX.

## Files Likely to Change

- `apps/pos/src/lib/play-success-sound.ts` — refactor atau jadikan primitive MP3 satu kali; tidak lagi memutar dua kali untuk flow baru.
- `apps/pos/src/lib/transaction-voice-queue.ts` — queue dan deklarasi SDK CDN.
- `apps/pos/src/lib/transaction-voice-resolver.ts` — mapping event/payment ke teks voice.
- `apps/pos/src/routes/menu.lazy.tsx` — enqueue event transaksi.
- `apps/pos/src/hooks/use-pos-notifications.ts` — hanya jika metadata notification perlu diperluas.
- `apps/pos/src/lib/transaction-voice-resolver.test.ts` — test tiga metode DjiwaApp dan satu event POS kasir.
Tidak mengubah migration database kecuali audit runtime menemukan field yang memang belum tersedia dan user menyetujui perubahan schema.

## Implementation Steps

1. Audit seluruh call site `playSuccessSound()` dan catalog payment/status yang benar-benar digunakan.
2. Pisahkan primitive MP3 satu kali dari orkestrator queue.
3. Implementasikan queue FIFO berbasis Promise dengan state `queued/playing/played/failed`.
4. Tambahkan event resolver terpusat untuk:
   - Djiwa Pay paid
   - QRIS paid
   - DjiwaApp cashier pending
   - POS kasir created
5. Tambahkan dedupe lintas order polling dan notification polling.
6. Implementasikan TTS backend/Edge Function dengan env secret, timeout, dan fallback.
7. Integrasikan `/menu` agar semua event memakai satu queue instance global.
8. Tambahkan unit test untuk urutan MP3 → TTS → next event.
9. Jalankan typecheck/build POS.
10. Verifikasi bundle lazy route dan asset `/sounds/transaction-success.mp3` pada domain canonical `https://pos.yumme.id`.
11. Lakukan controlled test event non-produktif/expiring tanpa membuat transaksi finansial palsu.
12. Verifikasi dua event simultaneous: event B baru boleh mulai setelah event A selesai.

## Tests / Acceptance Criteria

### Unit

- MP3 dipanggil tepat satu kali per event.
- TTS tidak dimulai sebelum MP3 `ended` atau fallback error selesai.
- Event kedua menunggu event pertama.
- Tiga event beruntun diproses FIFO.
- Duplicate event key hanya menghasilkan satu playback.
- Error MP3 tidak membuat queue deadlock.
- Error TTS tetap melanjutkan item berikutnya.
- TTS timeout tetap me-release queue.
- DjiwaApp QRIS pending tidak menghasilkan teks paid.
- Djiwa Pay hold tidak menghasilkan teks paid.

### Runtime / Production

- `/menu` dapat memutar MP3 dan TTS tanpa overlap.
- Djiwa Pay, QRIS, dan bayar di kasir menghasilkan voice yang berbeda sesuai contract.
- POS kasir menghasilkan satu voice: `Pesanan baru diterima.`
- Refresh halaman tidak mengulang event lama.
- Order yang diterima melalui dua polling source tidak berbunyi dua kali.
- `GET /sounds/transaction-success.mp3` mengembalikan `audio/mpeg`.
- Production `index.html`, hashed lazy chunk, dan `version.json` diverifikasi dari `pos.yumme.id`.
- Tidak ada API secret REST ResponsiveVoice di JS bundle; API key CDN mengikuti konfigurasi SDK browser yang diminta user.

## Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Browser autoplay memblokir suara | Audio unlock setelah login/interaksi pertama; fallback dan status retry |
| TTS lambat membuat antrean panjang | Timeout, cache, kalimat pendek, dan fallback MP3 |
| Dua polling source menggandakan suara | Satu queue + stable event key global |
| MP3 lama masih diputar dua kali | Ubah primitive flow baru menjadi satu kali dan test call count |
| Status invoice dianggap paid | Resolver hanya menerima settlement authoritative |
| Credential bocor ke frontend | Jangan menambahkan API secret REST; gunakan hanya API key CDN yang memang diminta untuk SDK browser |
| Queue macet karena promise tidak selesai | `ended/error/timeout` wajib me-release lock pada `finally` |
| PWA menyajikan bundle lama | Verifikasi index, lazy chunk, service worker, dan version manifest |

## Preview Efek yang Wajib Saat Implementasi

Karena ini perubahan audio/runtime:

- Screenshot `/menu` yang menunjukkan popup/event tetap muncul.
- Console/runtime evidence berurutan:

```text
[voice] enqueue event A
[voice] mp3:start A
[voice] mp3:end A
[voice] tts:start A
[voice] tts:end A
[voice] mp3:start B
```

- Network evidence untuk asset MP3 dan endpoint TTS tanpa menampilkan secret.
- Test output yang membuktikan tidak ada overlap dan duplicate playback.

## Out of Scope

- Mengubah metode pembayaran DjiwaApp.
- Mengubah status order atau settlement logic.
- Mengubah template popup visual secara besar.
- Menambahkan voice ke notifikasi admin biasa.
- Mengganti atau menghapus asset MP3 existing.
- Deploy production sebelum plan ini disetujui dan implementasi diverifikasi.
