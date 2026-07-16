"use client";

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, ArrowLeft, ArrowRight, Loader2, CheckCircle2, FileText } from "lucide-react";
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

// ponytail: hardcoded template — sama dengan __default__ di DB
const CONTRACT_TEMPLATE = `Perjanjian Kerja [{JABATAN}]

Pasal 1 — Para Pihak
Yang bertanda tangan di bawah ini:

1. Djiwa Tentram, berkedudukan di Jalan Bojong Tengah No. 34 dengan Nomor Induk Berusaha (NIB) sesuai dokumen perusahaan, dalam hal ini diwakili oleh Fakhri Azzam, selaku Owner, yang selanjutnya disebut sebagai "PIHAK PERTAMA" atau "Perusahaan".

2. {NAMA}, NIK {NIK}, bertempat tinggal di {ALAMAT}, lahir di {TEMPAT_LAHIR}, {TGL_LAHIR}, yang selanjutnya disebut sebagai "PIHAK KEDUA" atau "Karyawan".

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut "Para Pihak" sepakat untuk mengadakan Perjanjian Kerja dengan ketentuan sebagai berikut.

Pasal 2 — Kedudukan dan Penempatan
(1) PIHAK KEDUA diangkat dan ditempatkan sebagai {JABATAN} di Djiwa Tentram atau lokasi lain yang ditetapkan oleh PIHAK PERTAMA sesuai kebutuhan operasional perusahaan.

(2) PIHAK PERTAMA berhak melakukan mutasi, rotasi, atau promosi jabatan dengan memberikan pemberitahuan tertulis kepada PIHAK KEDUA paling lambat 7 (tujuh) hari sebelum perubahan berlaku.

Pasal 3 — Masa Perjanjian dan Status Kerja
(1) Perjanjian kerja ini berlaku untuk jangka waktu yang ditentukan kemudian, terhitung sejak tanggal mulai kerja.
(2) Status hubungan kerja PIHAK KEDUA adalah {TIPE}.

Pasal 4 — Masa Percobaan (Probation)
(1) PIHAK KEDUA menjalani masa percobaan selama 3 (tiga) bulan.
(2) Selama masa percobaan, PIHAK PERTAMA berhak melakukan evaluasi berkala terhadap kinerja PIHAK KEDUA.

Pasal 5 — Kompensasi
Kompensasi akan ditentukan sesuai kebijakan perusahaan berdasarkan jabatan dan akan dituangkan dalam lampiran terpisah.

Pasal 6 — Waktu Kerja
Waktu kerja ditentukan oleh PIHAK PERTAMA sesuai jadwal shift yang berlaku.

Pasal 7 — Hak dan Kewajiban
PIHAK KEDUA berhak atas gaji, lingkungan kerja aman, cuti, dan perlindungan kerja.
PIHAK KEDUA wajib melaksanakan tugas dengan tanggung jawab, menaati peraturan perusahaan, menjaga kerahasiaan, dan menjaga nama baik perusahaan.

Pasal 8 — Disiplin
Pelanggaran disiplin dikenakan sanksi bertahap: teguran lisan → teguran tertulis → skorsing → PHK.

Pasal 9 — Pengakhiran Hubungan Kerja
Hubungan kerja berakhir karena: berakhirnya kontrak, pengunduran diri (pemberitahuan 30 hari), PHK, atau force majeure.

Pasal 10 — Penutup
Perjanjian ini berlaku setelah ditandatangani oleh Para Pihak.`;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ponytail: padatkan kontrak jadi ringkasan key points buat mobile
function renderSummary(template: string, vars: Record<string, string>): string[] {
  const text = interpolate(template, vars);
  // Ambil heading pasal aja
  return text
    .split("\n")
    .filter((l) => l.startsWith("Pasal") || l.startsWith("Perjanjian"))
    .map((l) => l.trim());
}

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0=form, 1=contract, 2=done
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");  // ponytail: NIK
  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [employmentType, setEmploymentType] = useState("probation");  // ponytail: tipe kontrak
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canNext = name.trim() && phone.trim() && jabatan;

  const contractVars = {
    NAMA: name.trim() || "(nama karyawan)",
    NIK: identityNumber.trim() || "(belum diisi)",
    ALAMAT: address.trim() || "(belum diisi)",
    TGL_LAHIR: birthDate || "(belum diisi)",
    TEMPAT_LAHIR: birthPlace.trim() || "(belum diisi)",
    JABATAN: jabatan.toUpperCase(),
    TIPE: { probation: "Percobaan (Probation)", full_time: "Tetap (Full-Time)", part_time: "Paruh Waktu (Part-Time)" }[employmentType],
  };

  const contractText = interpolate(CONTRACT_TEMPLATE, contractVars);
  const summaryLines = renderSummary(CONTRACT_TEMPLATE, contractVars);

  const submit = async () => {
    if (!canNext || !agree || submitting) return;
    setSubmitting(true);
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const supabase = createClient();
      const { error } = await supabase.from("employee_onboarding_applications").insert({
        full_name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        // ponytail: data diri untuk profile
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
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Pendaftaran Terkirim</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Data kamu akan ditinjau oleh admin. Kamu akan diberi PIN setelah disetujui.
          </p>
          <button onClick={() => navigate({ to: "/login" as any })}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Login
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Step indicator ──
  const steps = ["Data Diri", "Kontrak"];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 }}
        className="w-full max-w-sm">
        {/* Step dots */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${i === step ? "bg-primary text-white" : i < step ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              {step === 0 ? <UserPlus className="h-6 w-6 text-primary" /> : <FileText className="h-6 w-6 text-primary" />}
            </div>
            <h1 className="text-lg font-bold text-foreground">{step === 0 ? "Daftar Karyawan Baru" : "Perjanjian Kerja"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 0 ? "Isi data diri untuk mendaftar" : "Baca dan setujui kontrak kerja"}
            </p>
          </div>

          {/* ── STEP 0: Form ── */}
          {step === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); setStep(1); }} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Lengkap <span className="text-red-400">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap kamu"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.com"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nomor HP <span className="text-red-400">*</span></label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxxxxxx"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" />
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">Disimpan untuk pengembangan sistem login di masa depan</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">NIK / No. Identitas</label>
                <input type="text" value={identityNumber} onChange={(e) => setIdentityNumber(e.target.value.replace(/\D/g, ""))} placeholder="3275xxxxxxxxxxxx"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" inputMode="numeric" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Alamat</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat lengkap"
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tgl Lahir</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tempat Lahir</label>
                  <input type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="Jakarta"
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status Kerja <span className="text-red-400">*</span></label>
                <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required>
                  <option value="probation">Percobaan (Probation)</option>
                  <option value="full_time">Tetap (Full-Time)</option>
                  <option value="part_time">Paruh Waktu (Part-Time)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Jabatan <span className="text-red-400">*</span></label>
                <select value={jabatan} onChange={(e) => setJabatan(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required>
                  <option value="" disabled>Pilih jabatan...</option>
                  {JABATAN_LIST.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                </select>
              </div>
              <button type="submit" disabled={!canNext}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                Lanjut ke Kontrak <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* ── STEP 1: Contract ── */}
          {step === 1 && (
            <div>
              {/* Summary */}
              <div className="mb-3 space-y-1 rounded-xl bg-muted/40 p-3">
                {summaryLines.map((l, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{l}</p>
                ))}
              </div>

              {/* Full contract */}
              <div className="mb-4 max-h-52 overflow-y-auto rounded-xl border border-border/40 bg-muted/20 p-3">
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{contractText}</pre>
              </div>

              {/* Agree */}
              <label className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-muted/10 p-3 cursor-pointer">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-primary" />
                <span className="text-xs text-muted-foreground">
                  Saya telah membaca dan menyetujui Perjanjian Kerja di atas.
                </span>
              </label>

              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setStep(0)}
                  className="flex items-center gap-1 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">
                  <ArrowLeft className="h-3.5 w-3.5" /> Kembali
                </button>
                <button type="button" onClick={submit} disabled={!agree || submitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</> : "Kirim Pendaftaran"}
                </button>
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={() => navigate({ to: "/login" as any })}
          className="mt-3 flex w-full items-center justify-center gap-1 text-sm text-muted-foreground/70 transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Login
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground/40">Djiwa Tentram — Registrasi Karyawan</p>
      </motion.div>
    </div>
  );
}
