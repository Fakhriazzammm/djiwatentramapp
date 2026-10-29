import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const SLOW_AFTER_MS = 2500;
const STALLED_AFTER_MS = 8000;

export type AdminSplashStatusInput = {
	offline: boolean;
	stalled: boolean;
};

export function getAdminSplashStatus({ offline, stalled }: AdminSplashStatusInput): string {
	if (offline) return "Kamu sedang offline — menunggu koneksi";
	if (stalled) return "Koneksi lambat, ruang kerja belum selesai dimuat.";
	return "Menyiapkan ruang kerja Djiwa Tentram";
}

type AdminSplashProps = {
	onRetry?: () => void;
};

export function AdminSplash({ onRetry = () => window.location.reload() }: AdminSplashProps) {
	const reduceMotion = useReducedMotion();
	const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const startedAt = Date.now();
		const updateElapsed = () => setElapsed(Date.now() - startedAt);
		const updateOnline = () => setOffline(navigator.onLine === false);
		const timer = window.setInterval(updateElapsed, 200);
		window.addEventListener("online", updateOnline);
		window.addEventListener("offline", updateOnline);
		updateOnline();
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("online", updateOnline);
			window.removeEventListener("offline", updateOnline);
		};
	}, []);

	const stalled = elapsed >= STALLED_AFTER_MS;
	const showRetry = !offline && elapsed >= SLOW_AFTER_MS;
	const status = getAdminSplashStatus({ offline, stalled });

	return (
		<div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4 py-8 text-white">
			<motion.section
				aria-label="Membuka ruang kerja Djiwa Tentram"
				aria-busy="true"
				className="flex min-h-[min(720px,calc(100dvh-4rem))] w-full max-w-md flex-col items-center justify-center rounded-[32px] bg-[#111214] px-8 text-center shadow-2xl shadow-black/30"
				initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
			>
				<div className="relative flex h-24 w-24 items-center justify-center text-primary" role="status" aria-label="Memuat Djiwa Tentram">
					<div className="absolute inset-0 rounded-full border-[3px] border-primary/20" />
					<div className={`absolute inset-0 rounded-full border-[3px] border-primary border-r-transparent ${reduceMotion ? "" : "animate-spin"}`} />
					<img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-16 w-16 rounded-2xl object-contain" />
				</div>
				<p className="mt-6 text-[11px] font-black uppercase tracking-[0.24em] text-primary">Djiwa Tentram</p>
				<p aria-live="polite" className="mt-2 text-[13px] leading-relaxed text-white/75">{status}</p>
				{showRetry || stalled ? (
					<button type="button" onClick={onRetry} className="mt-6 min-h-11 rounded-[14px] border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10">
						Coba lagi
					</button>
				) : null}
			</motion.section>
		</div>
	);
}
