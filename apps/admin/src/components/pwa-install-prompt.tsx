import { Download, Plus, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const DISMISSED_UNTIL_KEY = "__pwa_install_prompt_dismissed_until__";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

type InstallPlatform = "android" | "ios";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneMode() {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

function isIosDevice() {
	if (typeof navigator === "undefined") return false;
	return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isDismissed() {
	if (typeof window === "undefined") return true;
	const dismissedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) || 0);
	return dismissedUntil > Date.now();
}

export function PwaInstallPrompt() {
	const [platform, setPlatform] = useState<InstallPlatform | null>(null);
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [isInstalling, setIsInstalling] = useState(false);

	useEffect(() => {
		if (isStandaloneMode() || isDismissed()) return;

		const handleBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setDeferredPrompt(event as BeforeInstallPromptEvent);
			setPlatform("android");
		};

		const handleAppInstalled = () => {
			setPlatform(null);
			setDeferredPrompt(null);
			window.localStorage.removeItem(DISMISSED_UNTIL_KEY);
		};

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);

		if (isIosDevice()) {
			const timer = window.setTimeout(() => setPlatform("ios"), 1200);
			return () => {
				window.clearTimeout(timer);
				window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
				window.removeEventListener("appinstalled", handleAppInstalled);
			};
		}

		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	if (!platform) return null;

	const dismiss = () => {
		window.localStorage.setItem(
			DISMISSED_UNTIL_KEY,
			String(Date.now() + DISMISS_FOR_MS),
		);
		setPlatform(null);
	};

	const installAndroid = async () => {
		if (!deferredPrompt || isInstalling) return;
		setIsInstalling(true);
		try {
			await deferredPrompt.prompt();
			await deferredPrompt.userChoice;
			setPlatform(null);
			setDeferredPrompt(null);
		} finally {
			setIsInstalling(false);
		}
	};

	return (
		<div
			className="fixed inset-x-3 z-[70] mx-auto max-w-md rounded-[22px] border border-border/70 bg-background/95 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:right-5"
			style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
			role="dialog"
			aria-label="Pasang aplikasi Djiwa Tentram Admin"
			aria-live="polite"
		>
			<button
				type="button"
				className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				onClick={dismiss}
				aria-label="Tutup saran pemasangan aplikasi"
			>
				<X className="h-4 w-4" aria-hidden="true" />
			</button>

			<div className="flex items-start gap-3 pr-8">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
					<Smartphone className="h-5 w-5" aria-hidden="true" />
				</div>
				<div className="min-w-0">
					<p className="text-sm font-semibold tracking-tight">Pasang Djiwa Tentram Admin</p>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
						Akses lebih cepat seperti aplikasi dan tetap nyaman di layar penuh.
					</p>
				</div>
			</div>

			{platform === "android" ? (
				<button
					type="button"
					className={cn(
						"mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
						isInstalling && "cursor-wait opacity-70",
					)}
					onClick={() => void installAndroid()}
					disabled={isInstalling}
				>
					<Download className="h-4 w-4" aria-hidden="true" />
					{isInstalling ? "Menyiapkan aplikasi..." : "Pasang aplikasi"}
				</button>
			) : (
				<div className="mt-3 rounded-2xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
					<p className="font-semibold text-foreground">Cara pasang di iPhone/iPad</p>
					<ol className="mt-2 space-y-2">
						<li className="flex items-start gap-2"><Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Tekan tombol <strong>Share</strong> di Safari.</span></li>
						<li className="flex items-start gap-2"><Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Pilih <strong>Add to Home Screen</strong>.</span></li>
					</ol>
				</div>
			)}
		</div>
	);
}
