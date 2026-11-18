import { useState } from "react";
import { motion } from "framer-motion";
import { Btn, Ic, Screen, Sky } from "../shell/dpx-ui";
import { DayBackdrop, FeatureShowcase, FloatingStats, useDrift } from "./auth-showcase";
import { Mascot } from "../shell/dpx-ui";
import { authClient, resolveIdentity, signInWithGoogle } from "../../lib/identity-adapter";

function GoogleMark() { return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#e45825" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>; }

export function DjiwaPayAuth({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false);
  const { part, pick } = useDrift();
  const [authError, setAuthError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const signInEmail = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setAuthError("");
    try {
      const r = await authClient.signIn.email({ email: email.trim(), password });
      if (r.error) { setAuthError(r.error.status === 401 || r.error.status === 400 ? "Email atau kata sandi salah. Belum punya kata sandi? Masuk dengan Google, lalu atur di Akun › Keamanan." : r.error.message ?? "Gagal masuk. Coba lagi."); setBusy(false); return; }
      await resolveIdentity();
    } catch (cause) { setAuthError(cause instanceof Error ? cause.message : "Gagal masuk. Coba lagi."); }
    setBusy(false);
  };
  const signIn = () => { setBusy(true); setAuthError(""); signInWithGoogle().catch((cause) => { setAuthError(cause instanceof Error ? cause.message : "Gagal membuka halaman masuk"); setBusy(false); }); };
  return <Screen className="dpx-auth"><Sky deep><DayBackdrop part={part} onPick={pick} /><div className="dpx-pad dpx-nobar" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
    <div className="dpx-hdr"><Btn type="button" className="dpx-rb" onClick={() => window.history.back()} aria-label="Kembali"><Ic n="back" /></Btn></div>
    <div className="dpx-auth-hero" style={{ flex: 1 }}>
      <div className="dpx-auth-mascot"><FloatingStats />
        <motion.div initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} whileTap={{ scale: 0.92, rotate: 6 }}>
          <motion.div animate={{ y: [0, -9, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}><Mascot px={170} style={{ filter: "drop-shadow(0 16px 24px rgba(45,36,29,.22))" }} /></motion.div>
        </motion.div>
      </div>
      <motion.h1 className="dpx-page-title" style={{ fontSize: 32 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>Catat uangmu,<br />bayar dengan tenang.</motion.h1>
      <motion.p className="dpx-sub" style={{ maxWidth: 300, fontSize: 15, marginTop: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>Catat pengeluaran dengan satu kalimat, atur anggaran, lalu bayar tagihan dan isi pulsa — semuanya otomatis tercatat.</motion.p>
      <FeatureShowcase />
    </div>
    <Btn type="button" className="dpx-gbtn" disabled={busy} onClick={() => void signIn()}><GoogleMark />{busy ? "Menghubungkan..." : "Lanjutkan dengan Google"}</Btn>
    <Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8 }} onClick={() => setEmailOpen((v) => !v)} aria-expanded={emailOpen}>{emailOpen ? "Sembunyikan masuk dengan email" : "Masuk dengan email dan kata sandi"}</Btn>
    {emailOpen ? <form className="dpx-ac-panel" onSubmit={(e) => void signInEmail(e)} style={{ marginTop: 6 }}>
      <label className="dpx-as-fld"><span>Email</span><input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="dpx-as-fld"><span>Kata sandi</span><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
      <Btn type="submit" className="dpx-btn" disabled={busy || !email || password.length < 8}>{busy ? "Memeriksa..." : "Masuk"}</Btn>
    </form> : null}
    {authError || error ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{authError || error}</div></div> : null}
    <p className="dpx-sub dpx-center" style={{ margin: "16px 20px 0", fontSize: 12 }}>Satu akun untuk catatan keuangan dan saldo Djiwa Pay.</p>
    <p className="dpx-legal-links">Dengan melanjutkan, kamu menyetujui <a href="/syarat">Syarat Layanan</a> dan <a href="/privasi">Kebijakan Privasi</a> Djiwa Pay, termasuk cara kami memakai data Google yang kamu izinkan.</p>
  </div></Sky></Screen>;
}
