import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import type { Doc, Id } from "@tkmpos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	Calculator,
	ChevronDown,
	ChevronUp,
	CircleDollarSign,
	Copy,
	Edit,
	GlassWater,
	Package,
	Percent,
	Plus,
	Scale,
	Trash2,
	TrendingUp,
	X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export const Route = createFileRoute("/admin/hpp-calculator")({
	component: HppCalculatorPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface IngredientRow {
	id: string;
	inventoryId?: Id<"inventory">;
	ingredientName: string;
	purchasePrice: number;
	purchaseQuantity: number;
	purchaseUnit: string;
	usagePerServing: number;
	usageUnit: string;
	conversionFactor: number;
}

interface OverheadRow {
	id: string;
	name: string;
	costPerServing: number;
}

interface HppFormData {
	name: string;
	description: string;
	ingredients: IngredientRow[];
	overheadCosts: OverheadRow[];
	servingsPerBatch: number;
	sellingPrice: number;
	productId?: Id<"products">;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function generateId(): string {
	return Math.random().toString(36).substring(2, 9);
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

/** Cost per base unit = purchasePrice / (purchaseQuantity * conversionFactor) */
function getCostPerBaseUnit(ingredient: IngredientRow): number {
	const totalBaseUnits =
		ingredient.purchaseQuantity * ingredient.conversionFactor;
	if (totalBaseUnits === 0) return 0;
	return ingredient.purchasePrice / totalBaseUnits;
}

/** Cost per serving for a single ingredient */
function getIngredientCostPerServing(ingredient: IngredientRow): number {
	return getCostPerBaseUnit(ingredient) * ingredient.usagePerServing;
}

function createEmptyIngredient(): IngredientRow {
	return {
		id: generateId(),
		ingredientName: "",
		purchasePrice: 0,
		purchaseQuantity: 1,
		purchaseUnit: "liter",
		usagePerServing: 0,
		usageUnit: "ml",
		conversionFactor: 1000,
	};
}

function createEmptyOverhead(): OverheadRow {
	return {
		id: generateId(),
		name: "",
		costPerServing: 0,
	};
}

const INITIAL_FORM: HppFormData = {
	name: "",
	description: "",
	ingredients: [createEmptyIngredient()],
	overheadCosts: [createEmptyOverhead()],
	servingsPerBatch: 1,
	sellingPrice: 0,
};

const COMMON_UNITS = [
	{ purchase: "liter", usage: "ml", factor: 1000 },
	{ purchase: "kg", usage: "gram", factor: 1000 },
	{ purchase: "box (1L)", usage: "ml", factor: 1000 },
	{ purchase: "box (500ml)", usage: "ml", factor: 500 },
	{ purchase: "box (250ml)", usage: "ml", factor: 250 },
	{ purchase: "karung (25kg)", usage: "gram", factor: 25000 },
	{ purchase: "karung (50kg)", usage: "gram", factor: 50000 },
	{ purchase: "pack", usage: "pcs", factor: 1 },
	{ purchase: "lusin", usage: "pcs", factor: 12 },
	{ purchase: "dus", usage: "pcs", factor: 1 },
];

// ─── Main Component ──────────────────────────────────────────────────────────

function HppCalculatorPage() {
	const hppCalculations = useQuery(api.hpp.getHppCalculations);
	const inventory = useQuery(api.inventory.getInventory);
	const products = useQuery(api.products.getAllProductsAdmin);

	const createHpp = useMutation(api.hpp.createHppCalculation);
	const updateHpp = useMutation(api.hpp.updateHppCalculation);
	const deleteHpp = useMutation(api.hpp.deleteHppCalculation);

	const [activeTab, setActiveTab] = useState<"calculator" | "saved">(
		"calculator"
	);
	const [form, setForm] = useState<HppFormData>(INITIAL_FORM);
	const [editingId, setEditingId] = useState<Id<"hppCalculations"> | null>(
		null
	);
	const [deleteTarget, setDeleteTarget] =
		useState<Id<"hppCalculations"> | null>(null);
	const [expandedCard, setExpandedCard] =
		useState<Id<"hppCalculations"> | null>(null);

	// ─── Calculations ─────────────────────────────────────────────────────────

	const calculations = useMemo(() => {
		const ingredientCostPerServing = form.ingredients.reduce(
			(sum, ing) => sum + getIngredientCostPerServing(ing),
			0
		);
		const overheadCostPerServing = form.overheadCosts.reduce(
			(sum, oh) => sum + oh.costPerServing,
			0
		);
		const totalHppPerServing = ingredientCostPerServing + overheadCostPerServing;
		const totalHppPerBatch = totalHppPerServing * form.servingsPerBatch;
		const profitPerServing = form.sellingPrice - totalHppPerServing;
		const profitMarginPercent =
			form.sellingPrice > 0
				? (profitPerServing / form.sellingPrice) * 100
				: 0;
		const markupPercent =
			totalHppPerServing > 0
				? (profitPerServing / totalHppPerServing) * 100
				: 0;
		const breakEvenServings =
			totalHppPerBatch > 0 && profitPerServing > 0
				? Math.ceil(totalHppPerBatch / profitPerServing)
				: 0;

		return {
			ingredientCostPerServing,
			overheadCostPerServing,
			totalHppPerServing,
			totalHppPerBatch,
			profitPerServing,
			profitMarginPercent,
			markupPercent,
			breakEvenServings,
		};
	}, [form]);

	// ─── Ingredient Helpers ───────────────────────────────────────────────────

	const updateIngredient = useCallback(
		(id: string, field: keyof IngredientRow, value: string | number) => {
			setForm((prev) => ({
				...prev,
				ingredients: prev.ingredients.map((ing) =>
					ing.id === id ? { ...ing, [field]: value } : ing
				),
			}));
		},
		[]
	);

	const applyUnitPreset = useCallback(
		(id: string, presetIndex: number) => {
			const preset = COMMON_UNITS[presetIndex];
			if (!preset) return;
			setForm((prev) => ({
				...prev,
				ingredients: prev.ingredients.map((ing) =>
					ing.id === id
						? {
								...ing,
								purchaseUnit: preset.purchase,
								usageUnit: preset.usage,
								conversionFactor: preset.factor,
							}
						: ing
				),
			}));
		},
		[]
	);

	const addIngredient = useCallback(() => {
		setForm((prev) => ({
			...prev,
			ingredients: [...prev.ingredients, createEmptyIngredient()],
		}));
	}, []);

	const removeIngredient = useCallback((id: string) => {
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.filter((ing) => ing.id !== id),
		}));
	}, []);

	// ─── Overhead Helpers ─────────────────────────────────────────────────────

	const updateOverhead = useCallback(
		(id: string, field: keyof OverheadRow, value: string | number) => {
			setForm((prev) => ({
				...prev,
				overheadCosts: prev.overheadCosts.map((oh) =>
					oh.id === id ? { ...oh, [field]: value } : oh
				),
			}));
		},
		[]
	);

	const addOverhead = useCallback(() => {
		setForm((prev) => ({
			...prev,
			overheadCosts: [...prev.overheadCosts, createEmptyOverhead()],
		}));
	}, []);

	const removeOverhead = useCallback((id: string) => {
		setForm((prev) => ({
			...prev,
			overheadCosts: prev.overheadCosts.filter((oh) => oh.id !== id),
		}));
	}, []);

	// ─── Save / Edit / Delete ─────────────────────────────────────────────────

	const handleSave = async () => {
		if (!form.name.trim()) {
			toast.error("Nama kalkulasi harus diisi");
			return;
		}
		if (form.ingredients.length === 0) {
			toast.error("Tambahkan minimal 1 bahan baku");
			return;
		}

		const payload = {
			name: form.name,
			description: form.description || undefined,
			ingredients: form.ingredients.map(({ id, ...rest }) => rest),
			overheadCosts: form.overheadCosts.map(({ id, ...rest }) => rest),
			servingsPerBatch: form.servingsPerBatch,
			sellingPrice: form.sellingPrice,
			productId: form.productId || undefined,
		};

		try {
			if (editingId) {
				await updateHpp({ id: editingId, ...payload });
				toast.success("Kalkulasi HPP berhasil diperbarui");
				setEditingId(null);
			} else {
				await createHpp(payload);
				toast.success("Kalkulasi HPP berhasil disimpan");
			}
			setForm(INITIAL_FORM);
			setActiveTab("saved");
		} catch {
			toast.error("Gagal menyimpan kalkulasi HPP");
		}
	};

	const handleEdit = (calc: Doc<"hppCalculations">) => {
		setForm({
			name: calc.name,
			description: calc.description || "",
			ingredients: calc.ingredients.map((ing) => ({
				...ing,
				id: generateId(),
			})),
			overheadCosts: calc.overheadCosts.map((oh) => ({
				...oh,
				id: generateId(),
			})),
			servingsPerBatch: calc.servingsPerBatch,
			sellingPrice: calc.sellingPrice,
			productId: calc.productId,
		});
		setEditingId(calc._id);
		setActiveTab("calculator");
	};

	const handleDuplicate = (calc: Doc<"hppCalculations">) => {
		setForm({
			name: `${calc.name} (Salinan)`,
			description: calc.description || "",
			ingredients: calc.ingredients.map((ing) => ({
				...ing,
				id: generateId(),
			})),
			overheadCosts: calc.overheadCosts.map((oh) => ({
				...oh,
				id: generateId(),
			})),
			servingsPerBatch: calc.servingsPerBatch,
			sellingPrice: calc.sellingPrice,
			productId: undefined,
		});
		setEditingId(null);
		setActiveTab("calculator");
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		try {
			await deleteHpp({ id: deleteTarget });
			toast.success("Kalkulasi HPP berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus kalkulasi HPP");
		}
		setDeleteTarget(null);
	};

	const handleReset = () => {
		setForm(INITIAL_FORM);
		setEditingId(null);
	};

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-6 duration-500">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-xl tracking-tight">
						Kalkulator HPP
					</h2>
					<p className="text-muted-foreground text-sm">
						Hitung Harga Pokok Produksi bahan baku per porsi/gelas
					</p>
				</div>
			</div>

			{/* Tabs */}
			<div className="flex items-center gap-2 border-border border-b pb-1">
				<button
					className={`relative px-4 py-2 font-bold text-sm transition-colors ${
						activeTab === "calculator"
							? "text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setActiveTab("calculator")}
					type="button"
				>
					Kalkulator
					{activeTab === "calculator" && (
						<motion.div
							className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
							layoutId="hppTab"
						/>
					)}
				</button>
				<button
					className={`relative px-4 py-2 font-bold text-sm transition-colors ${
						activeTab === "saved"
							? "text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setActiveTab("saved")}
					type="button"
				>
					Tersimpan
					{hppCalculations && hppCalculations.length > 0 && (
						<span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-primary text-xs">
							{hppCalculations.length}
						</span>
					)}
					{activeTab === "saved" && (
						<motion.div
							className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
							layoutId="hppTab"
						/>
					)}
				</button>
			</div>

			{activeTab === "calculator" && (
				<CalculatorView
					form={form}
					setForm={setForm}
					calculations={calculations}
					inventory={inventory}
					products={products}
					editingId={editingId}
					updateIngredient={updateIngredient}
					applyUnitPreset={applyUnitPreset}
					addIngredient={addIngredient}
					removeIngredient={removeIngredient}
					updateOverhead={updateOverhead}
					addOverhead={addOverhead}
					removeOverhead={removeOverhead}
					onSave={handleSave}
					onReset={handleReset}
				/>
			)}

			{activeTab === "saved" && (
				<SavedCalculationsView
					calculations={hppCalculations}
					products={products}
					expandedCard={expandedCard}
					setExpandedCard={setExpandedCard}
					onEdit={handleEdit}
					onDuplicate={handleDuplicate}
					onDelete={(id) => setDeleteTarget(id)}
				/>
			)}

			{/* Delete Confirmation */}
			<ConfirmationModal
				isOpen={!!deleteTarget}
				message="Apakah Anda yakin ingin menghapus kalkulasi HPP ini? Tindakan ini tidak dapat dibatalkan."
				onClose={() => setDeleteTarget(null)}
				onConfirm={handleDelete}
				title="Hapus Kalkulasi HPP"
			/>
		</div>
	);
}

// ─── Calculator View ─────────────────────────────────────────────────────────

function CalculatorView({
	form,
	setForm,
	calculations,
	inventory,
	products,
	editingId,
	updateIngredient,
	applyUnitPreset,
	addIngredient,
	removeIngredient,
	updateOverhead,
	addOverhead,
	removeOverhead,
	onSave,
	onReset,
}: {
	form: HppFormData;
	setForm: React.Dispatch<React.SetStateAction<HppFormData>>;
	calculations: ReturnType<typeof useMemo<ReturnType<() => {
		ingredientCostPerServing: number;
		overheadCostPerServing: number;
		totalHppPerServing: number;
		totalHppPerBatch: number;
		profitPerServing: number;
		profitMarginPercent: number;
		markupPercent: number;
		breakEvenServings: number;
	}>>>;
	inventory: Doc<"inventory">[] | undefined;
	products: Doc<"products">[] | undefined;
	editingId: Id<"hppCalculations"> | null;
	updateIngredient: (
		id: string,
		field: keyof IngredientRow,
		value: string | number
	) => void;
	applyUnitPreset: (id: string, presetIndex: number) => void;
	addIngredient: () => void;
	removeIngredient: (id: string) => void;
	updateOverhead: (
		id: string,
		field: keyof OverheadRow,
		value: string | number
	) => void;
	addOverhead: () => void;
	removeOverhead: (id: string) => void;
	onSave: () => void;
	onReset: () => void;
}) {
	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_380px]">
			{/* Left Column - Form */}
			<div className="flex flex-col gap-6">
				{/* Basic Info */}
				<Card>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center gap-2">
							<Calculator className="h-4 w-4 text-primary" />
							Informasi Dasar
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="hpp-name">Nama Kalkulasi *</Label>
								<Input
									id="hpp-name"
									placeholder="cth: HPP Es Susu Coklat"
									value={form.name}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											name: e.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="hpp-desc">Deskripsi</Label>
								<Input
									id="hpp-desc"
									placeholder="cth: Perhitungan untuk 1 gelas 300ml"
									value={form.description}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											description: e.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="hpp-servings">Porsi per Batch</Label>
								<Input
									id="hpp-servings"
									min={1}
									type="number"
									value={form.servingsPerBatch || ""}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											servingsPerBatch: Number(e.target.value) || 0,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="hpp-selling">Harga Jual /Porsi</Label>
								<Input
									id="hpp-selling"
									min={0}
									placeholder="15000"
									type="number"
									value={form.sellingPrice || ""}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											sellingPrice: Number(e.target.value) || 0,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>Produk Terkait</Label>
								<select
									className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
									value={form.productId || ""}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											productId: (e.target.value || undefined) as
												| Id<"products">
												| undefined,
										}))
									}
								>
									<option value="">-- Tidak ada --</option>
									{products?.map((p) => (
										<option key={p._id} value={p._id}>
											{p.name}
										</option>
									))}
								</select>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Ingredients */}
				<Card>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center justify-between">
							<span className="flex items-center gap-2">
								<Package className="h-4 w-4 text-primary" />
								Bahan Baku
							</span>
							<Button onClick={addIngredient} size="sm" variant="outline">
								<Plus className="h-3.5 w-3.5" />
								Tambah Bahan
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<AnimatePresence mode="popLayout">
							{form.ingredients.map((ing, idx) => (
								<motion.div
									key={ing.id}
									animate={{ opacity: 1, y: 0 }}
									className="rounded-lg border border-border bg-muted/30 p-3"
									exit={{ opacity: 0, y: -10 }}
									initial={{ opacity: 0, y: 10 }}
									layout
								>
									<div className="mb-3 flex items-center justify-between">
										<span className="font-semibold text-xs text-muted-foreground">
											Bahan #{idx + 1}
										</span>
										{form.ingredients.length > 1 && (
											<button
												className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
												onClick={() => removeIngredient(ing.id)}
												type="button"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										)}
									</div>

									<div className="grid gap-3 sm:grid-cols-2">
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Nama Bahan
											</Label>
											<Input
												placeholder="cth: Susu UHT"
												value={ing.ingredientName}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"ingredientName",
														e.target.value
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Preset Satuan
											</Label>
											<select
												className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
												value=""
												onChange={(e) => {
													if (e.target.value !== "") {
														applyUnitPreset(
															ing.id,
															Number(e.target.value)
														);
													}
												}}
											>
												<option value="">Pilih preset...</option>
												{COMMON_UNITS.map((u, i) => (
													<option key={`${u.purchase}-${u.usage}`} value={i}>
														{u.purchase} → {u.usage} (1:{u.factor})
													</option>
												))}
											</select>
										</div>
									</div>

									<div className="mt-3 grid gap-3 sm:grid-cols-4">
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Harga Beli
											</Label>
											<Input
												min={0}
												placeholder="18000"
												type="number"
												value={ing.purchasePrice || ""}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"purchasePrice",
														Number(e.target.value) || 0
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Jumlah Beli
											</Label>
											<Input
												min={0}
												placeholder="1"
												type="number"
												value={ing.purchaseQuantity || ""}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"purchaseQuantity",
														Number(e.target.value) || 0
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Satuan Beli
											</Label>
											<Input
												placeholder="liter"
												value={ing.purchaseUnit}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"purchaseUnit",
														e.target.value
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Konversi
											</Label>
											<Input
												min={1}
												placeholder="1000"
												type="number"
												value={ing.conversionFactor || ""}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"conversionFactor",
														Number(e.target.value) || 0
													)
												}
											/>
										</div>
									</div>

									<div className="mt-3 grid gap-3 sm:grid-cols-3">
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Pemakaian /Porsi
											</Label>
											<Input
												min={0}
												placeholder="200"
												type="number"
												value={ing.usagePerServing || ""}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"usagePerServing",
														Number(e.target.value) || 0
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												Satuan Pakai
											</Label>
											<Input
												placeholder="ml"
												value={ing.usageUnit}
												onChange={(e) =>
													updateIngredient(
														ing.id,
														"usageUnit",
														e.target.value
													)
												}
											/>
										</div>
										<div className="flex flex-col gap-1.5">
											<Label className="text-[11px] text-muted-foreground">
												Biaya /Porsi
											</Label>
											<div className="flex h-8 items-center rounded-md bg-primary/5 px-2.5 font-semibold text-primary text-xs">
												{formatCurrency(
													getIngredientCostPerServing(ing)
												)}
											</div>
										</div>
									</div>

									{/* Conversion info */}
									{ing.purchasePrice > 0 &&
										ing.conversionFactor > 0 && (
											<div className="mt-2 flex items-center gap-1.5 rounded bg-blue-50 px-2 py-1.5 text-blue-700 text-[11px] dark:bg-blue-950/30 dark:text-blue-300">
												<Scale className="h-3 w-3 shrink-0" />
												<span>
													1 {ing.purchaseUnit} ={" "}
													{formatNumber(ing.conversionFactor)}{" "}
													{ing.usageUnit}
												</span>
												<ArrowRight className="h-3 w-3 shrink-0" />
												<span>
													Harga per {ing.usageUnit}:{" "}
													{formatCurrency(getCostPerBaseUnit(ing))}
												</span>
												{ing.usagePerServing > 0 && (
													<>
														<ArrowRight className="h-3 w-3 shrink-0" />
														<span>
															1 {ing.purchaseUnit} ={" "}
															{formatNumber(
																(ing.purchaseQuantity *
																	ing.conversionFactor) /
																	ing.usagePerServing
															)}{" "}
															porsi
														</span>
													</>
												)}
											</div>
										)}
								</motion.div>
							))}
						</AnimatePresence>
					</CardContent>
				</Card>

				{/* Overhead Costs */}
				<Card>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center justify-between">
							<span className="flex items-center gap-2">
								<CircleDollarSign className="h-4 w-4 text-primary" />
								Biaya Overhead /Porsi
							</span>
							<Button onClick={addOverhead} size="sm" variant="outline">
								<Plus className="h-3.5 w-3.5" />
								Tambah Biaya
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="text-muted-foreground text-[11px]">
							Biaya tambahan per porsi seperti cup, sedotan, gas, listrik, dll.
						</p>
						<AnimatePresence mode="popLayout">
							{form.overheadCosts.map((oh, idx) => (
								<motion.div
									key={oh.id}
									animate={{ opacity: 1, x: 0 }}
									className="flex items-end gap-2"
									exit={{ opacity: 0, x: -10 }}
									initial={{ opacity: 0, x: 10 }}
									layout
								>
									<div className="flex flex-1 flex-col gap-1">
										<Label className="text-[11px] text-muted-foreground">
											{idx === 0 ? "Nama Biaya" : ""}
										</Label>
										<Input
											placeholder="cth: Cup Plastik"
											value={oh.name}
											onChange={(e) =>
												updateOverhead(oh.id, "name", e.target.value)
											}
										/>
									</div>
									<div className="flex w-36 flex-col gap-1">
										<Label className="text-[11px] text-muted-foreground">
											{idx === 0 ? "Biaya /Porsi" : ""}
										</Label>
										<Input
											min={0}
											placeholder="500"
											type="number"
											value={oh.costPerServing || ""}
											onChange={(e) =>
												updateOverhead(
													oh.id,
													"costPerServing",
													Number(e.target.value) || 0
												)
											}
										/>
									</div>
									{form.overheadCosts.length > 1 && (
										<button
											className="mb-0.5 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
											onClick={() => removeOverhead(oh.id)}
											type="button"
										>
											<X className="h-3.5 w-3.5" />
										</button>
									)}
								</motion.div>
							))}
						</AnimatePresence>
					</CardContent>
				</Card>
			</div>

			{/* Right Column - Results Panel */}
			<div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
				{/* HPP Summary */}
				<Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
					<CardHeader className="border-b">
						<CardTitle className="flex items-center gap-2">
							<GlassWater className="h-4 w-4 text-primary" />
							Ringkasan HPP
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{/* Ingredient cost breakdown */}
						<div>
							<p className="mb-1 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">
								Biaya Bahan Baku
							</p>
							{form.ingredients
								.filter((ing) => ing.ingredientName)
								.map((ing) => (
									<div
										key={ing.id}
										className="flex items-center justify-between py-0.5 text-xs"
									>
										<span className="text-muted-foreground">
											{ing.ingredientName}
										</span>
										<span>
											{formatCurrency(getIngredientCostPerServing(ing))}
										</span>
									</div>
								))}
							<div className="mt-1 flex items-center justify-between border-border border-t pt-1 font-semibold text-xs">
								<span>Subtotal Bahan</span>
								<span>
									{formatCurrency(
										calculations.ingredientCostPerServing
									)}
								</span>
							</div>
						</div>

						{/* Overhead breakdown */}
						<div>
							<p className="mb-1 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">
								Biaya Overhead
							</p>
							{form.overheadCosts
								.filter((oh) => oh.name)
								.map((oh) => (
									<div
										key={oh.id}
										className="flex items-center justify-between py-0.5 text-xs"
									>
										<span className="text-muted-foreground">
											{oh.name}
										</span>
										<span>
											{formatCurrency(oh.costPerServing)}
										</span>
									</div>
								))}
							<div className="mt-1 flex items-center justify-between border-border border-t pt-1 font-semibold text-xs">
								<span>Subtotal Overhead</span>
								<span>
									{formatCurrency(
										calculations.overheadCostPerServing
									)}
								</span>
							</div>
						</div>

						{/* Total HPP */}
						<div className="rounded-lg bg-primary/10 p-3">
							<div className="flex items-center justify-between">
								<span className="font-bold text-sm">
									HPP /Porsi
								</span>
								<span className="font-bold text-lg text-primary">
									{formatCurrency(
										calculations.totalHppPerServing
									)}
								</span>
							</div>
							{form.servingsPerBatch > 1 && (
								<div className="mt-1 flex items-center justify-between text-muted-foreground text-xs">
									<span>
										HPP /Batch ({form.servingsPerBatch} porsi)
									</span>
									<span>
										{formatCurrency(
											calculations.totalHppPerBatch
										)}
									</span>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Profit Analysis */}
				{form.sellingPrice > 0 && (
					<Card
						className={
							calculations.profitMarginPercent >= 30
								? "border-green-200 dark:border-green-900"
								: calculations.profitMarginPercent >= 15
									? "border-yellow-200 dark:border-yellow-900"
									: "border-red-200 dark:border-red-900"
						}
					>
						<CardHeader className="border-b">
							<CardTitle className="flex items-center gap-2">
								<TrendingUp className="h-4 w-4 text-primary" />
								Analisis Keuntungan
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									Harga Jual
								</span>
								<span className="font-semibold">
									{formatCurrency(form.sellingPrice)}
								</span>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									HPP
								</span>
								<span>
									{formatCurrency(
										calculations.totalHppPerServing
									)}
								</span>
							</div>
							<div className="border-border border-t pt-2">
								<div className="flex items-center justify-between text-xs">
									<span className="font-semibold">
										Laba /Porsi
									</span>
									<span
										className={`font-bold text-sm ${
											calculations.profitPerServing >= 0
												? "text-green-600 dark:text-green-400"
												: "text-red-600 dark:text-red-400"
										}`}
									>
										{formatCurrency(
											calculations.profitPerServing
										)}
									</span>
								</div>
							</div>

							{/* Margin & Markup bars */}
							<div className="mt-1 flex flex-col gap-2">
								<div>
									<div className="mb-1 flex items-center justify-between text-[11px]">
										<span className="text-muted-foreground">
											Margin Laba
										</span>
										<span className="font-semibold">
											{formatNumber(
												calculations.profitMarginPercent
											)}
											%
										</span>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
										<motion.div
											animate={{
												width: `${Math.min(Math.max(calculations.profitMarginPercent, 0), 100)}%`,
											}}
											className={`h-full rounded-full ${
												calculations.profitMarginPercent >= 30
													? "bg-green-500"
													: calculations.profitMarginPercent >= 15
														? "bg-yellow-500"
														: "bg-red-500"
											}`}
											initial={{ width: 0 }}
											transition={{ duration: 0.5 }}
										/>
									</div>
								</div>
								<div>
									<div className="mb-1 flex items-center justify-between text-[11px]">
										<span className="text-muted-foreground">
											Markup
										</span>
										<span className="font-semibold">
											{formatNumber(
												calculations.markupPercent
											)}
											%
										</span>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
										<motion.div
											animate={{
												width: `${Math.min(Math.max(calculations.markupPercent / 3, 0), 100)}%`,
											}}
											className="h-full rounded-full bg-primary"
											initial={{ width: 0 }}
											transition={{ duration: 0.5 }}
										/>
									</div>
								</div>
							</div>

							{calculations.breakEvenServings > 0 && (
								<div className="mt-1 rounded bg-muted/50 p-2 text-center text-[11px] text-muted-foreground">
									Break-even setelah{" "}
									<span className="font-bold text-foreground">
										{calculations.breakEvenServings} porsi
									</span>{" "}
									terjual (dari biaya batch)
								</div>
							)}
						</CardContent>
					</Card>
				)}

				{/* Action Buttons */}
				<div className="flex gap-2">
					<Button
						className="flex-1"
						onClick={onSave}
						variant="default"
					>
						{editingId ? "Perbarui" : "Simpan"} Kalkulasi
					</Button>
					<Button onClick={onReset} variant="outline">
						Reset
					</Button>
				</div>
			</div>
		</div>
	);
}

// ─── Saved Calculations View ─────────────────────────────────────────────────

function SavedCalculationsView({
	calculations,
	products,
	expandedCard,
	setExpandedCard,
	onEdit,
	onDuplicate,
	onDelete,
}: {
	calculations: Doc<"hppCalculations">[] | undefined;
	products: Doc<"products">[] | undefined;
	expandedCard: Id<"hppCalculations"> | null;
	setExpandedCard: (id: Id<"hppCalculations"> | null) => void;
	onEdit: (calc: Doc<"hppCalculations">) => void;
	onDuplicate: (calc: Doc<"hppCalculations">) => void;
	onDelete: (id: Id<"hppCalculations">) => void;
}) {
	if (!calculations) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				Memuat data...
			</div>
		);
	}

	if (calculations.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16">
				<Calculator className="h-12 w-12 text-muted-foreground/40" />
				<p className="font-medium text-muted-foreground text-sm">
					Belum ada kalkulasi HPP tersimpan
				</p>
				<p className="text-muted-foreground text-xs">
					Gunakan tab Kalkulator untuk membuat perhitungan baru
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{calculations.map((calc) => {
				const ingredientCost = calc.ingredients.reduce((sum, ing) => {
					const totalBaseUnits =
						ing.purchaseQuantity * ing.conversionFactor;
					const costPerBase =
						totalBaseUnits > 0
							? ing.purchasePrice / totalBaseUnits
							: 0;
					return sum + costPerBase * ing.usagePerServing;
				}, 0);
				const overheadCost = calc.overheadCosts.reduce(
					(sum, oh) => sum + oh.costPerServing,
					0
				);
				const totalHpp = ingredientCost + overheadCost;
				const profit = calc.sellingPrice - totalHpp;
				const margin =
					calc.sellingPrice > 0
						? (profit / calc.sellingPrice) * 100
						: 0;
				const linkedProduct = products?.find(
					(p) => p._id === calc.productId
				);
				const isExpanded = expandedCard === calc._id;

				return (
					<Card key={calc._id} className="overflow-hidden">
						<CardHeader className="border-b">
							<CardTitle className="flex items-center justify-between">
								<div className="flex flex-col gap-0.5">
									<span className="truncate font-bold text-sm">
										{calc.name}
									</span>
									{linkedProduct && (
										<span className="text-[11px] text-muted-foreground">
											Produk: {linkedProduct.name}
										</span>
									)}
								</div>
								<div className="flex items-center gap-1">
									<button
										className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
										onClick={() =>
											setExpandedCard(
												isExpanded ? null : calc._id
											)
										}
										title={isExpanded ? "Tutup" : "Detail"}
										type="button"
									>
										{isExpanded ? (
											<ChevronUp className="h-4 w-4" />
										) : (
											<ChevronDown className="h-4 w-4" />
										)}
									</button>
								</div>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{/* Summary */}
							<div className="grid grid-cols-2 gap-2">
								<div className="rounded-md bg-muted/50 p-2 text-center">
									<p className="text-[10px] text-muted-foreground">
										HPP /Porsi
									</p>
									<p className="font-bold text-primary text-sm">
										{formatCurrency(totalHpp)}
									</p>
								</div>
								<div className="rounded-md bg-muted/50 p-2 text-center">
									<p className="text-[10px] text-muted-foreground">
										Laba /Porsi
									</p>
									<p
										className={`font-bold text-sm ${
											profit >= 0
												? "text-green-600 dark:text-green-400"
												: "text-red-600 dark:text-red-400"
										}`}
									>
										{formatCurrency(profit)}
									</p>
								</div>
							</div>

							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									Harga Jual
								</span>
								<span className="font-semibold">
									{formatCurrency(calc.sellingPrice)}
								</span>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									Margin
								</span>
								<span
									className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-[11px] ${
										margin >= 30
											? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
											: margin >= 15
												? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
												: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
									}`}
								>
									<Percent className="h-3 w-3" />
									{formatNumber(margin)}%
								</span>
							</div>

							{/* Expanded detail */}
							<AnimatePresence>
								{isExpanded && (
									<motion.div
										animate={{ height: "auto", opacity: 1 }}
										className="overflow-hidden"
										exit={{ height: 0, opacity: 0 }}
										initial={{ height: 0, opacity: 0 }}
									>
										<div className="mt-2 flex flex-col gap-2 border-border border-t pt-2">
											<p className="font-semibold text-[11px] text-muted-foreground uppercase">
												Bahan Baku
											</p>
											{calc.ingredients.map((ing, i) => {
												const totalBase =
													ing.purchaseQuantity *
													ing.conversionFactor;
												const costBase =
													totalBase > 0
														? ing.purchasePrice /
															totalBase
														: 0;
												const cost =
													costBase *
													ing.usagePerServing;
												return (
													<div
														key={`${calc._id}-ing-${i}`}
														className="flex items-center justify-between text-[11px]"
													>
														<span>
															{ing.ingredientName}{" "}
															<span className="text-muted-foreground">
																({ing.usagePerServing}{" "}
																{ing.usageUnit})
															</span>
														</span>
														<span>
															{formatCurrency(cost)}
														</span>
													</div>
												);
											})}
											{calc.overheadCosts.length > 0 && (
												<>
													<p className="mt-1 font-semibold text-[11px] text-muted-foreground uppercase">
														Overhead
													</p>
													{calc.overheadCosts.map(
														(oh, i) => (
															<div
																key={`${calc._id}-oh-${i}`}
																className="flex items-center justify-between text-[11px]"
															>
																<span>
																	{oh.name}
																</span>
																<span>
																	{formatCurrency(
																		oh.costPerServing
																	)}
																</span>
															</div>
														)
													)}
												</>
											)}
											{calc.description && (
												<p className="mt-1 text-[11px] text-muted-foreground italic">
													{calc.description}
												</p>
											)}
										</div>
									</motion.div>
								)}
							</AnimatePresence>

							{/* Actions */}
							<div className="flex gap-1.5 border-border border-t pt-2">
								<Button
									className="flex-1"
									onClick={() => onEdit(calc)}
									size="sm"
									variant="outline"
								>
									<Edit className="h-3 w-3" />
									Edit
								</Button>
								<Button
									onClick={() => onDuplicate(calc)}
									size="sm"
									variant="outline"
									title="Duplikasi"
								>
									<Copy className="h-3 w-3" />
								</Button>
								<Button
									onClick={() => onDelete(calc._id)}
									size="sm"
									variant="destructive"
									title="Hapus"
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
