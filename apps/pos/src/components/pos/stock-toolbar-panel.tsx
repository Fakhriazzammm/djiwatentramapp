import { useMemo, useState } from "react";
import { Check, Loader2, Package, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHybridBulkUpdateProducts, useHybridUpdateProduct, useHybridAdjustReadyMenuStock } from "@/hooks/use-hybrid-write-actions";

type Product = {
  _id: string;
  name: string;
  quantity?: number | null;
  isAvailable?: boolean;
  menuNumber?: number | null;
  categoryId?: string | null;
};

type Category = { _id: string; name: string; parentId?: string | null; track?: string | null };

type StockToolbarPanelProps = {
  products: Product[];
  categories: Category[];
  onClose: () => void;
  onRefresh?: () => void;
};

type StockFilter = "all" | "low" | "out";

function statusFor(product: Product) {
  const quantity = Number(product.quantity ?? 0);
  if (product.isAvailable === false) return { label: "SOLD", className: "text-rose-600 bg-rose-50" };
  if (quantity <= 0) return { label: "Habis", className: "text-rose-600 bg-rose-50" };
  if (quantity <= 10) return { label: "Menipis", className: "text-amber-700 bg-amber-50" };
  return { label: "Aman", className: "text-emerald-700 bg-emerald-50" };
}

export function StockToolbarPanel({ products, categories, onClose, onRefresh }: StockToolbarPanelProps) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [subcategoryId, setSubcategoryId] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const updateProduct = useHybridUpdateProduct();
  const adjustReadyMenuStock = useHybridAdjustReadyMenuStock();
  const bulkUpdate = useHybridBulkUpdateProducts();

  const parents = useMemo(() => categories.filter((category) => !category.parentId && category.track !== "hidden"), [categories]);
  const subcategories = useMemo(() => categoryId === "all" ? [] : categories.filter((category) => category.parentId === categoryId), [categories, categoryId]);
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const category = categories.find((item) => item._id === product.categoryId);
      const parent = category?.parentId ? categories.find((item) => item._id === category.parentId) : category;
      const matchesQuery = !normalized || [product.name, product.menuNumber, category?.name, parent?.name].some((value) => String(value ?? "").toLowerCase().includes(normalized));
      const matchesCategory = categoryId === "all" || parent?._id === categoryId;
      const matchesSubcategory = subcategoryId === "all" || category?._id === subcategoryId;
      const quantity = Number(product.quantity ?? 0);
      const matchesStock = stockFilter === "all" || (stockFilter === "low" && product.isAvailable !== false && quantity > 0 && quantity <= 10) || (stockFilter === "out" && (product.isAvailable === false || quantity <= 0));
      return matchesQuery && matchesCategory && matchesSubcategory && matchesStock;
    });
  }, [categories, categoryId, products, query, stockFilter, subcategoryId]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { label: string; products: Product[] }>();
    for (const product of visibleProducts) {
      const category = categories.find((item) => item._id === product.categoryId);
      const parent = category?.parentId ? categories.find((item) => item._id === category.parentId) : category;
      const label = parent && category && parent._id !== category._id ? `${parent.name} / ${category.name}` : category?.name || "Tanpa kategori";
      const group = groups.get(label) ?? { label, products: [] };
      group.products.push(product);
      groups.set(label, group);
    }
    return [...groups.values()];
  }, [categories, visibleProducts]);

  const setSaving = (id: string, saving: boolean) => setSavingIds((current) => {
    const next = new Set(current);
    saving ? next.add(id) : next.delete(id);
    return next;
  });

  const toggleAvailability = async (product: Product) => {
    const next = !Boolean(product.isAvailable);
    if (!next && !window.confirm(`Jadikan ${product.name} tidak tersedia?`)) return;
    setSaving(String(product._id), true);
    try {
      await updateProduct({ id: product._id, isAvailable: next });
      toast.success(`${product.name} ${next ? "tersedia" : "tidak tersedia"}`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error?.message || "Gagal mengubah ketersediaan produk");
    } finally {
      setSaving(String(product._id), false);
    }
  };

  const adjustQuantity = async (product: Product, delta: number) => {
    const next = Math.max(0, Number(product.quantity ?? 0) + delta);
    if (next === Number(product.quantity ?? 0)) return;
    setSaving(String(product._id), true);
    try {
      const result = await adjustReadyMenuStock({ productId: product._id, delta, currentQuantity: Number(product.quantity ?? 0) });
      toast.success(`Stok ${product.name}: ${result.quantity} porsi`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error?.message || "Gagal mengubah stok");
      onRefresh?.();
    } finally {
      setSaving(String(product._id), false);
    }
  };

  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectVisible = () => setSelectedIds((current) => {
    const next = new Set(current);
    visibleProducts.forEach((product) => next.add(String(product._id)));
    return next;
  });

  const clearSelection = () => setSelectedIds(new Set());

  const bulkAvailability = async (available: boolean) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!available && !window.confirm(`Jadikan ${ids.length} produk tidak tersedia?`)) return;
    try {
      await bulkUpdate({ ids, updates: { isAvailable: available } });
      toast.success(`${ids.length} produk diperbarui`);
      clearSelection();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error?.message || "Gagal memperbarui produk");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
        <div><div className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" /><h2 className="text-base font-black">Pengaturan Stok</h2></div><p className="mt-1 text-xs text-muted-foreground">Atur menu yang siap dijual dengan cepat.</p></div>
        <button type="button" aria-label="Tutup pengaturan stok" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk..." className="h-11 w-full rounded-2xl border border-border bg-card pl-9 pr-9 text-sm outline-none ring-primary/20 focus:ring-2" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan pencarian" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"><X className="h-3.5 w-3.5" /></button> : null}</div>
        <div data-stock-tutorial-target="stock-category" className="mt-3"><p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Kategori</p><div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"><button type="button" onClick={() => { setCategoryId("all"); setSubcategoryId("all"); }} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-bold", categoryId === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Semua</button>{parents.map((category) => <button type="button" key={category._id} onClick={() => { setCategoryId(category._id); setSubcategoryId("all"); }} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-bold", categoryId === category._id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{category.name}</button>)}</div></div>
        {subcategories.length > 0 ? <div className="mt-2"><p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Subkategori</p><div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"><button type="button" onClick={() => setSubcategoryId("all")} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-bold", subcategoryId === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>Semua</button>{subcategories.map((category) => <button type="button" key={category._id} onClick={() => setSubcategoryId(category._id)} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-bold", subcategoryId === category._id ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{category.name}</button>)}</div></div> : null}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"><span className="mr-1 self-center text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</span>{(["all", "low", "out"] as StockFilter[]).map((filter) => <button type="button" key={filter} onClick={() => setStockFilter(filter)} className={cn("shrink-0 rounded-full px-3 py-2 text-[11px] font-bold", stockFilter === filter ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{filter === "all" ? "Semua" : filter === "low" ? "Menipis" : "Habis"}</button>)}</div>
        <div className="mt-4 flex items-center justify-between gap-2 px-1"><p className="text-xs font-bold text-muted-foreground">{visibleProducts.length} produk</p><button type="button" onClick={selectedIds.size === visibleProducts.length && visibleProducts.length > 0 ? clearSelection : selectVisible} className="rounded-full px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/5">{selectedIds.size === visibleProducts.length && visibleProducts.length > 0 ? "Batalkan semua" : "Pilih semua"}</button></div>
        <div className="mt-2 space-y-3">{groupedProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center"><p className="text-sm font-bold">Tidak ada produk yang cocok</p><p className="mt-1 text-xs text-muted-foreground">Coba ubah pencarian atau filter.</p></div> : groupedProducts.map((group) => <section key={group.label}><h3 className="sticky top-0 z-10 rounded-xl bg-background/95 px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">{group.label}</h3><div className="overflow-hidden rounded-2xl border border-border bg-card">{group.products.map((product, index) => { const status = statusFor(product); const saving = savingIds.has(String(product._id)); return <div key={product._id} className={cn("flex min-h-[68px] items-center gap-2 border-b border-border/70 px-2.5 py-2 last:border-0", index % 2 ? "bg-muted/10" : "bg-card")}><input data-stock-tutorial-target="stock-checkbox" type="checkbox" checked={selectedIds.has(String(product._id))} onChange={() => toggleSelected(String(product._id))} aria-label={`Pilih ${product.name}`} className="h-5 w-5 shrink-0 accent-primary" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-foreground">{product.name}</p><div className="mt-1 flex items-center gap-1.5"><span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", status.className)}>{status.label}</span>{product.menuNumber != null ? <span className="truncate text-[10px] text-muted-foreground">#{product.menuNumber}</span> : null}</div></div><div className="flex shrink-0 items-center gap-1"><button type="button" disabled={saving || Number(product.quantity ?? 0) <= 0} onClick={() => void adjustQuantity(product, -1)} aria-label={`Kurangi stok ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground disabled:opacity-40">−</button><span className="w-10 text-center text-xs font-black tabular-nums">{Number(product.quantity ?? 0)}</span><button type="button" disabled={saving} onClick={() => void adjustQuantity(product, 1)} aria-label={`Tambah stok ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground disabled:opacity-40">+</button></div><button data-stock-tutorial-target="stock-toggle" type="button" disabled={saving} onClick={() => void toggleAvailability(product)} aria-label={`${product.isAvailable ? "Nonaktifkan" : "Aktifkan"} ${product.name}`} className={cn("relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors", product.isAvailable ? "bg-emerald-500" : "bg-muted-foreground/30")}><span className={cn("block h-5 w-5 rounded-full bg-white shadow-sm transition-transform", product.isAvailable ? "translate-x-5" : "translate-x-0")}>{saving ? <Loader2 className="h-5 w-5 animate-spin p-1 text-muted-foreground" /> : null}</span></button></div>; })}</div></section>)}</div>
      </div>
      {selectedIds.size > 0 ? <div className="absolute inset-x-0 bottom-0 border-t border-border bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black">{selectedIds.size} produk dipilih</p><button type="button" onClick={clearSelection} className="text-xs font-bold text-muted-foreground">Batal</button></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void bulkAvailability(false)} className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700">Tandai habis</button><button type="button" onClick={() => void bulkAvailability(true)} className="min-h-11 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground"><Check className="mr-1 inline h-3.5 w-3.5" />Tersedia</button></div></div> : null}
    </div>
  );
}
