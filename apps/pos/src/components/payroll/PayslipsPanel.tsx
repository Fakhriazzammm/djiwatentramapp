import { useState } from "react";
import { toast } from "sonner";
import {
	FileText,
	Download,
	Eye,
	Send,
	CheckCircle,
	Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	useHybridPayslips,
	useHybridPayrollPeriods,
	updatePayslipStatus,
} from "@/hooks/use-hybrid-payroll-data";

const fmtCurrency = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(n || 0);

const fmtDate = (d: string) => {
	if (!d) return "-";
	return new Date(d).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
};

function payslipStatusBadge(status: string) {
	const map: Record<string, { variant: "warning" | "info" | "success" | "default" | "destructive"; label: string }> = {
		generated: { variant: "warning", label: "Generated" },
		issued: { variant: "info", label: "Issued" },
		sent: { variant: "info", label: "Sent" },
		acknowledged: { variant: "success", label: "Diketahui" },
		paid: { variant: "default", label: "Paid" },
		disputed: { variant: "destructive", label: "Disputed" },
	};
	const s = map[status] ?? { variant: "secondary" as const, label: status };
	return <Badge variant={s.variant} size="sm">{s.label}</Badge>;
}

export default function PayslipsPanel() {
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

	const payslipsData = useHybridPayslips(
		statusFilter !== "all" ? { status: statusFilter } : undefined
	);
	const payslips = (payslipsData?.data ?? payslipsData) as any[] | null;

	const filteredPayslips = payslips?.filter((p: any) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return (
			(p.user_name ?? "").toLowerCase().includes(q) ||
			(p.slip_number ?? p.id).toLowerCase().includes(q)
		);
	});

	const handleSendPayslip = async (payslipId: string) => {
		try {
			await updatePayslipStatus({ payslipId, status: "sent" });
			toast.success("Payslip ditandai sebagai terkirim");
		} catch (err: any) {
			toast.error("Gagal update status: " + (err?.message ?? "Unknown error"));
		}
	};

	const handleAcknowledge = async (payslipId: string) => {
		try {
			await updatePayslipStatus({ payslipId, status: "acknowledged" });
			toast.success("Payslip ditandai telah diketahui");
		} catch (err: any) {
			toast.error("Gagal update status: " + (err?.message ?? "Unknown error"));
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
					Payslips
				</h4>
			</div>

			{/* Filters */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-9 pl-9 text-xs"
						placeholder="Cari staff atau nomor slip..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
				<Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
					<SelectTrigger className="h-9 w-40 text-xs">
						<SelectValue placeholder="Filter Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Semua Status</SelectItem>
						<SelectItem value="generated">Generated</SelectItem>
						<SelectItem value="issued">Issued</SelectItem>
						<SelectItem value="sent">Sent</SelectItem>
						<SelectItem value="acknowledged">Diketahui</SelectItem>
						<SelectItem value="paid">Paid</SelectItem>
						<SelectItem value="disputed">Disputed</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
							<tr>
								<th className="px-4 py-3">Nomor Slip</th>
								<th className="px-4 py-3">Staff</th>
								<th className="px-4 py-3">Periode</th>
								<th className="px-4 py-3 text-right">Total</th>
								<th className="px-4 py-3 text-center">Status</th>
								<th className="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{!filteredPayslips ? (
								Array.from({ length: 3 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={6} className="px-4 py-4">
											<Skeleton className="h-6 w-full" />
										</td>
									</tr>
								))
							) : filteredPayslips.length === 0 ? (
								<tr>
									<td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
										<div className="flex flex-col items-center gap-2">
											<FileText className="h-8 w-8 text-muted-foreground/30" />
											<span>Tidak ada payslip ditemukan</span>
										</div>
									</td>
								</tr>
							) : (
								filteredPayslips.map((slip: any) => (
									<tr key={slip.id} className="transition-colors hover:bg-muted/30">
										<td className="px-4 py-3">
											<span className="font-mono text-xs font-semibold text-foreground">
												{slip.slip_number ?? slip.id.slice(0, 8)}
											</span>
										</td>
										<td className="px-4 py-3 text-xs">
											{slip.user_name ?? "-"}
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{slip.period_name ?? `${fmtDate(slip.period_start)} - ${fmtDate(slip.period_end)}`}
										</td>
										<td className="px-4 py-3 text-right font-mono text-xs font-semibold">
											{fmtCurrency(slip.net_pay ?? 0)}
										</td>
										<td className="px-4 py-3 text-center">
											{payslipStatusBadge(slip.status ?? "generated")}
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center justify-end gap-1">
												<Button
													size="sm"
													variant="ghost"
													className="h-7 gap-1 px-2 text-[10px]"
													onClick={() => setSelectedPayslip(slip)}
												>
													<Eye className="h-3 w-3" />
													Detail
												</Button>
												{(slip.status === "generated" || slip.status === "issued") && (
													<Button
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2 text-[10px] text-blue-600 hover:text-blue-700"
														onClick={() => handleSendPayslip(slip.id)}
													>
														<Send className="h-3 w-3" />
														Kirim
													</Button>
												)}
												{slip.status === "sent" && (
													<Button
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2 text-[10px] text-emerald-600 hover:text-emerald-700"
														onClick={() => handleAcknowledge(slip.id)}
													>
														<CheckCircle className="h-3 w-3" />
														Terima
													</Button>
												)}
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Detail Dialog */}
			<Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogTitle>Detail Payslip</DialogTitle>
					<DialogDescription>Informasi lengkap payslip karyawan.</DialogDescription>
					{selectedPayslip && (
						<div className="space-y-4 pt-2">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest">Staff</p>
									<p className="font-semibold text-sm">{selectedPayslip.user_name ?? "-"}</p>
								</div>
								<div>
									<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest">Status</p>
									<div className="mt-0.5">{payslipStatusBadge(selectedPayslip.status)}</div>
								</div>
								<div>
									<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest">Periode</p>
									<p className="text-sm">{selectedPayslip.period_name ?? "-"}</p>
								</div>
								<div>
									<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest">Nomor Slip</p>
									<p className="font-mono text-sm">{selectedPayslip.slip_number ?? selectedPayslip.id.slice(0, 8)}</p>
								</div>
							</div>

							<div className="border-t border-border pt-4">
								<div className="space-y-2">
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Gross Pay</span>
										<span className="font-mono font-semibold">{fmtCurrency(selectedPayslip.gross_pay ?? 0)}</span>
									</div>
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Deductions</span>
										<span className="font-mono text-destructive">-{fmtCurrency(selectedPayslip.deductions ?? 0)}</span>
									</div>
									<div className="flex justify-between text-sm border-t border-border pt-2">
										<span className="font-bold">Net Pay</span>
										<span className="font-mono font-bold text-primary">{fmtCurrency(selectedPayslip.net_pay ?? 0)}</span>
									</div>
								</div>
							</div>

							{selectedPayslip.breakdown && typeof selectedPayslip.breakdown === "object" && (
								<div className="border-t border-border pt-4">
									<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest mb-2">Breakdown</p>
									<div className="grid grid-cols-2 gap-2 text-xs">
										{Object.entries(selectedPayslip.breakdown).map(([key, value]) => (
											<div key={key} className="flex justify-between">
												<span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
												<span className="font-mono">{typeof value === "number" ? fmtCurrency(value) : String(value)}</span>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
