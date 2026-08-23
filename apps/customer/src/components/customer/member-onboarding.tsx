import { motion, useReducedMotion } from "framer-motion";
import { Bell, ChevronRight, Gift, ShoppingCart, Sparkles, Star } from "lucide-react";

type MemberOnboardingProps = {
  name: string;
  onStartOrdering: () => void;
  onDismiss: () => void;
};

export function MemberOnboarding({ name, onStartOrdering, onDismiss }: MemberOnboardingProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-6 backdrop-blur-[2px]">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.8 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-onboarding-title"
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-background shadow-2xl"
      >
        <div className="flex justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Member baru</p>
              <h2 id="member-onboarding-title" className="mt-0.5 text-xl font-black tracking-tight">Selamat datang, {name}!</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Akun member kamu sudah aktif. Ini cara cepat menikmati fitur Djiwa Tentram.</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5">
              <ShoppingCart className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold">Pesan menu favoritmu dengan cepat.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5">
              <Star className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <p className="text-xs font-semibold">Gunakan Djiwa Pay untuk transaksi yang lebih praktis.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5">
              <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold">Cek promo, favorit, dan benefit member.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5">
              <Bell className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold">Update pesanan akan muncul di Notifikasi.</p>
            </div>
          </div>

          <button type="button" onClick={onStartOrdering} className="mt-5 flex min-h-12 w-full items-center justify-between rounded-[16px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97]">
            <span>Mulai pesan</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onDismiss} className="mt-2 min-h-11 w-full rounded-[16px] px-4 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted">
            Nanti saja
          </button>
        </div>
      </motion.div>
    </div>
  );
}
