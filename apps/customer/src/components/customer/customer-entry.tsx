import { motion, useReducedMotion } from "framer-motion";
import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@djiwaapps/web-shared";
import { greetingForPeriod, useDayPeriod, type DayPeriod } from "@/lib/day-period";
import { HERO_IMAGES } from "./customer-home-hero";
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

const PERIOD_ICON: Record<DayPeriod, LucideIcon> = { pagi: Sunrise, siang: Sun, sore: Sunset, malam: Moon };
const HERO_PLACEHOLDER: Record<DayPeriod, string> = { pagi: "#b9b48f", siang: "#cdd9b8", sore: "#c98f52", malam: "#2a2f45" };
const TITLE_WORDS = ["Selamat", "datang", "di", "Djiwa", "Tentram"];
const EASE = [0.32, 0.72, 0, 1] as const;
const glass = "bg-white/65 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.85),0_8px_24px_rgba(0,0,0,0.08)]";

type CustomerOnboardingProps = {
  logoUrl?: string;
  storeName: string;
  onMember: () => void;
  onGuest: () => void;
};

/** Ilustrasi kafe sesuai waktu hari (aset home-hero, sama dengan beranda), larut ke kanvas halaman. */
function OnboardingHero({ period }: { period: DayPeriod }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] overflow-hidden [mask-image:linear-gradient(#000_52%,transparent_98%)]"
      style={{ backgroundColor: HERO_PLACEHOLDER[period] }}
    >
      <img
        key={period}
        src={HERO_IMAGES[period]}
        alt=""
        width={1080}
        height={810}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        className="h-full w-full object-cover object-[50%_45%] animate-in fade-in duration-1000 motion-reduce:animate-none"
      />
      <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
    </div>
  );
}

export function CustomerOnboarding({ logoUrl, storeName, onMember, onGuest }: CustomerOnboardingProps) {
  const reduceMotion = useReducedMotion();
  const period = useDayPeriod();
  const PeriodIcon = PERIOD_ICON[period];
  const brandLogoUrl = logoUrl || CUSTOMER_LOGO_FALLBACK;
  const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };
  const rise = (delay: number) => ({
    initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 22, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  return (
    <div className="app-page min-h-app">
      <motion.main
        aria-labelledby="customer-onboarding-title"
        className="relative isolate mx-auto flex min-h-app w-full max-w-md flex-col overflow-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <OnboardingHero period={period} />

        <motion.div className="flex items-center justify-between" {...rise(0.1)}>
          <div className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 ${glass}`}>
            <img alt={storeName} className="h-[30px] w-[30px] rounded-full bg-white object-contain p-[3px]" src={brandLogoUrl} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = CUSTOMER_LOGO_FALLBACK; }} />
            <span className="text-sm font-semibold tracking-tight">{storeName}</span>
          </div>
          <div aria-live="polite" className={`flex items-center gap-1.5 rounded-full py-2 pl-2.5 pr-3.5 text-sm font-semibold ${glass}`}>
            <PeriodIcon aria-hidden="true" className="h-[18px] w-[18px] text-amber-500" strokeWidth={2.2} />
            <span key={period} className="animate-in fade-in slide-in-from-bottom-1 duration-500">{greetingForPeriod(period)}</span>
          </div>
        </motion.div>

        <div className="min-h-[190px] flex-1" />

        <div>
          <motion.p className="text-[13px] font-semibold tracking-wide text-primary" {...rise(0.35)}>Pesan lebih mudah</motion.p>
          <h1 id="customer-onboarding-title" aria-label="Selamat datang di Djiwa Tentram" className="mt-1 font-display text-[39px] font-extrabold leading-[1.02] tracking-[-0.045em]">
            {TITLE_WORDS.map((word, index) => (
              <span key={word} aria-hidden="true" className="mr-[0.25em] inline-block overflow-hidden pb-[3px] align-top">
                <motion.span
                  className="inline-block"
                  initial={reduceMotion ? { y: 0 } : { y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.45 + index * 0.09 }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="mt-2 max-w-[320px] text-[15px] leading-relaxed text-muted-foreground" {...rise(0.95)}>
            Pesan favoritmu dengan lebih mudah dan dapatkan benefit khusus member.
          </motion.p>

          <div className="-mx-5 mt-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollPaddingLeft: 20 }}>
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.label}
                className={`w-[158px] flex-none snap-start rounded-3xl px-3.5 pb-3.5 pt-3 ${glass}`}
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 22, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 1.05 + index * 0.1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              >
                <motion.div animate={reduceMotion ? undefined : { y: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: index * 1.6 }}>
                  <Djiwa3DIcon name={benefit.illustration} size="sm" alt="" className="mb-1.5 h-[50px] w-[50px] object-contain drop-shadow-md" />
                </motion.div>
                <p className="text-[15px] font-semibold leading-tight tracking-tight">{benefit.label}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div className="pt-4" {...rise(1.2)}>
          <motion.button type="button" className="relative flex min-h-14 w-full items-center justify-center overflow-hidden rounded-[18px] bg-primary px-5 text-[17px] font-semibold tracking-tight text-primary-foreground shadow-lg shadow-primary/30" onClick={onMember} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
            Masuk / Daftar Member
          </motion.button>
          <motion.button type="button" className="mt-1 min-h-11 w-full text-base font-semibold text-primary" onClick={onGuest} whileTap={reduceMotion ? undefined : { opacity: 0.5 }}>
            Lanjut sebagai tamu
          </motion.button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">Kamu tetap bisa memesan tanpa membuat akun.</p>
        </motion.div>
      </motion.main>
    </div>
  );
}
