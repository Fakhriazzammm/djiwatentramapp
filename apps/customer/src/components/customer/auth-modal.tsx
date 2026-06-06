"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, Lock, User, Loader2, ArrowRight, LogIn } from "lucide-react";

type Tab = "login" | "register";

type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string, name: string) => void;
  onSkip: () => void;
  isLoading?: boolean;
  error?: string;
};

export function AuthModal({
  open,
  onOpenChange,
  onLogin,
  onRegister,
  onSkip,
  isLoading = false,
  error,
}: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (!email.trim() || !password.trim()) return;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-sm">
        <div className="px-5 pt-5">
          {/* Icon */}
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LogIn className="h-5 w-5" />
          </div>

          <DialogHeader className="mt-2 text-center">
            <DialogTitle className="text-base font-black">
              {tab === "login" ? "Masuk ke akun" : "Buat akun baru"}
            </DialogTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {tab === "login"
                ? "Masuk untuk mengumpulkan poin dan melihat riwayat."
                : "Daftar untuk mendapatkan poin dan kemudahan pemesanan."}
            </p>
          </DialogHeader>

          {/* Tabs */}
          <div className="mt-4 flex rounded-xl bg-muted/50 p-0.5">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "flex-1 rounded-[10px] px-3 py-2 text-xs font-bold transition-all",
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
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
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
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>

            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isFormValid) handleSubmit();
                }}
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Forgot password */}
          {tab === "login" ? (
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold text-primary hover:underline"
              onClick={() => {
                /* handle forgot password */
              }}
            >
              Lupa password?
            </button>
          ) : null}

          {/* Submit button */}
          <Button
            className="mt-3 w-full"
            size="default"
            disabled={!isFormValid}
            loading={isLoading}
            onClick={handleSubmit}
          >
            {tab === "login" ? "Masuk" : "Daftar"}
          </Button>
        </div>

        {/* Skip section */}
        <div className="border-t border-border/50 px-5 pb-5 pt-4">
          <Button
            variant="ghost"
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
      </DialogContent>
    </Dialog>
  );
}
