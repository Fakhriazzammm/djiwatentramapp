import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Ic } from "./dpx-ui";
import { islandAmount, islandNavigate, islandShown, useIslandState, type IslandItem } from "../../lib/island";

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 } as const;
const START_MS = 1400, COMPACT_MS = 1100, EXPANDED_MS = 4800, EXIT_MS = 520;
const TONE: Record<IslandItem["tone"], string> = { in: "#34c759", out: "#ff6b4a", move: "#5ab0ff", mail: "#ffb340", warn: "#ffcc00", info: "#bf8cff" };

/** A Dynamic-Island-style banner: it drops in as a small pill, opens to show the detail, folds away, then the next one follows. */
export function IslandHost() {
  const { queue, version } = useIslandState();
  const [pos, setPos] = useState(-1), [open, setOpen] = useState(false), [held, setHeld] = useState(false), [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), exit = useRef<ReturnType<typeof setTimeout> | null>(null), len = useRef(0);
  len.current = queue.length;
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const item = !leaving && pos >= 0 ? queue[pos] : undefined;

  const leave = useCallback(() => {
    clear(); if (exit.current) clearTimeout(exit.current); setOpen(false); setHeld(false); setLeaving(true);
    exit.current = setTimeout(() => { exit.current = null; setLeaving(false); setPos((p) => (p + 1 < len.current ? p + 1 : -1)); }, EXIT_MS);   // its own timer: the effects below clear `timer` when this banner goes away
  }, []);

  // a fresh queue starts after a short beat
  useEffect(() => { clear(); if (exit.current) { clearTimeout(exit.current); exit.current = null; } setOpen(false); setHeld(false); setLeaving(false); setPos(-1); if (!queue.length) return; timer.current = setTimeout(() => setPos(0), START_MS); return () => { clear(); if (exit.current) clearTimeout(exit.current); }; }, [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  // one banner: it arrives compact, opens by itself after a moment
  useEffect(() => { if (pos < 0 || !queue[pos]) return; islandShown(queue[pos]); setOpen(false); clear(); timer.current = setTimeout(() => setOpen(true), COMPACT_MS); return clear; }, [pos]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ... and folds away on its own unless a finger is on it
  useEffect(() => { if (!item || !open || held) return; clear(); timer.current = setTimeout(leave, EXPANDED_MS); return clear; }, [open, held, item, leave]);

  const onDragEnd = (_: unknown, info: PanInfo) => { if (info.offset.y < -22 || info.velocity.y < -380) leave(); else if (info.offset.y > 16 && !open) { setOpen(true); setHeld(true); } };
  const go = () => { if (item?.route) islandNavigate(item.route); leave(); };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="dpx dpx-isl-wrap" aria-live="polite"><AnimatePresence>
    {item ? <motion.div key={item.id} className={`dpx-isl ${open ? "open" : ""}`} role="status"
      initial={{ y: -70, scale: 0.6, opacity: 0, width: 126, height: 36, borderRadius: 20 }}
      animate={{ y: 0, scale: 1, opacity: 1, width: open ? "min(calc(100vw - 20px), 400px)" : 214, height: open ? 122 : 38, borderRadius: open ? 34 : 20 }}
      exit={{ y: -72, scale: 0.55, opacity: 0, width: 126, height: 36 }} transition={SPRING}
      drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.5, bottom: 0.18 }} onDragEnd={onDragEnd}
      onPointerDown={() => { if (open) setHeld(true); }} onPointerUp={() => { if (open) setHeld(false); }} onPointerCancel={() => setHeld(false)}
      onClick={() => { if (!open) { setOpen(true); setHeld(true); } }} whileTap={{ scale: 0.975 }}>
      <div className="dpx-isl-in">
        <span className="dpx-isl-ic" style={{ background: TONE[item.tone] }}><Ic n={item.icon} /></span>
        {open ? <motion.div className="dpx-isl-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.18 }}>
          <div className="dpx-isl-top"><small>{item.label}</small><small>{queue.length > 1 ? `${Math.min(pos + 1, queue.length)} dari ${queue.length}` : "baru saja"}</small></div>
          <b>{item.title}{item.amount !== undefined ? <span className={`amt ${item.tone}`}> {islandAmount(item)}</span> : null}</b>
          <span className="dpx-isl-msg">{item.message}</span>
          <div className="dpx-isl-acts"><button type="button" onClick={(e) => { e.stopPropagation(); go(); }}>{item.route ? "Buka" : "Oke"}</button><button type="button" className="ghost" onClick={(e) => { e.stopPropagation(); leave(); }}>Tutup</button></div>
        </motion.div> : <motion.div className="dpx-isl-c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}><b>{item.amount !== undefined ? islandAmount(item) : item.title}</b></motion.div>}
      </div>
    </motion.div> : null}
  </AnimatePresence></div>, document.body);
}
