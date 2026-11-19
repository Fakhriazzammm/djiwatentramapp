import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, CircleAlert } from "lucide-react";
import { Djiwa3DIcon, OwnerFooter, type Djiwa3DIconName } from "@djiwaapps/web-shared";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { BOOKING_STEPS, type BookingStep } from "./lib/booking-constants";
import type { BookingSettings } from "./lib/client";

export const EASE = [0.32, 0.72, 0, 1] as const;
export const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;
export const SOFT = { type: "spring", stiffness: 300, damping: 30 } as const;

const STEP_LABEL: Record<BookingStep, string> = { type: "Kebutuhan", "event-type": "Acara", date: "Jadwal", menu: "Menu", review: "Ringkasan", checkout: "Pemesan" };

export function Shell({ settings, children, onBack, progress, footer = true, dock = false, pageKey, direction }: {
  settings?: BookingSettings | null; children: ReactNode; onBack?: () => void;
  progress?: { index: number; total: number; label: BookingStep }; footer?: boolean; dock?: boolean; pageKey: string; direction: number;
}) {
  const configured = settings?.themeColor?.trim().toLowerCase();
  const accent = configured && configured !== "#000000" && /^#[0-9a-f]{6}$/i.test(configured) ? configured : undefined;
  const style = accent ? ({ "--bk-accent": accent, "--bk-accent-soft": `color-mix(in srgb, ${accent} 12%, white)` } as CSSProperties) : undefined;
  return <div className="bk" style={style}>
    <header className="bk-bar">
      <AnimatePresence initial={false}>
        {onBack ? <motion.button key="b" className="bk-back" aria-label="Kembali" onClick={onBack} initial={{ opacity: 0, scale: .6, width: 0, marginRight: -10 }} animate={{ opacity: 1, scale: 1, width: 38, marginRight: 0 }} exit={{ opacity: 0, scale: .6, width: 0, marginRight: -10 }} transition={SPRING} whileTap={{ scale: .88 }}><ArrowLeft size={19} strokeWidth={2.4} /></motion.button> : null}
      </AnimatePresence>
      <div className="bk-id">
        {settings?.logoUrl ? <img className="bk-logo" src={settings.logoUrl} alt="" /> : <span className="bk-logo"><CalendarDays size={17} /></span>}
        <div style={{ minWidth: 0 }}><b>{settings?.title || "Booking"}</b><small>Djiwa Tentram</small></div>
      </div>
      <AnimatePresence>{progress && <motion.span className="bk-chip" key="c" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .8 }} transition={SPRING}>{STEP_LABEL[progress.label]} · {progress.index + 1}/{progress.total}</motion.span>}</AnimatePresence>
    </header>
    {progress && <div className="bk-progress" role="progressbar" aria-valuemin={1} aria-valuemax={progress.total} aria-valuenow={progress.index + 1}><motion.i initial={false} animate={{ width: `${((progress.index + 1) / progress.total) * 100}%` }} transition={{ duration: .45, ease: EASE }} /></div>}
    <main className="bk-main">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={pageKey} custom={direction}
          variants={{ in: (d: number) => ({ opacity: 0, x: d * 32 }), on: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: d * -24 }) }}
          initial="in" animate="on" exit="out" transition={{ duration: .22, ease: EASE }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
    {footer && <div className={`bk-foot${dock ? " dock" : ""}`}><OwnerFooter compact twoLine /></div>}
  </div>;
}

export function Head({ title, detail }: { title: string; detail?: string }) {
  return <div className="bk-head"><h1 className="bk-title">{title}</h1>{detail && <p className="bk-sub">{detail}</p>}</div>;
}

/** Stagger-in wrapper for lists of blocks. */
export function Rise({ children, i = 0, className, style }: { children: ReactNode; i?: number; className?: string; style?: CSSProperties }) {
  return <motion.div className={className} style={style} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, ease: EASE, delay: Math.min(i, 8) * .045 }}>{children}</motion.div>;
}

export function Icon3D({ name, size = "sm" }: { name: Djiwa3DIconName; size?: "micro" | "sm" }) {
  return <span className="bk-ic"><Djiwa3DIcon name={name} size={size} alt="" style={{ width: 38, height: 38 }} /></span>;
}

export function Dock({ children, show = true }: { children: ReactNode; show?: boolean }) {
  // Portal: the page transition applies a transform, which would turn position:fixed into position:relative.
  return createPortal(<AnimatePresence>{show && <motion.div className="bk-dock" initial={{ y: 110 }} animate={{ y: 0 }} exit={{ y: 110 }} transition={SOFT}><div>{children}</div></motion.div>}</AnimatePresence>, document.body);
}

export function Button({ children, onClick, disabled, loading, variant, small, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; variant?: "ghost"; small?: boolean; type?: "button" | "submit" }) {
  return <motion.button type={type} className={`bk-btn${variant ? ` ${variant}` : ""}${small ? " sm" : ""}`} onClick={onClick} disabled={disabled || loading} whileTap={disabled || loading ? undefined : { scale: .97 }} transition={SPRING}>
    {loading ? <span className={`bk-spin${variant === "ghost" ? " dark" : ""}`} /> : children}
  </motion.button>;
}

export function StickyAction({ children, onClick, disabled, loading, show = true }: { children: ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean; show?: boolean }) {
  return <Dock show={show}><Button onClick={onClick} disabled={disabled} loading={loading}>{children}</Button></Dock>;
}

export function Note({ children, tone = "info", action, onAction }: { children: ReactNode; tone?: "info" | "err" | "warn"; action?: string; onAction?: () => void }) {
  return <motion.div className={`bk-note${tone === "info" ? "" : ` ${tone}`}`} role={tone === "err" ? "alert" : undefined} initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}>
    <CircleAlert size={18} /><div>{children}{action && <button type="button" onClick={onAction}>{action}</button>}</div>
  </motion.div>;
}

export function Loading({ text }: { text: string }) {
  return <div className="bk-state" aria-live="polite"><span className="bk-spin dark" style={{ width: 26, height: 26 }} /><span>{text}</span></div>;
}

/** Animated integer (slides up/down on change). */
export function Num({ value }: { value: number }) {
  return <span className="bk-num" aria-live="polite"><AnimatePresence mode="popLayout" initial={false}><motion.span key={value} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: .18, ease: EASE }}>{value}</motion.span></AnimatePresence></span>;
}

export function Radio({ on }: { on: boolean }) {
  return <span className={`bk-radio${on ? " on" : ""}`}><AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING} style={{ display: "grid" }}><Check size={14} strokeWidth={3.4} /></motion.span>}</AnimatePresence></span>;
}

export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return <label className="bk-field"><span>{label}{required && <sup> *</sup>}</span>{children}<AnimatePresence>{error && <motion.small className="bk-err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{error}</motion.small>}</AnimatePresence></label>;
}

export const stepsOf = (hasType: boolean, hasEvent: boolean, hasMenu: boolean) => BOOKING_STEPS.filter((s) => (s !== "type" || hasType) && (s !== "event-type" || hasEvent) && (s !== "menu" || hasMenu));
