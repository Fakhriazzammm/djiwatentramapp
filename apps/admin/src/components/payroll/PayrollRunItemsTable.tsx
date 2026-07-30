import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useHybridPayrollRunItems,
	executePayrollSql,
} from "@/hooks/use-hybrid-payroll-data";

const fmtCurrency = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(n || 0);

interface PayrollRunItemsTableProps {
	runId: string;
}

export default function PayrollRunItemsTable({ runId }: PayrollRunItemsTableProps) {
	const itemsData = useHybridPayrollRunItems(runId);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const [editingAdjustment, setEditingAdjustment] = useState<Record<string, { amount: number; note: string }>>({});
	const [saving, setSaving] = useState<string | null>(null);

	const items = (itemsData?.data ?? itemsData) as any[] | null;

	const toggleRow = (id: string) => {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleSaveAdjustment = async (itemId: string) => {
		const adj = editingAdjustment[itemId];
		if (!adj) return;
		setSaving(itemId);
		try {
			await executePayrollSql(`
				UPDATE pos.payroll_run_items
				SET manual_adjustment = ${adj.amount},
				    adjustment_note = '${(adj.note ?? "").replace(/'/g, "''")}',
				    updated_at = now()
				WHERE id = '${itemId}';
			`);
			toast.success("Penyesuaian disimpan");
			setEditingAdjustment((prev) => {
				const next = { ...prev };
				delete next[itemId];
				return next;
			});
		} catch (err: any) {
			toast.error("Gagal menyimpan: " + (err?.message ?? "Unknown error"));
		} finally {
			setSaving(null);
		}
	};

	const startEditing = (item: any) => {
		setEditingAdjustment((prev) => ({
			...prev,
			[item.id]: {
				amount: item.manual_adjustment ?? 0,
				note: item.adjustment_note ?? "",
			},
		}));
	};

	return (
		<div className="space-y-2">
			<h5 className="font-bold text-xs text-foreground uppercase tracking-wider px-1">
				Detail Item Run
			</h5>
			<div className="overflow-hidden rounded-lg border border-border bg-background">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs">
						<thead className="bg-muted/50 font-bold text-muted-foreground text-[11px] uppercase tracking-widest border-b border-border">
							<tr>
								<th className="px-3 py-2.5 w-6"></th>
								<th className="px-3 py-2.5">Staff</th>
								<th className="px-3 py-2.5">Role</th>
								<th className="px-3 py-2.5 text-right">Hari Kerja</th>
								<th className="px-3 py-2.5 text-right">Gaji Tetap</th>
								<th className="px-3 py-2.5 text-right">Tunjangan</th>
								<th className="px-3 py-2.5 text-right">Bonus</th>
								<th className="px-3 py-2.5 text-right">Denda</th>
								<th className="px-3 py-2.5 text-right">Penyesuaian</th>
								<th className="px-3 py-2.5 text-right font-bold">Total</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{!items ? (
								Array.from({ length: 3 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={10} className="px-3 py-3">
											<Skeleton className="h-5 w-full" />
										</td>
									</tr>
								))
							) : items.length === 0 ? (
								<tr>
									<td colSpan={10} className="py-8 text-center text-muted-foreground text-xs">
										Tidak ada item untuk run ini.
									</td>
								</tr>
							) : (
								items.map((item: any) => {
									const isExpanded = expandedRows.has(item.id);
									const isEditing = editingAdjustment[item.id] !== undefined;
									const breakdown = item.compensation_breakdown ?? {};
									const adjustment = editingAdjustment[item.id] ?? {
										amount: item.manual_adjustment ?? 0,
										note: item.adjustment_note ?? "",
									};

									return (
										<>
											<tr key={item.id} className="transition-colors hover:bg-muted/20">
												<td className="px-3 py-2">
													<button
														onClick={() => toggleRow(item.id)}
														className="text-muted-foreground hover:text-foreground transition-colors"
														type="button"
													>
														{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
													</button>
												</td>
												<td className="px-3 py-2">
													<div className="flex items-center gap-2">
														<span className="font-semibold text-foreground">{item.user_name ?? "-"}</span>
														{item.is_final && <Badge variant="success" size="sm">Final</Badge>}
													</div>
												</td>
												<td className="px-3 py-2 text-muted-foreground">
													{item.role_name ?? "-"}
												</td>
												<td className="px-3 py-2 text-right font-mono">
													{item.attendance_days ?? item.total_days_worked ?? 0}
												</td>
												<td className="px-3 py-2 text-right font-mono">
													{fmtCurrency(item.fixed_salary ?? 0)}
												</td>
												<td className="px-3 py-2 text-right font-mono">
													{fmtCurrency(item.daily_allowance_total ?? 0)}
												</td>
												<td className="px-3 py-2 text-right font-mono text-emerald-600">
													{fmtCurrency(item.bonus_pay ?? 0)}
												</td>
												<td className="px-3 py-2 text-right font-mono text-destructive">
													{fmtCurrency(item.deductions ?? 0)}
												</td>
												<td className="px-3 py-2">
													{isEditing ? (
														<div className="flex items-center gap-1">
															<Input
																className="h-6 w-20 rounded px-1.5 text-[10px] font-mono text-right"
																type="number"
																value={adjustment.amount}
																onChange={(e) =>
																	setEditingAdjustment((prev) => ({
																		...prev,
																		[item.id]: { ...prev[item.id], amount: Number(e.target.value) },
																	}))
																}
															/>
															<Button
																size="icon"
																variant="ghost"
																className="h-6 w-6"
																onClick={() => handleSaveAdjustment(item.id)}
																disabled={saving === item.id}
															>
																{saving === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
															</Button>
														</div>
													) : (
														<button
															className="font-mono text-right w-full hover:text-primary transition-colors cursor-pointer"
															onClick={() => startEditing(item)}
															type="button"
															title="Klik untuk edit penyesuaian"
														>
															{fmtCurrency(item.manual_adjustment ?? 0)}
														</button>
													)}
												</td>
												<td className="px-3 py-2 text-right font-mono font-bold">
													{fmtCurrency(item.net_pay ?? 0)}
												</td>
											</tr>
											{isExpanded && (
												<tr key={`${item.id}-detail`} className="bg-muted/10">
													<td colSpan={10} className="px-6 py-3">
														<div className="grid grid-cols-2 gap-4 md:grid-cols-3 text-[11px]">
															<div>
																<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest mb-1">
																	Kehadiran
																</p>
																<div className="space-y-0.5 text-muted-foreground">
																	<p>Shift: {item.total_shifts ?? breakdown.shifts ?? 0}</p>
																	<p>Jam: {item.total_hours ?? 0}</p>
																	<p>Lembur: {item.overtime_hours ?? 0} jam</p>
																</div>
															</div>
															<div>
																<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest mb-1">
																	Komponen Gaji
																</p>
																<div className="space-y-0.5 text-muted-foreground">
																	<p>Shift Pay: {fmtCurrency(item.shift_pay ?? 0)}</p>
																	<p>Gaji Tetap: {fmtCurrency(item.fixed_salary ?? 0)}</p>
																	<p>Tunjangan: {fmtCurrency(item.daily_allowance_total ?? 0)}</p>
																	<p>Lembur: {fmtCurrency(item.overtime_pay ?? 0)}</p>
																</div>
															</div>
															<div>
																<p className="font-bold text-muted-foreground text-[11px] uppercase tracking-widest mb-1">
																	Catatan Penyesuaian
																</p>
																<p className="text-muted-foreground">
																	{isEditing ? (
																		<Input
																			className="h-6 w-full rounded px-1.5 text-[10px]"
																			placeholder="Tambah catatan..."
																			value={adjustment.note}
																			onChange={(e) =>
																				setEditingAdjustment((prev) => ({
																					...prev,
																					[item.id]: { ...prev[item.id], note: e.target.value },
																				}))
																			}
																		/>
																	) : (
																		item.adjustment_note ?? "Tidak ada catatan"
																	)}
																</p>
															</div>
														</div>
													</td>
												</tr>
											)}
										</>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
