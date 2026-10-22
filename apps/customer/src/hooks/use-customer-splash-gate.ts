import { useCallback, useEffect, useRef, useState } from "react";

export type CustomerSplashGateOptions = {
	/** Data/keadaan yang harus siap sebelum splash boleh ditutup. */
	ready: boolean;
	/**
	 * Sinyal untuk memulai animasi resolve (logo terisi). Default mengikuti `ready`.
	 * Pakai ini bila data lebih cepat dari auth: animasi jalan lebih awal sehingga
	 * splash tidak menambah waktu tunggu.
	 */
	resolveWhen?: boolean;
	/** Izinkan masuk aplikasi walau data belum siap (setelah koneksi lambat). */
	allowDegrade?: boolean;
	/** Durasi minimum splash terlihat — brand moment pada kunjungan pertama. */
	minVisibleMs?: number;
	/** Setelah ini muncul pesan "masih memuat". */
	slowAfterMs?: number;
	/** Setelah ini muncul kartu aksi (coba lagi / lanjut saja). */
	stalledAfterMs?: number;
	/** Auto masuk mode degradasi setelah ini bila data tetap belum siap. */
	autoActionAfterMs?: number;
};

export type CustomerSplashGateSplashProps = {
	loading: boolean;
	isComplete: boolean;
	onDone: () => void;
	statusMessage?: string;
	offline: boolean;
	stalled: boolean;
	onRetry: () => void;
	secondaryLabel?: string;
	onSecondary?: () => void;
};

export type CustomerSplashGateResult = {
	visible: boolean;
	degraded: boolean;
	splashProps: CustomerSplashGateSplashProps;
};

/** Fallback bila loader tidak memanggil onDone (durasi resolve loader ~1.1s). */
const resolveFallbackMs = 1100;
const isOffline = () =>
	typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Siklus hidup splash: menahan splash selama data belum siap, menjalankan animasi
 * resolve ke logo terisi begitu data siap, memberi kabar saat koneksi lambat/offline,
 * dan menjamin splash tidak pernah menggantung tanpa jalan keluar.
 */
export function useCustomerSplashGate({
	ready,
	resolveWhen,
	allowDegrade = true,
	minVisibleMs = 400,
	slowAfterMs = 2500,
	stalledAfterMs = 8000,
	autoActionAfterMs,
}: CustomerSplashGateOptions): CustomerSplashGateResult {
	const [visible, setVisible] = useState(true);
	const [degraded, setDegraded] = useState(false);
	const [isComplete, setIsComplete] = useState(false);
	const [resolved, setResolved] = useState(false);
	const [offline, setOffline] = useState(isOffline);
	const [elapsed, setElapsed] = useState(0);
	const [startedAt] = useState(() => Date.now());
	const mounted = useRef(false);
	const finished = useRef(false);
	const completing = useRef(false);

	useEffect(() => {
		mounted.current = true;
		const updateOnline = () => setOffline(isOffline());
		updateOnline();
		window.addEventListener("online", updateOnline);
		window.addEventListener("offline", updateOnline);
		return () => {
			mounted.current = false;
			window.removeEventListener("online", updateOnline);
			window.removeEventListener("offline", updateOnline);
		};
	}, []);

	useEffect(() => {
		if (!visible) return;
		const interval = window.setInterval(() => {
			if (mounted.current) setElapsed(Date.now() - startedAt);
		}, 200);
		return () => window.clearInterval(interval);
	}, [visible, startedAt]);

	/** Mulai animasi resolve segera setelah data siap, tanpa menunggu brand moment. */
	useEffect(() => {
		if (!visible || isComplete || !(resolveWhen ?? ready)) return;
		completing.current = true;
		setIsComplete(true);
	}, [visible, isComplete, ready, resolveWhen]);

	/** onDone dari loader boleh datang lebih dari sekali; yang pertama menang. */
	const onDone = useCallback(() => {
		if (!mounted.current || finished.current || !completing.current) return;
		setResolved(true);
	}, []);

	/** Cadangan bila loader tidak memanggil onDone. */
	useEffect(() => {
		if (!visible || !isComplete || resolved) return;
		const timer = window.setTimeout(() => setResolved(true), resolveFallbackMs);
		return () => window.clearTimeout(timer);
	}, [visible, isComplete, resolved]);

	/** Tutup splash hanya setelah animasi resolve selesai DAN brand moment terlewati. */
	useEffect(() => {
		if (!visible || !resolved || elapsed < minVisibleMs) return;
		finished.current = true;
		setVisible(false);
	}, [visible, resolved, elapsed, minVisibleMs]);

	const onSecondary = useCallback(() => {
		if (!mounted.current || finished.current || !allowDegrade) return;
		finished.current = true;
		setDegraded(true);
		setVisible(false);
	}, [allowDegrade]);

	const autoAfterMs = autoActionAfterMs ?? (offline ? 5000 : 14000);
	useEffect(() => {
		if (visible && !ready && allowDegrade && elapsed >= autoAfterMs)
			onSecondary();
	}, [visible, ready, allowDegrade, elapsed, autoAfterMs, onSecondary]);

	const onRetry = useCallback(() => window.location.reload(), []);
	const stalled = visible && !ready && elapsed >= stalledAfterMs;
	// Pesan progres hanya selama data benar-benar belum siap; saat animasi resolve
	// berjalan splash tidak boleh terkesan masih menunggu.
	const statusMessage = offline
		? "Kamu sedang offline — menunggu koneksi"
		: stalled
			? "Koneksi lambat, data menu belum selesai dimuat."
			: !ready && elapsed >= slowAfterMs
				? "Masih memuat data menu…"
				: undefined;

	return {
		visible,
		degraded,
		splashProps: {
			loading: !isComplete,
			isComplete,
			onDone,
			statusMessage,
			offline,
			stalled,
			onRetry,
			secondaryLabel: allowDegrade ? "Lanjut saja" : undefined,
			onSecondary: allowDegrade ? onSecondary : undefined,
		},
	};
}
