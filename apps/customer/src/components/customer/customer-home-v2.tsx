import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { BadgeCheck, ChevronRight, Eye, EyeOff, HeartHandshake, Search } from "lucide-react";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import { currency } from "@/components/customer/types";
import type { CustomerUser } from "@/hooks/use-customer-auth";
import { useJumatBerkah } from "@/hooks/use-jumat-berkah";
import { communityClient } from "@/features/community/community-client";
import type { CommunityPurchaseActivity } from "@/features/community/community-types";
import { HERO_IMAGES } from "@/components/customer/customer-home-hero";
import { isFridayInJakarta, useHomeCatalog, useQuickAdd } from "@/components/customer/customer-home-editorial";
import { pickTopSellers } from "@/lib/home-feed";
import { greetingForPeriod, type DayPeriod } from "@/lib/day-period";
import { cn } from "@/lib/utils";

const EASE = [0.32, 0.72, 0, 1] as const;
const SPRING = { type: "spring", stiffness: 420, damping: 28, mass: 0.7 } as const;

/** Latar ilustrasi: selalu di belakang dan tidak tertutup kartu (isi mulai di bawah area gambar). */
const SKY_PLACEHOLDER: Record<DayPeriod, string> = { pagi: "#dfe6c2", siang: "#d6e8c4", sore: "#f0cfa0", malam: "#7d8fb8" };
const SKY_FILTER: Record<DayPeriod, string> = {
  pagi: "none",
  siang: "none",
  sore: "brightness(1.08) saturate(1.05)",
  malam: "brightness(1.45) saturate(1.15) contrast(.95)",
};

export function HomeSky({ period }: { period: DayPeriod }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 300], [0, reduce ? 0 : -60]);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[300px] overflow-hidden transition-colors duration-1000 [mask-image:linear-gradient(#000_78%,transparent)]"
      style={{ backgroundColor: SKY_PLACEHOLDER[period] }}
    >
      <motion.div className="absolute inset-0" style={{ y }}>
        <AnimatePresence initial={false}>
          <motion.img
            key={period}
            src={HERO_IMAGES[period]}
            alt=""
            width={1080}
            height={810}
            draggable={false}
            decoding="async"
            fetchPriority="high"
            initial={{ opacity: 0, scale: reduce ? 1 : 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 1.2, ease: EASE }}
            className="absolute inset-0 h-full w-full object-cover object-[50%_38%]"
            style={{ filter: SKY_FILTER[period] }}
          />
        </AnimatePresence>
      </motion.div>
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/35 to-transparent" />
    </div>
  );
}

export function HomeTop({
  period,
  name,
  points,
  onSearch,
  onPoints,
  onBell,
  unread = 0,
}: {
  period: DayPeriod;
  name: string | null;
  /** null = tamu: tombol berubah jadi ajakan mengambil poin. */
  points: number | null;
  onSearch: () => void;
  onPoints: () => void;
  /** Hanya untuk member: tombol notifikasi di sebelah poin. */
  onBell?: () => void;
  unread?: number;
}) {
  return (
    <header className="px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="flex items-center gap-2">
        <motion.button
          type="button"
          onClick={onSearch}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          whileTap={{ scale: 0.98 }}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/90 px-3.5 text-left text-[13.5px] text-muted-foreground shadow-[0_4px_14px_rgba(20,60,110,0.12)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Cari menu"
        >
          <Search className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
          <span className="truncate">Cari menu, mis. “Kopi susu”</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={onPoints}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#ffe08a] pl-1.5 pr-3 text-[#5a3a00] shadow-[0_4px_14px_rgba(160,110,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={points === null ? "Masuk untuk mengambil poin" : `${points} poin. Buka poin`}
        >
          <Djiwa3DIcon name="loyalty-points" size="micro" alt="" className="h-6 w-6 object-contain" />
          <span className="text-left text-[12.5px] font-extrabold leading-[1.05]">
            <span className="block text-[10px] font-semibold opacity-75">{points === null ? "Ambil" : "Poin kamu"}</span>
            {points === null ? "Poin" : points.toLocaleString("id-ID")}
          </span>
        </motion.button>
        {onBell ? (
          <motion.button
            type="button"
            onClick={onBell}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING, delay: 0.16 }}
            whileTap={{ scale: 0.9 }}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_4px_14px_rgba(20,60,110,0.12)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={unread > 0 ? `Notifikasi, ${unread} baru` : "Notifikasi"}
          >
            <Djiwa3DIcon name="notifications-alerts" size="micro" alt="" className="h-5 w-5 object-contain" />
            {unread > 0 ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING} className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[9px] font-black leading-none text-white">
                {unread > 9 ? "9+" : unread}
              </motion.span>
            ) : null}
          </motion.button>
        ) : null}
      </div>
      <motion.div
        key={period}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.15 }}
        className="mt-3 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45),0_2px_16px_rgba(0,0,0,0.45)]"
      >
        <p className="font-display text-[22px] font-black leading-tight tracking-tight">{greetingForPeriod(period)}</p>
        <p className="text-[13px] font-semibold leading-tight text-white/95">{name ? `${name}, mau pesan apa?` : "Pesan tanpa antre"}</p>
      </motion.div>
    </header>
  );
}

const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } };
const popVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 26 } },
};

export function HomeShortcuts({ onOrder, onPromo, onBooking, isLive }: { onOrder: () => void; onPromo: () => void; onBooking: () => void; isLive: boolean }) {
  const items = [
    { label: "Pesan", tag: isLive ? "Buka" : "Lihat menu", icon: "/assets/djiwa-services/menu.webp", onClick: onOrder },
    { label: "Promo", tag: "50%", icon: "/assets/djiwa-services/promo.webp", onClick: onPromo },
    { label: "Booking", tag: "Acara", icon: "/assets/djiwa-services/booking.webp", onClick: onBooking },
  ];
  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="mt-[150px] grid grid-cols-3 gap-2">
      {items.map((item) => (
        <motion.button
          key={item.label}
          type="button"
          variants={popVariants}
          whileTap={{ scale: 0.93 }}
          whileHover={{ y: -2 }}
          onClick={item.onClick}
          className="relative flex flex-col items-center rounded-[18px] bg-card px-1 pb-2 pt-1.5 text-center shadow-[0_0_0_2px_hsl(var(--primary)/0.12),0_5px_14px_rgba(20,60,110,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <img src={item.icon} alt="" className="h-[42px] w-[42px] object-contain" />
          <span className="relative -mt-1 rounded-full bg-primary/10 px-2 text-[10.5px] font-extrabold leading-[15px] text-primary">{item.tag}</span>
          <span className="mt-0.5 text-[13px] font-bold leading-tight text-foreground">{item.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

const HIDE_KEY = "djiwa-home-balance-hidden";

function useCountUp(target: number) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, { duration: 1.1, ease: EASE, onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [target, reduce]);
  return value;
}

export type WalletAction = "topup" | "kirim" | "tagihan" | "scan";

export function HomeWalletCard({ customer, onOpen, onAction }: { customer: CustomerUser; onOpen: () => void; onAction: (action: WalletAction) => void }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });
  const shown = useCountUp(Number(customer.walletBalance ?? 0));
  const toggle = () => {
    setHidden((current) => {
      const next = !current;
      try { localStorage.setItem(HIDE_KEY, next ? "1" : "0"); } catch { /* mode privat */ }
      return next;
    });
  };
  const actions: Array<{ key: WalletAction; label: string; icon: string }> = [
    { key: "topup", label: "Top up", icon: "/assets/djiwa-pay-actions/topup.webp" },
    { key: "kirim", label: "Kirim", icon: "/assets/djiwa-pay-actions/send.webp" },
    { key: "tagihan", label: "Tagihan", icon: "/assets/djiwa-pay-actions/bills.webp" },
  ];
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.3 }}
      className="mt-2.5 flex items-center justify-between gap-1.5 rounded-[20px] bg-gradient-to-br from-[#e6f2ff] to-card to-60% px-3 py-2.5 shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]"
      aria-label="Saldo Djiwa Pay"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[13px] font-extrabold text-primary">
          <button type="button" onClick={onOpen} className="focus-visible:outline-none focus-visible:underline">Djiwa Pay</button>
          <button type="button" onClick={toggle} aria-label={hidden ? "Tampilkan saldo" : "Sembunyikan saldo"} aria-pressed={hidden} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-primary/10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={hidden ? "off" : "on"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
                {hidden ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <button type="button" onClick={onOpen} className="block text-left focus-visible:outline-none" aria-label="Buka saldo Djiwa Pay">
          <span className="block font-display text-[21px] font-black leading-[1.1] tracking-tight tabular-nums text-foreground">{hidden ? "Rp ••••••" : currency(shown)}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[11px] text-muted-foreground">
            {Number(customer.totalPoints ?? 0).toLocaleString("id-ID")} poin · <span className="font-bold text-emerald-700">+Rp1.000/top up</span>
          </span>
        </button>
      </div>
      <div className="flex shrink-0">
        {actions.map((action) => (
          <motion.button
            key={action.key}
            type="button"
            whileTap={{ scale: 0.88 }}
            transition={SPRING}
            onClick={() => onAction(action.key)}
            className="flex w-[52px] flex-col items-center gap-0.5 text-[11px] font-semibold text-foreground focus-visible:outline-none"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <img src={action.icon} alt="" className="h-6 w-6 object-contain" />
            </span>
            {action.label}
          </motion.button>
        ))}
      </div>
    </motion.section>
  );
}

export function HomeGuestWallet({ onLogin }: { onLogin: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.3 }}
      className="mt-2.5 flex items-center gap-2.5 rounded-[20px] bg-card px-3 py-2.5 shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]"
    >
      <img src="/assets/djiwa-services/pay.webp" alt="" className="h-10 w-10 object-contain" />
      <div className="min-w-0">
        <p className="text-sm font-black leading-tight">Djiwa Pay</p>
        <p className="text-[11.5px] leading-tight text-muted-foreground">Daftar member, ada saldo bonus</p>
      </div>
      <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onLogin} className="ml-auto shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground">
        Masuk
      </motion.button>
    </motion.section>
  );
}

export type HomeServiceHandlers = {
  onOrder: () => void;
  onPromo: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onCommunity: () => void;
  onMerchandise: () => void;
  onBooking: () => void;
  onDjiwaRun: () => void;
  onJumatBerkah: () => void;
};

type ServiceItem = { label: string; badge?: string; icon?: ReactNode; src?: string; onClick: () => void };

/** Layanan digeser ke samping (tanpa "Lainnya"); gerak dan panah memberi tahu bahwa baris ini bisa digeser. */
export function HomeServiceRail(handlers: HomeServiceHandlers) {
  const reduce = useReducedMotion();
  const jumatBerkah = useJumatBerkah().overview;
  const railRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState(false);
  const nudgingRef = useRef(false);
  const { scrollXProgress } = useScroll({ container: railRef });
  const thumbLeft = useTransform(scrollXProgress, [0, 1], ["0%", "62%"]);

  const items = useMemo<ServiceItem[]>(() => {
    const list: ServiceItem[] = [
      { label: "Komunitas", src: "/assets/djiwa-services/community.webp", onClick: handlers.onCommunity },
      { label: "Riwayat", src: "/assets/djiwa-services/history.webp", onClick: handlers.onHistory },
      { label: "Merch", badge: "Baru", src: "/assets/djiwa-services/merchandise.webp", onClick: handlers.onMerchandise },
      { label: "Djiwa Run", badge: "Baru", src: "/assets/djiwa-services/run.webp", onClick: handlers.onDjiwaRun },
      { label: "Djiwa Pay", badge: "+Rp1.000", src: "/assets/djiwa-services/pay.webp", onClick: handlers.onWallet },
      { label: "Poin", icon: <Djiwa3DIcon name="loyalty-points" size="sm" alt="" className="h-[38px] w-[38px] object-contain" />, onClick: handlers.onWallet },
      { label: "Voucher", icon: <Djiwa3DIcon name="promo-voucher" size="sm" alt="" className="h-[38px] w-[38px] object-contain" />, onClick: handlers.onPromo },
      { label: "Lacak", icon: <Djiwa3DIcon name="order-tracking" size="sm" alt="" className="h-[38px] w-[38px] object-contain" />, onClick: handlers.onHistory },
    ];
    if (jumatBerkah && jumatBerkah.enabled) {
      list.unshift({
        label: "Jumat Berkah",
        badge: isFridayInJakarta() ? "Hari ini" : "Sedekah",
        icon: (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-gradient-to-br from-[#F3D58A] to-[#D9962E]">
            <HeartHandshake className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden="true" />
          </span>
        ),
        onClick: handlers.onJumatBerkah,
      });
    }
    return list;
  }, [handlers.onCommunity, handlers.onHistory, handlers.onMerchandise, handlers.onDjiwaRun, handlers.onWallet, handlers.onPromo, handlers.onJumatBerkah, jumatBerkah]);

  // Gerakan pancingan: geser sedikit lalu kembali (dua kali), berhenti begitu pengguna menyentuh baris.
  useEffect(() => {
    const el = railRef.current;
    if (!el || reduce || touched) return;
    const timers: number[] = [];
    const stops: Array<{ stop: () => void }> = [];
    const nudge = () => {
      if (!railRef.current) return;
      nudgingRef.current = true;
      const out = animate(0, 76, {
        duration: 0.7,
        ease: "easeInOut",
        onUpdate: (v) => { el.scrollLeft = v; },
        onComplete: () => {
          const back = animate(76, 0, { duration: 0.7, ease: "easeInOut", onUpdate: (v) => { el.scrollLeft = v; }, onComplete: () => { nudgingRef.current = false; } });
          stops.push(back);
        },
      });
      stops.push(out);
    };
    timers.push(window.setTimeout(nudge, 1300), window.setTimeout(nudge, 4400));
    return () => {
      timers.forEach(window.clearTimeout);
      stops.forEach((s) => s.stop());
      nudgingRef.current = false;
    };
  }, [reduce, touched]);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (el && !nudgingRef.current && el.scrollLeft > 24) setTouched(true);
  }, []);

  return (
    <motion.section
      aria-label="Layanan"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.4 }}
      className="relative mt-2.5 overflow-hidden rounded-[20px] bg-card shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]"
    >
      <motion.div
        ref={railRef}
        onScroll={onScroll}
        onPointerDown={() => setTouched(true)}
        onWheel={() => setTouched(true)}
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="no-scrollbar flex snap-x snap-proximity gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-1 pt-3"
      >
        {items.map((item) => (
          <motion.button
            key={item.label}
            type="button"
            variants={popVariants}
            whileTap={{ scale: 0.9 }}
            onClick={item.onClick}
            aria-label={item.label}
            className="relative flex w-[62px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl text-[11px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {item.badge ? <span className="absolute -top-1.5 right-0 z-10 whitespace-nowrap rounded-full bg-rose-500 px-1.5 text-[8.5px] font-black leading-[13px] text-white">{item.badge}</span> : null}
            {item.icon ?? <img src={item.src} alt="" className="h-[38px] w-[38px] object-contain" loading="lazy" />}
            <span className="w-full truncate text-center">{item.label}</span>
          </motion.button>
        ))}
      </motion.div>

      <div className="relative mx-10 mb-2 mt-1 h-[3px] rounded-full bg-primary/10" aria-hidden="true">
        <motion.span className="absolute inset-y-0 w-[38%] rounded-full bg-primary" style={{ left: thumbLeft }} />
      </div>

      <AnimatePresence>
        {!touched ? (
          <motion.div
            key="hint"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-r from-transparent via-card/80 to-card pr-1.5"
            aria-hidden="true"
          >
            <motion.span
              animate={reduce ? undefined : { x: [-5, 3, -5] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_3px_10px_hsl(var(--primary)/0.4)]"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={3} />
            </motion.span>
          </motion.div>
        ) : null}
        {!touched ? (
          <motion.span
            key="label"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.6, delay: 0.6, repeat: 2, times: [0, 0.2, 0.7, 1] }}
            className="pointer-events-none absolute right-2.5 top-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-primary"
            aria-hidden="true"
          >
            Geser
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function SectionDivider({ children }: { children: ReactNode }) {
  return (
    <motion.h2
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="mb-2 mt-4 flex items-center justify-center gap-2 font-display text-[15px] font-black tracking-tight text-foreground before:flex-1 before:border-t-[1.5px] before:border-dotted before:border-foreground/20 after:flex-1 after:border-t-[1.5px] after:border-dotted after:border-foreground/20"
    >
      {children}
    </motion.h2>
  );
}

/** Menu terlaris hari ini; bila belum ada penjualan hari ini, pakai terlaris sepanjang waktu. */
function useTopSellersToday(limit: number) {
  const { bestSellers, productMap, ready } = useHomeCatalog();
  const list = useMemo(() => {
    const rows = bestSellers ?? [];
    const today = rows.filter((row) => row.period === "today");
    const source = today.length > 0 ? today : rows.filter((row) => !row.period || row.period === "all");
    return { items: pickTopSellers(source, productMap, limit), isToday: today.length > 0 };
  }, [bestSellers, productMap, limit]);
  return { ...list, ready };
}

const RANK_TINT = ["bg-[#EAD8C0]", "bg-[#E8D9C8]", "bg-[#DCE9D8]"];

export function HomeTopSellersToday({ username }: { username: string }) {
  const { items, isToday, ready } = useTopSellersToday(3);
  const { addProduct, openMenu } = useQuickAdd(username);
  if (!ready) return <div className="h-[200px] animate-pulse rounded-[20px] bg-muted" role="status" aria-label="Memuat menu terlaris" />;
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-top-today-title">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="home-top-today-title" className="font-display text-[17px] font-black tracking-tight text-foreground">Menu terlaris hari ini</h2>
        <button type="button" onClick={openMenu} className="min-h-9 px-1 text-xs font-bold text-primary focus-visible:outline-none focus-visible:underline">Lihat semua</button>
      </div>
      {!isToday ? <p className="px-1 text-[11px] text-muted-foreground">Belum ada penjualan hari ini, ini terlaris sepanjang waktu.</p> : null}
      <motion.ol variants={listVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="mt-1.5 divide-y divide-border/60 rounded-[20px] bg-card px-3 py-0.5 shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]">
        {items.map((item, index) => (
          <motion.li key={item.productId} variants={popVariants} className="flex items-center gap-2.5 py-2.5">
            <span className="w-4 text-center font-display text-base font-black text-muted-foreground" aria-hidden="true">{index + 1}</span>
            <span className={cn("h-12 w-12 shrink-0 overflow-hidden rounded-[14px]", RANK_TINT[index] ?? "bg-muted")}>
              {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[13px] font-bold leading-snug text-foreground">{item.name}</span>
              <span className="block text-[11.5px] text-muted-foreground">{item.price != null ? currency(item.price) : "Harga belum tersedia"}{item.totalSold ? ` · Terjual ${item.totalSold}x` : ""}</span>
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              disabled={!item.isAvailable}
              onClick={() => addProduct(item)}
              aria-label={item.isAvailable ? `Pesan ${item.name}` : `${item.name} tidak tersedia`}
              className="min-h-10 shrink-0 rounded-full bg-primary/10 px-3.5 text-[12.5px] font-extrabold text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {item.isAvailable ? "Pesan" : "Habis"}
            </motion.button>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  );
}

function relativeTime(value: string) {
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 60_000) return "baru saja";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function ActivityAvatar({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  const generic = !name.trim() || ["teman djiwa", "member", "user"].includes(name.trim().toLowerCase());
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[11px] font-black text-primary" aria-hidden="true">
      {url && !failed ? <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : generic ? "T" : name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

type ActivityGroup = CommunityPurchaseActivity & { products: CommunityPurchaseActivity[] };

/** Aktivitas belanja teman Djiwa (sama dengan feed Komunitas); disembunyikan bila belum ada atau gagal dimuat. */
export function HomeFriendActivity({ onOpenCommunity }: { onOpenCommunity: () => void }) {
  const [activities, setActivities] = useState<CommunityPurchaseActivity[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    communityClient.listPurchaseActivity(undefined, controller.signal)
      .then((page) => { if (!controller.signal.aborted) setActivities(page.activities); })
      .catch(() => { if (!controller.signal.aborted) setActivities([]); });
    return () => controller.abort();
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, ActivityGroup>();
    for (const activity of activities ?? []) {
      const key = `${activity.displayName}|${activity.orderSettledAt}`;
      const current = map.get(key);
      if (current) current.products.push(activity);
      else map.set(key, { ...activity, products: [activity] });
    }
    return Array.from(map.values()).slice(0, 4);
  }, [activities]);

  if (activities === null) return <div className="h-[150px] animate-pulse rounded-[20px] bg-muted" role="status" aria-label="Memuat aktivitas teman" />;
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="home-activity-title">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="home-activity-title" className="font-display text-[17px] font-black tracking-tight text-foreground">Aktivitas belanja teman Djiwa</h2>
        <button type="button" onClick={onOpenCommunity} className="min-h-9 px-1 text-xs font-bold text-primary focus-visible:outline-none focus-visible:underline">Lihat semua</button>
      </div>
      <motion.ul variants={listVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="mt-1.5 divide-y divide-border/60 rounded-[20px] bg-card px-3 py-0.5 shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]">
        {groups.map((group) => (
          <motion.li key={group.id} variants={popVariants} className="flex items-center gap-2.5 py-2.5">
            <ActivityAvatar name={group.displayName} url={group.avatarUrl} />
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground">
              <span className="flex items-center gap-1">
                <span className="truncate font-bold">{group.displayName}</span>
                {group.verified ? <BadgeCheck className="h-3 w-3 shrink-0 text-cyan-600" aria-label="Pembelian terverifikasi" /> : null}
                <span className="shrink-0 text-[11px] text-muted-foreground">· {relativeTime(group.orderSettledAt)}</span>
              </span>
              <span className="line-clamp-1 block">baru saja membeli <span className="font-bold">{group.products.map((product) => product.productName).join(", ")}</span></span>
            </span>
            {group.productImageUrl ? <img src={group.productImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-muted object-contain p-0.5" loading="lazy" decoding="async" /> : null}
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

/** "Lihat lebih banyak!": pintasan ke daftar menu lengkap. */
export function HomeQuickPicks({ username }: { username: string }) {
  const { openMenu } = useQuickAdd(username);
  return (
    <section aria-label="Lihat lebih banyak menu">
      <SectionDivider>
        <button
          type="button"
          onClick={openMenu}
          className="flex min-h-9 items-center gap-1.5 rounded-lg text-primary focus-visible:outline-none focus-visible:underline"
        >
          <span aria-hidden="true">✨</span> Lihat lebih banyak!
          <ChevronRight className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        </button>
      </SectionDivider>
    </section>
  );
}
