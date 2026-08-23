import { createLazyFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";
import { Search, Star, User, ShoppingBag, DollarSign, Clock, Phone, CalendarDays, X, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/admin/customers")({
	component: AdminCustomers,
});

interface Customer {
	source_id: string;
	email: string | null;
	name: string | null;
	phone: string | null;
	photo_url: string | null;
	total_points: number;
	lifetime_points: number;
	total_orders: number;
	total_spent: number;
	wallet_balance: number;
	wallet_held_balance: number;
	wallet_total_credited: number;
	wallet_total_debited: number;
	wallet_status: "active" | "blocked";
	last_order_at: string | null;
	created_at: string;
}

interface WalletLedgerEntry {
	id: number;
	amount: number;
	direction: "credit" | "debit";
	transaction_type: string;
	note: string | null;
	created_at: string;
}

interface CustomerOrderSummary {
	customerSourceId: string | null;
	status: string | null;
	totalAmount: number | null;
}

function formatRupiah(amount: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(amount);
}

function formatDate(value: string | null, withTime = false) {
	if (!value) return "-";
	return format(new Date(value), withTime ? "dd MMM yyyy HH:mm" : "dd MMM yyyy", { locale: id });
}

function CustomerAvatar({ customer }: { customer: Customer }) {
	return customer.photo_url ? (
		<img src={customer.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
	) : (
		<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
			<User className="h-3.5 w-3.5" />
		</div>
	);
}

function AdminCustomers() {
	const [customers, setCustomers] = useState<Customer[] | undefined>(undefined);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
	const [walletLedger, setWalletLedger] = useState<WalletLedgerEntry[]>([]);
	const [walletLedgerLoading, setWalletLedgerLoading] = useState(false);
	const [walletAdjustmentAmount, setWalletAdjustmentAmount] = useState("");
	const [walletAdjustmentNote, setWalletAdjustmentNote] = useState("");
	const [walletAdjustmentBusy, setWalletAdjustmentBusy] = useState(false);
	const [confirmDeleteCustomers, setConfirmDeleteCustomers] = useState<Customer[] | null>(null);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		let active = true;
		const supabase = createClient();
		const customersQuery = supabase
			.from("pos_customers_view")
			.select("*")
			.order("total_spent", { ascending: false });
		const ordersQuery = supabase
			.from("pos_orders")
			.select("customerSourceId,status,totalAmount")
			.in("status", ["paid", "completed"])
			.not("customerSourceId", "is", null);

		Promise.all([customersQuery, ordersQuery]).then(([customersResult, ordersResult]) => {
			if (!active) return;
			if (customersResult.error) {
				console.warn("[customers] customer fetch error:", customersResult.error);
				setCustomers(null as any);
				return;
			}

			const spendingByCustomer = new Map<string, { totalSpent: number; totalOrders: number }>();
			for (const order of (ordersResult.data as CustomerOrderSummary[] | null) || []) {
				if (!order.customerSourceId) continue;
				const current = spendingByCustomer.get(order.customerSourceId) || { totalSpent: 0, totalOrders: 0 };
				current.totalSpent += Number(order.totalAmount) || 0;
				current.totalOrders += 1;
				spendingByCustomer.set(order.customerSourceId, current);
			}

			setCustomers(
				((customersResult.data as Customer[]) || []).map((customer) => {
					const computed = spendingByCustomer.get(customer.source_id);
					if (!computed) return customer;
					return {
						...customer,
						total_spent: Math.max(Number(customer.total_spent) || 0, computed.totalSpent),
						total_orders: Math.max(Number(customer.total_orders) || 0, computed.totalOrders),
					};
				}),
			);
		}).catch((error) => {
			if (!active) return;
			console.warn("[customers] order aggregation error:", error);
		});
		return () => {
			active = false;
		};
	}, []);

	const filteredCustomers = customers?.filter((c) => {
		const q = searchQuery.toLowerCase();
		return (
			(c.name || "").toLowerCase().includes(q) ||
			(c.email || "").toLowerCase().includes(q) ||
			(c.phone || "").toLowerCase().includes(q)
		);
	});

	const toggleSelected = (sourceId: string) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(sourceId)) next.delete(sourceId);
			else next.add(sourceId);
			return next;
		});
	};

	const toggleSelectAll = () => {
		const visibleIds = filteredCustomers?.map((customer) => customer.source_id) ?? [];
		setSelectedIds((current) => {
			const next = new Set(current);
			const allVisibleAreSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
			visibleIds.forEach((id) => allVisibleAreSelected ? next.delete(id) : next.add(id));
			return next;
		});
	};

	useEffect(() => {
		if (!detailCustomer?.source_id || !detailCustomer.email) { setWalletLedger([]); return; }
		let active = true;
		setWalletLedgerLoading(true);
		void invokeEdgeFunction<{ ledger?: WalletLedgerEntry[] }>("customer-wallet", { action: "get", sourceId: detailCustomer.source_id, email: detailCustomer.email })
			.then((result) => { if (active) setWalletLedger(result.ledger ?? []); })
			.catch((error) => { console.warn("[customers] wallet ledger error:", error); if (active) setWalletLedger([]); })
			.finally(() => { if (active) setWalletLedgerLoading(false); });
		return () => { active = false; };
	}, [detailCustomer]);

	const handleWalletAdjustment = async (direction: "credit" | "debit") => {
		if (!detailCustomer) return;
		const amount = Number(walletAdjustmentAmount);
		const note = walletAdjustmentNote.trim();
		const staffToken = typeof window !== "undefined" ? window.localStorage.getItem("yumi_session_token") : "";
		if (!Number.isSafeInteger(amount) || amount <= 0) { toast.error("Nominal saldo harus lebih dari 0"); return; }
		if (!note) { toast.error("Alasan adjustment wajib diisi"); return; }
		if (!staffToken) { toast.error("Sesi staff tidak ditemukan"); return; }
		setWalletAdjustmentBusy(true);
		try {
			await invokeEdgeFunction("customer-wallet", { action: "admin-adjustment", staffToken, customerId: detailCustomer.source_id, amount, direction, note, idempotencyKey: `admin-wallet-${detailCustomer.source_id}-${Date.now()}` });
			toast.success(direction === "credit" ? "Saldo berhasil ditambahkan" : "Saldo berhasil dikurangi");
			setWalletAdjustmentAmount(""); setWalletAdjustmentNote("");
			const refreshed = await createClient().from("pos_customers_view").select("*").eq("source_id", detailCustomer.source_id).maybeSingle();
			if (!refreshed.error && refreshed.data) setDetailCustomer(refreshed.data as Customer);
		} catch (error) { toast.error(error instanceof Error ? error.message : "Adjustment saldo gagal"); }
		finally { setWalletAdjustmentBusy(false); }
	};

	const selectedCustomers = (customers ?? []).filter((customer) => selectedIds.has(customer.source_id));
	const allVisibleSelected = Boolean(filteredCustomers?.length) && (filteredCustomers ?? []).every((customer) => selectedIds.has(customer.source_id));

	const handleBulkDelete = async () => {
		if (!confirmDeleteCustomers?.length) return;
		setDeleting(true);
		const ids = confirmDeleteCustomers.map((customer) => customer.source_id);
		const { error } = await createClient()
			.schema("pos")
			.from("customers")
			.update({ is_active: false })
			.in("source_id", ids);
		if (error) {
			console.warn("[customers] bulk delete error:", error);
			toast.error("Akun customer gagal dinonaktifkan");
			setDeleting(false);
			return;
		}
		setCustomers((current) => current?.filter((customer) => !ids.includes(customer.source_id)));
		setSelectedIds(new Set());
		toast.success(`${ids.length} akun customer dinonaktifkan`);
		setConfirmDeleteCustomers(null);
		setDeleting(false);
	};

	// --- Loading state ---
	if (customers === undefined) {
		return (
			<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-3 duration-500">
				<div className="space-y-2">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-10 w-full" />
				<div className="space-y-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-border bg-card p-3 shadow-sm"
						>
							<div className="mb-2 flex items-center justify-between">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-20" />
							</div>
							<Skeleton className="h-3 w-48" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-2 duration-500 md:gap-2">
			{/* Header */}
			<div className="p-1 md:rounded-xl md:border md:border-border md:bg-card md:p-3 md:shadow-sm">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div>
						<h2 className="font-bold text-xl tracking-tight md:text-2xl">
							Pelanggan
						</h2>
						<p className="hidden text-muted-foreground text-xs md:block">
							Daftar pelanggan terdaftar.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground md:gap-2 md:text-[11px]">
						<span className="rounded-md bg-muted px-2 py-1">
							{filteredCustomers?.length ?? 0} dari {customers.length} pelanggan
						</span>
					</div>
				</div>
			</div>

			{/* Search */}
			<div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
				<div className="relative">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-9 pl-9 text-sm"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari nama, email, atau telepon..."
						value={searchQuery}
					/>
				</div>
			</div>

			{selectedCustomers.length > 0 ? (
				<div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-900">
					<span className="text-xs font-bold">{selectedCustomers.length} customer dipilih</span>
					<button type="button" onClick={() => setConfirmDeleteCustomers(selectedCustomers)} className="h-10 rounded-lg bg-red-600 px-3 text-xs font-black text-white">Hapus terpilih</button>
				</div>
			) : null}

			{/* Mobile: Card list */}
			<div className="space-y-2 pb-24 md:hidden">
				{filteredCustomers?.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground text-sm">
						Belum ada pelanggan.
					</div>
				) : (
					filteredCustomers?.map((c) => (
						<div
							key={c.source_id}
							className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md"
							onClick={() => setDetailCustomer(c)}
						>
							<div className="flex items-start gap-3">
								<input type="checkbox" aria-label={`Pilih ${c.name || "customer"}`} checked={selectedIds.has(c.source_id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(c.source_id)} className="mt-1 h-5 w-5 shrink-0 accent-red-600" />
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex items-center gap-2">
										<CustomerAvatar customer={c} />
										<span className="truncate font-semibold text-sm">
											{c.name || "Tanpa Nama"}
										</span>
									</div>
									{c.email && (
										<p className="truncate text-[11px] text-muted-foreground">
											{c.email}
										</p>
									)}
									{c.phone && (
										<p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
											<Phone className="h-3 w-3 shrink-0" /> {c.phone}
										</p>
									)}
									<div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
										<span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
												<Wallet className="h-3 w-3" /> {formatRupiah(c.wallet_balance || 0)}
											</span>
										<span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700">
											<ShoppingBag className="h-3 w-3" />
											{c.total_orders} pesanan
										</span>
										<span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-1.5 py-0.5 text-green-700">
											<DollarSign className="h-3 w-3" />
											{formatRupiah(c.total_spent)}
										</span>
									</div>
									{c.last_order_at && (
										<p className="flex items-center gap-1 text-[10px] text-muted-foreground">
											<Clock className="h-3 w-3" />
											Terakhir:{" "}
											{format(new Date(c.last_order_at), "dd MMM yyyy HH:mm", {
												locale: id,
											})}
										</p>
									)}
									<p className="flex items-center gap-1 text-[10px] text-muted-foreground">
										<CalendarDays className="h-3 w-3" /> Bergabung {formatDate(c.created_at)}
									</p>
								</div>
							</div>
					</div>
					))
				)}
			</div>

			{/* Desktop: Compact table */}
			<div className="hidden rounded-2xl border border-border bg-card shadow-sm md:block">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1040px] text-left text-xs">
						<thead className="sticky top-0 z-10 bg-muted/70 uppercase tracking-wider">
							<tr className="text-[10px] text-muted-foreground">
								<th className="w-12 px-2.5 py-2 text-center"><input type="checkbox" aria-label="Pilih semua customer terlihat" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-5 w-5 accent-red-600" /></th>
								<th className="px-2.5 py-2">Nama</th>
								<th className="px-2.5 py-2">Email</th>
								<th className="px-2.5 py-2">Telepon</th>
									<th className="px-2.5 py-2 text-right">Saldo</th>
								<th className="px-2.5 py-2 text-center"><span className="inline-flex items-center gap-1"><ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> Orders</span></th>
								<th className="px-2.5 py-2 text-right"><span className="inline-flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" aria-hidden="true" /> Total Spending</span></th>
								<th className="px-2.5 py-2">Terakhir Order</th>
								<th className="px-2.5 py-2">Bergabung</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredCustomers?.length === 0 ? (
								<tr>
									<td
										className="h-32 text-center text-muted-foreground text-sm"
										colSpan={8}
									>
										Belum ada pelanggan.
									</td>
								</tr>
							) : (
								filteredCustomers?.map((c) => (
									<tr
										key={c.source_id}
										className="cursor-pointer transition-colors hover:bg-muted/30"
										onClick={() => setDetailCustomer(c)}
									>
										<td className="w-12 px-2.5 py-2 text-center align-middle"><input type="checkbox" aria-label={`Pilih ${c.name || "customer"}`} checked={selectedIds.has(c.source_id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(c.source_id)} className="h-5 w-5 accent-red-600" /></td>
										<td className="px-2.5 py-2 align-middle">
											<div className="flex items-center gap-2">
												<CustomerAvatar customer={c} />
												<span className="truncate font-medium text-xs">
													{c.name || "Tanpa Nama"}
												</span>
											</div>
										</td>
										<td className="max-w-[200px] truncate px-2.5 py-2 align-middle text-muted-foreground">
											{c.email || "-"}
										</td>
										<td className="px-2.5 py-2 align-middle text-muted-foreground whitespace-nowrap">
											{c.phone || "-"}
										</td>
										<td className="px-2.5 py-2 text-center align-middle tabular-nums">
										</td>
										<td className="px-2.5 py-2 text-center align-middle tabular-nums">
											{c.total_orders}
										</td>
										<td className="px-2.5 py-2 text-right align-middle tabular-nums font-medium">
											{formatRupiah(c.total_spent)}
										</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
											{formatDate(c.last_order_at, true)}
										</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
											{formatDate(c.created_at)}
										</td>
										</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{detailCustomer ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailCustomer(null); }}>
					<div role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
						<div className="flex items-start justify-between gap-4">
							<div className="flex min-w-0 items-center gap-3"><CustomerAvatar customer={detailCustomer} /><div className="min-w-0"><p id="customer-detail-title" className="truncate text-lg font-black">{detailCustomer.name || "Tanpa Nama"}</p><p className="truncate text-sm text-muted-foreground">Detail customer</p></div></div>
							<button type="button" aria-label="Tutup detail customer" onClick={() => setDetailCustomer(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
						</div>
						<div className="mt-5 grid grid-cols-2 gap-2 text-sm">
							<div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Email</p><p className="mt-1 break-all font-semibold">{detailCustomer.email || "-"}</p></div>
							<div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Telepon</p><p className="mt-1 font-semibold">{detailCustomer.phone || "-"}</p></div>
							<div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Saldo Djiwa Pay</p><p className="mt-1 font-black text-emerald-900">{formatRupiah(detailCustomer.wallet_balance || 0)}</p></div>
							<div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">Total orders</p><p className="mt-1 font-black text-blue-900">{detailCustomer.total_orders.toLocaleString("id-ID")}</p></div>
							<div className="rounded-xl bg-cyan-50 p-3"><p className="text-xs text-cyan-700">Total masuk Djiwa Pay</p><p className="mt-1 font-black text-cyan-900">{formatRupiah(detailCustomer.wallet_total_credited || 0)}</p></div>
							<div className="rounded-xl bg-green-50 p-3"><p className="text-xs text-green-700">Total spending</p><p className="mt-1 font-black text-green-900">{formatRupiah(detailCustomer.total_spent)}</p></div>
						</div>
						<div className="mt-4 grid gap-2 text-sm"><div className="flex justify-between gap-4 border-b border-border pb-2"><span className="text-muted-foreground">Bergabung</span><span className="font-semibold">{formatDate(detailCustomer.created_at, true)}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Order terakhir</span><span className="font-semibold">{formatDate(detailCustomer.last_order_at, true)}</span></div></div>
						<div className="mt-4 rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs font-black">Adjustment Djiwa Pay admin</p><div className="mt-2 grid grid-cols-2 gap-2"><input type="number" min="1" value={walletAdjustmentAmount} onChange={(event) => setWalletAdjustmentAmount(event.target.value)} placeholder="Nominal" className="h-10 rounded-lg border border-border bg-background px-2 text-xs" /><input value={walletAdjustmentNote} onChange={(event) => setWalletAdjustmentNote(event.target.value)} placeholder="Alasan wajib" className="h-10 rounded-lg border border-border bg-background px-2 text-xs" /></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={walletAdjustmentBusy} onClick={() => void handleWalletAdjustment("credit")} className="h-10 rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-50">Tambah Saldo</button><button type="button" disabled={walletAdjustmentBusy} onClick={() => void handleWalletAdjustment("debit")} className="h-10 rounded-lg bg-rose-600 text-xs font-black text-white disabled:opacity-50">Kurangi Saldo</button></div></div>
						<div className="mt-4 rounded-xl border border-border p-3"><p className="text-xs font-black">Riwayat Djiwa Pay</p>{walletLedgerLoading ? <p className="mt-2 text-xs text-muted-foreground">Memuat ledger...</p> : walletLedger.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada transaksi Djiwa Pay.</p> : <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{walletLedger.slice(0, 20).map((entry) => <div key={entry.id} className="flex justify-between gap-2 border-b border-border/60 pb-1.5 text-[11px] last:border-0"><span className="min-w-0 truncate">{entry.note || entry.transaction_type}</span><span className={entry.direction === "credit" ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{entry.direction === "credit" ? "+" : "-"}{formatRupiah(entry.amount)}</span></div>)}</div>}</div>
					</div>
				</div>
			) : null}

			{confirmDeleteCustomers ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmDeleteCustomers(null); }}>
					<div role="dialog" aria-modal="true" aria-labelledby="bulk-delete-customer-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
						<div className="flex items-start justify-between gap-4">
							<div><p id="bulk-delete-customer-title" className="text-lg font-black">Hapus customer terpilih?</p><p className="mt-1 text-sm text-muted-foreground">{confirmDeleteCustomers.length} akun akan dinonaktifkan.</p></div>
							<button type="button" aria-label="Tutup" disabled={deleting} onClick={() => setConfirmDeleteCustomers(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
						</div>
						<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Akun akan dikeluarkan dari daftar customer aktif. Riwayat order dan poin tetap dipertahankan, tidak dihapus.</div>
						<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={deleting} onClick={() => setConfirmDeleteCustomers(null)} className="h-11 rounded-xl border border-border text-sm font-bold">Batal</button><button type="button" disabled={deleting} onClick={handleBulkDelete} className="h-11 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-50">{deleting ? "Menghapus..." : "Ya, hapus terpilih"}</button></div>
					</div>
				</div>
			) : null}
		</div>
	);
}
