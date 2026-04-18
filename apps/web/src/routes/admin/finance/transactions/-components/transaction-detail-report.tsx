import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Wallet, Pencil, Trash2, Search, Filter, ArrowUpDown, FileText, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import type { DateRange, PeriodOption } from "../../reports/-components/period-selector";
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
	period?: PeriodOption;
	periodButtons?: Array<{ value: PeriodOption; label: string }>;
	onPeriodChange?: (value: PeriodOption) => void;
	onViewModeChange?: (mode: "transaction" | "item") => void;
	onGroupModeChange?: (mode: "flat" | "grouped") => void;
	onExportPdf?: () => void;
	isExporting?: boolean;
	onOpenAddTransaction?: () => void;
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
	period,
	periodButtons,
	onPeriodChange,
	onViewModeChange,
	onGroupModeChange,
	onExportPdf,
	isExporting,
	onOpenAddTransaction,
	summary,
}: Props) {
	const [filterType, setFilterType] = useState<"income" | "expense" | undefined>(undefined);
	const [filterCategory, setFilterCategory] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [minAmount, setMinAmount] = useState<string>("");
	const [maxAmount, setMaxAmount] = useState<string>("");
	const [sortBy, setSortBy] = useState<"date" | "amount">("date");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	
	const [showFilters, setShowFilters] = useState(false);
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
		if (groupMode !== "grouped") {
			return filteredTransactions;
		}

		const rows: any[] = [];
		const itemRowTypes = new Set(["receipt_item", "order_item", "booking_item"]);
		const sortedByDateDesc = [...filteredTransactions].sort((a: any, b: any) => b.date - a.date);
		const dayGroups = new Map<string, any[]>();

		for (const row of sortedByDateDesc) {
			const dayKey = format(new Date(row.date), "yyyy-MM-dd");
			const bucket = dayGroups.get(dayKey) || [];
			bucket.push(row);
			dayGroups.set(dayKey, bucket);
		}

		for (const [dayKey, dayRows] of dayGroups.entries()) {
			const dayNodeKey = `day::${dayKey}`;
			const dayAmount = dayRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
			const dayCollapsed = collapsedGroups.has(dayNodeKey);
			rows.push({
				rowType: "hierarchy_node",
				level: "day",
				nodeKey: dayNodeKey,
				label: format(new Date(dayRows[0].date), "dd MMM yyyy", { locale: localeID }),
				count: dayRows.length,
				amount: dayAmount,
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
				const key = shiftLabel || "-";
				const bucket = shiftGroups.get(key) || [];
				bucket.push(row);
				shiftGroups.set(key, bucket);
			}

			for (const [shiftKeyRaw, shiftRows] of shiftGroups.entries()) {
				const shiftNodeKey = `${dayNodeKey}::shift::${shiftKeyRaw}`;
				const shiftAmount = shiftRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
				const shiftCollapsed = collapsedGroups.has(shiftNodeKey);
				rows.push({
					rowType: "hierarchy_node",
					level: "shift",
					nodeKey: shiftNodeKey,
					label: shiftKeyRaw,
					count: shiftRows.length,
					amount: shiftAmount,
					expandable: true,
					isCollapsed: shiftCollapsed,
				});
				if (shiftCollapsed) continue;

				const typeGroups = new Map<string, any[]>();
				for (const row of shiftRows) {
					const typeKey = row.type === "income" ? "Pemasukan" : "Pengeluaran";
					const bucket = typeGroups.get(typeKey) || [];
					bucket.push(row);
					typeGroups.set(typeKey, bucket);
				}

				for (const [typeKey, typeRows] of typeGroups.entries()) {
					const typeNodeKey = `${shiftNodeKey}::type::${typeKey}`;
					const typeAmount = typeRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
					const typeCollapsed = collapsedGroups.has(typeNodeKey);
					rows.push({
						rowType: "hierarchy_node",
						level: "type",
						nodeKey: typeNodeKey,
						label: typeKey,
						count: typeRows.length,
						amount: typeAmount,
						expandable: true,
						isCollapsed: typeCollapsed,
					});
					if (typeCollapsed) continue;

					const txGroups = new Map<string, any[]>();
					for (const row of typeRows) {
						const txKey = String(row._id);
						const bucket = txGroups.get(txKey) || [];
						bucket.push(row);
						txGroups.set(txKey, bucket);
					}

					for (const [txKey, txRows] of txGroups.entries()) {
						const txHead = txRows[0];
						const txNodeKey = `${typeNodeKey}::tx::${txKey}`;
						const txAmount = txRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
						const txCollapsed = collapsedGroups.has(txNodeKey);
						rows.push({
							rowType: "hierarchy_node",
							level: "transaction",
							nodeKey: txNodeKey,
							label: `${format(new Date(txHead.date), "HH:mm")} • ${txHead.displayTitle || txHead.merchant || "Transaksi"}`,
							count: txRows.length,
							amount: txAmount,
							expandable: true,
							isCollapsed: txCollapsed,
						});
						if (txCollapsed) continue;

						const itemRows = txRows.filter((row) => itemRowTypes.has(String(row.rowType)));
						if (itemRows.length > 0) {
							for (let itemIndex = 0; itemIndex < itemRows.length; itemIndex += 1) {
								const itemRow = itemRows[itemIndex];
								const itemNodeKey = `${txNodeKey}::item::${String(itemRow.rowKey || itemRow._id)}::${itemIndex}`;
								const itemCollapsed = collapsedGroups.has(itemNodeKey);
								rows.push({
									rowType: "hierarchy_node",
									level: "item",
									nodeKey: itemNodeKey,
									label:
										itemRow.displaySummary ||
										itemRow.displayTitle ||
										itemRow.description ||
										`Item ${itemIndex + 1}`,
									count: 1,
									amount: Number(itemRow.amount) || 0,
									expandable: true,
									isCollapsed: itemCollapsed,
								});
								if (itemCollapsed) continue;

								const detailItems = Array.isArray(itemRow.detailItems) ? itemRow.detailItems : [];
								for (let detailIndex = 0; detailIndex < detailItems.length; detailIndex += 1) {
									const detail = detailItems[detailIndex];
									rows.push({
										rowType: "hierarchy_node",
										level: "detail",
										nodeKey: `${itemNodeKey}::detail::${detailIndex}`,
										label: detail?.label || "Detail",
										value: detail?.value || "-",
										expandable: false,
										isCollapsed: false,
									});
								}
							}
						} else {
							const fallbackItemNodeKey = `${txNodeKey}::item::summary`;
							const fallbackCollapsed = collapsedGroups.has(fallbackItemNodeKey);
							rows.push({
								rowType: "hierarchy_node",
								level: "item",
								nodeKey: fallbackItemNodeKey,
								label: txHead.displaySummary || txHead.description || "Ringkasan transaksi",
								count: 1,
								amount: Number(txHead.amount) || 0,
								expandable: true,
								isCollapsed: fallbackCollapsed,
							});
							if (!fallbackCollapsed) {
								const detailItems = Array.isArray(txHead.detailItems) ? txHead.detailItems : [];
								for (let detailIndex = 0; detailIndex < detailItems.length; detailIndex += 1) {
									const detail = detailItems[detailIndex];
									rows.push({
										rowType: "hierarchy_node",
										level: "detail",
										nodeKey: `${fallbackItemNodeKey}::detail::${detailIndex}`,
										label: detail?.label || "Detail",
										value: detail?.value || "-",
										expandable: false,
										isCollapsed: false,
									});
								}
							}
						}
					}
				}
			}
		}

		return rows;
	}, [filteredTransactions, groupMode, collapsedGroups, historicalShifts]);
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
			if (row.rowType === "hierarchy_node") continue;
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

	const columnCount = 7;
	const withMergedHeader = Boolean(
		period &&
			periodButtons &&
			onPeriodChange &&
			onViewModeChange &&
			onGroupModeChange &&
			onExportPdf &&
			onOpenAddTransaction &&
			summary
	);

	const hasActiveFilters = !!(searchQuery || minAmount || maxAmount || filterCategory);

	return (
		<div className="space-y-1 p-1">
			{/* ── Compact Summary + Period Bar ─────────────────────────────── */}
			{withMergedHeader && (
				<div className="sticky top-0 z-30 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
					{/* Row 1: title + view controls + actions */}
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2">
						<div className="flex items-center gap-3">
							<h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Transaksi</h2>
							<div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
								<button
									type="button"
									onClick={() => onViewModeChange!("transaction")}
									className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
										viewMode === "transaction"
											? "bg-blue-600 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Transaksi
								</button>
								<button
									type="button"
									onClick={() => onViewModeChange!("item")}
									className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
										viewMode === "item"
											? "bg-blue-600 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Item
								</button>
							</div>
							<div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
								<button
									type="button"
									onClick={() => onGroupModeChange!("flat")}
									className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
										groupMode === "flat"
											? "bg-slate-700 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Flat
								</button>
								<button
									type="button"
									onClick={() => onGroupModeChange!("grouped")}
									className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
										groupMode === "grouped"
											? "bg-slate-700 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									Grouped
								</button>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onExportPdf}
								disabled={isExporting}
								className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
							>
								<FileText className="h-3.5 w-3.5" />
								PDF
							</button>
							<button
								type="button"
								onClick={onOpenAddTransaction}
								className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
							>
								<Plus className="h-3.5 w-3.5" />
								Catat
							</button>
						</div>
					</div>

					{/* Row 2: period buttons + summary stats */}
					<div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
						<div className="flex flex-wrap items-center gap-1">
							{periodButtons!.map((item) => (
								<button
									key={item.value}
									type="button"
									onClick={() => onPeriodChange!(item.value)}
									className={`rounded-sm border px-2.5 py-1 text-[10px] font-medium transition-colors ${
										period === item.value
											? "border-emerald-500 bg-emerald-50 text-emerald-700"
											: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>
						<div className="flex items-center divide-x divide-slate-200 text-[11px]">
							<span className="pr-3 text-slate-500">{summary!.periodLabel}</span>
							<span className="px-3 font-semibold text-emerald-600">
								↑ {formatCurrencyIDR(summary!.totalIncome)}
							</span>
							<span className="px-3 font-semibold text-orange-500">
								↓ {formatCurrencyIDR(summary!.totalExpense)}
							</span>
							<span className={`pl-3 font-bold ${summary!.netBalance >= 0 ? "text-slate-900" : "text-red-600"}`}>
								= {summary!.netBalance < 0 ? "-" : ""}{formatCurrencyIDR(Math.abs(summary!.netBalance))}
							</span>
							<span className="pl-3 text-slate-500">{summary!.count} tx</span>
						</div>
					</div>
				</div>
			)}

			<div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">

				{/* ── Single-line filter bar ────────────────────────────────── */}
				<div className="border-b border-slate-200/80 px-2 py-1.5">
					<div className="flex flex-wrap items-center gap-2">
						{/* Type filter */}
						<div className="flex gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
							{(["all", "income", "expense"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setFilterType(t === "all" ? undefined : t)}
									className={`rounded px-2.5 py-1 text-[10px] font-semibold transition-all ${
										(t === "all" && !filterType) || filterType === t
											? t === "income"
												? "bg-emerald-600 text-white"
												: t === "expense"
													? "bg-orange-500 text-white"
													: "bg-slate-700 text-white"
											: "text-slate-600 hover:bg-slate-100"
									}`}
								>
									{t === "all" ? "Semua" : t === "income" ? "Pemasukan" : "Pengeluaran"}
								</button>
							))}
						</div>

						{/* Search */}
						<div className="relative flex-1 min-w-[180px] max-w-xs">
							<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
							<input
								type="text"
								placeholder="Cari transaksi..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-7 w-full rounded border border-slate-300 bg-slate-50 pl-7 pr-2 text-[11px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
							/>
						</div>

						{/* Sort toggle */}
						<button
							type="button"
							onClick={() => {
								if (sortBy === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
								else setSortBy("date");
							}}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${
								sortBy === "date" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600"
							}`}
						>
							<ArrowUpDown className="h-3 w-3" />
							Tanggal {sortBy === "date" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
						</button>
						<button
							type="button"
							onClick={() => {
								if (sortBy === "amount") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
								else setSortBy("amount");
							}}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${
								sortBy === "amount" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600"
							}`}
						>
							Nominal {sortBy === "amount" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
						</button>

						{/* Filter toggle */}
						<button
							type="button"
							onClick={() => setShowFilters((v) => !v)}
							className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-medium transition-colors ${
								showFilters || filterCategory || minAmount || maxAmount
									? "border-blue-400 bg-blue-50 text-blue-700"
									: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
							}`}
						>
							<Filter className="h-3 w-3" />
							Filter
							{showFilters ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
						</button>

						{hasActiveFilters && (
							<button
								type="button"
								onClick={() => {
									setSearchQuery("");
									setMinAmount("");
									setMaxAmount("");
									setFilterCategory("");
								}}
								className="text-[10px] text-red-500 hover:text-red-700 hover:underline"
							>
								Reset
							</button>
						)}
					</div>

					{/* Collapsible extended filters */}
					{showFilters && (
						<div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
							<div className="flex items-center gap-1.5">
								<span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Nominal:</span>
								<input
									type="number"
									placeholder="Min"
									value={minAmount}
									onChange={(e) => setMinAmount(e.target.value)}
									className="h-6 w-24 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
								/>
								<span className="text-slate-400">–</span>
								<input
									type="number"
									placeholder="Max"
									value={maxAmount}
									onChange={(e) => setMaxAmount(e.target.value)}
									className="h-6 w-24 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
								/>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Kategori:</span>
								<select
									value={filterCategory}
									onChange={(e) => setFilterCategory(e.target.value)}
									className="h-6 rounded border border-slate-300 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
								>
									<option value="">Semua</option>
									{EXPENSE_CATEGORIES.map((cat) => (
										<option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
									))}
								</select>
							</div>
						</div>
					)}
				</div>

				{/* ── Bulk action bar ───────────────────────────────────────── */}
				{selectedVisibleCount > 0 && (
					<div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-3 py-1.5">
						<p className="text-[11px] text-slate-700">
							<span className="font-semibold text-slate-900">{selectedVisibleCount}</span> baris dipilih
						</p>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setSelectedRowKeys(new Set())}
								className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={handleBulkDelete}
								className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700"
							>
								<Trash2 className="h-3 w-3" />
								Hapus {selectedVisibleCount} Terpilih
							</button>
						</div>
					</div>
				)}

				{/* ── Table ─────────────────────────────────────────────────── */}
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
							<col />
							<col style={{ width: "160px" }} />
							<col style={{ width: "88px" }} />
						</colgroup>
						<thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
							<tr>
								<th className="sticky left-0 z-20 border-r border-b border-slate-200 bg-slate-50 px-1.5 py-2">
									<div className="flex items-center justify-center">
										<Checkbox
											checked={allVisibleSelected}
											onCheckedChange={handleToggleSelectAll}
											aria-label="Pilih semua"
											disabled={filteredRowKeys.length === 0}
											className="rounded-sm border-muted-foreground/40 bg-muted/40 data-checked:border-primary data-checked:bg-primary"
										/>
									</div>
								</th>
								<th className="sticky left-[36px] z-20 border-r border-b border-slate-200 bg-slate-50 px-1.5 py-2 text-center">No</th>
								<th className="border-b border-slate-200 px-3 py-2">Tanggal</th>
								<th className="border-b border-slate-200 px-3 py-2">Sumber</th>
								<th className="border-b border-slate-200 px-3 py-2">Deskripsi</th>
								<th className="sticky right-[88px] z-20 border-l border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Nominal</th>
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
										<tr>
											<td colSpan={columnCount} style={{ height: `${virtualized.topSpacer}px`, padding: 0, border: 0 }} />
										</tr>
									)}
									{virtualized.rows.map((t: any) => {
										if (t.rowType === "hierarchy_node") {
											const levelPadding: Record<string, string> = {
												day: "pl-2",
												shift: "pl-6",
												type: "pl-10",
												transaction: "pl-14",
												item: "pl-[72px]",
												detail: "pl-[88px]",
											};
											const isExpandable = Boolean(t.expandable);
											const nodeAmount = Number(t.amount || 0);
											const nodeLabel =
												t.level === "day"
													? `${t.label} · ${t.count} transaksi`
													: t.level === "shift"
														? `Shift ${t.label} · ${t.count} transaksi`
														: t.level === "type"
															? `${t.label} · ${t.count} transaksi`
															: t.level === "transaction"
																? `Transaksi ${t.label}`
																: t.level === "item"
																	? `Item ${t.label}`
																	: `${t.label}: ${t.value}`;
											return (
												<tr key={t.nodeKey} className="bg-slate-50/60">
													<td colSpan={columnCount} className="px-2 py-1">
														<button
															type="button"
															onClick={() => { if (isExpandable) toggleGroup(t.nodeKey); }}
															className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] ${isExpandable ? "hover:bg-slate-100" : ""}`}
														>
															<span className={`font-medium text-slate-600 ${levelPadding[t.level] || "pl-2"}`}>
																{isExpandable
																	? (t.isCollapsed ? <ChevronRight className="inline h-3 w-3 mr-1" /> : <ChevronDown className="inline h-3 w-3 mr-1" />)
																	: <span className="mr-1 text-slate-400">•</span>
																}
																{nodeLabel}
															</span>
															{t.level !== "detail" && (
																<span className={`font-mono text-[11px] font-semibold ${nodeAmount >= 0 ? "text-emerald-600" : "text-orange-500"}`}>
																	{nodeAmount >= 0 ? "+" : "-"} {formatCurrencyIDR(Math.abs(nodeAmount))}
																</span>
															)}
														</button>
													</td>
												</tr>
											);
										}

										const rowKey = String(t.rowKey || t._id);
										let shiftName = "-";
										if (historicalShifts) {
											const shift = historicalShifts.find(
												(s: any) => t.date >= s.startTime && (!s.endTime || t.date <= s.endTime)
											);
											if (shift) shiftName = shift.shiftName || "Shift Aktif";
										}

										const isIncome = t.type === "income";

										return (
											<tr
												key={rowKey}
												className={`group cursor-pointer transition-colors hover:bg-slate-50 ${
													selectedRowKeys.has(rowKey) ? "bg-blue-50/50" : ""
												}`}
												onClick={() => {
													if (editingItemRowKey === rowKey) return;
													handleEdit(t);
												}}
											>
												{/* Checkbox */}
												<td
													className="sticky left-0 z-10 w-9 border-r border-slate-100 bg-white px-1.5 group-hover:bg-slate-50"
													onClick={(e) => e.stopPropagation()}
												>
													{/* Left border indicator */}
													<div className={`absolute inset-y-0 left-0 w-[3px] ${isIncome ? "bg-emerald-400" : "bg-orange-400"}`} />
													<div className="flex items-center justify-center pl-1">
														<Checkbox
															checked={selectedRowKeys.has(rowKey)}
															onCheckedChange={() => handleToggleRow(rowKey)}
															aria-label={`Pilih transaksi ${t.merchant || "Umum"}`}
															className="rounded-sm border-muted-foreground/40 bg-muted/40 data-checked:border-primary data-checked:bg-primary"
														/>
													</div>
												</td>

												{/* No */}
												<td className="sticky left-[36px] z-10 w-11 border-r border-slate-100 bg-white px-1.5 py-2 text-center font-mono text-[10px] text-slate-400 group-hover:bg-slate-50">
													{rowNumberByKey.get(rowKey) || "-"}
												</td>

												{/* Tanggal — with shift tooltip */}
												<td className="px-3 py-2 whitespace-nowrap">
													<div className="flex flex-col leading-tight">
														<span className="font-medium text-slate-900 text-[11px]">
															{format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}
														</span>
														<span
															className="text-[10px] text-slate-400"
															title={shiftName !== "-" ? `Shift: ${shiftName}` : undefined}
														>
															{format(new Date(t.date), "HH:mm")}
															{shiftName !== "-" && (
																<span className="ml-1 text-slate-300">· {shiftName}</span>
															)}
														</span>
													</div>
												</td>

												{/* Sumber */}
												<td className="px-3 py-2 whitespace-nowrap">
													<span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
														{(t.sourceLabel || t.sourceType || "-").replace(/_/g, " ")}
													</span>
												</td>

												{/* Deskripsi */}
												<td className="px-3 py-2">
													<span
														className="block max-w-xs truncate font-medium text-slate-800 text-[11px]"
														title={t.displaySummary || t.description || "-"}
													>
														{t.displaySummary || t.description || "-"}
													</span>
												</td>

												{/* Nominal */}
												<td className="sticky right-[88px] z-10 border-l border-slate-100 bg-white px-3 py-2 text-right whitespace-nowrap group-hover:bg-slate-50">
													<span className={`font-mono text-[13px] font-semibold tracking-tight ${isIncome ? "text-emerald-600" : "text-orange-500"}`}>
														{isIncome ? "+" : "−"} {formatCurrencyIDR(t.amount)}
													</span>
												</td>

												{/* Aksi — hover: edit + delete */}
												<td
													className="sticky right-0 z-10 border-l border-slate-100 bg-white px-2 py-2 group-hover:bg-slate-50"
													onClick={(e) => e.stopPropagation()}
												>
													<div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
														<button
															type="button"
															onClick={(e) => { e.stopPropagation(); handleEdit(t); }}
															className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
															title="Edit"
														>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
															className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
															title="Hapus"
														>
															<Trash2 className="h-3.5 w-3.5" />
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

				{/* ── Pagination ────────────────────────────────────────────── */}
				{data && (
					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
						<span className="text-[10px] text-slate-400">
							Hal {data.page || page} / {data.pageCount || 1} &middot; {data.count} baris
						</span>
						<div className="flex items-center gap-1.5">
							<select
								value={pageSize}
								onChange={(e) => setPageSize(Number(e.target.value) || 50)}
								className="h-6 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-700"
							>
								<option value={25}>25</option>
								<option value={50}>50</option>
								<option value={100}>100</option>
							</select>
							<span className="text-[10px] text-slate-400">/ hal</span>
							<button
								type="button"
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={(data.page || page) <= 1}
								className="rounded border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
							>
								← Prev
							</button>
							<button
								type="button"
								onClick={() => setPage((p) => Math.min(data.pageCount || 1, p + 1))}
								disabled={(data.page || page) >= (data.pageCount || 1)}
								className="rounded border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
							>
								Next →
							</button>
						</div>
					</div>
				)}
			</div>

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













