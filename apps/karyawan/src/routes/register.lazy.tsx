"use client";

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { UserPlus, ArrowLeft, ArrowRight, Loader2, Check, CheckCircle2, FileText, Pen, Eraser } from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/register")({
  component: RegisterPage,
});

const JABATAN_LIST = [
  { value: "barista", label: "Barista" },
  { value: "kitchen", label: "Kitchen" },
  { value: "kasir", label: "Kasir" },
] as const;

const STAFF_ROLE_ID = "role_4f72262209bd";

// ── Template Kontrak Profesional (16 Pasal) ──
const CONTRACT_TEMPLATE = `Perjanjian Kerja [{JABATAN}]

Pasal 1 — Para Pihak
Yang bertanda tangan di bawah ini:

1. Djiwa Tentram, berkedudukan di Jalan Bojong Tengah No. 34 dengan Nomor Induk Berusaha (NIB) sesuai dokumen perusahaan, dalam hal ini diwakili oleh Fakhri Azzam, selaku Owner, yang selanjutnya disebut sebagai "PIHAK PERTAMA" atau "Perusahaan".

2. {NAMA}, NIK {NIK}, bertempat tinggal di {ALAMAT}, lahir di {TEMPAT_LAHIR}, {TGL_LAHIR}, yang selanjutnya disebut sebagai "PIHAK KEDUA" atau "Karyawan".

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut "Para Pihak" sepakat untuk mengadakan Perjanjian Kerja dengan ketentuan sebagai berikut.

Pasal 2 — Kedudukan dan Penempatan
(1) PIHAK KEDUA diangkat dan ditempatkan sebagai {JABATAN} di Djiwa Tentram atau lokasi lain yang ditetapkan oleh PIHAK PERTAMA sesuai kebutuhan operasional perusahaan.
(2) PIHAK PERTAMA berhak melakukan mutasi, rotasi, atau promosi jabatan dengan memberikan pemberitahuan tertulis kepada PIHAK KEDUA paling lambat 7 (tujuh) hari sebelum perubahan berlaku.
(3) Dalam hal mutasi ke lokasi yang berbeda, PIHAK PERTAMA akan memberikan kompensasi atau dukungan relokasi sesuai kebijakan perusahaan.

Pasal 3 — Masa Perjanjian dan Status Kerja
(1) Perjanjian kerja ini berlaku untuk jangka waktu 1 (satu) tahun, terhitung sejak tanggal mulai kerja yang ditetapkan oleh PIHAK PERTAMA, dan dapat diperpanjang berdasarkan evaluasi kinerja.
(2) Status hubungan kerja PIHAK KEDUA adalah {TIPE}.
(3) Perpanjangan perjanjian akan dikomunikasikan secara tertulis paling lambat 30 (tiga puluh) hari sebelum masa berlaku berakhir.

Pasal 4 — Masa Training
(1) PIHAK KEDUA menjalani masa training selama 1 (satu) bulan terhitung sejak tanggal mulai kerja.
(2) Selama masa training, PIHAK PERTAMA berhak melakukan evaluasi berkala terhadap kinerja, disiplin, dan kepatuhan PIHAK KEDUA terhadap peraturan perusahaan.
(3) PIHAK PERTAMA berhak mengakhiri hubungan kerja selama masa training dengan pemberitahuan 7 (tujuh) hari sebelumnya, tanpa kewajiban memberikan kompensasi tambahan di luar hak yang telah menjadi kewajiban perusahaan.
(4) Setelah masa training dinyatakan lulus, status PIHAK KEDUA dikonfirmasi sesuai Pasal 3 ayat (2).

Pasal 5 — Kompensasi dan Tunjangan
(1) Gaji Pokok ditetapkan berdasarkan jabatan dan akan diinformasikan secara terpisah dalam lampiran kompensasi yang merupakan bagian tidak terpisahkan dari perjanjian ini.
(2) Tunjangan Transportasi diberikan sesuai kebijakan perusahaan dan dibayarkan bersamaan dengan gaji pokok.
(3) Bonus Kinerja diberikan berdasarkan pencapaian target yang ditetapkan oleh PIHAK PERTAMA dan dievaluasi setiap periode tertentu.
(4) Pembayaran gaji dan tunjangan dilakukan setiap akhir bulan melalui transfer bank ke rekening yang didaftarkan oleh PIHAK KEDUA.

Pasal 6 — Waktu Kerja
(1) Waktu kerja mengikuti jadwal shift yang ditetapkan oleh PIHAK PERTAMA sesuai kebutuhan operasional outlet.
(2) Jam operasional perusahaan adalah setiap hari Senin sampai dengan Minggu, dengan pembagian shift yang diatur oleh Manajer Operasional.
(3) Setiap shift memiliki durasi maksimal 8 (delapan) jam kerja dan 1 (satu) jam istirahat.
(4) PIHAK KEDUA wajib hadir tepat waktu sesuai jadwal shift yang telah ditentukan. Keterlambatan lebih dari 15 (lima belas) menit dikenakan sanksi sesuai peraturan perusahaan.
(5) Perubahan jadwal shift akan diinformasikan minimal 1 (satu) hari sebelumnya, kecuali dalam keadaan darurat.

Pasal 7 — Cuti dan Waktu Istirahat
(1) Cuti Tahunan: PIHAK KEDUA berhak atas cuti tahunan selama 12 (dua belas) hari kerja setelah masa kerja mencapai 1 (satu) tahun secara terus-menerus.
(2) Cuti Sakit: PIHAK KEDUA berhak atas cuti sakit dengan melampirkan surat keterangan dokter yang sah.
(3) Cuti Khusus: PIHAK KEDUA berhak atas cuti karena pernikahan (3 hari), pernikahan anak (2 hari), khitanan/pembaptisan anak (2 hari), istri melahirkan/keguguran (2 hari), anggota keluarga meninggal (2 hari), dan anggota serumah meninggal (1 hari).
(4) Cuti Melahirkan: PIHAK KEDUA perempuan berhak atas cuti melahirkan selama 3 (tiga) bulan sesuai ketentuan peraturan perundang-undangan yang berlaku.
(5) Cuti di luar ketentuan di atas dapat dinegosiasikan dengan PIHAK PERTAMA dan wajib mendapatkan persetujuan tertulis.

Pasal 8 — Hak dan Kewajiban Karyawan
(1) PIHAK KEDUA berhak untuk:
    a. Menerima gaji, tunjangan, dan kompensasi lainnya tepat waktu;
    b. Mendapatkan lingkungan kerja yang aman, nyaman, dan sehat;
    c. Mendapatkan cuti sesuai ketentuan dalam perjanjian ini;
    d. Mendapatkan perlindungan keselamatan dan kesehatan kerja;
    e. Mendapatkan kesempatan pengembangan diri dan karier;
    f. Mendapatkan perlakukan yang adil tanpa diskriminasi.
(2) PIHAK KEDUA wajib untuk:
    a. Melaksanakan tugas dan tanggung jawab dengan itikad baik, jujur, dan profesional;
    b. Menaati seluruh peraturan perusahaan, SOP, dan kode etik yang berlaku;
    c. Menjaga kerahasiaan data perusahaan, pelanggan, dan informasi bisnis;
    d. Menjaga dan merawat aset perusahaan yang dipercayakan;
    e. Menjaga nama baik perusahaan di dalam maupun di luar lingkungan kerja;
    f. Berpakaian rapi dan menjaga kebersihan diri sesuai standar perusahaan;
    g. Mengikuti pelatihan dan pengembangan yang diselenggarakan oleh perusahaan.

Pasal 9 — Hak dan Kewajiban Perusahaan
(1) PIHAK PERTAMA berhak untuk:
    a. Mengatur dan mengawasi pelaksanaan pekerjaan PIHAK KEDUA;
    b. Menetapkan target dan standar kinerja yang harus dicapai;
    c. Memberikan sanksi atas pelanggaran disiplin sesuai peraturan perusahaan;
    d. Melakukan evaluasi kinerja secara berkala;
    e. Mengubah struktur organisasi dan penempatan kerja sesuai kebutuhan bisnis.
(2) PIHAK PERTAMA wajib untuk:
    a. Membayar gaji dan tunjangan tepat waktu;
    b. Menyediakan lingkungan kerja yang aman dan sehat;
    c. Memberikan perlindungan keselamatan kerja sesuai peraturan perundang-undangan;
    d. Memberikan pembinaan dan pengembangan kompetensi.

Pasal 10 — Kerahasiaan dan Perlindungan Data
(1) PIHAK KEDUA wajib menjaga kerahasiaan seluruh informasi perusahaan termasuk namun tidak terbatas pada resep, data keuangan, strategi bisnis, data pelanggan, data karyawan, dan informasi rahasia lainnya yang diketahui selama masa kerja.
(2) Kewajiban kerahasiaan ini tetap berlaku meskipun hubungan kerja telah berakhir, tanpa batas waktu.
(3) PIHAK KEDUA dilarang memperbanyak, menggandakan, menyimpan secara pribadi, atau menyebarluaskan dokumen dan informasi rahasia perusahaan tanpa izin tertulis dari PIHAK PERTAMA.
(4) PIHAK PERTAMA berhak menuntut ganti rugi secara hukum atas pelanggaran ketentuan kerahasiaan ini.

Pasal 11 — Larangan Rangkap Jabatan dan Benturan Kepentingan
(1) Selama masa kerja, PIHAK KEDUA dilarang bekerja di tempat lain atau menjalankan usaha yang dapat menimbulkan benturan kepentingan dengan bisnis PIHAK PERTAMA.
(2) PIHAK KEDUA wajib melaporkan kepada PIHAK PERTAMA apabila terdapat potensi benturan kepentingan dalam pelaksanaan tugasnya.
(3) PIHAK KEDUA dilarang menggunakan fasilitas, aset, atau informasi perusahaan untuk kepentingan pribadi atau pihak ketiga tanpa izin tertulis.
(4) Selama 6 (enam) bulan setelah berakhirnya hubungan kerja, PIHAK KEDUA tidak diperkenankan bekerja atau membuka usaha sejenis dalam radius 5 (lima) kilometer dari lokasi operasional PIHAK PERTAMA.

Pasal 12 — Disiplin dan Sanksi
(1) PIHAK KEDUA wajib mematuhi peraturan perusahaan, instruksi atasan, dan ketentuan dalam perjanjian ini.
(2) Pelanggaran disiplin kerja akan dikenakan sanksi secara bertahap sesuai tingkat pelanggaran:
    a. Pelanggaran Ringan: Teguran lisan dan pembinaan;
    b. Pelanggaran Sedang: Surat Peringatan (SP1, SP2, SP3);
    c. Pelanggaran Berat: Skorsing hingga Pemutusan Hubungan Kerja (PHK).
(3) Jenis pelanggaran berat yang dapat mengakibatkan PHK langsung meliputi: pencurian, penggelapan, penipuan, kekerasan di tempat kerja, pelanggaran kerahasiaan berat, dan tindakan yang merugikan perusahaan secara signifikan.

Pasal 13 — Pengakhiran Hubungan Kerja
(1) Hubungan kerja antara PIHAK PERTAMA dan PIHAK KEDUA berakhir karena:
    a. Berakhirnya jangka waktu perjanjian dan tidak diperpanjang;
    b. Pengunduran diri PIHAK KEDUA dengan pemberitahuan tertulis minimal 30 (tiga puluh) hari sebelumnya;
    c. Pemutusan Hubungan Kerja (PHK) oleh PIHAK PERTAMA sesuai peraturan perundang-undangan;
    d. PIHAK KEDUA meninggal dunia;
    e. PIHAK KEDUA memasuki usia pensiun sesuai ketentuan perusahaan;
    f. Keadaan memaksa (force majeure) yang mengakibatkan perjanjian tidak dapat dilaksanakan.
(2) Dalam hal pengunduran diri, PIHAK KEDUA wajib menyelesaikan seluruh tanggung jawab dan melakukan serah terima pekerjaan sebelum tanggal efektif pengunduran diri.
(3) Apabila PIHAK KEDUA mengundurkan diri atau mengakhiri hubungan kerja sebelum jangka waktu perjanjian berakhir (1 tahun), PIHAK KEDUA wajib membayar ganti rugi kepada PIHAK PERTAMA sebesar 1 (satu) kali Gaji Pokok sebagai kompensasi atas biaya rekrutmen, pelatihan, dan kerugian operasional yang ditimbulkan.
(4) Dalam hal PHK, PIHAK PERTAMA wajib memberikan hak-hak PIHAK KEDUA sesuai peraturan perundang-undangan yang berlaku.

Pasal 14 — Penyelesaian Perselisihan
(1) Segala perselisihan yang timbul dari pelaksanaan perjanjian ini akan diselesaikan secara musyawarah untuk mencapai mufakat antara Para Pihak.
(2) Apabila musyawarah tidak mencapai kesepakatan, Para Pihak akan menempuh mediasi melalui Dinas Ketenagakerjaan setempat.
(3) Apabila mediasi tidak berhasil, Para Pihak sepakat untuk menyelesaikan perselisihan melalui Pengadilan Hubungan Industrial pada Pengadilan Negeri yang berwenang.

Pasal 15 — Force Majeure
(1) Force majeure adalah kejadian di luar kendali Para Pihak yang timbul setelah ditandatanganinya perjanjian ini, yang mengakibatkan salah satu atau Para Pihak tidak dapat memenuhi kewajibannya, termasuk namun tidak terbatas pada: bencana alam, kebakaran, banjir, gempa bumi, wabah penyakit, perang, huru-hara, sabotase, pemogokan umum, dan perubahan peraturan pemerintah yang berdampak langsung pada operasional perusahaan.
(2) Dalam keadaan force majeure, Para Pihak dibebaskan dari tanggung jawab atas tidak terlaksananya kewajiban dalam perjanjian ini selama keadaan force majeure berlangsung.
(3) Para Pihak wajib memberitahukan secara tertulis dalam waktu 7 (tujuh) hari sejak terjadinya force majeure.

Pasal 16 — Ketentuan Penutup
(1) Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing memiliki kekuatan hukum yang sama, ditandatangani oleh Para Pihak dan masing-masing pihak memegang 1 (satu) salinan.
(2) Hal-hal yang belum diatur atau belum cukup diatur dalam perjanjian ini akan ditentukan kemudian oleh Para Pihak secara musyawarah dan akan dituangkan dalam bentuk addendum yang merupakan bagian tidak terpisahkan dari perjanjian ini.
(3) Apabila di kemudian hari terdapat kekeliruan atau perubahan dalam perjanjian ini, Para Pihak sepakat untuk melakukan perbaikan sebagaimana mestinya.
(4) Perjanjian ini tunduk dan diatur berdasarkan hukum dan peraturan perundang-undangan yang berlaku di Negara Republik Indonesia.

Demikian perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani, tanpa ada paksaan dari pihak mana pun, untuk dilaksanakan dengan penuh tanggung jawab.`;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function parsePasal(text: string): { title: string; body: string }[] {
  return text
    .split(/\n(?=Pasal \d|Perjanjian)/)
    .filter((b) => b.trim())
    .map((b) => {
      const nl = b.indexOf("\n");
      return nl === -1
        ? { title: b.trim(), body: "" }
        : { title: b.substring(0, nl).trim(), body: b.substring(nl + 1).trim() };
    });
}

function RegisterPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0); // 0=form, 1=contract, 2=done
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [employmentType, setEmploymentType] = useState("probation");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canNext = name.trim() && phone.trim() && jabatan;
  const canSubmit = signatureData !== null;

  const contractVars = {
    NAMA: name.trim() || "(nama karyawan)",
    NIK: identityNumber.trim() || "(belum diisi)",
    ALAMAT: address.trim() || "(belum diisi)",
    TGL_LAHIR: birthDate || "(belum diisi)",
    TEMPAT_LAHIR: birthPlace.trim() || "(belum diisi)",
    JABATAN: jabatan.toUpperCase(),
    TIPE: { probation: "Percobaan (Probation)", full_time: "Tetap (Full-Time)", part_time: "Paruh Waktu (Part-Time)" }[employmentType] ?? "Percobaan (Probation)",
  };

  const contractText = interpolate(CONTRACT_TEMPLATE, contractVars);
  const pasalBlocks = parsePasal(contractText);

  // ── Signature pad handlers ──
  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      setIsDrawing(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let point: { x: number; y: number };
      if ("touches" in e) {
        const touch = e.touches[0];
        point = getCanvasPoint(touch.clientX, touch.clientY);
      } else {
        point = getCanvasPoint(e.clientX, e.clientY);
      }

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [getCanvasPoint]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Prevent scrolling on touch devices while drawing
      if ("touches" in e) e.preventDefault();

      let point: { x: number; y: number };
      if ("touches" in e) {
        const touch = e.touches[0];
        point = getCanvasPoint(touch.clientX, touch.clientY);
      } else {
        point = getCanvasPoint(e.clientX, e.clientY);
      }

      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [isDrawing, getCanvasPoint]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.closePath();

    // Check if canvas has actual drawing content
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasPixels = imageData.data.some((v) => v !== 0);
    if (hasPixels) {
      setSignatureData(canvas.toDataURL("image/png"));
    }
  }, [isDrawing]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  }, []);

  const submit = async () => {
    if (!canNext || !canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const supabase = createClient();
      const { error } = await supabase.from("employee_onboarding_applications").insert({
        full_name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        identity_number: identityNumber.trim() || null,
        address: address.trim() || null,
        birth_date: birthDate || null,
        birth_place: birthPlace.trim() || null,
        status: "pending",
        employment: {
          roleId: STAFF_ROLE_ID,
          roleName: "STAFF",
          slug,
          username: slug,
          jabatan,
          selfRegistered: true,
          employmentType,
          registeredAt: new Date().toISOString(),
        },
        contract: {
          title: `Perjanjian Kerja [${jabatan.toUpperCase()}]`,
          agreedAt: new Date().toISOString(),
          templateUsed: "__default__",
          signature: signatureData,
        },
        emergency_contact: {},
        attachments: {},
        raw: { password },
      });
      if (error) throw error;
      setStep(2);
      toast.success("Pendaftaran berhasil! Admin akan meninjau data kamu.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal mendaftar, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Done ──
  if (step === 2) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Pendaftaran Terkirim</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Data kamu akan ditinjau oleh admin. Kamu akan diberi PIN setelah disetujui.
          </p>
          <button
            onClick={() => navigate({ to: "/login" as any })}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Login
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Step indicator ──
  const steps = ["Data Diri", "Kontrak"];
  return (
    <div
      className={`flex min-h-dvh bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 ${
        step === 1 ? "items-start" : "items-center justify-center"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 }}
        className={`w-full ${step === 1 ? "max-w-sm mt-4" : "max-w-sm"}`}
      >
        {/* Step dots */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i === step
                    ? "bg-primary text-white"
                    : i < step
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {s}
              </span>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-lg">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              {step === 0 ? (
                <UserPlus className="h-6 w-6 text-primary" />
              ) : (
                <FileText className="h-6 w-6 text-primary" />
              )}
            </div>
            <h1 className="text-lg font-bold text-foreground">
              {step === 0 ? "Daftar Karyawan Baru" : "Perjanjian Kerja"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 0
                ? "Isi data diri untuk mendaftar"
                : "Baca, tanda tangani, dan setujui kontrak kerja"}
            </p>
          </div>

          {/* ── STEP 0: Form ── */}
          {step === 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep(1);
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nama Lengkap <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap kamu"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nomor HP <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  Disimpan untuk pengembangan sistem login di masa depan
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  NIK / No. Identitas
                </label>
                <input
                  type="text"
                  value={identityNumber}
                  onChange={(e) => setIdentityNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="3275xxxxxxxxxxxx"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Alamat</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Alamat lengkap"
                  className="w-full resize-none rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  rows={2}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tgl Lahir</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Tempat Lahir
                  </label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="Jakarta"
                    className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Status Kerja <span className="text-red-400">*</span>
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  required
                >
                  <option value="probation">Percobaan (Probation)</option>
                  <option value="full_time">Tetap (Full-Time)</option>
                  <option value="part_time">Paruh Waktu (Part-Time)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Jabatan <span className="text-red-400">*</span>
                </label>
                <select
                  value={jabatan}
                  onChange={(e) => setJabatan(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  required
                >
                  <option value="" disabled>
                    Pilih jabatan...
                  </option>
                  {JABATAN_LIST.map((j) => (
                    <option key={j.value} value={j.value}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={!canNext}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lanjut ke Kontrak <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* ── STEP 1: Contract — Paper Document ── */}
          {step === 1 && (
            <div className="space-y-3" style={{ perspective: "1200px" }}>
              {/* Paper document with page-flip animation */}
              <motion.div
                initial={{ rotateY: 80, opacity: 0, scale: 0.92 }}
                animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: "left center" }}
                className="relative overflow-hidden rounded-lg border border-amber-200/50 bg-[#fefcf6] shadow-[0_8px_30px_-6px_rgba(120,80,30,0.15)]"
              >
                {/* Paper grain texture */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.025]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 3px, #8b6914 3px, #8b6914 3.5px)",
                  }}
                />

                {/* Decorative header */}
                <div className="relative border-b border-double border-amber-200/50 px-5 pb-4 pt-5 text-center">
                  <div className="mx-auto mb-2 flex items-center justify-center gap-2">
                    <div className="h-px w-8 bg-amber-300/50" />
                    <span className="font-serif text-[11px] uppercase tracking-[0.2em] text-amber-600/50">
                      Djiwa Tentram
                    </span>
                    <div className="h-px w-8 bg-amber-300/50" />
                  </div>
                  <h3 className="font-serif text-sm font-bold tracking-wide text-amber-900">
                    PERJANJIAN KERJA
                  </h3>
                  <p className="mt-0.5 font-serif text-[10px] italic text-amber-700/50">
                    {jabatan.toUpperCase()}
                  </p>
                </div>

                {/* Contract body — tall scrollable for mobile reading */}
                <div className="relative max-h-[calc(100dvh-420px)] overflow-y-auto px-5 py-3 scrollbar-thin">
                  {pasalBlocks.map((pasal, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + i * 0.06, duration: 0.35 }}
                      className="mb-3"
                    >
                      <h4 className="font-serif text-[11px] font-bold leading-tight text-amber-900">
                        {pasal.title}
                      </h4>
                      {pasal.body && (
                        <p className="mt-0.5 font-serif text-[10px] leading-[1.65] text-stone-600 whitespace-pre-wrap">
                          {pasal.body}
                        </p>
                      )}
                    </motion.div>
                  ))}

                  {/* Page fold shadow at bottom */}
                  <div className="pointer-events-none sticky bottom-0 -mx-5 h-6 bg-gradient-to-t from-[#fefcf6] to-transparent" />
                </div>

                {/* Signature block — live from canvas */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0, duration: 0.5 }}
                  className="relative border-t border-double border-amber-200/50 px-5 pb-4 pt-3"
                >
                  <div className="flex items-end justify-between">
                    {/* Pihak Pertama */}
                    <div className="text-center min-w-0 flex-1">
                      <div className="mb-5 font-serif text-[10px] font-medium text-stone-400">PIHAK PERTAMA</div>
                      <div className="font-serif text-[11px] font-semibold text-stone-500">Fakhri Azzam</div>
                      <div className="font-serif text-[10px] text-stone-400">Owner</div>
                    </div>

                    {/* Seal / Stamp */}
                    <div className="mx-1 flex-shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-300/30 bg-amber-50/80">
                        <span className="font-serif text-[7px] font-bold uppercase tracking-widest text-amber-400/50">
                          SEAL
                        </span>
                      </div>
                    </div>

                    {/* Pihak Kedua */}
                    <div className="text-center min-w-0 flex-1">
                      <div className="mb-5 font-serif text-[10px] font-medium text-stone-400">PIHAK KEDUA</div>
                      <div className="font-serif text-[11px] font-semibold text-stone-500 truncate">
                        {name.trim() || "(nama)"}
                      </div>
                      <div className="font-serif text-[10px] text-stone-400">{jabatan.toUpperCase()}</div>
                    </div>
                  </div>
                </motion.div>

                {/* Bottom decorative line */}
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
              </motion.div>

              {/* ── Signature Pad ── */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.3 }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Pen className="h-3.5 w-3.5" />
                    Tanda Tangan Digital
                  </label>
                  {signatureData && (
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Eraser className="h-3 w-3" />
                      Hapus
                    </button>
                  )}
                </div>

                <div className="relative rounded-xl border-2 border-dashed border-border/60 bg-white/80 overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={300}
                    height={100}
                    className="w-full h-[100px] touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />

                  {/* Placeholder text */}
                  {!signatureData && !isDrawing && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground/40 font-serif italic">
                        Tanda tangani di sini
                      </span>
                    </div>
                  )}

                  {/* Guide line */}
                  <div className="absolute bottom-4 left-4 right-4 h-px bg-border/40 pointer-events-none" />
                </div>

                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  Dengan membubuhkan tanda tangan digital di atas, PIHAK KEDUA menyatakan telah membaca,
                  memahami, dan menyetujui seluruh isi Perjanjian Kerja tanpa paksaan dari pihak mana pun.
                </p>
              </motion.div>

              {/* Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.3 }}
                className="flex gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    clearSignature();
                    setStep(0);
                  }}
                  className="flex items-center gap-1 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Kembali
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit || submitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Mengirim...
                    </>
                  ) : !canSubmit ? (
                    <>
                      <Pen className="h-3.5 w-3.5" /> Tanda Tangani Dulu
                    </>
                  ) : (
                    "Kirim Pendaftaran"
                  )}
                </button>
              </motion.div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate({ to: "/login" as any })}
          className="mt-3 flex w-full items-center justify-center gap-1 text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Login
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground/40">Djiwa Tentram — Registrasi Karyawan</p>
      </motion.div>
    </div>
  );
}
