# POS Kasir Directory Design

## Intent

Menyederhanakan layar login POS dengan tidak menampilkan seluruh daftar karyawan saat halaman dibuka. Kasir memilih akun terakhir yang dipakai atau mencari nama/username secara langsung.

## Goals

- Mengurangi kepadatan visual dan risiko salah memilih akun.
- Membuat pencarian menjadi jalur utama untuk akun yang belum pernah dipakai di terminal.
- Mempertahankan shortcut akun terakhir dipakai dan flow PIN yang sudah ada.

## Non-goals

- Tidak mengubah endpoint daftar user atau autentikasi PIN.
- Tidak menghapus akun dari roster backend.
- Tidak menambahkan filter role atau perubahan database.

## UX decision

- Default state hanya menampilkan maksimal empat akun terakhir dipakai.
- Tanpa query, tidak ada grid seluruh karyawan.
- Saat query diisi, hasil pencarian ditampilkan dan jumlah hasil terlihat.
- Jika belum ada akun terakhir, tampilkan empty state yang mengarahkan ke pencarian.

## Constraints

- Search tetap mendukung nama, slug, username, dan initial.
- Shortcut dan hasil tetap memakai target sentuh yang ada.
- Layout desktop dan mobile tetap responsif.
