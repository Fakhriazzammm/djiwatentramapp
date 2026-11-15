import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bike, ChevronDown, MapPinned, Phone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EASE, SPRING, tap } from "./step-parts";

/** Tahapan yang dilihat customer. Status mentah Biteship dipetakan ke sini. */
export const LIVE_STEPS = [
	{ key: "received", label: "Diterima" },
	{ key: "preparing", label: "Disiapkan" },
	{ key: "courier", label: "Kurir ditemukan" },
	{ key: "picked", label: "Diambil" },
	{ key: "ontheway", label: "Dalam perjalanan" },
	{ key: "delivered", label: "Terkirim" },
] as const;

export type LiveTone = "normal" | "searching" | "warn" | "bad" | "done";
export type LiveState = { index: number; headline: string; detail: string; tone: LiveTone; live: boolean };

type OrderLike = Record<string, any>;
const pick = (order: OrderLike, camel: string, snake: string) => order?.[camel] ?? order?.[snake] ?? null;

/** Gabungkan delivery_status internal dengan status kurir mentah Biteship menjadi satu keadaan tampilan. */
export function resolveLiveState(order: OrderLike): LiveState {
	const internal = String(pick(order, "deliveryStatus", "delivery_status") ?? "").toLowerCase();
	const raw = String(pick(order, "deliveryCourierStatus", "delivery_courier_status") ?? "").toLowerCase();
	const driver = pick(order, "deliveryDriverName", "delivery_driver_name");
	const who = driver ? String(driver) : "Kurir";
	if (internal === "delivered" || raw === "delivered") return { index: 5, headline: "Pesanan terkirim", detail: "Selamat menikmati! Terima kasih sudah memesan.", tone: "done", live: false };
	if (internal === "cancelled" || raw === "cancelled") return { index: 0, headline: "Pengantaran dibatalkan", detail: "Hubungi kafe bila kamu merasa ini keliru.", tone: "bad", live: false };
	if (raw === "courier_not_found") return { index: 1, headline: "Belum ada kurir yang tersedia", detail: "Kami sedang mencarikan kurir lain untuk pesananmu.", tone: "warn", live: true };
	if (raw === "on_hold") return { index: 3, headline: "Pengantaran ditahan sementara", detail: "Ada kendala di jalan. Kurir akan melanjutkan setelah kendala selesai.", tone: "warn", live: true };
	if (["rejected", "returned", "return_in_transit", "disposed"].includes(raw) || internal === "failed") return { index: 3, headline: "Ada kendala pada pengantaran", detail: "Pesananmu tetap tercatat. Hubungi kafe agar kami bantu mengatur ulang.", tone: "bad", live: false };
	if (["dropping_off", "in_transit"].includes(raw)) return { index: 4, headline: `${who} menuju lokasimu`, detail: "Siapkan diri, pesananmu segera tiba.", tone: "normal", live: true };
	if (raw === "picked") return { index: 3, headline: "Pesanan sudah diambil kurir", detail: `${who} membawa pesananmu.`, tone: "normal", live: true };
	if (raw === "picking_up") return { index: 2, headline: `${who} menuju kafe`, detail: "Kurir sedang dalam perjalanan mengambil pesananmu.", tone: "normal", live: true };
	if (raw === "allocated") return { index: 2, headline: `${who} ditemukan`, detail: "Kurir akan segera mengambil pesananmu.", tone: "normal", live: true };
	if (raw === "confirmed" || raw === "scheduled") return { index: 1, headline: "Mencari kurir terdekat", detail: "Pesananmu sudah dikonfirmasi ke kurir.", tone: "searching", live: true };
	if (internal === "out_for_delivery") return { index: 4, headline: "Pesanan dalam perjalanan", detail: "Kurir sedang mengantar pesananmu.", tone: "normal", live: true };
	if (internal === "ready_to_ship") return { index: 1, headline: "Pesanan siap dikirim", detail: "Menunggu kurir dipanggil.", tone: "searching", live: true };
	if (internal === "preparing" || internal === "packing") return { index: 1, headline: "Pesananmu sedang disiapkan", detail: "Tim dapur sedang menyiapkan pesananmu.", tone: "normal", live: true };
	return { index: 0, headline: "Pesanan diterima", detail: "Kami segera menyiapkan pesananmu.", tone: "normal", live: true };
}

const RAW_LABEL: Record<string, string> = {
	confirmed: "Pesanan dikonfirmasi ke kurir",
	scheduled: "Pengantaran dijadwalkan",
	allocated: "Kurir ditemukan",
	picking_up: "Kurir menuju kafe",
	picked: "Pesanan diambil kurir",
	in_transit: "Dalam perjalanan",
	dropping_off: "Kurir menuju lokasimu",
	delivered: "Pesanan terkirim",
	cancelled: "Dibatalkan",
	on_hold: "Ditahan sementara",
	courier_not_found: "Kurir belum ditemukan",
	rejected: "Ditolak",
	returned: "Dikembalikan",
};

function relativeTime(ms: number | null, now: number) {
	if (!ms) return null;
	const seconds = Math.max(0, Math.round((now - ms) / 1000));
	if (seconds < 10) return "baru saja";
	if (seconds < 60) return `${seconds} detik lalu`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} menit lalu`;
	return new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const toneClass: Record<LiveTone, string> = {
	normal: "text-primary",
	searching: "text-amber-600",
	warn: "text-amber-600",
	bad: "text-red-600",
	done: "text-emerald-600",
};

/** Pelacakan pengantaran langsung: progres bergerak, kartu driver, notifikasi tiap tahap, dan riwayat. */
export function DeliveryLiveTracker({ order, courierLabel }: { order: OrderLike; courierLabel: string }) {
	const reduce = useReducedMotion();
	const state = useMemo(() => resolveLiveState(order), [order]);
	const updatedAt = Number(pick(order, "deliveryStatusUpdatedAt", "delivery_status_updated_at")) || null;
	const driverName = pick(order, "deliveryDriverName", "delivery_driver_name") as string | null;
	const driverPhone = pick(order, "deliveryDriverPhone", "delivery_driver_phone") as string | null;
	const driverPlate = pick(order, "deliveryDriverPlate", "delivery_driver_plate") as string | null;
	const driverPhoto = pick(order, "deliveryDriverPhotoUrl", "delivery_driver_photo_url") as string | null;
	const trackLink = pick(order, "deliveryTrackingLink", "delivery_tracking_link") as string | null;
	const waybill = (pick(order, "deliveryWaybillId", "delivery_waybill_id") ?? pick(order, "deliveryTrackingId", "delivery_tracking_id")) as string | null;
	const history = (pick(order, "deliveryStatusHistory", "delivery_status_history") ?? []) as Array<{ status: string; at: number }>;
	const [now, setNow] = useState(() => Date.now());
	const [showHistory, setShowHistory] = useState(false);
	const previous = useRef<{ index: number; headline: string } | null>(null);

	useEffect(() => {
		if (!state.live) return;
		const timer = window.setInterval(() => setNow(Date.now()), 15_000);
		return () => window.clearInterval(timer);
	}, [state.live]);

	// Beri tahu customer tiap tahap berganti (bukan saat pertama kali tampil).
	useEffect(() => {
		const before = previous.current;
		previous.current = { index: state.index, headline: state.headline };
		if (!before || before.headline === state.headline) return;
		tap(18);
		if (state.tone === "bad" || state.tone === "warn") toast.warning(state.headline, { description: state.detail });
		else toast.success(state.headline, { description: state.detail });
	}, [state.headline, state.index, state.tone, state.detail]);

	const progress = state.tone === "bad" ? Math.max(0.04, state.index / (LIVE_STEPS.length - 1)) : state.index / (LIVE_STEPS.length - 1);
	const updatedText = relativeTime(updatedAt, now);

	return (
		<section aria-label="Pelacakan pengantaran" className="mx-auto w-full max-w-sm rounded-[26px] bg-white p-4 shadow-[0_10px_30px_rgba(15,35,71,0.08)]">
			<div className="flex items-center justify-between gap-2">
				<span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
					{state.live ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span> : <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
					{state.live ? "Live" : "Selesai"} · {courierLabel}
				</span>
				{updatedText ? <span className="text-[11px] text-muted-foreground">Diperbarui {updatedText}</span> : null}
			</div>

			<div className="mt-3 min-h-[58px]" aria-live="polite">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div key={state.headline} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE }}>
						<p className={cn("font-display text-[21px] font-extrabold leading-tight tracking-[-0.02em]", toneClass[state.tone])}>{state.headline}</p>
						<p className="mt-0.5 text-[13px] text-muted-foreground">{state.detail}</p>
					</motion.div>
				</AnimatePresence>
			</div>

			<div className="relative mt-5 px-2">
				<div className="absolute left-2 right-2 top-[11px] h-[3px] rounded-full bg-black/10" />
				<motion.div className={cn("absolute left-2 top-[11px] h-[3px] rounded-full", state.tone === "bad" ? "bg-red-500" : state.tone === "warn" ? "bg-amber-500" : "bg-primary")} initial={false} animate={{ width: `calc((100% - 16px) * ${progress})` }} transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }} />
				<motion.div className="absolute top-[-6px] z-10 -ml-4" initial={false} animate={{ left: `calc(8px + (100% - 16px) * ${progress})` }} transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }}>
					<motion.span animate={reduce || !state.live ? undefined : { y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} className={cn("flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg", state.tone === "done" ? "bg-emerald-500" : state.tone === "bad" ? "bg-red-500" : "bg-primary")}><Bike className="h-4 w-4" /></motion.span>
				</motion.div>
				<ol className="relative flex justify-between">
					{LIVE_STEPS.map((step, index) => {
						const reached = index <= state.index && state.tone !== "bad" || index < state.index;
						return (
							<li key={step.key} className="flex w-0 flex-col items-center">
								<motion.span initial={false} animate={{ scale: index === state.index ? 1.25 : 1, backgroundColor: reached ? "var(--primary)" : "#d9dbe3" }} transition={SPRING} className="z-0 h-[11px] w-[11px] rounded-full ring-[3px] ring-white" />
								<span className={cn("mt-3 w-16 text-center text-[9.5px] font-semibold leading-tight", index === state.index ? "text-foreground" : "text-muted-foreground/70")}>{step.label}</span>
							</li>
						);
					})}
				</ol>
			</div>

			<AnimatePresence initial={false}>
				{driverName ? (
					<motion.div key="driver" initial={reduce ? false : { opacity: 0, height: 0, y: 10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
						<div className="mt-4 flex items-center gap-3 rounded-[20px] bg-[#f2f2f7] p-3">
							{driverPhoto ? <img src={driverPhoto} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-lg font-extrabold text-primary">{driverName.slice(0, 1).toUpperCase()}</span>}
							<div className="min-w-0 flex-1">
								<p className="truncate text-[15px] font-bold">{driverName}</p>
								<p className="text-[12px] text-muted-foreground">{courierLabel}{driverPlate ? <> · <span className="rounded-md bg-white px-1.5 py-0.5 font-mono font-semibold text-foreground">{driverPlate}</span></> : null}</p>
							</div>
							{driverPhone ? <a href={`tel:${driverPhone}`} aria-label={`Telepon ${driverName}`} onClick={() => tap()} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30"><Phone className="h-[18px] w-[18px]" /></a> : null}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>

			{trackLink && state.live ? <a href={trackLink} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary/10 text-[14px] font-bold text-primary"><MapPinned className="h-4 w-4" />Lacak kurir di peta</a> : null}
			{waybill ? <p className="mt-3 text-center text-[11px] text-muted-foreground">Resi <span className="font-mono font-semibold text-foreground">{waybill}</span></p> : null}

			{history.length > 0 ? (
				<div className="mt-2">
					<button type="button" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory} className="mx-auto flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">Riwayat status<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showHistory && "rotate-180")} /></button>
					<AnimatePresence initial={false}>
						{showHistory ? (
							<motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-1.5 overflow-hidden">
								{[...history].reverse().slice(0, 8).map((entry, index) => (
									<li key={`${entry.status}-${entry.at}`} className="flex items-center justify-between gap-3 text-[12px]"><span className={cn("flex items-center gap-2", index === 0 ? "font-semibold text-foreground" : "text-muted-foreground")}><span className={cn("h-1.5 w-1.5 rounded-full", index === 0 ? "bg-primary" : "bg-black/20")} />{RAW_LABEL[entry.status] ?? entry.status}</span><span className="tabular-nums text-muted-foreground">{new Date(entry.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></li>
								))}
							</motion.ul>
						) : null}
					</AnimatePresence>
				</div>
			) : null}
		</section>
	);
}
