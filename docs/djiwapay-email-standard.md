# Djiwa Pay — standar email kampanye

Semua email kampanye baru dibuat dengan pola ini: **gambar hero di atas, GIF kecil di tiap bagian, satu tombol ajakan**.
Contoh acuan: template `builtin-android-tester` di [`email-marketing.ts`](../apps/djiwapay-api/src/email-marketing.ts).

## Bahan yang dibuat

| Bahan | Ukuran | Berkas | Catatan |
|---|---|---|---|
| Hero | 1010×700, JPG, ≤ 150 KB | `hero.jpg` | Maskot Djiwa Pay + satu adegan yang mewakili pesan. Tanpa teks penting di dalam gambar. |
| GIF bagian | 176×176, 4 bingkai, ≤ 120 KB | `<bagian>.gif` | Satu GIF per bagian (maksimal 3). Gerakan 1–2 detik, `loop`. Ditampilkan 72 px di samping judul. |
| Sumber hero PNG | bebas | `marketing/<slug>/hero.png` | Simpan sumber untuk cetak ulang. Tidak diserve. |

Letakkan di `apps/djiwapay/public/assets/email/<slug>/` (slug = nama kampanye, huruf kecil dan tanda hubung).
Gambar dibuat dengan OpenAI ImageGen dengan maskot yang sama agar seri email terasa satu keluarga.

## Cara merakit

```ts
wrapEmail(
  emailHero("slug", "Deskripsi gambar untuk pembaca yang gambarnya diblokir") +
  h1("{{nama}}, judul yang jelas") + p("Satu paragraf pembuka.") +
  emailSection("slug", "bagian1.gif", "Judul bagian", /* feature(...) atau teks */) +
  button("Satu ajakan utama", "https://…") +
  box("Catatan kecil: syarat, batasan, cara membalas."),
  "Preheader: satu kalimat yang tampil di daftar inbox.")
```

## Aturan

1. **Satu pesan, satu tombol.** Tombol kedua hanya tautan teks kecil.
2. **Alt text wajib** di setiap gambar, dan `width` selalu diisi (tes `email house style` memeriksa).
3. **Footer dan tautan berhenti berlangganan wajib** (`wrapEmail` sudah menyertakan; tes memeriksa).
4. **Subjek ≤ 60 karakter**, memakai `{{nama}}`, tanpa huruf kapital semua atau tanda seru berlebih.
5. **Tanpa janji yang tidak bisa dipenuhi** (hadiah, harga, tanggal) kecuali sudah dipastikan.
6. **Segmen dan persetujuan:** hanya kirim ke yang `marketing_consent = true`; sistem otomatis menyaring alamat diblokir dan yang
   sudah menerima email dalam 72 jam terakhir.
7. **Tautan harus diuji dari ponsel** sebelum kirim (terutama tautan Play Store/uji coba).

## Alur sebelum kirim

1. Buat gambar → taruh di `public/assets/email/<slug>/` → `scripts/ship-artifacts.sh djiwapay` (gambar harus sudah live).
2. Tambahkan template di `email-marketing.ts` → `bun test` → `scripts/deploy-djiwapay-api.sh`.
3. Di `/admin` → Email: buat kampanye dari template, **kirim uji ke diri sendiri**, periksa di ponsel dan desktop.
4. Cek angka penerima di halaman kampanye, baru kirim atau jadwalkan.
