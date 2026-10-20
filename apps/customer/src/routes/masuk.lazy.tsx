import { useEffect, useState } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

export const Route = createLazyFileRoute("/masuk")({
  component: CustomerAuthPage,
});

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

function getSafeCustomerReturnUrl() {
  const search = new URLSearchParams(window.location.search);
  if (search.get("sso") !== "1") return null;
  const raw = search.get("returnTo");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowedOrigins = new Set([
      "https://merchandise.yumme.id",
      "https://ordermieyamin.yumme.id",
      "https://booking.yumme.id",
      "http://localhost:3010",
      "http://localhost:5174",
    ]);
    const isAllowedPath = /^\/[^/]+\/order$/.test(url.pathname) || url.pathname === "/";
    const step = url.searchParams.get("step");
    const stage = url.searchParams.get("stage");
    const isAllowedStep = step === null || step === "checkout" || step === "shipping" || step === "payment";
    const isAllowedStage = stage === null || stage === "order";
    const hasOnlySafeParams = [...url.searchParams.keys()].every((key) => key === "step" || key === "stage");
    if (!allowedOrigins.has(url.origin) || !isAllowedPath || !isAllowedStep || !isAllowedStage || !hasOnlySafeParams || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function CustomerAuthPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, isLoading, customer, signInWithGoogle } = useCustomerAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated && customer) {
      const returnTo = getSafeCustomerReturnUrl();
      if (returnTo) {
        window.location.assign(returnTo);
        return;
      }
      navigate({ to: `/${customer.username}` });
    }
  }, [customer, isAuthenticated, navigate]);

  const handleGoogle = async () => {
    setError("");
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Gagal masuk dengan Google");
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

          <motion.div className="mt-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
            <motion.button type="button" disabled={isLoading} onClick={handleGoogle} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-black shadow-sm transition-shadow hover:shadow-md disabled:opacity-60" whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
              <GoogleMark />
              Lanjut dengan Google
            </motion.button>
            <p className="mt-3 text-[11px] text-muted-foreground">Satu akun untuk login dan daftar member.</p>
            {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">{error}</p> : null}
          </motion.div>
        </section>

        <div className="space-y-2">
          <motion.button type="button" onClick={() => navigate({ to: "/daftar" })} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted" whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>Lanjut sebagai tamu</motion.button>
          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">Kamu dapat memesan sebagai tamu tanpa menjadi member.</p>
        </div>
      </motion.main>
    </div>
  );
}
