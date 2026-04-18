import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Wallet, Pencil, Trash2, Search, Filter, ArrowUpDown, Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import type { DateRange } from "../../reports/-components/period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import { toast } from "sonner";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";

const EXPENSE_CATEGORIES = [
	"makanan_minuman",
	"belanja_stok",
	"peralatan_kantor",
	"transportasi",
	"utilitas_listrik_air",
	"gaji_karyawan",
	"sewa_tempat",
	"pemasaran",
	"pajak",
	"hiburan",
	"kesehatan",
	"pembangunan_renovasi",
	"lainnya",
];

interface Props {
	range: DateRange;
	viewMode: "transaction" | "item";
	groupMode?: "flat" | "grouped";
}

export function TransactionDetailReport({ range, viewMode, groupMode = "flat" }: Props) {
	const [filterType, setFilterType] = useState<"income" | "expense" | undefined>(undefined);
	const [filterCategory, setFilterCategory] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [minAmount, setMinAmount] = useState<string>("");
	const [maxAmount, setMaxAmount] = useState<string>("");
	const [sortBy, setSortBy] = useState<"date" | "amount">("date");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
	const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [scrollTop, setScrollTop] = useState(0);
	const [editingItemRowKey, setEditingItemRowKey] = useState<string | null>(null);
	const [itemEditDraft, setItemEditDraft] = useState<{ qty: string; price: string; subtotal: string } | null>(null);
	const [savingItemRowKey, setSavingItemRowKey] = useState<string | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	
	const deleteTransaction = useMutation(api.finance.deleteTransaction);
	const deleteTransactionsBulk = useMutation(api.finance.deleteTransactionsBulk);
	const deleteTransactionScanItem = useMutation((api as any).finance.deleteTransactionScanItem);
	const updateTransactionScanItem = useMutation((api as any).finance.updateTransactionScanItem);

	const data = useQuery(api.finance.getTransactionDetailReport, {
		startDate: range.startDate,
		endDate: range.endDate,
		type: filterType,
		category: filterCategory || undefined,
		viewMode,
		page,
		pageSize,
	});

	const historicalShifts = useQuery(api.finance.getHistoricalShifts, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	// Client-side filtering for search and amount range
	const filteredTransactions = useMemo(() => {
		if (!data?.transactions) return [];
		
		let result = [...data.transactions];

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(t => 
				t.merchant?.toLowerCase().includes(query) || 
				t.description?.toLowerCase().includes(query) ||
				t.displayTitle?.toLowerCase().includes(query) ||
				t.category.toLowerCase().includes(query) ||
				t.sourceLabel?.toLowerCase().includes(query) ||
				t.receiptGroupLabel?.toLowerCase().includes(query) ||
				t.referenceValue?.toLowerCase().includes(query) ||
				t.rawText?.toLowerCase().includes(query) ||
				t.sourceRef?.toLowerCase().includes(query) ||
				t.sourceFingerprint?.toLowerCase().includes(query) ||
				t.receiptNumber?.toLowerCase().includes(query) ||
				t.paymentMethod?.toLowerCase().includes(query) ||
				t.metadata?.receiptDetails?.merchantName?.toLowerCase().includes(query) ||
				t.metadata?.receiptDetails?.receiptNumber?.toLowerCase().includes(query) ||
				String(t.metadata?.receiptDetails?.tax ?? "").toLowerCase().includes(query) ||
				String(t.metadata?.receiptDetails?.serviceCharge ?? "").toLowerCase().includes(query) ||
				String(t.metadata?.receiptDetails?.discount ?? "").toLowerCase().includes(query) ||
				t.metadata?.scanItems?.some((item: any) => item.name?.toLowerCase().includes(query))
			);
		}

		// Amount range filter
		if (minAmount) {
			result = result.filter(t => t.amount >= Number(minAmount));
		}
		if (maxAmount) {
			result = result.filter(t => t.amount <= Number(maxAmount));
		}

		// Sorting
		result.sort((a, b) => {
			if (sortBy === "date") {
				return sortOrder === "asc" ? a.date - b.date : b.date - a.date;
			} else {
				return sortOrder === "asc" ? a.amount - b.amount : b.amount - a.amount;
			}
		});

		return result;
	}, [data?.transactions, searchQuery, minAmount, maxAmount, sortBy, sortOrder]);

	const filteredRowKeys = useMemo(
		() =>
			filteredTransactions.map((transaction: any) =>
				String(transaction.rowKey || transaction._id)
			),
		[filteredTransactions]
	);
	const displayedRows = useMemo(() => {
		if (viewMode !== "item" || groupMode !== "grouped") {
			return filteredTransactions;
		}
		const groups = new Map<string, any[]>();
		for (const row of filteredTransactions) {
			const key = String(row.receiptGroupId || row._id);
			const bucket = groups.get(key) || [];
			bucket.push(row);
			groups.set(key, bucket);
		}
		const rows: any[] = [];
		for (const [groupKey, members] of groups.entries()) {
			const head = members[0];
			const groupAmount = members.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
			rows.push({
				rowType: "group_header",
				rowKey: `group::${groupKey}`,
				groupKey,
				groupLabel: head?.receiptGroupLabel || "GRUP",
				groupTitle: head?.displayTitle || head?.merchant || "-",
				groupType: head?.type,
				groupCount: members.length,
				groupAmount,
				isCollapsed: collapsedGroups.has(groupKey),
			});
			if (!collapsedGroups.has(groupKey)) {
				rows.push(...members);
			}
		}
		return rows;
	}, [filteredTransactions, viewMode, groupMode, collapsedGroups]);
	const virtualized = useMemo(() => {
		const shouldVirtualize = displayedRows.length > 120;
		if (!shouldVirtualize) {
			return {
				rows: displayedRows,
				topSpacer: 0,
				bottomSpacer: 0,
				shouldVirtualize: false,
			};
		}
		const rowHeight = 54;
		const overscan = 12;
		const viewportHeight = 620;
		const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
		const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
		const endIndex = Math.min(displayedRows.length, startIndex + visibleCount);
		return {
			rows: displayedRows.slice(startIndex, endIndex),
			topSpacer: startIndex * rowHeight,
			bottomSpacer: Math.max(0, (displayedRows.length - endIndex) * rowHeight),
			shouldVirtualize: true,
		};
	}, [displayedRows, scrollTop]);
	const rowNumberByKey = useMemo(() => {
		const numbers = new Map<string, number>();
		let counter = 0;
		for (const row of displayedRows) {
			if (row.rowType === "group_header") continue;
			counter += 1;
			numbers.set(String(row.rowKey || row._id), counter);
		}
		return numbers;
	}, [displayedRows]);

	const selectedVisibleCount = useMemo(
		() => filteredRowKeys.filter((rowKey) => selectedRowKeys.has(rowKey)).length,
		[filteredRowKeys, selectedRowKeys]
	);

	const allVisibleSelected = filteredRowKeys.length > 0 && selectedVisibleCount === filteredRowKeys.length;

	useEffect(() => {
		setSelectedRowKeys((prev) => {
			if (prev.size === 0) return prev;
			const filteredIdSet = new Set(filteredRowKeys);
			const next = new Set([...prev].filter((rowKey) => filteredIdSet.has(rowKey)));
			return next.size === prev.size ? prev : next;
		});
	}, [filteredRowKeys]);

	useEffect(() => {
		setPage(1);
	}, [range.startDate, range.endDate, filterType, filterCategory, viewMode, pageSize]);

	useEffect(() => {
		setScrollTop(0);
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop = 0;
		}
	}, [page, pageSize, viewMode, groupMode, searchQuery, sortBy, sortOrder]);

	const categoryBadge = (category: string, type: string) => {
		const colorMap: Record<string, string> = {
			makanan_minuman: "border-orange-200 bg-orange-50 text-orange-700",
			belanja_stok: "border-blue-200 bg-blue-50 text-blue-700",
			peralatan_kantor: "border-purple-200 bg-purple-50 text-purple-700",
			utilitas_listrik_air: "border-yellow-200 bg-yellow-50 text-yellow-700",
			transportasi: "border-cyan-200 bg-cyan-50 text-cyan-700",
			Penjualan: "border-green-200 bg-green-50 text-green-700",
		};
		const color = colorMap[category] || "border-gray-200 bg-gray-50 text-gray-700";
		return (
			<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`}>
				{category.replace(/_/g, " ")}
			</span>
		);
	};

	const handleDelete = async (transaction: any) => {
		if (viewMode === "item" && transaction.rowType === "receipt_item") {
			if (
				!confirm(
					`Hapus item ${transaction.receiptItemIndex}/${transaction.receiptItemCount} dari struk ini?`
				)
			) {
				return;
			}
			try {
				await deleteTransactionScanItem({
					id: transaction._id,
					itemIndex: Number(transaction.itemIndex) || 0,
				});
				toast.success("Item struk berhasil dihapus");
			} catch (error) {
				console.error(error);
				toast.error("Gagal menghapus item struk");
			}
			return;
		}
		if (
			viewMode === "item" &&
			(transaction.rowType === "order_item" || transaction.rowType === "booking_item")
		) {
			toast.error("Item order/booking tidak bisa dihapus dari tabel ini. Ubah di modul Order/Booking.");
			return;
		}
		if (!confirm("Apakah Anda yakin ingin menghapus transaksi ini?")) return;
		try {
			await deleteTransaction({ id: transaction._id });
			setSelectedRowKeys((prev) => {
				const next = new Set(
					[...prev].filter((rowKey) => !rowKey.startsWith(`${transaction._id}`))
				);
				if (next.size === prev.size) return prev;
				return next;
			});
			toast.success("Transaksi berhasil dihapus");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus transaksi");
		}
	};

	const sourceBadge = (sourceLabel?: string, sourceType?: string) => {
		const colorMap: Record<string, string> = {
			ai_bulk_finance: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
			ai_tool: "border-violet-200 bg-violet-50 text-violet-700",
			ai_receipt_scan: "border-sky-200 bg-sky-50 text-sky-700",
			manual: "border-slate-200 bg-slate-50 text-slate-700",
		};
		const color = colorMap[sourceType || "manual"] || "border-slate-200 bg-slate-50 text-slate-700";
		return (
			<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`}>
				{sourceLabel || "Manual"}
			</span>
		);
	};

	const handleToggleRow = (rowKey: string) => {
		setSelectedRowKeys((prev) => {
			const next = new Set(prev);
			if (next.has(rowKey)) {
				next.delete(rowKey);
			} else {
				next.add(rowKey);
			}
			return next;
		});
	};

	const handleToggleSelectAll = () => {
		setSelectedRowKeys((prev) => {
			const next = new Set(prev);
			if (allVisibleSelected) {
				for (const rowKey of filteredRowKeys) {
					next.delete(rowKey);
				}
			} else {
				for (const rowKey of filteredRowKeys) {
					next.add(rowKey);
				}
			}
			return next;
		});
	};

	const toggleGroup = (groupKey: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupKey)) next.delete(groupKey);
			else next.add(groupKey);
			return next;
		});
	};

	const handleBulkDelete = async () => {
		const selectedRows = filteredTransactions.filter((transaction: any) => {
			const rowKey = String(transaction.rowKey || transaction._id);
			return selectedRowKeys.has(rowKey);
		});
		if (selectedRows.length === 0) return;

		const receiptItemRows = selectedRows.filter((row: any) => row.rowType === "receipt_item");
		const unDeletableItemRows = selectedRows.filter(
			(row: any) => row.rowType === "order_item" || row.rowType === "booking_item"
		);
		const transactionRows = selectedRows.filter(
			(row: any) =>
				row.rowType === "transaction" ||
				row.rowType === undefined ||
				row.rowType === null
		);
		const idsToDelete = [
			...new Set(transactionRows.map((transaction: any) => transaction._id as Id<"financialTransactions">)),
		];
		if (
			!confirm(
				`Hapus ${idsToDelete.length} transaksi dan ${receiptItemRows.length} item struk terpilih?`
			)
		) {
			return;
		}

		try {
			if (idsToDelete.length > 0) {
				await deleteTransactionsBulk({ ids: idsToDelete });
			}
			if (receiptItemRows.length > 0) {
				await Promise.all(
					receiptItemRows.map((row: any) =>
						deleteTransactionScanItem({
							id: row._id,
							itemIndex: Number(row.itemIndex) || 0,
						})
					)
				);
			}
			setSelectedRowKeys(new Set());
			if (unDeletableItemRows.length > 0) {
				toast.warning(
					`${idsToDelete.length} transaksi & ${receiptItemRows.length} item struk dihapus. ${unDeletableItemRows.length} item order/booking dilewati.`
				);
			} else {
				toast.success(`${idsToDelete.length} transaksi & ${receiptItemRows.length} item struk berhasil dihapus`);
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus transaksi terpilih");
		}
	};

	const getReceiptItemDefaults = (transaction: any) => {
		const scanItems = Array.isArray(transaction.metadata?.scanItems)
			? transaction.metadata.scanItems
			: [];
		const item = scanItems[Number(transaction.itemIndex) || 0] || {};
		const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
		const subtotalFromItem =
			Number(item.total) > 0
				? Number(item.total)
				: Number(item.price) > 0
					? Number(item.price) * qty
					: Number(transaction.amount) || 0;
		const price =
			Number(item.price) > 0
				? Number(item.price)
				: qty > 0
					? subtotalFromItem / qty
					: 0;
		return {
			qty: String(Math.max(1, Math.round(qty))),
			price: String(Math.max(0, Math.round(price))),
			subtotal: String(Math.max(0, Math.round(subtotalFromItem))),
		};
	};

	const startInlineEditItem = (transaction: any) => {
		if (transaction.rowType !== "receipt_item") {
			toast.error("Quick edit hanya untuk item struk hasil scan");
			return;
		}
		const rowKey = String(transaction.rowKey || transaction._id);
		setEditingItemRowKey(rowKey);
		setItemEditDraft(getReceiptItemDefaults(transaction));
	};

	const cancelInlineEditItem = () => {
		setEditingItemRowKey(null);
		setItemEditDraft(null);
	};

	const saveInlineEditItem = async (transaction: any) => {
		if (transaction.rowType !== "receipt_item") {
			toast.error("Edit item hanya untuk baris item struk");
			return;
		}
		const rowKey = String(transaction.rowKey || transaction._id);
		if (!itemEditDraft) {
			toast.error("Data edit item belum terisi");
			return;
		}
		const qty = Number(itemEditDraft.qty);
		const price = Number(itemEditDraft.price);
		const subtotal = Number(itemEditDraft.subtotal);
		if (!Number.isFinite(qty) || qty <= 0) {
			toast.error("Qty harus angka lebih dari 0");
			return;
		}
		if (!Number.isFinite(price) || price < 0) {
			toast.error("Harga harus angka valid");
			return;
		}
		if (!Number.isFinite(subtotal) || subtotal < 0) {
			toast.error("Subtotal harus angka valid");
			return;
		}
		try {
			setSavingItemRowKey(rowKey);
			await updateTransactionScanItem({
				id: transaction._id,
				itemIndex: Number(transaction.itemIndex) || 0,
				quantity: qty,
				price,
				total: subtotal,
			});
			cancelInlineEditItem();
			toast.success("Item struk berhasil diperbarui");
		} catch (error) {
			console.error(error);
			toast.error("Gagal memperbarui item struk");
		} finally {
			setSavingItemRowKey(null);
		}
	};

	const handleEdit = (transaction: any) => {
		setSelectedTransaction(transaction);
		setIsEditDialogOpen(true);
	};

	const getReferenceHref = (transaction: any) => {
		const referenceValue = String(
			transaction.referenceValue || transaction.metadata?.sourceRef || ""
		).trim();
		const referenceLabel = String(transaction.referenceLabel || "").toLowerCase();

		if (!referenceValue) {
			return null;
		}

		if (
			referenceLabel.includes("booking") ||
			referenceValue.toUpperCase().startsWith("BK")
		) {
			return `/admin/orders?focusBooking=${encodeURIComponent(referenceValue)}`;
		}

		if (
			referenceLabel.includes("order") ||
			referenceLabel.includes("pesanan") ||
			/^(ORD|SO|BKO)-/i.test(referenceValue)
		) {
			return `/admin/orders?focusOrder=${encodeURIComponent(referenceValue)}`;
		}

		if (
			referenceLabel.includes("stok") ||
			referenceLabel.includes("inventory") ||
			referenceLabel.includes("bahan")
		) {
			return "/admin/inventory";
		}

		if (
			referenceLabel.includes("produk") ||
			referenceLabel.includes("product")
		) {
			return "/admin/products";
		}

		return null;
	};

	const columnCount = viewMode === "item" ? 17 : 16;

	return (
		<div className="space-y-2 p-2">
			{/* Filters & Search */}
			<div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex gap-1 rounded-lg bg-muted/50 p-1">
						{(["all", "income", "expense"] as const).map((t) => (
							<button
								key={t}
							type="button"
							onClick={() => setFilterType(t === "all" ? undefined : t)}
							className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
								(t === "all" && !filterType) || filterType === t
									? t === "income"
										? "bg-green-600 text-white shadow-sm"
										: t === "expense"
											? "bg-red-600 text-white shadow-sm"
											: "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`}
						>
							{t === "all" ? "Semua" : t === "income" ? "Pemasukan" : "Pengeluaran"}
						</button>
					))}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
							<input
								type="text"
								placeholder="Cari transaksi..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-7 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-[10px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							/>
						</div>
						<select
							value={filterCategory}
							onChange={(e) => setFilterCategory(e.target.value)}
							className="h-7 rounded-md border border-input bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="">Semua Kategori</option>
							{EXPENSE_CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat.replace(/_/g, " ")}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
					<div className="flex flex-wrap items-center gap-2">
						<Filter className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Nominal:</span>
						<div className="flex items-center gap-1.5">
							<input
								type="number"
								placeholder="Min"
								value={minAmount}
								onChange={(e) => setMinAmount(e.target.value)}
								className="h-6 w-20 rounded-md border border-input bg-background px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
							/>
							<span className="text-muted-foreground">-</span>
							<input
								type="number"
								placeholder="Max"
								value={maxAmount}
								onChange={(e) => setMaxAmount(e.target.value)}
								className="h-6 w-20 rounded-md border border-input bg-background px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
					</div>

					<div className="h-4 w-px bg-border hidden md:block" />

					<div className="flex flex-wrap items-center gap-2">
						<ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Urutkan:</span>
						<div className="flex gap-1">
							<button
								onClick={() => {
									if (sortBy === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
									else setSortBy("date");
								}}
								className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${sortBy === "date" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
							>
								Tanggal {sortBy === "date" && (sortOrder === "asc" ? "ASC" : "DESC")}
							</button>
							<button
								onClick={() => {
									if (sortBy === "amount") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
									else setSortBy("amount");
								}}
								className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${sortBy === "amount" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
							>
								Nominal {sortBy === "amount" && (sortOrder === "asc" ? "ASC" : "DESC")}
							</button>
						</div>
					</div>
					
					{(searchQuery || minAmount || maxAmount || filterCategory) && (
						<button 
							onClick={() => {
								setSearchQuery("");
								setMinAmount("");
								setMaxAmount("");
								setFilterCategory("");
							}}
							className="text-[10px] text-primary hover:underline ml-auto"
						>
							Reset Filter
						</button>
					)}
				</div>
			</div>

			{/* Summary */}
			{data && (
				<div className="flex flex-wrap gap-1.5 rounded-xl border border-border/80 bg-muted/20 px-2.5 py-2 text-[10px]">
					<div className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
						<span className="text-muted-foreground">Total Pemasukan: </span>
						<span className="font-bold text-green-600">{formatCurrencyIDR(data.totalIncome)}</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
						<span className="text-muted-foreground">Total Pengeluaran: </span>
						<span className="font-bold text-red-600">{formatCurrencyIDR(data.totalExpense)}</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
						<span className="text-muted-foreground">Saldo Bersih: </span>
						<span className={`font-bold ${data.netBalance >= 0 ? "text-blue-600" : "text-red-600"}`}>
							{formatCurrencyIDR(data.netBalance)}
						</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
						<span className="text-muted-foreground">
							{viewMode === "item" ? "Jumlah Baris: " : "Jumlah Transaksi: "}
						</span>
						<span className="font-bold">{data.count}</span>
					</div>
				</div>
			)}

			{selectedVisibleCount > 0 && (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2">
					<p className="text-xs text-foreground">
						<span className="font-semibold">{selectedVisibleCount}</span> baris dipilih
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setSelectedRowKeys(new Set())}
							className="rounded-md px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
						>
							Batal Pilih
						</button>
						<button
							type="button"
							onClick={handleBulkDelete}
							className="inline-flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
						>
							<Trash2 className="h-3.5 w-3.5" />
							Hapus Terpilih
						</button>
					</div>
				</div>
			)}

			{data && (
				<div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-card/60 px-2.5 py-1.5">
					<span className="inline-flex rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground">
						{filteredTransactions.length} {viewMode === "item" ? "baris" : "transaksi"} tampil
					</span>
				</div>
			)}

			{/* Transactions Table */}
			<div className="overflow-hidden rounded-xl border border-border/80 bg-card">
				<div
					ref={scrollContainerRef}
					onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
					className="max-h-[74vh] overflow-auto"
				>
					<table className="w-full min-w-[1180px] table-auto text-left text-[10px]">
						<colgroup>
							<col style={{ width: "36px" }} />
							<col style={{ width: "48px" }} />
							<col style={{ width: "96px" }} />
							<col style={{ width: "86px" }} />
							<col style={{ width: "92px" }} />
							<col style={{ width: "112px" }} />
							{viewMode === "item" && <col style={{ width: "120px" }} />}
							<col />
							<col />
							<col style={{ width: "148px" }} />
							<col style={{ width: "112px" }} />
							<col style={{ width: "84px" }} />
							<col style={{ width: "110px" }} />
							<col style={{ width: "190px" }} />
							<col style={{ width: "170px" }} />
							<col style={{ width: "120px" }} />
							<col style={{ width: "68px" }} />
						</colgroup>
						<thead className="sticky top-0 z-10 bg-muted/70 text-[9px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
							<tr>
								<th className="w-9 px-1.5 py-1.5">
									<div className="flex items-center justify-center">
										<Checkbox
											checked={allVisibleSelected}
											onCheckedChange={handleToggleSelectAll}
											aria-label="Pilih semua transaksi di tabel"
											disabled={filteredRowKeys.length === 0}
											className="rounded-sm border-muted-foreground/40 bg-background data-checked:border-primary data-checked:bg-primary"
										/>
									</div>
								</th>
								<th className="w-12 px-1.5 py-1.5 text-center">No</th>
								<th className="w-24 px-2 py-1.5">Tanggal</th>
								<th className="w-[86px] px-2 py-1.5">Tipe</th>
								<th className="w-[92px] px-2 py-1.5">Shift</th>
								<th className="w-28 px-2 py-1.5">Sumber</th>
								{viewMode === "item" && <th className="w-[120px] px-2 py-1.5">Grup Referensi</th>}
								<th className="px-2 py-1.5">Merchant</th>
								<th className="px-2 py-1.5">Deskripsi</th>
								<th className="w-[148px] px-2 py-1.5">Referensi</th>
								<th className="w-28 px-2 py-1.5">Kategori</th>
								<th className="w-[84px] px-2 py-1.5">Metode</th>
								<th className="w-[110px] px-2 py-1.5">Status</th>
								<th className="w-[190px] px-2 py-1.5">Detail</th>
								<th className="w-[170px] px-2 py-1.5">Audit</th>
								<th className="w-[120px] px-2 py-1.5 text-right">Nominal</th>
								<th className="w-[68px] px-2 py-1.5 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border bg-card">
							{!data ? (
								Array.from({ length: 5 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={columnCount} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
									</tr>
								))
							) : filteredTransactions.length === 0 ? (
								<tr>
									<td colSpan={columnCount} className="px-4 py-12 text-center text-muted-foreground">
										<div className="flex flex-col items-center gap-2">
											<Wallet className="h-8 w-8 opacity-20" />
											<p>Tidak ada transaksi ditemukan</p>
										</div>
									</td>
								</tr>
							) : (
								<>
									{virtualized.shouldVirtualize && virtualized.topSpacer > 0 && (
										<tr>
											<td colSpan={columnCount} style={{ height: `${virtualized.topSpacer}px`, padding: 0, border: 0 }} />
										</tr>
									)}
									{virtualized.rows.map((t: any) => {
									if (t.rowType === "group_header") {
										return (
											<tr key={t.rowKey} className="bg-muted/40">
												<td colSpan={columnCount} className="px-2 py-1.5">
													<button
														type="button"
														onClick={() => toggleGroup(t.groupKey)}
														className="flex w-full items-center justify-between rounded-md border border-border/50 bg-background px-2 py-1.5 text-left text-[10px]"
													>
														<span className="font-semibold text-foreground">
															{t.isCollapsed ? ">" : "v"} {t.groupLabel} | {t.groupTitle}
														</span>
														<span className="text-muted-foreground">
															{t.groupCount} baris | {formatCurrencyIDR(t.groupAmount)}
														</span>
													</button>
												</td>
											</tr>
										);
									}
									const rowKey = String(t.rowKey || t._id);
									let shiftName = "-";
									if (historicalShifts) {
										const shift = historicalShifts.find((s: any) => t.date >= s.startTime && (!s.endTime || t.date <= s.endTime));
										if (shift) {
											shiftName = shift.shiftName || "Shift Aktif";
										}
									}

									const referenceHref = getReferenceHref(t);

									return (
										<tr
											key={rowKey}
											className="group hover:bg-muted/30 transition-colors cursor-pointer"
											onClick={() => {
												if (editingItemRowKey === rowKey) return;
												handleEdit(t);
											}}
										>
											<td className="w-9 px-1.5 py-1.5" onClick={(e) => e.stopPropagation()}>
												<div className="flex items-center justify-center">
													<Checkbox
														checked={selectedRowKeys.has(rowKey)}
														onCheckedChange={() => handleToggleRow(rowKey)}
														aria-label={`Pilih transaksi ${t.merchant || "Umum"} tanggal ${format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}`}
														className="rounded-sm border-muted-foreground/40 bg-background data-checked:border-primary data-checked:bg-primary"
													/>
												</div>
											</td>
											<td className="w-[52px] px-1.5 py-1.5 text-center">
												<span className="font-mono text-[10px] text-muted-foreground">
													{rowNumberByKey.get(rowKey) || "-"}
												</span>
											</td>
											<td className="px-2 py-1.5 whitespace-nowrap">
												<div className="flex flex-col leading-tight">
													<span className="font-medium text-foreground text-[11px]">
														{format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}
													</span>
													<span className="text-[10px] text-muted-foreground">
														{format(new Date(t.date), "HH:mm")}
													</span>
												</div>
											</td>
											<td className="px-2 py-1.5 whitespace-nowrap">
												<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
													t.type === "income"
														? "border-emerald-200 bg-emerald-50 text-emerald-700"
														: "border-rose-200 bg-rose-50 text-rose-700"
												}`}>
													{t.type === "income" ? "Pemasukan" : "Pengeluaran"}
												</span>
											</td>
											<td className="px-2 py-1.5 whitespace-nowrap">
												{shiftName !== "-" ? (
													<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
														{shiftName}
													</span>
												) : (
													<span className="text-[11px] text-muted-foreground">-</span>
												)}
											</td>
											<td className="px-2 py-1.5 whitespace-nowrap">
												<div className="flex flex-col gap-1">
													{sourceBadge(t.sourceLabel, t.sourceType)}
													{t.inputMode && (
														<span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
															{t.inputMode.replace(/_/g, " ")}
														</span>
													)}
												</div>
											</td>
											{viewMode === "item" && (
												<td className="px-2 py-1.5">
													{t.rowType === "receipt_item" ? (
														<div className="flex flex-col gap-1">
															<span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
																{t.receiptGroupLabel || "Struk"}
															</span>
															<span className="text-[10px] text-muted-foreground">
																Item {t.receiptItemIndex}/{t.receiptItemCount}
															</span>
														</div>
													) : t.rowType === "order_item" ? (
														<div className="flex flex-col gap-1">
															<span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
																{t.receiptGroupLabel || "Order"}
															</span>
															<span className="text-[10px] text-muted-foreground">
																Item {t.receiptItemIndex}/{t.receiptItemCount}
															</span>
														</div>
													) : t.rowType === "booking_item" ? (
														<div className="flex flex-col gap-1">
															<span className="inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
																{t.receiptGroupLabel || "Booking"}
															</span>
															<span className="text-[10px] text-muted-foreground">
																Item {t.receiptItemIndex}/{t.receiptItemCount}
															</span>
														</div>
													) : (
														<span className="text-[11px] text-muted-foreground">-</span>
													)}
												</td>
											)}
											<td className="px-2 py-1.5">
												<div className="max-w-[160px]">
													<span className="block truncate text-xs font-semibold text-foreground" title={t.displayTitle || t.merchant || "Umum"}>
														{t.displayTitle || t.merchant || "Umum"}
													</span>
												</div>
											</td>
											<td className="px-2 py-1.5">
												<div className="max-w-[220px] space-y-1">
													<div className="truncate text-[11px] text-muted-foreground" title={t.displaySummary || t.description || "-"}>
														{t.displaySummary || t.description || "-"}
													</div>
													{t.rawText && (
														<div className="inline-flex max-w-full rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
															<span className="truncate" title={t.rawText}>AI input tersimpan</span>
														</div>
													)}
												</div>
											</td>
											<td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
												<div className="max-w-[148px] flex flex-col gap-0.5">
													<span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
														{t.referenceLabel || "Tanpa referensi"}
													</span>
													{referenceHref ? (
														<a
															href={referenceHref}
															className="truncate text-xs font-semibold text-primary hover:underline"
															title={`Buka ${t.referenceValue}`}
														>
															{t.referenceValue || "-"}
														</a>
													) : (
														<span className="truncate text-xs font-medium text-foreground">
															{t.referenceValue || "-"}
														</span>
													)}
													{t.metadata?.aiSessionId && (
														<span className="truncate text-[10px] text-muted-foreground">
															Sesi: {t.metadata.aiSessionId}
														</span>
													)}
											</div>
										</td>
										<td className="px-2 py-1.5 whitespace-nowrap">
											{categoryBadge(t.category, t.type)}
										</td>
										<td className="px-2 py-1.5">
											<span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
												{t.paymentMethod || "Cash"}
											</span>
										</td>
										<td className="px-2 py-1.5">
											<div className="flex flex-col gap-1">
												<span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
												t.status === "completed"
													? "border-emerald-200 bg-emerald-50 text-emerald-700"
													: t.status === "pending"
														? "border-amber-200 bg-amber-50 text-amber-700"
														: "border-rose-200 bg-rose-50 text-rose-700"
												}`}>
													{t.status}
												</span>
												{t.isRecurring && (
													<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
														berulang {t.recurringInterval || ""}
													</span>
												)}
											</div>
										</td>
										<td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
											{t.rowType === "receipt_item" &&
											editingItemRowKey === rowKey &&
											itemEditDraft ? (
												<div className="grid grid-cols-3 gap-2">
													<div className="space-y-1">
														<span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
															Qty
														</span>
														<input
															type="number"
															min="0"
															step="1"
															value={itemEditDraft.qty}
															onChange={(e) =>
																setItemEditDraft((prev) =>
																	prev
																		? { ...prev, qty: e.target.value }
																		: prev
																)
															}
															className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
														/>
													</div>
													<div className="space-y-1">
														<span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
															Harga
														</span>
														<input
															type="number"
															min="0"
															step="1"
															value={itemEditDraft.price}
															onChange={(e) =>
																setItemEditDraft((prev) =>
																	prev
																		? { ...prev, price: e.target.value }
																		: prev
																)
															}
															className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
														/>
													</div>
													<div className="space-y-1">
														<span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
															Subtotal
														</span>
														<input
															type="number"
															min="0"
															step="1"
															value={itemEditDraft.subtotal}
															onChange={(e) =>
																setItemEditDraft((prev) =>
																	prev
																		? { ...prev, subtotal: e.target.value }
																		: prev
																)
															}
															className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
														/>
													</div>
												</div>
											) : (
												<div className="flex flex-wrap gap-1">
														{Array.isArray(t.detailItems) && t.detailItems.length > 0 ? (
															<>
																{t.detailItems.slice(0, Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4).map((detail: { label: string; value: string }, idx: number) => (
															<div key={`${detail.label}-${idx}`} className="inline-flex max-w-[126px] items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px]">
																<span className="font-semibold uppercase tracking-wider text-muted-foreground">
																	{detail.label}:
																</span>
																<span className="truncate text-foreground" title={detail.value}>
																	{detail.value}
																</span>
															</div>
																))}
																{t.detailItems.length > (Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4) && (
																	<div className="inline-flex items-center rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
																		+{t.detailItems.length - (Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4)} detail
																	</div>
																)}
															</>
													) : (
														<span className="text-[11px] text-muted-foreground">-</span>
													)}
												</div>
											)}
										</td>
										<td className="px-2 py-1.5">
											<div className="flex max-w-[170px] flex-wrap gap-1">
												{t.receiptNumber && (
													<span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
														No: {t.receiptNumber}
													</span>
												)}
												{t.sourceRef && (
													<span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700">
														Ref: {t.sourceRef}
													</span>
												)}
												{t.sourceFingerprint && (
													<span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700">
														FP: {String(t.sourceFingerprint).slice(-8)}
													</span>
												)}
												{t.isPotentialDuplicate && (
													<span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
														Duplikat
													</span>
												)}
												{Array.isArray(t.ocrFlags) &&
													t.ocrFlags.slice(0, 2).map((flag: string) => (
														<span key={flag} className="inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
															{flag.replace(/_/g, " ")}
														</span>
													))}
											</div>
										</td>
										<td className="px-2 py-1.5 text-right whitespace-nowrap">
											<span className={`font-bold text-xs whitespace-nowrap ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
												{t.type === "income" ? "+" : "-"}{" "}
												{formatCurrencyIDR(
													t.rowType === "receipt_item" &&
													editingItemRowKey === rowKey &&
													itemEditDraft
														? Number(itemEditDraft.subtotal) || 0
														: t.amount
												)}
											</span>
										</td>
										<td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
												<div className="flex items-center justify-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
													{t.rowType === "receipt_item" && editingItemRowKey === rowKey ? (
														<>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	void saveInlineEditItem(t);
																}}
																disabled={savingItemRowKey === rowKey}
																className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
																title="Simpan item"
															>
																<Check className="h-4 w-4" />
															</button>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	cancelInlineEditItem();
																}}
																disabled={savingItemRowKey === rowKey}
																className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
																title="Batal edit item"
															>
																<X className="h-4 w-4" />
															</button>
														</>
													) : (
														<button
															onClick={(e) => {
																e.stopPropagation();
																if (t.rowType === "receipt_item") {
																	startInlineEditItem(t);
																	return;
																}
																handleEdit(t);
															}}
															className="p-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
															title={t.rowType === "receipt_item" ? "Ubah Item" : "Ubah"}
														>
															<Pencil className="h-4 w-4" />
														</button>
													)}
													<button
														onClick={(e) => {
															e.stopPropagation();
															void handleDelete(t);
														}}
														className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
														title="Hapus"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}
									{virtualized.shouldVirtualize && virtualized.bottomSpacer > 0 && (
										<tr>
											<td colSpan={columnCount} style={{ height: `${virtualized.bottomSpacer}px`, padding: 0, border: 0 }} />
										</tr>
									)}
								</>
							)}
						</tbody>
					</table>
				</div>
			</div>
			{data && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2">
					<div className="text-[10px] text-muted-foreground">
						Halaman {data.page || page} / {data.pageCount || 1} | Total {data.count} baris
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<select
							value={pageSize}
							onChange={(e) => setPageSize(Number(e.target.value) || 50)}
							className="h-7 rounded-md border border-input bg-background px-2 text-[10px]"
						>
							<option value={25}>25 / halaman</option>
							<option value={50}>50 / halaman</option>
							<option value={100}>100 / halaman</option>
						</select>
						<button
							type="button"
							onClick={() => setPage((prev) => Math.max(1, prev - 1))}
							disabled={(data.page || page) <= 1}
							className="rounded-md border border-input px-2 py-1 text-[10px] disabled:opacity-40"
						>
							Sebelumnya
						</button>
						<button
							type="button"
							onClick={() =>
								setPage((prev) => Math.min(data.pageCount || 1, prev + 1))
							}
							disabled={(data.page || page) >= (data.pageCount || 1)}
							className="rounded-md border border-input px-2 py-1 text-[10px] disabled:opacity-40"
						>
							Berikutnya
						</button>
					</div>
				</div>
			)}
			
			<NewTransactionDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setSelectedTransaction(null);
				}}
				transaction={selectedTransaction}
			/>
		</div>
	);
}






