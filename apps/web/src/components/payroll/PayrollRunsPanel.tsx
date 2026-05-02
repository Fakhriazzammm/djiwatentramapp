import { useState } from "react";
import { toast } from "sonner";
import {
	Play,
	CheckCircle,
	Send,
	Banknote,
	ChevronRight,
	Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useHybridPayrollRuns,
	approvePayrollRun,
	generatePayslipsForRun,
	executePayrollSql,
} from "@/hooks/use-hybrid-payroll-data";
import PayrollRunItemsTable from "./PayrollRunItemsTable";

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
		processing: { variant: "info", label: "Processing" },
		completed: { variant: "success", label: "Completed" },
		approved: { variant: "success", label: "Approved" },
		paid: { variant: "default", label: "Paid" },
		reversed: { variant: "destructive", label: "Reversed" },
	};
	const s = map[status] ?? { variant: "secondary" as const, label: status };
	return <Badge variant={s.variant} size="sm">{s.label}</Badge>;
}

interface PayrollRunsPanelProps {
	periodId?: string;
}

export default function PayrollRunsPanel({ periodId }: PayrollRunsPanelProps) {
	const runsData = useHybridPayrollRuns(periodId);
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
	const [actioningRunId, setActioningRunId] = useState<string | null>(null);

	const runs = (runsData?.data ?? runsData) as any[] | null;

	const handleApprove = async (runId: string) => {
		setActioningRunId(runId);
		try {
			await approvePayrollRun({ runId });
			toast.success("Payroll run berhasil di-approve");
		} catch (err: any) {
			toast.error("Gagal approve: " + (err?.message ?? "Unknown error"));
		} finally {
			setActioningRunId(null);
		}
	};

	const handleIssuePayslips = async (runId: string) => {
		setActioningRunId(runId);
		try {
			await generatePayslipsForRun({ runId });
			toast.success("Payslips berhasil di-generate");
		} catch (err: any) {
			toast.error("Gagal generate payslips: " + (err?.message ?? "Unknown error"));
		} finally {
			setActioningRunId(null);
		}
	};

	const handleMarkPaid = async (runId: string) => {
		setActioningRunId(runId);
		try {
			await executePayrollSql(`
				UPDATE pos.payroll_runs SET status = 'paid', updated_at = now()
				WHERE id = '${runId}';
			`);
			toast.success("Run ditandai sudah dibayar");
		} catch (err: any) {
			toast.error("Gagal update: " + (err?.message ?? "Unknown error"));
		} finally {
			setActioningRunId(null);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
					Payroll Runs
				</h4>
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
							<tr>
								<th className="px-4 py-3">Run #</th>
								<th className="px-4 py-3">Tanggal</th>
								<th className="px-4 py-3 text-center">Status</th>
								<th className="px-4 py-3 text-right">Karyawan</th>
								<th className="px-4 py-3 text-right">Gross</th>
								<th className="px-4 py-3 text-right">Net</th>
								<th className="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{!runs ? (
								Array.from({ length: 3 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={7} className="px-4 py-4">
											<Skeleton className="h-6 w-full" />
										</td>
									</tr>
								))
							) : runs.length === 0 ? (
								<tr>
									<td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
										Belum ada payroll run untuk periode ini.
									</td>
								</tr>
							) : (
								runs.map((run: any) => (
									<>
										<tr key={run.id} className="transition-colors hover:bg-muted/30">
											<td className="px-4 py-3">
												<span className="font-semibold text-xs text-foreground">
													{run.run_number ?? run.run_name ?? run.id.slice(0, 8)}
												</span>
											</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{fmtDate(run.run_date ?? run.created_at)}
											</td>
											<td className="px-4 py-3 text-center">
												{statusBadge(run.status ?? "processing")}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{run.total_employees ?? 0}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{fmtCurrency(run.total_gross_pay ?? run.total_gross ?? 0)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs font-semibold">
												{fmtCurrency(run.total_net_pay ?? run.total_net ?? 0)}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-end gap-1">
													<Button
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2 text-[10px]"
														onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
													>
														<ChevronRight className={`h-3 w-3 transition-transform ${expandedRunId === run.id ? "rotate-90" : ""}`} />
														Detail
													</Button>
													{(run.status === "completed" || run.status === "processing") && (
														<Button
															size="sm"
															variant="ghost"
															className="h-7 gap-1 px-2 text-[10px] text-emerald-600 hover:text-emerald-700"
															onClick={() => handleApprove(run.id)}
															disabled={actioningRunId === run.id}
														>
															{actioningRunId === run.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
															Approve
														</Button>
													)}
													{(run.status === "approved" || run.status === "completed") && (
														<Button
															size="sm"
															variant="ghost"
															className="h-7 gap-1 px-2 text-[10px] text-blue-600 hover:text-blue-700"
															onClick={() => handleIssuePayslips(run.id)}
															disabled={actioningRunId === run.id}
														>
															<Send className="h-3 w-3" />
															Issue Payslips
														</Button>
													)}
													{run.status === "approved" && (
														<Button
															size="sm"
															variant="ghost"
															className="h-7 gap-1 px-2 text-[10px] text-primary hover:text-primary/80"
															onClick={() => handleMarkPaid(run.id)}
															disabled={actioningRunId === run.id}
														>
															<Banknote className="h-3 w-3" />
															Mark Paid
														</Button>
													)}
												</div>
											</td>
										</tr>
										{expandedRunId === run.id && (
											<tr key={`${run.id}-items`}>
												<td colSpan={7} className="bg-muted/20 px-4 py-4">
													<PayrollRunItemsTable runId={run.id} />
												</td>
											</tr>
										)}
									</>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
