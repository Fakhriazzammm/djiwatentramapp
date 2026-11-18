import { createLazyFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";
import { Search, User, X, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { createClient } from "@/lib/client";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { adminProtectedRead } from "@/lib/admin-protected-read";
import { loadAllRows, loadCustomerRows } from "@/lib/customers-data";
import { Skeleton } from "@/components/ui/skeleton";
import { agoLabel, Avatar, Kpis, monoLabel, num, Panel, Pill, Rank, rupiah, SegmentBar, Tabs } from "@/components/djiwa-app/ui";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getDisplayOrderNumber } from "@djiwaapps/web-shared/lib/order-number";
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


type CustomerFilter = "all" | "active" | "wallet" | "member" | "buyer" | "reactivate" | "new";
const FILTERS = [["all", "Semua"], ["active", "Aktif ≤14 hari"], ["wallet", "Ada saldo"], ["member", "Member"], ["buyer", "Pernah belanja"], ["reactivate", "Perlu reaktivasi"], ["new", "Belum aktif"]] as const satisfies readonly (readonly [CustomerFilter, string])[];
type SortPreset = "new" | "active" | "spent" | "balance" | "visits" | "inactive" | "name" | "old";
const SORT_PRESETS = [["new", "Terbaru"], ["active", "Aktif terakhir"], ["spent", "Belanja terbanyak"], ["balance", "Saldo terbesar"], ["visits", "Kunjungan terbanyak"], ["inactive", "Paling lama tidak aktif"], ["name", "Nama A–Z"], ["old", "Terlama"]] as const satisfies readonly (readonly [SortPreset, string])[];
const SORT_MAP: Record<SortPreset, [CustomerSortKey, SortDirection]> = { new: ["created_at", "desc"], active: ["last_active_at", "desc"], spent: ["total_spent", "desc"], balance: ["wallet_balance", "desc"], visits: ["djiwaapp_visit_count", "desc"], inactive: ["inactive_days", "desc"], name: ["name", "asc"], old: ["created_at", "asc"] };
const PAGE_SIZE = 25;

function retentionPillTone(segment: RetentionSegment): "ok" | "warn" | "bad" | "" {
	return segment === "Aktif" ? "ok" : segment === "Perlu Diingatkan" ? "warn" : segment === "Belum Kembali" || segment === "Berisiko Hilang" ? "bad" : "";
}

function matchesFilter(customer: Customer, filter: CustomerFilter) {
	const segment = retentionSegment(customer);
	if (filter === "active") return segment === "Aktif";
	if (filter === "wallet") return (customer.wallet_balance || 0) > 0;
	if (filter === "member") return Boolean(customer.membership_expires_at && new Date(customer.membership_expires_at).getTime() > Date.now());
	if (filter === "buyer") return customer.total_orders > 0;
	if (filter === "reactivate") return segment === "Belum Kembali" || segment === "Berisiko Hilang";
	if (filter === "new") return segment === "Belum Aktif";
	return true;
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
	const [filter, setFilter] = useState<CustomerFilter>("all");
	const [page, setPage] = useState(1);
	const [sortPreset, setSortPreset] = useState<SortPreset>("spent");
	const [showAnalysis, setShowAnalysis] = useState(true);
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
			return loadCustomerRows(
				async () => {
					const data = await loadAllRows(async ([from, to]) => {
						const { data: page, error } = await supabase
							.from("pos_customers_view")
							.select("*")
							.order("total_spent", { ascending: false })
							.order("source_id", { ascending: true })
							.range(from, to);
						if (error) throw error;
						return (page ?? []) as Customer[];
					});
					return { data, error: null };
				},
				async () => {
					const data = await loadAllRows(
						(range) => adminProtectedRead("orders", {
							select: "_id,orderNumber,status,source,createdAt,totalAmount,customerSourceId,authUserId,customerEmail,customerName",
							in: {
								source: ["customer_self_service", "ordermieyamin_b2b"],
								status: ["paid", "completed"],
							},
							order: [{ column: "createdAt", ascending: false }, { column: "_id", ascending: false }],
							range,
						}),
						1000,
					);
					return { data, error: null };
				},
				(customerRows, orderRows) => {
					const settledOrders = orderRows.filter(isSettledOrder);
					return customerRows.map((customer) => {
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
			);
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
		loadAllRows(
			(range) => adminProtectedRead("orders", {
				select: "*",
				order: [{ column: "createdAt", ascending: false }, { column: "_id", ascending: false }],
				range,
			}),
			1000,
		)
			.then((data) => {
				if (!active) return;
				setSelectedCustomerOrders(data.filter((order: any) => customerMatchesOrder(detailCustomer, order)).slice(0, 50));
				setCustomerOrdersLoading(false);
			})
			.catch((error) => {
				if (!active) return;
				console.warn("[customers] order detail error:", error);
				setSelectedCustomerOrders([]);
				setCustomerOrdersLoading(false);
			});
		return () => { active = false; };
	}, [detailCustomer?.source_id]);

	const filteredCustomers = customers?.filter((c) => {
		const q = searchQuery.trim().toLowerCase();
		return matchesFilter(c, filter) && (
			!q ||
			(c.name || "").toLowerCase().includes(q) ||
			(c.email || "").toLowerCase().includes(q) ||
			(c.phone || "").toLowerCase().includes(q) ||
			(c.source_id || "").toLowerCase().includes(q)
		);
	});
	const sortedCustomers = [...(filteredCustomers ?? [])].sort((a, b) => {
		const left = customerSortValue(a, sortKey);
		const right = customerSortValue(b, sortKey);
		const comparison = typeof left === "string" && typeof right === "string" ? left.localeCompare(right, "id") : Number(left) - Number(right);
		return (sortDirection === "desc" ? -comparison : comparison) || String(a.name ?? "").localeCompare(String(b.name ?? ""), "id");
	});
	const applySortPreset = (preset: SortPreset) => {
		const [key, direction] = SORT_MAP[preset];
		setSortPreset(preset); setSortKey(key); setSortDirection(direction); setPage(1);
	};

	const toggleSelected = (sourceId: string) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(sourceId)) next.delete(sourceId);
			else next.add(sourceId);
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
			<div className="flex flex-col gap-3.5" aria-busy="true">
				<Skeleton className="h-8 w-48 rounded-none" />
				<Skeleton className="h-20 w-full rounded-none" />
				<Skeleton className="h-9 w-full rounded-none" />
				<Skeleton className="h-96 w-full rounded-none" />
			</div>
		);
	}

	const retentionColors: Record<RetentionSegment, string> = { "Belum Aktif": "#9a9aa6", Aktif: "#166534", "Perlu Diingatkan": "#9a6200", "Belum Kembali": "#c2570c", "Berisiko Hilang": "#c73822" };
	const retentionCounts = RETENTION_ORDER.map((segment) => ({ label: segment, value: customers.filter((customer) => retentionSegment(customer) === segment).length, color: retentionColors[segment] }));
	const now = Date.now();
	const withBalance = customers.filter((customer) => (customer.wallet_balance || 0) > 0);
	const members = customers.filter((customer) => customer.membership_expires_at && new Date(customer.membership_expires_at).getTime() > now);
	const buyers = customers.filter((customer) => customer.total_orders > 0);
	const totalSpent = customers.reduce((sum, customer) => sum + (customer.total_spent || 0), 0);
	const totalBalance = customers.reduce((sum, customer) => sum + (customer.wallet_balance || 0), 0);
	const activeNow = customers.filter((customer) => customerPresence(customer) === "online").length;
	const joinedLast7 = customers.filter((customer) => now - new Date(customer.created_at).getTime() <= 7 * 86400000).length;
	const joinedPrev7 = customers.filter((customer) => { const age = now - new Date(customer.created_at).getTime(); return age > 7 * 86400000 && age <= 14 * 86400000; }).length;
	const needReactivation = customers.filter((customer) => ["Belum Kembali", "Berisiko Hilang"].includes(retentionSegment(customer)));
	const reactivationBalance = needReactivation.reduce((sum, customer) => sum + (customer.wallet_balance || 0), 0);
	const filterCounts: Record<CustomerFilter, number> = {
		all: customers.length,
		active: retentionCounts[1].value,
		wallet: withBalance.length,
		member: members.length,
		buyer: buyers.length,
		reactivate: needReactivation.length,
		new: retentionCounts[0].value,
	};
	const topSpenders = [...customers].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)).filter((customer) => customer.total_spent > 0).slice(0, 6);
	const topBalances = [...withBalance].sort((a, b) => b.wallet_balance - a.wallet_balance).slice(0, 6);
	const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageRows = sortedCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
	const pageAllSelected = pageRows.length > 0 && pageRows.every((customer) => selectedIds.has(customer.source_id));
	const togglePage = () => setSelectedIds((current) => {
		const next = new Set(current);
		pageRows.forEach((customer) => pageAllSelected ? next.delete(customer.source_id) : next.add(customer.source_id));
		return next;
	});

	return (
		<div className="flex min-w-0 flex-col gap-3.5 pb-24 md:pb-8">
			<div className="flex items-end justify-between gap-3">
				<div>
					<div className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground">DJIWA APP / PELANGGAN</div>
					<h1 className="text-[19px] font-semibold leading-tight tracking-tight">Pelanggan</h1>
				</div>
				<div className="flex items-center gap-2">
					<button type="button" onClick={() => setShowAnalysis((value) => !value)} className="h-[34px] border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30">{showAnalysis ? "Sembunyikan analisis" : "Tampilkan analisis"}</button>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={(props) => (
								<button {...props} type="button" className="inline-flex h-[34px] items-center gap-1.5 border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Buka menu export customer">
									<Download className="h-3.5 w-3.5" />
									<span>Export</span>
								</button>
							)}
						/>
						<DropdownMenuContent align="end" side="bottom" sideOffset={6} style={{ zIndex: 9999 }} className="z-[9999] w-[276px] p-2">
							<DropdownMenuLabel className="px-2 py-1 text-[11px]">Export {selectedCustomers.length ? `${selectedCustomers.length} dipilih` : `${sortedCustomers.length} terlihat`}</DropdownMenuLabel>
							<div className="space-y-1.5">
								{(["email", "phone", "full"] as const).map((mode) => (
									<div key={mode} className="bg-muted/40 px-2 py-1.5">
										<p className="mb-1 text-[10px] font-bold text-muted-foreground">{mode === "email" ? "Email" : mode === "phone" ? "Nomor telepon" : "Semua data"}</p>
										<div className="grid grid-cols-4 gap-1">
											{(["xlsx", "csv", "vcf", "pdf"] as const).map((formatType) => (
												<button key={formatType} type="button" onClick={() => exportCustomers(selectedCustomers.length ? selectedCustomers : sortedCustomers, mode, formatType)} className="h-7 border border-border bg-background px-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted">{formatType}</button>
											))}
										</div>
									</div>
								))}
							</div>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<Kpis cols={6} items={[
				{ label: "Total pelanggan", value: num(customers.length), hint: `${num(activeNow)} sedang aktif` },
				{ label: "Pendaftar 7 hari", value: num(joinedLast7), delta: { cur: joinedLast7, prev: joinedPrev7 }, hint: "vs 7 hari lalu" },
				{ label: "Aktif ≤14 hari", value: num(retentionCounts[1].value), hint: `${customers.length ? Math.round((retentionCounts[1].value / customers.length) * 100) : 0}% basis`, tone: "ok" },
				{ label: "Pernah belanja", value: num(buyers.length), hint: `${customers.length ? Math.round((buyers.length / customers.length) * 100) : 0}% konversi` },
				{ label: "Total belanja", value: rupiah(totalSpent), hint: buyers.length ? `rata-rata ${rupiah(totalSpent / buyers.length)}` : undefined },
				{ label: "Saldo Djiwa Pay", value: rupiah(totalBalance), hint: `${num(withBalance.length)} pelanggan`, tone: "ok" },
			]} />

			{showAnalysis ? (
				<div className="grid gap-3.5 lg:grid-cols-3">
					<Panel title="Segmen retensi" meta={`${num(needReactivation.length)} perlu reaktivasi`}>
						<SegmentBar rows={retentionCounts} />
						{needReactivation.length ? <p className="mt-3 border-t border-border pt-2.5 text-[11.5px] text-muted-foreground">{num(needReactivation.length)} pelanggan tidak aktif &gt;30 hari menyimpan saldo {rupiah(reactivationBalance)}. Prioritaskan voucher/pesan pengingat.</p> : null}
					</Panel>
					<Panel title="Belanja terbesar" meta="seumur hidup">
						<Rank color="#7c3aed" rows={topSpenders.map((customer) => ({ label: customer.name || customer.email || "Tanpa nama", value: customer.total_spent, text: rupiah(customer.total_spent), sub: `${num(customer.total_orders)} pesanan` }))} empty="Belum ada pelanggan yang berbelanja." />
					</Panel>
					<Panel title="Saldo terbesar" meta="dompet Djiwa Pay">
						<Rank color="#166534" rows={topBalances.map((customer) => ({ label: customer.name || customer.email || "Tanpa nama", value: customer.wallet_balance, text: rupiah(customer.wallet_balance), sub: customer.wallet_held_balance ? `tertahan ${rupiah(customer.wallet_held_balance)}` : undefined }))} empty="Belum ada saldo tersimpan." />
					</Panel>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2.5">
				<div className="relative min-w-[240px] flex-1">
					<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input className="h-[34px] w-full border border-border bg-card pr-3 pl-9 text-[13px] outline-none focus:border-foreground/40" type="search" placeholder="Cari nama, email, nomor HP, atau ID…" aria-label="Cari pelanggan" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }} />
				</div>
				<select aria-label="Urutkan" value={sortPreset} onChange={(event) => applySortPreset(event.target.value as SortPreset)} className="h-[34px] border border-border bg-card px-2.5 text-[13px]">{SORT_PRESETS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
			</div>

			<Tabs items={FILTERS.map(([key, label]) => [key, label, filterCounts[key]] as const)} value={filter} onChange={(next) => { setFilter(next); setPage(1); }} />

			{selectedCustomers.length > 0 ? (
				<div className="flex items-center justify-between gap-2 border border-red-200 bg-red-50 p-2.5 text-red-900">
					<span className="text-xs font-bold">{selectedCustomers.length} customer dipilih</span>
					<div className="flex gap-2">
						<button type="button" onClick={() => setSelectedIds(new Set())} className="h-9 border border-red-200 bg-white px-3 text-xs font-bold">Batal pilih</button>
						<button type="button" onClick={() => setConfirmDeleteCustomers(selectedCustomers)} className="h-9 bg-red-600 px-3 text-xs font-black text-white">Nonaktifkan terpilih</button>
					</div>
				</div>
			) : null}

			<Panel title={`${num(sortedCustomers.length)} pelanggan`} meta={`halaman ${currentPage}/${totalPages}`} flush>
				{pageRows.length === 0 ? (
					<p className="py-14 text-center text-sm text-muted-foreground">Tidak ada pelanggan yang cocok.</p>
				) : (
					<>
						{/* Mobile: card list */}
						<div className="divide-y divide-border md:hidden">
							{pageRows.map((c) => (
								<div key={c.source_id} className="flex cursor-pointer items-start gap-3 px-3.5 py-3 active:bg-muted/50" onClick={() => setDetailCustomer(c)}>
									<input type="checkbox" aria-label={`Pilih ${c.name || "customer"}`} checked={selectedIds.has(c.source_id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(c.source_id)} className="mt-2 h-4 w-4 shrink-0 accent-[#111114]" />
									<Avatar name={c.name} photo={c.photo_url} />
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline justify-between gap-2"><b className="truncate text-[13px]">{c.name || "Tanpa nama"}</b><span className="shrink-0 text-xs font-semibold text-emerald-700">{rupiah(c.wallet_balance)}</span></div>
										<small className="block truncate text-[11.5px] text-muted-foreground">{c.email || c.phone || c.source_id.slice(0, 10)}</small>
										<div className="mt-1 flex flex-wrap items-center gap-y-1 text-[11px] text-muted-foreground"><Pill tone={retentionPillTone(retentionSegment(c))}>{retentionSegment(c)}</Pill>{c.total_orders > 0 ? <span>{num(c.total_orders)} pesanan · {rupiah(c.total_spent)}</span> : null}<span className="ml-auto">{agoLabel(c.last_active_at)}</span></div>
									</div>
								</div>
							))}
						</div>
						{/* Desktop: table */}
						<div className="hidden overflow-x-auto md:block">
							<table className="w-full border-collapse text-[12.5px]">
								<thead>
									<tr className="border-b border-border">
										<th className="w-10 px-3.5 py-2.5"><input type="checkbox" aria-label="Pilih semua di halaman ini" checked={pageAllSelected} onChange={togglePage} className="h-4 w-4 accent-[#111114]" /></th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-left`}>Pelanggan</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Saldo</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Belanja</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Kunjungan</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-left`}>Member</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-left`}>Status</th>
										<th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Daftar</th>
									</tr>
								</thead>
								<tbody>
									{pageRows.map((c) => {
										const segment = retentionSegment(c);
										const memberActive = c.membership_expires_at && new Date(c.membership_expires_at).getTime() > now;
										return (
											<tr key={c.source_id} className="cursor-pointer border-b border-muted last:border-0 hover:bg-[#fafafb]" onClick={() => setDetailCustomer(c)}>
												<td className="px-3.5 py-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Pilih ${c.name || "customer"}`} checked={selectedIds.has(c.source_id)} onChange={() => toggleSelected(c.source_id)} className="h-4 w-4 accent-[#111114]" /></td>
												<td className="px-3.5 py-2.5"><div className="flex min-w-0 items-center gap-2.5"><Avatar name={c.name} photo={c.photo_url} /><div className="min-w-0"><b className="block max-w-[260px] truncate">{c.name || "Tanpa nama"}</b><small className="block max-w-[260px] truncate text-[11.5px] text-muted-foreground">{c.email || c.phone || c.source_id.slice(0, 10)}</small></div></div></td>
												<td className={`px-3.5 py-2.5 text-right tabular-nums ${c.wallet_balance > 0 ? "font-semibold text-emerald-700" : ""}`}>{rupiah(c.wallet_balance)}</td>
												<td className="px-3.5 py-2.5 text-right tabular-nums">{rupiah(c.total_spent)}<small className="block text-[11.5px] text-muted-foreground">{num(c.total_orders)} pesanan</small></td>
												<td className="px-3.5 py-2.5 text-right tabular-nums">{num(c.djiwaapp_visit_count ?? 0)}</td>
												<td className="px-3.5 py-2.5">{memberActive ? <><Pill tone="ok">member</Pill><small className="block text-[11.5px] text-muted-foreground">s/d {formatMembershipExpiry(c.membership_expires_at)}</small></> : <span className="text-muted-foreground">—</span>}</td>
												<td className="px-3.5 py-2.5"><Pill tone={retentionPillTone(segment)}>{segment}</Pill>{customerPresence(c) === "online" ? <Pill tone="ok">online</Pill> : null}<small className="block text-[11.5px] text-muted-foreground">{agoLabel(latestCustomerActivity(c) ? new Date(latestCustomerActivity(c)).toISOString() : null)}</small></td>
												<td className="px-3.5 py-2.5 text-right tabular-nums">{formatDate(c.created_at)}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</>
				)}
				{totalPages > 1 ? (
					<div className="flex items-center justify-between border-t border-border px-3.5 py-2.5 text-muted-foreground">
						<button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="h-8 border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-40">← Sebelumnya</button>
						<span className="text-xs">{currentPage} / {totalPages}</span>
						<button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="h-8 border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-40">Berikutnya →</button>
					</div>
				) : null}
			</Panel>

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
						<div className="mt-4 rounded-xl border border-border p-3"><p className="text-xs font-black">Riwayat pembelian</p>{customerOrdersLoading ? <p className="mt-2 text-xs text-muted-foreground">Memuat riwayat order...</p> : selectedCustomerOrders.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada order yang terhubung.</p> : <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">{selectedCustomerOrders.map((order: any) => <div key={order._id} className="rounded-lg bg-muted/30 p-2 text-[11px]"><div className="flex justify-between gap-2"><span className="font-bold">#{getDisplayOrderNumber(order.orderNumber, { sequence: order.dailyReceiptNo ?? order.daily_receipt_no, createdAt: order.createdAt, source: order.source, sourceApp: order.sourceApp, businessUnit: order.businessUnit, orderType: order.orderType, platform: order.platform, brandSlug: order.brandSlug ?? order.brand_slug })}</span><span className="font-bold">{formatRupiah(Number(order.totalAmount || 0))}</span></div><div className="mt-1 text-muted-foreground">{order.status || "-"} · {formatDate(order.createdAt ? new Date(Number(order.createdAt)).toISOString() : null, true)}</div>{Array.isArray(order.items) && order.items.length > 0 ? <div className="mt-1 text-muted-foreground">{order.items.map((item: any) => `${item.quantity || 0}× ${item.productName || item.name || "Item"}`).join(", ")}</div> : null}</div>)}</div>}</div><div className="mt-4 rounded-xl border border-border p-3"><p className="text-xs font-black">Riwayat Djiwa Pay</p>{walletLedgerLoading ? <p className="mt-2 text-xs text-muted-foreground">Memuat ledger...</p> : walletLedger.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada transaksi Djiwa Pay.</p> : <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{walletLedger.slice(0, 20).map((entry) => <div key={entry.id} className="flex justify-between gap-2 border-b border-border/60 pb-1.5 text-[11px] last:border-0"><span className="min-w-0 truncate">{entry.note || entry.transaction_type}</span><span className={entry.direction === "credit" ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{entry.direction === "credit" ? "+" : "-"}{formatRupiah(entry.amount)}</span></div>)}</div>}</div>
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
