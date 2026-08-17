import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Download, Plus, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "ordermieyamin:pwa-install-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isIos() {
	return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
		(window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isStandalone() {
	return window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function wasDismissedRecently() {
	const value = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
	return Number.isFinite(value) && Date.now() - value < DISMISS_FOR_MS;
}

export function PwaInstallPrompt() {
	const reduceMotion = useReducedMotion();
	const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
	const [open, setOpen] = useState(false);
	const [showIosSteps, setShowIosSteps] = useState(false);
	const [ios, setIos] = useState(false);

	useEffect(() => {
		if (isStandalone() || wasDismissedRecently()) return;
		const iosDevice = isIos();
		setIos(iosDevice);
		const timer = window.setTimeout(() => {
			if (iosDevice) setOpen(true);
		}, 1200);
		const onBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setInstallEvent(event as BeforeInstallPromptEvent);
			setOpen(true);
		};
		window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
		};
	}, []);

	const dismiss = () => {
		window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
		setOpen(false);
		setShowIosSteps(false);
	};

	const install = async () => {
		if (!installEvent) {
			setShowIosSteps(true);
			return;
		}
		await installEvent.prompt();
		const choice = await installEvent.userChoice;
		if (choice.outcome === "accepted") setOpen(false);
		setInstallEvent(null);
	};

	if (!open) return null;

	return (
		<motion.aside
			initial={reduceMotion ? false : { opacity: 0, y: 28 }}
			animate={{ opacity: 1, y: 0 }}
			exit={reduceMotion ? undefined : { opacity: 0, y: 28 }}
			transition={{ type: "spring" as const, stiffness: 320, damping: 28 }}
			className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md rounded-3xl border border-primary/15 bg-card p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
			role="dialog"
			aria-label="Tambahkan Order Mie Yamin ke layar utama"
		>
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
					<Smartphone className="h-5 w-5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1 pr-5">
					<p className="text-sm font-black text-foreground">Simpan di layar utama</p>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
						Buka tracking pesanan lebih cepat seperti aplikasi tanpa mencari link lagi.
					</p>
				</div>
				<button type="button" onClick={dismiss} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Tutup informasi install">
					<X className="h-4 w-4" />
				</button>
			</div>

			{ios && showIosSteps ? (
				<div className="mt-3 rounded-2xl bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
					<p className="font-black text-primary">Cara di iPhone</p>
					<ol className="mt-2 space-y-2 text-muted-foreground">
						<li><b className="text-foreground">1.</b> Tekan tombol <Share className="mx-1 inline h-3.5 w-3.5 text-primary" /> <b className="text-foreground">Bagikan</b> di Safari.</li>
						<li><b className="text-foreground">2.</b> Pilih <b className="text-foreground">Tambahkan ke Layar Utama</b>.</li>
						<li><b className="text-foreground">3.</b> Tekan <b className="text-foreground">Tambah</b>.</li>
					</ol>
					<button type="button" onClick={dismiss} className="mt-3 h-10 w-full rounded-xl bg-primary text-xs font-black text-primary-foreground">Mengerti</button>
				</div>
			) : (
				<div className="mt-3 flex items-center gap-2">
					<button type="button" onClick={install} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground shadow-sm active:scale-[.98]">
						{installEvent ? <Download className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
						{installEvent ? "Tambahkan sekarang" : "Lihat caranya"}
					</button>
					<button type="button" onClick={dismiss} className="h-11 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted">Nanti</button>
					{ios ? <ChevronDown className="mr-1 h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
				</div>
			)}
		</motion.aside>
	);
}
