import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	APP_UPDATE_EVENT,
	applyAppUpdate,
	getLatestUpdateInfo,
	type AppUpdateInfo,
} from "@/lib/app-update";

const REMIND_AFTER_MS = 15 * 60 * 1000;
const NEXT_REMINDER_KEY = "__app_update_next_reminder_at__";

const PROGRESS_MESSAGES: { threshold: number; text: string }[] = [
	{ threshold: 0, text: "Menghubungi server..." },
	{ threshold: 25, text: "Mengunduh versi terbaru..." },
	{ threshold: 55, text: "Memasang pembaruan..." },
	{ threshold: 85, text: "Me-refresh halaman..." },
];

function getNextReminderAt() {
	const value = window.localStorage.getItem(NEXT_REMINDER_KEY);
	const parsed = value ? Number.parseInt(value, 10) : 0;
	return Number.isFinite(parsed) ? parsed : 0;
}

function getProgressText(percent: number): string {
	for (let i = PROGRESS_MESSAGES.length - 1; i >= 0; i--) {
		if (percent >= PROGRESS_MESSAGES[i].threshold) {
			return PROGRESS_MESSAGES[i].text;
		}
	}
	return PROGRESS_MESSAGES[0].text;
}

export function AppUpdatePrompt() {
	const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(() => {
		if (typeof window === "undefined") return null;
		return getLatestUpdateInfo();
	});
	const [open, setOpen] = useState(false);
	const [isUpdating, setIsUpdating] = useState(false);
	const [progress, setProgress] = useState(0);
	const isUpdatingRef = useRef(false);

	useEffect(() => {
		if (typeof window === "undefined") return;

		let reminderTimer: number | undefined;

		const clearReminderTimer = () => {
			if (reminderTimer) {
				window.clearTimeout(reminderTimer);
				reminderTimer = undefined;
			}
		};

		const showOrScheduleReminder = (info: AppUpdateInfo) => {
			clearReminderTimer();
			setUpdateInfo(info);

			const now = Date.now();
			const nextReminderAt = getNextReminderAt();

			if (!nextReminderAt || nextReminderAt <= now) {
				setOpen(true);
				return;
			}

			reminderTimer = window.setTimeout(() => {
				setOpen(true);
			}, nextReminderAt - now);
		};

		const onUpdateAvailable = (event: Event) => {
			showOrScheduleReminder((event as CustomEvent<AppUpdateInfo>).detail);
		};

		window.addEventListener(APP_UPDATE_EVENT, onUpdateAvailable);

		const existingInfo = getLatestUpdateInfo();
		if (existingInfo) {
			showOrScheduleReminder(existingInfo);
		}

		return () => {
			clearReminderTimer();
			window.removeEventListener(APP_UPDATE_EVENT, onUpdateAvailable);
		};
	}, []);

	// Reset progress & state when dialog closes (user clicked "Nanti Saja" or dismissed)
	useEffect(() => {
		if (!open) {
			setProgress(0);
			setIsUpdating(false);
			isUpdatingRef.current = false;
		}
	}, [open]);

	if (!updateInfo) return null;

	const handleLater = () => {
		const nextReminderAt = Date.now() + REMIND_AFTER_MS;
		window.localStorage.setItem(NEXT_REMINDER_KEY, String(nextReminderAt));
		setOpen(false);

		window.setTimeout(() => {
			setOpen(true);
		}, REMIND_AFTER_MS);
	};

	const handleUpdateNow = async () => {
		if (isUpdatingRef.current) return;
		isUpdatingRef.current = true;
		setIsUpdating(true);
		setProgress(0);

		// Simulated progress animation (applyAppUpdate is fast but we want perceived feedback)
		const startTime = Date.now();
		const progressInterval = window.setInterval(() => {
			setProgress((prev) => {
				const elapsed = Date.now() - startTime;
				// Quick ramp up to 20%, then slow down, max 90% (last 10% on actual reload)
				const simulated = Math.min(
					90,
					elapsed < 800
						? (elapsed / 800) * 20 // 0-800ms: 0-20%
						: 20 + ((elapsed - 800) / 4000) * 70, // 800-4800ms: 20-90%
				);
				return Math.round(simulated);
			});
		}, 150);

		// Safety fallback: force reload if applyAppUpdate hangs
		const fallbackTimer = window.setTimeout(() => {
			window.clearInterval(progressInterval);
			window.location.reload();
		}, 10_000);

		try {
			window.localStorage.removeItem(NEXT_REMINDER_KEY);
			await applyAppUpdate();
			// applyAppUpdate() resolved tanpa reload → versi sama / update palsu.
			// Cukup close dialog, jangan force reload.
			window.clearInterval(progressInterval);
			window.clearTimeout(fallbackTimer);
			setIsUpdating(false);
			isUpdatingRef.current = false;
			setProgress(0);
			setOpen(false);
		} catch {
			window.clearTimeout(fallbackTimer);
			// If update fails, reset so user can retry
			setIsUpdating(false);
			isUpdatingRef.current = false;
			setProgress(0);
			window.clearInterval(progressInterval);
		}
	};

	const progressText = getProgressText(progress);

	return (
		<Dialog open={open}>
			<DialogContent className="max-w-sm overflow-hidden p-0" showCloseButton={!isUpdating}>
				<div className="bg-card p-6">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
						{isUpdating ? (
							<RefreshCw className="h-5 w-5 animate-spin" />
						) : (
							<Sparkles className="h-5 w-5" />
						)}
					</div>

					<DialogHeader>
						<DialogTitle className="text-base font-bold">
							{isUpdating ? "Sedang memperbarui..." : "Update aplikasi tersedia"}
						</DialogTitle>
						<DialogDescription className="text-sm/relaxed">
							{isUpdating
								? "Mohon tunggu sebentar, aplikasi sedang diperbarui ke versi terbaru."
								: (
									<>
										Ada versi baru Djiwa Tentram Centrik POS. Klik <strong>Update Sekarang</strong> agar
										aplikasi melakukan hard refresh otomatis dan memakai bundle terbaru.
									</>
								)}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-4 rounded-xl border bg-background/80 p-3 text-xs text-muted-foreground">
						<div className="flex justify-between gap-3">
							<span>Versi saat ini</span>
							<span className="font-semibold text-foreground">{updateInfo.currentVersion}</span>
						</div>
						<div className="mt-1 flex justify-between gap-3">
							<span>Versi terbaru</span>
							<span className="font-semibold text-foreground">{updateInfo.latestVersion}</span>
						</div>
						<div className="mt-1 flex justify-between gap-3">
							<span>Tanggal build</span>
							<span className="font-semibold text-foreground">{updateInfo.buildDate || "-"}</span>
						</div>
					</div>

					{/* Progress section — shown during update */}
					{isUpdating && (
						<div className="mt-4 space-y-2">
							<div className="flex items-center justify-between text-[11px] text-muted-foreground">
								<span>{progressText}</span>
								<span className="font-mono font-semibold tabular-nums text-foreground">
									{progress}%
								</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
								<div
									className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					)}

					{!isUpdating && (
						<>
							<DialogFooter className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
								<Button type="button" variant="outline" onClick={handleLater}>
									Nanti Saja
								</Button>
								<Button type="button" onClick={handleUpdateNow}>
									<RefreshCw className="h-4 w-4" />
									Update Sekarang
								</Button>
							</DialogFooter>

							<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
								Jika memilih Nanti Saja, pengingat akan muncul lagi setiap 15 menit di halaman manapun.
							</p>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
