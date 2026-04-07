import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	AlertCircle,
	BadgeAlert,
	BarChart3,
	Boxes,
	ArrowDown,
	ArrowUp,
	Edit,
	History,
	MoreHorizontal,
	PackageSearch,
	PanelRight,
	Minus,
	Plus,
	Search,
	Settings2,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface ConfirmConfig {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

type InventoryViewPreset = "all" | "critical" | "planning";

type InventoryWorkspaceRow = {
	inventoryId: Id<"inventory">;
	ingredientName: string;
	currentStock: number;
	unit: string;
	displayUnit?: string;
	conversionFactor?: number;
	lowStockThreshold: number;
	avgDailyUsage: number;
	daysUntilStockout: number | null;
	reorderPoint: number;
	suggestedOrderQty: number;
	riskLevel: "high" | "medium" | "low";
	status: "critical" | "warning" | "healthy";
	relatedProductCount: number;
	relatedRecipeCount: number;
	relatedBaseRecipeCount: number;
	activeRelatedProductCount: number;
	producedByBaseRecipeName: string | null;
	latestTransaction: {
		type: string;
		quantity: number;
		timestamp: number;
		notes?: string;
	} | null;
};

type InventoryWorkspaceData = {
	summary: {
		totalItems: number;
		totalStockUnits: number;
		lowStockCount: number;
		riskHighCount: number;
		riskMediumCount: number;
		recentUsageTxCount: number;
		recentRestockTxCount: number;
		daysWindow: number;
	};
	rows: InventoryWorkspaceRow[];
};

export const Route = createLazyFileRoute("/admin/inventory")({
	component: InventoryPage,
});

function InventoryPage() {
	const inventory = useQuery(api.inventory.getInventory);
	const workspace = useQuery(api.inventory.getInventoryWorkspace, {
		daysWindow: 30,
	}) as InventoryWorkspaceData | undefined;
	const applyStockAction = useMutation(api.inventory.applyInventoryStockAction);
	const createItem = useMutation(api.inventory.createInventoryItem);
	const updateItem = useMutation(api.inventory.updateInventoryItem);
	const deleteItem = useMutation(api.inventory.deleteInventoryItem);

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedItem, setSelectedItem] = useState<Doc<"inventory"> | null>(
		null
	);
	const [actionType, setActionType] = useState<
		"add" | "usage" | "history" | "create" | "edit" | "adjust" | "delete" | "batchInfo" | null
	>(null);
	const [amount, setAmount] = useState("");
	const [filterLowStock, setFilterLowStock] = useState(false);
	const [viewPreset, setViewPreset] = useState<InventoryViewPreset>("all");
	const [addRowSignal, setAddRowSignal] = useState(0);
	const [detailItem, setDetailItem] = useState<Doc<"inventory"> | null>(null);
	const [newItem, setNewItem] = useState({
		ingredientName: "",
		unit: "gram",
		quantity: "0",
		lowStockThreshold: "100",
		displayUnit: "",
		conversionFactor: "",
		baseRecipeId: "" as string,
	});
	const [notes, setNotes] = useState("");
	const [costPerUnit, setCostPerUnit] = useState("");
	const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
	const [sortConfig, setSortConfig] = useState<{
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout";
		direction: "asc" | "desc";
	}>({ key: "ingredientName", direction: "asc" });
	const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	useEffect(() => {
		if (actionType !== null) {
			setDetailItem(null);
		}
	}, [actionType]);

	const inventoryMap = useMemo(() => {
		const nextMap = new Map<Id<"inventory">, Doc<"inventory">>();
		for (const item of inventory ?? []) {
			nextMap.set(item._id, item);
		}
		return nextMap;
	}, [inventory]);

	const filteredRows = useMemo(() => {
		if (!workspace) {
			return [];
		}
		const result = workspace.rows.filter((row) => {
			const matchesSearch = row.ingredientName
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
			const matchesFilter = filterLowStock
				? row.currentStock <= row.lowStockThreshold
				: true;
			const matchesPreset =
				viewPreset === "critical"
					? row.status !== "healthy"
					: viewPreset === "planning"
						? row.avgDailyUsage > 0 || row.suggestedOrderQty > 0
						: true;
			return matchesSearch && matchesFilter && matchesPreset;
		});

		result.sort((a, b) => {
			const aValue = a[sortConfig.key] ?? "";
			const bValue = b[sortConfig.key] ?? "";
			if (aValue < bValue) {
				return sortConfig.direction === "asc" ? -1 : 1;
			}
			if (aValue > bValue) {
				return sortConfig.direction === "asc" ? 1 : -1;
			}
			return 0;
		});

		return result;
	}, [workspace, searchQuery, filterLowStock, viewPreset, sortConfig]);

	const handleSort = (
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout"
	) => {
		setSortConfig((prev) => ({
			key,
			direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
		}));
	};

	const handleCreateItem = async () => {
		await createItem({
			ingredientName: newItem.ingredientName,
			unit: newItem.unit,
			quantity: Number(newItem.quantity),
			lowStockThreshold: Number(newItem.lowStockThreshold),
			displayUnit: newItem.displayUnit || undefined,
			conversionFactor: newItem.conversionFactor
				? Number(newItem.conversionFactor)
				: undefined,
			baseRecipeId: (newItem.baseRecipeId as Id<"baseRecipes">) || undefined,
		});
		toast.success("Bahan baku ditambahkan");
	};

	const handleEditItem = async (selected: Doc<"inventory">) => {
		await updateItem({
			id: selected._id,
			ingredientName: newItem.ingredientName,
			unit: newItem.unit,
			lowStockThreshold: Number(newItem.lowStockThreshold),
			displayUnit: newItem.displayUnit || undefined,
			conversionFactor: newItem.conversionFactor
				? Number(newItem.conversionFactor)
				: undefined,
			baseRecipeId: (newItem.baseRecipeId as Id<"baseRecipes">) || undefined,
		});
		toast.success("Bahan baku diperbarui");
	};

	const handleStockAction = async (
		selected: Doc<"inventory">,
		type: "add" | "usage" | "adjust"
	) => {
		const numAmount = Number(amount);
		const baseArgs = {
			inventoryId: selected._id,
			quantity: numAmount,
			notes,
		};

		if (type === "add") {
			await applyStockAction({
				...baseArgs,
				action: "add",
				costPerUnit: costPerUnit ? Number(costPerUnit) : undefined,
				timestamp: entryDate ? new Date(entryDate).getTime() : undefined,
			});
			toast.success(`Stok ${selected.ingredientName} ditambahkan`);
		} else if (type === "usage") {
			await applyStockAction({
				...baseArgs,
				action: "usage",
			});
			toast.success(`Penggunaan ${selected.ingredientName} dicatat`);
		} else if (type === "adjust") {
			await applyStockAction({
				...baseArgs,
				action: "adjust",
			});
			toast.success(`Stok ${selected.ingredientName} disesuaikan`);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		try {
			if (actionType === "create") {
				await handleCreateItem();
			} else if (actionType === "edit" && selectedItem) {
				await handleEditItem(selectedItem);
			} else if (actionType === "delete" && selectedItem) {
				await deleteItem({ id: selectedItem._id });
				toast.success("Bahan baku dihapus");
			} else if (
				selectedItem &&
				(actionType === "add" ||
					actionType === "usage" ||
					actionType === "adjust")
			) {
				await handleStockAction(selectedItem, actionType);
			}

			setSelectedItem(null);
			setActionType(null);
			setAmount("");
			setNotes("");
			setCostPerUnit("");
			setEntryDate(new Date().toISOString().split("T")[0]);
			setNewItem({
				ingredientName: "",
				unit: "gram",
				quantity: "0",
				lowStockThreshold: "100",
				displayUnit: "",
				conversionFactor: "",
				baseRecipeId: "",
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Terjadi kesalahan";
			toast.error(message);
		}
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-3 duration-500">
			<InventoryHeader
				filterLowStock={filterLowStock}
				onAddRow={() => setAddRowSignal((prev) => prev + 1)}
				onFilterLowStockChange={setFilterLowStock}
				onSearchQueryChange={setSearchQuery}
				onViewPresetChange={setViewPreset}
				searchQuery={searchQuery}
				viewPreset={viewPreset}
			/>

			<InventoryControlTowerSummary data={workspace} viewPreset={viewPreset} />

			<InventoryTable
				addRowSignal={addRowSignal}
				filteredRows={filteredRows}
				inventoryMap={inventoryMap}
				onActionTypeChange={setActionType}
				onDetailItemChange={setDetailItem}
				onSelectedItemChange={setSelectedItem}
				onSort={handleSort}
				sortConfig={sortConfig}
				viewPreset={viewPreset}
			/>

			<InventoryActionModal
				actionType={actionType}
				amount={amount}
				costPerUnit={costPerUnit}
				entryDate={entryDate}
				newItem={newItem}
				notes={notes}
				onActionTypeChange={setActionType}
				onAmountChange={setAmount}
				onCostPerUnitChange={setCostPerUnit}
				onEntryDateChange={setEntryDate}
				onNewItemChange={setNewItem}
				onNotesChange={setNotes}
				onSelectedItemChange={setSelectedItem}
				onSubmit={handleSubmit}
				selectedItem={selectedItem}
				setConfirmConfig={setConfirmConfig}
			/>

			{/* Modal Views Mapping */}
			{/* Instead of nested ternaries, we use early returns or conditional blocks above */}

			{/* History Modal */}
			{selectedItem && actionType === "history" && (
				<InventoryHistoryModal
					item={selectedItem}
					onClose={() => {
						setSelectedItem(null);
						setActionType(null);
					}}
				/>
			)}

			{selectedItem && actionType === "batchInfo" && (
				<InventoryBatchModal
					item={selectedItem}
					onClose={() => {
						setSelectedItem(null);
						setActionType(null);
					}}
				/>
			)}
			{detailItem && (
				<InventoryDetailDrawer
					item={detailItem}
					onClose={() => setDetailItem(null)}
				/>
			)}

			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				message={confirmConfig.message}
				onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
				onConfirm={confirmConfig.onConfirm}
				title={confirmConfig.title}
			/>
		</div>
	);
}

function InventoryModalContent({
	selectedItem,
	onSelectedItemChange,
	actionType,
	onActionTypeChange,
	newItem,
	onNewItemChange,
	amount,
	onAmountChange,
	notes,
	onNotesChange,
	costPerUnit,
	onCostPerUnitChange,
	entryDate,
	onEntryDateChange,
	baseRecipes,
	produceBatch,
	setConfirmConfig,
}: {
	selectedItem: Doc<"inventory"> | null;
	onSelectedItemChange: (item: Doc<"inventory"> | null) => void;
	actionType:
		| "add"
		| "usage"
		| "edit"
		| "adjust"
		| "delete"
		| "create"
		| "history"
		| "batchInfo"
		| null;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "create"
			| "history"
			| "batchInfo"
			| null
	) => void;
	newItem: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		baseRecipeId: string;
	};
	onNewItemChange: (item: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		baseRecipeId: string;
	}) => void;
	amount: string;
	onAmountChange: (amount: string) => void;
	notes: string;
	onNotesChange: (notes: string) => void;
	costPerUnit: string;
	onCostPerUnitChange: (cost: string) => void;
	entryDate: string;
	onEntryDateChange: (date: string) => void;
	baseRecipes: Doc<"baseRecipes">[] | undefined;
	produceBatch: (args: {
		baseRecipeId: Id<"baseRecipes">;
		inventoryId: Id<"inventory">;
		batchMultiplier: number;
	}) => Promise<unknown>;
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	if (actionType === "create" || actionType === "edit") {
		return (
			<div className="space-y-6">
				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="ingredientName"
					>
						Nama Bahan
					</label>
					<input
						autoFocus
						className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
						id="ingredientName"
						onChange={(e) =>
							onNewItemChange({
								...newItem,
								ingredientName: e.target.value,
							})
						}
						placeholder="Contoh: Fresh Milk"
						required
						value={newItem.ingredientName}
					/>
				</div>
				<div className="grid grid-cols-2 gap-5">
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="unit"
						>
							Satuan Dasar
						</label>
						<select
							className="w-full appearance-none rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id="unit"
							onChange={(e) =>
								onNewItemChange({ ...newItem, unit: e.target.value })
							}
							value={newItem.unit}
						>
							<option value="gram">GRAM</option>
							<option value="ml">ML</option>
							<option value="pcs">PCS</option>
						</select>
					</div>
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="quantity"
						>
							{actionType === "create" ? "Stok Awal" : "Ambang Rendah"}
						</label>
						<input
							className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id={actionType === "create" ? "quantity" : "editThreshold"}
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									[actionType === "create" ? "quantity" : "lowStockThreshold"]:
										e.target.value,
								})
							}
							type="number"
							value={
								actionType === "create"
									? newItem.quantity
									: newItem.lowStockThreshold
							}
						/>
					</div>
				</div>

				<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-6">
					<p className="font-bold text-foreground text-[11px] uppercase tracking-widest">
						Konversi Unit (Opsional)
					</p>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label
								className="font-bold text-foreground/60 text-[9px] uppercase tracking-wider"
								htmlFor="displayUnit"
							>
								Satuan Tampilan
							</label>
							<input
								className="w-full rounded-md bg-background border border-border p-3 font-bold text-foreground text-xs outline-none transition-all focus:ring-1 focus:ring-ring"
								id="displayUnit"
								onChange={(e) =>
									onNewItemChange({
										...newItem,
										displayUnit: e.target.value,
									})
								}
								placeholder="Misal: Liter"
								value={newItem.displayUnit}
							/>
						</div>
						<div className="space-y-1.5">
							<label
								className="font-bold text-foreground/60 text-[9px] uppercase tracking-wider"
								htmlFor="conversionFactor"
							>
								Isi per 1 Satuan
							</label>
							<input
								className="w-full rounded-md bg-background border border-border p-3 font-bold text-foreground text-xs outline-none transition-all focus:ring-1 focus:ring-ring"
								id="conversionFactor"
								onChange={(e) =>
									onNewItemChange({
										...newItem,
										conversionFactor: e.target.value,
									})
								}
								placeholder="Misal: 1000"
								type="number"
								value={newItem.conversionFactor}
							/>
						</div>
					</div>
					<p className="text-foreground/50 text-[10px] italic leading-snug">
						* Contoh: Jika Satuan Dasar = ml, Satuan Tampilan = Liter, Isi =
						1000. Maka 2500 ml akan tampil 2.50 Liter.
					</p>
				</div>

				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="baseRecipeId"
					>
						Link ke Resep Base (Produksi)
					</label>
					<select
						className="w-full appearance-none rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
						id="baseRecipeId"
						onChange={(e) =>
							onNewItemChange({
								...newItem,
								baseRecipeId: e.target.value,
							})
						}
						value={newItem.baseRecipeId}
					>
						<option value="">BUKAN RACIKAN / PRE-MIX</option>
						{baseRecipes?.map((r: any) => (
							<option key={r._id} value={r._id}>
								{r.name.toUpperCase()}
							</option>
						))}
					</select>
				</div>
			</div>
		);
	}

	if (
		actionType === "add" ||
		actionType === "usage" ||
		actionType === "adjust"
	) {
		return (
			<div className="space-y-6">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="inventory-amount"
						>
							{actionType === "adjust"
								? "Stok Akhir"
								: `Jumlah (${selectedItem?.unit})`}
						</label>
						{selectedItem?.baseRecipeId && actionType === "add" && (
							<button
								className="font-bold text-foreground text-[10px] hover:underline"
								onClick={() => {
									setConfirmConfig({
										isOpen: true,
										title: "Konfirmasi Produksi",
										message: `Produksi 1 batch "${selectedItem.ingredientName}"? Ini akan mengurangi stok bahan dasarnya.`,
										onConfirm: async () => {
											try {
												if (!selectedItem.baseRecipeId) {
													return;
												}
												await produceBatch({
													baseRecipeId: selectedItem.baseRecipeId,
													inventoryId: selectedItem._id,
													batchMultiplier: 1,
												});
												toast.success("Produksi berhasil");
												onActionTypeChange(null);
												onSelectedItemChange(null);
											} catch (e: unknown) {
												const error = e as Error;
												toast.error(error.message);
											}
										},
									});
								}}
								type="button"
							>
								PRODUKSI VIA RESEP
							</button>
						)}
					</div>
					<input
						autoFocus
						className="w-full rounded-md bg-background border border-border p-6 font-black text-4xl text-foreground outline-none ring-ring transition-all focus:ring-4"
						id="inventory-amount"
						onChange={(e) => onAmountChange(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				{actionType === "add" && (
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label
								className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
								htmlFor="cost-per-unit"
							>
								Harga per Unit (IDR)
							</label>
							<input
								className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
								id="cost-per-unit"
								onChange={(e) => onCostPerUnitChange(e.target.value)}
								placeholder="contoh: 50000"
								type="number"
								value={costPerUnit}
							/>
						</div>
						<div className="space-y-2">
							<label
								className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
								htmlFor="entry-date"
							>
								Tanggal Masuk
							</label>
							<input
								className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
								id="entry-date"
								onChange={(e) => onEntryDateChange(e.target.value)}
								type="date"
								value={entryDate}
							/>
						</div>
					</div>
				)}

				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="inventory-notes"
					>
						Catatan
					</label>
					<input
						className="w-full rounded-md bg-background border border-border p-4 font-medium text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
						id="inventory-notes"
						onChange={(e) => onNotesChange(e.target.value)}
						placeholder="Catatan tambahan..."
						value={notes}
					/>
				</div>
			</div>
		);
	}

	return null;
}

function InventoryActionModal({
	selectedItem,
	onSelectedItemChange,
	actionType,
	onActionTypeChange,
	newItem,
	onNewItemChange,
	amount,
	onAmountChange,
	notes,
	onNotesChange,
	costPerUnit,
	onCostPerUnitChange,
	entryDate,
	onEntryDateChange,
	onSubmit,
	setConfirmConfig,
}: {
	selectedItem: Doc<"inventory"> | null;
	onSelectedItemChange: (item: Doc<"inventory"> | null) => void;
	actionType:
		| "add"
		| "usage"
		| "edit"
		| "adjust"
		| "delete"
		| "create"
		| "history"
		| "batchInfo"
		| null;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "create"
			| "history"
			| "batchInfo"
			| null
	) => void;
	newItem: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		baseRecipeId: string;
	};
	onNewItemChange: (item: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		baseRecipeId: string;
	}) => void;
	amount: string;
	onAmountChange: (amount: string) => void;
	notes: string;
	onNotesChange: (notes: string) => void;
	costPerUnit: string;
	onCostPerUnitChange: (cost: string) => void;
	entryDate: string;
	onEntryDateChange: (date: string) => void;
	onSubmit: (e: React.FormEvent) => void;
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const produceBatch = useMutation(api.inventory.produceBaseRecipeBatch);

	if (
		!(selectedItem || actionType === "create") ||
		actionType === "history" ||
		actionType === null
	) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="border-border border-b p-8 pb-3">
					<h3 className="font-bold text-2xl text-foreground tracking-tight">
						{actionType === "create" && "Tambah Bahan Baru"}
						{actionType === "edit" && "Edit Bahan Baku"}
						{actionType === "add" && "Update Stok"}
						{actionType === "adjust" && "Sesuaikan Stok"}
						{actionType === "usage" && "Catat Penggunaan"}
						{actionType === "delete" && "Hapus Bahan Baku"}
					</h3>
				</div>

				<form className="space-y-6" onSubmit={onSubmit}>
					<div className="custom-scrollbar max-h-[70vh] overflow-y-auto p-8">
						{actionType === "delete" ? (
							<div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
								<p className="font-bold text-[#EF4444] text-sm">
									Yakin ingin menghapus {selectedItem?.ingredientName}?
								</p>
								<p className="mt-2 text-destructive/80 text-xs">
									Tindakan ini tidak dapat dibatalkan.
								</p>
							</div>
						) : (
							<InventoryModalContent
								actionType={actionType}
								amount={amount}
								baseRecipes={baseRecipes}
								costPerUnit={costPerUnit}
								entryDate={entryDate}
								newItem={newItem}
								notes={notes}
								onActionTypeChange={onActionTypeChange}
								onAmountChange={onAmountChange}
								onCostPerUnitChange={onCostPerUnitChange}
								onEntryDateChange={onEntryDateChange}
								onNewItemChange={onNewItemChange}
								onNotesChange={onNotesChange}
								onSelectedItemChange={onSelectedItemChange}
								produceBatch={produceBatch}
								selectedItem={selectedItem}
								setConfirmConfig={setConfirmConfig}
							/>
						)}
					</div>

					<div className="flex gap-6 border-border border-t p-8">
						<button
							className="flex-1 rounded-md bg-background border border-border py-5 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted active:scale-95"
							onClick={() => {
								onSelectedItemChange(null);
								onActionTypeChange(null);
							}}
							type="button"
						>
							Batal
						</button>
						<button
							className={`flex-1 rounded-md py-5 font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] ${
								actionType === "delete"
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: "bg-primary text-primary-foreground hover:bg-primary/90"
							}`}
							type="submit"
						>
							{actionType === "delete" ? "HAPUS SEKARANG" : "KONFIRMASI"}
						</button>
					</div>
				</form>
			</motion.div>
		</div>
	);
}

function InventoryControlTowerSummary({
	data,
	viewPreset,
}: {
	data: InventoryWorkspaceData | undefined;
	viewPreset: InventoryViewPreset;
}) {
	const cards = [
		{
			label: "Item",
			value: data?.summary.totalItems ?? "-",
			icon: Boxes,
			tone: "text-slate-700 bg-slate-100 border-slate-200",
		},
		{
			label: "Kritis",
			value: data?.summary.riskHighCount ?? "-",
			icon: ShieldAlert,
			tone: "text-rose-700 bg-rose-100 border-rose-200",
		},
		{
			label: "Menipis",
			value: data?.summary.lowStockCount ?? "-",
			icon: BadgeAlert,
			tone: "text-amber-700 bg-amber-100 border-amber-200",
		},
		{
			label: `Aktivitas ${data?.summary.daysWindow ?? 30} Hari`,
			value:
				data != null
					? `${data.summary.recentUsageTxCount} pakai / ${data.summary.recentRestockTxCount} restock`
					: "-",
			icon: BarChart3,
			tone: "text-sky-700 bg-sky-100 border-sky-200",
		},
	];

	return (
		<div className="rounded-xl border border-border/80 bg-card px-3 py-3 shadow-sm">
			<div className="mb-2 flex items-center justify-between gap-3">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
						Inventory Workspace
					</p>
					<p className="text-sm font-semibold text-foreground">
						{viewPreset === "planning"
							? "Preset planning aktif"
							: viewPreset === "critical"
								? "Fokus item kritis"
								: "Semua item inventaris"}
					</p>
				</div>
				<p className="text-[11px] text-muted-foreground">
					Total stok {data?.summary.totalStockUnits ?? "-"}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
				{cards.map((card) => (
					<div
						className="rounded-lg border border-border/70 bg-background px-3 py-2.5"
						key={card.label}
					>
						<div className="flex items-center justify-between">
							<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								{card.label}
							</p>
							<span className={`rounded-lg border p-1.5 ${card.tone}`}>
								<card.icon className="h-4 w-4" />
							</span>
						</div>
						<p className="mt-1 font-black text-base text-foreground">{card.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}
function InventoryPlanningPanel({
	data,
	onDetailItemChange,
	onActionTypeChange,
	setSelectedItem,
	onSearchQueryChange,
	onFilterLowStockChange,
}: {
	data:
		| {
				planningRows: Array<{
					inventoryId: Id<"inventory">;
					ingredientName: string;
					currentStock: number;
					unit: string;
					avgDailyUsage: number;
					daysUntilStockout: number | null;
					reorderPoint: number;
					suggestedOrderQty: number;
					riskLevel: "high" | "medium" | "low";
				}>;
		  }
		| undefined;
	onDetailItemChange: (item: Doc<"inventory">) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "batchInfo"
			| "create"
			| null
	) => void;
	setSelectedItem: (item: Doc<"inventory"> | null) => void;
	onSearchQueryChange: (val: string) => void;
	onFilterLowStockChange: (val: boolean) => void;
}) {
	const inventory = useQuery(api.inventory.getInventory);
	const inventoryMap = useMemo(() => {
		const map = new Map<string, Doc<"inventory">>();
		for (const item of inventory ?? []) {
			map.set(item._id, item);
		}
		return map;
	}, [inventory]);

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-border bg-card p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="font-bold text-base text-foreground">Reorder Planner</p>
						<p className="text-muted-foreground text-xs">
							Prioritas restock berdasarkan konsumsi aktual dan risiko stok habis.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/80"
							onClick={() => onFilterLowStockChange(true)}
							type="button"
						>
							Tampilkan Stok Rendah
						</button>
						<button
							className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
							onClick={() => onSearchQueryChange("")}
							type="button"
						>
							Reset Filter
						</button>
					</div>
				</div>
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs md:text-sm">
						<thead className="border-b border-border bg-muted/30 text-muted-foreground">
							<tr>
								<th className="p-3 font-semibold">Bahan</th>
								<th className="p-3 text-center font-semibold">Avg/Hari</th>
								<th className="p-3 text-center font-semibold">ROP</th>
								<th className="p-3 text-center font-semibold">Saran Order</th>
								<th className="p-3 text-center font-semibold">Stockout</th>
								<th className="p-3 text-right font-semibold">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{data?.planningRows?.map((row) => {
								const itemDoc = inventoryMap.get(row.inventoryId as string);
								return (
									<tr className="hover:bg-muted/30" key={row.inventoryId}>
										<td className="p-3">
											<p className="font-bold text-foreground">{row.ingredientName}</p>
											<p className="text-[11px] text-muted-foreground">
												Stok saat ini {row.currentStock} {row.unit}
											</p>
										</td>
										<td className="p-3 text-center font-semibold">
											{row.avgDailyUsage.toFixed(2)} {row.unit}
										</td>
										<td className="p-3 text-center">{row.reorderPoint}</td>
										<td className="p-3 text-center font-bold text-primary">
											{row.suggestedOrderQty}
										</td>
										<td className="p-3 text-center">
											{row.daysUntilStockout == null ? (
												<span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
													AMAN
												</span>
											) : (
												<span
													className={`rounded-full px-2 py-1 text-[10px] font-bold ${
														row.riskLevel === "high"
															? "bg-rose-100 text-rose-700"
															: row.riskLevel === "medium"
																? "bg-amber-100 text-amber-700"
																: "bg-emerald-100 text-emerald-700"
													}`}
												>
													{row.daysUntilStockout.toFixed(1)} hari
												</span>
											)}
										</td>
										<td className="p-3 text-right">
											<div className="flex justify-end gap-1">
												<button
													className="rounded-lg p-2 text-primary hover:bg-primary/10"
													onClick={() => {
														if (!itemDoc) {
															return;
														}
														setSelectedItem(itemDoc);
														onActionTypeChange("add");
													}}
													title="Restock"
													type="button"
												>
													<Plus className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
													onClick={() => {
														if (!itemDoc) {
															return;
														}
														onDetailItemChange(itemDoc);
													}}
													title="Detail Impact"
													type="button"
												>
													<PackageSearch className="h-4 w-4" />
												</button>
											</div>
										</td>
									</tr>
								);
							})}
							{(data?.planningRows?.length ?? 0) === 0 && (
								<tr>
									<td className="p-6 text-center text-muted-foreground" colSpan={6}>
										Belum ada data planning.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function InventoryDetailDrawer({
	item,
	onClose,
}: {
	item: Doc<"inventory">;
	onClose: () => void;
}) {
	const impact = useQuery(api.inventory.getInventoryItemImpact, {
		inventoryId: item._id,
	});
	const transactions = useQuery(api.inventory.getInventoryTransactions, {
		inventoryId: item._id,
	});

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]">
			<div className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-5 shadow-2xl">
				<div className="mb-5 flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
							Context Panel
						</p>
						<h3 className="mt-1 font-black text-2xl text-foreground">{item.ingredientName}</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Stok {item.quantity} {item.unit} · ambang {item.lowStockThreshold} {item.unit}
						</p>
					</div>
					<button
						className="rounded-full bg-muted p-2 hover:bg-muted/80"
						onClick={onClose}
						type="button"
					>
						<Plus className="h-4 w-4 rotate-45" />
					</button>
				</div>

				<div className="mb-4 grid grid-cols-2 gap-3">
					<div className="rounded-2xl border border-border bg-muted/20 p-4">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Status
						</p>
						<p className="mt-2 font-black text-xl text-foreground">
							{item.quantity <= item.lowStockThreshold ? "Perlu restock" : "Aman"}
						</p>
					</div>
					<div className="rounded-2xl border border-border bg-muted/20 p-4">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Korelasi
						</p>
						<p className="mt-2 font-black text-xl text-foreground">
							{impact?.impact.productCount ?? 0} produk
						</p>
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Dampak Lintas Fitur
					</p>
					<div className="mt-3 space-y-2 text-sm text-foreground">
						<p>Produk terdampak: <span className="font-bold">{impact?.impact.productCount ?? 0}</span></p>
						<p>Recipe terdampak: <span className="font-bold">{impact?.impact.recipeCount ?? 0}</span></p>
						<p>Base recipe pemakai: <span className="font-bold">{impact?.impact.consumedByBaseRecipeCount ?? 0}</span></p>
						{impact?.impact.producedByBaseRecipeName && (
							<p>Diproduksi dari: <span className="font-bold">{impact.impact.producedByBaseRecipeName}</span></p>
						)}
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Produk Terkorelasi
					</p>
					<div className="space-y-2">
						{impact?.impact.impactedProducts?.slice(0, 8).map((product) => (
							<div
								className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
								key={`${product.productId}-${product.variantName || "base"}`}
							>
								<div>
									<p className="text-sm font-semibold text-foreground">{product.productName}</p>
									{product.variantName && (
										<p className="text-[11px] text-muted-foreground">Varian: {product.variantName}</p>
									)}
								</div>
								<span
									className={`rounded-full px-2 py-1 text-[10px] font-bold ${
										product.isAvailable
											? "bg-emerald-100 text-emerald-700"
											: "bg-slate-200 text-slate-700"
									}`}
								>
									{product.isAvailable ? "Aktif" : "Nonaktif"}
								</span>
							</div>
						))}
						{(impact?.impact.impactedProducts?.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">Belum ada produk terkait.</p>
						)}
					</div>
				</div>

				<div className="rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Timeline Aktivitas Terbaru
					</p>
					<div className="space-y-2">
						{transactions?.slice(0, 10).map((transaction) => (
							<div className="rounded-xl bg-muted/40 px-3 py-2" key={transaction._id}>
								<div className="flex items-center justify-between gap-4">
									<p className="text-xs font-semibold uppercase text-foreground">
										{transaction.type}
									</p>
									<p
										className={`text-xs font-bold ${
											transaction.quantity >= 0 ? "text-emerald-600" : "text-rose-600"
										}`}
									>
										{transaction.quantity > 0 ? "+" : ""}
										{transaction.quantity}
									</p>
								</div>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{new Date(transaction.timestamp).toLocaleString("id-ID")}
								</p>
								{transaction.notes && (
									<p className="mt-1 text-[11px] text-muted-foreground">
										{transaction.notes}
									</p>
								)}
							</div>
						))}
						{(transactions?.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
function InventoryTable({
	addRowSignal,
	filteredRows,
	onSort,
	sortConfig,
	onSelectedItemChange,
	onDetailItemChange,
	onActionTypeChange,
	inventoryMap,
	viewPreset,
}: {
	addRowSignal: number;
	filteredRows: InventoryWorkspaceRow[];
	onSort: (
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout"
	) => void;
	sortConfig: {
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout";
		direction: "asc" | "desc";
	};
	onSelectedItemChange: (item: Doc<"inventory">) => void;
	onDetailItemChange: (item: Doc<"inventory">) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "batchInfo"
			| "create"
			| null
	) => void;
	inventoryMap: Map<Id<"inventory">, Doc<"inventory">>;
	viewPreset: InventoryViewPreset;
}) {
	const updateItemMutation = useMutation(api.inventory.updateInventoryItem);
	const applyStockAction = useMutation(api.inventory.applyInventoryStockAction);
	const createItemMutation = useMutation(api.inventory.createInventoryItem);
	const quickAddNameRef = useRef<HTMLInputElement | null>(null);
	const [savingKey, setSavingKey] = useState<string | null>(null);
	const [inlineValues, setInlineValues] = useState<
		Record<
			string,
			{
				ingredientName: string;
				quantity: string;
				unit: string;
				lowStockThreshold: string;
			}
		>
	>({});
	const [quickAdd, setQuickAdd] = useState({
		ingredientName: "",
		quantity: "0",
		unit: "gram",
		lowStockThreshold: "100",
	});

	useEffect(() => {
		quickAddNameRef.current?.focus();
	}, [addRowSignal]);

	const getInlineValue = (row: InventoryWorkspaceRow) =>
		inlineValues[row.inventoryId] ?? {
			ingredientName: row.ingredientName,
			quantity: String(row.currentStock),
			unit: row.unit,
			lowStockThreshold: String(row.lowStockThreshold),
		};

	const setInlineField = (
		row: InventoryWorkspaceRow,
		field: "ingredientName" | "quantity" | "unit" | "lowStockThreshold",
		value: string
	) => {
		setInlineValues((prev) => {
			const current = prev[row.inventoryId] ?? {
				ingredientName: row.ingredientName,
				quantity: String(row.currentStock),
				unit: row.unit,
				lowStockThreshold: String(row.lowStockThreshold),
			};
			return {
				...prev,
				[row.inventoryId]: {
					...current,
					[field]: value,
				},
			};
		});
	};

	const saveMeta = async (row: InventoryWorkspaceRow) => {
		const item = inventoryMap.get(row.inventoryId);
		if (!item) {
			return;
		}
		const current = getInlineValue(row);
		const ingredientName = current.ingredientName.trim();
		const lowStockThresholdNum = Number(current.lowStockThreshold);
		if (!ingredientName) {
			toast.error("Nama bahan tidak boleh kosong");
			setInlineField(row, "ingredientName", row.ingredientName);
			return;
		}
		if (Number.isNaN(lowStockThresholdNum) || lowStockThresholdNum < 0) {
			toast.error("Ambang stok harus angka >= 0");
			setInlineField(row, "lowStockThreshold", String(row.lowStockThreshold));
			return;
		}
		if (
			ingredientName === row.ingredientName &&
			current.unit === row.unit &&
			lowStockThresholdNum === row.lowStockThreshold
		) {
			return;
		}

		try {
			setSavingKey(`${row.inventoryId}:meta`);
			await updateItemMutation({
				id: item._id,
				ingredientName,
				unit: current.unit,
				lowStockThreshold: lowStockThresholdNum,
				displayUnit: item.displayUnit || undefined,
				conversionFactor: item.conversionFactor || undefined,
				baseRecipeId: item.baseRecipeId || undefined,
			});
			toast.success("Perubahan baris tersimpan");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal menyimpan perubahan";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const saveQuantity = async (row: InventoryWorkspaceRow) => {
		const item = inventoryMap.get(row.inventoryId);
		if (!item) {
			return;
		}
		const current = getInlineValue(row);
		const quantityNum = Number(current.quantity);
		if (Number.isNaN(quantityNum) || quantityNum < 0) {
			toast.error("Stok harus angka >= 0");
			setInlineField(row, "quantity", String(row.currentStock));
			return;
		}
		if (quantityNum === row.currentStock) {
			return;
		}

		try {
			setSavingKey(`${row.inventoryId}:qty`);
			await applyStockAction({
				inventoryId: item._id,
				action: "adjust",
				quantity: quantityNum,
				notes: "Quick inline update",
			});
			toast.success("Stok langsung tersimpan");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal menyimpan stok";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const quickDelta = async (
		row: InventoryWorkspaceRow,
		direction: "add" | "usage",
		amount = 1
	) => {
		if (direction === "usage" && row.currentStock <= 0) {
			return;
		}
		const item = inventoryMap.get(row.inventoryId);
		if (!item) {
			return;
		}
		try {
			setSavingKey(`${row.inventoryId}:delta`);
			await applyStockAction({
				inventoryId: item._id,
				action: direction,
				quantity: amount,
				notes:
					direction === "add"
						? `Quick +${amount} from table`
						: `Quick -${amount} from table`,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal update stok cepat";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const quickCreate = async () => {
		const ingredientName = quickAdd.ingredientName.trim();
		const quantity = Number(quickAdd.quantity);
		const lowStockThreshold = Number(quickAdd.lowStockThreshold);
		if (!ingredientName) {
			toast.error("Nama bahan wajib diisi");
			return;
		}
		if (Number.isNaN(quantity) || quantity < 0) {
			toast.error("Stok awal tidak valid");
			return;
		}
		if (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0) {
			toast.error("Ambang stok tidak valid");
			return;
		}

		try {
			setSavingKey("quick-add");
			await createItemMutation({
				ingredientName,
				unit: quickAdd.unit,
				quantity,
				lowStockThreshold,
			});
			setQuickAdd((prev) => ({
				...prev,
				ingredientName: "",
				quantity: "0",
			}));
			toast.success("Item baru langsung tersimpan");
			quickAddNameRef.current?.focus();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Gagal menambah item";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const getStatusMeta = (status: InventoryWorkspaceRow["status"]) => {
		if (status === "critical") {
			return {
				label: "Kritis",
				tone: "border-rose-200 bg-rose-50 text-rose-700",
			};
		}
		if (status === "warning") {
			return {
				label: "Menipis",
				tone: "border-amber-200 bg-amber-50 text-amber-700",
			};
		}
		return {
			label: "Aman",
			tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
		};
	};

	return (
		<div className="rounded-xl border border-border/80 bg-card shadow-sm">
			<div>
				<table className="w-full text-left text-xs md:text-sm">
					<colgroup>
						<col className="w-[24%]" />
						<col className="w-[14%]" />
						<col className="w-[12%]" />
						<col className="w-[19%]" />
						<col className="w-[17%]" />
						<col className="w-[10%]" />
						<col className="w-[4%]" />
					</colgroup>
					<thead className="bg-card">
						<tr className="border-border border-b text-muted-foreground">
							<th
								className="cursor-pointer px-4 py-3 font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("ingredientName")}
							>
								<div className="flex items-center gap-1">
									Bahan
									{sortConfig.key === "ingredientName" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th
								className="cursor-pointer px-4 py-3 text-center font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("currentStock")}
							>
								<div className="flex items-center justify-center gap-1">
									Stok
									{sortConfig.key === "currentStock" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th
								className="cursor-pointer px-4 py-3 text-center font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("lowStockThreshold")}
							>
								<div className="flex items-center justify-center gap-1">
									Min
									{sortConfig.key === "lowStockThreshold" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th className="px-4 py-3 font-semibold">Status</th>
							<th
								className="cursor-pointer px-4 py-3 font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("avgDailyUsage")}
							>
								<div className="flex items-center gap-1">
									Pemakaian
									{sortConfig.key === "avgDailyUsage" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th className="px-4 py-3 font-semibold">Terkait</th>
							<th className="px-4 py-3 text-right font-semibold">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						<tr className="bg-primary/[0.04]">
							<td className="min-w-[260px] px-4 py-3">
								<input
									ref={quickAddNameRef}
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											ingredientName: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									placeholder="Tambah cepat: nama bahan"
									value={quickAdd.ingredientName}
								/>
							</td>
							<td className="px-4 py-3 text-center">
								<input
									className="mx-auto w-24 rounded-xl border border-border bg-background px-2 py-2 text-center font-semibold text-sm outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({ ...prev, quantity: e.target.value }))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									type="number"
									value={quickAdd.quantity}
								/>
							</td>
							<td className="px-4 py-3 text-center">
								<input
									className="mx-auto w-24 rounded-xl border border-border bg-background px-2 py-2 text-center font-semibold text-sm outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											lowStockThreshold: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									type="number"
									value={quickAdd.lowStockThreshold}
								/>
							</td>
							<td className="px-4 py-3">
								<div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
									Item baru akan langsung tersimpan.
								</div>
							</td>
							<td className="px-4 py-3">
								<div className="flex flex-col gap-2 text-xs text-muted-foreground">
									<span>Lengkapi stok awal dan satuan.</span>
									<select
										className="w-fit rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold outline-none focus:border-primary"
										onChange={(e) =>
											setQuickAdd((prev) => ({ ...prev, unit: e.target.value }))
										}
										value={quickAdd.unit}
									>
										<option value="gram">gram</option>
										<option value="ml">ml</option>
										<option value="pcs">pcs</option>
									</select>
								</div>
							</td>
							<td className="px-4 py-3">
								<div className="text-xs text-muted-foreground">
									Baris ini menggantikan form tambah modal.
								</div>
							</td>
							<td className="px-4 py-3 text-right">
								<button
									className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110"
									disabled={savingKey === "quick-add"}
									onClick={() => void quickCreate()}
									type="button"
								>
									{savingKey === "quick-add" ? "Menyimpan..." : "Tambah Baris"}
								</button>
							</td>
						</tr>
						{inventoryMap.size === 0 &&
							Array.from({ length: 8 }).map((_, i) => (
								<tr key={i}>
									<td className="p-4">
										<Skeleton className="h-4 w-32" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-8 w-16" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-8 w-16" />
									</td>
									<td className="p-4">
										<Skeleton className="h-8 w-28" />
									</td>
									<td className="p-4">
										<Skeleton className="h-10 w-32" />
									</td>
									<td className="p-4">
										<Skeleton className="h-10 w-32" />
									</td>
									<td className="p-4 text-right">
										<Skeleton className="ml-auto h-8 w-8 rounded-lg" />
									</td>
								</tr>
							))}
						{inventoryMap.size > 0 &&
							filteredRows.length > 0 &&
							filteredRows.map((row, index) => {
								const item = inventoryMap.get(row.inventoryId);
								if (!item) {
									return null;
								}
								const inline = getInlineValue(row);
								const hasConversion = !!(
									row.displayUnit &&
									row.conversionFactor &&
									row.conversionFactor > 0
								);
								const displayQty = hasConversion
									? (row.currentStock / (row.conversionFactor || 1)).toFixed(2)
									: row.currentStock;
								const displayUnitText = hasConversion ? row.displayUnit : row.unit;
								const statusMeta = getStatusMeta(row.status);

								return (
									<tr
										className={`transition-colors hover:bg-muted/20 ${
											index % 2 === 0 ? "bg-background" : "bg-muted/[0.12]"
										}`}
										key={row.inventoryId}
									>
										<td className="min-w-[280px] px-4 py-3 align-top">
											<div className="space-y-2">
												<textarea
													className="min-h-[44px] w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 font-bold text-sm leading-6 outline-none focus:border-border focus:bg-background"
													onBlur={() => void saveMeta(row)}
													onChange={(e) =>
														setInlineField(row, "ingredientName", e.target.value)
													}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															void saveMeta(row);
															(e.target as HTMLTextAreaElement).blur();
														}
													}}
													rows={2}
													value={inline.ingredientName}
												/>
												<div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
													<span className="rounded-full bg-muted px-2 py-1">
														{row.unit}
													</span>
													{row.producedByBaseRecipeName && (
														<span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
															Hasil: {row.producedByBaseRecipeName}
														</span>
													)}
												</div>
											</div>
										</td>
										<td className="px-4 py-3 align-top text-center">
											<div className="flex flex-col items-center gap-2">
												<input
													className="w-24 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center font-mono text-lg font-bold outline-none focus:border-border focus:bg-background"
													onBlur={() => void saveQuantity(row)}
													onChange={(e) =>
														setInlineField(row, "quantity", e.target.value)
													}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															void saveQuantity(row);
															(e.target as HTMLInputElement).blur();
														}
													}}
													type="number"
													value={inline.quantity}
												/>
												<div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background p-1">
													<button
														className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
														onClick={() => void quickDelta(row, "usage", 1)}
														type="button"
													>
														<Minus className="h-3.5 w-3.5" />
													</button>
													<button
														className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
														onClick={() => void quickDelta(row, "add", 1)}
														type="button"
													>
														<Plus className="h-3.5 w-3.5" />
													</button>
												</div>
												{hasConversion && (
													<span className="text-[10px] text-muted-foreground">
														{displayQty} {row.displayUnit}
													</span>
												)}
											</div>
										</td>
										<td className="px-4 py-3 align-top text-center">
											<div className="space-y-2">
												<input
													className="mx-auto w-20 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center font-semibold text-sm outline-none focus:border-border focus:bg-background"
													onBlur={() => void saveMeta(row)}
													onChange={(e) =>
														setInlineField(row, "lowStockThreshold", e.target.value)
													}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															void saveMeta(row);
															(e.target as HTMLInputElement).blur();
														}
													}}
													type="number"
													value={inline.lowStockThreshold}
												/>
												<select
													className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-center font-semibold text-muted-foreground outline-none focus:border-border focus:bg-background"
													onBlur={() => void saveMeta(row)}
													onChange={(e) =>
														setInlineField(row, "unit", e.target.value)
													}
													value={inline.unit}
												>
													<option value="gram">gram</option>
													<option value="ml">ml</option>
													<option value="pcs">pcs</option>
												</select>
											</div>
											{displayUnitText !== inline.unit && (
												<div className="mt-1 text-[10px] text-muted-foreground/70">
													view: {displayUnitText}
												</div>
											)}
										</td>
										<td className="px-4 py-3 align-top">
											<div className="space-y-2">
												<span
													className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusMeta.tone}`}
												>
													{row.status === "critical" && (
														<AlertCircle className="h-3.5 w-3.5" />
													)}
													{statusMeta.label}
												</span>
												<div className="space-y-1 text-[11px] text-muted-foreground">
													<p>
														ROP {row.reorderPoint} {row.unit}
													</p>
													<p>
														{row.daysUntilStockout == null
															? "Belum ada proyeksi habis"
															: `${row.daysUntilStockout} hari menuju habis`}
													</p>
												</div>
											</div>
										</td>
										<td className="px-4 py-3 align-top">
											<div className="space-y-2 text-[11px]">
												<div className="font-semibold text-foreground">
													{row.avgDailyUsage.toFixed(2)} / hari
												</div>
												<div className="text-muted-foreground">
													Saran order {row.suggestedOrderQty} {row.unit}
												</div>
												{row.latestTransaction && (
													<div className="rounded-xl bg-muted/50 px-2 py-1.5 text-[10px] text-muted-foreground">
														{row.latestTransaction.type}{" "}
														{row.latestTransaction.quantity > 0 ? "+" : ""}
														{row.latestTransaction.quantity}
													</div>
												)}
											</div>
										</td>
										<td className="px-4 py-3 align-top">
											<div className="space-y-2 text-[11px]">
												<div className="flex flex-wrap gap-1.5">
													<span className="rounded-full bg-muted px-2 py-1 font-semibold text-foreground">
														Produk {row.relatedProductCount}
													</span>
													<span className="rounded-full bg-muted px-2 py-1 font-semibold text-foreground">
														Recipe {row.relatedRecipeCount}
													</span>
													<span className="rounded-full bg-muted px-2 py-1 font-semibold text-foreground">
														Base {row.relatedBaseRecipeCount}
													</span>
												</div>
												<div className="text-muted-foreground">
													{row.activeRelatedProductCount} produk aktif
												</div>
												{viewPreset === "planning" && (
													<div className="text-muted-foreground">
														{row.daysUntilStockout == null
															? "Belum ada laju pakai"
															: `Habis dalam ${row.daysUntilStockout} hari`}
													</div>
												)}
											</div>
										</td>
										<td className="px-4 py-3 align-top text-right">
											<div className="flex items-start justify-end gap-2">
												<button
													className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-muted"
													onClick={() => onDetailItemChange(item)}
													type="button"
												>
													<PanelRight className="h-3.5 w-3.5" />
													Detail
												</button>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<button
															className="rounded-xl border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
															type="button"
														>
															<MoreHorizontal className="h-4 w-4" />
														</button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-52">
														<DropdownMenuItem onClick={() => void quickDelta(row, "add", 5)}>
															<Plus className="mr-2 h-4 w-4" /> Restock +5
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => void quickDelta(row, "usage", 5)}>
															<Minus className="mr-2 h-4 w-4" /> Pakai -5
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => {
																onSelectedItemChange(item);
																onActionTypeChange("batchInfo");
															}}
														>
															<AlertCircle className="mr-2 h-4 w-4" /> Info Batch FIFO
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => {
																onSelectedItemChange(item);
																onActionTypeChange("history");
															}}
														>
															<History className="mr-2 h-4 w-4" /> Riwayat
														</DropdownMenuItem>
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onClick={() => {
																onSelectedItemChange(item);
																onActionTypeChange("delete");
															}}
														>
															<Trash2 className="mr-2 h-4 w-4" /> Hapus
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
											{savingKey?.startsWith(row.inventoryId) && (
												<p className="mt-2 text-[10px] text-muted-foreground">
													Menyimpan...
												</p>
											)}
										</td>
									</tr>
								);
							})}
						{inventoryMap.size > 0 && filteredRows.length === 0 && (
							<tr>
								<td className="p-8 text-center text-muted-foreground" colSpan={7}>
									Tidak ada bahan baku ditemukan
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
function InventoryHeader({
	filterLowStock,
	onAddRow,
	onFilterLowStockChange,
	searchQuery,
	onSearchQueryChange,
	viewPreset,
	onViewPresetChange,
}: {
	filterLowStock: boolean;
	onAddRow: () => void;
	onFilterLowStockChange: (val: boolean) => void;
	searchQuery: string;
	onSearchQueryChange: (val: string) => void;
	viewPreset: InventoryViewPreset;
	onViewPresetChange: (preset: InventoryViewPreset) => void;
}) {
	return (
		<div className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm md:px-5">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
				<div className="space-y-2">
					<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
						Inventory Workspace
					</p>
					<div>
						<h2 className="font-black text-2xl text-foreground tracking-tight md:text-3xl">
							Inventaris
						</h2>
						<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
							Tabel menjadi pusat kerja: tambah, edit, update stok, dan simpan langsung dari baris.
						</p>
					</div>
				</div>
				<div className="flex flex-col gap-3 xl:items-end">
					<div className="flex flex-wrap gap-2">
						<button
							className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110"
							onClick={onAddRow}
							type="button"
						>
							+ Tambah Baris
						</button>
						<button
							className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
								viewPreset === "all"
									? "bg-foreground text-background"
									: "border border-border bg-background text-foreground hover:bg-muted"
							}`}
							onClick={() => onViewPresetChange("all")}
							type="button"
						>
							Semua Data
						</button>
						<button
							className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
								viewPreset === "critical"
									? "bg-rose-600 text-white"
									: "border border-border bg-background text-foreground hover:bg-muted"
							}`}
							onClick={() => onViewPresetChange("critical")}
							type="button"
						>
							Fokus Kritis
						</button>
						<button
							className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
								viewPreset === "planning"
									? "bg-sky-600 text-white"
									: "border border-border bg-background text-foreground hover:bg-muted"
							}`}
							onClick={() => onViewPresetChange("planning")}
							type="button"
						>
							Planning View
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
								filterLowStock
									? "border border-destructive/20 bg-destructive/10 text-destructive"
									: "border border-border bg-background text-muted-foreground hover:text-foreground"
							}`}
							onClick={() => onFilterLowStockChange(!filterLowStock)}
							type="button"
						>
							Stok Rendah
						</button>
						<div className="relative min-w-[260px] flex-1 xl:w-[360px] xl:flex-none">
							<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								className="w-full rounded-xl border border-border bg-background py-2.5 pr-4 pl-10 text-sm outline-none transition-all focus:border-primary"
								onChange={(e) => onSearchQueryChange(e.target.value)}
								placeholder="Cari bahan, satuan, atau item terkait..."
								value={searchQuery}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
function InventoryHistoryModal({
	item,
	onClose,
}: {
	item: Doc<"inventory">;
	onClose: () => void;
}) {
	const transactions = useQuery(api.inventory.getInventoryTransactions, {
		inventoryId: item._id,
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-[40px] border border-border bg-card shadow-2xl"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="flex items-center justify-between border-border border-b p-8 pb-4">
					<h3 className="font-bold text-2xl text-foreground tracking-tight">
						Riwayat: {item.ingredientName}
					</h3>
					<button
						className="rounded-full bg-muted p-2 text-foreground transition-all hover:bg-muted/80"
						onClick={onClose}
						type="button"
					>
						<Plus className="h-5 w-5 rotate-45" />
					</button>
				</div>
				<div className="p-8">
					<div className="max-h-[60vh] overflow-y-auto rounded-[32px] border border-border bg-muted/30">
						<table className="w-full text-left text-xs">
							<thead className="sticky top-0 border-border border-b bg-background border border-border">
								<tr className="text-foreground/40 uppercase tracking-widest">
									<th className="p-4 font-bold text-[9px]">Tanggal</th>
									<th className="p-4 font-bold text-[9px]">Tipe</th>
									<th className="p-4 text-right font-bold text-[9px]">
										Jumlah
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{transactions?.map((t: any) => (
									<tr
										className="transition-colors hover:bg-background border border-border/30"
										key={t._id}
									>
										<td className="whitespace-nowrap p-4 font-bold text-foreground/60">
											{new Date(t.timestamp).toLocaleString("id-ID", {
												dateStyle: "short",
												timeStyle: "short",
											})}
										</td>
										<td className="p-4">
											{(() => {
												const config = {
													restock: {
														label: "Restock",
														color: "bg-green-100 text-green-700",
													},
													usage: {
														label: "Penggunaan",
														color: "bg-red-100 text-red-700",
													},
													adjustment: {
														label: "Penyesuaian",
														color: "bg-blue-100 text-blue-700",
													},
													costing_reference: {
														label: "Referensi Biaya AI",
														color: "bg-cyan-100 text-cyan-700",
													},
												}[
													t.type as
														| "restock"
														| "usage"
														| "adjustment"
														| "costing_reference"
												] || {
													label: "Lainnya",
													color: "bg-gray-100 text-gray-700",
												};

												return (
													<div className="flex flex-col gap-1">
														<span
															className={`w-fit rounded-lg px-2 py-0.5 font-bold text-[9px] uppercase tracking-wider ${config.color}`}
														>
															{config.label}
														</span>
														{t.notes && (
															<span className="max-w-[140px] truncate text-foreground/40 text-[10px] italic">
																{t.notes}
															</span>
														)}
													</div>
												);
											})()}
										</td>
										<td
											className={`p-4 text-right font-black font-mono text-sm ${
												t.quantity > 0
													? "text-green-600"
													: t.quantity < 0
														? "text-destructive"
														: "text-cyan-700"
											}`}
										>
											{t.quantity > 0 ? "+" : ""}
											{t.quantity} {item.unit}
										</td>
									</tr>
								))}
								{transactions?.length === 0 && (
									<tr>
										<td
											className="p-12 text-center font-medium text-foreground/30 text-sm italic"
											colSpan={3}
										>
											Belum ada riwayat transaksi.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</motion.div>
		</div>
	);
}

function InventoryBatchModal({
	item,
	onClose,
}: {
	item: Doc<"inventory">;
	onClose: () => void;
}) {
	const batches = useQuery(api.inventory.getInventoryItemBatches, {
		inventoryId: item._id,
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="flex items-center justify-between border-border border-b p-8 pb-4">
					<h3 className="font-bold text-2xl text-foreground tracking-tight">
						Batch Aktif (FIFO): {item.ingredientName}
					</h3>
					<button
						className="rounded-full bg-muted p-2 text-foreground transition-all hover:bg-muted/80"
						onClick={onClose}
						type="button"
					>
						<Minus className="h-5 w-5 rotate-45" />
					</button>
				</div>
				<div className="p-8">
					<div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
						<table className="w-full text-left text-xs">
							<thead className="sticky top-0 bg-muted/50 border-b border-border">
								<tr className="text-muted-foreground uppercase tracking-wider">
									<th className="p-4 font-bold">Tanggal Masuk</th>
									<th className="p-4 font-bold">Harga/Unit</th>
									<th className="p-4 text-right font-bold">Sisa Stok</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{batches?.map((b: any) => (
									<tr className="hover:bg-muted/30 transition-colors" key={b._id}>
										<td className="p-4 font-medium">
											{new Date(b.timestamp).toLocaleDateString("id-ID", {
												dateStyle: "medium"
											})}
										</td>
										<td className="p-4">
											{b.costPerUnit ? `Rp ${b.costPerUnit.toLocaleString()}` : "-"}
										</td>
										<td className="p-4 text-right font-bold text-primary">
											{b.remainingQuantity} {item.unit}
										</td>
									</tr>
								))}
								{batches?.length === 0 && (
									<tr>
										<td className="p-12 text-center text-muted-foreground italic" colSpan={3}>
											Tidak ada batch aktif. Stok mungkin berasal dari penyesuaian manual.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<div className="mt-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20">
						<p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
							<strong>Catatan FIFO:</strong> Penggunaan stok akan secara otomatis mengurangi batch yang paling lama terlebih dahulu (atas ke bawah).
						</p>
					</div>
				</div>
			</motion.div>
		</div>
	);
}





