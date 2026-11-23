/** Privacy policy and terms of Djiwa Pay. Plain data, so the wording Google asks for can be tested. Describes what the system really does. */
export const LEGAL_UPDATED = "16 November 2026";
export const LIMITED_USE = "Penggunaan dan pengalihan informasi yang diterima dari Google API oleh Djiwa Pay ke aplikasi lain mematuhi Kebijakan Data Pengguna Layanan Google API, termasuk persyaratan Penggunaan Terbatas (Limited Use). Djiwa Pay's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";
export type Section = { title: string; body: string[] };

export const PRIVACY: Section[] = [
  { title: "Siapa kami", body: ["Djiwa Pay (djiwapay.web.id) adalah aplikasi pencatat keuangan pribadi dan dompet digital milik ekosistem Djiwa Tentram. Kebijakan ini menjelaskan data apa yang kami pakai, untuk apa, dan bagaimana kamu mengendalikannya."] },
  { title: "Data yang kami kumpulkan", body: [
    "Akun: nama dan email dari akun Djiwa Tentram yang kamu pakai untuk masuk.",
    "Catatan keuangan yang kamu buat atau izinkan dibuat otomatis: transaksi, kategori, dompet, anggaran, tujuan, tagihan, hutang, dan aset.",
    "Foto struk yang kamu pindai atau unggah, serta hasil bacanya (toko, tanggal, item, total).",
    "Data dompet Djiwa Pay (saldo, top up, pembayaran) dikelola oleh sistem Djiwa Tentram dan tidak dicampur dengan catatan keuangan ini."] },
  { title: "Integrasi Google (hanya jika kamu menyalakannya)", body: [
    "Setiap integrasi bersifat pilihan, diminta satu per satu, dan bisa kamu putus kapan saja. Kami hanya meminta izin yang dibutuhkan fiturnya.",
    "Google Calendar (calendar.events): membuat acara pengingat untuk tagihan rutin yang kamu catat. Kami tidak membaca acara lain di kalendermu.",
    "Google Drive (drive.file): membuat folder “Djiwa Pay” untuk menyimpan foto struk dan satu Spreadsheet keuangan, lalu menyinkronkannya dua arah. Izin ini hanya mencakup file yang dibuat Djiwa Pay; kami tidak dapat melihat file lain di Drive-mu.",
    "Gmail (gmail.readonly): hanya untuk mencari email notifikasi pembayaran dari bank dan e-wallet yang terdaftar, lalu mencatat nominal, arah uang (masuk atau keluar), toko, dan waktunya sebagai catatan keuangan. Kami tidak membaca atau menyimpan email lain, tidak mengirim, menghapus, atau mengubah email, dan mengabaikan email berisi kode OTP, PIN, atau reset kata sandi.",
    "Yang kami simpan dari email hanyalah hasil bacanya (nominal, arah, toko, waktu, nomor referensi, 4 digit akhir rekening, dan judul email yang dipotong). Isi email tidak disimpan. Contoh teks untuk email yang tidak terbaca hanya disimpan selama pratinjau impor, dalam bentuk yang disamarkan.",
    LIMITED_USE] },
  { title: "Pemrosesan dengan AI", body: ["Agar nominal dan toko dapat dibaca dari foto struk dan dari email yang formatnya tidak dikenal, teks atau gambar yang relevan dikirim ke layanan model AI melalui gateway Helipod. Nomor rekening dan nomor panjang disamarkan lebih dulu pada teks email. Data ini dipakai hanya untuk membaca catatanmu, tidak untuk iklan, dan tidak kami pakai untuk melatih model."] },
  { title: "Bagaimana data disimpan dan dilindungi", body: [
    "Catatan disimpan di database PostgreSQL terkelola dan di perangkatmu. Foto struk disimpan di server kami dan, bila Drive disambungkan, di Drive-mu.",
    "Token akses Google dienkripsi (AES-256-GCM) di server dan tidak pernah dikirim ke browser.",
    "Kami memeriksa keaslian email (DKIM atau DMARC) sebelum membacanya, supaya email palsu tidak menjadi catatan.",
    "Kami tidak menjual datamu dan tidak membagikannya untuk iklan. Data hanya diproses oleh penyedia infrastruktur yang menjalankan layanan ini (hosting, database, gateway AI) dan oleh Google untuk integrasi yang kamu nyalakan."] },
  { title: "Berapa lama data disimpan", body: ["Catatan disimpan selama akunmu aktif atau sampai kamu menghapusnya. Email yang diabaikan atau diduplikasi dihapus otomatis setelah 30 hari, dan antrean tinjau yang tidak diputuskan setelah 90 hari. Saat Google diputus, token dan data sinkronisasi dihapus."] },
  { title: "Hak dan kendalimu", body: [
    "Memutus Google: Pengaturan › Integrasi › Putuskan Google. Token dihapus; acara dan file yang sudah dibuat tetap ada di akun Google-mu.",
    "Mencabut akses langsung di Google: myaccount.google.com/permissions.",
    "Menghapus data keuangan: Pengaturan › Hapus semua data keuangan (perangkat dan server).",
    "Mengekspor data: Pengaturan › Ekspor catatan (CSV) atau Cadangkan data (JSON), atau lewat Spreadsheet-mu.",
    "Sesuai UU Pelindungan Data Pribadi, kamu berhak mengakses, memperbaiki, menghapus, dan menarik persetujuan atas datamu. Ajukan lewat menu Bantuan di aplikasi."] },
  { title: "Perubahan kebijakan", body: ["Bila kebijakan ini berubah, versi terbaru ditampilkan di halaman ini dengan tanggal pembaruan. Perubahan yang memperluas data Google yang kami minta akan meminta persetujuanmu lagi."] },
];

export const TERMS: Section[] = [
  { title: "Tentang layanan", body: ["Djiwa Pay membantu mencatat dan memahami keuanganmu: catatan manual, pindai struk, pencatatan dari email pembayaran, anggaran, tagihan, dan integrasi Google. Layanan dompet (saldo, top up, pembayaran) tunduk pada ketentuan Djiwa Tentram."] },
  { title: "Bukan nasihat keuangan", body: ["Ringkasan, perkiraan, saran anggaran, dan skor kesehatan keuangan adalah alat bantu berdasarkan data yang kamu miliki. Itu bukan nasihat keuangan, pajak, atau hukum."] },
  { title: "Pembacaan otomatis bisa keliru", body: ["Pembacaan struk dan email dilakukan otomatis dan tidak selalu tepat. Kami memberi cara memeriksa dan membatalkan setiap catatan otomatis, tetapi kamu bertanggung jawab memeriksa bahwa catatanmu benar sebelum mengandalkannya."] },
  { title: "Akun dan keamanan", body: ["Jaga akses ke akunmu. Kamu bertanggung jawab atas aktivitas di akunmu dan atas izin yang kamu berikan kepada integrasi Google. Kamu bisa mencabut izin itu kapan saja."] },
  { title: "Penggunaan yang wajar", body: ["Jangan menyalahgunakan layanan, mencoba mengakses data pengguna lain, atau membebani sistem secara tidak wajar. Pemindaian struk dibatasi per hari untuk menjaga layanan tetap tersedia bagi semua orang."] },
  { title: "Ketersediaan dan perubahan", body: ["Kami berupaya menjaga layanan tetap berjalan, tetapi tidak menjamin tanpa gangguan. Fitur dapat berubah atau dihentikan; untuk perubahan besar kami memberi tahu lebih dulu. Layanan Google dan pihak ketiga lain tunduk pada ketentuan mereka sendiri."] },
  { title: "Tanggung jawab", body: ["Sejauh diizinkan hukum, Djiwa Pay tidak bertanggung jawab atas kerugian tidak langsung akibat kesalahan pembacaan otomatis, gangguan layanan pihak ketiga, atau keputusan keuangan yang kamu ambil."] },
  { title: "Hukum yang berlaku", body: ["Ketentuan ini tunduk pada hukum Republik Indonesia."] },
];

/** Public account-deletion page required by Google Play. Mirrors /api/pay-bridge/account/delete in apps/auth-server. */
export const DELETION: Section[] = [
  { title: "Cara menghapus akun Djiwa Pay", body: [
    "Berlaku untuk aplikasi Djiwa Pay (Android dan web) dari Djiwa Tentram.",
    "1. Buka Djiwa Pay dan masuk ke akunmu.",
    "2. Buka Pengaturan › Keamanan, lalu pilih Hapus akun.",
    "3. Ketik HAPUS, lalu masukkan PIN pembayaranmu.",
    "Syarat: saldo dompet Djiwa Pay harus kosong (tarik atau pakai dulu), dan PIN sudah dibuat. Kalau belum punya PIN, buat dulu di menu yang sama."] },
  { title: "Data yang dihapus", body: [
    "Nama, nomor telepon, alamat, tanggal lahir, dan foto profil dihapus dari profilmu; namamu diganti menjadi “Akun dihapus”.",
    "Email diganti dengan alamat anonim, sehingga kamu tidak bisa masuk lagi dengan email itu.",
    "PIN, sesi masuk, dan koneksi akun masuk (kata sandi dan Google) dihapus. Persetujuan info pemasaran dicabut.",
    "Akun ditutup untuk semua aplikasi Djiwa (Pay, Tentram, Travel)."] },
  { title: "Data yang tetap disimpan", body: [
    "Riwayat pesanan, transaksi, dan struk tetap disimpan tanpa namamu, karena dibutuhkan untuk pembukuan dan kewajiban hukum.",
    "Data keuangan pribadi di aplikasi dapat kamu hapus lebih dulu lewat Pengaturan › Hapus semua data keuangan."] },
  { title: "Hapus sebagian data tanpa menghapus akun", body: [
    "Kamu bisa menghapus transaksi, struk, dan catatan satu per satu, memutus Google lewat Pengaturan › Integrasi, atau menghapus semua data keuangan lewat Pengaturan, tanpa menutup akun."] },
  { title: "Tidak bisa membuka aplikasi?", body: [
    "Ajukan permintaan penghapusan lewat menu Bantuan di aplikasi, atau lewat Bantuan di djiwatentram.web.id. Sebutkan nama dan email akun Djiwa Pay-mu. Kami memprosesnya setelah memastikan akun itu milikmu."] },
];
