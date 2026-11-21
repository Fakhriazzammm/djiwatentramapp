import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation, useMotionValue, useReducedMotion, useSpring, useTransform, type PanInfo } from "framer-motion";
import { playSound } from "../lib/sound";
import { markDjiwaPayOpeningSeen, nextOpeningLine } from "../lib/djiwa-pay-opening";

const VIDEO_BASE = "/assets/djiwapay-opening/mascot-hello";
const MASCOT_SRC = "/assets/djiwapay-studio/mascot.webp";
/** Never keep a customer waiting on a video that will not start. */
const VIDEO_START_TIMEOUT_MS = 2_500;

type Phase = "intro" | "live" | "leaving";
type Coin = { id: number; x: number; y: number; r: number };

/**
 * First-launch opening. The Higgsfield-animated mascot clip plays once on an
 * ivory stage, then hands over (cross-fade at the exact same position) to a
 * live mascot the customer can tap, drag and tilt. Swipe up or "Mulai" opens
 * the app; the boot splash keeps loading underneath the whole time.
 */
export function DjiwaPayOpening({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduce ? "live" : "intro");
  const [bubble, setBubble] = useState<string | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const lineIndex = useRef(-1);
  const coinId = useRef(0);
  const bubbleTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const goLive = () => setPhase((current) => (current === "intro" ? "live" : current));

  useEffect(() => {
    if (phase !== "intro") return;
    const video = videoRef.current;
    const timeout = window.setTimeout(() => { if (!video || video.paused || video.readyState < 2) goLive(); }, VIDEO_START_TIMEOUT_MS);
    video?.play().catch(goLive);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const greet = window.setTimeout(() => { lineIndex.current = 0; say(nextOpeningLine(0).line, 3600); }, 450);
    return () => window.clearTimeout(greet);
  }, [phase]);

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
    if (phase === "intro") { goLive(); return; }
    if (phase !== "live") return;
    const { index, line } = nextOpeningLine(lineIndex.current + 1);
    lineIndex.current = index;
    say(line);
    playSound("mascot");
    burst();
    void hop.start({
      y: [0, 8, -44, 0, -8, 0],
      scaleX: [1, 1.1, 0.92, 1.08, 0.98, 1],
      scaleY: [1, 0.86, 1.12, 0.9, 1.03, 1],
      transition: { duration: 0.72, times: [0, 0.16, 0.45, 0.7, 0.85, 1], ease: "easeOut" },
    });
  };

  const finish = () => {
    if (phase === "leaving") return;
    setPhase("leaving");
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

  const showMascot = phase !== "intro";

  return (
    <motion.div
      className="djiwa-opening"
      role="dialog"
      aria-modal="true"
      aria-label="Selamat datang di Djiwa Pay"
      initial={{ opacity: 1 }}
      animate={phase === "leaving" ? { opacity: 0, y: reduce ? 0 : "-6%" } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.55, ease: [0.32, 0.72, 0, 1] }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => { px.set(0); py.set(0); }}
      onPanEnd={onStagePan}
    >
      <button type="button" className="djiwa-opening-skip" onClick={finish}>Lewati</button>

      <div className="djiwa-opening-stage">
        <motion.div className="djiwa-opening-glow" style={{ x: glowX }} aria-hidden="true" />
        {!reduce ? (
          <motion.video
            ref={videoRef}
            className="djiwa-opening-video"
            muted
            playsInline
            preload="auto"
            poster={`${VIDEO_BASE}-poster.jpg`}
            onEnded={goLive}
            onError={goLive}
            onClick={tapMascot}
            animate={{ opacity: showMascot ? 0 : 1 }}
            transition={{ duration: 0.35 }}
            aria-hidden="true"
          >
            <source src={`${VIDEO_BASE}.webm`} type="video/webm" />
            <source src={`${VIDEO_BASE}.mp4`} type="video/mp4" />
          </motion.video>
        ) : null}

        <motion.div className="djiwa-opening-mascot-slot" style={{ x: leanX, y: leanY, rotate: leanR }} initial={false} animate={{ opacity: showMascot ? 1 : 0 }} transition={{ duration: 0.35 }}>
          <AnimatePresence>
            {bubble && showMascot ? (
              <motion.div key={bubble} className="djiwa-opening-bubble" role="status" initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
                {bubble}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div className="djiwa-opening-float" animate={showMascot && !reduce ? { y: [0, -8, 0] } : { y: 0 }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
            <motion.button
              type="button"
              className="djiwa-opening-mascot"
              aria-label="Maskot Djiwa Pay. Ketuk untuk menyapa"
              animate={hop}
              style={{ x: dx, rotate: dragR }}
              drag={phase === "live"}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.45}
              dragSnapToOrigin
              onDragStart={() => { draggingMascot.current = true; say("Wuih, pelan-pelan!", 1600); }}
              onDragEnd={() => { window.setTimeout(() => { draggingMascot.current = false; }, 0); }}
              onTap={tapMascot}
              whileTap={{ scale: 0.95 }}
            >
              <img src={MASCOT_SRC} alt="" draggable={false} />
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
        <p className="djiwa-opening-sub">Ketuk maskotnya untuk menyapa, lalu geser ke atas untuk mulai.</p>
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
