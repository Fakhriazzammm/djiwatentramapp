import { createLazyFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";
import { Search, Star, User, ShoppingBag, DollarSign, Clock, Phone, CalendarDays, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
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
	last_order_at: string | null;
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
	const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
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

	const handleDeleteCustomer = async () => {
		if (!deleteCustomer) return;
		setDeleting(true);
		const { error } = await createClient()
			.schema("pos")
			.from("customers")
			.update({ is_active: false })
			.eq("source_id", deleteCustomer.source_id);
		if (error) {
			console.warn("[customers] delete error:", error);
			toast.error("Akun customer gagal dinonaktifkan");
			setDeleting(false);
			return;
		}
		setCustomers((current) => current?.filter((customer) => customer.source_id !== deleteCustomer.source_id));
		toast.success("Akun customer dinonaktifkan");
		setDeleteCustomer(null);
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
							className="rounded-xl border border-border bg-card p-3 shadow-sm"
						>
							<div className="flex items-start justify-between gap-3">
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
										<span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">
											<Star className="h-3 w-3 fill-current" />
											{c.total_points}
										</span>
										<span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700">
											<Star className="h-3 w-3" />
											{c.lifetime_points.toLocaleString("id-ID")} lifetime
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
								<button type="button" aria-label={`Nonaktifkan akun ${c.name || "customer"}`} onClick={() => setDeleteCustomer(c)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-red-50 hover:text-red-600">
									<Trash2 className="h-4 w-4" />
								</button>
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
								<th className="px-2.5 py-2">Nama</th>
								<th className="px-2.5 py-2">Email</th>
								<th className="px-2.5 py-2">Telepon</th>
								<th className="px-2.5 py-2 text-center"><span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" aria-hidden="true" /> Poin</span></th>
								<th className="px-2.5 py-2 text-center"><span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" aria-hidden="true" /> Lifetime</span></th>
								<th className="px-2.5 py-2 text-center"><span className="inline-flex items-center gap-1"><ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> Orders</span></th>
								<th className="px-2.5 py-2 text-right"><span className="inline-flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" aria-hidden="true" /> Total Spending</span></th>
								<th className="px-2.5 py-2">Terakhir Order</th>
								<th className="px-2.5 py-2">Bergabung</th>
								<th className="px-2.5 py-2 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredCustomers?.length === 0 ? (
								<tr>
									<td
										className="h-32 text-center text-muted-foreground text-sm"
										colSpan={10}
									>
										Belum ada pelanggan.
									</td>
								</tr>
							) : (
								filteredCustomers?.map((c) => (
									<tr
										key={c.source_id}
										className="transition-colors hover:bg-muted/30"
									>
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
											<span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
												<Star className="h-3 w-3 fill-current" />
												{c.total_points.toLocaleString("id-ID")}
											</span>
										</td>
										<td className="px-2.5 py-2 text-center align-middle tabular-nums">
											<span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">
												{c.lifetime_points.toLocaleString("id-ID")}
											</span>
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
										<td className="px-2.5 py-2 text-center align-middle">
											<button type="button" aria-label={`Nonaktifkan akun ${c.name || "customer"}`} onClick={() => setDeleteCustomer(c)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 hover:text-red-600">
												<Trash2 className="h-4 w-4" />
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{deleteCustomer ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteCustomer(null); }}>
					<div role="dialog" aria-modal="true" aria-labelledby="delete-customer-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
						<div className="flex items-start justify-between gap-4">
							<div><p id="delete-customer-title" className="text-lg font-black">Nonaktifkan akun customer?</p><p className="mt-1 text-sm text-muted-foreground">{deleteCustomer.name || "Customer tanpa nama"}</p></div>
							<button type="button" aria-label="Tutup" disabled={deleting} onClick={() => setDeleteCustomer(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
						</div>
						<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Akun akan dikeluarkan dari daftar customer aktif. Riwayat order dan poin tetap dipertahankan, tidak dihapus.</div>
						<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={deleting} onClick={() => setDeleteCustomer(null)} className="h-11 rounded-xl border border-border text-sm font-bold">Batal</button><button type="button" disabled={deleting} onClick={handleDeleteCustomer} className="h-11 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-50">{deleting ? "Menonaktifkan..." : "Ya, nonaktifkan"}</button></div>
					</div>
				</div>
			) : null}
		</div>
	);
}
