import { Clock, Image, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface ScanHistoryEntry {
	id: string;
	thumbnail: string; // base64 data URL
	merchant: string;
	total: number;
	date: number; // timestamp
	category: string;
	transactionType: "expense" | "income" | "unknown";
	saved: boolean;
}

const STORAGE_KEY = "yumi_scan_history";
const MAX_ENTRIES = 20;

export function useScanHistory() {
	const [history, setHistory] = useState<ScanHistoryEntry[]>(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? (JSON.parse(raw) as ScanHistoryEntry[]) : [];
		} catch {
			return [];
		}
	});

	const persist = (entries: ScanHistoryEntry[]) => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
		} catch {
			// storage full — ignore
		}
	};

	const addEntry = (entry: Omit<ScanHistoryEntry, "id">): string => {
		const id = `scan-${Date.now()}`;
		setHistory((prev) => {
			const next = [
				{ ...entry, id },
				...prev,
			].slice(0, MAX_ENTRIES);
			persist(next);
			return next;
		});
		return id;
	};

	const markSaved = (id: string) => {
		setHistory((prev) => {
			const next = prev.map((e) => (e.id === id ? { ...e, saved: true } : e));
			persist(next);
			return next;
		});
	};

	const removeEntry = (id: string) => {
		setHistory((prev) => {
			const next = prev.filter((e) => e.id !== id);
			persist(next);
			return next;
		});
	};

	const clearAll = () => {
		setHistory([]);
		localStorage.removeItem(STORAGE_KEY);
	};

	return { history, addEntry, markSaved, removeEntry, clearAll };
}

interface Props {
	history: ScanHistoryEntry[];
	onRemove: (id: string) => void;
	onClearAll: () => void;
	onClose: () => void;
}

function formatAgo(ts: number) {
	const diff = Date.now() - ts;
	const m = Math.floor(diff / 60000);
	if (m < 1) return "Baru saja";
	if (m < 60) return `${m} menit lalu`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} jam lalu`;
	const d = Math.floor(h / 24);
	return `${d} hari lalu`;
}

export function ScanHistoryPanel({ history, onRemove, onClearAll, onClose }: Props) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
			<div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
			<div className="relative z-50 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<Clock className="h-4 w-4 text-primary" />
						<span className="font-bold text-sm">Riwayat Scan</span>
						{history.length > 0 && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
								{history.length}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						{history.length > 0 && (
							<button
								type="button"
								onClick={onClearAll}
								className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 transition-colors"
							>
								<Trash2 className="h-3 w-3" />
								Hapus semua
							</button>
						)}
						<button
							className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
							onClick={onClose}
							type="button"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				{/* List */}
				<div className="max-h-[65vh] overflow-y-auto">
					{history.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
							<Image className="h-10 w-10 mb-3 opacity-20" />
							<p className="text-sm">Belum ada riwayat scan</p>
							<p className="text-xs mt-1 opacity-60">Scan struk akan tampil di sini</p>
						</div>
					) : (
						<div className="divide-y divide-border">
							{history.map((entry) => (
								<div key={entry.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
									{/* Thumbnail */}
									<div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
										<img
											src={entry.thumbnail}
											alt="Thumbnail struk"
											className="h-full w-full object-cover"
										/>
									</div>

									{/* Info */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-1.5">
											<span className="truncate font-semibold text-sm text-foreground">
												{entry.merchant || "Tidak diketahui"}
											</span>
											{entry.saved && (
												<span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
													Tersimpan
												</span>
											)}
										</div>
										<div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
											<span
												className={
													entry.transactionType === "expense"
														? "text-red-500"
														: entry.transactionType === "income"
														? "text-emerald-500"
														: ""
												}
											>
												{entry.transactionType === "expense"
													? "Pengeluaran"
													: entry.transactionType === "income"
													? "Pemasukan"
													: "Tidak diketahui"}
											</span>
											<span>•</span>
											<span className="font-medium text-foreground">
												Rp {entry.total.toLocaleString("id-ID")}
											</span>
										</div>
										<div className="mt-0.5 text-[10px] text-muted-foreground">
											{entry.category} • {formatAgo(entry.date)}
										</div>
									</div>

									{/* Delete */}
									<button
										type="button"
										onClick={() => onRemove(entry.id)}
										className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
