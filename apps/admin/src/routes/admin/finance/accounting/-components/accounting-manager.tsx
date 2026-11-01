import { createElement, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Banknote,
	BookOpen,
	CircleDollarSign,
	CreditCard,
	Landmark,
	TrendingDown,
	Plus,
	Pencil,
	Trash2,
	Search,
	ChevronLeft,
} from "lucide-react";

interface COAAccount {
	id: string;
	code: string;
	name: string;
	type: "asset" | "liability" | "equity" | "revenue" | "expense";
	is_active: boolean;
	description?: string;
	parent_id?: string | null;
	balance_debit?: number;
	balance_kredit?: number;
}

const ACCOUNT_TYPES = [
	{ value: "asset", label: "Aset", icon: Banknote },
	{ value: "liability", label: "Kewajiban", icon: CreditCard },
	{ value: "equity", label: "Modal", icon: Landmark },
	{ value: "revenue", label: "Pendapatan", icon: CircleDollarSign },
	{ value: "expense", label: "Beban", icon: TrendingDown },
] as const;

const supabase = createClient();

export function AccountingManager() {
	const navigate = useNavigate();
	const [accounts, setAccounts] = useState<COAAccount[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [editingAccount, setEditingAccount] = useState<COAAccount | null>(null);
	const [showDialog, setShowDialog] = useState(false);
	const [formData, setFormData] = useState({
		code: "",
		name: "",
		type: "expense" as string,
		description: "",
		is_active: true,
	});
	const [saving, setSaving] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

	useEffect(() => {
		loadAccounts();
	}, []);

	async function loadAccounts() {
		setLoading(true);
		try {
			const { data, error } = await supabase
				.from("accounting_chart_of_accounts")
				.select("*")
				.order("code", { ascending: true });

			if (error) throw error;
			setAccounts((data || []) as COAAccount[]);
		} catch (e: unknown) {
			const err = e as { message?: string };
			console.error("Failed to load accounts:", err);
		} finally {
			setLoading(false);
		}
	}

	async function loadAccountBalances() {
		try {
			const { data: entries, error } = await supabase
				.from("accounting_entries")
				.select("coa_id, entry_type, amount");

			if (error) throw error;

			const balanceMap: Record<string, { debit: number; kredit: number }> = {};
			for (const e of entries || []) {
				if (!balanceMap[e.coa_id]) {
					balanceMap[e.coa_id] = { debit: 0, kredit: 0 };
				}
				if (e.entry_type === "debit") {
					balanceMap[e.coa_id].debit += Number(e.amount || 0);
				} else {
					balanceMap[e.coa_id].kredit += Number(e.amount || 0);
				}
			}

			setAccounts((prev) =>
				prev.map((a) => ({
					...a,
					balance_debit: balanceMap[a.id]?.debit || 0,
					balance_kredit: balanceMap[a.id]?.kredit || 0,
				}))
			);
		} catch (e: unknown) {
			const err = e as { message?: string };
			console.error("Failed to load balances:", err);
		}
	}

	useEffect(() => {
		if (!loading && accounts.length > 0) {
			loadAccountBalances();
		}
	}, [loading]);

	function getBalance(acct: COAAccount): number {
		const debit = acct.balance_debit || 0;
		const kredit = acct.balance_kredit || 0;
		if (acct.type === "asset" || acct.type === "expense") {
			return debit - kredit;
		}
		return kredit - debit;
	}

	async function handleSave() {
		if (!formData.code.trim() || !formData.name.trim()) return;
		setSaving(true);
		try {
			if (editingAccount) {
				const { error } = await supabase
					.from("accounting_chart_of_accounts")
					.update({
						code: formData.code.trim(),
						name: formData.name.trim(),
						type: formData.type,
						description: formData.description.trim() || null,
						is_active: formData.is_active,
					})
					.eq("id", editingAccount.id);
				if (error) throw error;
			} else {
				const { error } = await supabase
					.from("accounting_chart_of_accounts")
					.insert({
						code: formData.code.trim(),
						name: formData.name.trim(),
						type: formData.type,
						description: formData.description.trim() || null,
						is_active: true,
					});
				if (error) throw error;
			}
			setShowDialog(false);
			setEditingAccount(null);
			resetForm();
			loadAccounts();
		} catch (e: unknown) {
			const err = e as { message?: string };
			console.error("Failed to save account:", err);
			alert(`Gagal menyimpan: ${err.message || "Unknown"}`);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: string) {
		try {
			// Check if account has entries first
			const { count, error: countError } = await supabase
				.from("accounting_entries")
				.select("*", { count: "exact", head: true })
				.eq("coa_id", id);

			if (countError) throw countError;

			if (count && count > 0) {
				const ok = confirm(
					`Akun ini memiliki ${count} entri akuntansi. Nonaktifkan saja? (OK = nonaktifkan, Batal = batalkan)`
				);
				if (!ok) return;
				// Deactivate instead of delete
				const { error } = await supabase
					.from("accounting_chart_of_accounts")
					.update({ is_active: false })
					.eq("id", id);
				if (error) throw error;
			} else {
				const { error } = await supabase
					.from("accounting_chart_of_accounts")
					.delete()
					.eq("id", id);
				if (error) throw error;
			}
			setConfirmDelete(null);
			loadAccounts();
		} catch (e: unknown) {
			const err = e as { message?: string };
			console.error("Failed to delete account:", err);
			alert(`Gagal menghapus: ${err.message || "Unknown"}`);
		}
	}

	function openEdit(acct: COAAccount) {
		setEditingAccount(acct);
		setFormData({
			code: acct.code,
			name: acct.name,
			type: acct.type,
			description: acct.description || "",
			is_active: acct.is_active,
		});
		setShowDialog(true);
	}

	function openCreate() {
		setEditingAccount(null);
		resetForm();
		setShowDialog(true);
	}

	function resetForm() {
		setFormData({
			code: "",
			name: "",
			type: "expense",
			description: "",
			is_active: true,
		});
	}

	const filtered = accounts.filter((a) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return (
			a.code.toLowerCase().includes(q) ||
			a.name.toLowerCase().includes(q)
		);
	});

	const groupedTypes = ACCOUNT_TYPES.map((t) => ({
		...t,
		accounts: filtered.filter((a) => a.type === t.value),
	})).filter((g) => g.accounts.length > 0);

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 border-b px-4 py-3">
				<button
					className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
					onClick={() => navigate({ to: "/admin/finance" })}
					type="button"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<div>
					<h1 className="font-bold text-lg">Chart of Accounts</h1>
					<p className="text-muted-foreground text-xs">
						Kelola akun akuntansi
					</p>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<div className="relative w-48">
						<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="h-8 pl-8 text-xs"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Cari akun..."
							value={searchQuery}
						/>
					</div>
					<Button
						className="h-8 gap-1.5 text-xs"
						onClick={openCreate}
						size="sm"
					>
						<Plus className="h-3.5 w-3.5" />
						Tambah Akun
					</Button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4">
				{loading ? (
					<div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
						Memuat...
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
						<BookOpen className="mb-2 h-8 w-8" />
						<p className="text-sm">
							{searchQuery
								? "Tidak ada akun yang cocok"
								: "Belum ada akun COA"}
						</p>
						{!searchQuery && (
							<Button
								className="mt-3 h-8 text-xs"
								onClick={openCreate}
								size="sm"
								variant="outline"
							>
								<Plus className="mr-1 h-3 w-3" />
								Buat Akun Pertama
							</Button>
						)}
					</div>
				) : (
					<div className="space-y-4">
						{groupedTypes.map((group) => (
							<Card key={group.value}>
								<CardHeader className="py-2.5 px-4">
									<CardTitle className="flex items-center gap-2 text-sm font-medium">
										{createElement(group.icon, { className: "h-4 w-4", "aria-hidden": true })}
										{group.label}
										<Badge className="ml-auto text-[10px]" variant="outline">
											{group.accounts.length}
										</Badge>
									</CardTitle>
								</CardHeader>
								<CardContent className="px-0 pb-0">
									<div className="divide-y">
										{group.accounts.map((acct) => {
											const balance = getBalance(acct);
											const absBalance = Math.abs(balance);
											return (
												<div
													className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 ${
														!acct.is_active ? "opacity-50" : ""
													}`}
													key={acct.id}
												>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
																{acct.code}
															</code>
															<span className="truncate font-medium text-sm">
																{acct.name}
															</span>
															{!acct.is_active && (
																<Badge className="text-[11px]" variant="secondary">
																	Nonaktif
																</Badge>
															)}
														</div>
														{acct.description && (
															<p className="mt-0.5 truncate text-muted-foreground text-[11px]">
																{acct.description}
															</p>
														)}
													</div>
													<div className="shrink-0 text-right">
														<p
															className={`font-medium text-xs ${
																balance >= 0
																	? "text-emerald-600"
																	: "text-red-600"
															}`}
														>
															{balance >= 0 ? "" : "-"}Rp
															{absBalance.toLocaleString("id-ID")}
														</p>
														<p className="text-[10px] text-muted-foreground">
															Debit: {acct.balance_debit?.toLocaleString("id-ID") || "0"}{" "}
															Kredit: {acct.balance_kredit?.toLocaleString("id-ID") || "0"}
														</p>
													</div>
													<div className="flex shrink-0 gap-0.5">
														<button
															className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
															onClick={() => openEdit(acct)}
															aria-label="Edit akun"
								title="Edit"
															type="button"
														>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														<button
															className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
															onClick={() => setConfirmDelete(acct.id)}
															aria-label="Hapus akun"
								title="Hapus"
															type="button"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</div>
												</div>
											);
										})}
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* Dialog Add/Edit */}
			<Dialog onOpenChange={setShowDialog} open={showDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="text-sm">
							{editingAccount ? "Edit Akun" : "Tambah Akun Baru"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<label className="font-medium text-[11px] text-muted-foreground">
									Kode
								</label>
								<Input
									className="h-9 font-mono text-xs"
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
									placeholder="cth: 5-2100"
									value={formData.code}
								/>
							</div>
							<div className="space-y-1.5">
								<label className="font-medium text-[11px] text-muted-foreground">
									Tipe
								</label>
								<Select
									onValueChange={(v) => setFormData({ ...formData, type: v ?? "" })}
									value={formData.type}
								>
									<SelectTrigger className="h-9 text-xs">
										<SelectValue placeholder="Pilih tipe" />
									</SelectTrigger>
									<SelectContent>
										{ACCOUNT_TYPES.map((t) => (
											<SelectItem key={t.value} value={t.value}>
												{createElement(t.icon, { className: "mr-1 inline h-3.5 w-3.5", "aria-hidden": true })} {t.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="space-y-1.5">
							<label className="font-medium text-[11px] text-muted-foreground">
								Nama Akun
							</label>
							<Input
								className="h-9 text-xs"
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="cth: Beban Kopi & Susu"
								value={formData.name}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="font-medium text-[11px] text-muted-foreground">
								Deskripsi (opsional)
							</label>
							<Input
								className="h-9 text-xs"
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								placeholder="Penjelasan singkat"
								value={formData.description}
							/>
						</div>
						{editingAccount && (
							<div className="flex items-center gap-2">
								<input
									checked={formData.is_active}
									className="h-3.5 w-3.5"
									id="is_active"
									onChange={(e) =>
										setFormData({ ...formData, is_active: e.target.checked })
									}
									type="checkbox"
								/>
								<label
									className="text-[11px] text-muted-foreground"
									htmlFor="is_active"
								>
									Aktif
								</label>
							</div>
						)}
						<div className="flex justify-end gap-2 pt-2">
							<Button
								className="h-9 text-xs"
								onClick={() => setShowDialog(false)}
								size="sm"
								variant="outline"
							>
								Batal
							</Button>
							<Button
								className="h-9 text-xs"
								disabled={
									saving || !formData.code.trim() || !formData.name.trim()
								}
								onClick={handleSave}
								size="sm"
							>
								{saving
									? "Menyimpan..."
									: editingAccount
									? "Simpan"
									: "Tambah"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<Dialog
				onOpenChange={(open) => !open && setConfirmDelete(null)}
				open={!!confirmDelete}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle className="text-sm">Hapus Akun?</DialogTitle>
					</DialogHeader>
					<p className="text-muted-foreground text-xs">
						Akun ini akan dihapus permanen. Jika sudah memiliki entri
						akuntansi, akan dinonaktifkan saja.
					</p>
					<div className="flex justify-end gap-2 pt-2">
						<Button
							className="h-9 text-xs"
							onClick={() => setConfirmDelete(null)}
							size="sm"
							variant="outline"
						>
							Batal
						</Button>
						<Button
							className="h-9 text-xs"
							onClick={() => confirmDelete && handleDelete(confirmDelete)}
							size="sm"
							variant="destructive"
						>
							Hapus
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
