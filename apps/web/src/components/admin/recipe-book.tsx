import { Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Coffee, Edit, Eye, Package, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BASE_RECIPE_CATEGORIES = ["Base Susu", "Base Sauce", "Base Sirup", "Base Teh", "Kopi", "Dessert", "Lainnya"] as const;

type ProductRecipeDraft = {
	productId: string;
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
};

type BaseRecipeDraft = {
	name: string;
	description: string;
	category: string;
	targetUnit: string;
	targetQuantity: string;
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
};

function sortByLabel<T extends { name?: string; ingredientName?: string }>(items: T[]) {
	return [...items].sort((a, b) => (a.name ?? a.ingredientName ?? "").localeCompare(b.name ?? b.ingredientName ?? "", "id"));
}

function formatRupiah(value: number) {
	return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function Shell({ children, mode }: { children: React.ReactNode; mode: "manage" | "view" }) {
	const isManage = mode === "manage";
	return (
		<div className="min-h-app bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.18),_transparent_28%),linear-gradient(180deg,_rgba(255,251,235,0.92),_rgba(255,255,255,1))] text-foreground print:bg-white">
			<div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-8 print:max-w-none print:px-0 print:py-0">
				<div className="overflow-hidden rounded-[28px] border border-amber-200/70 bg-white shadow-[0_24px_80px_rgba(120,53,15,0.14)] print:rounded-none print:border-0 print:shadow-none">
					<div className="bg-[linear-gradient(135deg,_rgba(120,53,15,0.98),_rgba(146,64,14,0.92)_55%,_rgba(251,191,36,0.85))] px-5 py-6 text-white md:px-8 md:py-8 print:bg-white print:px-0 print:py-4 print:text-black">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
							<div className="max-w-3xl">
								<p className="font-semibold text-[11px] uppercase tracking-[0.28em] text-amber-100 print:text-amber-900">Recipe Book</p>
								<h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{isManage ? "Studio Resep" : "Buku Resep Operasional"}</h1>
								<p className="mt-3 text-sm leading-6 text-amber-50/90 print:text-slate-700">{isManage ? "Kelola resep terpisah dari produk, lengkap untuk CRUD dan koneksi ke inventory serta HPP." : "Tampilan baca resep untuk barista dan kitchen, disusun step by step agar mudah dipahami saat operasional."}</p>
							</div>
							<div className="flex flex-wrap gap-2 print:hidden">
								{isManage ? (
									<>
										<Link className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20" to="/recipe/view"><Eye className="h-4 w-4" /> Mode Baca</Link>
										<Link className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20" to="/admin/products"><Package className="h-4 w-4" /> Produk</Link>
									</>
								) : (
									<>
										<button className="inline-flex items-center gap-2 rounded-full border border-amber-800/15 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm" onClick={() => window.print()} type="button"><Printer className="h-4 w-4" /> Cetak Buku</button>
										<Link className="inline-flex items-center gap-2 rounded-full border border-amber-800/15 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm" to="/recipe"><BookOpen className="h-4 w-4" /> Kelola Resep</Link>
									</>
								)}
							</div>
						</div>
					</div>
					<div className="p-4 md:p-6 print:p-0">{children}</div>
				</div>
			</div>
		</div>
	);
}

function Stat({ title, value, desc }: { title: string; value: string | number; desc: string }) {
	return (
		<div className="rounded-[24px] border border-amber-100 bg-white p-4 shadow-sm print:rounded-xl print:border-slate-200 print:shadow-none">
			<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
			<p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{desc}</p>
		</div>
	);
}

function SectionTitle({ title, desc, actions }: { title: string; desc: string; actions?: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div>
				<h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{desc}</p>
			</div>
			{actions}
		</div>
	);
}

function FieldList({
	ingredients,
	inventory,
	onChange,
	onRemove,
	emptyText,
}: {
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
	inventory: Doc<"inventory">[];
	onChange: (index: number, amount: number) => void;
	onRemove: (index: number) => void;
	emptyText: string;
}) {
	return (
		<div className="space-y-3">
			{ingredients.map((ingredient, index) => {
				const item = inventory.find((entry) => entry._id === ingredient.inventoryId);
				return (
					<div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_80px]" key={`${ingredient.inventoryId}-${index}`}>
						<div>
							<p className="font-bold text-slate-950">{item?.ingredientName || "Bahan"}</p>
							<p className="text-xs text-muted-foreground">{item?.unit || "unit"}</p>
						</div>
						<Input min="0" onChange={(event) => onChange(index, Number(event.target.value))} type="number" value={ingredient.amount} />
						<Button onClick={() => onRemove(index)} type="button" variant="outline"><Trash2 className="h-4 w-4" /></Button>
					</div>
				);
			})}
			{ingredients.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}
		</div>
	);
}
function BaseRecipeEditor({ baseRecipes, inventory, products, productRecipes }: { baseRecipes: Doc<"baseRecipes">[]; inventory: Doc<"inventory">[]; products: (Doc<"products"> & { storageId?: string })[]; productRecipes: Doc<"recipes">[]; }) {
	const createBaseRecipe = useMutation(api.inventory.createBaseRecipe);
	const updateBaseRecipe = useMutation(api.inventory.updateBaseRecipe);
	const deleteBaseRecipe = useMutation(api.inventory.deleteBaseRecipe);
	const [search, setSearch] = useState("");
	const [editingId, setEditingId] = useState<Id<"baseRecipes"> | null>(null);
	const [deleteId, setDeleteId] = useState<Id<"baseRecipes"> | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [draft, setDraft] = useState<BaseRecipeDraft>({ name: "", description: "", category: "Lainnya", targetUnit: "ml", targetQuantity: "1000", ingredients: [] });
	const productNameOptions = useMemo(() => [...new Set(products.map((product) => product.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [products]);
	const filteredRecipes = useMemo(() => sortByLabel(baseRecipes).filter((recipe) => {
		const keyword = search.trim().toLowerCase();
		if (!keyword) return true;
		return recipe.name.toLowerCase().includes(keyword) || (recipe.description ?? "").toLowerCase().includes(keyword) || (recipe.category ?? "").toLowerCase().includes(keyword);
	}), [baseRecipes, search]);
	const reset = () => {
		setDraft({ name: "", description: "", category: "Lainnya", targetUnit: "ml", targetQuantity: "1000", ingredients: [] });
		setEditingId(null);
		setIsModalOpen(false);
	};
	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!draft.name.trim()) return toast.error("Nama resep wajib diisi");
		if (draft.ingredients.length === 0) return toast.error("Tambahkan minimal satu bahan");
		if (draft.ingredients.some((item) => item.amount <= 0)) return toast.error("Jumlah bahan harus lebih dari 0");
		const payload = { name: draft.name.trim(), description: draft.description.trim() || undefined, category: draft.category, targetUnit: draft.targetUnit.trim(), targetQuantity: Number(draft.targetQuantity), ingredients: draft.ingredients };
		if (editingId) {
			await updateBaseRecipe({ id: editingId, ...payload });
			toast.success("Resep base diperbarui");
		} else {
			await createBaseRecipe(payload);
			toast.success("Resep base dibuat");
		}
		reset();
	};
	return (
		<>
			<div className="space-y-5 rounded-[28px] border border-amber-100 bg-[linear-gradient(180deg,_rgba(255,251,235,0.72),_rgba(255,255,255,1))] p-5 shadow-sm print:rounded-xl print:border-slate-200 print:bg-white print:shadow-none">
				<SectionTitle title="Base recipe" desc="Kelola formula dasar untuk prep harian seperti sauce, syrup, premix, atau base minuman." actions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative min-w-[240px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-2xl border-amber-100 bg-white pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Cari base recipe..." value={search} /></div><Button className="h-11 rounded-2xl px-5" onClick={() => setIsModalOpen(true)} type="button"><Plus className="mr-2 h-4 w-4" /> Tambah</Button></div>} />
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<Stat title="Total Base" value={baseRecipes.length} desc="Formula dasar tersedia" />
					<Stat title="Tampil" value={filteredRecipes.length} desc="Hasil filter saat ini" />
					<Stat title="Kategori" value={new Set(filteredRecipes.map((recipe) => recipe.category?.trim() || "Lainnya")).size} desc="Kelompok formula aktif" />
					<Stat title="Dipakai Produk" value={new Set(productRecipes.map((recipe) => recipe.productId)).size} desc="Produk yang terhubung recipe" />
				</div>
				<div className="overflow-x-auto rounded-[24px] border border-amber-100 bg-white print:rounded-xl print:border-slate-200">
					<table className="w-full min-w-[760px] text-left text-sm">
						<thead className="bg-amber-50/70 text-[11px] uppercase tracking-[0.2em] text-muted-foreground"><tr><th className="px-5 py-3">Nama</th><th className="px-5 py-3">Kategori</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Bahan</th><th className="px-5 py-3 text-right">Aksi</th></tr></thead>
						<tbody>
							{filteredRecipes.map((recipe) => (<tr className="border-t border-amber-50" key={recipe._id}><td className="px-5 py-4"><p className="font-bold text-slate-950">{recipe.name}</p><p className="mt-1 text-xs text-muted-foreground">{recipe.description || "Belum ada catatan."}</p></td><td className="px-5 py-4"><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{recipe.category?.trim() || "Lainnya"}</span></td><td className="px-5 py-4 font-semibold text-slate-950">{recipe.targetQuantity} {recipe.targetUnit}</td><td className="px-5 py-4 text-muted-foreground">{recipe.ingredients.length} bahan</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button className="rounded-xl" onClick={() => { setEditingId(recipe._id); setDraft({ name: recipe.name, description: recipe.description ?? "", category: recipe.category ?? "Lainnya", targetUnit: recipe.targetUnit, targetQuantity: String(recipe.targetQuantity), ingredients: recipe.ingredients }); setIsModalOpen(true); }} size="sm" type="button" variant="outline"><Edit className="mr-2 h-4 w-4" /> Edit</Button><Button className="rounded-xl" onClick={() => setDeleteId(recipe._id)} size="sm" type="button" variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Hapus</Button></div></td></tr>))}
						</tbody>
					</table>
				</div>
			</div>
			{isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl" onSubmit={save}><div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-2xl font-black tracking-tight text-slate-950">{editingId ? "Edit base recipe" : "Buat base recipe"}</h3><p className="mt-2 text-sm text-muted-foreground">Susun formula dasar dengan catatan yang jelas untuk prep harian.</p></div><button className="rounded-full border border-slate-200 p-2" onClick={reset} type="button"><X className="h-4 w-4" /></button></div><div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><div className="space-y-4"><Input list="base-recipe-names" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nama recipe" required value={draft.name} /><datalist id="base-recipe-names">{productNameOptions.map((name) => <option key={name} value={name} />)}</datalist><Textarea onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Catatan penggunaan" value={draft.description} /><div className="grid gap-4 md:grid-cols-3"><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} value={draft.category}>{BASE_RECIPE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><Input onChange={(event) => setDraft((current) => ({ ...current, targetUnit: event.target.value }))} placeholder="Unit hasil" required value={draft.targetUnit} /><Input min="1" onChange={(event) => setDraft((current) => ({ ...current, targetQuantity: event.target.value }))} required type="number" value={draft.targetQuantity} /></div></div><div className="rounded-[24px] border border-amber-100 bg-amber-50/40 p-5"><p className="mb-4 font-bold text-slate-950">Komposisi bahan</p><div className="mb-4 grid max-h-[220px] gap-2 overflow-y-auto pr-1">{sortByLabel(inventory.filter((item) => !item.baseRecipeId)).map((item) => <button className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left" key={item._id} onClick={() => { if (draft.ingredients.some((entry) => entry.inventoryId === item._id)) return toast.error("Bahan ini sudah ada"); setDraft((current) => ({ ...current, ingredients: [...current.ingredients, { inventoryId: item._id, amount: 0 }] })); }} type="button"><span>{item.ingredientName}</span><Plus className="h-4 w-4 text-slate-500" /></button>)}</div><FieldList emptyText="Belum ada bahan pada formula ini." ingredients={draft.ingredients} inventory={inventory} onChange={(index, amount) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount } : entry) }))} onRemove={(index) => setDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, entryIndex) => entryIndex !== index) }))} /></div></div><div className="mt-5 flex justify-end gap-3"><Button onClick={reset} type="button" variant="outline">Batal</Button><Button type="submit">{editingId ? "Simpan perubahan" : "Simpan recipe"}</Button></div></form></div>}
			<ConfirmationModal confirmText="Hapus" isOpen={!!deleteId} message="Hapus base recipe ini?" onClose={() => setDeleteId(null)} onConfirm={async () => { if (!deleteId) return; await deleteBaseRecipe({ id: deleteId }); toast.success("Base recipe dihapus"); setDeleteId(null); }} title="Konfirmasi Hapus" variant="danger" />
		</>
	);
}

function ProductRecipeEditor({ products, inventory, productRecipes, categories, hppProductMap }: { products: (Doc<"products"> & { storageId?: string })[]; inventory: Doc<"inventory">[]; productRecipes: Doc<"recipes">[]; categories: Doc<"categories">[]; hppProductMap: Record<string, { hppPerServing: number; marginPercent: number }> | undefined; }) {
	const saveRecipe = useMutation(api.inventory.saveRecipe);
	const deleteRecipe = useMutation(api.inventory.deleteRecipe);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<"all" | "mapped" | "missing">("all");
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<Id<"recipes"> | null>(null);
	const [draft, setDraft] = useState<ProductRecipeDraft>({ productId: "", ingredients: [] });
	const recipeByProductId = useMemo(() => new Map(productRecipes.filter((recipe) => !recipe.variantName).map((recipe) => [String(recipe.productId), recipe])), [productRecipes]);
	const rows = useMemo(() => sortByLabel(products).map((product) => {
		const recipe = recipeByProductId.get(String(product._id)) ?? null;
		const categoryName = categories.find((category) => category._id === product.categoryId)?.name ?? "Tanpa kategori";
		return { product, recipe, categoryName, hpp: hppProductMap?.[String(product._id)] ?? null };
	}).filter((row) => {
		const keyword = search.trim().toLowerCase();
		if (filter === "mapped" && !row.recipe) return false;
		if (filter === "missing" && row.recipe) return false;
		if (!keyword) return true;
		return row.product.name.toLowerCase().includes(keyword) || row.categoryName.toLowerCase().includes(keyword);
	}), [categories, filter, hppProductMap, products, recipeByProductId, search]);
	const reset = () => { setDraft({ productId: "", ingredients: [] }); setIsModalOpen(false); };
	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!draft.productId) return toast.error("Pilih produk terlebih dahulu");
		if (draft.ingredients.length === 0) return toast.error("Tambahkan minimal satu bahan");
		if (draft.ingredients.some((entry) => entry.amount <= 0)) return toast.error("Jumlah bahan harus lebih dari 0");
		await saveRecipe({ productId: draft.productId as Id<"products">, ingredients: draft.ingredients });
		toast.success("Recipe produk disimpan");
		reset();
	};
	return (
		<>
			<div className="space-y-5 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,1),_rgba(255,255,255,1))] p-5 shadow-sm print:rounded-xl print:border-slate-200 print:bg-white print:shadow-none">
				<SectionTitle title="Recipe produk" desc="Pisahkan formula menu dari halaman produk agar tim lebih fokus saat mengelola komposisi, stock, dan keterbacaan operasional." actions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative min-w-[240px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-2xl border-slate-200 bg-white pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk..." value={search} /></div><select className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm" onChange={(event) => setFilter(event.target.value as typeof filter)} value={filter}><option value="all">Semua status</option><option value="mapped">Sudah ada recipe</option><option value="missing">Belum ada recipe</option></select><Button className="h-11 rounded-2xl px-5" onClick={() => setIsModalOpen(true)} type="button"><Plus className="mr-2 h-4 w-4" /> Tambah</Button></div>} />
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Stat title="Produk" value={products.length} desc="Menu yang tersedia" /><Stat title="Mapped" value={rows.filter((row) => row.recipe).length} desc="Sudah punya recipe" /><Stat title="Missing" value={rows.filter((row) => !row.recipe).length} desc="Perlu dilengkapi" /><Stat title="Komponen" value={rows.reduce((total, row) => total + (row.recipe?.ingredients.length ?? 0), 0)} desc="Bahan terhubung ke stock" /></div>
				<div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white print:rounded-xl print:border-slate-200"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.2em] text-muted-foreground"><tr><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Kategori</th><th className="px-5 py-3">Recipe</th><th className="px-5 py-3">Komponen</th><th className="px-5 py-3">HPP / Margin</th><th className="px-5 py-3 text-right">Aksi</th></tr></thead><tbody>{rows.map((row) => (<tr className="border-t border-slate-100" key={row.product._id}><td className="px-5 py-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">{row.product.image ? <img alt={row.product.name} className="h-full w-full object-cover" src={row.product.image} /> : <Coffee className="h-5 w-5 text-slate-400" />}</div><div><p className="font-bold text-slate-950">{row.product.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatRupiah(row.product.price)} • {row.product.isAvailable ? "Aktif" : "Nonaktif"}</p></div></div></td><td className="px-5 py-4 text-muted-foreground">{row.categoryName}</td><td className="px-5 py-4"><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", row.recipe ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900")}>{row.recipe ? "Siap dibaca" : "Belum dibuat"}</span></td><td className="px-5 py-4 text-muted-foreground">{row.recipe?.ingredients.length ?? 0} komponen</td><td className="px-5 py-4 text-muted-foreground">{row.hpp ? `${formatRupiah(Math.round(row.hpp.hppPerServing))} • Margin ${row.hpp.marginPercent.toFixed(0)}%` : "Belum sinkron"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button className="rounded-xl" onClick={() => { setDraft({ productId: String(row.product._id), ingredients: row.recipe?.ingredients ?? [] }); setIsModalOpen(true); }} size="sm" type="button" variant="outline"><Edit className="mr-2 h-4 w-4" /> {row.recipe ? "Edit" : "Buat"}</Button>{row.recipe && <Button className="rounded-xl" onClick={() => setDeleteId(row.recipe!._id)} size="sm" type="button" variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Hapus</Button>}</div></td></tr>))}</tbody></table></div>
			</div>
			{isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl" onSubmit={save}><div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-2xl font-black tracking-tight text-slate-950">Buat atau edit recipe produk</h3><p className="mt-2 text-sm text-muted-foreground">Susun komponen berdasarkan urutan racik agar mudah dibaca tim.</p></div><button className="rounded-full border border-slate-200 p-2" onClick={reset} type="button"><X className="h-4 w-4" /></button></div><div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="space-y-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-5"><select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setDraft((current) => ({ ...current, productId: event.target.value }))} required value={draft.productId}><option value="">Pilih produk</option>{sortByLabel(products).map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select><div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">{sortByLabel(inventory).map((item) => <button className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left" key={item._id} onClick={() => { if (draft.ingredients.some((entry) => entry.inventoryId === item._id)) return toast.error("Bahan ini sudah ada"); setDraft((current) => ({ ...current, ingredients: [...current.ingredients, { inventoryId: item._id, amount: 0 }] })); }} type="button"><span>{item.ingredientName}</span><Plus className="h-4 w-4 text-slate-500" /></button>)}</div></div><div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5"><p className="mb-4 font-bold text-slate-950">Urutan racik</p><FieldList emptyText="Belum ada komponen pada recipe ini." ingredients={draft.ingredients} inventory={inventory} onChange={(index, amount) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount } : entry) }))} onRemove={(index) => setDraft((current) => ({ ...current, ingredients: current.ingredients.filter((_, entryIndex) => entryIndex !== index) }))} /></div></div><div className="mt-5 flex justify-end gap-3"><Button onClick={reset} type="button" variant="outline">Batal</Button><Button type="submit">Simpan recipe</Button></div></form></div>}
			<ConfirmationModal confirmText="Hapus" isOpen={!!deleteId} message="Hapus recipe produk ini?" onClose={() => setDeleteId(null)} onConfirm={async () => { if (!deleteId) return; await deleteRecipe({ id: deleteId }); toast.success("Recipe produk dihapus"); setDeleteId(null); }} title="Konfirmasi Hapus" variant="danger" />
		</>
	);
}
function buildBaseSteps(recipe: Doc<"baseRecipes">, inventoryMap: Map<string, Doc<"inventory">>) {
	return recipe.ingredients.map((ingredient, index) => {
		const item = inventoryMap.get(String(ingredient.inventoryId));
		return { id: `${recipe._id}-${index}`, instruction: `Masukkan ${ingredient.amount} ${item?.unit || "unit"} ${item?.ingredientName || "bahan"} ke batch ${recipe.name}.`, note: index === recipe.ingredients.length - 1 ? `Aduk rata lalu simpan hasil akhir sebanyak ${recipe.targetQuantity} ${recipe.targetUnit}.` : "Lanjutkan sesuai urutan agar rasa dan tekstur konsisten." };
	});
}

function buildProductSteps(product: Doc<"products">, recipe: Doc<"recipes">, inventoryMap: Map<string, Doc<"inventory">>) {
	return recipe.ingredients.map((ingredient, index) => {
		const item = inventoryMap.get(String(ingredient.inventoryId));
		return { id: `${recipe._id}-${index}`, instruction: `Siapkan ${ingredient.amount} ${item?.unit || "unit"} ${item?.ingredientName || "bahan"} untuk ${product.name}.`, note: index === recipe.ingredients.length - 1 ? "Tutup dengan final check rasa, suhu, dan presentasi sebelum disajikan." : "Pastikan takaran presisi sebelum lanjut ke langkah berikutnya." };
	});
}

export function RecipeStudioPage() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const inventory = useQuery(api.inventory.getInventory);
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const productRecipes = useQuery(api.inventory.getRecipes);
	const categories = useQuery(api.products.getCategories);
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const isLoading = !products || !inventory || !baseRecipes || !productRecipes || !categories;
	if (isLoading) {
		return <Shell mode="manage"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-36 rounded-[24px]" key={index} />)}</div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Skeleton className="h-[520px] rounded-[28px]" /><Skeleton className="h-[520px] rounded-[28px]" /></div></Shell>;
	}
	return <Shell mode="manage"><div className="space-y-6"><BaseRecipeEditor baseRecipes={baseRecipes} inventory={inventory} productRecipes={productRecipes} products={products} /><ProductRecipeEditor categories={categories} hppProductMap={hppProductMap} inventory={inventory} productRecipes={productRecipes} products={products} /></div></Shell>;
}

export function RecipeBookViewPage() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const inventory = useQuery(api.inventory.getInventory);
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const productRecipes = useQuery(api.inventory.getRecipes);
	const categories = useQuery(api.products.getCategories);
	const [search, setSearch] = useState("");
	const isLoading = !products || !inventory || !baseRecipes || !productRecipes || !categories;
	const inventoryMap = useMemo(() => new Map((inventory ?? []).map((item) => [String(item._id), item])), [inventory]);
	const baseRows = useMemo(() => sortByLabel(baseRecipes ?? []).filter((recipe) => {
		const keyword = search.trim().toLowerCase();
		if (!keyword) return true;
		return recipe.name.toLowerCase().includes(keyword) || (recipe.description ?? "").toLowerCase().includes(keyword) || (recipe.category ?? "").toLowerCase().includes(keyword);
	}), [baseRecipes, search]);
	const productRows = useMemo(() => {
		if (!products || !productRecipes || !categories) return [];
		const productMap = new Map(products.map((product) => [String(product._id), product]));
		return productRecipes.filter((recipe) => !recipe.variantName).map((recipe) => {
			const product = productMap.get(String(recipe.productId));
			if (!product) return null;
			const categoryName = categories.find((category) => category._id === product.categoryId)?.name ?? "Tanpa kategori";
			return { product, recipe, categoryName, steps: buildProductSteps(product, recipe, inventoryMap) };
		}).filter((row): row is NonNullable<typeof row> => row !== null).filter((row) => {
			const keyword = search.trim().toLowerCase();
			if (!keyword) return true;
			return row.product.name.toLowerCase().includes(keyword) || row.categoryName.toLowerCase().includes(keyword);
		}).sort((left, right) => left.product.name.localeCompare(right.product.name, "id"));
	}, [categories, inventoryMap, productRecipes, products, search]);
	if (isLoading) {
		return <Shell mode="view"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-36 rounded-[24px]" key={index} />)}</div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Skeleton className="h-[520px] rounded-[28px]" /><Skeleton className="h-[520px] rounded-[28px]" /></div></Shell>;
	}
	return (
		<Shell mode="view">
			<div className="space-y-6 print:space-y-4">
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4"><Stat title="Base Recipe" value={baseRows.length} desc="Recipe prep harian" /><Stat title="Recipe Menu" value={productRows.length} desc="Recipe menu siap baca" /><Stat title="Komponen" value={productRows.reduce((total, row) => total + row.recipe.ingredients.length, 0)} desc="Bahan terpetakan" /><Stat title="Inventory" value={inventory?.length ?? 0} desc="Bahan aktif" /></div>
				<div className="rounded-[24px] border border-amber-100 bg-white p-4 shadow-sm print:hidden"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-black tracking-tight text-slate-950">Cari recipe operasional</h2><p className="text-sm text-muted-foreground">Gunakan nama produk, kategori, atau nama base recipe untuk menemukan formula yang dibutuhkan.</p></div><div className="relative min-w-[280px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-2xl border-amber-100 bg-amber-50/40 pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Cari recipe..." value={search} /></div></div></div>
				<div className="space-y-4 rounded-[28px] border border-amber-100 bg-white p-5 shadow-sm print:rounded-xl print:border-slate-200 print:p-4 print:shadow-none"><SectionTitle title="Panduan prep dan produksi" desc="Gunakan bagian ini untuk membaca formula batch agar hasil antar shift tetap konsisten." /><div className="grid gap-4 xl:grid-cols-2 print:grid-cols-2">{baseRows.map((recipe) => { const steps = buildBaseSteps(recipe, inventoryMap); return <article className="overflow-hidden rounded-[24px] border border-amber-100 bg-[linear-gradient(180deg,_rgba(255,251,235,0.74),_rgba(255,255,255,1))] print:break-inside-avoid print:rounded-xl print:border-slate-200" key={recipe._id}><div className="border-b border-amber-100 px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[11px] uppercase tracking-[0.22em] text-amber-700">{recipe.category?.trim() || "Lainnya"}</p><h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{recipe.name}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{recipe.description || "Tanpa catatan tambahan."}</p></div><div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hasil Batch</p><p className="mt-1 font-black text-slate-950">{recipe.targetQuantity} {recipe.targetUnit}</p></div></div></div><div className="space-y-4 px-5 py-5"><div className="rounded-2xl border border-amber-100 bg-white p-4"><p className="font-semibold text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Checklist bahan</p><div className="mt-3 space-y-2 text-sm text-slate-800">{recipe.ingredients.map((ingredient) => { const item = inventoryMap.get(String(ingredient.inventoryId)); return <p key={ingredient.inventoryId}>• {item?.ingredientName || "Bahan"}: {ingredient.amount} {item?.unit || "unit"}</p>; })}</div></div><div className="space-y-3">{steps.map((step, index) => <div className="grid gap-3 rounded-2xl border border-amber-100 bg-white p-4 md:grid-cols-[56px_1fr]" key={step.id}><div className="flex h-14 items-center justify-center rounded-2xl bg-amber-500 font-black text-lg text-white">{index + 1}</div><div><p className="font-bold text-slate-950">{step.instruction}</p><p className="mt-1 text-sm text-muted-foreground">{step.note}</p></div></div>)}</div></div></article>; })}</div></div>
				<div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm print:rounded-xl print:border-slate-200 print:p-4 print:shadow-none"><SectionTitle title="Panduan racik untuk barista dan kitchen" desc="Buka recipe per produk saat order masuk. Setiap kartu disusun dengan checklist komponen dan urutan langkah yang mudah dibaca." /><div className="grid gap-4 xl:grid-cols-2 print:grid-cols-2">{productRows.map((row) => <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,1),_rgba(255,255,255,1))] print:break-inside-avoid print:rounded-xl" key={row.product._id}><div className="border-b border-slate-100 px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[11px] uppercase tracking-[0.22em] text-sky-700">{row.categoryName}</p><h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{row.product.name}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{row.product.description || "Ikuti formula di bawah untuk menjaga rasa dan konsistensi sajian."}</p></div><div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Komponen</p><p className="mt-1 font-black text-slate-950">{row.recipe.ingredients.length} item</p></div></div></div><div className="space-y-4 px-5 py-5"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-semibold text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Checklist sebelum mulai</p><div className="mt-3 space-y-2 text-sm text-slate-800">{row.recipe.ingredients.map((ingredient) => { const item = inventoryMap.get(String(ingredient.inventoryId)); return <p key={ingredient.inventoryId}>• {item?.ingredientName || "Bahan"}: {ingredient.amount} {item?.unit || "unit"}</p>; })}</div></div><div className="space-y-3">{row.steps.map((step, index) => <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[56px_1fr]" key={step.id}><div className="flex h-14 items-center justify-center rounded-2xl bg-slate-900 font-black text-lg text-white">{index + 1}</div><div><p className="font-bold text-slate-950">{step.instruction}</p><p className="mt-1 text-sm text-muted-foreground">{step.note}</p></div></div>)}</div><div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">Final check: cek takaran, suhu, kebersihan gelas atau piring, dan presentasi sebelum menu keluar.</div></div></article>)}</div></div>
			</div>
		</Shell>
	);
}
