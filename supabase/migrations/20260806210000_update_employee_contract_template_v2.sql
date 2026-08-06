BEGIN;
CREATE TABLE IF NOT EXISTS public.pos_site_settings_contract_backup_20260806 AS SELECT * FROM public.pos_site_settings WHERE raw->'employeeOnboarding' ? 'contractTemplatesByRoleId';
UPDATE public.pos_site_settings SET raw=jsonb_set(raw, '{employeeOnboarding,contractTemplatesByRoleId,__default__}', to_jsonb('PERJANJIAN KERJA WAKTU TERTENTU (PKWT)
{{jabatan}}

Nomor dokumen: {{nomor_dokumen}}
Versi dokumen: {{versi_dokumen}}
Tanggal dokumen: {{tanggal_dokumen}}

Pasal 1 — Para Pihak
Yang bertanda tangan di bawah ini:

1. {{nama_perusahaan}}, berkedudukan di {{alamat_perusahaan}} dengan Nomor Induk Berusaha (NIB) {{nib_perusahaan}} dalam hal ini diwakili oleh {{penandatangan}}, selaku {{jabatan_penandatangan}}, yang selanjutnya disebut sebagai "PIHAK PERTAMA" atau "Perusahaan".

2. {{nama_karyawan}}, NIK {{nik}}, bertempat tinggal di {{alamat}}, lahir di {{tempat_lahir}}, {{tanggal_lahir}}, yang selanjutnya disebut sebagai "PIHAK KEDUA" atau "Karyawan".

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut "Para Pihak" sepakat untuk mengadakan Perjanjian Kerja dengan ketentuan sebagai berikut.

Pasal 2 — Kedudukan dan Penempatan
(1) PIHAK KEDUA diangkat dan ditempatkan sebagai {{jabatan}} di {{lokasi_kerja}} atau lokasi lain yang ditetapkan oleh PIHAK PERTAMA sesuai kebutuhan operasional perusahaan.

(2) PIHAK PERTAMA berhak melakukan mutasi, rotasi, atau promosi jabatan dengan pemberitahuan tertulis kepada PIHAK KEDUA dalam waktu yang wajar dan sesuai peraturan yang berlaku.

Pasal 3 — Masa Perjanjian dan Status Kerja
(1) Perjanjian kerja ini berlaku untuk jangka waktu {{durasi_kontrak}} bulan, terhitung mulai {{tanggal_mulai}} sampai dengan {{tanggal_akhir}}.

(2) Status hubungan kerja PIHAK KEDUA adalah {{tipe_kontrak}}.

(3) Perjanjian ini dapat diperpanjang atau diperbarui berdasarkan kesepakatan tertulis Para Pihak sebelum tanggal berakhirnya perjanjian.

(4) Tidak ada perpanjangan otomatis. Setiap perubahan jangka waktu, status, atau ketentuan kerja dituangkan dalam perjanjian baru atau addendum tertulis yang disetujui Para Pihak.

Pasal 4 — Orientasi dan Evaluasi Kerja
(1) Pada masa awal kerja, PIHAK PERTAMA dapat memberikan orientasi, pelatihan, dan evaluasi kerja kepada PIHAK KEDUA sesuai kebutuhan operasional.

(2) Orientasi dan evaluasi kerja merupakan bagian dari proses onboarding dan tidak mengurangi hak PIHAK KEDUA berdasarkan perjanjian ini dan peraturan yang berlaku.

(3) Hasil evaluasi, kelanjutan hubungan kerja, dan keputusan Para Pihak akan disampaikan secara wajar dan diproses sesuai ketentuan perjanjian serta peraturan perundang-undangan yang berlaku.

Pasal 5 — Kompensasi dan Tunjangan
{{kompensasi_body}}

Pembayaran kompensasi dilakukan sesuai jadwal payroll perusahaan melalui metode pembayaran yang disepakati Para Pihak. Bonus, insentif, dan tunjangan tambahan apabila tersedia mengikuti ketentuan perusahaan yang diinformasikan kepada PIHAK KEDUA.

Pasal 6 — Waktu Kerja
(1) Waktu kerja ditentukan oleh PIHAK PERTAMA sesuai kebutuhan operasional dan peraturan yang berlaku, dengan memperhatikan jadwal shift, waktu istirahat, dan ketentuan kerja yang diinformasikan kepada PIHAK KEDUA.

(2) PIHAK KEDUA wajib mematuhi jadwal kerja yang ditetapkan dan hadir tepat waktu.

(3) Setiap perubahan jadwal kerja akan diberitahukan oleh PIHAK PERTAMA dalam waktu yang wajar.

(4) Pekerjaan di luar jadwal normal, pada hari istirahat, atau pada hari libur harus mendapatkan persetujuan PIHAK PERTAMA dan diproses sesuai ketentuan lembur serta peraturan yang berlaku.

Pasal 7 — Hak dan Kewajiban PIHAK KEDUA
PIHAK KEDUA berhak atas:
a) Gaji dan tunjangan sebagaimana diatur dalam Pasal 5;
b) Pembayaran sesuai jadwal payroll yang disepakati;
c) Lingkungan kerja yang aman dan layak;
d) Cuti, waktu istirahat, jaminan sosial, dan tunjangan hari raya sesuai peraturan yang berlaku;
e) Perlindungan keselamatan dan kesehatan kerja.

PIHAK KEDUA berkewajiban untuk:
a) Melaksanakan tugas dan pekerjaan dengan penuh tanggung jawab, jujur, dan disiplin;
b) Menaati seluruh peraturan, SOP, dan kebijakan perusahaan;
c) Menjaga kerahasiaan data, informasi, dan rahasia dagang perusahaan;
d) Menjaga nama baik dan citra perusahaan;
e) Melaporkan segala hambatan atau masalah dalam pekerjaan kepada atasan;
f) Menggunakan aset dan fasilitas perusahaan dengan bijak dan bertanggung jawab.

Pasal 8 — Hak dan Kewajiban PIHAK PERTAMA
PIHAK PERTAMA berhak untuk:
a) Mengevaluasi dan menilai kinerja PIHAK KEDUA secara berkala;
b) Mengenakan sanksi yang proporsional atas pelanggaran yang dilakukan PIHAK KEDUA;
c) Mengakhiri hubungan kerja sesuai dengan ketentuan peraturan perundang-undangan.

PIHAK PERTAMA berkewajiban untuk:
a) Membayar kompensasi tepat waktu sesuai dengan ketentuan Pasal 5;
b) Menyediakan sarana dan lingkungan kerja yang layak dan aman;
c) Memberikan pelatihan dan pengembangan yang diperlukan.

Pasal 9 — Kerahasiaan
(1) PIHAK KEDUA wajib menjaga kerahasiaan seluruh informasi, data, dokumen, dan rahasia dagang PIHAK PERTAMA yang diperoleh selama menjalankan pekerjaan.

(2) Kewajiban kerahasiaan ini tetap berlaku untuk jangka waktu 2 (dua) tahun setelah berakhirnya hubungan kerja.

(3) Pelanggaran terhadap ketentuan kerahasiaan ini dapat mengakibatkan sanksi sesuai dengan ketentuan perusahaan dan/atau tuntutan hukum sesuai peraturan perundang-undangan.

Pasal 10 — Disiplin dan Tata Tertib
(1) PIHAK KEDUA wajib mematuhi seluruh peraturan disiplin dan tata tertib yang ditetapkan oleh PIHAK PERTAMA.

(2) Pelanggaran disiplin akan dikenakan sanksi secara proporsional dan bertahap sesuai kebijakan perusahaan serta peraturan yang berlaku, antara lain:
a) Teguran lisan;
b) Teguran tertulis;
c) Skorsing; dan/atau
d) Tindakan lain sesuai ketentuan yang berlaku.

(3) Ketidakhadiran tanpa keterangan akan dicatat dan ditindaklanjuti melalui upaya komunikasi serta klarifikasi kepada PIHAK KEDUA sebelum keputusan lebih lanjut diambil sesuai peraturan yang berlaku.

Pasal 11 — Pengakhiran Hubungan Kerja
(1) Hubungan kerja dapat berakhir karena berakhirnya jangka waktu perjanjian, pengunduran diri, kesepakatan Para Pihak, keadaan memaksa, atau alasan lain sesuai peraturan yang berlaku.

(2) PIHAK KEDUA yang akan mengundurkan diri wajib menyampaikan permohonan secara tertulis sesuai jangka waktu dan tata cara yang ditetapkan oleh peraturan yang berlaku atau kebijakan perusahaan.

(3) Segala hak dan kewajiban Para Pihak atas pengakhiran hubungan kerja akan diselesaikan sesuai peraturan perundang-undangan yang berlaku.

Pasal 12 — Penyelesaian Perselisihan
(1) Apabila terjadi perselisihan antara Para Pihak, kedua belah pihak sepakat untuk menyelesaikannya secara musyawarah untuk mencapai mufakat terlebih dahulu.

(2) Apabila tidak tercapai kesepakatan melalui musyawarah, Para Pihak sepakat untuk menyelesaikan perselisihan melalui mekanisme yang diatur dalam peraturan perundang-undangan yang berlaku di bidang ketenagakerjaan.

Pasal 13 — Penutup
(1) Perjanjian ini dibuat dalam rangkap 2 (dua) atau tersedia dalam bentuk elektronik, masing-masing untuk Para Pihak dan memiliki kekuatan sesuai peraturan yang berlaku.

(2) Hal-hal yang belum diatur dalam perjanjian ini akan diatur kemudian melalui addendum yang merupakan satu kesatuan dan bagian yang tidak terpisahkan dari perjanjian ini.

(3) Perjanjian ini berlaku setelah ditandatangani oleh Para Pihak dan disetujui oleh admin/perwakilan perusahaan.

(4) Tanda tangan elektronik, waktu penandatanganan, nomor dokumen, dan versi dokumen dicatat sebagai bagian dari metadata kontrak.

Lampiran A — Uraian Jabatan
Jabatan: {{jabatan}}

PIHAK KEDUA melaksanakan tugas sesuai uraian jabatan, SOP, arahan atasan, dan kebutuhan operasional PIHAK PERTAMA. Uraian tugas dapat diperbarui secara wajar sesuai kebutuhan operasional tanpa mengubah status hubungan kerja.

Lampiran B — Kompensasi dan Insentif
Rincian kompensasi mengikuti Pasal 5. Bonus atau insentif, apabila tersedia, mengikuti pencapaian target dan kebijakan perusahaan yang diinformasikan kepada PIHAK KEDUA. Perubahan skema bonus berlaku untuk periode berikutnya setelah disampaikan kepada PIHAK KEDUA.'::text), true) WHERE raw->'employeeOnboarding' ? 'contractTemplatesByRoleId';
WITH source AS (
  SELECT _id, raw->'employeeOnboarding'->'contractTemplatesByRoleId' AS templates,
    raw->'employeeOnboarding'->'contractTemplatesByRoleId'->>'__default__' AS default_template
  FROM public.pos_site_settings
), rebuilt AS (
  SELECT s._id, jsonb_object_agg(k.key, to_jsonb(s.default_template)) AS templates
  FROM source s CROSS JOIN LATERAL jsonb_object_keys(s.templates) AS k(key)
  GROUP BY s._id
)
UPDATE public.pos_site_settings t
SET raw=jsonb_set(t.raw, '{employeeOnboarding,contractTemplatesByRoleId}', rebuilt.templates, true)
FROM rebuilt WHERE t._id=rebuilt._id;
UPDATE public.pos_site_settings t
SET raw=jsonb_set(t.raw, '{employeeOnboarding,contractTemplatesByRoleId}', (
  SELECT jsonb_object_agg(e.key,
    CASE WHEN e.value::text LIKE '%Penandatanganan%' THEN e.value
    ELSE to_jsonb((e.value #>> '{}') || E'\\n\\nPenandatanganan\\nDibuat di Tasikmalaya, pada tanggal {{tanggal_dokumen}}.\\n\\nDengan menandatangani perjanjian ini, Para Pihak menyatakan telah membaca, memahami, dan menyetujui seluruh isi perjanjian tanpa paksaan dari pihak mana pun.'::text)
    END)
  FROM jsonb_each(t.raw->'employeeOnboarding'->'contractTemplatesByRoleId') e
), true)
WHERE t.raw->'employeeOnboarding' ? 'contractTemplatesByRoleId';
COMMIT;
