# POS iOS-style redesign — rencana implementasi

Tanggal: 2026-11-13 · App: `apps/pos` · Prototype acuan: `prototypes/pos-menu-redesign`, `pos-pesanan-redesign`, `pos-shift-kas-redesign`, `pos-akhiri-shift-redesign`.

## Keputusan desain (dari pemilih)

| Halaman | Pilihan | Acuan |
|---|---|---|
| Menu `/menu` | **C · Rail kategori** (+ chip Antrian, progress Bonus tipis) | `pos-menu-redesign` |
| Pesanan (panel `transaksi`) | **B · Kartu status + accordion** | `pos-pesanan-redesign` |
| Shift & Kas (panel `kas`) | **B · Buku kas (timeline)** | `pos-shift-kas-redesign` |
| Akhiri Shift | **B · Satu halaman + bar total** | `pos-akhiri-shift-redesign` |

## Prinsip

1. Mobile app view dulu, kompak, satu layar; scroll hanya untuk daftar.
2. Gaya iOS: permukaan terang berlapis, radius lembut, sheet native (drag untuk tutup), segmented control, spring motion (`framer-motion`, sudah jadi dependency), hormati `prefers-reduced-motion`.
3. Semua komponen tampilan **baru** di `apps/pos/src/components/pos-ios/`. Komponen lama untuk halaman ini tidak dipakai lagi.
4. Logika bisnis dan hook data tidak diubah (`useHybrid*`, `useCart`, kalkulasi shift/pembayaran). Yang diganti hanya lapisan tampilan.
5. Token warna dari `packages/djiwaapps-web-shared/src/theme.css`; ikon ilustratif memakai `Djiwa3DIcon`, ikon kontrol memakai Lucide.
6. Cegah submit ganda; konfirmasi untuk aksi destruktif; loading / empty / error / sukses tersedia.

## Struktur berkas

```
components/pos-ios/
  ios-kit.tsx            primitif: IosSheet, IosSegmented, IosChip, AnimatedNumber, IosToast helper, SwipeRow, formatRp
  menu-screen.tsx        Menu (rail kategori, daftar produk, strip antrian/bonus, bar keranjang)
  queue-sheet.tsx        sheet Antrian/Selesai (status produksi) — ganti QueueHorizontalBar
  bonus-sheet.tsx        sheet Target Bonus — ganti panel target lama
  orders-screen.tsx      Pesanan (kartu status, accordion, filter sheet) — ganti HistoryTab + ParkirTab
  order-detail-sheet.tsx detail/aksi pesanan (cetak, bayar, hapus)
  cash-book-screen.tsx   Shift & Kas (laci, timeline, catat kas)
  cash-entry-sheet.tsx   numpad pemasukan/pengeluaran
  end-shift-screen.tsx   Akhiri Shift (checklist, kanal pembayaran, bar total)
  open-shift-sheet.tsx   Buka Shift (langkah ringkas)
  use-shift-management.ts  logika ShiftManagement dipindah ke hook (tanpa perubahan perilaku)
```

## Tahap

1. **Fondasi** — `ios-kit.tsx`. Tes unit untuk formatter dan logika murni.
2. **Menu** — `MenuScreen` menerima view-model yang dihitung `MenuPage` (logika lama tetap). Ganti JSX header/strip/kategori/produk/bar keranjang/nav bawah. Sheet detail produk dan keranjang ikut dibuat baru.
3. **Antrian + Bonus** — `queue-sheet`, `bonus-sheet` (data dari `useHybridOrderStatus`, `useHybridWriteOrderStatus`, `progress`).
4. **Pesanan** — `OrdersScreen` menggantikan tab `transaksi` di `MenuSidebar`; aksi bayar/hapus/cetak memakai handler yang sama.
5. **Shift & Kas** — `CashBookScreen` + `CashEntrySheet` (income via `useHybridCreateTransaction`, expense via `useHybridRecordExpenseIntake`).
6. **Akhiri Shift** — logika `ShiftManagement` diekstrak ke `useShiftManagement`; `EndShiftScreen` dan `OpenShiftSheet` memakai hook itu.
7. **Pembersihan + verifikasi** — hapus impor komponen lama yang tak terpakai; `tsc --noEmit`, tes `apps/pos`, build; cek visual di lebar 375/768.

## Di luar cakupan

Checkout/pembayaran (`checkout-sidebar`, `payment-modal`), Stok, Antrian-tab lama, Dashboard, Pengaturan, AI. Tidak diubah.

## Risiko

- `menu.lazy.tsx` (2.858 baris) dan `menu-sidebar.tsx` (4.769 baris) sangat terikat; perubahan dibatasi pada JSX agar perilaku tetap.
- Data contoh di prototype tidak sama dengan data nyata; field nyata dipetakan dari hook yang ada.
