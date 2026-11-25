import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNewFeature } from "@/lib/new-feature";

const spring = { type: "spring", stiffness: 420, damping: 26 } as const;

/**
 * Tanda "Baru" standar untuk fitur baru. `float` duduk di pojok kiri-atas sebuah kartu (kartunya
 * `position: relative`); `inline` di samping sebuah label. Tanda muncul, berkilau, lalu menghilang
 * dengan pudar singkat saat dua harinya selesai.
 */
export function NewBadge({ show, variant = "inline" }: { show: boolean; variant?: "float" | "inline" }) {
  const reduce = Boolean(useReducedMotion());
  return (
    <AnimatePresence initial>
      {show ? (
        <motion.span
          key="new"
          aria-label="Fitur baru"
          initial={reduce ? false : { scale: 0.4, opacity: 0, y: variant === "float" ? 6 : 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
          exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.22 } }}
          transition={spring}
          className={
            variant === "float"
              ? "absolute -top-2 left-4 z-10 inline-flex items-center overflow-visible rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold leading-tight text-primary-foreground shadow-[0_4px_10px_rgba(20,60,110,0.35)]"
              : "relative inline-flex items-center overflow-hidden rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold leading-tight text-primary-foreground"
          }
        >
          Baru
          {reduce || variant === "float" ? null : (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{ animation: "djiwa-new-glint 2.6s ease-in-out infinite" }}
            />
          )}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** Tanda yang mengamati dirinya sendiri: letakkan di samping label menu atau judul baris. Dua harinya mulai saat tanda berada di layar. */
export function NewTag({ id }: { id: string }) {
  const nf = useNewFeature<HTMLSpanElement>(id);
  return (
    <span ref={nf.ref} className="inline-flex align-middle">
      <NewBadge show={nf.fresh} variant="inline" />
    </span>
  );
}
