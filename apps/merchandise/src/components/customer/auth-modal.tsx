"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, Lock, User, Loader2, ArrowLeft, ArrowRight, LogIn, CheckCircle2, Eye, EyeOff } from "lucide-react";

type Tab = "login" | "register";

type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string, name: string) => void;
  onResetPassword: (email: string) => void;
  onSkip: () => void;
  onDjiwaAppSignIn?: () => void;
  onGoogleSignIn?: () => void;
  isLoading?: boolean;
  error?: string;
  needsEmailConfirm?: boolean;
};

export function AuthModal({
  open,
  onOpenChange,
  onLogin,
  onRegister,
  onResetPassword,
  onSkip,
  onDjiwaAppSignIn,
  onGoogleSignIn,
  isLoading = false,
  error,
  needsEmailConfirm = false,
}: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");

  // ── Forgot password state ─────────────────────────────────
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // ── Success feedback ──────────────────────────────────────
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const prevLoadingRef = useRef(false);
  const submitAttemptedRef = useRef(false);

  // Detect auth transition: was loading → finished → no error → show success
  useEffect(() => {
    if (!submitAttemptedRef.current) {
      prevLoadingRef.current = isLoading;
      return;
    }
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    if (wasLoading && !isLoading && !error) {
      // For login or auto-confirm: close modal immediately (goToMenuFlow runs in parent)
      if (tab === "login" || !needsEmailConfirm) {
        submitAttemptedRef.current = false;
        onOpenChange(false);
      } else {
        // Email-confirm registration: show instructions
        const msg = "Akun berhasil dibuat!";
        setSuccessMessage(msg);
        setShowSuccess(true);
      }
    }
  }, [isLoading, error, tab, onOpenChange, needsEmailConfirm]);

  const handleSubmit = () => {
    if (!email.trim() || !password.trim()) return;
    submitAttemptedRef.current = true;
    if (tab === "login") {
      onLogin(email.trim(), password);
    } else {
      onRegister(email.trim(), password, name.trim());
    }
  };

  const isFormValid =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (tab === "login" || name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!showSuccess) onOpenChange(value); }}>
      <DialogContent className="p-0 sm:max-w-sm">
        {showSuccess ? (
          needsEmailConfirm ? (
            /* ── Email confirmation instructions ─────────────── */
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-3 font-display text-base font-black">Akun berhasil dibuat!</p>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Cek email <span className="font-bold text-foreground">{email}</span> untuk klik tautan konfirmasi pendaftaran.
              </p>
              <div className="mt-3 w-full rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p className="flex items-center gap-2 font-bold"><Mail aria-hidden="true" className="h-4 w-4" strokeWidth={2} /> Setelah konfirmasi email:</p>
                <p className="mt-1 ml-0.5">Kembali ke halaman ini lalu masuk (login) menggunakan email dan password yang sudah didaftarkan.</p>
              </div>
              <button
                type="button"
                className="mt-4 min-h-11 w-full rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-white shadow-sm"
                onClick={() => {
                  setShowSuccess(false);
                  setSuccessMessage("");
                  setTab("login");
                  submitAttemptedRef.current = false;
                  setPassword("");
                }}
              >
                OK, saya mengerti
              </button>
            </div>
          ) : (
            /* ── Success state (auto-confirm) ────────────────── */
            <div className="flex flex-col items-center justify-center px-5 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-3 text-base font-black">{successMessage}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Mengalihkan ke menu...</p>
              <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground/60" />
            </div>
          )
        ) : (
          <>
            <div className="px-5 pt-5">
              {/* Icon */}
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LogIn className="h-5 w-5" />
              </div>

              <DialogHeader className="mt-2 text-center">
                <DialogTitle className="font-display text-base font-black">
                  {tab === "login" ? "Masuk ke akun" : "Buat akun baru"}
                </DialogTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {tab === "login"
                    ? "Masuk untuk menggunakan Djiwa Pay dan melihat riwayat."
                    : "Daftar untuk mendapatkan akses Djiwa Pay dan kemudahan pemesanan."}
                </p>
              </DialogHeader>

              {onDjiwaAppSignIn ? (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={onDjiwaAppSignIn}
                  className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all hover:brightness-105 disabled:opacity-50"
                >
                  <LogIn aria-hidden="true" className="h-4 w-4" />
                  Lanjut dengan Djiwa App
                </button>
              ) : null}

              {/* Tabs */}
              <div className="mt-4 flex rounded-xl bg-muted/50 p-0.5">
                {(["login", "register"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      "min-h-11 flex-1 rounded-[14px] px-3 py-2 text-xs font-bold transition-all",
                      tab === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setTab(t)}
                  >
                    {t === "login" ? "Masuk" : "Daftar"}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error ? (
                <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
                  {error}
                </div>
              ) : null}

              {showForgotPassword ? (
                <div className="mt-4">
                  <p className="text-[11px] text-muted-foreground">
                    Masukkan email kamu untuk menerima link reset password.
                  </p>
                  <div className="relative mt-3">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading || forgotSent}
                      className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                  {forgotSent ? (
                    <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 aria-hidden="true" className="mr-1 inline h-4 w-4" strokeWidth={2} /> Link reset password sudah dikirim ke <span className="font-bold">{email}</span>. Cek inbox atau folder spam.
                    </div>
                  ) : (
                    <Button
                      className="mt-3 w-full"
                      size="lg"
                      disabled={!email.trim() || isLoading}
                      loading={isLoading}
                      onClick={() => {
                        onResetPassword(email.trim());
                        setForgotSent(true);
                      }}
                    >
                      Kirim Link Reset
                    </Button>
                  )}
                  <button
                    type="button"
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:underline"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotSent(false);
                    }}
                  >
                    <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Kembali ke Masuk
                  </button>
                </div>
              ) : (
                <>
              {/* Form */}
              <div className="mt-4 space-y-2.5">
                {tab === "register" ? (
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Nama lengkap"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                      className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                ) : null}

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                  />
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isFormValid) handleSubmit();
                    }}
                    className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2.5 pl-9 pr-11 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              {tab === "login" ? (
                <button
                  type="button"
                  className="mt-2 min-h-11 text-[11px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setForgotSent(false);
                  }}
                >
                  Lupa password?
                </button>
              ) : null}

              {/* Google Sign In */}
              {onGoogleSignIn ? (
                <>
                  <div className="relative mt-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[11px] text-muted-foreground">Atau</span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={onGoogleSignIn}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-background py-2.5 text-xs font-bold text-foreground shadow-sm transition-all hover:bg-muted disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Masuk dengan Google
                  </button>
                </>
              ) : null}

              {/* Submit button */}
              <Button
                className="mt-3 w-full"
                size="lg"
                disabled={!isFormValid}
                loading={isLoading}
                onClick={handleSubmit}
              >
                {tab === "login" ? "Masuk" : "Daftar"}
              </Button>
                </>
              )}
            </div>

            {/* Skip section */}
            <div className="border-t border-border/50 px-5 pb-5 pt-4">
              <Button
                variant="ghost"
                size="lg"
                className="w-full text-xs text-muted-foreground"
                disabled={isLoading}
                onClick={() => {
                  onSkip();
                  onOpenChange(false);
                }}
              >
                Lanjut sebagai Tamu
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
