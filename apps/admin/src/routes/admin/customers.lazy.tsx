import { createLazyFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleDot, Search, Star, User, ShoppingBag, DollarSign, Clock, Phone, CalendarDays, X, Wallet, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { createClient } from "@/lib/client";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
	last_active_at: string | null;
	djiwaapp_visit_count: number;
	created_at: string;
	membership_expires_at: string | null;
	wallet_balance: number;
	wallet_held_balance: number;
	wallet_total_credited: number;
	wallet_total_debited: number;
	wallet_status: "active" | "blocked" | string;
	nickname: string | null;
	birth_date: string | null;
	gender: string | null;
	address: string | null;
	city: string | null;
	province: string | null;
	postal_code: string | null;
	marketing_consent: boolean | null;
	profile_completed_at: string | null;
	customer_description: string | null;
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

function formatMembershipExpiry(value: string | null) {
	if (!value) return "—";
	const [year, month, day] = value.slice(0, 10).split("-");
	return year && month && day ? `${day} ${format(new Date(Number(year), Number(month) - 1, Number(day)), "MMM yyyy", { locale: id })}` : "—";
}

function customerPresence(customer: Customer): "online" | "offline" | "never" {
	if (!customer.last_active_at) return "never";
	return Date.now() - new Date(customer.last_active_at).getTime() <= 5 * 60 * 1000 ? "online" : "offline";
}

function presenceLabel(customer: Customer) {
	const status = customerPresence(customer);
	return status === "online" ? "Sedang aktif" : status === "offline" ? "Offline" : "Belum pernah aktif";
}

type RetentionSegment = "Belum Aktif" | "Aktif" | "Perlu Diingatkan" | "Belum Kembali" | "Berisiko Hilang";
const RETENTION_ORDER: RetentionSegment[] = ["Belum Aktif", "Aktif", "Perlu Diingatkan", "Belum Kembali", "Berisiko Hilang"];

function latestCustomerActivity(customer: Customer) {
	const timestamps = [customer.last_active_at, customer.last_order_at]
		.map((value) => value ? new Date(value).getTime() : 0)
		.filter((value) => Number.isFinite(value) && value > 0);
	return timestamps.length ? Math.max(...timestamps) : 0;
}

function daysSinceCustomerActivity(customer: Customer) {
	const latest = latestCustomerActivity(customer);
	return latest ? Math.max(0, Math.floor((Date.now() - latest) / 86400000)) : null;
}

function formatInactiveDays(customer: Customer) {
	const days = daysSinceCustomerActivity(customer);
	return days === null ? "—" : `${days} hari`;
}

function retentionSegment(customer: Customer): RetentionSegment {
	const days = daysSinceCustomerActivity(customer);
	if (days === null) return "Belum Aktif";
	if (days <= 14) return "Aktif";
	if (days <= 30) return "Perlu Diingatkan";
	if (days <= 60) return "Belum Kembali";
	return "Berisiko Hilang";
}

function marketingPriority(customer: Customer) {
	switch (retentionSegment(customer)) {
		case "Belum Aktif": return "Onboarding member";
		case "Aktif": return "Pantau";
		case "Perlu Diingatkan": return "Promo kunjungan ulang";
		case "Belum Kembali": return "Kirim voucher member";
		case "Berisiko Hilang": return "Prioritas reaktivasi";
	}
}

function retentionTone(segment: RetentionSegment) {
	if (segment === "Aktif") return "bg-emerald-50 text-emerald-700";
	if (segment === "Perlu Diingatkan") return "bg-amber-50 text-amber-700";
	if (segment === "Belum Kembali") return "bg-orange-50 text-orange-700";
	if (segment === "Berisiko Hilang") return "bg-rose-50 text-rose-700";
	return "bg-slate-100 text-slate-600";
}

function normalizeCustomerName(value: unknown) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/^\d+[_-]+/, "")
		.replace(/\s+/g, " ");
}

function isSettledOrder(order: any) {
	return ["paid", "completed"].includes(String(order.status ?? "").toLowerCase());
}

function customerMatchesOrder(customer: Customer, order: any) {
	const customerId = String(customer.source_id ?? "");
	const orderCustomerId = String(order.customerSourceId ?? order.customer_source_id ?? "");
	const orderAuthId = String(order.authUserId ?? order.auth_user_id ?? "");
	const orderEmail = String(order.customerEmail ?? order.customer_email ?? "");
	if (customerId && orderCustomerId && customerId === orderCustomerId) return true;
	if (customerId && orderAuthId && customerId === orderAuthId) return true;
	if (customer.email && orderEmail && customer.email.toLowerCase() === orderEmail.toLowerCase()) return true;
	return normalizeCustomerName(customer.name) !== "" && normalizeCustomerName(customer.name) === normalizeCustomerName(order.customerName ?? order.customer_name);
}

type CustomerSortKey = "name" | "email" | "phone" | "wallet_balance" | "total_orders" | "djiwaapp_visit_count" | "total_spent" | "last_order_at" | "last_active_at" | "inactive_days" | "retention_segment" | "marketing_priority" | "created_at";
type SortDirection = "asc" | "desc";

function customerSortValue(customer: Customer, key: CustomerSortKey): string | number {
	if (key === "name" || key === "email" || key === "phone") return String(customer[key] ?? "").toLowerCase();
	if (key === "retention_segment") return RETENTION_ORDER.indexOf(retentionSegment(customer));
	if (key === "marketing_priority") return `${RETENTION_ORDER.indexOf(retentionSegment(customer))}-${marketingPriority(customer)}`;
	if (key === "inactive_days") return daysSinceCustomerActivity(customer) ?? -1;
	if (key === "last_order_at" || key === "last_active_at" || key === "created_at") return customer[key] ? new Date(customer[key] as string).getTime() : 0;
	return Number(customer[key] ?? 0);
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort, align = "left" }: { label: string; sortKey: CustomerSortKey; activeKey: CustomerSortKey; direction: SortDirection; onSort: (key: CustomerSortKey) => void; align?: "left" | "right" | "center" }) {
	const active = activeKey === sortKey;
	return <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1 font-inherit hover:text-foreground ${align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""}`} aria-label={`Urutkan ${label} ${active && direction === "desc" ? "terkecil ke terbesar" : "terbesar ke terkecil"}`}>
		{label}{active ? (direction === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" />) : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}
	</button>;
}

function DetailField({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
	const display = value === null || value === undefined || value === "" ? "—" : String(value);
	return <div className={`rounded-xl bg-muted/50 p-3 ${wide ? "col-span-2" : ""}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{display}</p></div>;
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

function downloadText(content: string, filename: string, type = "text/plain;charset=utf-8") {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function customerExportRows(customers: Customer[], mode: "email" | "phone" | "full") {
	return customers.map((customer) => mode === "email" ? {
		Email: customer.email ?? "",
		Nama: customer.name ?? "",
	} : mode === "phone" ? {
		Telepon: customer.phone ?? "",
		Nama: customer.name ?? "",
	} : {
		Nama: customer.name ?? "",
		Email: customer.email ?? "",
		Telepon: customer.phone ?? "",
		Status: presenceLabel(customer),
		"Tanggal Bergabung": formatDate(customer.created_at),
		"Exp Member": formatMembershipExpiry(customer.membership_expires_at),
		Saldo: customer.wallet_balance || 0,
		"Saldo Ditahan": customer.wallet_held_balance || 0,
		"Total Order": customer.total_orders,
		"Total Spending": customer.total_spent,
		Kunjungan: customer.djiwaapp_visit_count ?? 0,
		"Terakhir Order": formatDate(customer.last_order_at, true),
		"Terakhir Aktif": formatDate(customer.last_active_at, true),
		"Segmen Retensi": retentionSegment(customer),
		"Prioritas Marketing": marketingPriority(customer),
		Nickname: customer.nickname ?? "",
		"Tanggal Lahir": formatDate(customer.birth_date),
		Gender: customer.gender ?? "",
		Alamat: customer.address ?? "",
		Kota: customer.city ?? "",
		Provinsi: customer.province ?? "",
		"Kode Pos": customer.postal_code ?? "",
		"Marketing Consent": customer.marketing_consent === null ? "" : customer.marketing_consent ? "Ya" : "Tidak",
	});
}

function escapeCsvCell(value: unknown) {
	return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function customerVcardValue(value: string) {
	return value.replace(/[\\,;\n]/g, (match) => match === "\\" ? "\\\\" : match === "\n" ? "\\n" : `\\${match}`);
}

function exportCustomers(customers: Customer[], mode: "email" | "phone" | "full", formatType: "xlsx" | "csv" | "vcf" | "pdf") {
	if (customers.length === 0) {
		toast.error("Tidak ada customer untuk diexport");
		return;
	}
	const sourceCustomers = mode === "email" ? customers.filter((customer) => customer.email) : mode === "phone" ? customers.filter((customer) => customer.phone) : customers;
	if (sourceCustomers.length === 0) {
		toast.error(mode === "email" ? "Tidak ada email customer" : mode === "phone" ? "Tidak ada nomor telepon customer" : "Tidak ada customer untuk diexport");
		return;
	}
	const stamp = new Date().toISOString().slice(0, 10);
	const suffix = mode === "full" ? "semua" : mode;
	const rows = customerExportRows(sourceCustomers, mode);
	if (formatType === "vcf") {
		const cards = sourceCustomers.map((customer) => [
			"BEGIN:VCARD", "VERSION:3.0", `FN:${customerVcardValue(customer.name ?? "Tanpa Nama")}`,
			customer.email && mode !== "phone" ? `EMAIL:${customerVcardValue(customer.email)}` : "",
			customer.phone && mode !== "email" ? `TEL;TYPE=CELL:${customerVcardValue(customer.phone)}` : "", "END:VCARD",
		].filter(Boolean).join("\\r\\n")).join("\\r\\n");
		if (!cards) { toast.error("Tidak ada email atau nomor telepon untuk diexport"); return; }
		downloadText(cards, `djiwa-pelanggan-${suffix}-${stamp}.vcf`, "text/vcard;charset=utf-8");
		toast.success(`${sourceCustomers.length} customer diexport sebagai VCF`);
		return;
	}
	if (formatType === "csv") {
		const headers = Object.keys(rows[0] ?? {});
		const csv = "\\uFEFF" + [headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))].map((line) => line.map(escapeCsvCell).join(";")).join("\\r\\n");
		downloadText(csv, `djiwa-pelanggan-${suffix}-${stamp}.csv`, "text/csv;charset=utf-8");
	} else if (formatType === "xlsx") {
		const sheet = XLSX.utils.json_to_sheet(rows);
		sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Object.keys(rows[0] ?? {}).length - 1 } }) };
		sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
		sheet["!cols"] = Object.keys(rows[0] ?? {}).map((header) => ({ wch: Math.min(28, Math.max(14, header.length + 3)) }));
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, sheet, "Pelanggan");
		XLSX.writeFile(workbook, `djiwa-pelanggan-${suffix}-${stamp}.xlsx`);
	} else {
		const doc = new jsPDF({ orientation: "landscape" });
		doc.setFontSize(15); doc.text("Djiwa Tentram — Data Pelanggan", 14, 16);
		doc.setFontSize(9); doc.setTextColor(100); doc.text(`${customers.length} customer · ${mode === "full" ? "Semua data" : mode === "email" ? "Email" : "Nomor telepon"}`, 14, 23); doc.setTextColor(0);
		const headers = Object.keys(rows[0] ?? {});
		autoTable(doc, { startY: 29, head: [headers], body: rows.map((row) => headers.map((header) => String(row[header as keyof typeof row] ?? ""))), styles: { fontSize: mode === "full" ? 5.5 : 8, cellPadding: 2 }, headStyles: { fillColor: [26, 93, 198] }, horizontalPageBreak: true, horizontalPageBreakRepeat: 0 });
		doc.save(`djiwa-pelanggan-${suffix}-${stamp}.pdf`);
	}
	toast.success(`${sourceCustomers.length} customer diexport sebagai ${formatType.toUpperCase()}`);
}

function AdminCustomers() {
	const [customers, setCustomers] = useState<Customer[] | undefined>(undefined);
	const [selectedCustomerOrders, setSelectedCustomerOrders] = useState<any[]>([]);
	const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortKey, setSortKey] = useState<CustomerSortKey>("total_spent");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
	const [editingProfile, setEditingProfile] = useState(false);
	const [profileDraft, setProfileDraft] = useState({ name: "", phone: "", nickname: "", address: "", city: "", province: "", postal_code: "", customer_description: "" });
	const [profileSaveBusy, setProfileSaveBusy] = useState(false);
	const [membershipExpiryValue, setMembershipExpiryValue] = useState("");
	const [membershipExpiryBusy, setMembershipExpiryBusy] = useState(false);
	const [walletLedger, setWalletLedger] = useState<WalletLedgerEntry[]>([]);
	const [walletLedgerLoading, setWalletLedgerLoading] = useState(false);
	const [walletAdjustmentAmount, setWalletAdjustmentAmount] = useState("");
	const [walletAdjustmentNote, setWalletAdjustmentNote] = useState("");
	const [walletAdjustmentBusy, setWalletAdjustmentBusy] = useState(false);
	const [confirmDeleteCustomers, setConfirmDeleteCustomers] = useState<Customer[] | null>(null);
	const [deleting, setDeleting] = useState(false);

	const liveCustomers = useSupabaseLiveValue<Customer[]>(
		"admin-customers",
		async () => {
			const supabase = createClient();
			const [{ data: customerRows, error: customerError }, { data: orderRows, error: orderError }] = await Promise.all([
				supabase.from("pos_customers_view").select("*").order("total_spent", { ascending: false }),
				supabase.from("pos_orders").select("*").in("source", ["customer_self_service", "ordermieyamin_b2b"]).order("createdAt", { ascending: false }).limit(2000),
			]);
			if (customerError) throw customerError;
			if (orderError) throw orderError;
			const settledOrders = (orderRows ?? []).filter(isSettledOrder);
			return ((customerRows ?? []) as Customer[]).map((customer) => {
				const orders = settledOrders.filter((order) => customerMatchesOrder(customer, order));
				if (orders.length === 0) return customer;
				const totalSpent = orders.reduce((sum, order) => sum + Number(order.totalAmount ?? order.total_amount ?? 0), 0);
				const lastOrderAt = orders.reduce((latest, order) => Math.max(latest, Number(order.createdAt ?? order.created_at ?? 0)), 0);
				return {
					...customer,
					total_orders: orders.length,
					total_spent: totalSpent,
					last_order_at: lastOrderAt > 0 ? new Date(lastOrderAt).toISOString() : customer.last_order_at,
				};
			});
		},
		[],
		{ tables: ["customers", "customer_wallets", "orders", "order_items"] }
	);

	useEffect(() => {
		if (liveCustomers !== undefined) setCustomers(liveCustomers ?? []);
	}, [liveCustomers]);

	useEffect(() => {
		if (!detailCustomer?.source_id) { setSelectedCustomerOrders([]); return; }
		let active = true;
		setCustomerOrdersLoading(true);
		createClient().from("pos_orders").select("*").order("createdAt", { ascending: false }).limit(2000)
			.then(({ data, error }) => {
				if (!active) return;
				if (error) {
					console.warn("[customers] order detail error:", error);
					setSelectedCustomerOrders([]);
					setCustomerOrdersLoading(false);
					return;
				}
				setSelectedCustomerOrders((data || []).filter((order: any) => customerMatchesOrder(detailCustomer, order)).slice(0, 50));
				setCustomerOrdersLoading(false);
			});
		return () => { active = false; };
	}, [detailCustomer?.source_id]);

	const filteredCustomers = customers?.filter((c) => {
		const q = searchQuery.toLowerCase();
		return (
			(c.name || "").toLowerCase().includes(q) ||
			(c.email || "").toLowerCase().includes(q) ||
			(c.phone || "").toLowerCase().includes(q)
		);
	});
	const sortedCustomers = [...(filteredCustomers ?? [])].sort((a, b) => {
		const left = customerSortValue(a, sortKey);
		const right = customerSortValue(b, sortKey);
		const comparison = typeof left === "string" && typeof right === "string" ? left.localeCompare(right, "id") : Number(left) - Number(right);
		return (sortDirection === "desc" ? -comparison : comparison) || String(a.name ?? "").localeCompare(String(b.name ?? ""), "id");
	});
	const handleSort = (key: CustomerSortKey) => {
		if (sortKey === key) setSortDirection((current) => current === "desc" ? "asc" : "desc");
		else { setSortKey(key); setSortDirection("desc"); }
	};

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
		setMembershipExpiryValue(detailCustomer?.membership_expires_at?.slice(0, 10) ?? "");
	}, [detailCustomer?.source_id, detailCustomer?.membership_expires_at]);

	useEffect(() => {
		if (!detailCustomer) { setEditingProfile(false); return; }
		setProfileDraft({ name: detailCustomer.name ?? "", phone: detailCustomer.phone ?? "", nickname: detailCustomer.nickname ?? "", address: detailCustomer.address ?? "", city: detailCustomer.city ?? "", province: detailCustomer.province ?? "", postal_code: detailCustomer.postal_code ?? "", customer_description: detailCustomer.customer_description ?? "" });
	}, [detailCustomer?.source_id]);

	const handleProfileSave = async () => {
		if (!detailCustomer) return;
		const staffToken = typeof window !== "undefined" ? window.localStorage.getItem("yumi_session_token") : "";
		if (!staffToken) { toast.error("Sesi staff tidak ditemukan"); return; }
		setProfileSaveBusy(true);
		try {
			const result = await invokeEdgeFunction<{ result: Customer }>("customer-wallet", { action: "admin-update-customer", staffToken, customerId: detailCustomer.source_id, ...profileDraft });
			const updated = result.result;
			setDetailCustomer(updated);
			setCustomers((current) => current?.map((customer) => customer.source_id === updated.source_id ? { ...customer, ...updated } : customer));
			setEditingProfile(false);
			toast.success("Data pelanggan berhasil disimpan");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Data pelanggan gagal disimpan"); }
		finally { setProfileSaveBusy(false); }
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

	const handleMembershipExpirySave = async () => {
		if (!detailCustomer) return;
		setMembershipExpiryBusy(true);
		try {
			const { data, error } = await createClient()
				.schema("pos")
				.from("customers")
				.update({ membership_expires_at: membershipExpiryValue || null })
				.eq("source_id", detailCustomer.source_id)
				.select("source_id, membership_expires_at")
				.single();
			if (error) throw error;
			const nextExpiry = data?.membership_expires_at ?? null;
			setDetailCustomer((current) => current ? { ...current, membership_expires_at: nextExpiry } : current);
			setCustomers((current) => current?.map((customer) => customer.source_id === detailCustomer.source_id ? { ...customer, membership_expires_at: nextExpiry } : customer));
			toast.success("Exp Member berhasil disimpan");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Exp Member gagal disimpan");
		} finally {
			setMembershipExpiryBusy(false);
		}
	};

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
				<div className="flex items-center gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="h-9 pl-9 text-sm"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Cari nama, email, atau telepon..."
							value={searchQuery}
						/>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={(props) => (
								<button {...props} type="button" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Buka menu export customer">
									<Download className="h-3.5 w-3.5 text-primary" />
									<span className="hidden sm:inline">Export</span>
								</button>
							)}
						/>
						<DropdownMenuContent align="end" side="bottom" sideOffset={6} style={{ zIndex: 9999 }} className="z-[9999] w-[276px] p-2">
							<DropdownMenuLabel className="px-2 py-1 text-[11px]">Export {selectedCustomers.length ? `${selectedCustomers.length} dipilih` : `${sortedCustomers.length} terlihat`}</DropdownMenuLabel>
							<div className="space-y-1.5">
								{(["email", "phone", "full"] as const).map((mode) => (
									<div key={mode} className="rounded-lg bg-muted/40 px-2 py-1.5">
										<p className="mb-1 text-[10px] font-bold text-muted-foreground">{mode === "email" ? "Email" : mode === "phone" ? "Nomor telepon" : "Semua data"}</p>
										<div className="grid grid-cols-4 gap-1">
											{(["xlsx", "csv", "vcf", "pdf"] as const).map((formatType) => (
												<button key={formatType} type="button" onClick={() => exportCustomers(selectedCustomers.length ? selectedCustomers : sortedCustomers, mode, formatType)} className="h-7 rounded-md border border-border bg-background px-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{formatType === "xlsx" ? "Excel" : formatType}</button>
											))}
										</div>
									</div>
								))}
							</div>
						</DropdownMenuContent>
					</DropdownMenu>
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
					sortedCustomers.map((c) => (
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
											{c.total_orders} order DjiwaApp
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
									<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
										<Clock className="h-3 w-3" />
										Tidak aktif selama: <span className="font-bold text-foreground">{formatInactiveDays(c)}</span>
									</div>
									<div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
										<span className={`rounded-md px-1.5 py-0.5 font-bold ${retentionTone(retentionSegment(c))}`}>{retentionSegment(c)}</span>
										<span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">{marketingPriority(c)}</span>
									</div>
									<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
										<CircleDot className={`h-3 w-3 ${customerPresence(c) === "online" ? "fill-emerald-500 text-emerald-500" : "text-slate-400"}`} />
										<span className={customerPresence(c) === "online" ? "font-bold text-emerald-700" : ""}>{presenceLabel(c)}</span>
										<span>· Terakhir aktif: {formatDate(c.last_active_at, true)} · {c.djiwaapp_visit_count ?? 0} kunjungan DjiwaApp</span>
									</div>
									<p className="flex items-center gap-1 text-[10px] text-muted-foreground">
										<Star className="h-3 w-3" /> Exp Member {formatMembershipExpiry(c.membership_expires_at)}
									</p>
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
			<div className="hidden rounded-[20px] border border-border bg-card shadow-sm md:block">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1400px] text-left text-xs">
						<thead className="sticky top-0 z-10 bg-muted/70 uppercase tracking-wider">
							<tr className="text-[10px] text-muted-foreground">
								<th className="whitespace-nowrap w-12 px-2.5 py-2 text-center"><input type="checkbox" aria-label="Pilih semua customer terlihat" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-5 w-5 accent-red-600" /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Nama" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Email" sortKey="email" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Telepon" sortKey="phone" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2">Status</th>
								<th className="whitespace-nowrap px-2.5 py-2">Exp Member</th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Bergabung" sortKey="created_at" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2 text-right"><SortableHeader label="Saldo" sortKey="wallet_balance" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" /></th>
								<th className="whitespace-nowrap px-2.5 py-2 text-center"><SortableHeader label="Kunjungan DjiwaApp" sortKey="djiwaapp_visit_count" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="center" /></th>
								<th className="whitespace-nowrap px-2.5 py-2 text-center"><SortableHeader label="Order DjiwaApp" sortKey="total_orders" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="center" /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Terakhir Order" sortKey="last_order_at" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Terakhir Aktif" sortKey="last_active_at" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Tidak Aktif Selama" sortKey="inactive_days" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2 text-right"><SortableHeader label="Total Spending" sortKey="total_spent" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Segmen Retensi" sortKey="retention_segment" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
								<th className="whitespace-nowrap px-2.5 py-2"><SortableHeader label="Prioritas Marketing" sortKey="marketing_priority" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredCustomers?.length === 0 ? (
								<tr>
									<td
										className="h-32 text-center text-muted-foreground text-sm"
										colSpan={16}
									>
										Belum ada pelanggan.
									</td>
								</tr>
							) : (
								sortedCustomers.map((c) => (
									<tr
										key={c.source_id}
										className="cursor-pointer transition-colors hover:bg-muted/30"
										onClick={() => setDetailCustomer(c)}
									>
										<td className="whitespace-nowrap w-12 px-2.5 py-2 text-center align-middle"><input type="checkbox" aria-label={`Pilih ${c.name || "customer"}`} checked={selectedIds.has(c.source_id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(c.source_id)} className="h-5 w-5 accent-red-600" /></td>
										<td className="whitespace-nowrap px-2.5 py-2 align-middle">
											<div className="flex items-center gap-2">
												<CustomerAvatar customer={c} />
												<span className="truncate font-medium text-xs">
													{c.name || "Tanpa Nama"}
												</span>
											</div>
										</td>
										<td className="whitespace-nowrap max-w-[200px] truncate px-2.5 py-2 align-middle text-muted-foreground">
											{c.email || "-"}
										</td>
										<td className="px-2.5 py-2 align-middle text-muted-foreground whitespace-nowrap">
											{c.phone || "-"}
										</td>
										<td className="px-2.5 py-2 align-middle whitespace-nowrap">
											<span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${customerPresence(c) === "online" ? "bg-emerald-50 text-emerald-700" : customerPresence(c) === "offline" ? "bg-slate-100 text-slate-600" : "bg-muted text-muted-foreground"}`}>
												<CircleDot className={`h-2.5 w-2.5 ${customerPresence(c) === "online" ? "fill-emerald-500 text-emerald-500" : "text-slate-400"}`} /> {presenceLabel(c)}
											</span>
										</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{formatMembershipExpiry(c.membership_expires_at)}</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(c.created_at)}</td>
										<td className="whitespace-nowrap px-2.5 py-2 text-right align-middle tabular-nums font-semibold text-emerald-700">{formatRupiah(c.wallet_balance || 0)}</td>
										<td className="whitespace-nowrap px-2.5 py-2 text-center align-middle tabular-nums">{c.djiwaapp_visit_count ?? 0}</td>
										<td className="whitespace-nowrap px-2.5 py-2 text-center align-middle tabular-nums">{c.total_orders}</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(c.last_order_at, true)}</td>
										<td className="px-2.5 py-2 align-middle text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(c.last_active_at, true)}</td>
										<td className="px-2.5 py-2 align-middle text-[10px] font-semibold tabular-nums whitespace-nowrap"><span className={daysSinceCustomerActivity(c) !== null && (daysSinceCustomerActivity(c) ?? 0) > 30 ? "text-rose-700" : "text-muted-foreground"}>{formatInactiveDays(c)}</span></td>
										<td className="whitespace-nowrap px-2.5 py-2 text-right align-middle tabular-nums font-medium">{formatRupiah(c.total_spent)}</td>
										<td className="px-2.5 py-2 align-middle whitespace-nowrap"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${retentionTone(retentionSegment(c))}`}>{retentionSegment(c)}</span></td>
										<td className="px-2.5 py-2 align-middle whitespace-nowrap text-[10px] font-semibold text-violet-700">{marketingPriority(c)}</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{detailCustomer ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailCustomer(null); }}>
					<div role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[20px] border border-border bg-card p-4 shadow-xl">
							<div className="flex shrink-0 items-start justify-between gap-4">
								<div className="flex min-w-0 items-center gap-3"><CustomerAvatar customer={detailCustomer} /><div className="min-w-0"><p id="customer-detail-title" className="truncate text-lg font-black">{detailCustomer.name || "Tanpa Nama"}</p><p className="truncate text-sm text-muted-foreground">Detail customer</p></div></div>
								<div className="flex items-center gap-1"><button type="button" onClick={() => setEditingProfile((value) => !value)} className="h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">{editingProfile ? "Batal" : "Edit data"}</button><button type="button" aria-label="Tutup detail customer" onClick={() => setDetailCustomer(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
						{editingProfile ? (
							<div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
								<p className="text-xs font-black">Edit data pelanggan</p>
								<div className="mt-2 grid grid-cols-2 gap-2">{([['name','Nama'],['phone','Telepon'],['nickname','Nickname'],['city','Kota'],['province','Provinsi'],['postal_code','Kode pos']] as const).map(([field, label]) => <label key={field} className="text-[11px] font-semibold text-muted-foreground">{label}<input value={profileDraft[field]} onChange={(event) => setProfileDraft((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground" /></label>)}</div>
								<label className="mt-2 block text-[11px] font-semibold text-muted-foreground">Alamat<textarea value={profileDraft.address} onChange={(event) => setProfileDraft((current) => ({ ...current, address: event.target.value }))} className="mt-1 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground" /></label>
								<label className="mt-2 block text-[11px] font-semibold text-muted-foreground">Deskripsi<textarea value={profileDraft.customer_description} onChange={(event) => setProfileDraft((current) => ({ ...current, customer_description: event.target.value }))} className="mt-1 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground" /></label>
								<button type="button" disabled={profileSaveBusy} onClick={() => void handleProfileSave()} className="mt-2 h-10 w-full rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-50">{profileSaveBusy ? "Menyimpan..." : "Simpan data pelanggan"}</button>
							</div>
						) : null}
						<div className="mt-5 grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto pr-1 text-sm">
							<DetailField label="Source ID" value={detailCustomer.source_id} wide />
							<DetailField label="Email" value={detailCustomer.email} wide />
							<DetailField label="Telepon" value={detailCustomer.phone} />
							<DetailField label="Nickname" value={detailCustomer.nickname} />
							<DetailField label="Saldo Djiwa Pay" value={formatRupiah(detailCustomer.wallet_balance || 0)} />
							<DetailField label="Saldo ditahan" value={formatRupiah(detailCustomer.wallet_held_balance || 0)} />
							<DetailField label="Total masuk Djiwa Pay" value={formatRupiah(detailCustomer.wallet_total_credited || 0)} />
							<DetailField label="Total keluar Djiwa Pay" value={formatRupiah(detailCustomer.wallet_total_debited || 0)} />
							<DetailField label="Status wallet" value={detailCustomer.wallet_status} />
							<DetailField label="Total points" value={detailCustomer.total_points.toLocaleString("id-ID")} />
							<DetailField label="Lifetime points" value={detailCustomer.lifetime_points.toLocaleString("id-ID")} />
							<DetailField label="Total orders" value={detailCustomer.total_orders.toLocaleString("id-ID")} />
							<DetailField label="Total spending" value={formatRupiah(detailCustomer.total_spent)} />
							<DetailField label="Bergabung" value={formatDate(detailCustomer.created_at, true)} />
							<DetailField label="Order terakhir" value={formatDate(detailCustomer.last_order_at, true)} />
							<DetailField label="Terakhir aktif di Djiwa App" value={formatDate(detailCustomer.last_active_at, true)} />
							<DetailField label="Status Djiwa App" value={presenceLabel(detailCustomer)} />
							<DetailField label="Exp Member" value={formatMembershipExpiry(detailCustomer.membership_expires_at)} />
							<DetailField label="Kunjungan DjiwaApp" value={detailCustomer.djiwaapp_visit_count ?? 0} />
							<DetailField label="Tanggal lahir" value={formatDate(detailCustomer.birth_date)} />
							<DetailField label="Gender" value={detailCustomer.gender} />
							<DetailField label="Marketing consent" value={detailCustomer.marketing_consent === null ? null : detailCustomer.marketing_consent ? "Ya" : "Tidak"} />
							<DetailField label="Profil selesai" value={formatDate(detailCustomer.profile_completed_at, true)} />
							<DetailField label="Kota" value={detailCustomer.city} />
							<DetailField label="Provinsi" value={detailCustomer.province} />
							<DetailField label="Kode pos" value={detailCustomer.postal_code} />
							<DetailField label="Alamat" value={detailCustomer.address} wide />
							<DetailField label="Deskripsi customer" value={detailCustomer.customer_description} wide />
						</div>
						<div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-black">Membership</p><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 text-[11px] font-semibold text-muted-foreground">Exp Member<input type="date" value={membershipExpiryValue} onChange={(event) => setMembershipExpiryValue(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground" /></label><button type="button" disabled={membershipExpiryBusy} onClick={() => void handleMembershipExpirySave()} className="h-10 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground disabled:opacity-50">{membershipExpiryBusy ? "Menyimpan..." : "Simpan Exp Member"}</button></div><p className="mt-2 text-[10px] text-muted-foreground">Kosongkan tanggal lalu simpan untuk menghapus masa berlaku.</p></div>
						<div className="mt-4 rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs font-black">Adjustment Djiwa Pay admin</p><div className="mt-2 grid grid-cols-2 gap-2"><input type="number" min="1" value={walletAdjustmentAmount} onChange={(event) => setWalletAdjustmentAmount(event.target.value)} placeholder="Nominal" className="h-10 rounded-lg border border-border bg-background px-2 text-xs" /><input value={walletAdjustmentNote} onChange={(event) => setWalletAdjustmentNote(event.target.value)} placeholder="Alasan wajib" className="h-10 rounded-lg border border-border bg-background px-2 text-xs" /></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={walletAdjustmentBusy} onClick={() => void handleWalletAdjustment("credit")} className="h-10 rounded-lg bg-emerald-600 text-xs font-black text-white disabled:opacity-50">Tambah Saldo</button><button type="button" disabled={walletAdjustmentBusy} onClick={() => void handleWalletAdjustment("debit")} className="h-10 rounded-lg bg-rose-600 text-xs font-black text-white disabled:opacity-50">Kurangi Saldo</button></div></div>
						<div className="mt-4 rounded-xl border border-border p-3"><p className="text-xs font-black">Riwayat pembelian</p>{customerOrdersLoading ? <p className="mt-2 text-xs text-muted-foreground">Memuat riwayat order...</p> : selectedCustomerOrders.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada order yang terhubung.</p> : <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">{selectedCustomerOrders.map((order: any) => <div key={order._id} className="rounded-lg bg-muted/30 p-2 text-[11px]"><div className="flex justify-between gap-2"><span className="font-bold">#{order.orderNumber || "-"}</span><span className="font-bold">{formatRupiah(Number(order.totalAmount || 0))}</span></div><div className="mt-1 text-muted-foreground">{order.status || "-"} · {formatDate(order.createdAt ? new Date(Number(order.createdAt)).toISOString() : null, true)}</div>{Array.isArray(order.items) && order.items.length > 0 ? <div className="mt-1 text-muted-foreground">{order.items.map((item: any) => `${item.quantity || 0}× ${item.productName || item.name || "Item"}`).join(", ")}</div> : null}</div>)}</div>}</div><div className="mt-4 rounded-xl border border-border p-3"><p className="text-xs font-black">Riwayat Djiwa Pay</p>{walletLedgerLoading ? <p className="mt-2 text-xs text-muted-foreground">Memuat ledger...</p> : walletLedger.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada transaksi Djiwa Pay.</p> : <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{walletLedger.slice(0, 20).map((entry) => <div key={entry.id} className="flex justify-between gap-2 border-b border-border/60 pb-1.5 text-[11px] last:border-0"><span className="min-w-0 truncate">{entry.note || entry.transaction_type}</span><span className={entry.direction === "credit" ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{entry.direction === "credit" ? "+" : "-"}{formatRupiah(entry.amount)}</span></div>)}</div>}</div>
						</div>
					</div>
				</div>
			) : null}

			{confirmDeleteCustomers ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmDeleteCustomers(null); }}>
					<div role="dialog" aria-modal="true" aria-labelledby="bulk-delete-customer-title" className="w-full max-w-md rounded-[20px] border border-border bg-card p-4 shadow-xl">
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
