import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation, useMotionValue, useReducedMotion, useSpring, useTransform, type PanInfo } from "framer-motion";
import { playSound } from "../lib/sound";
import { markDjiwaPayOpeningSeen, nextOpeningLine } from "../lib/djiwa-pay-opening";

import { DjiwaPayLogoLoader, mascotActions } from "./djiwa-pay-logo-loader";

type Coin = { id: number; x: number; y: number; r: number };

export function DjiwaPayOpening({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [actionIndex, setActionIndex] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const coinId = useRef(0);
  const bubbleTimer = useRef<number | null>(null);
  const hop = useAnimation();
  const draggingMascot = useRef(false);

  // Pointer parallax: the mascot leans toward the finger / cursor.
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 18 }), sy = useSpring(py, { stiffness: 120, damping: 18 });
  const leanX = useTransform(sx, [-1, 1], [-14, 14]);
  const leanY = useTransform(sy, [-1, 1], [-10, 10]);
  const leanR = useTransform(sx, [-1, 1], [-6, 6]);
  const glowX = useTransform(sx, [-1, 1], [-30, 30]);

  // Drag: stretch and tilt, then spring home.
  const dx = useMotionValue(0);
  const dragR = useTransform(dx, [-160, 0, 160], [-18, 0, 18]);

  const say = (line: string, ms = 3200) => {
    setBubble(line);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  useEffect(() => () => { if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current); }, []);

  const burst = () => {
    const fresh = Array.from({ length: 6 }, (_, i) => {
      const angle = (-150 + i * 24 + Math.random() * 12) * (Math.PI / 180);
      const dist = 90 + Math.random() * 60;
      return { id: ++coinId.current, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: Math.random() * 360 };
    });
    setCoins((list) => [...list, ...fresh]);
    window.setTimeout(() => setCoins((list) => list.filter((c) => !fresh.includes(c))), 900);
  };

  const tapMascot = () => {
    if (leaving || draggingMascot.current) return;
    const next = nextOpeningLine(actionIndex + 1);
    setActionIndex(next.index);
    say(next.line);
    playSound("mascot");
    if (reduce) return;
    burst();
    void hop.start({
      y: [0, 8, -44, 0, -8, 0],
      scaleX: [1, 1.1, 0.92, 1.08, 0.98, 1],
      scaleY: [1, 0.86, 1.12, 0.9, 1.03, 1],
      transition: { duration: 0.72, times: [0, 0.16, 0.45, 0.7, 0.85, 1], ease: "easeOut" },
    });
  };

  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    markDjiwaPayOpeningSeen();
    playSound("mascot");
    window.setTimeout(onDone, reduce ? 120 : 620);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (reduce) return;
    px.set((event.clientX / window.innerWidth) * 2 - 1);
    py.set((event.clientY / window.innerHeight) * 2 - 1);
  };

  const onStagePan = (_: unknown, info: PanInfo) => {
    if (draggingMascot.current) return;
    if (info.offset.y < -90 || info.velocity.y < -600) finish();
  };


  return (
    <motion.div
      className="djiwa-opening"
      role="dialog"
      aria-modal="true"
      aria-label="Selamat datang di Djiwa Pay"
      initial={{ opacity: 1 }}
      animate={leaving ? { opacity: 0, y: reduce ? 0 : "-6%" } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.55, ease: [0.32, 0.72, 0, 1] }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => { px.set(0); py.set(0); }}
      onPanEnd={onStagePan}
    >
      <button type="button" className="djiwa-opening-skip" onClick={finish}>Lewati</button>

      <div className="djiwa-opening-stage">
        <motion.div className="djiwa-opening-glow" style={{ x: glowX }} aria-hidden="true" />
        <motion.div className="djiwa-opening-mascot-slot" style={{ x: leanX, y: leanY, rotate: leanR }}>
          <AnimatePresence>
            {bubble ? (
              <motion.div key={bubble} className="djiwa-opening-bubble" role="status" initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
                {bubble}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div className="djiwa-opening-float" animate={!reduce ? { y: [0, -8, 0] } : { y: 0 }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
            <motion.button
              type="button"
              className="djiwa-opening-mascot"
              aria-label="Maskot Djiwa Pay. Ketuk untuk mengganti aksi"
              animate={hop}
              style={{ x: dx, rotate: dragR }}
              drag={!leaving && !reduce}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.45}
              dragSnapToOrigin
              onDragStart={() => { draggingMascot.current = true; say("Wuih, pelan-pelan!", 1600); }}
              onDragEnd={() => { window.setTimeout(() => { draggingMascot.current = false; }, 0); }}
              onClick={tapMascot}
              whileTap={{ scale: 0.95 }}
            >
              {actionIndex === 0 ? (
                <picture>
                  <source media="(prefers-reduced-motion: no-preference)" srcSet="/assets/djiwapay-opening/music-box.gif" />
                  <img src="/assets/djiwapay-opening/music-box.webp" alt="" draggable={false} />
                </picture>
              ) : <DjiwaPayLogoLoader action={mascotActions[actionIndex]} />}
            </motion.button>
            {coins.map((coin) => (
              <motion.span
                key={coin.id}
                className="djiwa-opening-coin"
                aria-hidden="true"
                initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
                animate={{ x: coin.x, y: coin.y, scale: 1, opacity: 0, rotate: coin.r }}
                transition={{ duration: 0.85, ease: "easeOut" }}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="djiwa-opening-copy">
        <p className="djiwa-opening-eyebrow">Djiwa Pay</p>
        <h1 className="djiwa-opening-title">Keuangan tertata,<br />tagihan beres.</h1>
        <p className="djiwa-opening-sub">Ketuk maskot untuk ganti aksi. Geser ke atas untuk mulai.</p>
        <motion.button type="button" className="djiwa-opening-cta" onClick={finish} whileTap={{ scale: 0.96 }}>
          Mulai
        </motion.button>
        <motion.span className="djiwa-opening-swipe" aria-hidden="true" animate={reduce ? undefined : { y: [0, -6, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }}>
          ︿
        </motion.span>
      </div>
    </motion.div>
  );
}
