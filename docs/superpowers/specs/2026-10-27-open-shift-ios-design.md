# Buka Shift Kasir — iOS-style UX

## Intent

Membuat pembukaan kasir cepat, jelas, dan aman untuk operator yang bekerja dari POS. Flow tetap mencakup Data Shift, Review, Checklist, dan Selesai, tetapi hanya menampilkan satu langkah aktif pada satu waktu.

## Goals

- Satu CTA utama yang jelas pada setiap langkah.
- Mempertahankan data kasir, shift, modal awal, tim, review, checklist online food, dan hasil sukses.
- Validasi field wajib sebelum lanjut.
- Draft pembukaan tersimpan otomatis agar refresh atau panel tertutup tidak menghapus input.
- UI terasa seperti iOS: card putih, radius besar, hierarchy ringkas, sticky action bar, status pill, dan touch target minimal 44px.

## Non-goals

- Tidak mengubah kontrak backend `useHybridStartShift`.
- Tidak mengubah flow tutup shift.
- Tidak menambahkan login atau permission baru.

## UX decisions

- Data Shift adalah layar awal; Review dan Checklist menggantikan form, bukan ditampilkan bersamaan.
- Kasir default ke user login jika tersedia; shift default mengikuti jadwal aktif.
- Tim bertugas tetap opsional, memakai search, pilih semua, filter role, dan jumlah terpilih.
- Modal awal memakai input rupiah yang mudah dibaca serta shortcut pecahan umum.
- Review menampilkan kartu ringkasan dengan tombol Ubah.
- Checklist wajib memberi status tiap platform: Aktif, Bermasalah, atau Tidak digunakan.
- Selesai menampilkan ringkasan dan CTA `Masuk ke Kasir`.

## Safety and edge cases

- Tombol lanjut disabled sampai kasir, shift, dan modal valid.
- Modal `Rp 0` boleh disimpan bila memang valid, tetapi diberi konfirmasi eksplisit.
- Shift aktif tidak boleh membuka flow baru.
- Draft dibersihkan setelah shift berhasil dibuat.
- Error submit tetap terlihat di langkah aktif dan tidak menghapus input.
