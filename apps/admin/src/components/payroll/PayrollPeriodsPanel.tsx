import { useState } from "react";
import { toast } from "sonner";
import {
	Calendar,
	Plus,
	Pencil,
	Trash2,
	Play,
	XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	useHybridPayrollPeriods,
	generatePayrollRun,
	executePayrollSql,
} from "@/hooks/use-hybrid-payroll-data";

const fmtCurrency = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(n);

const fmtDate = (d: string) => {
	if (!d) return "-";
	return new Date(d).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
};

function statusBadge(status: string) {
	const map: Record<string, { variant: "warning" | "info" | "success" | "default" | "destructive"; label: string }> = {
		draft: { variant: "warning", label: "Draft" },
		processing: { variant: "info", label: "Processing" },
		approved: { variant: "success", label: "Approved" },
		paid: { variant: "default", label: "Paid" },
		cancelled: { variant: "destructive", label: "Cancelled" },
		completed: { variant: "success", label: "Completed" },
	};
	const s = map[status] ?? { variant: "secondary" as const, label: status };
	return <Badge variant={s.variant} size="sm">{s.label}</Badge>;
}

export default function PayrollPeriodsPanel() {
	const periods = useHybridPayrollPeriods();
	const [showCreate, setShowCreate] = useState(false);
	const [newPeriod, setNewPeriod] = useState({
		period_name: "",
		start_date: "",
		end_date: "",
	});
	const [generating, setGenerating] = useState<string | null>(null);

	const handleCreatePeriod = async () => {
		if (!newPeriod.period_name || !newPeriod.start_date || !newPeriod.end_date) {
			toast.error("Lengkapi semua field");
			return;
		}
		try {
			await executePayrollSql(`
				INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status)
				VALUES ('${newPeriod.period_name}', '${newPeriod.start_date}', '${newPeriod.end_date}', 'draft');
			`);
			toast.success("Periode berhasil dibuat");
			setShowCreate(false);
			setNewPeriod({ period_name: "", start_date: "", end_date: "" });
		} catch (err: any) {
			toast.error("Gagal membuat periode: " + (err?.message ?? "Unknown error"));
		}
	};

	const handleGenerateRun = async (periodId: string) => {
		setGenerating(periodId);
		try {
			await generatePayrollRun({ periodId });
			toast.success("Payroll run berhasil di-generate");
		} catch (err: any) {
			toast.error("Gagal generate run: " + (err?.message ?? "Unknown error"));
		} finally {
			setGenerating(null);
		}
	};

	const handleCancel = async (periodId: string) => {
		try {
			await executePayrollSql(`
				UPDATE pos.payroll_periods SET status = 'cancelled', updated_at = now()
				WHERE id = '${periodId}';
			`);
			toast.success("Periode dibatalkan");
		} catch (err: any) {
			toast.error("Gagal membatalkan: " + (err?.message ?? "Unknown error"));
		}
	};

	const rows = (periods?.data ?? periods) as any[] | null;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
					Periode Payroll
				</h4>
				<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate(true)}>
					<Plus className="h-3.5 w-3.5" />
					Buat Periode Baru
				</Button>
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
							<tr>
								<th className="px-4 py-3">Nama Periode</th>
								<th className="px-4 py-3">Mulai</th>
								<th className="px-4 py-3">Selesai</th>
								<th className="px-4 py-3 text-center">Status</th>
								<th className="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{!rows ? (
								Array.from({ length: 3 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={5} className="px-4 py-4">
											<Skeleton className="h-6 w-full" />
										</td>
									</tr>
								))
							) : rows.length === 0 ? (
								<tr>
									<td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
										<div className="flex flex-col items-center gap-2">
											<Calendar className="h-8 w-8 text-muted-foreground/30" />
											<span>Belum ada periode payroll</span>
										</div>
									</td>
								</tr>
							) : (
								rows.map((p: any) => (
									<tr key={p.id} className="transition-colors hover:bg-muted/30">
										<td className="px-4 py-3">
											<span className="font-semibold text-xs text-foreground">
												{p.period_name ?? p.code ?? `-`}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{fmtDate(p.start_date)}
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{fmtDate(p.end_date)}
										</td>
										<td className="px-4 py-3 text-center">
											{statusBadge(p.status ?? "draft")}
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center justify-end gap-1.5">
												{(p.status === "draft" || p.status === "processing") && (
													<Button
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2 text-[10px]"
														onClick={() => handleGenerateRun(p.id)}
														disabled={generating === p.id}
													>
														<Play className="h-3 w-3" />
														{generating === p.id ? "Generating..." : "Generate Run"}
													</Button>
												)}
												{p.status === "draft" && (
													<Button
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2 text-[10px] text-destructive hover:text-destructive"
														onClick={() => handleCancel(p.id)}
													>
														<XCircle className="h-3 w-3" />
														Batal
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

			{/* Dialog Create Period */}
			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="sm:max-w-md">
					<DialogTitle>Buat Periode Payroll Baru</DialogTitle>
					<DialogDescription>Tambahkan periode payroll baru untuk menghitung gaji karyawan.</DialogDescription>
					<div className="space-y-4 pt-2">
						<div className="space-y-2">
							<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
								Nama Periode
							</label>
							<Input
								className="h-11 bg-muted/50 font-medium"
								placeholder="Contoh: Januari 2026"
								value={newPeriod.period_name}
								onChange={(e) => setNewPeriod({ ...newPeriod, period_name: e.target.value })}
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Tanggal Mulai
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="date"
									value={newPeriod.start_date}
									onChange={(e) => setNewPeriod({ ...newPeriod, start_date: e.target.value })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Tanggal Selesai
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="date"
									value={newPeriod.end_date}
									onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })}
								/>
							</div>
						</div>
						<div className="flex justify-end gap-2 pt-2">
							<Button variant="outline" onClick={() => setShowCreate(false)}>
								Batal
							</Button>
							<Button onClick={handleCreatePeriod}>Buat Periode</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
