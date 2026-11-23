# Struk luar negeri (Foto struk)

Foto struk membaca struk dari negara dan bahasa mana pun. Hasilnya menyimpan teks asli dan terjemahan Indonesia, dan jumlahnya diubah ke rupiah.

## Yang tersimpan
- **Dokumen struk** (`finance.receipts.details`): jumlah dalam mata uang struk, nama asli (`nameOriginal`, `labelOriginal`, `merchantOriginal`), bahasa (`language`), jenis (`kind`), kurs yang dipakai (`fx`), kartu seperti tercetak (`cardNote`), penerima paket (`recipient`). Fotonya juga tersimpan (`image_path`) dan sidik fotonya (`image_sha`).
- **Catatan** (`finance.entries`): `amount` selalu rupiah. Yang dibayar tersimpan di `foreign_currency`, `foreign_amount`, `fx_rate`. Tag `trip:<MATAUANG>-<yyyy-mm>` mengelompokkan perjalanan.
- **Dompet** (`finance.accounts.currency`): dompet bisa bermata uang asing. Struk bermata uang sama otomatis memilih dompet itu. Saldo tetap rupiah; kartu dompet menampilkan perkiraan dalam mata uangnya.

## Jenis struk (`kind`)
| Jenis | Dicatat sebagai |
|---|---|
| `itemized` | pengeluaran |
| `card-slip` | pengeluaran (satu baris dibuat dari total) |
| `refund` | pemasukan, kategori Refund |
| `topup` | pindah dompet (`tf`), perlu dompet tujuan |
| `cod` | pengeluaran |

## Kurs
`GET /api/finance/fx?currency=JPY&date=2025-11-25` memberi kurs referensi harian (ECB lewat Frankfurter), disimpan di `finance.fx_rates` supaya catatan lama tidak berubah. Pengguna bisa mengisi kurs sendiri (`fx.source = "manual"`). Server menolak struk asing tanpa kurs (`FX_REQUIRED`).

## Duplikat
`POST /receipts/scan` mengembalikan `duplicate` bila foto yang sama (`image_sha`) atau jumlah yang sama pada menit yang sama sudah menjadi catatan. Aplikasi menawarkan "Lewati" atau "Tetap catat".

## Menguji pembacaan
```
HELIPOD_AI_KEY=... bun apps/djiwapay-api/scripts/read-samples.ts <folder foto>
```
Foto contoh tidak dimasukkan ke repo karena memuat nomor kartu dan alamat. Tes yang tetap ada memakai hasil baca tiruan: `receipt-foreign.test.ts` dan `receipt-foreign.int.test.ts`.

Kode: `apps/djiwapay-api/src/{receipt,receipt-document,receipt-records,fx}.ts`, `apps/djiwapay/src/lib/finance/{currency,receipt}.ts`, `apps/djiwapay/src/features/finance/{fin-receipt,trips}.tsx`.
