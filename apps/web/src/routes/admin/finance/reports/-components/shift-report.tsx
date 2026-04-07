import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import {
	BadgeDollarSign,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Copy,
	Download,
	FileText,
	Image as ImageIcon,
	Loader2,
	Mail,
	ReceiptText,
	TrendingUp,
	Users,
	Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRange } from "./period-selector";
import {
	exportShiftReportsCSV,
	exportShiftReportsJPG,
	exportShiftReportsPDF,
	formatCurrencyIDR,
	type ShiftReportDetails,
	type ShiftReportRow,
	type ShiftReportTotals,
} from "@/lib/export-utils";

interface Props {
	range: DateRange;
}

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
	endingCashExpected: number;
	endingCashPhysical?: number;
	nonCashExpected: number;
	nonCashConfirmed?: number;
	hasTarget?: boolean;
	targetMonth?: string;
	dailyTarget?: number;
	shiftTarget?: number;
	dailyCollected?: number;
	shiftCollected?: number;
	dailyTargetProgress?: number;
	shiftTargetProgress?: number;
	isDailyTargetMet?: boolean;
	isShiftTargetMet?: boolean;
};

function formatDateTime(timestamp: number, withTime = false) {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		...(withTime
			? {
					hour: "2-digit",
					minute: "2-digit",
			  }
			: {}),
	});
}

function formatTime(timestamp?: number) {
	if (!timestamp) return "Aktif";
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatCompactRange(startTime: number, endTime?: number) {
	return `${formatDateTime(startTime)} • ${formatTime(startTime)}-${formatTime(endTime)}`;
}

function buildShiftSummaryText(shift: ShiftRow, details: any) {
	const productBreakdown = details?.productBreakdown ?? [];
	const topProducts = details?.topProducts ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = shift.teamMembers?.trim() ? shift.teamMembers : "-";
	const lines: string[] = [
		"Daily Revenue Report",
		"Djiwa Tentram Cafe & Resto",
		`Tanggal: ${formatDateTime(shift.startTime)}`,
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
		`Produk Terjual: ${shift.totalItemsSold}`,
		"Rincian Produk:",
	];

	if (productBreakdown.length > 0) {
		for (const category of productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  • ${item.productName}: ${item.quantity}`);
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
			`- Target Shift: ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Target Harian: ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Revenue Harian: ${formatCurrencyIDR(shift.dailyCollected ?? 0)}`,
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

export function ShiftReport({ range }: Props) {
	const sendShiftReportEmail = useAction(api.reportsEmail.sendShiftReportEmail);
	const sendShiftTableReportEmail = useAction(
		api.reportsEmail.sendShiftTableReportEmail,
	);
	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Toko";
	const rows = useQuery(api.finance.getShiftReportTable, {
		startDate: range.startDate,
		endDate: range.endDate,
	}) as ShiftRow[] | undefined;

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(null);
	const [sendingShiftStart, setSendingShiftStart] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isSendingFullEmail, setIsSendingFullEmail] = useState(false);

	useEffect(() => {
		if (!rows?.length) {
			setSelectedShiftStart(null);
			return;
		}

		if (
			selectedShiftStart === null ||
			!rows.some((shift) => shift.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(rows[0].startTime);
		}
	}, [rows, selectedShiftStart]);

	const selectedShift =
		rows?.find((shift) => shift.startTime === selectedShiftStart) ?? rows?.[0];

	const details = useQuery(
		api.finance.getShiftDetails,
		selectedShift
			? {
					startTime: selectedShift.startTime,
					endTime: selectedShift.endTime,
			  }
			: "skip",
	);

	const totals = useMemo(() => {
		const safeRows = rows ?? [];
		return safeRows.reduce(
			(acc, shift) => {
				acc.totalRevenue += shift.totalRevenue;
				acc.totalGross += shift.totalGrossSales;
				acc.totalDiscount += shift.totalDiscount;
				acc.totalExpenses += shift.totalExpenses;
				acc.totalItems += shift.totalItemsSold;
				acc.activeCount += shift.status === "AKTIF" ? 1 : 0;
				return acc;
			},
			{
				totalRevenue: 0,
				totalGross: 0,
				totalDiscount: 0,
				totalExpenses: 0,
				totalItems: 0,
				activeCount: 0,
			},
		);
	}, [rows]);

	if (!rows) {
		return (
			<div className="space-y-4">
				<div className="grid gap-3 md:grid-cols-4">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-24 rounded-2xl" />
					))}
				</div>
				<Skeleton className="h-[420px] rounded-2xl" />
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground">
				<Users className="mb-3 h-10 w-10 opacity-30" />
				<p className="font-semibold text-foreground">Belum ada data shift</p>
				<p className="mt-1 text-sm">
					Coba ubah periode atau mulai shift baru agar laporan tampil di sini.
				</p>
			</div>
		);
	}

	const summaryText =
		selectedShift && details
			? buildShiftSummaryText(selectedShift, details)
			: "";

	const handleSendShiftEmail = async (shift: ShiftRow) => {
		try {
			setSendingShiftStart(shift.startTime);
			await sendShiftReportEmail({
				startTime: shift.startTime,
				endTime: shift.endTime,
			});
			toast.success(`Email laporan ${shift.shiftName} berhasil dikirim`);
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Gagal mengirim email laporan shift.";
			toast.error(message);
		} finally {
			setSendingShiftStart(null);
		}
	};

	const handleExport = async (format: "pdf" | "csv" | "jpg") => {
		if (!rows?.length) return;
		setIsExporting(true);
		try {
			const shiftRows = rows as ShiftReportRow[];
			const shiftTotals = totals as ShiftReportTotals;
			const shiftDetails = details as ShiftReportDetails | undefined;
			const selected = selectedShift as ShiftReportRow | undefined;

			if (format === "pdf") {
				exportShiftReportsPDF(
					shiftRows,
					storeName,
					range.label,
					shiftTotals,
					selected,
					shiftDetails,
				);
			} else if (format === "csv") {
				exportShiftReportsCSV(shiftRows, range.label);
			} else {
				exportShiftReportsJPG(
					shiftRows,
					storeName,
					range.label,
					shiftTotals,
					selected,
					shiftDetails,
				);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const handleSendFullReportEmail = async () => {
		if (!rows?.length) return;
		try {
			setIsSendingFullEmail(true);
			await sendShiftTableReportEmail({
				startDate: range.startDate,
				endDate: range.endDate,
				periodLabel: range.label,
				selectedStartTime: selectedShift?.startTime,
				selectedEndTime: selectedShift?.endTime,
			});
			toast.success("Laporan shift lengkap berhasil dikirim ke email");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Gagal mengirim email laporan shift lengkap.";
			toast.error(message);
		} finally {
			setIsSendingFullEmail(false);
		}
	};

	return (
		<div className="space-y-5">
			<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
				<button
					type="button"
					onClick={() => void handleExport("pdf")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<FileText className="h-3.5 w-3.5" />
					PDF
				</button>
				<button
					type="button"
					onClick={() => void handleExport("csv")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<Download className="h-3.5 w-3.5" />
					CSV
				</button>
				<button
					type="button"
					onClick={() => void handleExport("jpg")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<ImageIcon className="h-3.5 w-3.5" />
					JPG
				</button>
				<button
					type="button"
					onClick={() => void handleSendFullReportEmail()}
					disabled={isSendingFullEmail || !rows?.length}
					className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40 sm:col-span-1 sm:min-w-[132px]"
				>
					{isSendingFullEmail ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Mail className="h-3.5 w-3.5" />
					)}
					Kirim Email
				</button>
			</div>

			<div className="grid gap-3 md:grid-cols-4">
				<SummaryCard
					icon={Users}
					label="Total Shift"
					value={`${rows.length} shift`}
					helper={`${totals.activeCount} shift aktif`}
				/>
				<SummaryCard
					icon={Wallet}
					label="Revenue Bersih"
					value={formatCurrencyIDR(totals.totalRevenue)}
					helper={`Bruto ${formatCurrencyIDR(totals.totalGross, true)}`}
				/>
				<SummaryCard
					icon={BadgeDollarSign}
					label="Total Potongan"
					value={formatCurrencyIDR(totals.totalDiscount)}
					helper={`Pengeluaran ${formatCurrencyIDR(totals.totalExpenses, true)}`}
				/>
				<SummaryCard
					icon={TrendingUp}
					label="Produk Terjual"
					value={`${totals.totalItems} item`}
					helper={range.label}
				/>
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
				<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<div>
							<h3 className="font-bold text-base">Tabel Laporan Shift</h3>
							<p className="text-xs text-muted-foreground">
								Klik satu baris untuk melihat ringkasan detail shift.
							</p>
						</div>
						<div className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
							{rows.length} data
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-[1560px] w-full border-collapse text-[13px]">
							<thead className="bg-muted/40 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
								<tr>
									<TableHead>Tanggal</TableHead>
									<TableHead>Shift</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Kasir</TableHead>
									<TableHead>Tim</TableHead>
									<TableHead>Modal</TableHead>
									<TableHead>Tunai</TableHead>
									<TableHead>Debit/QRIS</TableHead>
									<TableHead>Bruto</TableHead>
									<TableHead>Diskon</TableHead>
									<TableHead>Net</TableHead>
									<TableHead>Target Shift</TableHead>
									<TableHead>Target Harian</TableHead>
									<TableHead>Pengeluaran</TableHead>
									<TableHead>Produk</TableHead>
									<TableHead>Aksi</TableHead>
								</tr>
							</thead>
							<tbody>
								{rows.map((shift) => {
									const isSelected = shift.startTime === selectedShift?.startTime;
									return (
										<tr
											key={shift.shiftId}
											className={`cursor-pointer border-t border-border transition-colors ${
												isSelected
													? "bg-primary/5"
													: "hover:bg-muted/30"
											}`}
											onClick={() => setSelectedShiftStart(shift.startTime)}
										>
											<TableCell>
												<div className="font-semibold text-foreground whitespace-nowrap">
													{formatCompactRange(shift.startTime, shift.endTime)}
												</div>
											</TableCell>
											<TableCell className="font-medium whitespace-nowrap">
												{shift.shiftName}
											</TableCell>
											<TableCell>
												<span
													className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold leading-4 ${
														shift.status === "AKTIF"
															? "bg-emerald-100 text-emerald-700"
															: "bg-slate-100 text-slate-700"
													}`}
												>
													{shift.status}
												</span>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												{shift.cashierName || "-"}
											</TableCell>
											<TableCell className="max-w-[170px]">
												<div className="truncate whitespace-nowrap text-muted-foreground">
													{shift.teamMembers || "-"}
												</div>
											</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.startingCash, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.cashRevenue, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.qrisRevenue, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.totalGrossSales, true)}</TableCell>
											<TableCell className="whitespace-nowrap text-amber-700">
												-{formatCurrencyIDR(shift.totalDiscount, true)}
											</TableCell>
											<TableCell className="whitespace-nowrap font-bold text-primary">
												{formatCurrencyIDR(shift.totalRevenue, true)}
											</TableCell>
											<TableCell>
												<TargetStatusCell
													label="Shift"
													hasTarget={!!shift.hasTarget}
													met={!!shift.isShiftTargetMet}
													current={shift.shiftCollected ?? shift.totalRevenue}
													target={shift.shiftTarget ?? 0}
												/>
											</TableCell>
											<TableCell>
												<TargetStatusCell
													label="Harian"
													hasTarget={!!shift.hasTarget}
													met={!!shift.isDailyTargetMet}
													current={shift.dailyCollected ?? 0}
													target={shift.dailyTarget ?? 0}
												/>
											</TableCell>
											<TableCell className="whitespace-nowrap text-rose-700">
												{formatCurrencyIDR(shift.totalExpenses, true)}
											</TableCell>
											<TableCell className="whitespace-nowrap text-center">
												{shift.totalItemsSold}
											</TableCell>
											<TableCell>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														void handleSendShiftEmail(shift);
													}}
													disabled={sendingShiftStart === shift.startTime}
													className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
												>
													{sendingShiftStart === shift.startTime ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : (
														<Mail className="h-3 w-3" />
													)}
													Email
												</button>
											</TableCell>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>

				<div className="space-y-4">
					<div className="rounded-2xl border border-border bg-card shadow-sm">
						<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
									Ringkasan Shift
								</p>
								<h3 className="mt-1 font-bold text-lg text-foreground">
									{selectedShift?.shiftName || "Pilih Shift"}
								</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									{selectedShift
										? `${selectedShift.cashierName || "Kasir"} • ${formatDateTime(
												selectedShift.startTime,
											)}`
										: "Klik tabel di kiri untuk membuka detail laporan."}
								</p>
							</div>
							<button
								type="button"
								onClick={async () => {
									if (!summaryText) return;
									await navigator.clipboard.writeText(summaryText);
									toast.success("Ringkasan shift berhasil disalin");
								}}
								className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
							>
								<Copy className="h-3.5 w-3.5" />
								Salin
							</button>
						</div>

						{selectedShift ? (
							<div className="space-y-4 p-4">
								<div className="grid gap-3 sm:grid-cols-2">
									<MiniStat
										icon={Wallet}
										label="Revenue Bersih"
										value={formatCurrencyIDR(selectedShift.totalRevenue)}
									/>
									<MiniStat
										icon={ReceiptText}
										label="Penjualan Bruto"
										value={formatCurrencyIDR(selectedShift.totalGrossSales)}
									/>
									<MiniStat
										icon={CheckCircle2}
										label="Kasir"
										value={selectedShift.cashierName || "-"}
									/>
									<MiniStat
										icon={Clock3}
										label="Durasi"
										value={`${formatTime(selectedShift.startTime)} - ${formatTime(
											selectedShift.endTime,
										)}`}
									/>
								</div>

								<div className="rounded-2xl border border-border bg-muted/20 p-3">
									<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										<TrendingUp className="h-3.5 w-3.5" />
										Status Target
									</div>
									{selectedShift.hasTarget ? (
										<div className="grid gap-3 sm:grid-cols-2">
											<DetailBlock
												title="Target Shift"
												items={[
													["Target", formatCurrencyIDR(selectedShift.shiftTarget ?? 0)],
													["Revenue Shift", formatCurrencyIDR(selectedShift.shiftCollected ?? selectedShift.totalRevenue)],
													["Status", selectedShift.isShiftTargetMet ? "Target Tercapai" : "Target Tidak Tercapai"],
												]}
											/>
											<DetailBlock
												title="Target Harian"
												items={[
													["Target Harian", formatCurrencyIDR(selectedShift.dailyTarget ?? 0)],
													["Revenue Harian", formatCurrencyIDR(selectedShift.dailyCollected ?? 0)],
													["Status", selectedShift.isDailyTargetMet ? "Target Tercapai" : "Target Tidak Tercapai"],
												]}
											/>
										</div>
									) : (
										<p className="text-sm text-muted-foreground">
											Belum ada target keuangan bulanan untuk periode shift ini.
										</p>
									)}
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<DetailBlock
										title="Pembayaran"
										items={[
											["Modal Kasir", formatCurrencyIDR(selectedShift.startingCash)],
											["Tunai", formatCurrencyIDR(selectedShift.cashRevenue)],
											["Debit/QRIS", formatCurrencyIDR(selectedShift.qrisRevenue)],
											["Lainnya", formatCurrencyIDR(selectedShift.otherRevenue)],
										]}
									/>
									<DetailBlock
										title="Operasional"
										items={[
											["Penjualan Bruto", formatCurrencyIDR(selectedShift.totalGrossSales)],
											["Diskon", formatCurrencyIDR(selectedShift.totalDiscount)],
											["Revenue Bersih", formatCurrencyIDR(selectedShift.totalRevenue)],
											["Pengeluaran", formatCurrencyIDR(selectedShift.totalExpenses)],
										]}
									/>
								</div>

								<div className="rounded-2xl border border-border bg-muted/20 p-3">
									<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										<CalendarDays className="h-3.5 w-3.5" />
										Informasi Shift
									</div>
									<div className="grid gap-2 text-sm sm:grid-cols-2">
										<InfoRow label="Status" value={selectedShift.status} />
										<InfoRow
											label="Total Produk"
											value={`${selectedShift.totalItemsSold} item`}
										/>
										<InfoRow label="Tim" value={selectedShift.teamMembers || "-"} />
										<InfoRow
											label="Transaksi POS"
											value={`${selectedShift.orderCount} transaksi`}
										/>
									</div>
								</div>

								<div className="grid gap-3">
									<div className="rounded-2xl border border-border bg-background p-3">
										<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
											Top Produk
										</h4>
										{details === undefined ? (
											<Skeleton className="h-20 rounded-xl" />
										) : details?.topProducts?.length ? (
											<div className="space-y-2">
												{details.topProducts.map((item: any, index: number) => (
													<div
														key={`${item.productName}-${index}`}
														className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
													>
														<div className="flex items-center gap-2">
															<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
																{index + 1}
															</span>
															<span className="font-medium text-foreground">
																{item.productName}
															</span>
														</div>
														<span className="text-sm font-bold text-primary">
															{item.quantity}
														</span>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">Belum ada produk terjual.</p>
										)}
									</div>

									<div className="rounded-2xl border border-border bg-background p-3">
										<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
											Rincian Produk per Kategori
										</h4>
										{details === undefined ? (
											<Skeleton className="h-28 rounded-xl" />
										) : details?.productBreakdown?.length ? (
											<div className="space-y-3">
												{details.productBreakdown.map((category: any) => (
													<div key={category.categoryName} className="rounded-xl border border-border bg-muted/20 p-3">
														<div className="mb-2 flex items-center justify-between">
															<p className="font-semibold text-foreground">
																{category.categoryName}
															</p>
															<span className="text-xs font-bold text-primary">
																{category.totalQuantity} item
															</span>
														</div>
														<div className="space-y-1.5">
															{category.items.map((item: any) => (
																<div
																	key={`${category.categoryName}-${item.productName}`}
																	className="flex items-center justify-between text-sm"
																>
																	<span className="text-muted-foreground">
																		{item.productName}
																	</span>
																	<span className="font-semibold text-foreground">
																		{item.quantity}
																	</span>
																</div>
															))}
														</div>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">Belum ada rincian produk.</p>
										)}
									</div>
								</div>

								<div className="rounded-2xl border border-border bg-slate-950 p-3 text-slate-50 shadow-inner">
									<div className="mb-3 flex items-center justify-between">
										<h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
											Format Ringkasan
										</h4>
										<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
											Siap salin
										</span>
									</div>
									<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">
										{summaryText}
									</pre>
								</div>
							</div>
						) : (
							<div className="p-4 text-sm text-muted-foreground">
								Pilih salah satu shift pada tabel untuk melihat ringkasan.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	helper,
}: {
	icon: typeof Wallet;
	label: string;
	value: string;
	helper: string;
}) {
	return (
		<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
					{label}
				</p>
				<div className="rounded-xl bg-primary/10 p-2 text-primary">
					<Icon className="h-4 w-4" />
				</div>
			</div>
			<p className="mt-4 text-xl font-black tracking-tight text-foreground">
				{value}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{helper}</p>
		</div>
	);
}

function TableHead({ children }: { children: React.ReactNode }) {
	return (
		<th className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold leading-4">
			{children}
		</th>
	);
}

function TableCell({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<td className={`whitespace-nowrap px-3 py-1.5 align-middle leading-5 ${className}`}>
			{children}
		</td>
	);
}

function MiniStat({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Wallet;
	label: string;
	value: string;
}) {
	return (
		<div className="rounded-2xl border border-border bg-background p-3">
			<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</div>
			<p className="mt-2 text-base font-bold text-foreground">{value}</p>
		</div>
	);
}

function TargetStatusCell({
	label,
	hasTarget,
	met,
	current,
	target,
}: {
	label: string;
	hasTarget: boolean;
	met: boolean;
	current: number;
	target: number;
}) {
	if (!hasTarget) {
		return (
			<div className="whitespace-nowrap text-xs text-muted-foreground">
				Belum ada target
			</div>
		);
	}

	return (
		<TargetBadge
			label={label}
			met={met}
			current={current}
			target={target}
		/>
	);
}

function TargetBadge({
	label,
	met,
	current,
	target,
}: {
	label: string;
	met: boolean;
	current: number;
	target: number;
}) {
	return (
		<div
			className={`rounded-lg border px-2 py-1.5 text-[10px] leading-4 ${
				met
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: "border-rose-200 bg-rose-50 text-rose-700"
			}`}
		>
			<div className="flex items-center justify-between gap-2 font-bold">
				<span>{label}</span>
				<span>{met ? "Tercapai" : "Tidak Tercapai"}</span>
			</div>
			<div className="mt-0.5 text-[9px] font-medium opacity-90">
				{formatCurrencyIDR(current, true)} / {formatCurrencyIDR(target, true)}
			</div>
		</div>
	);
}

function DetailBlock({
	title,
	items,
}: {
	title: string;
	items: Array<[string, string]>;
}) {
	return (
		<div className="rounded-2xl border border-border bg-background p-3">
			<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
				{title}
			</h4>
			<div className="space-y-2">
				{items.map(([label, value]) => (
					<div key={label} className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">{label}</span>
						<span className="text-right font-semibold text-foreground">{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-semibold text-foreground">{value}</span>
		</div>
	);
}
