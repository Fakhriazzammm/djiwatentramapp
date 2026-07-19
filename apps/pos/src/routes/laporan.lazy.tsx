import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ArrowLeft,
	Copy,
	FileText,
} from "lucide-react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import {
	formatDateWIB,
} from "@/lib/wib-utils";
import {
	useHybridShiftDetails,
	useHybridShiftReportRows,
	useHybridStaffUsers,
	triggerHybridRefresh,
} from "@/hooks/use-hybrid-pos-data";

type ShiftRow = {
	shiftId: string;
	shiftName: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	hasTarget?: boolean;
	shiftTarget?: number;
	shiftCollected?: number;
	dailyTarget?: number;
	dailyCollected?: number;
	isShiftTargetMet?: boolean;
	isDailyTargetMet?: boolean;
};

function formatDate(timestamp: number) {
	return formatDateWIB(timestamp);
}

function formatTeamMembersByRole(
	teamMembers: string,
	allStaffUsers: any[] | undefined
): string {
	if (!teamMembers?.trim()) return "-";
	const names = teamMembers
		.split(",")
		.map((n: string) => n.trim())
		.filter(Boolean);
	if (!names.length) return "-";
	if (!allStaffUsers?.length) return teamMembers;
	const grouped = new Map<string, string[]>();
	const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Manajer"];
	names.forEach((name: string) => {
		const user = allStaffUsers.find(
			(u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase()
		);
		const role = user?.roleName?.trim() || "Lainnya";
		if (!grouped.has(role)) grouped.set(role, []);
		grouped.get(role)!.push(name);
	});
	const sortedRoles = [...grouped.keys()].sort((a, b) => {
		const ai = roleOrder.findIndex(
			(r) => r.toLowerCase() === a.toLowerCase()
		);
		const bi = roleOrder.findIndex(
			(r) => r.toLowerCase() === b.toLowerCase()
		);
		return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
	});
	return sortedRoles
		.map((role) => {
			const formattedRole =
				role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
			return `${formattedRole}: ${grouped.get(role)!.join(", ")}`;
		})
		.join("\n");
}

function buildShiftSummaryText(
	shift: ShiftRow,
	details: any,
	allStaffUsers?: any[]
) {
	const topProducts = details?.topProducts ?? [];
	const productBreakdown = details?.productBreakdown ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = formatTeamMembersByRole(
		shift.teamMembers ?? "",
		allStaffUsers
	);
	const derivedTotalItems = productBreakdown.reduce(
		(acc: number, category: any) => acc + Number(category?.totalQuantity ?? 0),
		0
	);
	const totalItems =
		shift.totalItemsSold > 0 ? shift.totalItemsSold : derivedTotalItems;
	const lines: string[] = [
		"Daily Revenue Report",
		"Djiwa Tentram Cafe & Resto",
		`Tanggal: ${formatDate(shift.startTime)}`,
		"",
		`${shift.shiftName} (${shift.status})`,
		`Modal Kasir: ${formatCurrencyIDR(shift.startingCash)}`,
		`Tunai: ${formatCurrencyIDR(shift.cashRevenue)}`,
		`Debit/QRIS: ${formatCurrencyIDR(shift.qrisRevenue)}`,
		`Lainnya: ${formatCurrencyIDR(shift.otherRevenue)}`,
		"",
		`Total Penjualan Bruto: ${formatCurrencyIDR(shift.totalGrossSales)}`,
		`Total Potongan (Diskon): ${formatCurrencyIDR(shift.totalDiscount)}`,
		`Total Revenue Bersih: ${formatCurrencyIDR(shift.totalRevenue)}`,
		"",
		`Produk Terjual: ${totalItems}`,
		"Rincian Produk:",
	];

	if (productBreakdown.length > 0) {
		for (const category of productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  - ${item.productName}: ${item.quantity}`);
			}
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push("TOP 3 PRODUK TERLARIS:");
	if (topProducts.length > 0) {
		for (const item of topProducts) {
			lines.push(`- ${item.productName}: ${item.quantity}`);
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	if (shift.hasTarget) {
		lines.push("STATUS TARGET:");
		lines.push(
			`- Target Shift: ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Belum Tercapai"})`
		);
		lines.push(
			`- Target Harian: ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Belum Tercapai"})`
		);
		lines.push(
			`- Revenue Harian: ${formatCurrencyIDR(shift.dailyCollected ?? 0)}`
		);
		lines.push("");
	}

	lines.push(`Pengeluaran Shift: ${formatCurrencyIDR(shift.totalExpenses)}`);
	if (expenseBreakdown.length > 0) {
		for (const expense of expenseBreakdown) {
			lines.push(`- ${expense.category}: ${formatCurrencyIDR(expense.amount)}`);
		}
	}

	lines.push("");
	lines.push(`Kasir: ${shift.cashierName || "-"}`);
	lines.push(`Tim: ${teamLabel}`);

	return lines.join("\n");
}

export const Route = createLazyFileRoute("/laporan")({
	component: LaporanPage,
});

function LaporanPage() {
	const navigate = useNavigate();
	const allStaffUsers = useHybridStaffUsers();
	const shiftRowsResult = useHybridShiftReportRows() as
		| ShiftRow[]
		| null
		| undefined;

	const shiftRows = useMemo(() => {
		const raw = Array.isArray(shiftRowsResult) ? shiftRowsResult : [];
		const seen = new Map<string, ShiftRow>();
		for (const row of raw) {
			const dateKey = formatDateWIB(row.startTime);
			const dedupKey = `${row.shiftName}::${dateKey}`;
			const existing = seen.get(dedupKey);
			if (!existing || row.startTime > existing.startTime) {
				seen.set(dedupKey, row);
			}
		}
		return Array.from(seen.values()).sort((a, b) => b.startTime - a.startTime);
	}, [shiftRowsResult]);

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(
		null
	);

	useEffect(() => {
		if (!shiftRows?.length) {
			setSelectedShiftStart(null);
			return;
		}
		if (
			selectedShiftStart === null ||
			!shiftRows.some((row) => row.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(shiftRows[0].startTime);
		}
	}, [shiftRows, selectedShiftStart]);

	const selectedShift =
		shiftRows?.find((shift) => shift.startTime === selectedShiftStart) ??
		shiftRows?.[0];

	const shiftDetails = useHybridShiftDetails(
		selectedShift
			? {
					startTime: selectedShift.startTime,
					endTime: selectedShift.endTime,
			  }
			: "skip"
	);

	const summaryText = useMemo(() => {
		if (!selectedShift || !shiftDetails) return "";
		return buildShiftSummaryText(selectedShift, shiftDetails, allStaffUsers);
	}, [selectedShift, shiftDetails, allStaffUsers]);

	return (
		<div className="app-page min-h-app text-foreground">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-4 md:max-w-4xl">
				{/* Header */}
				<header className="flex items-center gap-3 mb-5">
					<button
						type="button"
						onClick={() => navigate({ to: "/menu" })}
						className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/80"
					>
						<ArrowLeft className="h-5 w-5" />
					</button>
					<div className="flex items-center gap-2">
						<FileText className="h-5 w-5 text-primary" />
						<h1 className="text-base font-bold tracking-tight">Laporan Shift</h1>
					</div>
				</header>

				{/* Ringkasan Shift — simple seperti dashboard */}
				<section className="mb-5 space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="font-bold text-sm">Ringkasan Shift</h3>
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
								disabled={!summaryText}
								onClick={async () => {
									if (!summaryText) return;
									await navigator.clipboard.writeText(summaryText);
									toast.success("Ringkasan shift berhasil disalin");
									triggerHybridRefresh();
								}}
							>
								<Copy className="h-3.5 w-3.5" />
								Salin
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-600 disabled:opacity-50"
								disabled={!summaryText}
								onClick={async () => {
									if (!summaryText) return;
									try {
										const { sendTelegramReport } = await import(
											"@/lib/telegram-report"
										);
										const result = await sendTelegramReport(summaryText);
										if (result.ok) {
											toast.success("Ringkasan shift berhasil dikirim ke Telegram!");
											triggerHybridRefresh();
										} else {
											toast.error(result.error || "Gagal mengirim ke Telegram");
										}
									} catch (err: any) {
										toast.error(err?.message || "Gagal mengirim ke Telegram");
									}
								}}
							>
								<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
								Telegram
							</button>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{shiftRows.length > 0 && (
							<select
								className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none"
								value={selectedShift?.startTime ?? ""}
								onChange={(e) =>
									setSelectedShiftStart(Number(e.target.value))
								}
							>
								{shiftRows.map((shift) => (
									<option key={shift.shiftId} value={shift.startTime}>
										{shift.shiftName} - {formatDate(shift.startTime)} ({shift.status})
									</option>
								))}
							</select>
						)}
					</div>

					{shiftRowsResult === undefined ? (
						<div className="py-8 text-sm text-muted-foreground">
							Memuat data shift...
						</div>
					) : shiftRows.length === 0 ? (
						<div className="py-8 text-sm text-muted-foreground">
							Belum ada data shift.
						</div>
					) : (
						<div className="rounded-2xl border border-border bg-card p-4 text-foreground shadow-sm">
							<pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
								{summaryText}
							</pre>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
