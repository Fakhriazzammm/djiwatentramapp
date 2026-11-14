import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, animate, motion, useDragControls, useMotionValue, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@djiwaapps/web-shared";

const PATHS = {
  back: "M15 18l-6-6 6-6", close: "M18 6L6 18M6 6l12 12", bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z", eyeoff: "M17.9 17.9A10.1 10.1 0 0112 19c-6.4 0-10-7-10-7a18 18 0 014.1-5M9.9 4.2A9.7 9.7 0 0112 4c6.4 0 10 7 10 7a18 18 0 01-2.2 3.2M1 1l22 22",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3", filter: "M4 6h16M7 12h10M10 18h4", cal: "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM16 2v4M8 2v4M3 10h18",
  up: "M12 19V5M5 12l7-7 7 7", plus: "M12 5v14M5 12h14", check: "M20 6L9 17l-5-5", chev: "M9 6l6 6-6 6", share: "M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v14",
  copy: "M11 9h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1", shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  help: "M12 2a10 10 0 100 20 10 10 0 000-20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01", user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0", flash: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2", warn: "M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01", info: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 16v-4M12 8h.01",
  chart: "M3 3v18h18M7 15v3M12 9v9M17 5v13", phone: "M9 2h6a3 3 0 013 3v14a3 3 0 01-3 3H9a3 3 0 01-3-3V5a3 3 0 013-3zM11 18h2", wifi: "M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a14 14 0 0120 0M12 20h.01",
  receipt: "M4 2v20l3-2 2.5 2L12 20l2.5 2L17 20l3 2V2l-3 2-2.5-2L12 4 9.5 2 7 4 4 2zM8 9h8M8 13h8", drop: "M12 2.7S5 10 5 14.5a7 7 0 0014 0C19 10 12 2.7 12 2.7z",
  heart: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z", tv: "M4 7h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zM17 2l-5 5-5-5",
  game: "M6 11h4M8 9v4M15 12h.01M18 10h.01M8 6h8a6 6 0 010 12H8A6 6 0 018 6z", car: "M5 17H3v-5l2-5h14l2 5v5h-2M5 17a2 2 0 104 0M15 17a2 2 0 104 0M9 17h6M3 12h18",
  repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3", gift: "M3 8h18v4H3zM12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5",
  grid: "M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z", bank: "M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z",
  down: "M12 5v14M19 12l-7 7-7-7", send: "M22 2L11 13M22 2l-7 20-4-9-9-4z", scan: "M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3M21 14v.01M14 21h3M21 17v4", link: "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1", bag: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15", swap: "M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4", wallet: "M20 7H5a2 2 0 010-4h13v4zM3 5v14a2 2 0 002 2h15a1 1 0 001-1V8a1 1 0 00-1-1M17 14h.01",
} as const;
export type IconName = keyof typeof PATHS;

export function Ic({ n, size, className = "" }: { n: IconName; size?: "sm" | "lg"; className?: string }) {
  return <svg className={`dpx-ic ${size ? "dpx-" + size : ""} ${className}`} viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[n]} /></svg>;
}
export const Chev = () => <svg className="dpx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/** Catalog 3D illustration. Decorative unless `alt` is passed. */
export function I3({ name, px = 40, alt = "", style }: { name: Djiwa3DIconName; px?: number; alt?: string; style?: CSSProperties }) {
  return <Djiwa3DIcon name={name} alt={alt} size="sm" style={{ width: px, height: px, ...style }} />;
}

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
export function Seg<T extends string>({ id, value, options, onChange, label }: { id: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; label: string }) {
  return <div className="dpx-seg" role="group" aria-label={label}>
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
  const d = tone === "ok" ? "M20 6L9 17l-5-5" : tone === "warn" ? "M12 6v6l4 2" : "M18 6L6 18M6 6l12 12";
  return <motion.div className={`dpx-success-ring ${tone === "ok" ? "" : "dpx-" + tone}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 16 }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><motion.path d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }} /></svg>
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

export function Row({ icon, tone, i3, title, sub, trail, onClick, chev = true, children, i }: { i?: number; icon?: IconName; tone?: string; i3?: Djiwa3DIconName; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onClick?: () => void; chev?: boolean; children?: ReactNode }) {
  const inner = <>
    <span className={`dpx-ico ${tone ? "dpx-c-" + tone : ""}`} style={tone ? { boxShadow: "none" } : undefined}>{i3 ? <I3 name={i3} px={30} /> : <Ic n={icon ?? "info"} />}</span>
    <span className="dpx-main"><b>{title}</b>{sub ? <span>{sub}</span> : null}</span>
    {trail ? <span className="dpx-trail">{trail}</span> : null}
    {onClick && chev ? <Chev /> : null}{children}
  </>;
  const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: Math.min(i ?? 0, 10) * 0.04 } };
  return onClick ? <Btn type="button" className="dpx-row" onClick={onClick} whileTap={{ scale: 0.985, backgroundColor: "rgba(15,35,71,.04)" }} {...enter}>{inner}</Btn> : <motion.div className="dpx-row" {...enter}>{inner}</motion.div>;
}

export function Header({ title, onBack, right, left }: { title?: string; onBack?: () => void; right?: ReactNode; left?: ReactNode }) {
  return <div className="dpx-hdr">
    {left ?? (onBack ? <Btn type="button" className="dpx-rb" onClick={onBack} aria-label="Kembali" whileTap={{ scale: 0.88 }}><Ic n="back" /></Btn> : <span style={{ width: 44 }} />)}
    <div className="dpx-grow">{title ? <h1>{title}</h1> : null}</div>
    {right ?? <span style={{ width: 44 }} />}
  </div>;
}

export function Sky({ children, deep = false }: { children: ReactNode; deep?: boolean }) {
  return <div className={`dpx-sky ${deep ? "dpx-deep" : ""}`}><div className="dpx-clouds" aria-hidden="true"><i /><i /><i /></div>{children}</div>;
}

export function Sheet({ title, onClose, children, label }: { title?: string; onClose: () => void; children: ReactNode; label?: string }) {
  const controls = useDragControls();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="dpx dpx-sheetwrap" style={{ background: "transparent", minHeight: 0, maxWidth: "none", overflow: "visible" }}>
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
}

export const serviceTone: Record<string, string> = { pulsa: "blue", data: "violet", "pln-token": "amber", "pln-bill": "orange", pdam: "cyan", bpjs: "rose", tv: "indigo", game: "emerald", multifinance: "slate" };
export const serviceIcon: Record<string, IconName> = { pulsa: "phone", data: "wifi", "pln-token": "flash", "pln-bill": "receipt", pdam: "drop", bpjs: "heart", tv: "tv", game: "game", multifinance: "car" };

/** Full-screen page wrapper with an entrance animation (pages outside the tabbed shell). */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <MotionConfig reducedMotion="user"><motion.div className={`dpx ${className}`.trim()} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease }}>{children}</motion.div></MotionConfig>;
}
