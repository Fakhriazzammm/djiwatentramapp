import { useEffect, useState } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

export const Route = createLazyFileRoute("/masuk")({
  component: CustomerAuthPage,
});

type AuthMode = "login" | "register";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function getSafeMerchandiseReturnUrl() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isAllowedOrigin =
      url.origin === "https://merchandise.yumme.id" ||
      url.origin === "http://localhost:5174";
    return isAllowedOrigin ? url.toString() : null;
  } catch {
    return null;
  }
}

function CustomerAuthPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, isLoading, customer, login, register, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm } = useCustomerAuth();
  const [showFallback, setShowFallback] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (isAuthenticated && customer) {
      const returnTo = getSafeMerchandiseReturnUrl();
      if (returnTo) {
        window.location.assign(returnTo);
        return;
      }
      navigate({ to: `/${customer.username}` });
    }
  }, [customer, isAuthenticated, navigate]);

  const handleGoogle = async () => {
    setError("");
    setInfo("");
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Gagal masuk dengan Google");
    }
  };

  const handleFallbackSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (forgotMode) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setError("Masukkan email yang valid terlebih dahulu.");
        return;
      }
      try {
        await resetPassword(email.trim());
        setInfo("Link reset password sudah dikirim. Cek inbox atau folder spam.");
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Gagal mengirim link reset password");
      }
      return;
    }
    if (!email.trim() || !password.trim() || (mode === "register" && !name.trim())) {
      setError(mode === "register" ? "Nama, email, dan password wajib diisi." : "Email dan password wajib diisi.");
      return;
    }
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : mode === "login" ? "Gagal masuk" : "Gagal mendaftar");
    }
  };

  const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };
  const pageMotion = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 };

  return (
    <div className="app-page min-h-app px-3 py-4 sm:py-6">
      <motion.main className="app-shell mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col bg-background px-4 py-5 sm:min-h-[calc(100dvh-3rem)]" initial={pageMotion} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, duration: 0.4 }}>
        <header className="flex items-center justify-between">
          <button type="button" aria-label="Kembali ke onboarding" onClick={() => navigate({ to: "/" })} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 active:scale-[.97]"><ArrowLeft className="h-4 w-4" /></button>
          <img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-10 w-10 rounded-xl object-contain" />
          <span className="h-11 w-11" aria-hidden="true" />
        </header>

        <section className="flex flex-1 flex-col justify-center py-8 text-center">
          <motion.div initial={pageMotion} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Djiwa Tentram Member</p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-balance">Masuk atau daftar dengan cepat</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Gunakan akun Google untuk masuk atau membuat akun member tanpa mengisi banyak data.</p>
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            {registrationNeedsEmailConfirm ? (
              <motion.div key="confirmation" className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-left text-emerald-950" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                <h2 className="mt-3 text-base font-black">Akun berhasil dibuat</h2>
                <p className="mt-1 text-xs leading-relaxed">Cek email untuk konfirmasi, lalu kembali ke halaman ini dan masuk menggunakan email/password.</p>
                <button type="button" className="mt-4 min-h-11 w-full rounded-[14px] bg-emerald-600 px-4 py-2.5 text-xs font-black text-white" onClick={() => { setShowFallback(true); setMode("login"); }}>Masuk dengan email</button>
              </motion.div>
            ) : (
              <motion.div key="auth-options" className="mt-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, delay: 0.1 }}>
                <motion.button type="button" disabled={isLoading} onClick={handleGoogle} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-black shadow-sm transition-shadow hover:shadow-md disabled:opacity-60" whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
                  <GoogleMark />
                  Lanjut dengan Google
                </motion.button>
                <p className="mt-3 text-[11px] text-muted-foreground">Satu akun untuk login dan daftar member.</p>

                <button type="button" onClick={() => { setShowFallback((value) => !value); setError(""); setInfo(""); }} className="mt-6 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-primary hover:underline">
                  {showFallback ? "Sembunyikan opsi email" : "Gunakan email/password"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                {showFallback ? (
                  <form className="mt-4 space-y-3 rounded-3xl border border-border bg-card p-4 text-left" onSubmit={handleFallbackSubmit}>
                    <div className="flex items-center justify-between"><p className="text-sm font-black">{forgotMode ? "Reset password" : mode === "login" ? "Masuk dengan email" : "Daftar dengan email"}</p>{!forgotMode ? <div className="flex rounded-xl bg-muted/50 p-0.5"><button type="button" className={`min-h-9 rounded-lg px-2.5 text-[11px] font-bold ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`} onClick={() => setMode("login")}>Masuk</button><button type="button" className={`min-h-9 rounded-lg px-2.5 text-[11px] font-bold ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`} onClick={() => setMode("register")}>Daftar</button></div> : null}</div>
                    {mode === "register" && !forgotMode ? <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama lengkap" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" /> : null}
                    <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="min-h-11 w-full rounded-[14px] border border-border bg-background pl-10 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" /></div>
                    {!forgotMode ? <div className="relative"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 pr-11 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" /><button type="button" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div> : null}
                    {error ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">{error}</p> : null}
                    {info ? <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">{info}</p> : null}
                    <button type="submit" disabled={isLoading} className="min-h-11 w-full rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white disabled:opacity-60">{isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : forgotMode ? "Kirim link reset" : mode === "login" ? "Masuk" : "Daftar"}</button>
                    {!forgotMode && mode === "login" ? <button type="button" onClick={() => setForgotMode(true)} className="min-h-11 w-full text-[11px] font-semibold text-muted-foreground hover:underline">Lupa password?</button> : null}
                    {forgotMode ? <button type="button" onClick={() => setForgotMode(false)} className="min-h-11 w-full text-[11px] font-semibold text-muted-foreground hover:underline">Kembali ke masuk</button> : null}
                  </form>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="space-y-2">
          <motion.button type="button" onClick={() => navigate({ to: "/daftar" })} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted" whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>Lanjut sebagai tamu</motion.button>
          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">Kamu dapat memesan sebagai tamu tanpa menjadi member.</p>
        </div>
      </motion.main>
    </div>
  );
}
