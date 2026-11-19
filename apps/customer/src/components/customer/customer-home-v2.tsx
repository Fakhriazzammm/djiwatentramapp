import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { ArrowRight, ChevronRight, Eye, EyeOff, HeartHandshake, Search } from "lucide-react";
import { toast } from "sonner";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import { currency } from "@/components/customer/types";
import type { CustomerUser } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useJumatBerkah } from "@/hooks/use-jumat-berkah";
import { HERO_IMAGES } from "@/components/customer/customer-home-hero";
import { isFridayInJakarta, useHomeCatalog, useQuickAdd } from "@/components/customer/customer-home-editorial";
import { buildReorderCart, formatOrderDate, pickLastCompletedOrder, pickTopSellers, summarizeOrderItems, type FeaturedProduct } from "@/lib/home-feed";
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
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING, delay: 0.15 }}
        className="mt-2.5 inline-block rounded-[13px] bg-white/90 px-3 py-1.5 shadow-[0_4px_14px_rgba(20,60,110,0.14)] backdrop-blur-xl"
      >
        <p className="font-display text-[15px] font-black leading-tight tracking-tight text-foreground">{greetingForPeriod(period)}</p>
        <p className="text-[11px] font-semibold leading-tight text-muted-foreground">{name ? `${name}, mau pesan apa?` : "Pesan tanpa antre"}</p>
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

type QuickCard = { key: string; kicker: string; title: string; price: string; image: string | null; disabled?: boolean; onClick: () => void };

/** "Pilihan cepat buatmu": pesan ulang pesanan terakhir dan menu terlaris, satu ketukan ke keranjang. */
export function HomeQuickPicks({ username, signedIn }: { username: string; signedIn: boolean }) {
  const { bestSellers, productMap, ready } = useHomeCatalog();
  const { orders } = useCustomerOrders();
  const { addProduct, openMenu, setCart } = useQuickAdd(username);
  const lastOrder = useMemo(() => (signedIn ? pickLastCompletedOrder(orders) : null), [orders, signedIn]);
  const top = useMemo(() => pickTopSellers(bestSellers, productMap, 3), [bestSellers, productMap]);

  const reorder = useCallback(() => {
    if (!lastOrder) return;
    const { items, missing } = buildReorderCart(lastOrder, productMap);
    if (items.length === 0) {
      toast.error("Menu pada pesanan ini sudah tidak tersedia");
      return;
    }
    setCart((current) => {
      const next = [...current];
      for (const item of items) {
        const index = next.findIndex((entry) => entry.productId === item.productId && entry.variant === item.variant);
        if (index >= 0) next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
        else next.push(item);
      }
      return next;
    });
    toast.success(`${items.length} menu ditambahkan ke keranjang`);
    if (missing > 0) toast.warning(`${missing} menu tidak tersedia lagi dan dilewati`);
    openMenu();
  }, [lastOrder, openMenu, productMap, setCart]);

  const cards = useMemo<QuickCard[]>(() => {
    const list: QuickCard[] = [];
    if (lastOrder) {
      const image = productMap.get(lastOrder.items[0]?.productId)?.image;
      list.push({
        key: "reorder",
        kicker: `Pesan ulang · ${formatOrderDate(lastOrder.createdAt)}`,
        title: summarizeOrderItems(lastOrder),
        price: currency(lastOrder.totalAmount),
        image: typeof image === "string" && /^https?:\/\//.test(image) ? image : null,
        onClick: reorder,
      });
    }
    const fill: FeaturedProduct[] = top.slice(0, 2 - list.length);
    for (const item of fill) {
      list.push({
        key: item.productId,
        kicker: "Terlaris",
        title: item.name,
        price: item.price != null ? currency(item.price) : "Harga belum tersedia",
        image: item.image,
        disabled: !item.isAvailable,
        onClick: () => addProduct(item),
      });
    }
    return list;
  }, [addProduct, lastOrder, productMap, reorder, top]);

  if (!ready && cards.length === 0) return <div className="mt-4 h-[104px] animate-pulse rounded-[18px] bg-muted" role="status" aria-label="Memuat pilihan cepat" />;
  if (cards.length === 0) return null;

  return (
    <section aria-label="Pilihan cepat buatmu">
      <SectionDivider>
        <span aria-hidden="true">✨</span> Pilihan cepat buatmu
      </SectionDivider>
      <motion.div variants={listVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <motion.button
            key={card.key}
            type="button"
            variants={popVariants}
            whileTap={{ scale: 0.96 }}
            disabled={card.disabled}
            onClick={card.onClick}
            className={cn("rounded-2xl bg-card p-2 text-left shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", card.disabled && "opacity-55")}
          >
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-primary/10">
                {card.image ? <img src={card.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <img src="/assets/djiwa-services/menu.webp" alt="" className="h-[27px] w-[27px] object-contain" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[10.5px] text-muted-foreground">{card.kicker}</span>
                <span className="line-clamp-2 block text-[12.5px] font-bold leading-[1.2] text-foreground">{card.title}</span>
              </span>
            </span>
            <span className="mt-1.5 flex items-center justify-between border-t-[1.5px] border-dotted border-border pt-1.5 text-xs font-bold text-primary">
              <span>{card.disabled ? "Habis" : card.price}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
