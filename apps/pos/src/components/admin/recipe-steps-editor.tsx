// @ts-nocheck
import { useState, useCallback } from "react";
import type { RecipeStep } from "@/hooks/use-hybrid-inventory-admin-data";
import {
	Plus,
	Trash2,
	ArrowUp,
	ArrowDown,
	Edit,
	Save,
	X,
	ChefHat,
	Wrench,
	Scale,
	Flame,
	Droplets,
	Combine,
	Gauge,
	Clock,
	Sparkles,
	Utensils,
	ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Icon Options ──────────────────────────────────────

const STEP_ICONS = [
	{ value: "", label: "None", icon: Utensils },
	{ value: "coffee", label: "Coffee", icon: ChefHat },
	{ value: "grinder", label: "Grinder", icon: Wrench },
	{ value: "scale", label: "Scale", icon: Scale },
	{ value: "espresso", label: "Espresso", icon: Flame },
	{ value: "milk", label: "Milk", icon: Droplets },
	{ value: "pour", label: "Pour", icon: Combine },
	{ value: "tool", label: "Tool", icon: Wrench },
	{ value: "thermometer", label: "Thermometer", icon: Gauge },
	{ value: "timer", label: "Timer", icon: Clock },
	{ value: "garnish", label: "Garnish", icon: Sparkles },
] as const;

function getIconComponent(iconName: string) {
	const found = STEP_ICONS.find((i) => i.value === iconName);
	return found?.icon ?? Utensils;
}

// ─── Step Icon Display ──────────────────────────────────

function StepIconDisplay({ iconName, className }: { iconName?: string; className?: string }) {
	const Icon = getIconComponent(iconName ?? "");
	const colorMap: Record<string, string> = {
		coffee: "text-amber-600",
		grinder: "text-gray-600",
		scale: "text-blue-600",
		espresso: "text-orange-600",
		milk: "text-sky-600",
		pour: "text-emerald-600",
		tool: "text-gray-600",
		thermometer: "text-red-600",
		timer: "text-purple-600",
		garnish: "text-indigo-600",
	};
	return (
		<Icon
			className={cn(
				"h-3.5 w-3.5 shrink-0",
				colorMap[iconName ?? ""] ?? "text-primary/60",
				className,
			)}
		/>
	);
}

// ─── Step Form Modal ──────────────────────────────────

type StepFormModalProps = {
	open: boolean;
	onClose: () => void;
	onSave: (step: Partial<RecipeStep>) => void;
	initial?: RecipeStep | null;
	inventoryMap?: Map<string, any>;
};

function StepFormModal({ open, onClose, onSave, initial, inventoryMap }: StepFormModalProps) {
	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [icon, setIcon] = useState(initial?.icon ?? "");
	const [timerSeconds, setTimerSeconds] = useState(
		initial?.timerSeconds != null ? String(initial.timerSeconds) : "",
	);
	const [temperature, setTemperature] = useState(initial?.temperature ?? "");
	const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>(
		initial?.ingredientIds ?? [],
	);

	const isEditing = !!initial;
	const isValid = title.trim().length > 0 && description.trim().length > 0;

	const handleSave = useCallback(() => {
		if (!isValid) {
			toast.error("Judul dan deskripsi harus diisi");
			return;
		}
		onSave({
			title: title.trim(),
			description: description.trim(),
			icon: icon || undefined,
			timerSeconds: timerSeconds ? Number(timerSeconds) : null,
			temperature: temperature || null,
			ingredientIds: selectedIngredientIds.length > 0 ? selectedIngredientIds : null,
		});
	}, [isValid, title, description, icon, timerSeconds, temperature, selectedIngredientIds, onSave]);

	const handleClose = useCallback(() => {
		setTitle(initial?.title ?? "");
		setDescription(initial?.description ?? "");
		setIcon(initial?.icon ?? "");
		setTimerSeconds(initial?.timerSeconds != null ? String(initial.timerSeconds) : "");
		setTemperature(initial?.temperature ?? "");
		setSelectedIngredientIds(initial?.ingredientIds ?? []);
		onClose();
	}, [onClose, initial]);

	const toggleIngredient = useCallback((id: string) => {
		setSelectedIngredientIds((prev) =>
			prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
		);
	}, []);

	if (!open) return null;

	const inventoryItems = inventoryMap ? Array.from(inventoryMap.values()) : [];

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
			data-admin-modal-backdrop
			onClick={(e) => {
				if ((e.target as HTMLElement).hasAttribute("data-admin-modal-backdrop")) {
					handleClose();
				}
			}}
		>
			<div
				className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
				data-admin-modal-card
			>
				{/* Header */}
				<div className="mb-5 flex items-center justify-between">
					<h3 className="text-lg font-bold tracking-tight">
						{isEditing ? "Edit Langkah" : "Tambah Langkah"}
					</h3>
					<Button onClick={handleClose} size="sm" type="button" variant="outline">
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Form Fields */}
				<div className="space-y-4">
					{/* Title */}
					<div className="space-y-1.5">
						<Label htmlFor="step-title" className="text-xs font-semibold">
							Judul <span className="text-destructive">*</span>
						</Label>
						<Input
							id="step-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Contoh: Siapkan Alat"
							className="h-9 text-sm"
						/>
					</div>

					{/* Description */}
					<div className="space-y-1.5">
						<Label htmlFor="step-desc" className="text-xs font-semibold">
							Deskripsi <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="step-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Jelaskan langkah ini secara detail..."
							className="min-h-[80px] resize-y text-sm"
							rows={3}
						/>
					</div>

					{/* Icon */}
					<div className="space-y-1.5">
						<Label htmlFor="step-icon" className="text-xs font-semibold">
							Ikon
						</Label>
						<Select value={icon} onValueChange={setIcon}>
							<SelectTrigger id="step-icon" className="h-9 text-sm">
								<SelectValue placeholder="Pilih ikon (opsional)" />
							</SelectTrigger>
							<SelectContent>
								{STEP_ICONS.map((opt) => {
									const IconComp = opt.icon;
									return (
										<SelectItem key={opt.value} value={opt.value} className="text-sm">
											<span className="flex items-center gap-2">
												<IconComp className="h-3.5 w-3.5" />
												{opt.label}
											</span>
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>

					{/* Timer & Temperature row */}
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="step-timer" className="text-xs font-semibold">
								Timer (detik)
							</Label>
							<Input
								id="step-timer"
								type="number"
								min="0"
								value={timerSeconds}
								onChange={(e) => setTimerSeconds(e.target.value)}
								placeholder="Contoh: 30"
								className="h-9 text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="step-temp" className="text-xs font-semibold">
								Suhu
							</Label>
							<Input
								id="step-temp"
								value={temperature}
								onChange={(e) => setTemperature(e.target.value)}
								placeholder="Contoh: 90°C"
								className="h-9 text-sm"
							/>
						</div>
					</div>

					{/* Linked Ingredients */}
					{inventoryItems.length > 0 && (
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold">Bahan Terkait</Label>
							<div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5 max-h-[120px] overflow-y-auto">
								{inventoryItems.map((item: any) => {
									const id = String(item._id);
									const selected = selectedIngredientIds.includes(id);
									return (
										<button
											key={id}
											type="button"
											onClick={() => toggleIngredient(id)}
											className={cn(
												"rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
												selected
													? "bg-primary text-primary-foreground"
													: "bg-card text-foreground/70 hover:bg-muted border border-border/60",
											)}
										>
											{item.ingredientName || item.name || "Bahan"}
										</button>
									);
								})}
							</div>
							{selectedIngredientIds.length > 0 && (
								<p className="text-[10px] text-muted-foreground">
									{selectedIngredientIds.length} bahan dipilih
								</p>
							)}
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="mt-6 flex items-center justify-end gap-2">
					<Button onClick={handleClose} type="button" variant="outline" size="sm">
						Batal
					</Button>
					<Button
						onClick={handleSave}
						type="button"
						size="sm"
						disabled={!isValid}
					>
						<Save className="mr-1.5 h-3.5 w-3.5" />
						{isEditing ? "Simpan Perubahan" : "Tambah Langkah"}
					</Button>
				</div>
			</div>
		</div>
	);
}

// ─── Recipe Steps Editor ───────────────────────────────

type RecipeStepsEditorProps = {
	steps: RecipeStep[];
	onChange: (steps: RecipeStep[]) => void;
	inventoryMap?: Map<string, any>;
};

function RecipeStepsEditor({ steps, onChange, inventoryMap }: RecipeStepsEditorProps) {
	const [modalOpen, setModalOpen] = useState(false);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);

	const openAddModal = useCallback(() => {
		setEditingIndex(null);
		setModalOpen(true);
	}, []);

	const openEditModal = useCallback((index: number) => {
		setEditingIndex(index);
		setModalOpen(true);
	}, []);

	const closeModal = useCallback(() => {
		setModalOpen(false);
		setEditingIndex(null);
	}, []);

	const handleSave = useCallback(
		(partial: Partial<RecipeStep>) => {
			if (editingIndex != null) {
				// Edit existing step
				const updated = steps.map((s, i) =>
					i === editingIndex ? { ...s, ...partial } : s,
				);
				onChange(updated);
				toast.success("Langkah berhasil diperbarui");
			} else {
				// Add new step
				const newStep: RecipeStep = {
					order: steps.length,
					title: partial.title ?? "",
					description: partial.description ?? "",
					icon: partial.icon,
					timerSeconds: partial.timerSeconds ?? null,
					temperature: partial.temperature ?? null,
					ingredientIds: partial.ingredientIds ?? null,
				};
				onChange([...steps, newStep]);
				toast.success("Langkah baru ditambahkan");
			}
			closeModal();
		},
		[steps, onChange, editingIndex, closeModal],
	);

	const moveUp = useCallback(
		(index: number) => {
			if (index === 0) return;
			const updated = [...steps];
			[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
			// Reassign order
			onChange(updated.map((s, i) => ({ ...s, order: i })));
		},
		[steps, onChange],
	);

	const moveDown = useCallback(
		(index: number) => {
			if (index === steps.length - 1) return;
			const updated = [...steps];
			[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
			onChange(updated.map((s, i) => ({ ...s, order: i })));
		},
		[steps, onChange],
	);

	const handleDelete = useCallback(
		(index: number) => {
			const updated = steps
				.filter((_, i) => i !== index)
				.map((s, i) => ({ ...s, order: i }));
			onChange(updated);
			toast.success("Langkah berhasil dihapus");
		},
		[steps, onChange],
	);

	const empty = !steps || steps.length === 0;

	return (
		<>
			<Card className="border-border/80">
				<CardHeader className="flex flex-row items-center justify-between px-4 py-3">
					<CardTitle className="flex items-center gap-2 text-sm font-bold">
						<ListOrdered className="h-4 w-4 text-primary" />
						Langkah-Langkah
						{!empty && (
							<Badge variant="secondary" className="text-[10px] h-4 px-1.5">
								{steps.length}
							</Badge>
						)}
					</CardTitle>
					<Button onClick={openAddModal} size="sm" variant="outline" className="h-7 text-xs gap-1">
						<Plus className="h-3 w-3" />
						Tambah
					</Button>
				</CardHeader>
				<CardContent className="px-4 pb-4 pt-0">
					{empty ? (
						/* Empty State */
						<div className="flex flex-col items-center gap-3 py-10 text-center rounded-lg border border-dashed border-muted-foreground/30">
							<ListOrdered className="h-10 w-10 text-muted-foreground/30" />
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Belum ada langkah-langkah
								</p>
								<p className="text-[11px] text-muted-foreground/60 mt-0.5">
									Tambahkan langkah pertama!
								</p>
							</div>
							<Button onClick={openAddModal} size="sm" className="h-8 text-xs gap-1.5">
								<Plus className="h-3.5 w-3.5" />
								Tambah Langkah
							</Button>
						</div>
					) : (
						/* Steps List */
						<div className="space-y-1.5">
							{steps.map((step, index) => (
								<div
									key={index}
									className="group flex items-start gap-2 rounded-lg border border-border/70 bg-card p-2.5 transition hover:border-primary/30"
								>
									{/* Step number */}
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
										{index + 1}
									</div>

									{/* Content */}
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5">
											{step.icon && <StepIconDisplay iconName={step.icon} />}
											<h4 className="truncate text-xs font-semibold">{step.title}</h4>
										</div>
										<p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/70 leading-relaxed">
											{step.description}
										</p>
										{/* Metadata badges */}
										{(step.temperature || step.timerSeconds) && (
											<div className="mt-1 flex flex-wrap gap-1">
												{step.temperature && (
													<Badge
														variant="secondary"
														className="text-[11px] h-4 px-1.5 gap-0.5"
													>
														<Gauge className="h-2.5 w-2.5" />
														{step.temperature}
													</Badge>
												)}
												{step.timerSeconds && (
													<Badge
														variant="secondary"
														className="text-[11px] h-4 px-1.5 gap-0.5"
													>
														<Clock className="h-2.5 w-2.5" />
														{step.timerSeconds}dtk
													</Badge>
												)}
											</div>
										)}
										{/* Linked ingredients */}
										{step.ingredientIds && step.ingredientIds.length > 0 && inventoryMap && (
											<div className="mt-1 flex flex-wrap gap-1">
												{step.ingredientIds.map((id) => {
													const item = inventoryMap.get(id);
													return item ? (
														<Badge
															key={id}
															variant="outline"
															className="text-[11px] h-4 px-1"
														>
															{item.ingredientName || "Bahan"}
														</Badge>
													) : null;
												})}
											</div>
										)}
									</div>

									{/* Actions */}
									<div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
										<Button
											onClick={() => moveUp(index)}
											disabled={index === 0}
											size="sm"
											variant="ghost"
											className="h-6 w-6 p-0"
											title="Naikkan"
										>
											<ArrowUp className="h-3 w-3" />
										</Button>
										<Button
											onClick={() => moveDown(index)}
											disabled={index === steps.length - 1}
											size="sm"
											variant="ghost"
											className="h-6 w-6 p-0"
											title="Turunkan"
										>
											<ArrowDown className="h-3 w-3" />
										</Button>
										<Button
											onClick={() => openEditModal(index)}
											size="sm"
											variant="ghost"
											className="h-6 w-6 p-0"
											title="Edit"
										>
											<Edit className="h-3 w-3" />
										</Button>
										<Button
											onClick={() => handleDelete(index)}
											size="sm"
											variant="ghost"
											className="h-6 w-6 p-0 text-destructive hover:text-destructive"
											title="Hapus"
										>
											<Trash2 className="h-3 w-3" />
										</Button>
									</div>
								</div>
							))}
							{/* Add step at bottom */}
							<button
								onClick={openAddModal}
								type="button"
								className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 py-2.5 text-[11px] text-muted-foreground/60 transition hover:border-primary/40 hover:text-primary/70"
							>
								<Plus className="h-3.5 w-3.5" />
								Tambah Langkah
							</button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Step Form Modal */}
			<StepFormModal
				open={modalOpen}
				onClose={closeModal}
				onSave={handleSave}
				initial={editingIndex != null ? steps[editingIndex] : null}
				inventoryMap={inventoryMap}
			/>
		</>
	);
}

// ─── Exports ─────────────────────────────────────────────

export { RecipeStepsEditor, StepFormModal };
export type { RecipeStep };
