import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Edit,
	History,
	Minus,
	Plus,
	Search,
	Settings2,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface ConfirmConfig {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

export const Route = createLazyFileRoute("/admin/inventory")({
	component: InventoryPage,
});

function InventoryPage() {
	const inventory = useQuery(api.inventory.getInventory);
	const addStock = useMutation(api.inventory.addStock);
	const usageStock = useMutation(api.inventory.usageStock);
	const createItem = useMutation(api.inventory.createInventoryItem);
	const updateItem = useMutation(api.inventory.updateInventoryItem);
	const deleteItem = useMutation(api.inventory.deleteInventoryItem);
	const adjustStock = useMutation(api.inventory.adjustStock);

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedItem, setSelectedItem] = useState<Doc<"inventory"> | null>(
		null
	);
	const [actionType, setActionType] = useState<
		"add" | "usage" | "history" | "create" | "edit" | "adjust" | "delete" | null
	>(null);
	const [amount, setAmount] = useState("");
	const [filterLowStock, setFilterLowStock] = useState(false);
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
	const [sortConfig, setSortConfig] = useState<{
		key: keyof Doc<"inventory">;
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

	const filteredInventory = useMemo(() => {
		if (!inventory) {
			return [];
		}
		const result = inventory.filter((item) => {
			const matchesSearch = item.ingredientName
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
			const matchesFilter = filterLowStock
				? item.quantity <= item.lowStockThreshold
				: true;
			return matchesSearch && matchesFilter;
		});

		result.sort((a, b) => {
			const aValue = (a[sortConfig.key] as string | number) ?? "";
			const bValue = (b[sortConfig.key] as string | number) ?? "";
			if (aValue < bValue) {
				return sortConfig.direction === "asc" ? -1 : 1;
			}
			if (aValue > bValue) {
				return sortConfig.direction === "asc" ? 1 : -1;
			}
			return 0;
		});

		return result;
	}, [inventory, searchQuery, filterLowStock, sortConfig]);

	const handleSort = (key: keyof Doc<"inventory">) => {
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
		const args = {
			inventoryId: selected._id,
			quantity: numAmount,
			notes,
		};

		if (type === "add") {
			await addStock(args);
			toast.success(`Stok ${selected.ingredientName} ditambahkan`);
		} else if (type === "usage") {
			await usageStock(args);
			toast.success(`Penggunaan ${selected.ingredientName} dicatat`);
		} else if (type === "adjust") {
			await adjustStock(args);
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
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			<InventoryHeader
				filterLowStock={filterLowStock}
				onActionTypeChange={setActionType}
				onFilterLowStockChange={setFilterLowStock}
				onSearchQueryChange={setSearchQuery}
				searchQuery={searchQuery}
			/>

			<InventoryTable
				filteredInventory={filteredInventory}
				inventory={inventory}
				onActionTypeChange={setActionType}
				onAmountChange={setAmount}
				onNewItemChange={setNewItem}
				onSelectedItemChange={setSelectedItem}
				onSort={handleSort}
				sortConfig={sortConfig}
			/>

			<InventoryActionModal
				actionType={actionType}
				amount={amount}
				newItem={newItem}
				notes={notes}
				onActionTypeChange={setActionType}
				onAmountChange={setAmount}
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
	baseRecipes,
	produceBatch,
	setConfirmConfig,
}: {
	selectedItem: Doc<"inventory"> | null;
	onSelectedItemChange: (item: Doc<"inventory"> | null) => void;
	actionType: "add" | "usage" | "edit" | "adjust" | "delete" | "create" | null;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "create"
			| "history"
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
						className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
						htmlFor="ingredientName"
					>
						Nama Bahan
					</label>
					<input
						autoFocus
						className="w-full rounded-md bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
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
							className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
							htmlFor="unit"
						>
							Satuan Dasar
						</label>
						<select
							className="w-full appearance-none rounded-md bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
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
							className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
							htmlFor="quantity"
						>
							{actionType === "create" ? "Stok Awal" : "Ambang Rendah"}
						</label>
						<input
							className="w-full rounded-md bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
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

				<div className="space-y-4 rounded-lg border border-[#4A3728]/10 bg-[#F0EAD6]/50 p-6">
					<p className="font-bold text-[#4A3728] text-[11px] uppercase tracking-widest">
						Konversi Unit (Opsional)
					</p>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label
								className="font-bold text-[#4A3728]/60 text-[9px] uppercase tracking-wider"
								htmlFor="displayUnit"
							>
								Satuan Tampilan
							</label>
							<input
								className="w-full rounded-md bg-[#E8E1CF] p-3 font-bold text-[#4A3728] text-xs outline-none transition-all focus:ring-1 focus:ring-[#4A3728]/20"
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
								className="font-bold text-[#4A3728]/60 text-[9px] uppercase tracking-wider"
								htmlFor="conversionFactor"
							>
								Isi per 1 Satuan
							</label>
							<input
								className="w-full rounded-md bg-[#E8E1CF] p-3 font-bold text-[#4A3728] text-xs outline-none transition-all focus:ring-1 focus:ring-[#4A3728]/20"
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
					<p className="text-[#4A3728]/50 text-[10px] italic leading-snug">
						* Contoh: Jika Satuan Dasar = ml, Satuan Tampilan = Liter, Isi =
						1000. Maka 2500 ml akan tampil 2.50 Liter.
					</p>
				</div>

				<div className="space-y-2">
					<label
						className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
						htmlFor="baseRecipeId"
					>
						Link ke Resep Base (Produksi)
					</label>
					<select
						className="w-full appearance-none rounded-md bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
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
						{baseRecipes?.map((r) => (
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
							className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
							htmlFor="inventory-amount"
						>
							{actionType === "adjust"
								? "Stok Akhir"
								: `Jumlah (${selectedItem?.unit})`}
						</label>
						{selectedItem?.baseRecipeId && actionType === "add" && (
							<button
								className="font-bold text-[#4A3728] text-[10px] hover:underline"
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
						className="w-full rounded-md bg-[#E8E1CF] p-6 font-black text-4xl text-[#4A3728] outline-none ring-[#4A3728]/10 transition-all focus:ring-4"
						id="inventory-amount"
						onChange={(e) => onAmountChange(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>
				<div className="space-y-2">
					<label
						className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
						htmlFor="inventory-notes"
					>
						Catatan
					</label>
					<input
						className="w-full rounded-md bg-[#E8E1CF] p-4 font-medium text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-xl border border-[#4A3728]/10 bg-[#F5F0E1]"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="border-[#4A3728]/5 border-b p-8 pb-3">
					<h3 className="font-bold text-2xl text-[#4A3728] tracking-tight">
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
							<div className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 p-6 text-center">
								<p className="font-bold text-[#EF4444] text-sm">
									Yakin ingin menghapus {selectedItem?.ingredientName}?
								</p>
								<p className="mt-2 text-[#EF4444]/60 text-xs">
									Tindakan ini tidak dapat dibatalkan.
								</p>
							</div>
						) : (
							<InventoryModalContent
								actionType={actionType}
								amount={amount}
								baseRecipes={baseRecipes}
								newItem={newItem}
								notes={notes}
								onActionTypeChange={onActionTypeChange}
								onAmountChange={onAmountChange}
								onNewItemChange={onNewItemChange}
								onNotesChange={onNotesChange}
								onSelectedItemChange={onSelectedItemChange}
								produceBatch={produceBatch}
								selectedItem={selectedItem}
								setConfirmConfig={setConfirmConfig}
							/>
						)}
					</div>

					<div className="flex gap-6 border-[#4A3728]/5 border-t p-8">
						<button
							className="flex-1 rounded-md bg-[#E8E1CF] py-5 font-bold text-[#4A3728] text-[10px] uppercase tracking-widest transition-all hover:bg-[#E8E1CF]/80 active:scale-95"
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
									? "bg-[#EF4444] text-white hover:brightness-110"
									: "bg-[#4A3728] text-[#F5F0E1] hover:brightness-110"
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

function InventoryTable({
	filteredInventory,
	onSort,
	sortConfig,
	onSelectedItemChange,
	onActionTypeChange,
	onNewItemChange,
	onAmountChange,
	inventory,
}: {
	filteredInventory: Doc<"inventory">[];
	onSort: (key: keyof Doc<"inventory">) => void;
	sortConfig: { key: keyof Doc<"inventory">; direction: "asc" | "desc" };
	onSelectedItemChange: (item: Doc<"inventory">) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "create"
			| null
	) => void;
	onNewItemChange: (item: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		baseRecipeId: string;
	}) => void;
	onAmountChange: (amount: string) => void;
	inventory: Doc<"inventory">[] | undefined;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="overflow-x-auto">
				<table className="w-full text-left text-xs md:text-sm">
					<thead>
						<tr className="border-border border-b bg-muted/30 text-muted-foreground">
							<th
								className="cursor-pointer p-2.5 font-medium transition-colors hover:text-foreground md:p-4"
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
								className="cursor-pointer p-4 text-center font-medium transition-colors hover:text-foreground"
								onClick={() => onSort("quantity")}
							>
								<div className="flex items-center justify-center gap-1">
									Stok Saat Ini
									{sortConfig.key === "quantity" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th className="p-4 text-center font-medium">Satuan</th>
							<th className="p-4 font-medium">Status</th>
							<th className="p-4 text-right font-medium">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{!inventory &&
							[
								"sk1",
								"sk2",
								"sk3",
								"sk4",
								"sk5",
								"sk6",
								"sk7",
								"sk8",
								"sk9",
								"sk10",
							].map((skId) => (
								<tr className="animate-pulse" key={skId}>
									<td className="p-4">
										<div className="h-4 w-32 rounded bg-muted/50" />
									</td>
									<td className="p-4">
										<div className="mx-auto h-8 w-16 rounded bg-muted/50" />
									</td>
									<td className="p-4">
										<div className="mx-auto h-4 w-12 rounded bg-muted/50" />
									</td>
									<td className="p-4">
										<div className="h-4 w-20 rounded bg-muted/50" />
									</td>
									<td className="p-4 text-right">
										<div className="ml-auto h-8 w-32 rounded bg-muted/50" />
									</td>
								</tr>
							))}

						{inventory &&
							filteredInventory.length > 0 &&
							filteredInventory.map((item) => {
								const hasConversion = !!(
									item.displayUnit &&
									item.conversionFactor &&
									item.conversionFactor > 0
								);
								const displayQty = hasConversion
									? (item.quantity / (item.conversionFactor || 1)).toFixed(2)
									: item.quantity;
								const displayUnitText = hasConversion
									? item.displayUnit
									: item.unit;

								return (
									<tr
										className="transition-colors hover:bg-muted/30"
										key={item._id}
									>
										<td className="p-4 font-bold">{item.ingredientName}</td>
										<td className="p-4 text-center">
											<div className="flex flex-col items-center">
												<span className="font-bold font-mono text-lg">
													{displayQty}
												</span>
												{hasConversion && (
													<span className="text-[10px] text-muted-foreground">
														({item.quantity} {item.unit})
													</span>
												)}
											</div>
										</td>
										<td className="p-4 text-center text-muted-foreground">
											{displayUnitText}
										</td>
										<td className="p-4">
											{item.quantity <= item.lowStockThreshold ? (
												<span className="flex items-center gap-1.5 font-bold text-destructive">
													<AlertCircle className="h-4 w-4" /> Stok Rendah
												</span>
											) : (
												<span className="font-medium text-green-600">
													Cukup
												</span>
											)}
										</td>
										<td className="p-4 text-right">
											<div className="flex justify-end gap-1">
												<button
													className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("usage");
													}}
													title="Catat Penggunaan"
													type="button"
												>
													<Minus className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("add");
													}}
													title="Tambah Stok"
													type="button"
												>
													<Plus className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
													onClick={() => {
														onSelectedItemChange(item);
														onNewItemChange({
															ingredientName: item.ingredientName,
															unit: item.unit,
															quantity: String(item.quantity),
															lowStockThreshold: String(item.lowStockThreshold),
															displayUnit: item.displayUnit || "",
															conversionFactor: item.conversionFactor
																? String(item.conversionFactor)
																: "",
															baseRecipeId: item.baseRecipeId || "",
														});
														onActionTypeChange("edit");
													}}
													title="Edit"
													type="button"
												>
													<Edit className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
													onClick={() => {
														onSelectedItemChange(item);
														onAmountChange(String(item.quantity));
														onActionTypeChange("adjust");
													}}
													title="Sesuaikan Stok"
													type="button"
												>
													<Settings2 className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("delete");
													}}
													title="Hapus"
													type="button"
												>
													<Trash2 className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("history");
													}}
													title="Riwayat"
													type="button"
												>
													<History className="h-4 w-4" />
												</button>
											</div>
										</td>
									</tr>
								);
							})}

						{inventory && filteredInventory.length === 0 && (
							<tr>
								<td
									className="p-8 text-center text-muted-foreground"
									colSpan={5}
								>
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
	onFilterLowStockChange,
	searchQuery,
	onSearchQueryChange,
	onActionTypeChange,
}: {
	filterLowStock: boolean;
	onFilterLowStockChange: (val: boolean) => void;
	searchQuery: string;
	onSearchQueryChange: (val: string) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "create"
			| null
	) => void;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<h2 className="font-bold text-lg md:text-2xl">Inventaris</h2>
			<div className="flex flex-wrap gap-2">
				<button
					className={`rounded-lg px-3 py-2 font-medium text-xs transition-colors md:text-sm ${
						filterLowStock
							? "border border-destructive/20 bg-destructive/10 text-destructive"
							: "bg-muted text-muted-foreground hover:bg-muted/80"
					}`}
					onClick={() => onFilterLowStockChange(!filterLowStock)}
					type="button"
				>
					Stok Rendah
				</button>
				<div className="relative flex-1 sm:flex-none">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						className="w-full rounded-lg border border-border bg-card py-2 pr-4 pl-10 text-sm outline-none transition-all focus:border-primary sm:w-64"
						onChange={(e) => onSearchQueryChange(e.target.value)}
						placeholder="Cari bahan..."
						value={searchQuery}
					/>
				</div>
				<button
					className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground text-xs hover:brightness-110 md:gap-2 md:px-4 md:text-sm"
					onClick={() => onActionTypeChange("create")}
					type="button"
				>
					<Plus className="h-4 w-4" /> Tambah
				</button>
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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-[40px] border border-[#4A3728]/10 bg-[#F5F0E1]"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="flex items-center justify-between border-[#4A3728]/5 border-b p-8 pb-4">
					<h3 className="font-bold text-2xl text-[#4A3728] tracking-tight">
						Riwayat: {item.ingredientName}
					</h3>
					<button
						className="rounded-full bg-[#4A3728]/10 p-2 text-[#4A3728] transition-all hover:bg-[#4A3728]/20"
						onClick={onClose}
						type="button"
					>
						<Plus className="h-5 w-5 rotate-45" />
					</button>
				</div>
				<div className="p-8">
					<div className="max-h-[60vh] overflow-y-auto rounded-[32px] border border-[#4A3728]/10 bg-[#F0EAD6]/30">
						<table className="w-full text-left text-xs">
							<thead className="sticky top-0 border-[#4A3728]/5 border-b bg-[#E8E1CF]">
								<tr className="text-[#4A3728]/40 uppercase tracking-widest">
									<th className="p-4 font-bold text-[9px]">Tanggal</th>
									<th className="p-4 font-bold text-[9px]">Tipe</th>
									<th className="p-4 text-right font-bold text-[9px]">
										Jumlah
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-[#4A3728]/5">
								{transactions?.map((t) => (
									<tr
										className="transition-colors hover:bg-[#E8E1CF]/30"
										key={t._id}
									>
										<td className="whitespace-nowrap p-4 font-bold text-[#4A3728]/60">
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
												}[t.type as "restock" | "usage" | "adjustment"] || {
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
															<span className="max-w-[140px] truncate text-[#4A3728]/40 text-[10px] italic">
																{t.notes}
															</span>
														)}
													</div>
												);
											})()}
										</td>
										<td
											className={`p-4 text-right font-black font-mono text-sm ${
												t.quantity > 0 ? "text-green-600" : "text-[#EF4444]"
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
											className="p-12 text-center font-medium text-[#4A3728]/30 text-sm italic"
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
