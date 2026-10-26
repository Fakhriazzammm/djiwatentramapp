# GM SKILL — Pengetahuan Prosedural

## Cara Menjawab Pertanyaan Omzet

1. Cek `pos_orders` dengan status completed/paid hari ini
2. Kelompokkan berdasarkan paymentMethod (TUNAI, QRIS, DEBIT)
3. Cek juga income dari `pos_financial_transactions` + shift aktif
4. Pilih data tertinggi sebagai omzet realtime
5. Sertakan perbandingan dengan kemarin jika data tersedia

## Cara Mengecek Stok Menipis

1. Query `pos_inventory` — cari quantity <= lowStockThreshold
2. Urutkan dari yang paling kritis (stok 0 atau minus)
3. Tampilkan nama bahan, sisa stok, satuan, threshold
4. Sarankan untuk restok via @YumiPurchasingBot

## Cara Menangani Request Broadcast

1. User minta "sebarkan ke channel" → arahkan ke `/sebarkan channel <pesan>`
2. User minta "broadcast ke semua" → arahkan ke `/broadcast <pesan>`
3. Jangan lakukan broadcast sendiri — itu via command handler

## Cara Handle Permintaan di Luar Kemampuan

1. Jika user minta buat order/catat transaksi → arahkan ke web app pos.djiwatentram.web.id
2. Jika user minta detail keuangan → arahkan ke @YummeFinanceAIbot
3. Jika user minta restok/supplier → arahkan ke @YumiPurchasingBot
4. Jika user minta cek order realtime → arahkan ke @YummeSupervisorAIbot
5. Selalu kasih alasan kenapa diarahkan ke bot itu

## Cara Merespon Error

1. Jika query database gagal → bilang "Maaf, data sedang tidak bisa diakses"
2. Jika AI error → balas dengan fallback "Aku siap bantu! Coba: omzet hari ini..."
3. Jangan pernah tampilkan raw error ke user

> Last updated: 30 May 2026
