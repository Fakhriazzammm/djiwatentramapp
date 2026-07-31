import { Check, Edit3, Loader2, Scissors, TrendingDown, TrendingUp, X } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export interface ScanEditParams {
	type: "income" | "expense";
	amount: number;
	category: string;
	merchant?: string;
	description?: string;
	date: number;
	paymentMethod?: string;
	status: "completed";
	syncMode?: "auto" | "finance_only" | "finance_plus_inventory";
}

interface Props {
	isOpen?: boolean;
	params: ScanEditParams;
	allowSplit?: boolean;
	onSave: (params: ScanEditParams) => Promise<void>;
	onSplit: (params: ScanEditParams) => void;
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

const PAYMENT_METHODS = ["cash", "qris", "card", "transfer"];

export function ScanEditModal({ isOpen, params, allowSplit = true, onSave, onSplit, onClose }: Props) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const [isSaving, setIsSaving] = useState(false);
	const [form, setForm] = useState<ScanEditParams>(params);

	useEffect(() => {
		setForm({
			...params,
			syncMode:
				params.syncMode ||
				(params.type === "expense" ? "finance_only" : "auto"),
		});
	}, [params]);

	if (isOpen === false) return null;

	const categories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
	const canSyncInventory = form.type === "expense";

	const handleSave = async () => {
		if (!form.amount || form.amount <= 0) return;
		setIsSaving(true);
		try {
			await onSave(form);
		} finally {
			setIsSaving(false);
		}
	};

	const dateStr = form.date
		? new Date(form.date).toISOString().slice(0, 10)
		: new Date().toISOString().slice(0, 10);

	const modalContent = (
		<div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center p-4">
			<div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
			<div className="relative z-[1001] w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<Edit3 className="h-4 w-4 text-primary" />
						<span className="font-bold text-sm">Edit & Validasi Transaksi</span>
					</div>
					<button
						className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
						onClick={onClose}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Form */}
				<div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
					{/* Type toggle */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Jenis Transaksi
						</label>
						<div className="grid grid-cols-2 gap-2">
							{(["expense", "income"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setForm((f) => ({ ...f, type: t }))}
									className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
										form.type === t
											? t === "expense"
												? "border-red-400 bg-red-500/10 text-red-600"
												: "border-emerald-400 bg-emerald-500/10 text-emerald-600"
											: "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
									}`}
								>
									<span className="flex items-center justify-center gap-1.5">
										{t === "expense" ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
										{t === "expense" ? "Pengeluaran" : "Pemasukan"}
									</span>
								</button>
							))}
						</div>
					</div>

					{/* Amount */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Jumlah (Rp)
						</label>
						<input
							type="number"
							className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:bg-background transition-colors"
							value={form.amount || ""}
							onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
							min={0}
							placeholder="0"
						/>
					</div>

					{/* Category */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Kategori
						</label>
						<select
							className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-background transition-colors"
							value={form.category}
							onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
						>
							{categories.map((c) => (
								<option key={c} value={c}>{c}</option>
							))}
						</select>
					</div>

					{/* Merchant */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Merchant / Sumber
						</label>
						<input
							type="text"
							className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-background transition-colors"
							value={form.merchant || ""}
							onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))}
							placeholder="Nama toko / sumber"
						/>
					</div>

					{/* Description */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Keterangan
						</label>
						<textarea
							className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-background transition-colors resize-none"
							value={form.description || ""}
							onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							placeholder="Keterangan opsional"
							rows={2}
						/>
					</div>

					{/* Date */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Tanggal
						</label>
						<input
							type="date"
							className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-background transition-colors"
							value={dateStr}
							onChange={(e) => {
								const d = new Date(e.target.value).getTime();
								if (!Number.isNaN(d)) setForm((f) => ({ ...f, date: d }));
							}}
						/>
					</div>

					{/* Payment Method */}
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
							Metode Pembayaran
						</label>
						<div className="grid grid-cols-4 gap-1.5">
							{PAYMENT_METHODS.map((pm) => (
								<button
									key={pm}
									type="button"
									onClick={() => setForm((f) => ({ ...f, paymentMethod: pm }))}
									className={`rounded-xl border py-1.5 text-[11px] font-semibold transition-all capitalize ${
										form.paymentMethod === pm
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
									}`}
								>
									{pm === "cash" ? "Tunai" : pm === "card" ? "Kartu" : pm.toUpperCase()}
								</button>
							))}
						</div>
					</div>

					{canSyncInventory && (
						<div>
							<label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
								Tujuan Simpan
							</label>
							<div className="grid grid-cols-1 gap-2">
								<button
									type="button"
									onClick={() =>
										setForm((f) => ({
											...f,
											syncMode: "finance_only",
										}))
									}
									className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
										(form.syncMode || "finance_only") === "finance_only"
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-muted/30 text-muted-foreground"
									}`}
								>
									<p className="font-semibold">Simpan ke Keuangan saja</p>
									<p className="mt-1 text-[11px]">Masuk transaksi keuangan tanpa update stok inventaris.</p>
								</button>
								<button
									type="button"
									onClick={() =>
										setForm((f) => ({
											...f,
											syncMode: "finance_plus_inventory",
										}))
									}
									className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
										form.syncMode === "finance_plus_inventory"
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-muted/30 text-muted-foreground"
									}`}
								>
									<p className="font-semibold">Simpan ke Keuangan + Inventaris</p>
									<p className="mt-1 text-[11px]">Transaksi keuangan tersimpan dan item struk sinkron per baris ke stok.</p>
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex gap-2 border-t border-border p-3">
					{allowSplit && (
						<button
							type="button"
							onClick={() => onSplit(form)}
							className="flex items-center gap-1.5 rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-2.5 text-xs font-semibold text-orange-600 transition-all hover:bg-orange-500/20"
						>
							<Scissors className="h-3.5 w-3.5" />
							Split
						</button>
					)}
					<button
						type="button"
						onClick={handleSave}
						disabled={isSaving || !form.amount || form.amount <= 0}
						className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
					>
						{isSaving ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Check className="h-4 w-4" />
						)}
						{isSaving ? "Menyimpan..." : "Simpan Transaksi"}
					</button>
				</div>
			</div>
		</div>
	);

	if (!isOpen || !mounted) return null;

	return createPortal(modalContent, document.body);
}
