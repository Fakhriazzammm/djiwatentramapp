import { Check, Loader2, Minus, Plus, Scissors, X } from "lucide-react";
import { useState } from "react";
import type { ScanEditParams } from "./scan-edit-modal";

interface SplitRow {
	id: string;
	amount: number;
	category: string;
	description: string;
}

interface Props {
	isOpen?: boolean;
	totalAmount?: number;
	transactionType?: "income" | "expense";
	baseParams?: ScanEditParams;
	params?: ScanEditParams;
	onSave: (splits: ScanEditParams[]) => Promise<void>;
	onBack?: () => void;
	onClose: () => void;
}

const EXPENSE_CATEGORIES = [
	"Pembelian Stok",
	"Makanan & Minuman",
	"Peralatan Kantor",
	"Transportasi",
	"Utilitas",
	"Gaji Karyawan",
	"Sewa Tempat",
	"Pemasaran",
	"Pajak",
	"Hiburan",
	"Kesehatan",
	"Renovasi",
	"Lainnya",
];

const INCOME_CATEGORIES = [
	"Penjualan",
	"Jasa",
	"Investasi",
	"Pinjaman",
	"Hibah",
	"Lainnya",
];

function formatRp(n: number) {
	return `Rp ${n.toLocaleString("id-ID")}`;
}

let _idCounter = 0;
function genId() {
	return `split-${Date.now()}-${_idCounter++}`;
}

export function ScanSplitModal({
	isOpen,
	totalAmount: propTotal,
	transactionType: propType,
	baseParams: propBase,
	params,
	onSave,
	onBack,
	onClose,
}: Props) {
	const finalBase = params || propBase;
	const totalAmount = finalBase?.amount ?? propTotal ?? 0;
	const transactionType = finalBase?.type ?? propType ?? "expense";

	const categories = transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

	const [rows, setRows] = useState<SplitRow[]>([
		{ id: genId(), amount: Math.round(totalAmount / 2), category: categories[0], description: "" },
		{ id: genId(), amount: totalAmount - Math.round(totalAmount / 2), category: categories[1] ?? categories[0], description: "" },
	]);
	const [isSaving, setIsSaving] = useState(false);

	if (isOpen === false) return null;

	const allocatedTotal = rows.reduce((s, r) => s + (r.amount || 0), 0);
	const remaining = totalAmount - allocatedTotal;
	const isValid = Math.abs(remaining) < 1 && rows.every((r) => r.amount > 0 && r.category);

	const updateRow = (id: string, field: keyof SplitRow, value: string | number) => {
		setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
	};

	const addRow = () => {
		setRows((prev) => [
			...prev,
			{ id: genId(), amount: Math.max(0, remaining), category: categories[0], description: "" },
		]);
	};

	const removeRow = (id: string) => {
		if (rows.length <= 2) return;
		setRows((prev) => prev.filter((r) => r.id !== id));
	};

	const handleSave = async () => {
		if (!isValid || !finalBase) return;
		setIsSaving(true);
		try {
			const splits: ScanEditParams[] = rows.map((r) => ({
				...finalBase,
				amount: r.amount,
				category: r.category,
				description: r.description || finalBase.description,
			}));
			await onSave(splits);
		} finally {
			setIsSaving(false);
		}
	};

	const remainingColor =
		Math.abs(remaining) < 1
			? "text-emerald-600"
			: remaining > 0
			? "text-orange-500"
			: "text-red-600";

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
			<div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
			<div className="relative z-50 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<Scissors className="h-4 w-4 text-orange-500" />
						<span className="font-bold text-sm">Split Transaksi</span>
					</div>
					<button
						className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
						onClick={onClose}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Total bar */}
				<div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
					<div className="text-xs text-muted-foreground">
						Total struk: <span className="font-bold text-foreground">{formatRp(totalAmount)}</span>
					</div>
					<div className={`text-xs font-bold ${remainingColor}`}>
						{Math.abs(remaining) < 1
							? "✓ Terbagi rata"
							: remaining > 0
							? `Sisa: ${formatRp(remaining)}`
							: `Kelebihan: ${formatRp(-remaining)}`}
					</div>
				</div>

				{/* Split rows */}
				<div className="max-h-[55vh] overflow-y-auto p-3 space-y-2">
					{rows.map((row, idx) => (
						<div
							key={row.id}
							className="rounded-xl border border-border bg-muted/20 p-3 space-y-2"
						>
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
									Bagian {idx + 1}
								</span>
								{rows.length > 2 && (
									<button
										type="button"
										onClick={() => removeRow(row.id)}
										className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
									>
										<Minus className="h-3 w-3" />
									</button>
								)}
							</div>

							{/* Amount */}
							<div className="flex items-center gap-2">
								<span className="shrink-0 text-xs text-muted-foreground">Rp</span>
								<input
									type="number"
									className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary transition-colors"
									value={row.amount || ""}
									onChange={(e) => updateRow(row.id, "amount", Number(e.target.value))}
									min={0}
									placeholder="0"
								/>
							</div>

							{/* Category */}
							<select
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
								value={row.category}
								onChange={(e) => updateRow(row.id, "category", e.target.value)}
							>
								{categories.map((c) => (
									<option key={c} value={c}>{c}</option>
								))}
							</select>

							{/* Description */}
							<input
								type="text"
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary transition-colors"
								value={row.description}
								onChange={(e) => updateRow(row.id, "description", e.target.value)}
								placeholder="Keterangan (opsional)"
							/>
						</div>
					))}

					{/* Add row button */}
					<button
						type="button"
						onClick={addRow}
						className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
					>
						<Plus className="h-3.5 w-3.5" />
						Tambah Bagian
					</button>
				</div>

				{/* Footer */}
				<div className="flex gap-2 border-t border-border p-3">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
					>
						Kembali
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={isSaving || !isValid}
						className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-600 disabled:opacity-60"
					>
						{isSaving ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Check className="h-4 w-4" />
						)}
						{isSaving ? "Menyimpan..." : `Simpan ${rows.length} Transaksi`}
					</button>
				</div>
			</div>
		</div>
	);
}
