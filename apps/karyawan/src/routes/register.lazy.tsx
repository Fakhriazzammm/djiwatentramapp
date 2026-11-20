"use client";

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DsButton, DsGoogleButton, DsGroup, DsGroupLabel, DsNote, DsRoot, DsSegmented, ds3d } from "@djiwaapps/web-shared/components/ds";
import { getGoogleSession, linkGoogle, startGoogleLogin } from "@djiwaapps/web-shared/lib/staff-google";
import { useYumiAuth, loginWithYumiPin } from "@djiwaapps/web-shared";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/register")({
  component: RegisterPage,
});

const JABATAN_LIST = [
  { value: "barista", label: "Barista" },
  { value: "kitchen", label: "Kitchen / Chef" },
  { value: "kasir", label: "Kasir" },
  { value: "pelayan", label: "Pelayan / Waiter" },
  { value: "helper_dapur", label: "Helper Dapur" },
  { value: "steward", label: "Steward / Dishwasher" },
  { value: "runner", label: "Food Runner" },
  { value: "host", label: "Host / Greeter" },
  { value: "cleaning", label: "Cleaning Service" },
  { value: "gudang", label: "Staff Gudang" },
  { value: "driver", label: "Driver / Kurir" },
  { value: "security", label: "Security" },
  { value: "admin", label: "Staff Administrasi" },
  { value: "marketing", label: "Marketing & Konten" },
] as const;
const jabatanLabel = (value: string) => JABATAN_LIST.find((j) => j.value === value)?.label ?? value;

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.djiwatentram.web.id"}/functions/v1/staff-register`;

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


function Field({ id, label, req, hint, children }: { id: string; label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="kx-field"><label htmlFor={id}><span>{label}{req && <b style={{ color: "var(--ds-danger)" }}> *</b>}</span></label>{children}{hint && <p className="ds-sub" style={{ margin: "4px 4px 0" }}>{hint}</p>}</div>
  );
}

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Data diri", "Tambahan", "Kontrak"];

function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useYumiAuth();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [identityNumber, setIdentityNumber] = useState("");
  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time">("full_time");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openPasal, setOpenPasal] = useState<number | null>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  // Datang dari "Daftar dengan Google": isi nama + email dari akun Google, hubungkan setelah akun jadi.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("google")) return;
    void getGoogleSession().then((s) => {
      if (s.authenticated && !s.linked) { setGoogleEmail(s.profile.email); setName((n) => n || s.profile.name); setEmail((e) => e || s.profile.email); }
    }).catch(() => undefined);
  }, []);

  const pinOk = /^\d{6}$/.test(pin) && pin === pin2;
  const step0Ok = name.trim().length >= 3 && /^\+?\d[\d\s-]{7,}$/.test(phone.trim()) && !!jabatan && pinOk;
  const pinHint = pin.length > 0 && pin.length < 6 ? "PIN harus 6 digit" : pin2 && pin !== pin2 ? "PIN belum sama" : "Dipakai untuk masuk dan absen. Jangan dibagikan.";

  const vars = {
    NAMA: name.trim() || "(nama karyawan)", NIK: identityNumber.trim() || "(belum diisi)", ALAMAT: address.trim() || "(belum diisi)",
    TGL_LAHIR: birthDate || "(belum diisi)", TEMPAT_LAHIR: birthPlace.trim() || "(belum diisi)", JABATAN: jabatanLabel(jabatan).toUpperCase(),
    TIPE: employmentType === "part_time" ? "PKWT - Paruh Waktu" : "PKWT - Penuh Waktu",
  };
  const contractText = `${interpolate(CONTRACT_TEMPLATE, vars)}\n\nDibuat di Tasikmalaya, pada tanggal ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}\n\nDengan menandatangani perjanjian ini, Para Pihak menyatakan telah membaca, memahami, dan menyetujui seluruh isi perjanjian tanpa paksaan dari pihak mana pun.`;
  const pasal = parsePasal(contractText);

  // ── Tanda tangan (pointer events: mouse, sentuh, pena) ──
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || step !== 2) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.scale(ratio, ratio); ctx.strokeStyle = "#0f2347"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; }
  }, [step]);
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { const ctx = e.currentTarget.getContext("2d"); if (!ctx) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const p = pt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d"); if (!ctx) return; const p = pt(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; drawing.current = false; setSignature(e.currentTarget.toDataURL("image/png")); };
  const clearSig = () => { const c = canvasRef.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); setSignature(null); };

  const submit = async () => {
    if (!signature || !consent || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" },
        body: JSON.stringify({ name, phone, jabatan, pin, email, identityNumber, address, birthDate, birthPlace, employmentType, signature, consent, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        const msg = data?.error?.message ?? "Gagal mendaftar. Coba lagi.";
        setError(msg);
        // Salah di data diri → kembali ke langkah itu
        if (["NAME_TAKEN", "NAME_INVALID", "PHONE_INVALID", "PIN_WEAK", "PIN_INVALID", "ROLE_INVALID"].includes(data?.error?.code)) setStep(0);
        return;
      }
      // Akun sudah aktif: masuk otomatis dengan PIN yang baru dibuat. Bila daftar lewat Google, hubungkan sekarang.
      try {
        let token: string;
        if (googleEmail) {
          try { token = (await linkGoogle({ userId: data.userId, pin })).token; }
          catch { toast.error("Akun dibuat, tapi Google belum terhubung. Hubungkan nanti dari Profil."); token = (await loginWithYumiPin(data.userId, pin)).token; }
        } else {
          token = (await loginWithYumiPin(data.userId, pin)).token;
        }
        login(token);
        toast.success(`Selamat datang, ${String(data.name).split(" ")[0]}!`);
        navigate({ to: "/$username/beranda" as any, params: { username: data.slug } } as any);
      } catch {
        setStep(3);
      }
    } catch {
      setError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DsRoot className="ds-screen" >
      <main className="kx-full-in" style={{ minHeight: "100dvh" }}>
        {step < 3 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 6px" }}>
              <button type="button" className="ds-iconbtn" aria-label="Kembali" onClick={() => (step === 0 ? navigate({ to: "/login" as any }) : setStep((step - 1) as Step))}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg></button>
              <h1 className="ds-page" style={{ margin: 0, fontSize: 28 }}>Daftar karyawan</h1>
            </div>
            <div className="ds-bar" style={{ margin: "6px 4px 6px" }}><i style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
            <div className="ds-label" style={{ margin: "0 6px 4px" }}>Langkah {step + 1} dari 3 · {STEPS[step]}</div>
          </>
        )}

        {step === 0 && (
          <>
            {googleEmail ? (
              <DsNote tone="ok"><b>Terhubung dengan Google</b>{googleEmail} · lengkapi data di bawah, akunmu langsung aktif.</DsNote>
            ) : (
              <>
                <DsGoogleButton onClick={() => startGoogleLogin("register")}>Daftar dengan Google</DsGoogleButton>
                <div className="kx-or" aria-hidden="true"><span>atau isi manual</span></div>
              </>
            )}
            <DsGroup>
              <Field id="reg-name" label="Nama lengkap" req><input id="reg-name" className="kx-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sesuai KTP" /></Field>
              <div className="kx-field"><span>Jabatan <b style={{ color: "var(--ds-danger)" }}>*</b></span>
                <div className="kx-reasons" role="group" aria-label="Jabatan">{JABATAN_LIST.map((j) => <button key={j.value} type="button" aria-pressed={jabatan === j.value} onClick={() => setJabatan(j.value)}>{j.label}</button>)}</div>
              </div>
              <Field id="reg-phone" label="Nomor HP (WhatsApp)" req><input id="reg-phone" className="kx-input" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx xxxx xxxx" /></Field>
            </DsGroup>
            <DsGroupLabel>Buat PIN</DsGroupLabel>
            <DsGroup>
              <Field id="reg-pin" label="PIN 6 digit" req><input id="reg-pin" className="kx-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></Field>
              <Field id="reg-pin2" label="Ulangi PIN" req hint={pinHint}><input id="reg-pin2" className="kx-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></Field>
            </DsGroup>
            <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            <DsNote tone="info" icon={<img src={ds3d("employee-attendance-check-in")} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />}><b>Langsung aktif</b>Tidak perlu menunggu persetujuan. Setelah daftar, kamu langsung masuk dan bisa absen.</DsNote>
            <DsButton block disabled={!step0Ok} onClick={() => setStep(1)}>Lanjut</DsButton>
            <DsButton block variant="ghost" onClick={() => navigate({ to: "/login" as any })}>Sudah punya akun? Masuk</DsButton>
          </>
        )}

        {step === 1 && (
          <>
            <DsNote tone="info"><b>Boleh dilewati</b>Data ini dipakai untuk kontrak dan gaji. Bisa dilengkapi nanti di Profil.</DsNote>
            <DsGroup>
              <div className="kx-field"><span>Status kerja</span><DsSegmented value={employmentType} onChange={setEmploymentType} items={[["full_time", "Penuh waktu"], ["part_time", "Paruh waktu"]]} /></div>
              <Field id="reg-email" label="Email"><input id="reg-email" className="kx-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" /></Field>
              <Field id="reg-nik" label="NIK / No. identitas"><input id="reg-nik" className="kx-input" inputMode="numeric" value={identityNumber} onChange={(e) => setIdentityNumber(e.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="16 digit" /></Field>
              <Field id="reg-address" label="Alamat"><textarea id="reg-address" className="kx-input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Alamat lengkap" /></Field>
              <Field id="reg-birthplace" label="Tempat lahir"><input id="reg-birthplace" className="kx-input" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} /></Field>
              <Field id="reg-birthdate" label="Tanggal lahir"><input id="reg-birthdate" className="kx-input" type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></Field>
            </DsGroup>
            <DsButton block onClick={() => setStep(2)}>Lanjut ke kontrak</DsButton>
            <DsButton block variant="ghost" onClick={() => setStep(2)}>Lewati</DsButton>
          </>
        )}

        {step === 2 && (
          <>
            <p className="ds-sub" style={{ margin: "0 4px 6px" }}>Baca perjanjian kerja {jabatanLabel(jabatan).toUpperCase()}, lalu tanda tangan.</p>
            <DsGroup>
              {pasal.map((p, i) => (
                <div key={i} style={{ borderTop: i ? "1px solid var(--ds-hair)" : 0 }}>
                  <button type="button" onClick={() => setOpenPasal(openPasal === i ? null : i)} aria-expanded={openPasal === i} style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: "12px 0", font: "600 14px var(--ds-font)", display: "flex", justifyContent: "space-between", gap: 8, color: "var(--ds-ink)" }}>
                    <span>{p.title}</span><span aria-hidden="true">{openPasal === i ? "−" : "+"}</span>
                  </button>
                  {openPasal === i && <p className="ds-sub" style={{ whiteSpace: "pre-line", margin: "0 0 12px", lineHeight: 1.55 }}>{p.body}</p>}
                </div>
              ))}
            </DsGroup>
            <DsGroupLabel action={signature ? <button type="button" onClick={clearSig}>Ulangi</button> : undefined}>Tanda tangan</DsGroupLabel>
            <canvas ref={canvasRef} aria-label="Area tanda tangan" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ width: "100%", height: 150, background: "#fff", borderRadius: 24, touchAction: "none", boxShadow: "inset 0 0 0 1px var(--ds-line)" }} />
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 4px 0", fontSize: 13.5 }}>
              <input id="reg-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--ds-navy)" }} />
              <span>Saya sudah membaca dan menyetujui perjanjian kerja ini serta pemrosesan data pribadi untuk administrasi kerja.</span>
            </label>
            {error && <div className="kx-err" role="alert">{error}</div>}
            <DsButton block disabled={!signature || !consent || busy} onClick={submit}>{busy ? "Membuat akun…" : "Daftar & mulai"}</DsButton>
          </>
        )}

        {step === 3 && (
          <div className="kx-cen" style={{ paddingTop: 60 }}>
            <div className="kx-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            <h2 className="ds-title" style={{ margin: "4px 0 2px" }}>Akunmu sudah aktif</h2>
            <p className="ds-sub">Masuk dengan nama dan PIN yang tadi kamu buat.</p>
            <DsButton block onClick={() => navigate({ to: "/login" as any })}>Masuk sekarang</DsButton>
          </div>
        )}
      </main>
    </DsRoot>
  );
}
