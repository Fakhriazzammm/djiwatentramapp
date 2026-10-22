import { motion, useReducedMotion } from "framer-motion";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import { CUSTOMER_LOGO_FALLBACK } from "@/lib/asset-url";
import { LogoTraceLoader } from "./LogoTraceLoader";

type CustomerSplashProps = {
  logoUrl?: string;
  storeName?: string;
  /** While true the logo trace loops; pass false or isComplete once data is ready. */
  loading?: boolean;
  isComplete?: boolean;
  onDone?: () => void;
  /** Progressive status line shown under the brand; falls back to the default tagline. */
  statusMessage?: string;
  offline?: boolean;
  stalled?: boolean;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function CustomerSplash({
  storeName = "Djiwa Tentram",
  loading = true,
  isComplete = false,
  onDone,
  statusMessage,
  offline = false,
  stalled = false,
  onRetry,
  secondaryLabel,
  onSecondary,
}: CustomerSplashProps) {
  const reduceMotion = useReducedMotion();
  const statusText = statusMessage ?? "Menyiapkan pengalaman pesan yang lebih mudah";

  return (
    <div className="app-page flex min-h-app items-center justify-center px-4 py-8">
      <motion.section
        aria-label="Membuka Djiwa Tentram"
        aria-busy={loading}
        className="app-shell flex min-h-[min(720px,calc(100dvh-4rem))] w-full max-w-md flex-col items-center justify-center bg-background px-8 text-center"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      >
        <LogoTraceLoader loading={loading} isComplete={isComplete} size={96} ariaLabel={`Membuka ${storeName}`} className="h-24 w-24 text-primary" onDone={onDone} />
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-primary">Djiwa Tentram</p>
        <p aria-live="polite" className={`mt-2 text-[13px] leading-relaxed ${offline ? "text-foreground" : "text-foreground/80"}`}>
          {statusText}
        </p>
        {stalled ? (
          <div className="mt-5 w-full max-w-[260px] space-y-2">
            <button type="button" onClick={onRetry} className="min-h-11 w-full rounded-[14px] bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-sm">
              Coba lagi
            </button>
            {secondaryLabel ? (
              <button type="button" onClick={onSecondary} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-bold text-muted-foreground">
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </motion.section>
    </div>
  );
}

const benefits: Array<{ illustration: Djiwa3DIconName; label: string; description: string }> = [
  { illustration: "customer-benefit-wallet", label: "Djiwa Pay", description: "Bayar lebih praktis" },
  { illustration: "customer-benefit-happy-hour", label: "Happy Hour", description: "All Menu Rp 15.000" },
  { illustration: "customer-benefit-promo", label: "Promo Eksklusif", description: "Benefit khusus member" },
];

type CustomerOnboardingProps = {
  logoUrl?: string;
  storeName: string;
  onMember: () => void;
  onGuest: () => void;
};

export function CustomerOnboarding({ logoUrl, storeName, onMember, onGuest }: CustomerOnboardingProps) {
  const reduceMotion = useReducedMotion();
  const brandLogoUrl = logoUrl || CUSTOMER_LOGO_FALLBACK;
  const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };

  return (
    <div className="app-page min-h-app px-3 py-4 sm:py-6">
      <motion.main
        aria-labelledby="customer-onboarding-title"
        className="app-shell mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-between bg-background px-4 py-6 sm:min-h-[calc(100dvh-3rem)]"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="flex items-center gap-2">
          <img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={brandLogoUrl} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = CUSTOMER_LOGO_FALLBACK; }} />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Welcome</p>
            <p className="text-sm font-black tracking-tight">{storeName}</p>
          </div>
        </div>

        <div className="py-8 text-center">
          <motion.div
            className="mx-auto flex h-40 w-40 items-center justify-center rounded-[36px] bg-primary/10"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.05 }}
          >
            <img alt="" className="h-28 w-28 object-contain" src={brandLogoUrl} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = CUSTOMER_LOGO_FALLBACK; }} />
          </motion.div>
          <motion.p className="mt-7 text-[11px] font-black uppercase tracking-[0.22em] text-primary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.12 }}>
            Pesan lebih mudah
          </motion.p>
          <motion.h1 id="customer-onboarding-title" className="mt-2 font-display text-3xl font-black tracking-tight text-balance" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.17 }}>
            Selamat datang di Djiwa Tentram
          </motion.h1>
          <motion.p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.22 }}>
            Pesan favoritmu dengan lebih mudah dan dapatkan benefit khusus member.
          </motion.p>

          <motion.div className="mt-7 grid grid-cols-3 gap-2" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.26 } } }}>
            {benefits.map((benefit) => (
              <motion.div key={benefit.label} className="flex min-h-[118px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-2 py-3 text-center shadow-sm" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: spring } }} whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }}>
                <Djiwa3DIcon name={benefit.illustration} size="sm" alt="" className="h-12 w-12 object-contain" />
                <p className="mt-2 text-[11px] font-black leading-tight">{benefit.label}</p>
                <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{benefit.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div className="space-y-2">
          <motion.button type="button" className="min-h-11 w-full rounded-[14px] bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-sm" onClick={onMember} whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
            Masuk / Daftar Member
          </motion.button>
          <motion.button type="button" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-bold text-muted-foreground" onClick={onGuest} whileHover={reduceMotion ? undefined : { y: -1 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
            Lanjut sebagai tamu
          </motion.button>
          <p className="pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">Kamu tetap bisa memesan tanpa membuat akun.</p>
        </div>
      </motion.main>
    </div>
  );
}
