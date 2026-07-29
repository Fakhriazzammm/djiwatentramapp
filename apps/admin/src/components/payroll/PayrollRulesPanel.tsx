import { useState } from "react";
import { toast } from "sonner";
import {
	Settings2,
	Plus,
	Pencil,
	Save,
	X,
	Users,
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
	useHybridPayrollRoleRules,
	useHybridPayrollUserOverrides,
	executePayrollSql,
} from "@/hooks/use-hybrid-payroll-data";

const fmtCurrency = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(n || 0);

export default function PayrollRulesPanel() {
	const rulesData = useHybridPayrollRoleRules();
	const overridesData = useHybridPayrollUserOverrides();

	const rules = (rulesData?.data ?? rulesData) as any[] | null;
	const overrides = (overridesData?.data ?? overridesData) as any[] | null;

	const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<Record<string, any>>({});
	const [saving, setSaving] = useState<string | null>(null);
	const [showCreate, setShowCreate] = useState(false);
	const [newRule, setNewRule] = useState({
		role_name: "",
		source_role_id: "",
		base_salary: 0,
		base_shift_rate: 0,
		overtime_rate_per_hour: 0,
		late_penalty_per_minute: 0,
		daily_allowance: 0,
		monthly_fixed_salary: 0,
	});

	const overrideCounts: Record<string, number> = {};
	(overrides ?? []).forEach((o: any) => {
		const ruleId = o.role_rule_id ?? o.source_role_id;
		if (ruleId) overrideCounts[ruleId] = (overrideCounts[ruleId] ?? 0) + 1;
	});

	const startEditing = (rule: any) => {
		setEditingRuleId(rule.id);
		setEditForm({
			role_name: rule.role_name ?? "",
			source_role_id: rule.source_role_id ?? "",
			base_salary: rule.base_salary ?? 0,
			base_shift_rate: rule.base_shift_rate ?? 0,
			overtime_rate_per_hour: rule.overtime_rate_per_hour ?? 0,
			late_penalty_per_minute: rule.late_penalty_per_minute ?? 0,
			daily_allowance: rule.daily_allowance ?? 0,
			monthly_fixed_salary: rule.monthly_fixed_salary ?? 0,
		});
	};

	const handleSave = async (ruleId: string) => {
		setSaving(ruleId);
		try {
			await executePayrollSql(`
				UPDATE pos.payroll_role_rules SET
					role_name = '${editForm.role_name.replace(/'/g, "''")}',
					base_salary = ${editForm.base_salary},
					base_shift_rate = ${editForm.base_shift_rate},
					overtime_rate_per_hour = ${editForm.overtime_rate_per_hour},
					late_penalty_per_minute = ${editForm.late_penalty_per_minute},
					daily_allowance = ${editForm.daily_allowance},
					monthly_fixed_salary = ${editForm.monthly_fixed_salary},
					updated_at = now()
				WHERE id = '${ruleId}';
			`);
			toast.success("Rule berhasil diperbarui");
			setEditingRuleId(null);
		} catch (err: any) {
			toast.error("Gagal menyimpan: " + (err?.message ?? "Unknown error"));
		} finally {
			setSaving(null);
		}
	};

	const handleCreateRule = async () => {
		if (!newRule.role_name) {
			toast.error("Nama role wajib diisi");
			return;
		}
		try {
			await executePayrollSql(`
				INSERT INTO pos.payroll_role_rules (
					role_name, source_role_id, base_salary, base_shift_rate,
					overtime_rate_per_hour, late_penalty_per_minute,
					daily_allowance, monthly_fixed_salary, effective_from
				) VALUES (
					'${newRule.role_name.replace(/'/g, "''")}',
					${newRule.source_role_id ? `'${newRule.source_role_id}'` : "NULL"},
					${newRule.base_salary},
					${newRule.base_shift_rate},
					${newRule.overtime_rate_per_hour},
					${newRule.late_penalty_per_minute},
					${newRule.daily_allowance},
					${newRule.monthly_fixed_salary},
					CURRENT_DATE
				);
			`);
			toast.success("Rule baru berhasil ditambahkan");
			setShowCreate(false);
			setNewRule({
				role_name: "",
				source_role_id: "",
				base_salary: 0,
				base_shift_rate: 0,
				overtime_rate_per_hour: 0,
				late_penalty_per_minute: 0,
				daily_allowance: 0,
				monthly_fixed_salary: 0,
			});
		} catch (err: any) {
			toast.error("Gagal membuat rule: " + (err?.message ?? "Unknown error"));
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
					Aturan Payroll per Role
				</h4>
				<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate(true)}>
					<Plus className="h-3.5 w-3.5" />
					Tambah Rule
				</Button>
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
							<tr>
								<th className="px-4 py-3">Role</th>
								<th className="px-4 py-3 text-right">Gaji Dasar</th>
								<th className="px-4 py-3 text-right">Gaji/Shift</th>
								<th className="px-4 py-3 text-right">Gaji Tetap</th>
								<th className="px-4 py-3 text-right">Tunjangan/Hari</th>
								<th className="px-4 py-3 text-right">Lembur/Jam</th>
								<th className="px-4 py-3 text-right">Denda/Menit</th>
								<th className="px-4 py-3 text-center">Override</th>
								<th className="px-4 py-3 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/50">
							{!rules ? (
								Array.from({ length: 3 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={9} className="px-4 py-4">
											<Skeleton className="h-6 w-full" />
										</td>
									</tr>
								))
							) : rules.length === 0 ? (
								<tr>
									<td colSpan={9} className="py-12 text-center text-muted-foreground text-sm">
										<div className="flex flex-col items-center gap-2">
											<Settings2 className="h-8 w-8 text-muted-foreground/30" />
											<span>Belum ada rule payroll</span>
										</div>
									</td>
								</tr>
							) : (
								rules.map((rule: any) => {
									const isEditing = editingRuleId === rule.id;
									const data = isEditing ? editForm : rule;
									const overrideCount = overrideCounts[rule.id] ?? 0;

									return (
										<tr
											key={rule.id}
											className={`transition-colors ${isEditing ? "bg-primary/5" : "hover:bg-muted/30"}`}
										>
											<td className="px-4 py-3">
												{isEditing ? (
													<Input
														className="h-7 w-32 text-xs"
														value={data.role_name}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, role_name: e.target.value }))
														}
													/>
												) : (
													<span className="font-semibold text-xs text-foreground">{rule.role_name}</span>
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-24 text-right text-xs"
														type="number"
														value={data.base_salary}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, base_salary: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.base_salary ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-24 text-right text-xs"
														type="number"
														value={data.base_shift_rate}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, base_shift_rate: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.base_shift_rate ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-28 text-right text-xs"
														type="number"
														value={data.monthly_fixed_salary}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, monthly_fixed_salary: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.monthly_fixed_salary ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-24 text-right text-xs"
														type="number"
														value={data.daily_allowance}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, daily_allowance: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.daily_allowance ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-24 text-right text-xs"
														type="number"
														value={data.overtime_rate_per_hour}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, overtime_rate_per_hour: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.overtime_rate_per_hour ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-xs">
												{isEditing ? (
													<Input
														className="ml-auto h-7 w-24 text-right text-xs"
														type="number"
														value={data.late_penalty_per_minute}
														onChange={(e) =>
															setEditForm((prev: any) => ({ ...prev, late_penalty_per_minute: Number(e.target.value) }))
														}
													/>
												) : (
													fmtCurrency(rule.late_penalty_per_minute ?? 0)
												)}
											</td>
											<td className="px-4 py-3 text-center">
												{overrideCount > 0 && (
													<Badge variant="info" size="sm" className="gap-1">
														<Users className="h-2.5 w-2.5" />
														{overrideCount}
													</Badge>
												)}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-end gap-1">
													{isEditing ? (
														<>
															<Button
																size="sm"
																variant="ghost"
																className="h-7 gap-1 px-2 text-[10px]"
																onClick={() => setEditingRuleId(null)}
															>
																<X className="h-3 w-3" />
																Batal
															</Button>
															<Button
																size="sm"
																variant="ghost"
																className="h-7 gap-1 px-2 text-[10px] text-emerald-600"
																onClick={() => handleSave(rule.id)}
																disabled={saving === rule.id}
															>
																<Save className="h-3 w-3" />
																Simpan
															</Button>
														</>
													) : (
														<Button
															size="sm"
															variant="ghost"
															className="h-7 gap-1 px-2 text-[10px]"
															onClick={() => startEditing(rule)}
														>
															<Pencil className="h-3 w-3" />
															Edit
														</Button>
													)}
												</div>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Dialog Create Rule */}
			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="sm:max-w-lg">
					<DialogTitle>Tambah Rule Payroll Baru</DialogTitle>
					<DialogDescription>Definisikan aturan kompensasi untuk role tertentu.</DialogDescription>
					<div className="space-y-4 pt-2">
						<div className="space-y-2">
							<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
								Nama Role
							</label>
							<Input
								className="h-11 bg-muted/50"
								placeholder="Contoh: Barista Senior"
								value={newRule.role_name}
								onChange={(e) => setNewRule({ ...newRule, role_name: e.target.value })}
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Gaji Dasar (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.base_salary || ""}
									onChange={(e) => setNewRule({ ...newRule, base_salary: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Gaji/Shift (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.base_shift_rate || ""}
									onChange={(e) => setNewRule({ ...newRule, base_shift_rate: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Gaji Tetap/Bulan (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.monthly_fixed_salary || ""}
									onChange={(e) => setNewRule({ ...newRule, monthly_fixed_salary: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Tunjangan/Hari (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.daily_allowance || ""}
									onChange={(e) => setNewRule({ ...newRule, daily_allowance: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Lembur/Jam (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.overtime_rate_per_hour || ""}
									onChange={(e) => setNewRule({ ...newRule, overtime_rate_per_hour: Number(e.target.value) })}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
									Denda/Menit (Rp)
								</label>
								<Input
									className="h-11 bg-muted/50"
									type="number"
									value={newRule.late_penalty_per_minute || ""}
									onChange={(e) => setNewRule({ ...newRule, late_penalty_per_minute: Number(e.target.value) })}
								/>
							</div>
						</div>
						<div className="flex justify-end gap-2 pt-2">
							<Button variant="outline" onClick={() => setShowCreate(false)}>
								Batal
							</Button>
							<Button onClick={handleCreateRule}>Tambah Rule</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
