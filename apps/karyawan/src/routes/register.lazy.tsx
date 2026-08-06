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

// ── Template Kontrak Profesional (13 Pasal + 2 Lampiran) ──
const CONTRACT_TEMPLATE = `Perjanjian Kerja Waktu Tertentu (PKWT) [{JABATAN}]

Versi dokumen: 2.0
Nomor dokumen dan tanggal efektif ditetapkan pada proses administrasi kontrak.

Pasal 1 — Para Pihak
Yang bertanda tangan di bawah ini:

1. Djiwa Tentram, berkedudukan di Jalan Bojong Tengah No. 34 dengan Nomor Induk Berusaha (NIB) sesuai dokumen perusahaan, dalam hal ini diwakili oleh Fakhri Azzam selaku Owner, yang selanjutnya disebut PIHAK PERTAMA.

2. {NAMA}, NIK {NIK}, bertempat tinggal di {ALAMAT}, lahir di {TEMPAT_LAHIR}, {TGL_LAHIR}, yang selanjutnya disebut PIHAK KEDUA.

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut Para Pihak.

Pasal 2 — Kedudukan dan Penempatan
(1) PIHAK KEDUA ditempatkan sebagai {JABATAN} di Djiwa Tentram atau lokasi lain yang ditetapkan PIHAK PERTAMA sesuai kebutuhan operasional.

(2) Perubahan penempatan, rotasi, atau penyesuaian tugas diberitahukan secara wajar dan tidak mengubah status hubungan kerja tanpa persetujuan atau dasar yang sesuai.

Pasal 3 — Masa Perjanjian dan Status Kerja
(1) Jangka waktu, tanggal mulai, tanggal berakhir, dan rincian kompensasi ditetapkan dalam dokumen administrasi kontrak dan/atau lampiran yang menjadi bagian tidak terpisahkan dari perjanjian ini.

(2) Status hubungan kerja PIHAK KEDUA adalah {TIPE}.

(3) Perpanjangan atau pembaruan hanya berlaku berdasarkan persetujuan tertulis Para Pihak sebelum masa perjanjian berakhir. Tidak ada perpanjangan otomatis.

Pasal 4 — Orientasi dan Evaluasi Kerja
(1) Pada masa awal kerja, PIHAK PERTAMA dapat memberikan orientasi, pelatihan, dan evaluasi kerja sesuai kebutuhan operasional.

(2) Orientasi dan evaluasi merupakan bagian dari onboarding dan tidak mengurangi hak PIHAK KEDUA berdasarkan perjanjian ini dan peraturan yang berlaku.

(3) Hasil evaluasi dan keputusan lanjutan disampaikan secara wajar serta diproses sesuai perjanjian dan peraturan yang berlaku.

Pasal 5 — Kompensasi dan Tunjangan
(1) Gaji, tunjangan transportasi, rate shift, bonus, dan insentif ditetapkan dalam lampiran kompensasi atau dokumen administrasi yang disepakati Para Pihak.

(2) Pembayaran dilakukan sesuai jadwal payroll perusahaan melalui metode pembayaran yang disepakati.

(3) Perubahan skema bonus atau insentif berlaku untuk periode berikutnya setelah disampaikan kepada PIHAK KEDUA.

Pasal 6 — Waktu Kerja
(1) Waktu kerja mengikuti jadwal shift yang ditetapkan PIHAK PERTAMA dengan memperhatikan waktu istirahat dan peraturan yang berlaku.

(2) PIHAK KEDUA wajib hadir tepat waktu dan mematuhi jadwal kerja.

(3) Pekerjaan di luar jadwal normal, pada hari istirahat, atau pada hari libur harus mendapatkan persetujuan dan diproses sesuai ketentuan lembur serta peraturan yang berlaku.

Pasal 7 — Hak dan Kewajiban PIHAK KEDUA
PIHAK KEDUA berhak atas pembayaran sesuai kesepakatan, lingkungan kerja yang aman dan layak, cuti, waktu istirahat, jaminan sosial, tunjangan hari raya, serta perlindungan keselamatan dan kesehatan kerja sesuai peraturan yang berlaku.

PIHAK KEDUA berkewajiban melaksanakan pekerjaan dengan jujur dan disiplin, menaati SOP dan kebijakan perusahaan, menjaga kerahasiaan data, menjaga aset perusahaan, dan melaporkan hambatan kerja kepada atasan.

Pasal 8 — Hak dan Kewajiban PIHAK PERTAMA
PIHAK PERTAMA berhak mengatur pekerjaan, menetapkan standar operasional, mengevaluasi kinerja, dan mengambil tindakan yang proporsional sesuai peraturan yang berlaku.

PIHAK PERTAMA berkewajiban membayar kompensasi sesuai kesepakatan, menyediakan lingkungan kerja yang layak, dan memenuhi hak PIHAK KEDUA sesuai peraturan yang berlaku.

Pasal 9 — Kerahasiaan dan Perlindungan Data
(1) PIHAK KEDUA wajib menjaga kerahasiaan informasi perusahaan, pelanggan, karyawan, resep, data keuangan, dan informasi bisnis lainnya.

(2) Data pribadi Para Pihak digunakan untuk administrasi hubungan kerja dan diproses dengan memperhatikan ketentuan perlindungan data yang berlaku.

Pasal 10 — Disiplin dan Tata Tertib
(1) PIHAK KEDUA wajib mematuhi peraturan disiplin dan tata tertib perusahaan.

(2) Pelanggaran diproses secara proporsional dan bertahap sesuai kebijakan perusahaan serta peraturan yang berlaku.

(3) Ketidakhadiran tanpa keterangan dicatat dan ditindaklanjuti melalui komunikasi serta klarifikasi sebelum keputusan lebih lanjut diambil sesuai peraturan yang berlaku.

Pasal 11 — Pengakhiran Hubungan Kerja
(1) Hubungan kerja dapat berakhir karena berakhirnya jangka waktu, pengunduran diri, kesepakatan Para Pihak, keadaan memaksa, atau alasan lain sesuai peraturan yang berlaku.

(2) Pengunduran diri dan serah terima pekerjaan dilakukan secara tertulis sesuai tata cara yang berlaku.

(3) Hak dan kewajiban Para Pihak atas pengakhiran hubungan kerja diselesaikan sesuai peraturan perundang-undangan yang berlaku.

Pasal 12 — Penyelesaian Perselisihan
(1) Perselisihan diselesaikan terlebih dahulu melalui musyawarah.

(2) Apabila tidak tercapai kesepakatan, Para Pihak menempuh mekanisme penyelesaian perselisihan sesuai peraturan ketenagakerjaan yang berlaku.

Pasal 13 — Penutup
(1) Perjanjian ini dapat tersedia dalam bentuk cetak maupun elektronik dan masing-masing salinan diperuntukkan bagi Para Pihak.

(2) Hal-hal yang belum diatur dituangkan dalam addendum tertulis yang menjadi bagian tidak terpisahkan dari perjanjian ini.

(3) Tanda tangan, waktu penandatanganan, nomor dokumen, dan versi dokumen dicatat sebagai metadata kontrak.

Lampiran A — Uraian Jabatan
PIHAK KEDUA menjalankan tugas sebagai {JABATAN} sesuai uraian jabatan, SOP, arahan atasan, dan kebutuhan operasional PIHAK PERTAMA.

Lampiran B — Kompensasi dan Insentif
Rincian kompensasi dan insentif mengikuti dokumen administrasi yang disepakati Para Pihak. Perubahan untuk periode berikutnya diberitahukan kepada PIHAK KEDUA.`

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
  const [employmentType, setEmploymentType] = useState("full_time");
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
    TIPE: { full_time: "PKWT - Penuh Waktu", part_time: "PKWT - Paruh Waktu" }[employmentType] ?? "PKWT - Penuh Waktu",
  };

  const contractText = `${interpolate(CONTRACT_TEMPLATE, contractVars)}\n\nDibuat di Tasikmalaya, pada tanggal ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}\n\nDengan menandatangani perjanjian ini, Para Pihak menyatakan telah membaca, memahami, dan menyetujui seluruh isi perjanjian tanpa paksaan dari pihak mana pun.`;
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
          title: `Perjanjian Kerja Waktu Tertentu (PKWT) [${jabatan.toUpperCase()}]`,
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
                  <option value="full_time">PKWT - Penuh Waktu</option>
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
