import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNewFeature } from "../../lib/finance/new-feature";
import { spring } from "./dpx-ui";

/** The standard "Baru" mark. `float` sits on the top-left edge of a card (the card is `position: relative`); `inline` sits beside a label. It pops in, glints, and leaves with a short fade when its 2 days are over. */
export function NewBadge({ show, variant = "inline" }: { show: boolean; variant?: "float" | "inline" }) {
  const reduce = Boolean(useReducedMotion());
  return <AnimatePresence initial>{show ? <motion.span key="new" className={`dpx-newbadge ${variant}`} aria-label="Fitur baru" initial={reduce ? false : { scale: 0.4, opacity: 0, y: variant === "float" ? 6 : 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }} exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.25 } }} transition={spring}>
    <span className="t">Baru</span>{reduce ? null : <i className="glint" aria-hidden="true" />}
  </motion.span> : null}</AnimatePresence>;
}

/** A badge that watches itself: put it beside a menu label or row title. The 2 days start when it has been in view. */
export function NewTag({ id }: { id: string }) {
  const nf = useNewFeature<HTMLSpanElement>(id);
  return <span ref={nf.ref} className="dpx-newtag"><NewBadge show={nf.fresh} variant="inline" /></span>;
}
