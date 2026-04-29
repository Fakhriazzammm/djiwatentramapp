import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

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

function getNextReminderAt() {
	const value = window.localStorage.getItem(NEXT_REMINDER_KEY);
	const parsed = value ? Number.parseInt(value, 10) : 0;
	return Number.isFinite(parsed) ? parsed : 0;
}

export function AppUpdatePrompt() {
	const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(() => {
		if (typeof window === "undefined") return null;
		return getLatestUpdateInfo();
	});
	const [open, setOpen] = useState(false);
	const [isUpdating, setIsUpdating] = useState(false);

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
		window.localStorage.removeItem(NEXT_REMINDER_KEY);
		setIsUpdating(true);
		await applyAppUpdate();
	};

	return (
		<Dialog open={open}>
			<DialogContent className="max-w-sm overflow-hidden p-0" showCloseButton={false}>
				<div className="bg-gradient-to-br from-primary/15 via-background to-background p-6">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
						<Sparkles className="h-5 w-5" />
					</div>

					<DialogHeader>
						<DialogTitle className="text-base font-bold">Update aplikasi tersedia</DialogTitle>
						<DialogDescription className="text-sm/relaxed">
							Ada versi baru Djiwa Tentram POS. Klik <strong>Update Sekarang</strong> agar
							 aplikasi melakukan hard refresh otomatis dan memakai bundle terbaru.
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
					</div>

					<DialogFooter className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
						<Button type="button" variant="outline" onClick={handleLater} disabled={isUpdating}>
							Nanti Saja
						</Button>
						<Button type="button" onClick={handleUpdateNow} loading={isUpdating} loadingText="Update...">
							<RefreshCw className="h-4 w-4" />
							Update Sekarang
						</Button>
					</DialogFooter>

					<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
						Jika memilih Nanti Saja, pengingat akan muncul lagi setiap 15 menit di halaman manapun.
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}
