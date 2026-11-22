import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import { cn } from "@/lib/utils";
import { SPRING, tap } from "./step-parts";

/** id elemen tujuan animasi "melayang ke keranjang". */
export const CART_FLY_TARGET_ID = "flow-cart-target";

type TabProps = { label: string; icon: React.ComponentProps<typeof Djiwa3DIcon>["name"]; onClick: () => void; badge?: number; active?: boolean; targetId?: string };

function Tab({ label, icon, onClick, badge, active, targetId }: TabProps) {
	const reduce = useReducedMotion();
	return (
		<motion.button
			type="button"
			onClick={() => { tap(); onClick(); }}
			whileTap={reduce ? undefined : { scale: 0.9 }}
			transition={SPRING}
			className={cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[26px] py-1.5 text-[11px] font-semibold transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground")}
		>
			<span id={targetId} className="relative">
				<Djiwa3DIcon name={icon} size="micro" alt="" className="h-6 w-6 object-contain" />
				<AnimatePresence>
					{badge ? (
						<motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING} className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff7a1a] px-1 text-[11px] font-bold leading-none text-white">
							<motion.span key={badge} initial={reduce ? false : { y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING}>{badge}</motion.span>
						</motion.span>
					) : null}
				</AnimatePresence>
			</span>
			{label}
		</motion.button>
	);
}

/**
 * Bar bawah alur pesan: kapsul keranjang melayang di atas tab kaca.
 * Kapsul memantul tiap isi keranjang berubah; ikon Keranjang adalah tujuan animasi terbang.
 */
export function FlowDock({
	totalItems,
	totalLabel,
	hasReceipt,
	primaryLabel,
	primaryDisabled,
	onMenu,
	onHistory,
	onCart,
	onStaff,
	onPrimary,
}: {
	totalItems: number;
	totalLabel: string;
	hasReceipt: boolean;
	primaryLabel: string;
	primaryDisabled: boolean;
	onMenu: () => void;
	onHistory: () => void;
	onCart: () => void;
	onStaff: () => void;
	onPrimary: () => void;
}) {
	const reduce = useReducedMotion();
	const showCapsule = hasReceipt || totalItems > 0;
	return (
		<div className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5">
			<AnimatePresence>
				{showCapsule ? (
					<motion.button
						key="capsule"
						type="button"
						disabled={primaryDisabled}
						onClick={() => { tap(12); onPrimary(); }}
						initial={reduce ? false : { y: 90, opacity: 0, scale: 0.94 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						exit={reduce ? undefined : { y: 90, opacity: 0, scale: 0.94 }}
						whileTap={reduce ? undefined : { scale: 0.97 }}
						transition={{ type: "spring", stiffness: 340, damping: 24 }}
						className="relative flex h-[60px] w-full items-center gap-3 overflow-hidden rounded-[30px] bg-primary pl-3 pr-2 text-left text-primary-foreground shadow-[0_16px_32px_-10px_var(--primary)] disabled:opacity-50"
					>
						{!reduce ? <motion.span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-14 -skew-x-[20deg] bg-white/25" initial={{ left: "-20%" }} animate={{ left: ["-20%", "-20%", "120%"] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.65, 1], ease: "easeInOut", delay: 2 }} /> : null}
						<Djiwa3DIcon name={hasReceipt && totalItems === 0 ? "order-receipt" : "shopping-cart-order"} size="micro" alt="" className="h-10 w-10 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.25)]" />
						<span className="relative min-w-0 flex-1 leading-tight">
							<motion.b key={totalLabel} initial={reduce ? false : { y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="block text-base font-bold tabular-nums">{hasReceipt && totalItems === 0 ? "Pesananmu" : totalLabel}</motion.b>
							<span className="text-xs opacity-85">{hasReceipt && totalItems === 0 ? "Lihat struk & status" : `${totalItems} item`}</span>
						</span>
						<span className="relative flex h-11 items-center gap-1 rounded-full bg-white/20 px-4 text-[15px] font-semibold">{primaryLabel}<ChevronRight className="h-3.5 w-3.5" strokeWidth={3} /></span>
					</motion.button>
				) : null}
			</AnimatePresence>
			<nav aria-label="Navigasi pesanan" className="flex h-16 items-stretch rounded-[32px] bg-white/70 p-1.5 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.9),0_8px_24px_rgba(15,35,71,0.12)] backdrop-blur-2xl">
				<Tab label="Menu" icon="customer-nav-home" onClick={onMenu} active />
				<Tab label="Riwayat" icon="navigation-history" onClick={onHistory} />
				<Tab label="Keranjang" icon="customer-nav-order" onClick={onCart} badge={totalItems || undefined} targetId={CART_FLY_TARGET_ID} />
				<Tab label="Staff" icon="customer-notifications-alerts" onClick={onStaff} />
			</nav>
		</div>
	);
}
