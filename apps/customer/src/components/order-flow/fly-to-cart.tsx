import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { CART_FLY_TARGET_ID } from "./flow-dock";

export type CartFlight = { id: number; image?: string | null; name: string; from: { x: number; y: number } };

const SIZE = 46;

/** Pantulan kecil pada ikon Keranjang saat item tiba. */
function pulseTarget() {
	try {
		const target = document.getElementById(CART_FLY_TARGET_ID);
		target?.animate(
			[{ transform: "scale(1) rotate(0)" }, { transform: "scale(1.4) rotate(-10deg)" }, { transform: "scale(0.9) rotate(6deg)" }, { transform: "scale(1) rotate(0)" }],
			{ duration: 460, easing: "cubic-bezier(.34,1.56,.64,1)" },
		);
	} catch {
		/* animasi opsional */
	}
}

function Flight({ flight, onDone }: { flight: CartFlight; onDone: (id: number) => void }) {
	const reduce = useReducedMotion();
	const path = useMemo(() => {
		const rect = typeof document !== "undefined" ? document.getElementById(CART_FLY_TARGET_ID)?.getBoundingClientRect() : null;
		const tx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
		const ty = rect ? rect.top + rect.height / 2 : window.innerHeight - 44;
		const dx = tx - flight.from.x;
		const dy = ty - flight.from.y;
		return { dx, dy, lift: Math.min(140, Math.max(70, Math.abs(dy) * 0.25)) };
	}, [flight]);

	if (reduce) {
		// Tanpa gerak berlebihan: cukup denyut pada tujuan.
		return <span ref={() => { pulseTarget(); window.setTimeout(() => onDone(flight.id), 50); }} className="hidden" />;
	}
	return (
		<motion.div
			aria-hidden="true"
			className="pointer-events-none fixed z-[1200] overflow-hidden rounded-full border-2 border-white bg-primary shadow-[0_10px_28px_rgba(15,23,42,0.35)]"
			style={{ left: flight.from.x - SIZE / 2, top: flight.from.y - SIZE / 2, width: SIZE, height: SIZE }}
			initial={{ x: 0, y: 0, scale: 0.6, opacity: 0, rotate: 0 }}
			animate={{ x: [0, path.dx * 0.45, path.dx], y: [0, -path.lift, path.dy], scale: [0.6, 1.2, 0.32], opacity: [0, 1, 1, 0.85], rotate: [0, -14, 26] }}
			transition={{ duration: 0.85, times: [0, 0.4, 1], ease: "easeInOut" }}
			onAnimationComplete={() => { pulseTarget(); onDone(flight.id); }}
		>
			{flight.image ? <img src={flight.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-lg font-black text-white">+</span>}
		</motion.div>
	);
}

/** Lapisan global: setiap item yang ditambah melayang melengkung ke ikon Keranjang. */
export function FlyToCartLayer({ flights, onDone }: { flights: CartFlight[]; onDone: (id: number) => void }) {
	return <AnimatePresence>{flights.map((flight) => <Flight key={flight.id} flight={flight} onDone={onDone} />)}</AnimatePresence>;
}
