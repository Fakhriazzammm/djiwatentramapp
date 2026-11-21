import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { playSound } from "../../lib/sound";
import { AnimatePresence, MotionConfig, animate, motion, useAnimation, useDragControls, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from "framer-motion";

export const ICON_NAMES = ["back", "close", "bell", "eye", "eyeoff", "search", "filter", "cal", "up", "plus", "check", "chev", "share", "copy", "shield", "help", "user", "flash", "clock", "warn", "info", "chart", "phone", "wifi", "receipt", "drop", "heart", "tv", "game", "car", "repeat", "gift", "grid", "bank", "down", "send", "scan", "qr", "link", "bag", "mic", "edit", "trash", "tag", "target", "flame", "users", "dl", "split", "trend", "pie", "list", "spark", "del", "book", "cup", "card", "home", "undo", "refresh", "swap", "wallet"] as const;
export type IconName = typeof ICON_NAMES[number];
export const iconOr = (name: string): IconName => ICON_NAMES.includes(name as IconName) ? name as IconName : "tag";
export const payAsset = (name: string) => `/assets/djiwapay-studio/${name.replace(/\.webp$/, "").replace("scan-qr", "scan")}.webp`;

export function Ic({ n, size, className = "" }: { n: IconName; size?: "sm" | "lg"; className?: string }) {
  return <img src={payAsset(iconOr(n))} className={`dpx-ic ${size ? "dpx-" + size : ""} ${className}`} alt="" aria-hidden="true" decoding="async" />;
}
export const Chev = () => <img className="dpx-chev" src={payAsset("chev")} alt="" aria-hidden="true" />;
const illustrationAssets = {
  "payment-wallet": "wallet", "customer-benefit-wallet": "wallet", "navigation-wallet": "wallet",
  "navigation-home": "home", "navigation-history": "receipt", "sales-report": "chart", "plan-target": "target",
  "order-receipt": "receipt", "restaurant-cafe": "cup", "loyalty-points": "bank",
  "notifications-alerts": "bell", "promo-voucher": "gift", "business-ai-assistant": "mascot",
} as const;
type PayIllustrationName = keyof typeof illustrationAssets;
export function I3({ name, px = 40, alt = "", style }: { name: PayIllustrationName; px?: number; alt?: string; style?: CSSProperties }) {
  return <img src={payAsset(illustrationAssets[name])} alt={alt} width={px} height={px} decoding="async" style={{ width: px, height: px, objectFit: "contain", flexShrink: 0, ...style }} />;
}
export function Mascot({ px = 112, style }: { px?: number; style?: CSSProperties }) {
  return <img src={payAsset("mascot")} alt="Maskot Djiwa Pay" width={px} height={px} style={{ width: px, height: px, objectFit: "contain", ...style }} />;
}

/** Maskot interaktif: melayang pelan, melompat saat diketuk, bisa diseret (miring lalu kembali) dan bicara lewat gelembung. */
export function MascotBuddy({ messages, px = 84, quotes = [] }: { messages: string[]; px?: number; quotes?: string[] }) {
  const [index, setIndex] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [isQuote, setIsQuote] = useState(false), quoteAt = useRef(0), quoteList = useRef(quotes), shown = useRef(false);
  quoteList.current = quotes;
  const controls = useAnimation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-140, 0, 140], [-16, 0, 16]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const say = (text: string, ms = 4200, quote = false) => {
    setBubble(text); setIsQuote(quote); shown.current = true; playSound("mascot");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { shown.current = false; setBubble(null); }, ms);
  };
  const hop = async () => {
    busy.current = true;
    await controls.start({ y: [0, 6, -30, 0, -6, 0], scaleX: [1, 1.1, 0.92, 1.08, 0.98, 1], scaleY: [1, 0.88, 1.1, 0.9, 1.03, 1], rotate: [0, 0, -8, 6, 0, 0], transition: { duration: 0.7, times: [0, 0.18, 0.45, 0.7, 0.85, 1], ease: "easeOut" } });
    busy.current = false;
  };
  useEffect(() => {
    const first = setTimeout(() => { say(messages[0] ?? "Halo!"); void hop(); }, 900);
    const idle = setInterval(() => { if (!busy.current) { busy.current = true; void controls.start({ rotate: [0, -10, 9, -6, 0], transition: { duration: 0.9 } }).then(() => { busy.current = false; }); } }, 11000);
    // Without a touch: every so often the mascot shares a thought, when nothing else is being said.
    const talk = setInterval(() => {
      const list = quoteList.current; if (!list.length || busy.current || shown.current || document.visibilityState !== "visible") return;
      const q = list[quoteAt.current % list.length]; quoteAt.current += 1;
      say(q, Math.min(12000, 4000 + q.length * 55), true); void hop();
    }, 16000);
    return () => { clearTimeout(first); clearInterval(idle); clearInterval(talk); if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onTap = () => {
    const next = (index + 1) % Math.max(messages.length, 1);
    setIndex(next);
    say(messages[next] ?? "Halo!");
    void hop();
  };
  return <div className="dpx-buddy">
    <AnimatePresence>{bubble ? <motion.div key={bubble} className={`dpx-buddy-bubble ${isQuote ? "dpx-buddy-q" : ""}`} role="status" initial={{ opacity: 0, scale: 0.85, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>{bubble}</motion.div> : null}</AnimatePresence>
    <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
      <motion.button type="button" className="dpx-buddy-btn" aria-label="Maskot Djiwa Pay. Ketuk untuk mendengar tips" animate={controls} style={{ x, rotate, width: px, height: px }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} dragSnapToOrigin onDragStart={() => say("Wuih, pelan-pelan!", 1800)} onTap={onTap} whileTap={{ scale: 0.94 }}>
        <img src={payAsset("mascot")} alt="" draggable={false} width={px} height={px} />
      </motion.button>
    </motion.div>
  </div>;
}

/** Font size for the big amount field so long numbers never clip. */
export const bigAmountSize = (digits: string) => { const n = digits.replace(/\D/g, "").length; const grouped = n + Math.floor((n - 1) / 3); return grouped <= 7 ? 52 : grouped <= 9 ? 42 : grouped <= 11 ? 34 : 28; };
export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;
export const ease = [0.32, 0.72, 0, 1] as const;

/** Every tappable control: springy press feedback, respects reduced motion through MotionConfig. */
export const Btn = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(function Btn({ whileTap, ...props }, ref) {
  return <motion.button ref={ref} whileTap={props.disabled ? undefined : whileTap ?? { scale: 0.96 }} transition={spring} {...props} />;
});

/** Staggered entrance for a block of content. */
export function Reveal({ children, i = 0, y = 14, className, style }: { children: ReactNode; i?: number; y?: number; className?: string; style?: CSSProperties }) {
  return <motion.div className={className} style={style} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.05 }}>{children}</motion.div>;
}

/** Counts to the new value instead of jumping. */
export function AnimatedNumber({ value, format = (n: number) => Math.round(n).toLocaleString("id-ID") }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const [text, setText] = useState(() => format(reduce ? value : 0));
  const first = useRef(true);
  useEffect(() => mv.on("change", (v) => setText(format(v))), [mv]);
  useEffect(() => {
    if (reduce) { mv.set(value); setText(format(value)); return; }
    const controls = animate(mv, value, { duration: first.current ? 1 : 0.55, ease });
    first.current = false;
    return () => controls.stop();
  }, [value, reduce]);
  return <>{text}</>;
}

/** Segmented control with a sliding highlight. */
export function Seg<T extends string>({ id, value, options, onChange, label, fit = false }: { id: string; value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (value: T) => void; label: string; fit?: boolean }) {
  return <div className={`dpx-seg ${fit ? "dpx-seg-fit" : ""}`} role="group" aria-label={label}>
    {options.map(([key, text]) => <Btn key={key} type="button" className={value === key ? "dpx-on" : ""} aria-pressed={value === key} onClick={() => onChange(key)}>
      {value === key ? <motion.span layoutId={`seg-${id}`} className="dpx-seg-pill" transition={spring} /> : null}
      <span style={{ position: "relative" }}>{text}</span>
    </Btn>)}
  </div>;
}

export function Bar({ percent, delay = 0 }: { percent: number; delay?: number }) {
  return <div className="dpx-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, percent))}%` }} transition={{ duration: 0.8, ease, delay }} /></div>;
}

export function SuccessMark({ tone = "ok" }: { tone?: "ok" | "warn" | "bad" }) {

  return <motion.div className={`dpx-success-ring ${tone === "ok" ? "" : "dpx-" + tone}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 16 }}>
    <img src={payAsset(tone === "ok" ? "check" : tone === "warn" ? "clock" : "close")} alt="" width={56} height={56} />
  </motion.div>;
}

/** Icon that wiggles every few seconds to draw attention (e.g. unread bell). */
export function Wiggle({ active, children }: { active: boolean; children: ReactNode }) {
  return <motion.span style={{ display: "grid", placeItems: "center" }} animate={active ? { rotate: [0, -16, 14, -9, 5, 0] } : { rotate: 0 }} transition={active ? { duration: 0.8, repeat: Infinity, repeatDelay: 4.5 } : undefined}>{children}</motion.span>;
}

/** Cross-fades between two icon states (e.g. eye / eye-off). */
export function IconSwap({ k, children }: { k: string; children: ReactNode }) {
  return <AnimatePresence mode="wait" initial={false}><motion.span key={k} style={{ display: "grid", placeItems: "center" }} initial={{ opacity: 0, scale: 0.6, rotate: -25 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.6, rotate: 25 }} transition={{ duration: 0.16 }}>{children}</motion.span></AnimatePresence>;
}

export function Row({ icon, tone, i3, title, sub, trail, onClick, chev = true, children, i }: { i?: number; icon?: IconName; tone?: string; i3?: PayIllustrationName; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onClick?: () => void; chev?: boolean; children?: ReactNode }) {
  const inner = <>
    <span className={`dpx-ico ${tone ? "dpx-c-" + tone : ""}`} style={tone ? { boxShadow: "none" } : undefined}>{i3 ? <I3 name={i3} px={30} /> : <Ic n={icon ?? "info"} />}</span>
    <span className="dpx-main"><b>{title}</b>{sub ? <span>{sub}</span> : null}</span>
    {trail ? <span className="dpx-trail">{trail}</span> : null}
    {onClick && chev ? <Chev /> : null}{children}
  </>;
  const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: Math.min(i ?? 0, 10) * 0.04 } };
  return onClick ? <Btn type="button" className="dpx-row" onClick={onClick} whileTap={{ scale: 0.985, backgroundColor: "rgba(45,36,29,.04)" }} {...enter}>{inner}</Btn> : <motion.div className="dpx-row" {...enter}>{inner}</motion.div>;
}

export function Header({ title, onBack, right, left }: { title?: string; onBack?: () => void; right?: ReactNode; left?: ReactNode }) {
  return <div className="dpx-hdr">
    {left ?? (onBack ? <Btn type="button" className="dpx-rb" onClick={onBack} aria-label="Kembali" whileTap={{ scale: 0.88 }}><Ic n="back" /></Btn> : <span style={{ width: 44 }} />)}
    <div className="dpx-grow">{title ? <h1>{title}</h1> : null}</div>
    {right ?? <span style={{ width: 44 }} />}
  </div>;
}

export type DayPart = "pagi" | "siang" | "sore" | "malam";
const SCENES: DayPart[] = ["pagi", "siang", "sore", "malam"];

export function Sky({ children, deep = false, scene: sceneProp }: { children: ReactNode; deep?: boolean; scene?: DayPart }) {
  const scene = sceneProp;
  return <div className={`dpx-sky ${deep ? "dpx-deep" : ""} ${scene ? "dpx-scened" : deep ? "" : "dpx-plain"} ${scene === "malam" ? "dpx-night" : ""}`}>
    {scene
      ? <div className="dpx-scene" aria-hidden="true">{SCENES.map((name) => <img key={name} src={`/bg/${name}.webp`} alt="" decoding="async" className={name === scene ? "on" : ""} />)}</div>
      : <div className="dpx-clouds" aria-hidden="true"><i /><i /><i /></div>}
    {children}
  </div>;
}

let scrollLocks = 0, lockedY = 0;
/** Keeps the page behind an open sheet still, so a swipe scrolls the sheet (iOS ignores overflow:hidden on body). */
function lockPageScroll() {
  if (typeof document === "undefined") return () => {};
  const b = document.body;
  if (scrollLocks++ === 0) { lockedY = window.scrollY; b.style.position = "fixed"; b.style.top = `-${lockedY}px`; b.style.left = "0"; b.style.right = "0"; b.style.width = "100%"; }
  return () => { if (--scrollLocks === 0) { b.style.position = ""; b.style.top = ""; b.style.left = ""; b.style.right = ""; b.style.width = ""; window.scrollTo(0, lockedY); } };
}

export function Sheet({ title, onClose, children, label }: { title?: string; onClose: () => void; children: ReactNode; label?: string }) {
  const controls = useDragControls();
  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered at the top of the document: a page that creates its own stacking context would otherwise trap the sheet under the floating tab bar.
  const node = <div className="dpx dpx-sheetwrap" style={{ background: "transparent", minHeight: 0, maxWidth: "none", overflow: "visible" }}>
    <motion.div className="dpx-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
    <motion.div className="dpx-sheet" role="dialog" aria-modal="true" aria-label={label ?? title}
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
      drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose(); }}>
      <div className="dpx-grabzone" onPointerDown={(event) => controls.start(event)}><div className="dpx-grab" /></div>
      {title !== undefined ? <div className="dpx-sh-h"><h2>{title}</h2><Btn type="button" className="dpx-sh-x" onClick={onClose} aria-label="Tutup" whileTap={{ scale: 0.85, rotate: 90 }}><Ic n="close" size="sm" /></Btn></div> : null}
      {children}
    </motion.div>
  </div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

export const serviceTone: Record<string, string> = { pulsa: "blue", data: "violet", "pln-token": "amber", "pln-bill": "orange", pdam: "cyan", bpjs: "rose", tv: "indigo", game: "emerald", multifinance: "slate", etoll: "indigo" };
export const serviceIcon: Record<string, IconName> = { pulsa: "phone", data: "wifi", "pln-token": "flash", "pln-bill": "receipt", pdam: "drop", bpjs: "heart", tv: "tv", game: "game", multifinance: "car", etoll: "wallet" };

/** Full-screen page wrapper with an entrance animation (pages outside the tabbed shell). */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <MotionConfig reducedMotion="user"><motion.div className={`dpx ${className}`.trim()} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease }}>{children}</motion.div></MotionConfig>;
}


/** The person's Google / account photo, or their initial when there is none or it cannot load. */
export function Avatar({ url, initial }: { url?: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  const src = url && /^https:\/\//.test(url) ? url.replace(/=s\d+(-c)?$/, "=s256-c") : "";
  useEffect(() => setFailed(false), [src]);
  return src && !failed
    ? <img className="dpx-av-img" src={src} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
    : <>{initial}</>;
}
