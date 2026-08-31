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
const RELEASE_COMMIT = "7feae747";
const RELEASE_MESSAGE = "fix(customer): preserve username on Mayar receipt redirect";

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

	// Reset progress & state when dialog closes (user clicked "Nanti saja" or dismissed)
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
				const simulated = Math.min(
					90,
					elapsed < 800
						? (elapsed / 800) * 20
						: 20 + ((elapsed - 800) / 4000) * 70,
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
			window.clearInterval(progressInterval);
			window.clearTimeout(fallbackTimer);
			setIsUpdating(false);
			isUpdatingRef.current = false;
			setProgress(0);
			setOpen(false);
		} catch {
			window.clearTimeout(fallbackTimer);
			setIsUpdating(false);
			isUpdatingRef.current = false;
			setProgress(0);
			window.clearInterval(progressInterval);
		}
	};

	const progressText = getProgressText(progress);

	return (
		<Dialog open={open}>
			<DialogContent
				className="max-w-[calc(100%-2rem)] overflow-hidden rounded-[28px] border-0 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:max-w-md"
				showCloseButton={!isUpdating}
			>
				<div className="bg-card p-6 sm:p-7">
					<div className="mb-5 flex items-start justify-between gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
							{isUpdating ? (
								<RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
							) : (
								<Sparkles className="h-5 w-5" aria-hidden="true" />
							)}
						</div>
						{!isUpdating && (
							<span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
								Pembaruan tersedia
							</span>
						)}
					</div>

					<DialogHeader className="space-y-2 text-left">
						<DialogTitle className="text-xl font-bold tracking-tight">
							{isUpdating ? "Sedang memperbarui..." : "Aplikasi siap diperbarui"}
						</DialogTitle>
						<DialogDescription className="text-sm leading-relaxed text-muted-foreground">
							{isUpdating
								? "Mohon tunggu sebentar. Kami sedang menyiapkan pengalaman terbaru untuk Anda."
								: "Versi terbaru sudah tersedia. Perbarui sekarang agar aplikasi tetap aman, cepat, dan mendapatkan perbaikan terbaru."}
						</DialogDescription>
					</DialogHeader>

					<div className="mt-5 rounded-2xl border border-border/70 bg-background/70 p-4" aria-label="Detail pembaruan">
						<div className="space-y-3 text-sm">
							<div className="flex items-start justify-between gap-4">
								<span className="text-muted-foreground">Versi app :</span>
								<span className="font-semibold tabular-nums text-foreground">{updateInfo.latestVersion || "0.2.510"}</span>
							</div>
							<div className="flex items-start justify-between gap-4">
								<span className="text-muted-foreground">Commit :</span>
								<span className="font-mono text-xs font-semibold text-foreground">{RELEASE_COMMIT}</span>
							</div>
							<div className="flex items-start justify-between gap-4">
								<span className="text-muted-foreground">Message:</span>
								<span className="max-w-[15rem] text-right font-medium leading-relaxed text-foreground">{RELEASE_MESSAGE}</span>
							</div>
						</div>
					</div>

					{isUpdating && (
						<div className="mt-5 space-y-3" aria-live="polite" aria-label="Proses pembaruan">
							<div className="flex items-center justify-between gap-3 text-xs">
								<span className="text-muted-foreground">{progressText}</span>
								<span className="font-mono font-semibold tabular-nums text-foreground">{progress}%</span>
							</div>
							<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					)}

					{!isUpdating && (
						<>
							<DialogFooter className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
								<Button type="button" variant="outline" className="h-11 rounded-xl" onClick={handleLater}>
									Nanti saja
								</Button>
								<Button type="button" className="h-11 rounded-xl shadow-sm" onClick={handleUpdateNow}>
									<RefreshCw className="h-4 w-4" aria-hidden="true" />
									Update sekarang
								</Button>
							</DialogFooter>
							<p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
								Anda bisa melanjutkan aktivitas dan memperbarui nanti. Pengingat muncul lagi setiap 15 menit.
							</p>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
