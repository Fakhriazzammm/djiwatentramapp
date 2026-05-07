import { useState, useMemo, useEffect, useRef } from "react";
import {
	Wallet,
	Pencil,
	Trash2,
	Search,
	Filter,
	ArrowUpDown,
	FileText,
	Plus,
	ChevronDown,
	ChevronRight,
	ChevronLeft,
	Download,
	TrendingUp,
	BarChart2,
	AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import type { DateRange, PeriodOption } from "../../reports/-components/period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import { toast } from "sonner";
import type { Id } from "@/types/backend-compat";
import { format, startOfDay, endOfDay } from "date-fns";
import { id as localeID } from "date-fns/locale";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { useHybridTransactionDetailReport } from "@/hooks/use-hybrid-finance-analytics-data";
import {
	useHybridDeleteTransaction,
	useHybridDeleteTransactionScanItem,
	useHybridDeleteTransactionsBulk,
	useHybridUpdateTransactionScanItem,
} from "@/hooks/use-hybrid-write-actions";

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
	filterCategory?: string;
	period?: PeriodOption;
	periodButtons?: Array<{ value: PeriodOption; label: string }>;
	onPeriodChange?: (value: PeriodOption) => void;
	onCustomRangeChange?: (range: DateRange) => void;
	onViewModeChange?: (mode: "transaction" | "item") => void;
	onGroupModeChange?: (mode: "flat" | "grouped") => void;
	onExportPdf?: () => void;
	onExportCsv?: () => void;
	isExporting?: boolean;
	isExportingCsv?: boolean;
	onOpenAddTransaction?: () => void;
	onPrevPeriod?: () => void;
	onNextPeriod?: () => void;
	canGoNext?: boolean;
	showComparison?: boolean;
	onToggleComparison?: () => void;
	previousSummary?: {
		totalIncome: number;
		totalExpense: number;
		netBalance: number;
		periodLabel: string;
	} | null;
	summary?: {
		periodLabel: string;
		totalIncome: number;
		totalExpense: number;
		netBalance: number;
		count: number;
	};
}

export function TransactionDetailReport({
	range,
	viewMode,
	groupMode = "flat",
	filterCategory: filterCategoryProp,
	period,
	periodButtons,
	onPeriodChange,
	onCustomRangeChange,
	onViewModeChange,
	onGroupModeChange,
	onExportPdf,
	onExportCsv,
	isExporting,
	isExportingCsv,
	onOpenAddTransaction,
	onPrevPeriod,
	onNextPeriod,
	canGoNext = false,
	showComparison,
	onToggleComparison,
	previousSummary,
	summary,
}: Props) {
	const [filterType, setFilterType] = useState<"income" | "expense" | undefined>(undefined);
	const [filterCategory, setFilterCategory] = useState<string>("");
	const [filterShift, setFilterShift] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [minAmount, setMinAmount] = useState<string>("");
	const [maxAmount, setMaxAmount] = useState<string>("");
	const [sortBy, setSortBy] = useState<"date" | "amount">("date");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [showFilters, setShowFilters] = useState(false);
	const [showRunningBalance, setShowRunningBalance] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
	const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [scrollTop, setScrollTop] = useState(0);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const [editingItemRowKey, setEditingItemRowKey] = useState<string | null>(null);
	const [itemEditDraft, setItemEditDraft] = useState<{ qty: string; price: string; subtotal: string } | null>(null);
	const [savingItemRowKey, setSavingItemRowKey] = useState<string | null>(null);
	const [customStartInput, setCustomStartInput] = useState<string>("");
	const [customEndInput, setCustomEndInput] = useState<string>("");
	const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
	const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	// Sync external filterCategory prop to internal state
	useEffect(() => {
		if (filterCategoryProp !== undefined) {
			setFilterCategory(filterCategoryProp);
		}
	}, [filterCategoryProp]);

	const deleteTransaction = useHybridDeleteTransaction();
	const deleteTransactionsBulk = useHybridDeleteTransactionsBulk();
	const deleteTransactionScanItem = useHybridDeleteTransactionScanItem();
	const updateTransactionScanItem = useHybridUpdateTransactionScanItem();

	const data = useHybridTransactionDetailReport({
		startDate: range.startDate,
		endDate: range.endDate,
		type: filterType,
		category: filterCategory || undefined,
		viewMode,
		page,
		pageSize,
	});

	const historicalShiftsRaw = useHybridShiftReportRows();
	const historicalShifts = useMemo(() => {
		if (!historicalShiftsRaw) return undefined;
		return historicalShiftsRaw.filter((shift) => {
			const shiftEnd = shift.endTime ?? shift.startTime;
			return shift.startTime <= range.endDate && shiftEnd >= range.startDate;
		});
	}, [historicalShiftsRaw, range.endDate, range.startDate]);

	// Unique shift names for the shift filter dropdown
	const availableShifts = useMemo<string[]>(() => {
		if (!historicalShifts) return [];
		const names = new Set<string>(
			historicalShifts
				.map((s: any) => s.shiftName)
				.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
		);
		return Array.from(names).sort((a, b) => a.localeCompare(b));
	}, [historicalShifts]);

	// Client-side filtering
	const filteredTransactions = useMemo(() => {
		if (!data?.transactions) return [];

		let result = [...data.transactions];

		// Exclude pending deletes (undo window)
		if (pendingDeleteIds.size > 0) {
			result = result.filter((t: any) => !pendingDeleteIds.has(String(t._id)));
		}

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter((t: any) =>
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
		if (minAmount) result = result.filter((t: any) => t.amount >= Number(minAmount));
		if (maxAmount) result = result.filter((t: any) => t.amount <= Number(maxAmount));

		// Shift filter
		if (filterShift && historicalShifts) {
			const matchingShifts = historicalShifts.filter((s: any) => s.shiftName === filterShift);
			if (matchingShifts.length > 0) {
				result = result.filter((t: any) =>
					matchingShifts.some(
						(s: any) => t.date >= s.startTime && (!s.endTime || t.date <= s.endTime)
					)
				);
			}
		}

		// Sorting
		result.sort((a: any, b: any) => {
			if (sortBy === "date") {
				return sortOrder === "asc" ? a.date - b.date : b.date - a.date;
			}
			return sortOrder === "asc" ? a.amount - b.amount : b.amount - a.amount;
		});

		return result;
	}, [data?.transactions, searchQuery, minAmount, maxAmount, sortBy, sortOrder, filterShift, historicalShifts, pendingDeleteIds]);

	const filteredRowKeys = useMemo(
		() => filteredTransactions.map((t: any) => String(t.rowKey || t._id)),
		[filteredTransactions]
	);

	// Detect likely duplicates: same type+amount within 5 min
	// Ignores item-rows from the same parent transaction (diff itemIndex but same _id)
	const duplicateRowKeys = useMemo(() => {
		const keys = new Set<string>();
		if (!filteredTransactions || filteredTransactions.length < 2) return keys;
		// Group by _id first — item-mode rows share _id, skip those comparisons
		const byId = new Map<string, any[]>();
		for (const row of filteredTransactions) {
			const id = String(row._id);
			if (!byId.has(id)) byId.set(id, []);
			byId.get(id)!.push(row);
		}
		const uniques = Array.from(byId.values()).map((group) => group[0]);
		uniques.sort((a: any, b: any) => a.date - b.date);
		for (let i = 0; i < uniques.length - 1; i++) {
			const a = uniques[i];
			const b = uniques[i + 1];
			if (
				a.amount === b.amount &&
				a.type === b.type &&
				Math.abs(a.date - b.date) < 5 * 60 * 1000
			) {
				// Flag ALL rows belonging to both transactions (all item-rows included)
				const aGroup = byId.get(String(a._id))!;
				const bGroup = byId.get(String(b._id))!;
				for (const r of aGroup) keys.add(String(r.rowKey || r._id));
				for (const r of bGroup) keys.add(String(r.rowKey || r._id));
			}
		}
		return keys;
	}, [filteredTransactions]);

	// Running balance: cumulative net from oldest → newest
	const runningBalances = useMemo(() => {
		if (!showRunningBalance) return new Map<string, number>();
		const sorted = [...filteredTransactions].sort((a: any, b: any) => a.date - b.date);
		let running = 0;
		const balances = new Map<string, number>();
		for (const t of sorted) {
			running += t.type === "income" ? Number(t.amount) : -Number(t.amount);
			balances.set(String(t.rowKey || t._id), running);
		}
		return balances;
	}, [filteredTransactions, showRunningBalance]);

	const displayedRows = useMemo(() => {
		if (groupMode !== "grouped") {
			// Flat mode: insert date separator rows between dates
			const rows: any[] = [];
			let lastDayKey = "";
			for (const row of filteredTransactions) {
				const dayKey = format(new Date(row.date), "yyyy-MM-dd");
				if (dayKey !== lastDayKey) {
					const dayBucket = filteredTransactions.filter(
						(r: any) => format(new Date(r.date), "yyyy-MM-dd") === dayKey
					);
					const dayIncome = dayBucket
						.filter((r: any) => r.type === "income")
						.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
					const dayExpense = dayBucket
						.filter((r: any) => r.type !== "income")
						.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
					rows.push({
						rowType: "date_separator",
						dayKey,
						label: format(new Date(row.date), "EEEE, dd MMM yyyy", { locale: localeID }),
						count: dayBucket.length,
						income: dayIncome,
						expense: dayExpense,
						net: dayIncome - dayExpense,
					});
					lastDayKey = dayKey;
				}
				rows.push(row);
			}
			return rows;
		}

		// Grouped mode: Day > Shift > rows
		const rows: any[] = [];
		const sortedByDateDesc = [...filteredTransactions].sort((a: any, b: any) => b.date - a.date);
		const dayGroups = new Map<string, any[]>();
		for (const row of sortedByDateDesc) {
			const dayKey = format(new Date(row.date), "yyyy-MM-dd");
			const bucket = dayGroups.get(dayKey) || [];
			bucket.push(row);
			dayGroups.set(dayKey, bucket);
		}

		for (const [dayKey, dayRows] of dayGroups.entries()) {
			const dayIncome = dayRows
				.filter((r: any) => r.type === "income")
				.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
			const dayExpense = dayRows
				.filter((r: any) => r.type !== "income")
				.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
			const dayNodeKey = `day::${dayKey}`;
			const dayCollapsed = collapsedGroups.has(dayNodeKey);
			rows.push({
				rowType: "hierarchy_node",
				level: "day",
				nodeKey: dayNodeKey,
				label: format(new Date(dayRows[0].date), "EEEE, dd MMM yyyy", { locale: localeID }),
				count: dayRows.length,
				income: dayIncome,
				expense: dayExpense,
				amount: dayIncome - dayExpense,
				expandable: true,
				isCollapsed: dayCollapsed,
			});
			if (dayCollapsed) continue;

			const shiftGroups = new Map<string, any[]>();
			for (const row of dayRows) {
				let shiftLabel = "-";
				if (historicalShifts) {
					const matched = historicalShifts.find(
						(s: any) => row.date >= s.startTime && (!s.endTime || row.date <= s.endTime)
					);
					shiftLabel = matched?.shiftName || shiftLabel;
				}
				const bucket = shiftGroups.get(shiftLabel) || [];
				bucket.push(row);
				shiftGroups.set(shiftLabel, bucket);
			}

			for (const [shiftKeyRaw, shiftRows] of shiftGroups.entries()) {
				const shiftIncome = shiftRows
					.filter((r: any) => r.type === "income")
					.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
				const shiftExpense = shiftRows
					.filter((r: any) => r.type !== "income")
					.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
				const shiftNodeKey = `${dayNodeKey}::shift::${shiftKeyRaw}`;
				const shiftCollapsed = collapsedGroups.has(shiftNodeKey);
				rows.push({
					rowType: "hierarchy_node",
					level: "shift",
					nodeKey: shiftNodeKey,
					label: shiftKeyRaw,
					count: shiftRows.length,
					income: shiftIncome,
					expense: shiftExpense,
					amount: shiftIncome - shiftExpense,
					expandable: true,
					isCollapsed: shiftCollapsed,
				});
				if (shiftCollapsed) continue;
				for (const row of shiftRows) rows.push(row);
			}
		}
		return rows;
	}, [filteredTransactions, groupMode, collapsedGroups, historicalShifts]);

	const virtualized = useMemo(() => {
		const shouldVirtualize = displayedRows.length > 120;
		if (!shouldVirtualize) return { rows: displayedRows, topSpacer: 0, bottomSpacer: 0, shouldVirtualize: false };
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
			if (row.rowType === "hierarchy_node" || row.rowType === "date_separator") continue;
			counter += 1;
			numbers.set(String(row.rowKey || row._id), counter);
		}
		return numbers;
	}, [displayedRows]);

	const selectedVisibleCount = useMemo(
		() => filteredRowKeys.filter((k) => selectedRowKeys.has(k)).length,
		[filteredRowKeys, selectedRowKeys]
	);
	const allVisibleSelected =
		filteredRowKeys.length > 0 && selectedVisibleCount === filteredRowKeys.length;

	useEffect(() => {
		setSelectedRowKeys((prev) => {
			if (prev.size === 0) return prev;
			const set = new Set(filteredRowKeys);
			const next = new Set([...prev].filter((k) => set.has(k)));
			return next.size === prev.size ? prev : next;
		});
	}, [filteredRowKeys]);

	useEffect(() => {
		setPage(1);
	}, [range.startDate, range.endDate, filterType, filterCategory, viewMode, pageSize]);

	useEffect(() => {
		setScrollTop(0);
		if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
	}, [page, pageSize, viewMode, groupMode, searchQuery, sortBy, sortOrder]);

	// ── Undo Delete ──────────────────────────────────────────────────────────
	const handleDelete = async (transaction: any) => {
		if (viewMode === "item" && transaction.rowType === "receipt_item") {
			if (!confirm(`Hapus item ${transaction.receiptItemIndex}/${transaction.receiptItemCount} dari struk ini?`)) return;
			try {
				await deleteTransactionScanItem({ id: transaction._id, itemIndex: Number(transaction.itemIndex) || 0 });
				toast.success("Item struk berhasil dihapus");
			} catch {
				toast.error("Gagal menghapus item struk");
			}
			return;
		}
		if (viewMode === "item" && (transaction.rowType === "order_item" || transaction.rowType === "booking_item")) {
			toast.error("Item order/booking tidak bisa dihapus dari tabel ini.");
			return;
		}

		const txId = String(transaction._id);

		// Optimistically hide; actual delete deferred 5s
		setPendingDeleteIds((prev) => new Set([...prev, txId]));
		setSelectedRowKeys((prev) => {
			const next = new Set([...prev].filter((k) => !k.startsWith(txId)));
			return next.size === prev.size ? prev : next;
		});

		const timer = setTimeout(async () => {
			pendingDeleteTimers.current.delete(txId);
			try {
				await deleteTransaction({ id: transaction._id });
			} catch {
				setPendingDeleteIds((prev) => {
					const next = new Set(prev);
					next.delete(txId);
					return next;
				});
				toast.error("Gagal menghapus transaksi");
			}
		}, 5000);

		pendingDeleteTimers.current.set(txId, timer);

		toast.info(transaction.displaySummary || transaction.description || "Transaksi dihapus", {
			description: "Akan dihapus permanen dalam 5 detik",
			action: {
				label: "Batalkan",
				onClick: () => {
					const t = pendingDeleteTimers.current.get(txId);
					if (t) clearTimeout(t);
					pendingDeleteTimers.current.delete(txId);
					setPendingDeleteIds((prev) => {
						const next = new Set(prev);
						next.delete(txId);
						return next;
					});
				},
			},
			duration: 5000,
		});
	};

	const handleToggleRow = (rowKey: string) => {
		setSelectedRowKeys((prev) => {
			const next = new Set(prev);
			if (next.has(rowKey)) next.delete(rowKey);
			else next.add(rowKey);
			return next;
		});
	};

	const handleToggleSelectAll = () => {
		setSelectedRowKeys((prev) => {
			const next = new Set(prev);
			if (allVisibleSelected) {
				for (const k of filteredRowKeys) next.delete(k);
			} else {
				for (const k of filteredRowKeys) next.add(k);
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
		const selectedRows = filteredTransactions.filter((t: any) =>
			selectedRowKeys.has(String(t.rowKey || t._id))
		);
		if (selectedRows.length === 0) return;

		const receiptItemRows = selectedRows.filter((r: any) => r.rowType === "receipt_item");
		const unDeletable = selectedRows.filter(
			(r: any) => r.rowType === "order_item" || r.rowType === "booking_item"
		);
		const txRows = selectedRows.filter(
			(r: any) => !r.rowType || r.rowType === "transaction"
		);
		const idsToDelete = [
			...new Set(txRows.map((r: any) => r._id as Id<"financialTransactions">)),
		];

		if (!confirm(`Hapus ${idsToDelete.length} transaksi dan ${receiptItemRows.length} item struk?`)) return;

		try {
			if (idsToDelete.length > 0) await deleteTransactionsBulk({ ids: idsToDelete });
			if (receiptItemRows.length > 0) {
				await Promise.all(
					receiptItemRows.map((r: any) =>
						deleteTransactionScanItem({ id: r._id, itemIndex: Number(r.itemIndex) || 0 })
					)
				);
			}
			setSelectedRowKeys(new Set());
			if (unDeletable.length > 0) {
				toast.warning(`Dihapus. ${unDeletable.length} item order/booking dilewati.`);
			} else {
				toast.success(`${idsToDelete.length} transaksi & ${receiptItemRows.length} item berhasil dihapus`);
			}
		} catch {
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
			Number(item.price) > 0 ? Number(item.price) : qty > 0 ? subtotalFromItem / qty : 0;
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
		setEditingItemRowKey(String(transaction.rowKey || transaction._id));
		setItemEditDraft(getReceiptItemDefaults(transaction));
	};

	const cancelInlineEditItem = () => {
		setEditingItemRowKey(null);
		setItemEditDraft(null);
	};

	const saveInlineEditItem = async (transaction: any) => {
		if (transaction.rowType !== "receipt_item") { toast.error("Edit item hanya untuk baris item struk"); return; }
		const rowKey = String(transaction.rowKey || transaction._id);
		if (!itemEditDraft) { toast.error("Data edit item belum terisi"); return; }
		const qty = Number(itemEditDraft.qty);
		const price = Number(itemEditDraft.price);
		const subtotal = Number(itemEditDraft.subtotal);
		if (!Number.isFinite(qty) || qty <= 0) { toast.error("Qty harus angka lebih dari 0"); return; }
		if (!Number.isFinite(price) || price < 0) { toast.error("Harga harus angka valid"); return; }
		if (!Number.isFinite(subtotal) || subtotal < 0) { toast.error("Subtotal harus angka valid"); return; }
		try {
			setSavingItemRowKey(rowKey);
			await updateTransactionScanItem({ id: transaction._id, itemIndex: Number(transaction.itemIndex) || 0, quantity: qty, price, total: subtotal });
			cancelInlineEditItem();
			toast.success("Item struk berhasil diperbarui");
		} catch {
			toast.error("Gagal memperbarui item struk");
		} finally {
			setSavingItemRowKey(null);
		}
	};

	const handleEdit = (transaction: any) => {
		setSelectedTransaction(transaction);
		setIsEditDialogOpen(true);
	};

	const applyCustomRange = () => {
		if (!customStartInput || !customEndInput || !onCustomRangeChange) return;
		const start = new Date(customStartInput);
		const end = new Date(customEndInput);
		if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
			toast.error("Tanggal tidak valid");
			return;
		}
		onCustomRangeChange({
			startDate: startOfDay(start).getTime(),
			endDate: endOfDay(end).getTime(),
			label: `${format(start, "dd MMM")} – ${format(end, "dd MMM yyyy", { locale: localeID })}`,
		});
	};

	const getSourceBadge = (t: any) => {
		const raw = (t.sourceLabel || t.sourceType || "-").toUpperCase().replace(/_/g, " ");
		type S = { bg: string; text: string; border: string; dot: string };
		const map: Record<string, S> = {
			"ORDER":       { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-400" },
			"SHIFT OPEN":  { bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200",   dot: "bg-teal-400" },
			"SHIFT CLOSE": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-400" },
			"MANUAL":      { bg: "bg-slate-100", text: "text-slate-600",  border: "border-slate-200",  dot: "bg-slate-400" },
			"SCAN":        { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-400" },
			"RECEIPT":     { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-400" },
		};
		const s = map[raw] ?? { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200", dot: "bg-slate-300" };
		return (
			<span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${s.bg} ${s.text} ${s.border}`}>
				<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
				{raw}
			</span>
		);
	};

	// Comparison chip: % change vs previous period
	const comparisonChip = (current: number, prev: number, label: string) => {
		if (!showComparison) return null;
		if (previousSummary === null) {
			return <span className="ml-1 text-[9px] text-slate-400 animate-pulse">...</span>;
		}
		if (!previousSummary) return null;
		if (prev === 0) return null;
		const pct = ((current - prev) / Math.abs(prev)) * 100;
		const up = pct >= 0;
		return (
			<span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-semibold ${up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
				{up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
			</span>
		);
	};

	const columnCount = showRunningBalance ? 9 : 8;
	const withMergedHeader = Boolean(
		period && periodButtons && onPeriodChange && onViewModeChange &&
		onGroupModeChange && onExportPdf && onOpenAddTransaction && summary
	);
	const hasActiveFilters = !!(searchQuery || minAmount || maxAmount || filterCategory || filterShift);

	return (
		<div className="space-y-1 p-1">
			{/* ── Header bar ──────────────────────────────────────────────── */}
			{withMergedHeader && (
				<div className="sticky top-0 z-30 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
					{/* Row 1: title + controls + actions */}
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2">
						<div className="flex items-center gap-2">
							<h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Transaksi</h2>
							{/* View mode */}
							<div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
								{(["transaction", "item"] as const).map((m) => (
									<button key={m} type="button" onClick={() => onViewModeChange!(m)}
										className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${viewMode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
										{m === "transaction" ? "Transaksi" : "Item"}
									</button>
								))}
							</div>
							{/* Group mode */}
							<div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
								{(["flat", "grouped"] as const).map((m) => (
									<button key={m} type="button" onClick={() => onGroupModeChange!(m)}
										className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${groupMode === m ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
										{m === "flat" ? "Flat" : "Grouped"}
									</button>
								))}
							</div>
							{/* Running balance toggle */}
							<button type="button" onClick={() => setShowRunningBalance((v) => !v)}
								className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${showRunningBalance ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
								title="Tampilkan saldo berjalan">
								<BarChart2 className="h-3 w-3" />
								Saldo
							</button>
							{/* Comparison toggle */}
							{onToggleComparison && (
								<button type="button" onClick={onToggleComparison}
									className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${showComparison ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
									title="Bandingkan dengan periode sebelumnya">
									<TrendingUp className="h-3 w-3" />
									vs Sebelumnya
								</button>
							)}
						</div>
						<div className="flex items-center gap-1.5">
							{onExportCsv && (
								<button type="button" onClick={onExportCsv} disabled={isExportingCsv}
									className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
									title="Export CSV">
									<Download className="h-3.5 w-3.5" />
									CSV
								</button>
							)}
							<button type="button" onClick={onExportPdf} disabled={isExporting}
								className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
								<FileText className="h-3.5 w-3.5" />
								PDF
							</button>
							<button type="button" onClick={onOpenAddTransaction}
								className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700">
								<Plus className="h-3.5 w-3.5" />
								Catat
							</button>
						</div>
					</div>

					{/* Row 2: period navigation + stats */}
					<div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
						<div className="flex flex-wrap items-center gap-1">
							{/* Prev period */}
							{onPrevPeriod && (
								<button type="button" onClick={onPrevPeriod}
									className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
									title="Periode sebelumnya">
									<ChevronLeft className="h-3.5 w-3.5" />
								</button>
							)}
							{periodButtons!.map((item) => (
								<button key={item.value} type="button"
									onClick={() => onPeriodChange!(item.value)}
									className={`rounded-sm border px-2.5 py-1 text-[10px] font-medium transition-colors ${period === item.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
									{item.label}
								</button>
							))}
							{/* Next period */}
							{onNextPeriod && (
								<button type="button" onClick={onNextPeriod} disabled={!canGoNext}
									className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
									title="Periode berikutnya">
									<ChevronRight className="h-3.5 w-3.5" />
								</button>
							)}
						</div>

						{/* Summary stats */}
						<div className="flex flex-col items-end gap-0.5">
							<div className="flex items-center divide-x divide-slate-200 text-[11px]">
								<span className="pr-3 text-slate-500">{summary!.periodLabel}</span>
								<span className="px-3 font-semibold text-emerald-600">
									↑ {formatCurrencyIDR(summary!.totalIncome)}
									{comparisonChip(summary!.totalIncome, previousSummary?.totalIncome ?? 0, "income")}
								</span>
								<span className="px-3 font-semibold text-orange-500">
									↓ {formatCurrencyIDR(summary!.totalExpense)}
									{comparisonChip(summary!.totalExpense, previousSummary?.totalExpense ?? 0, "expense")}
								</span>
								<span className={`pl-3 font-bold ${summary!.netBalance >= 0 ? "text-slate-900" : "text-red-600"}`}>
									= {summary!.netBalance < 0 ? "-" : ""}{formatCurrencyIDR(Math.abs(summary!.netBalance))}
									{comparisonChip(summary!.netBalance, previousSummary?.netBalance ?? 0, "net")}
								</span>
								<span className="pl-3 text-slate-500">{summary!.count} tx</span>
							</div>
							{showComparison && previousSummary && (
								<div className="text-[9px] text-slate-400">
									vs {previousSummary.periodLabel}: ↑ {formatCurrencyIDR(previousSummary.totalIncome)} · ↓ {formatCurrencyIDR(previousSummary.totalExpense)}
								</div>
							)}
							{showComparison && previousSummary === null && (
								<div className="text-[9px] text-slate-400 animate-pulse">Memuat data pembanding...</div>
							)}
						</div>
					</div>

					{/* Row 3: Custom date picker (only when period = custom) */}
					{period === "custom" && onCustomRangeChange && (
						<div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
							<span className="text-[10px] font-medium text-slate-600">Dari</span>
							<input
								type="date"
								value={customStartInput}
								onChange={(e) => setCustomStartInput(e.target.value)}
								className="h-6 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
							/>
							<span className="text-[10px] text-slate-400">–</span>
							<span className="text-[10px] font-medium text-slate-600">Sampai</span>
							<input
								type="date"
								value={customEndInput}
								onChange={(e) => setCustomEndInput(e.target.value)}
								className="h-6 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
							/>
							<button type="button" onClick={applyCustomRange}
								className="inline-flex h-6 items-center rounded bg-emerald-600 px-2.5 text-[10px] font-semibold text-white hover:bg-emerald-700">
								Terapkan
							</button>
							<span className="text-[10px] text-slate-400">
								{range.label && `Aktif: ${range.label}`}
							</span>
						</div>
					)}
				</div>
			)}

			<div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
				{/* ── Filter bar ──────────────────────────────────────────── */}
				<div className="border-b border-slate-200/80 px-2 py-1.5">
					<div className="flex flex-wrap items-center gap-2">
						{/* Type */}
						<div className="flex gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
							{(["all", "income", "expense"] as const).map((t) => (
								<button key={t} type="button"
									onClick={() => setFilterType(t === "all" ? undefined : t)}
									className={`rounded px-2.5 py-1 text-[10px] font-semibold transition-all ${
										(t === "all" && !filterType) || filterType === t
											? t === "income" ? "bg-emerald-600 text-white" : t === "expense" ? "bg-orange-500 text-white" : "bg-slate-700 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}>
									{t === "all" ? "Semua" : t === "income" ? "Pemasukan" : "Pengeluaran"}
								</button>
							))}
						</div>

						{/* Search */}
						<div className="relative min-w-[180px] max-w-xs flex-1">
							<Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
							<input type="text" placeholder="Cari transaksi..." value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-7 w-full rounded border border-slate-300 bg-slate-50 pl-7 pr-2 text-[11px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400" />
						</div>

						{/* Shift filter */}
						{availableShifts.length > 0 && (
							<select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}
								className={`h-7 rounded border px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 ${filterShift ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-200 bg-slate-50"}`}>
								<option value="">Semua Shift</option>
								{availableShifts.map((s: string) => (
									<option key={s} value={s}>{s}</option>
								))}
							</select>
						)}

						{/* Sort */}
						<button type="button"
							onClick={() => { if (sortBy === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else setSortBy("date"); }}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${sortBy === "date" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
							<ArrowUpDown className="h-3 w-3" />
							Tanggal {sortBy === "date" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
						</button>
						<button type="button"
							onClick={() => { if (sortBy === "amount") setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else setSortBy("amount"); }}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${sortBy === "amount" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
							Nominal {sortBy === "amount" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
						</button>

						{/* More filters */}
						<button type="button" onClick={() => setShowFilters((v) => !v)}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${showFilters || filterCategory || minAmount || maxAmount ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
							<Filter className="h-3 w-3" />
							Filter
							{showFilters ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
						</button>

						{hasActiveFilters && (
							<button type="button"
								onClick={() => { setSearchQuery(""); setMinAmount(""); setMaxAmount(""); setFilterCategory(""); setFilterShift(""); }}
								className="text-[10px] text-red-500 hover:text-red-700 hover:underline">
								Reset
							</button>
						)}

						{/* Duplicate warning badge */}
						{duplicateRowKeys.size > 0 && (
							<span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700"
								title={`${duplicateRowKeys.size} baris terdeteksi duplikat (nominal & tipe sama dalam 5 menit)`}>
								<AlertTriangle className="h-3 w-3" />
								{duplicateRowKeys.size} duplikat
							</span>
						)}
					</div>

					{/* Extended filters */}
					{showFilters && (
						<div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
							<div className="flex items-center gap-1.5">
								<span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Nominal:</span>
								<input type="number" placeholder="Min" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
									className="h-6 w-24 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300" />
								<span className="text-slate-400">–</span>
								<input type="number" placeholder="Max" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
									className="h-6 w-24 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300" />
							</div>
							<div className="flex items-center gap-1.5">
								<span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Kategori:</span>
								<select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
									className="h-6 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300">
									<option value="">Semua</option>
									{EXPENSE_CATEGORIES.map((cat) => (
										<option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
									))}
								</select>
							</div>
						</div>
					)}
				</div>

				{/* ── Bulk action bar ──────────────────────────────────────── */}
				{selectedVisibleCount > 0 && (
					<div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-3 py-1.5">
						<p className="text-[11px] text-slate-700">
							<span className="font-semibold text-slate-900">{selectedVisibleCount}</span> baris dipilih
						</p>
						<div className="flex items-center gap-2">
							<button type="button" onClick={() => setSelectedRowKeys(new Set())}
								className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100">
								Batal
							</button>
							<button type="button" onClick={handleBulkDelete}
								className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700">
								<Trash2 className="h-3 w-3" />
								Hapus {selectedVisibleCount} Terpilih
							</button>
						</div>
					</div>
				)}

				{/* ── Table ────────────────────────────────────────────────── */}
				<div
					ref={scrollContainerRef}
					onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
					className="max-h-[72vh] overflow-auto"
				>
					<table className="w-full min-w-[720px] table-auto text-left text-[11px] text-slate-700">
					<colgroup>
						<col style={{ width: "36px" }} />
						<col style={{ width: "44px" }} />
						<col style={{ width: "120px" }} />
						<col style={{ width: "110px" }} />
						<col style={{ width: "90px" }} />
						<col />
						<col style={{ width: "160px" }} />
						{showRunningBalance && <col style={{ width: "130px" }} />}
						<col style={{ width: "88px" }} />
					</colgroup>
						<thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
							<tr>
								<th className="sticky left-0 z-20 border-r border-b border-slate-200 bg-slate-50 px-1.5 py-2">
									<div className="flex items-center justify-center">
										<Checkbox checked={allVisibleSelected} onCheckedChange={handleToggleSelectAll}
											disabled={filteredRowKeys.length === 0}
											className="rounded-sm border-muted-foreground/40 bg-muted/40 data-checked:border-primary data-checked:bg-primary" />
									</div>
								</th>
								<th className="sticky left-[36px] z-20 border-r border-b border-slate-200 bg-slate-50 px-1.5 py-2 text-center">No</th>
								<th className="border-b border-slate-200 px-3 py-2">Tanggal</th>
							<th className="border-b border-slate-200 px-3 py-2">Sumber</th>
							<th className="border-b border-slate-200 px-3 py-2">Pembayaran</th>
							<th className="border-b border-slate-200 px-3 py-2">Deskripsi</th>
								<th className="sticky right-[88px] z-20 border-l border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">
									{showRunningBalance ? "Nominal" : "Nominal"}
								</th>
								{showRunningBalance && (
									<th className="sticky right-[88px] z-20 border-l border-b border-slate-200 bg-indigo-50 px-3 py-2 text-right text-indigo-600">
										Saldo
									</th>
								)}
								<th className="sticky right-0 z-20 border-l border-b border-slate-200 bg-slate-50 px-2 py-2 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{!data ? (
								Array.from({ length: 8 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={columnCount} className="px-4 py-3">
											<Skeleton className="h-4 w-full" />
										</td>
									</tr>
								))
							) : filteredTransactions.length === 0 ? (
								<tr>
									<td colSpan={columnCount} className="px-4 py-16 text-center text-slate-400">
										<div className="flex flex-col items-center gap-2">
											<Wallet className="h-8 w-8 opacity-20" />
											<p className="text-[12px]">Tidak ada transaksi ditemukan</p>
										</div>
									</td>
								</tr>
							) : (
								<>
									{virtualized.shouldVirtualize && virtualized.topSpacer > 0 && (
										<tr><td colSpan={columnCount} style={{ height: `${virtualized.topSpacer}px`, padding: 0, border: 0 }} /></tr>
									)}
									{virtualized.rows.map((t: any) => {
										// ── Date separator (flat mode) ─────────────────────
										if (t.rowType === "date_separator") {
											return (
												<tr key={`sep-${t.dayKey}`} className="border-t-2 border-slate-200 bg-slate-50">
													<td colSpan={columnCount} className="px-3 py-2">
														<div className="flex items-center justify-between">
															<span className="text-[11px] font-bold text-slate-700">{t.label}</span>
															<div className="flex items-center gap-3 text-[10px]">
																<span className="text-slate-400">{t.count} tx</span>
																<span className="font-semibold text-emerald-600">↑ {formatCurrencyIDR(t.income)}</span>
																<span className="font-semibold text-orange-500">↓ {formatCurrencyIDR(t.expense)}</span>
																<span className={`font-bold ${t.net >= 0 ? "text-slate-800" : "text-red-600"}`}>
																	= {t.net < 0 && "-"}{formatCurrencyIDR(Math.abs(t.net))}
																</span>
															</div>
														</div>
													</td>
												</tr>
											);
										}

										// ── Grouped hierarchy nodes ────────────────────────
										if (t.rowType === "hierarchy_node") {
											if (t.level === "day") {
												const net = Number(t.amount ?? 0);
												return (
													<tr key={t.nodeKey} className="border-t-2 border-slate-300 bg-slate-100">
														<td colSpan={columnCount}>
															<button type="button" onClick={() => toggleGroup(t.nodeKey)}
																className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-slate-200/60">
																<div className="flex items-center gap-2">
																	{t.isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
																	<span className="text-[12px] font-bold text-slate-800">{t.label}</span>
																	<span className="rounded bg-slate-300/70 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{t.count} tx</span>
																</div>
																<div className="flex items-center gap-3 text-[10px]">
																	<span className="font-semibold text-emerald-600">↑ {formatCurrencyIDR(t.income)}</span>
																	<span className="font-semibold text-orange-500">↓ {formatCurrencyIDR(t.expense)}</span>
																	<span className={`font-bold ${net >= 0 ? "text-slate-800" : "text-red-600"}`}>
																		= {net < 0 && "-"}{formatCurrencyIDR(Math.abs(net))}
																	</span>
																</div>
															</button>
														</td>
													</tr>
												);
											}
											if (t.level === "shift") {
												const net = Number(t.amount ?? 0);
												return (
													<tr key={t.nodeKey} className="border-t border-slate-200 bg-slate-50">
														<td colSpan={columnCount}>
															<button type="button" onClick={() => toggleGroup(t.nodeKey)}
																className="flex w-full items-center justify-between pl-8 pr-3 py-1.5 transition-colors hover:bg-slate-100">
																<div className="flex items-center gap-1.5">
																	{t.isCollapsed ? <ChevronRight className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
																	<span className="text-[10px] font-semibold text-slate-600">{t.label !== "-" ? t.label : "Tanpa Shift"}</span>
																	<span className="text-[9px] text-slate-400">· {t.count} tx</span>
																</div>
																<div className="flex items-center gap-2 text-[10px]">
																	<span className="text-emerald-600">↑ {formatCurrencyIDR(t.income)}</span>
																	<span className="text-orange-500">↓ {formatCurrencyIDR(t.expense)}</span>
																	<span className={`font-semibold ${net >= 0 ? "text-slate-700" : "text-red-600"}`}>
																		= {net < 0 && "-"}{formatCurrencyIDR(Math.abs(net))}
																	</span>
																</div>
															</button>
														</td>
													</tr>
												);
											}
											return (
												<tr key={t.nodeKey} className="bg-slate-50/60">
													<td colSpan={columnCount} className="px-2 py-1">
														<span className="pl-12 text-[10px] text-slate-500">{t.label}</span>
													</td>
												</tr>
											);
										}

									{/* ── Data row ─────────────────────────────────────── */}
									const rowKey = String(t.rowKey || t._id);
									let shiftName = "-";
									if (historicalShifts) {
										const shift = historicalShifts.find(
											(s: any) => t.date >= s.startTime && (!s.endTime || t.date <= s.endTime)
										);
										if (shift) shiftName = shift.shiftName || "Shift Aktif";
									}
									const isIncome = t.type === "income";
									const isDuplicate = duplicateRowKeys.has(rowKey);
									const runningBal = runningBalances.get(rowKey);
									const isExpanded = expandedRows.has(rowKey);
									const hasScanItems = t.metadata?.scanItems && t.metadata.scanItems.length > 0;
									const hasReceiptMeta = t.metadata?.receiptDetails || t.metadata?.ocr;

									const toggleExpand = () => {
										if (editingItemRowKey === rowKey) return;
										setExpandedRows((prev) => {
											const next = new Set(prev);
											if (next.has(rowKey)) next.delete(rowKey);
											else next.add(rowKey);
											return next;
										});
									};

									const getPaymentIcon = (method: string | undefined): string => {
										if (!method) return "";
										const m = method.toLowerCase();
										if (m.includes("cash") || m.includes("tunai")) return "💵";
										if (m.includes("debit") || m.includes("kartu")) return "💳";
										if (m.includes("qris") || m.includes("qr")) return "📱";
										if (m.includes("transfer")) return "🏦";
										return "💳";
									};

									const expandable = hasScanItems || hasReceiptMeta;

									return (
										<>
										<tr key={rowKey}
											className={`group cursor-pointer transition-colors ${isIncome ? "bg-emerald-50/30 hover:bg-emerald-50/50" : "bg-red-50/20 hover:bg-red-50/40"} ${selectedRowKeys.has(rowKey) ? "bg-blue-50/50" : ""} ${isDuplicate ? "bg-amber-50/40" : ""}`}
											onClick={toggleExpand}
											onDoubleClick={() => { if (editingItemRowKey === rowKey) return; handleEdit(t); }}
										>
												{/* Checkbox */}
												<td className="sticky left-0 z-10 w-9 border-r border-slate-100 bg-white px-1.5 group-hover:bg-slate-50"
													onClick={(e) => e.stopPropagation()}>
													<div className={`absolute inset-y-0 left-0 w-[3px] ${isIncome ? "bg-emerald-400" : "bg-orange-400"}`} />
													<div className="flex items-center justify-center pl-1">
														<Checkbox checked={selectedRowKeys.has(rowKey)} onCheckedChange={() => handleToggleRow(rowKey)}
															className="rounded-sm border-muted-foreground/40 bg-muted/40 data-checked:border-primary data-checked:bg-primary" />
													</div>
												</td>

												{/* No */}
												<td className="sticky left-[36px] z-10 w-11 border-r border-slate-100 bg-white px-1.5 py-2 text-center font-mono text-[10px] text-slate-400 group-hover:bg-slate-50">
													{rowNumberByKey.get(rowKey) || "-"}
												</td>

												{/* Tanggal */}
												<td className="whitespace-nowrap px-3 py-2">
													<div className="flex flex-col leading-tight">
														<span className="text-[11px] font-medium text-slate-900">
															{format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}
														</span>
														<span className="text-[10px] text-slate-400" title={shiftName !== "-" ? `Shift: ${shiftName}` : undefined}>
															{format(new Date(t.date), "HH:mm")}
															{shiftName !== "-" && <span className="ml-1 text-slate-300">· {shiftName}</span>}
														</span>
													</div>
												</td>

								{/* Sumber */}
								<td className="whitespace-nowrap px-3 py-2">
									<div className="flex flex-col gap-0.5">
										{getSourceBadge(t)}
										{t.metadata?.ocr && (
											<span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
												📸 OCR
											</span>
										)}
										{isDuplicate && (
											<span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-amber-600">
												<AlertTriangle className="h-2.5 w-2.5" />
												duplikat
											</span>
										)}
										{expandable && (
											<span className="inline-flex items-center gap-0.5 text-[8px] text-slate-400">
												<ChevronRight className={`h-2.5 w-2.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
												{hasScanItems ? `${t.metadata.scanItems.length} item` : "Detail"}
											</span>
										)}
									</div>
								</td>

									{/* Pembayaran */}
									<td className="whitespace-nowrap px-3 py-2">
										{t.paymentMethod ? (
											<span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
												<span>{getPaymentIcon(t.paymentMethod)}</span>
												<span className="capitalize">{t.paymentMethod.toLowerCase().replace(/_/g, " ")}</span>
											</span>
										) : (
											<span className="text-[10px] text-slate-300">—</span>
										)}
									</td>

									{/* Deskripsi */}
									<td className="px-3 py-2">
										<div className="flex flex-col gap-0.5">
											<span className="block max-w-xs truncate text-[11px] font-medium text-slate-800"
												title={t.displaySummary || t.description || "-"}>
												{t.displaySummary || t.description || "-"}
											</span>
										</div>
									</td>

												{/* Nominal */}
												<td className="sticky right-[88px] z-10 whitespace-nowrap border-l border-slate-100 bg-white px-3 py-2 text-right group-hover:bg-slate-50">
													<span className={`font-mono text-[13px] font-semibold tracking-tight ${isIncome ? "text-emerald-600" : "text-orange-500"}`}>
														{isIncome ? "+" : "−"} {formatCurrencyIDR(t.amount)}
													</span>
												</td>

												{/* Running balance */}
												{showRunningBalance && (
													<td className="whitespace-nowrap border-l border-indigo-100 bg-indigo-50/30 px-3 py-2 text-right group-hover:bg-indigo-50/50">
														{runningBal !== undefined ? (
															<span className={`font-mono text-[11px] font-medium ${runningBal >= 0 ? "text-indigo-700" : "text-red-600"}`}>
																{runningBal < 0 && "-"}{formatCurrencyIDR(Math.abs(runningBal))}
															</span>
														) : (
															<span className="text-[10px] text-slate-300">—</span>
														)}
													</td>
												)}

												{/* Aksi */}
												<td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-2 group-hover:bg-slate-50"
													onClick={(e) => e.stopPropagation()}>
													<div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
														<button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}
															className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
															title="Edit">
															<Pencil className="h-3.5 w-3.5" />
														</button>
														<button type="button" onClick={(e) => { e.stopPropagation(); void handleDelete(t); }}
															className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
															title="Hapus">
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</div>
										</td>
									</tr>
									{isExpanded && expandable && (
										<tr key={`${rowKey}-expanded`} className={`${isIncome ? "bg-emerald-50/20" : "bg-red-50/10"}`}>
											<td colSpan={columnCount} className="px-4 py-3">
												<div className="ml-10 space-y-2">
													<div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
														<ChevronDown className="h-3 w-3" />
														Detail Transaksi
													</div>
													{hasScanItems && (
														<div className="overflow-hidden rounded-md border border-slate-200">
															<table className="w-full text-[10px]">
																<thead className="bg-slate-50">
																	<tr>
																		<th className="px-3 py-1.5 text-left font-medium text-slate-600">Item</th>
																		<th className="px-3 py-1.5 text-right font-medium text-slate-600">Qty</th>
																		<th className="px-3 py-1.5 text-right font-medium text-slate-600">Harga</th>
																		<th className="px-3 py-1.5 text-right font-medium text-slate-600">Total</th>
																	</tr>
																</thead>
																<tbody className="divide-y divide-slate-100">
																	{t.metadata.scanItems.map((item: any, i: number) => (
																		<tr key={i} className="hover:bg-slate-50/50">
																			<td className="px-3 py-1.5 font-medium text-slate-700">{item.name || "—"}</td>
																			<td className="px-3 py-1.5 text-right text-slate-600">{item.quantity ?? "—"}</td>
																			<td className="px-3 py-1.5 text-right font-mono text-slate-600">{Number.isFinite(Number(item.price)) ? formatCurrencyIDR(Number(item.price)) : "—"}</td>
																			<td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-800">{Number.isFinite(Number(item.total)) ? formatCurrencyIDR(Number(item.total)) : "—"}</td>
																		</tr>
																	))}
																</tbody>
															</table>
														</div>
													)}
													{hasReceiptMeta && t.metadata?.receiptDetails && (
														<div className="space-y-1 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-[10px]">
															{t.metadata.receiptDetails.receiptNumber && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">No. Struk</span>
																	<span className="font-mono font-medium text-slate-700">{t.metadata.receiptDetails.receiptNumber}</span>
																</div>
															)}
															{t.metadata.receiptDetails.merchantName && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">Toko</span>
																	<span className="text-slate-700">{t.metadata.receiptDetails.merchantName}</span>
																</div>
															)}
															{t.metadata.receiptDetails.date && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">Tanggal</span>
																	<span className="text-slate-700">{t.metadata.receiptDetails.date}</span>
																</div>
															)}
															{Number.isFinite(Number(t.metadata.receiptDetails.tax)) && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">Pajak</span>
																	<span className="text-slate-700">{formatCurrencyIDR(Number(t.metadata.receiptDetails.tax))}</span>
																</div>
															)}
															{Number.isFinite(Number(t.metadata.receiptDetails.serviceCharge)) && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">Biaya Layanan</span>
																	<span className="text-slate-700">{formatCurrencyIDR(Number(t.metadata.receiptDetails.serviceCharge))}</span>
																</div>
															)}
															{Number.isFinite(Number(t.metadata.receiptDetails.discount)) && (
																<div className="flex gap-2">
																	<span className="text-slate-400 w-28 shrink-0">Diskon</span>
																	<span className="text-slate-700">{formatCurrencyIDR(Number(t.metadata.receiptDetails.discount))}</span>
																</div>
															)}
														</div>
													)}
												{hasReceiptMeta && t.metadata?.ocr && !t.metadata?.receiptDetails && (
													<div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-[10px]">
														{t.metadata.receipt_number && (
															<div className="flex gap-2">
																<span className="text-slate-400 w-28 shrink-0">No. Struk</span>
																<span className="font-mono font-medium text-slate-700">{t.metadata.receipt_number}</span>
															</div>
														)}
														{t.metadata.receipt_date && (
															<div className="flex gap-2">
																<span className="text-slate-400 w-28 shrink-0">Tanggal</span>
																<span className="text-slate-700">{t.metadata.receipt_date}</span>
															</div>
														)}
														{t.metadata.item_count && (
															<div className="flex gap-2">
																<span className="text-slate-400 w-28 shrink-0">Jumlah Item</span>
																<span className="font-semibold text-slate-700">{t.metadata.item_count}</span>
															</div>
														)}
												{t.description && !hasScanItems && !t.metadata?.receiptDetails && (() => {
													// Parse description: "Belanja - MERCHANT: ITEM ×QTY, ITEM2 × QTY..."
													let merchant = "";
													let parsedItems: { name: string; qty: number }[] = [];
													const desc = t.description || "";
													
													// Coba parse format "PREFIX - MERCHANT: ITEM1 ×QTY1, ITEM2 ×QTY2 ..."
													const merchantMatch = desc.match(/^[^:]+:\s*/);
													if (merchantMatch) {
														const afterPrefix = desc.slice(merchantMatch[0].length);
														// Extract items separated by comma
														const parts = afterPrefix.split(/, ?\+ \d+ (item|produk) lain/);
														const mainPart = parts[0];
														const itemParts = mainPart.split(/, (?=\S)/);
														for (const ip of itemParts) {
															const m = ip.match(/^(.+?)\s*[×xX]\s*([\d.]+)/);
															if (m) {
																parsedItems.push({ name: m[1].trim(), qty: parseFloat(m[2]) || 0 });
															}
														}
													}
													
													if (parsedItems.length === 0) {
														// Fallback: tampilkan description sebagai teks biasa
														return (
															<div className="border-slate-200 border-t pt-1.5 mt-1.5">
																<span className="block text-[10px] font-medium text-slate-500 mb-1">Daftar Item:</span>
																<p className="text-[10px] text-slate-700 leading-relaxed whitespace-pre-wrap">{desc}</p>
															</div>
														);
													}
													
													return (
														<div className="border-slate-200 border-t pt-1.5 mt-1.5">
															<span className="block text-[10px] font-medium text-slate-500 mb-1">Daftar Item:</span>
		<div className="overflow-hidden rounded-md border border-slate-200">
			<table className="w-full text-[10px]">
				<thead className="bg-slate-50">
					<tr>
						<th className="px-3 py-1.5 text-left font-medium text-slate-600">Item</th>
						<th className="px-3 py-1.5 text-right font-medium text-slate-600">Qty</th>
						<th className="px-3 py-1.5 text-right font-medium text-slate-600">Harga</th>
						<th className="px-3 py-1.5 text-right font-medium text-slate-600">Total</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{parsedItems.map((item, i) => (
						<tr key={i} className="hover:bg-slate-50/50">
							<td className="px-3 py-1.5 font-medium text-slate-700">{item.name}</td>
							<td className="px-3 py-1.5 text-right font-mono text-slate-600">{item.qty}</td>
							<td className="px-3 py-1.5 text-right font-mono text-slate-400">—</td>
							<td className="px-3 py-1.5 text-right font-mono text-slate-400">—</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
														</div>
													);
												})()}
													</div>
												)}
												</div>
											</td>
										</tr>
									)}
									</>
								);
							})}
									{virtualized.shouldVirtualize && virtualized.bottomSpacer > 0 && (
										<tr><td colSpan={columnCount} style={{ height: `${virtualized.bottomSpacer}px`, padding: 0, border: 0 }} /></tr>
									)}
								</>
							)}
						</tbody>
					</table>
				</div>

				{/* ── Pagination ─────────────────────────────────────────────── */}
				{data && (
					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
						<span className="text-[10px] text-slate-400">
							Hal {data.page || page} / {data.pageCount || 1} &middot; {data.count} baris
						</span>
						<div className="flex items-center gap-1.5">
							<select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)}
								className="h-6 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-700">
								<option value={25}>25</option>
								<option value={50}>50</option>
								<option value={100}>100</option>
							</select>
							<span className="text-[10px] text-slate-400">/ hal</span>
							<button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={(data.page || page) <= 1}
								className="rounded border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40">
								← Prev
							</button>
							<button type="button" onClick={() => setPage((p) => Math.min(data.pageCount || 1, p + 1))}
								disabled={(data.page || page) >= (data.pageCount || 1)}
								className="rounded border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40">
								Next →
							</button>
						</div>
					</div>
				)}
			</div>

			<NewTransactionDialog
				isOpen={isEditDialogOpen}
				onClose={() => { setIsEditDialogOpen(false); setSelectedTransaction(null); }}
				transaction={selectedTransaction}
			/>
		</div>
	);
}

